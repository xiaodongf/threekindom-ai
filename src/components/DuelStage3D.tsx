import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getHeroDuelProfile } from '../game/heroDuelProfiles.js';
import type { General, Language, TerrainType } from '../game/types.js';
import { battleAudio } from '../utils/battleAudio.js';
import type { VisualThemeId } from '../utils/visualTheme.js';
import {
  FINALE_DURATION,
  INTRO_DURATION,
  buildExchangePlan,
  sampleExchangeFrame,
  sampleFinaleFrame,
  sampleIdleFrame,
  sampleIntroFrame,
} from './duel/duelChoreography.js';
import {
  applyRigPose3D,
  buildDuelArena3D,
  buildMountedGeneralRig3D,
} from './duel/duelModels3D.js';
import { createDustPuffTexture } from './duel/duelTextures3D.js';
import type {
  DuelCalloutBanner,
  DuelCutInState,
  DuelExchangeEvent,
  DuelStagePhase,
  ExchangePlan,
} from './duel/duelTypes.js';

interface DuelStage3DProps {
  attacker: General;
  defender: General;
  terrain: TerrainType;
  isNight?: boolean;
  theme: VisualThemeId;
  lang: Language;
  atkHp: number;
  defHp: number;
  speed: 1 | 2;
  activeExchange: DuelExchangeEvent | null;
  finaleWinner: 'attacker' | 'defender' | 'draw' | null;
  /** Optional demo scrub time (seconds) for deterministic visual inspection */
  demoTimeSec?: number;
  onIntroComplete?: () => void;
  onApplyHp?: (atkHp: number, defHp: number) => void;
  onExchangeComplete?: (event: DuelExchangeEvent) => void;
  onCutInChange?: (cutIn: DuelCutInState | null) => void;
  onCallout?: (callout: DuelCalloutBanner) => void;
}

interface SparkParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

interface DustParticle {
  sprite: THREE.Sprite;
  active: boolean;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

interface WeaponRibbon {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.MeshBasicMaterial;
  samples: Array<{ base: THREE.Vector3; tip: THREE.Vector3 }>;
  wasActive: boolean;
}

const RIBBON_SEGMENTS = 14;
const MAX_SPARKS = 140;
const MAX_DUST = 56;

function createWeaponRibbon(colorHex: string): WeaponRibbon {
  const vertexCount = RIBBON_SEGMENTS * 2;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices: number[] = [];

  for (let i = 0; i < RIBBON_SEGMENTS - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  const samples: Array<{ base: THREE.Vector3; tip: THREE.Vector3 }> = [];
  for (let i = 0; i < RIBBON_SEGMENTS; i++) {
    samples.push({ base: new THREE.Vector3(), tip: new THREE.Vector3() });
  }
  // Suppress unused warning while keeping initial tint available
  void colorHex;

  return { mesh, geo, mat, samples, wasActive: false };
}

function updateWeaponRibbon(
  ribbon: WeaponRibbon,
  baseObj: THREE.Object3D,
  tipObj: THREE.Object3D,
  intensity: number,
  colorHex: string,
  theme: VisualThemeId
) {
  const bPos = new THREE.Vector3();
  const tPos = new THREE.Vector3();
  baseObj.getWorldPosition(bPos);
  tipObj.getWorldPosition(tPos);

  if (intensity <= 0.02) {
    ribbon.mesh.visible = false;
    ribbon.wasActive = false;
    for (let i = 0; i < RIBBON_SEGMENTS; i++) {
      ribbon.samples[i].base.copy(bPos);
      ribbon.samples[i].tip.copy(tPos);
    }
    return;
  }

  ribbon.mesh.visible = true;
  if (!ribbon.wasActive) {
    // Seed all ribbon history points to current weapon position to prevent stray triangles!
    ribbon.wasActive = true;
    for (let i = 0; i < RIBBON_SEGMENTS; i++) {
      ribbon.samples[i].base.copy(bPos);
      ribbon.samples[i].tip.copy(tPos);
    }
  } else {
    for (let i = RIBBON_SEGMENTS - 1; i > 0; i--) {
      ribbon.samples[i].base.copy(ribbon.samples[i - 1].base);
      ribbon.samples[i].tip.copy(ribbon.samples[i - 1].tip);
    }
    ribbon.samples[0].base.copy(bPos);
    ribbon.samples[0].tip.copy(tPos);
  }

  const posAttr = ribbon.geo.attributes.position as THREE.BufferAttribute;
  const colAttr = ribbon.geo.attributes.color as THREE.BufferAttribute;
  const col = new THREE.Color(theme === 'ink' ? '#f5d061' : colorHex);
  const coreCol = new THREE.Color('#ffffff');

  for (let i = 0; i < RIBBON_SEGMENTS; i++) {
    const fade = Math.pow(1 - i / (RIBBON_SEGMENTS - 1), 1.65) * intensity;
    const s = ribbon.samples[i];

    posAttr.setXYZ(i * 2, s.base.x, s.base.y, s.base.z);
    posAttr.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z);

    colAttr.setXYZ(i * 2, col.r * fade * 0.55, col.g * fade * 0.55, col.b * fade * 0.55);
    colAttr.setXYZ(
      i * 2 + 1,
      (col.r * 0.65 + coreCol.r * 0.35) * fade,
      (col.g * 0.65 + coreCol.g * 0.35) * fade,
      (col.b * 0.65 + coreCol.b * 0.35) * fade
    );
  }

  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
}

export function DuelStage3D({
  attacker,
  defender,
  terrain,
  isNight = false,
  theme,
  lang,
  atkHp,
  defHp,
  speed,
  activeExchange,
  finaleWinner,
  demoTimeSec,
  onIntroComplete,
  onApplyHp,
  onExchangeComplete,
  onCutInChange,
  onCallout,
}: DuelStage3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [letterboxAmount, setLetterboxAmount] = useState(0);
  const [chronoTint, setChronoTint] = useState(0);

  // Live mutable refs so the 60fps Three.js loop never has to recreate WebGL context on prop updates!
  const speedRef = useRef<1 | 2>(speed);
  speedRef.current = speed;

  const hpRef = useRef({ atk: atkHp, def: defHp });
  hpRef.current = { atk: atkHp, def: defHp };

  const themeRef = useRef<VisualThemeId>(theme);
  themeRef.current = theme;

  const callbacksRef = useRef({
    onIntroComplete,
    onApplyHp,
    onExchangeComplete,
    onCutInChange,
    onCallout,
  });
  callbacksRef.current = {
    onIntroComplete,
    onApplyHp,
    onExchangeComplete,
    onCutInChange,
    onCallout,
  };

  const stateRef = useRef<{
    phase: DuelStagePhase;
    phaseTime: number;
    hitStopLeft: number;
    cameraShake: number;
    activeEvent: DuelExchangeEvent | null;
    plan: ExchangePlan | null;
    firedKeys: Set<string>;
    hpApplied: boolean;
    cutInActive: boolean;
    finaleWinner: 'attacker' | 'defender' | 'draw' | null;
    finaleTriggeredAudio: boolean;
    orbitYawOffset: number;
    orbitPitchOffset: number;
    dragging: boolean;
    lastPointerX: number;
    lastPointerY: number;
    disarmSpawned: boolean;
  }>({
    phase: 'intro',
    phaseTime: 0,
    hitStopLeft: 0,
    cameraShake: 0,
    activeEvent: null,
    plan: null,
    firedKeys: new Set(),
    hpApplied: false,
    cutInActive: false,
    finaleWinner: null,
    finaleTriggeredAudio: false,
    orbitYawOffset: 0,
    orbitPitchOffset: 0,
    dragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    disarmSpawned: false,
  });

  const atkProfile = useMemo(() => getHeroDuelProfile(attacker), [attacker]);
  const defProfile = useMemo(() => getHeroDuelProfile(defender), [defender]);

  // Synchronize incoming exchange event into the live 3D animation state machine
  useEffect(() => {
    const st = stateRef.current;
    if (activeExchange && st.activeEvent?.id !== activeExchange.id) {
      st.activeEvent = activeExchange;
      st.plan = buildExchangePlan(activeExchange, atkProfile, defProfile);
      st.phase = 'exchange';
      st.phaseTime = typeof demoTimeSec === 'number' && demoTimeSec > 0 ? demoTimeSec : 0;
      st.firedKeys.clear();
      st.hpApplied = false;
      st.cutInActive = false;
      st.hitStopLeft = 0;
      st.orbitYawOffset = 0;
      st.orbitPitchOffset = 0;
    }
  }, [activeExchange, atkProfile, defProfile, demoTimeSec]);

  // Synchronize finale winner state if entered directly (e.g. demo or after final exchange)
  useEffect(() => {
    const st = stateRef.current;
    if (finaleWinner && st.phase !== 'exchange' && st.phase !== 'finale') {
      st.finaleWinner = finaleWinner;
      st.phase = 'finale';
      st.phaseTime = typeof demoTimeSec === 'number' && demoTimeSec > 0 ? demoTimeSec : 0;
      st.finaleTriggeredAudio = false;
      st.disarmSpawned = false;
    }
  }, [finaleWinner, demoTimeSec]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = container.clientWidth || 840;
    const height = container.clientHeight || 390;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isNight ? 1.08 : 1.16;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fogColor = isNight || terrain === 'fortress'
      ? '#121628'
      : terrain === 'river'
        ? '#2e4152'
        : terrain === 'mountain'
          ? '#4b5059'
          : '#5a4332';
    scene.fog = new THREE.FogExp2(fogColor, 0.0155);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.25, 160);
    camera.position.set(0, 4.15, 12.1);

    // Three-Point Cinematic Three Kingdoms Lighting
    const hemiLight = new THREE.HemisphereLight(
      isNight ? '#4f699c' : '#ffe6be',
      isNight ? '#1b1715' : '#4a3525',
      isNight ? 0.65 : 0.92
    );
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      isNight ? '#93c5fd' : '#ffdfaa',
      isNight ? 1.15 : 2.25
    );
    keyLight.position.set(-10, 17, 11);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 48;
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 14;
    keyLight.shadow.camera.bottom = -14;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    // Back-side warm rim light to pop lamellar armor & dust silhouettes!
    const rimLight = new THREE.DirectionalLight(
      isNight ? '#fb923c' : '#f59e0b',
      isNight ? 1.3 : 1.15
    );
    rimLight.position.set(8, 8, -14);
    scene.add(rimLight);

    // Dynamic spark-clash PointLight (lights up both armored warriors on steel impact!)
    const clashLight = new THREE.PointLight('#ffdf88', 0, 16, 1.5);
    clashLight.position.set(0, 2.4, 0.5);
    scene.add(clashLight);

    const textures: THREE.Texture[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];

    // Build Arena, Left General, Right General
    const arena = buildDuelArena3D(
      attacker,
      defender,
      terrain,
      isNight,
      theme,
      textures,
      geometries,
      materials
    );
    scene.add(arena.group);

    const leftRig = buildMountedGeneralRig3D(attacker, atkProfile, textures, geometries, materials);
    const rightRig = buildMountedGeneralRig3D(defender, defProfile, textures, geometries, materials);
    scene.add(leftRig.root, rightRig.root);

    // 3D Additive Weapon Motion-Blur Ribbon Trails
    const leftRibbon = createWeaponRibbon(atkProfile.auraColor);
    const rightRibbon = createWeaponRibbon(defProfile.auraColor);
    scene.add(leftRibbon.mesh, rightRibbon.mesh);

    // 3D Chrono-Insight Predictive Trajectory Arc (shown during Chrono-Counter bullet-time!)
    const chronoArcCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(2.4, 3.2, 0.2),
      new THREE.Vector3(0.6, 2.85, 0.4),
      new THREE.Vector3(-1.3, 2.0, 0.1),
    ]);
    const chronoArcGeo = new THREE.TubeGeometry(chronoArcCurve, 24, 0.045, 6, false);
    const chronoArcMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const chronoArcMesh = new THREE.Mesh(chronoArcGeo, chronoArcMat);
    const chronoRingGeo = new THREE.RingGeometry(0.45, 0.62, 24);
    const chronoRingMat = new THREE.MeshBasicMaterial({
      color: '#7dd3fc',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const chronoRingMesh = new THREE.Mesh(chronoRingGeo, chronoRingMat);
    chronoRingMesh.position.set(0.3, 2.35, 0.25);
    geometries.push(chronoArcGeo, chronoRingGeo);
    materials.push(chronoArcMat, chronoRingMat);
    scene.add(chronoArcMesh, chronoRingMesh);

    // Thin Golden Ground Impact Shockwave Ring
    const shockGeo = new THREE.RingGeometry(0.46, 0.56, 36);
    shockGeo.rotateX(-Math.PI * 0.5);
    const shockMat = new THREE.MeshBasicMaterial({
      color: '#fde68a',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const shockRing = new THREE.Mesh(shockGeo, shockMat);
    shockRing.position.y = 0.05;
    geometries.push(shockGeo);
    materials.push(shockMat);
    scene.add(shockRing);
    let shockLife = 0;

    // Spinning disarmed weapon tumbling into dirt on KO!
    const disarmedGroup = new THREE.Group();
    disarmedGroup.visible = false;
    const disGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.1, 8);
    const disMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      metalness: 0.85,
      roughness: 0.25,
    });
    geometries.push(disGeo);
    materials.push(disMat);
    const disBlade = new THREE.Mesh(disGeo, disMat);
    disarmedGroup.add(disBlade);
    scene.add(disarmedGroup);
    const disarmedVel = new THREE.Vector3();

    // 3D Physics Sparks (line segments with velocity, gravity & ground bounce!)
    const sparks: SparkParticle[] = [];
    for (let i = 0; i < MAX_SPARKS; i++) {
      sparks.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.5,
        color: new THREE.Color('#fde047'),
      });
    }
    const sparkPositions = new Float32Array(MAX_SPARKS * 2 * 3);
    const sparkColors = new Float32Array(MAX_SPARKS * 2 * 3);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));
    const sparkMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sparkLines = new THREE.LineSegments(sparkGeo, sparkMat);
    sparkLines.frustumCulled = false;
    geometries.push(sparkGeo);
    materials.push(sparkMat);
    scene.add(sparkLines);

    // 3D Volumetric Hoof Dust Cloud Sprite Pool
    const dustTex = createDustPuffTexture(textures);
    const dustPool: DustParticle[] = [];
    for (let i = 0; i < MAX_DUST; i++) {
      const mat = new THREE.SpriteMaterial({
        map: dustTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        color: isNight ? '#7c766e' : '#e2cfa8',
      });
      materials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      dustPool.push({
        sprite,
        active: false,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.8,
        startScale: 0.4,
        endScale: 1.8,
      });
    }

    const spawnDust = (x: number, y: number, z: number, count = 1, big = false) => {
      let spawned = 0;
      for (const d of dustPool) {
        if (!d.active) {
          d.active = true;
          d.life = 0;
          d.maxLife = big ? 0.85 + Math.random() * 0.45 : 0.48 + Math.random() * 0.35;
          d.startScale = big ? 0.85 : 0.38;
          d.endScale = big ? 2.8 : 1.45;
          d.sprite.position.set(
            x + (Math.random() - 0.5) * 0.45,
            Math.max(0.12, y + Math.random() * 0.2),
            z + (Math.random() - 0.5) * 0.45
          );
          d.vel.set(
            (Math.random() - 0.5) * (big ? 3.2 : 1.2),
            0.55 + Math.random() * (big ? 1.2 : 0.6),
            (Math.random() - 0.5) * (big ? 2.4 : 0.9)
          );
          d.sprite.visible = true;
          spawned++;
          if (spawned >= count) break;
        }
      }
    };

    const spawnSparks = (
      x: number,
      y: number,
      z: number,
      count: number,
      primaryColorHex: string
    ) => {
      let spawned = 0;
      const baseCol = new THREE.Color(primaryColorHex);
      const whiteHot = new THREE.Color('#fffbeb');
      for (const s of sparks) {
        if (!s.active) {
          s.active = true;
          s.life = 0;
          s.maxLife = 0.28 + Math.random() * 0.48;
          s.pos.set(x, y, z);
          const theta = Math.random() * Math.PI * 2;
          const speedMag = 3.2 + Math.random() * 7.8;
          s.vel.set(
            Math.cos(theta) * speedMag,
            2.2 + Math.random() * 5.8,
            Math.sin(theta) * speedMag * 0.75
          );
          s.color.copy(Math.random() > 0.42 ? baseCol : whiteHot);
          spawned++;
          if (spawned >= count) break;
        }
      }
    };

    // Mouse-drag idle camera orbit handlers
    const onPointerDown = (e: PointerEvent) => {
      stateRef.current.dragging = true;
      stateRef.current.lastPointerX = e.clientX;
      stateRef.current.lastPointerY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      const st = stateRef.current;
      if (!st.dragging) return;
      const dx = e.clientX - st.lastPointerX;
      const dy = e.clientY - st.lastPointerY;
      st.lastPointerX = e.clientX;
      st.lastPointerY = e.clientY;
      st.orbitYawOffset = Math.max(-1.1, Math.min(1.1, st.orbitYawOffset - dx * 0.006));
      st.orbitPitchOffset = Math.max(-1.2, Math.min(2.2, st.orbitPitchOffset + dy * 0.012));
    };
    const onPointerUp = () => {
      stateRef.current.dragging = false;
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Responsive ResizeObserver
    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth || 840;
      const h = container.clientHeight || 390;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    // Kick off intro war drum
    battleAudio.playWarDrum(0.24);

    let rafId = 0;
    let lastTime = performance.now();
    let totalElapsed = 0;
    let clashLightIntensity = 0;
    let hoofSoundCooldown = 0;
    let lastUiLetterbox = -1;
    let lastUiChrono = -1;

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const st = stateRef.current;

      // Hit-stop impact freeze frame! (Sparks/light still decay slightly while fighters freeze in impact)
      let simDt = rawDt * speedRef.current;
      if (st.hitStopLeft > 0) {
        st.hitStopLeft = Math.max(0, st.hitStopLeft - rawDt);
        simDt = 0.0005;
      }

      totalElapsed += simDt;
      hoofSoundCooldown = Math.max(0, hoofSoundCooldown - rawDt);

      // Sample current animation frame from Choreography Director
      let sampled;
      if (st.phase === 'intro') {
        st.phaseTime += simDt;
        sampled = sampleIntroFrame(st.phaseTime, atkProfile, defProfile);
        if (st.phaseTime >= INTRO_DURATION) {
          st.phase = st.finaleWinner ? 'finale' : 'idle';
          st.phaseTime = 0;
          callbacksRef.current.onIntroComplete?.();
        }
      } else if (st.phase === 'exchange' && st.plan && st.activeEvent) {
        const preview = sampleExchangeFrame(
          st.phaseTime,
          st.plan,
          hpRef.current.atk,
          hpRef.current.def,
          atkProfile,
          defProfile
        );
        const dtScaled = simDt * preview.timeScale;
        st.phaseTime += dtScaled;
        sampled = sampleExchangeFrame(
          st.phaseTime,
          st.plan,
          hpRef.current.atk,
          hpRef.current.def,
          atkProfile,
          defProfile
        );

        const plan = st.plan;
        const ev = st.activeEvent;

        // 1. Cut-In trigger window
        if (plan.cutIn) {
          const shouldShow = st.phaseTime >= plan.cutIn.start && st.phaseTime <= plan.cutIn.end;
          if (shouldShow && !st.cutInActive) {
            st.cutInActive = true;
            battleAudio.playBulletTimeWhoosh(0.22);
            const hero = plan.cutIn.side === 'left' ? attacker : defender;
            const prof = plan.cutIn.side === 'left' ? atkProfile : defProfile;
            callbacksRef.current.onCutInChange?.({
              side: plan.cutIn.side,
              heroName: hero.name,
              skillName:
                plan.cutIn.kind === 'chrono'
                  ? { en: 'Chrono-Insight Counter', zh: '穿越者先知破招' }
                  : hero.signatureSkill.name,
              battleCry:
                plan.cutIn.kind === 'chrono'
                  ? {
                      en: 'Your historical flaw is laid bare — strike now!',
                      zh: '史书破绽已尽收眼底——破招！',
                    }
                  : hero.signatureSkill.battleCry,
              portrait: hero.portrait,
              accentColor: plan.cutIn.kind === 'chrono' ? '#38bdf8' : prof.auraColor,
              kind: plan.cutIn.kind,
            });
          } else if (!shouldShow && st.cutInActive) {
            st.cutInActive = false;
            callbacksRef.current.onCutInChange?.(null);
          }
        }

        // 2. Swing audio cues
        for (const cue of plan.swingCues) {
          if (st.phaseTime >= cue.time && !st.firedKeys.has(cue.key)) {
            st.firedKeys.add(cue.key);
            battleAudio.playWeaponSwing(cue.weight, 0.16);
          }
        }

        // 3. Clash burst events (sparks, hit-stop, PointLight flash, camera shake, SFX, callouts!)
        for (const b of plan.bursts) {
          if (st.phaseTime >= b.time && !st.firedKeys.has(b.key)) {
            st.firedKeys.add(b.key);
            if (b.kind === 'whiff') {
              spawnDust(b.x, 0.3, b.z, 5, false);
            } else {
              const sparkColor =
                b.kind === 'chrono'
                  ? '#38bdf8'
                  : b.kind === 'skill'
                    ? atkProfile.auraColor
                    : '#fde047';
              const sparkCount = b.kind === 'skill' ? 75 : b.kind === 'heavy' ? 56 : 36;
              spawnSparks(b.x, b.y, b.z, sparkCount, sparkColor);
              spawnDust(b.x, 0.12, b.z, b.kind === 'parry' ? 4 : 9, b.kind !== 'parry');

              clashLight.position.set(b.x, b.y, b.z + 0.4);
              clashLight.color.set(sparkColor);
              clashLightIntensity = b.kind === 'skill' ? 14 : b.kind === 'heavy' ? 10 : 7;

              if (b.kind === 'skill' || b.kind === 'chrono' || b.kind === 'heavy') {
                shockRing.position.set(b.x, 0.06, b.z);
                shockMat.color.set(sparkColor);
                shockLife = 0.55;
              }

              st.hitStopLeft = b.hitStopSec;
              st.cameraShake = Math.max(st.cameraShake, b.shake);

              if (b.kind === 'skill') {
                battleAudio.playSkillSurge(0.24);
                battleAudio.playHeavyImpact(0.24);
              } else if (b.kind === 'chrono') {
                battleAudio.playSkillSurge(0.22);
                battleAudio.playBladeParry(1.3, 0.2);
              } else if (b.kind === 'heavy') {
                battleAudio.playHeavyImpact(0.24);
              } else {
                battleAudio.playBladeParry(1.05, 0.18);
              }
            }

            if (b.callout) {
              callbacksRef.current.onCallout?.(b.callout);
            }
          }
        }

        // 4. Sync HP bar drain directly at impact moment!
        if (!st.hpApplied && st.phaseTime >= plan.hpApplyTime) {
          st.hpApplied = true;
          callbacksRef.current.onApplyHp?.(ev.atkHpAfter, ev.defHpAfter);
        }

        // 5. Exchange completion -> transition to Finale or back to Idle
        if (st.phaseTime >= plan.duration) {
          if (st.cutInActive) {
            st.cutInActive = false;
            callbacksRef.current.onCutInChange?.(null);
          }
          const completedEvent = ev;
          st.activeEvent = null;
          st.plan = null;
          if (completedEvent.isFinalRound && completedEvent.winnerIfFinal) {
            st.finaleWinner = completedEvent.winnerIfFinal;
            st.phase = 'finale';
            st.phaseTime = 0;
            st.finaleTriggeredAudio = false;
            st.disarmSpawned = false;
          } else {
            st.phase = 'idle';
            st.phaseTime = 0;
          }
          callbacksRef.current.onExchangeComplete?.(completedEvent);
        }
      } else if (st.phase === 'finale' && st.finaleWinner) {
        const preview = sampleFinaleFrame(st.phaseTime, st.finaleWinner, atkProfile, defProfile);
        st.phaseTime = Math.min(FINALE_DURATION, st.phaseTime + simDt * preview.timeScale);
        sampled = sampleFinaleFrame(st.phaseTime, st.finaleWinner, atkProfile, defProfile);

        if (!st.finaleTriggeredAudio) {
          st.finaleTriggeredAudio = true;
          battleAudio.playArmyCheer(st.finaleWinner === 'attacker', 0.2);
          spawnDust(0, 0.15, 0, 12, true);
        }

        // Spawn tumbling disarmed weapon when defeated general drops weapon
        if (!st.disarmSpawned && st.phaseTime > 0.28 && st.finaleWinner !== 'draw') {
          st.disarmSpawned = true;
          const loserX = st.finaleWinner === 'attacker' ? 4.4 : -4.4;
          disarmedGroup.position.set(loserX, 2.2, 0.2);
          disarmedGroup.visible = true;
          disarmedVel.set(st.finaleWinner === 'attacker' ? 2.4 : -2.4, 3.8, 1.4);
          spawnSparks(loserX, 2.2, 0.2, 24, '#fde047');
        }
      } else {
        sampled = sampleIdleFrame(
          totalElapsed,
          hpRef.current.atk,
          hpRef.current.def,
          atkProfile,
          defProfile
        );
      }

      // Apply articulated poses to both 3D Warhorses & Generals + collect hoof dust contacts
      const leftHooves = applyRigPose3D(leftRig, sampled.left, simDt, totalElapsed);
      const rightHooves = applyRigPose3D(rightRig, sampled.right, simDt, totalElapsed);
      const allHooves = [...leftHooves, ...rightHooves];
      for (const h of allHooves) {
        spawnDust(h.x, h.y, h.z, 1, false);
      }
      if (allHooves.length > 0 && hoofSoundCooldown <= 0) {
        battleAudio.playHoofGallop(0.11);
        hoofSoundCooldown = 0.22;
      }

      // Update 3D Weapon Motion-Blur Ribbon Trails
      updateWeaponRibbon(
        leftRibbon,
        leftRig.trailBase,
        leftRig.trailTip,
        sampled.left.trailIntensity,
        sampled.left.trailColor,
        themeRef.current
      );
      updateWeaponRibbon(
        rightRibbon,
        rightRig.trailBase,
        rightRig.trailTip,
        sampled.right.trailIntensity,
        sampled.right.trailColor,
        themeRef.current
      );

      // Update Chrono-Insight 3D World-Space Trajectory Vector Arc
      chronoArcMat.opacity = sampled.chronoScanAlpha * 0.85;
      chronoRingMat.opacity = sampled.chronoScanAlpha * 0.9;
      if (sampled.chronoScanAlpha > 0.01) {
        chronoRingMesh.rotation.z += rawDt * 4.2;
        const s = 0.85 + Math.sin(totalElapsed * 12) * 0.18;
        chronoRingMesh.scale.setScalar(s);
      }

      // Update Ground Impact Shockwave Ring
      if (shockLife > 0) {
        shockLife = Math.max(0, shockLife - rawDt);
        const prog = 1 - shockLife / 0.55;
        shockRing.scale.setScalar(1 + prog * 9.5);
        shockMat.opacity = (1 - prog) * 0.65;
      } else {
        shockMat.opacity = 0;
      }

      // Update Tumbling Disarmed Weapon Physics
      if (disarmedGroup.visible) {
        if (disarmedGroup.position.y > 0.14) {
          disarmedVel.y -= 13.5 * rawDt;
          disarmedGroup.position.addScaledVector(disarmedVel, rawDt);
          disarmedGroup.rotation.z += rawDt * 9.5;
          disarmedGroup.rotation.x += rawDt * 4.2;
        } else {
          disarmedGroup.position.y = 0.14;
          disarmedGroup.rotation.z = Math.PI * 0.5;
        }
      }

      // Update Dynamic Spark Clash PointLight
      if (clashLightIntensity > 0.05) {
        clashLightIntensity *= Math.pow(0.015, rawDt);
        clashLight.intensity = clashLightIntensity;
      } else {
        clashLight.intensity = 0;
      }

      // Update 3D Physics Sparks (with real ground bounce!)
      const sPos = sparkGeo.attributes.position as THREE.BufferAttribute;
      const sCol = sparkGeo.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < MAX_SPARKS; i++) {
        const sp = sparks[i];
        if (!sp.active) {
          sPos.setXYZ(i * 2, 0, -50, 0);
          sPos.setXYZ(i * 2 + 1, 0, -50, 0);
          continue;
        }
        sp.life += rawDt;
        if (sp.life >= sp.maxLife) {
          sp.active = false;
          sPos.setXYZ(i * 2, 0, -50, 0);
          sPos.setXYZ(i * 2 + 1, 0, -50, 0);
          continue;
        }
        sp.vel.y -= 15.5 * rawDt;
        const prevX = sp.pos.x;
        const prevY = sp.pos.y;
        const prevZ = sp.pos.z;
        sp.pos.addScaledVector(sp.vel, rawDt);
        // Bounce off compacted arena dirt!
        if (sp.pos.y < 0.04) {
          sp.pos.y = 0.04;
          sp.vel.y = Math.abs(sp.vel.y) * 0.42;
          sp.vel.x *= 0.72;
          sp.vel.z *= 0.72;
        }
        const fade = 1 - sp.life / sp.maxLife;
        sPos.setXYZ(i * 2, prevX, prevY, prevZ);
        sPos.setXYZ(i * 2 + 1, sp.pos.x, sp.pos.y, sp.pos.z);
        sCol.setXYZ(i * 2, sp.color.r * fade, sp.color.g * fade, sp.color.b * fade);
        sCol.setXYZ(i * 2 + 1, fade, fade * 0.96, fade * 0.85);
      }
      sPos.needsUpdate = true;
      sCol.needsUpdate = true;

      // Update Volumetric 3D Hoof Dust Cloud Sprites
      for (const d of dustPool) {
        if (!d.active) continue;
        d.life += rawDt;
        if (d.life >= d.maxLife) {
          d.active = false;
          d.sprite.visible = false;
          continue;
        }
        const p = d.life / d.maxLife;
        d.sprite.position.addScaledVector(d.vel, rawDt);
        d.vel.multiplyScalar(0.96);
        const scale = d.startScale + (d.endScale - d.startScale) * p;
        d.sprite.scale.set(scale, scale * 0.78, 1);
        d.sprite.material.opacity = Math.sin(p * Math.PI) * 0.44;
      }

      // Animate Vertex-Waving Calligraphy War Banners, Spectating Armies & Night Braziers
      const windSpeed = 3.2 + sampled.bannerCheer * 3.8;
      for (const b of arena.banners) {
        const posAttr = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < posAttr.count; i++) {
          const bx = b.basePositions[i * 3];
          const by = b.basePositions[i * 3 + 1];
          // Top of banner pinned to crossbar (by ≈ +1.375); lower edges flutter freely!
          const pinFactor = Math.max(0, (1.38 - by) / 2.75);
          const wave = Math.sin(totalElapsed * windSpeed + by * 2.2 + b.phase) * 0.24 * pinFactor;
          posAttr.setXYZ(i, bx + wave * 0.35, by, wave);
        }
        posAttr.needsUpdate = true;
      }

      if (sampled.bannerCheer > 0.15) {
        arena.spectatorGroups.left.position.y =
          Math.abs(Math.sin(totalElapsed * 8.5)) * 0.18 * sampled.bannerCheer;
        arena.spectatorGroups.right.position.y =
          Math.abs(Math.sin(totalElapsed * 8.5 + 1.2)) * 0.18 * sampled.bannerCheer;
      } else {
        arena.spectatorGroups.left.position.y = 0;
        arena.spectatorGroups.right.position.y = 0;
      }

      arena.brazierLights.forEach((l, idx) => {
        l.intensity = 3.2 + Math.sin(totalElapsed * 12 + idx * 2.1) * 0.75;
      });
      arena.brazierFlames.forEach((fl, idx) => {
        const flicker = 0.86 + Math.sin(totalElapsed * 15 + idx * 1.9) * 0.24;
        fl.scale.set(1, flicker, 1);
      });

      // Apply Dynamic 3D Cinema Camera + Idle Orbit Offset + Impact Trauma Shake
      st.cameraShake = Math.max(0, st.cameraShake - rawDt * 2.6);
      const shakeAmt = st.cameraShake * st.cameraShake * 0.42;
      const sx = (Math.random() - 0.5) * shakeAmt;
      const sy = (Math.random() - 0.5) * shakeAmt;

      let camX = sampled.camera.posX;
      let camY = sampled.camera.posY;
      let camZ = sampled.camera.posZ;

      if (st.phase === 'idle' && (Math.abs(st.orbitYawOffset) > 0.001 || Math.abs(st.orbitPitchOffset) > 0.001)) {
        const r = Math.hypot(camX, camZ);
        const baseYaw = Math.atan2(camX, camZ) + st.orbitYawOffset;
        camX = Math.sin(baseYaw) * r;
        camZ = Math.cos(baseYaw) * r;
        camY = Math.max(1.6, camY + st.orbitPitchOffset);
      }

      camera.position.set(camX + sx, camY + sy, camZ);
      if (Math.abs(camera.fov - sampled.camera.fov) > 0.05) {
        camera.fov = sampled.camera.fov;
        camera.updateProjectionMatrix();
      }
      camera.lookAt(sampled.camera.lookX, sampled.camera.lookY, sampled.camera.lookZ);

      // Throttled UI sync for cinematic letterbox bars & Chrono desaturation
      const roundedLb = Math.round(sampled.letterbox * 20) / 20;
      if (roundedLb !== lastUiLetterbox) {
        lastUiLetterbox = roundedLb;
        setLetterboxAmount(roundedLb);
      }
      const roundedCh = Math.round(sampled.chronoScanAlpha * 20) / 20;
      if (roundedCh !== lastUiChrono) {
        lastUiChrono = roundedCh;
        setChronoTint(roundedCh);
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((tx) => tx.dispose());
      leftRibbon.geo.dispose();
      leftRibbon.mat.dispose();
      rightRibbon.geo.dispose();
      rightRibbon.mat.dispose();
      renderer.dispose();
    };
  }, [attacker, defender, terrain, isNight, theme, atkProfile, defProfile]);

  if (webglFailed) {
    return (
      <div className="relative w-full aspect-[21/10] rounded-xl overflow-hidden bg-slate-950 border border-amber-500/30 flex items-center justify-center">
        <img
          src="/art/bg_plains_siege.jpg"
          alt="Duel Arena"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="relative z-10 text-center space-y-1 px-4">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-300">
            {lang === 'zh' ? '3D 演武场（WebGL 降级模式）' : '3D Duel Arena (Fallback Mode)'}
          </div>
          <div className="text-[11px] text-slate-300">
            {lang === 'zh'
              ? '浏览器未开启 WebGL 加速，仍可完整进行三回合单挑对决。'
              : 'WebGL unavailable in this browser — full 3-round duel mechanics remain active.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[21/10] rounded-xl overflow-hidden bg-[#0b0e14] border border-[#d4a853]/35 shadow-inner select-none cursor-grab active:cursor-grabbing">
      <div
        ref={containerRef}
        className="w-full h-full transition-[filter] duration-200"
        style={{
          filter:
            chronoTint > 0.05
              ? `saturate(${1 - chronoTint * 0.55}) hue-rotate(${chronoTint * 16}deg) contrast(${1 + chronoTint * 0.15})`
              : theme === 'ink'
                ? 'sepia(0.2) contrast(1.08)'
                : undefined,
        }}
      />

      {/* Chrono-Insight Holographic Tactical Scan Vignette */}
      {chronoTint > 0.05 && (
        <div
          className="pointer-events-none absolute inset-0 border-2 border-cyan-400/70"
          style={{
            opacity: chronoTint * 0.75,
            background:
              'radial-gradient(circle at center, transparent 42%, rgba(8,145,178,0.34) 100%)',
          }}
        />
      )}

      {/* Subtle Cinema Letterbox Bars during Intro, Signature Skills & KO Slow-Mo */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bg-black/92 transition-all duration-300"
        style={{ height: `${Math.round(letterboxAmount * 28)}px` }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/92 transition-all duration-300"
        style={{ height: `${Math.round(letterboxAmount * 28)}px` }}
      />

      {/* Interactive 3D Orbit Hint Pill */}
      <div className="pointer-events-none absolute bottom-2 right-2.5 z-10 px-2 py-0.5 rounded-full bg-black/55 border border-white/10 text-[10px] text-slate-300/85 backdrop-blur-sm">
        {lang === 'zh' ? '3D 实景 · 拖拽可环视武将' : 'Real-Time 3D · Drag to Orbit'}
      </div>
    </div>
  );
}
