import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getHeroDuelProfile } from '../game/heroDuelProfiles.js';
import type { General, Language, TerrainType } from '../game/types.js';
import { battleAudio } from '../utils/battleAudio.js';
import type { VisualThemeId } from '../utils/visualTheme.js';
import { buildDuelArena3D, getArenaLook } from './duel/duelArena3D.js';
import {
  FINALE_DURATION,
  INTRO_DURATION,
  buildExchangePlan,
  sampleExchangeFrame,
  sampleFinaleFrame,
  sampleIdleFrame,
  sampleIntroFrame,
} from './duel/duelChoreography.js';
import { DisposeBag } from './duel/duelGeometry3D.js';
import type { MountedGeneralRig3D } from './duel/duelModels3D.js';
import { RIDER_SCALE, applyRigPose3D, buildMountedGeneralRig3D, flashRig } from './duel/duelModels3D.js';
import { createSkyDomeTexture } from './duel/duelTextures3D.js';
import type {
  DuelCalloutBanner,
  DuelCutInState,
  DuelExchangeEvent,
  DuelStagePhase,
  ExchangePlan,
  SampledDuelFrame,
} from './duel/duelTypes.js';
import { createDuelPostFx, createDuelVfx } from './duel/duelVfx3D.js';

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

interface StageState {
  phase: DuelStagePhase;
  phaseTime: number;
  hitStopLeft: number;
  cameraShake: number;
  punch: number;
  flash: number;
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
  /** Visual QA only: hold the choreography clock still while poses settle */
  debugFrozen: boolean;
  /** Visual QA only: [posX, posY, posZ, lookX, lookY, lookZ, fov] overriding the cinematic camera */
  debugCam: number[] | null;
  debugFrameMs: number;
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

  // Live refs so the render loop never has to rebuild the WebGL scene when props change
  const speedRef = useRef<1 | 2>(speed);
  speedRef.current = speed;

  const hpRef = useRef({ atk: atkHp, def: defHp });
  hpRef.current = { atk: atkHp, def: defHp };

  const callbacksRef = useRef({ onIntroComplete, onApplyHp, onExchangeComplete, onCutInChange, onCallout });
  callbacksRef.current = { onIntroComplete, onApplyHp, onExchangeComplete, onCutInChange, onCallout };

  const stateRef = useRef<StageState>({
    phase: 'intro',
    phaseTime: 0,
    hitStopLeft: 0,
    cameraShake: 0,
    punch: 0,
    flash: 0,
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
    debugFrozen: false,
    debugCam: null,
    debugFrameMs: 0,
  });

  const atkProfile = useMemo(() => getHeroDuelProfile(attacker), [attacker]);
  const defProfile = useMemo(() => getHeroDuelProfile(defender), [defender]);

  // Feed an incoming exchange into the animation state machine
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

  // Enter the finale directly (demo, or when the duel is skipped)
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
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
    } catch {
      setWebglFailed(true);
      return;
    }

    const bag = new DisposeBag();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = container.clientWidth || 840;
    const height = container.clientHeight || 400;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    // The painted still shows through until the first real frame is on screen
    renderer.domElement.style.opacity = '0';
    renderer.domElement.style.transition = 'opacity 450ms ease-out';
    let revealed = false;

    const scene = new THREE.Scene();
    const arena = buildDuelArena3D(attacker, defender, terrain, isNight, bag);
    const look = arena.look;
    scene.add(arena.group);
    scene.fog = new THREE.FogExp2(look.fog, look.fogDensity);
    scene.background = new THREE.Color(look.skyStops[0]);
    renderer.toneMappingExposure = look.exposure;

    // Image-based lighting from the battlefield's own sky, so armour and steel reflect the scene
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(
      bag.add(new THREE.SphereGeometry(20, 24, 16)),
      bag.add(
        new THREE.MeshBasicMaterial({
          map: createSkyDomeTexture([look.skyStops[0], look.skyStops[2], look.fog, look.groundInner, '#0c0a08'], bag),
          side: THREE.BackSide,
        })
      )
    );
    const sunDir = new THREE.Vector3(...look.sunPos).normalize();
    const envSun = new THREE.Mesh(
      bag.add(new THREE.SphereGeometry(2.4, 12, 10)),
      bag.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(look.sunColor).multiplyScalar(5) }))
    );
    envSun.position.copy(sunDir).multiplyScalar(17);
    envScene.add(envSky, envSun);
    const envTarget = pmrem.fromScene(envScene, 0.03);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.8;

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.2, 200);
    camera.position.set(0, 3, 10.6);

    // Light rig: low sun behind the generals for a hard rim, soft sky bounce, and a fill from the lens side
    scene.add(new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemiIntensity));

    const sun = new THREE.DirectionalLight(look.sunColor, look.sunIntensity);
    sun.position.copy(sunDir).multiplyScalar(30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 70;
    sun.shadow.camera.left = -13;
    sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 11;
    sun.shadow.camera.bottom = -11;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(look.fillColor, look.fillIntensity);
    fill.position.set(3.5, 6, 12);
    scene.add(fill);

    const clashLight = new THREE.PointLight('#ffdf88', 0, 18, 1.6);
    scene.add(clashLight);
    // A soft key that rides with the lens during signature-skill close-ups
    const heroLight = new THREE.PointLight('#fff1dc', 0, 14, 1.4);
    scene.add(heroLight);
    let heroLightLevel = 0;
    let clashLightIntensity = 0;

    // The two generals. The right-hand one is mirrored so both weapon arms face the lens.
    const leftRig = buildMountedGeneralRig3D(attacker, atkProfile, bag);
    const rightRig = buildMountedGeneralRig3D(defender, defProfile, bag);
    rightRig.root.scale.z = -1;
    scene.add(leftRig.root, rightRig.root);

    const vfx = createDuelVfx(scene, bag, look.dust, look.ember);
    const leftRibbon = vfx.createRibbon();
    const rightRibbon = vfx.createRibbon();
    const post = createDuelPostFx(renderer, scene, camera, width, height);
    const grade = post.grade.uniforms;

    // Chrono-Insight: the predicted arc of the enemy's blow, drawn in the air
    const chronoArcMat = bag.add(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.5, 1.6, 2.4),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const chronoArc = new THREE.Mesh(
      bag.add(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(1.9, 3.6, 0.4),
            new THREE.Vector3(0.5, 3.5, 0.5),
            new THREE.Vector3(-1.1, 2.7, 0.4),
          ]),
          28,
          0.035,
          6,
          false
        )
      ),
      chronoArcMat
    );
    const chronoRingMat = chronoArcMat.clone();
    bag.add(chronoRingMat);
    chronoRingMat.side = THREE.DoubleSide;
    const chronoRing = new THREE.Mesh(bag.add(new THREE.RingGeometry(0.42, 0.5, 32)), chronoRingMat);
    chronoRing.position.set(-1.1, 2.7, 0.4);
    scene.add(chronoArc, chronoRing);

    // The loser's own weapon, knocked spinning out of their hand
    let disarmed: THREE.Object3D | null = null;
    const disarmedVel = new THREE.Vector3();
    let disarmedRestY = 1.4;

    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const bladeCentre = (rig: MountedGeneralRig3D, out: THREE.Vector3) => {
      rig.trailBase.getWorldPosition(va);
      rig.trailTip.getWorldPosition(vb);
      return out.lerpVectors(va, vb, 0.55);
    };

    // Drag to orbit while idle
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
      st.orbitPitchOffset = Math.max(-1.4, Math.min(2.4, st.orbitPitchOffset + dy * 0.012));
    };
    const onPointerUp = () => {
      stateRef.current.dragging = false;
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || 840;
      const h = container.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      post.setSize(w, h);
    });
    ro.observe(container);

    const isDemo = window.location.search.includes('demoDuel');
    if (isDemo) {
      (window as unknown as { __duelStage?: unknown }).__duelStage = stateRef.current;
    }

    battleAudio.playWarDrum(0.24);

    let rafId = 0;
    let lastTime = performance.now();
    let totalElapsed = 0;
    let hoofSoundCooldown = 0;
    let lastUiLetterbox = -1;
    let lastUiChrono = -1;
    let lastCutId = -1;
    let camReady = false;
    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    let camFov = 34;
    const impactScreen = new THREE.Vector2(0.5, 0.5);
    const tint = new THREE.Vector3(1, 1, 1);

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const frameStart = performance.now();
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const st = stateRef.current;

      // Hit-stop: the fighters freeze on the blow while sparks and camera keep moving
      let simDt = rawDt * speedRef.current;
      if (st.hitStopLeft > 0) {
        st.hitStopLeft = Math.max(0, st.hitStopLeft - rawDt);
        simDt = 0.0004;
      }
      const clockDt = st.debugFrozen ? 0 : simDt;
      let poseDt = simDt;
      totalElapsed += simDt;
      hoofSoundCooldown = Math.max(0, hoofSoundCooldown - rawDt);

      // -------------------------------------------------- choreography clock
      let sampled: SampledDuelFrame;
      let completed: DuelExchangeEvent | null = null;
      if (st.phase === 'intro') {
        st.phaseTime += clockDt;
        sampled = sampleIntroFrame(st.phaseTime, atkProfile, defProfile);
        if (st.phaseTime >= INTRO_DURATION) {
          st.phase = st.finaleWinner ? 'finale' : 'idle';
          st.phaseTime = 0;
          callbacksRef.current.onIntroComplete?.();
        }
      } else if (st.phase === 'exchange' && st.plan && st.activeEvent) {
        const plan = st.plan;
        const ev = st.activeEvent;
        const scale = sampleExchangeFrame(st.phaseTime, plan, hpRef.current.atk, hpRef.current.def, atkProfile, defProfile).timeScale;
        st.phaseTime += clockDt * scale;
        poseDt = simDt * scale;
        sampled = sampleExchangeFrame(st.phaseTime, plan, hpRef.current.atk, hpRef.current.def, atkProfile, defProfile);

        if (plan.cutIn) {
          const shouldShow = st.phaseTime >= plan.cutIn.start && st.phaseTime <= plan.cutIn.end;
          if (shouldShow && !st.cutInActive) {
            st.cutInActive = true;
            battleAudio.playBulletTimeWhoosh(0.22);
            const hero = plan.cutIn.side === 'left' ? attacker : defender;
            const prof = plan.cutIn.side === 'left' ? atkProfile : defProfile;
            const chrono = plan.cutIn.kind === 'chrono';
            callbacksRef.current.onCutInChange?.({
              side: plan.cutIn.side,
              heroName: hero.name,
              skillName: chrono ? { en: 'Chrono-Insight Counter', zh: '穿越者先知破招' } : hero.signatureSkill.name,
              battleCry: chrono
                ? { en: 'Your historical flaw is laid bare — strike now!', zh: '史书破绽已尽收眼底——破招！' }
                : hero.signatureSkill.battleCry,
              portrait: hero.portrait,
              accentColor: chrono ? '#38bdf8' : prof.auraColor,
              kind: plan.cutIn.kind,
            });
          } else if (!shouldShow && st.cutInActive) {
            st.cutInActive = false;
            callbacksRef.current.onCutInChange?.(null);
          }
        }

        for (const cue of plan.swingCues) {
          if (st.phaseTime >= cue.time && !st.firedKeys.has(cue.key)) {
            st.firedKeys.add(cue.key);
            battleAudio.playWeaponSwing(cue.weight, 0.16);
          }
        }

        if (!st.hpApplied && st.phaseTime >= plan.hpApplyTime) {
          st.hpApplied = true;
          callbacksRef.current.onApplyHp?.(ev.atkHpAfter, ev.defHpAfter);
        }

        if (st.phaseTime >= plan.duration) {
          if (st.cutInActive) {
            st.cutInActive = false;
            callbacksRef.current.onCutInChange?.(null);
          }
          completed = ev;
        }
      } else if (st.phase === 'finale' && st.finaleWinner) {
        const scale = sampleFinaleFrame(st.phaseTime, st.finaleWinner, atkProfile, defProfile).timeScale;
        st.phaseTime = Math.min(FINALE_DURATION, st.phaseTime + clockDt * scale);
        poseDt = simDt * scale;
        sampled = sampleFinaleFrame(st.phaseTime, st.finaleWinner, atkProfile, defProfile);
        if (!st.finaleTriggeredAudio) {
          st.finaleTriggeredAudio = true;
          battleAudio.playArmyCheer(st.finaleWinner === 'attacker', 0.2);
        }
      } else {
        sampled = sampleIdleFrame(totalElapsed, hpRef.current.atk, hpRef.current.def, atkProfile, defProfile);
      }
      if (st.debugFrozen) poseDt = rawDt;

      // -------------------------------------------------- pose both generals
      const hooves = [
        ...applyRigPose3D(leftRig, sampled.left, poseDt, totalElapsed),
        ...applyRigPose3D(rightRig, sampled.right, poseDt, totalElapsed + 3.7),
      ];
      for (const h of hooves) vfx.spawnDust(h.x, h.y, h.z, 1, false);
      if (hooves.length > 0 && hoofSoundCooldown <= 0) {
        battleAudio.playHoofGallop(0.11);
        hoofSoundCooldown = 0.2;
      }
      leftRig.root.updateMatrixWorld(true);
      rightRig.root.updateMatrixWorld(true);

      // -------------------------------------------------- blows landing this frame
      if (st.phase === 'exchange' && st.plan) {
        for (const b of st.plan.bursts) {
          if (st.phaseTime < b.time || st.firedKeys.has(b.key)) continue;
          st.firedKeys.add(b.key);

          const striker = b.striker === 'right' ? rightRig : leftRig;
          const victim = b.striker === 'right' ? leftRig : rightRig;
          const point = new THREE.Vector3();
          if (b.striker === 'both' || b.kind === 'parry') {
            point.addVectors(bladeCentre(leftRig, vc), bladeCentre(rightRig, new THREE.Vector3())).multiplyScalar(0.5);
          } else if (b.kind === 'whiff') {
            bladeCentre(striker, point);
          } else {
            victim.chest.getWorldPosition(point);
            point.lerp(bladeCentre(striker, vc), 0.3);
          }

          if (b.kind === 'whiff') {
            vfx.spawnDust(point.x, 0.3, point.z, 5, false);
          } else {
            const color =
              b.kind === 'chrono'
                ? '#38bdf8'
                : b.kind === 'skill'
                  ? striker.profile.auraColor
                  : '#ffcf5a';
            const heavy = b.kind !== 'parry';
            vfx.spawnSparks(point, b.kind === 'skill' ? 110 : heavy ? 80 : 46, color, heavy ? 1.15 : 0.85);
            vfx.flare(point, color, b.kind === 'skill' ? 3.3 : heavy ? 2.7 : 1.9);
            vfx.spawnDust(point.x, 0.12, point.z, heavy ? 10 : 4, heavy);
            if (heavy) {
              vfx.shock(point.x, point.z, color, b.kind === 'skill' ? 13 : 9);
              if (b.striker !== 'both') flashRig(victim, 1);
              else {
                flashRig(leftRig, 0.5);
                flashRig(rightRig, 0.5);
              }
              st.flash = Math.max(st.flash, b.kind === 'skill' ? 0.16 : 0.07);
            }

            clashLight.position.copy(point).add(va.set(0, 0.2, 0.8));
            clashLight.color.set(color);
            clashLightIntensity = b.kind === 'skill' ? 34 : heavy ? 24 : 15;

            st.hitStopLeft = b.hitStopSec;
            st.cameraShake = Math.max(st.cameraShake, b.shake);
            st.punch = Math.max(st.punch, heavy ? 1 : 0.5);
            vc.copy(point).project(camera);
            impactScreen.set(vc.x * 0.5 + 0.5, vc.y * 0.5 + 0.5);

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
          if (b.callout) callbacksRef.current.onCallout?.(b.callout);
        }
      }

      if (st.phase === 'finale' && st.finaleWinner && st.finaleWinner !== 'draw') {
        const loser = st.finaleWinner === 'attacker' ? rightRig : leftRig;
        if (!st.disarmSpawned && st.phaseTime > 0.18) {
          st.disarmSpawned = true;
          if (disarmed) scene.remove(disarmed);
          loser.weapon.visible = true;
          disarmed = loser.weapon.clone();
          loser.weapon.visible = false;
          loser.weapon.getWorldPosition(disarmed.position);
          loser.weapon.getWorldQuaternion(disarmed.quaternion);
          disarmed.scale.setScalar(RIDER_SCALE);
          scene.add(disarmed);
          const away = st.finaleWinner === 'attacker' ? 1 : -1;
          disarmedVel.set(away * 1.6, 5.2, 2.2);
          disarmedRestY = loser.style === 'short' ? 1.5 : 2.3;
          vfx.spawnSparks(disarmed.position, 30, '#ffcf5a', 0.8);
          vfx.spawnDust(loser.root.position.x, 0.15, 0, 8, true);
        }
      }

      if (completed) {
        st.activeEvent = null;
        st.plan = null;
        if (completed.isFinalRound && completed.winnerIfFinal) {
          st.finaleWinner = completed.winnerIfFinal;
          st.phase = 'finale';
          st.finaleTriggeredAudio = false;
          st.disarmSpawned = false;
        } else {
          st.phase = 'idle';
        }
        st.phaseTime = 0;
        callbacksRef.current.onExchangeComplete?.(completed);
      }

      // -------------------------------------------------- effects
      vfx.updateRibbon(leftRibbon, leftRig.trailBase, leftRig.trailTip, sampled.left.trailIntensity, sampled.left.trailColor, poseDt);
      vfx.updateRibbon(rightRibbon, rightRig.trailBase, rightRig.trailTip, sampled.right.trailIntensity, sampled.right.trailColor, poseDt);
      vfx.update(rawDt, totalElapsed);

      chronoArcMat.opacity = sampled.chronoScanAlpha * 0.9;
      chronoRingMat.opacity = sampled.chronoScanAlpha;
      if (sampled.chronoScanAlpha > 0.01) {
        chronoRing.lookAt(camera.position);
        chronoRing.scale.setScalar(0.85 + Math.sin(totalElapsed * 12) * 0.18);
      }

      if (disarmed) {
        if (disarmed.position.y > disarmedRestY || disarmedVel.y > 0) {
          disarmedVel.y -= 13.5 * rawDt;
          disarmed.position.addScaledVector(disarmedVel, rawDt);
          disarmed.rotation.z += rawDt * 11;
          disarmed.rotation.x += rawDt * 3;
          if (disarmed.position.y <= disarmedRestY && disarmedVel.y <= 0) {
            // It comes down point-first and stands quivering in the earth
            disarmed.position.y = disarmedRestY;
            disarmed.rotation.set(0.12, 0.4, Math.PI - 0.22);
            vfx.spawnDust(disarmed.position.x, 0.1, disarmed.position.z, 6, false);
          }
        }
      }

      if (clashLightIntensity > 0.4) {
        clashLightIntensity *= Math.pow(0.004, rawDt);
        clashLight.intensity = clashLightIntensity;
      } else {
        clashLight.intensity = 0;
      }

      // Banners, cheering ranks, torch flicker
      const windSpeed = 3.0 + sampled.bannerCheer * 3.6;
      for (const b of arena.banners) {
        const posAttr = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < posAttr.count; i++) {
          const bx = b.basePositions[i * 3];
          const by = b.basePositions[i * 3 + 1];
          const loose = Math.max(0, (1.6 - by) / 3.2);
          const wave = Math.sin(totalElapsed * windSpeed + by * 2.0 + b.phase) * 0.3 * loose;
          posAttr.setXYZ(i, bx + wave * 0.3, by, wave);
        }
        posAttr.needsUpdate = true;
        b.mesh.geometry.computeVertexNormals();
      }
      const cheer = sampled.bannerCheer > 0.15 ? sampled.bannerCheer : 0;
      arena.spectators.left.position.y = Math.abs(Math.sin(totalElapsed * 8.5)) * 0.16 * cheer;
      arena.spectators.right.position.y = Math.abs(Math.sin(totalElapsed * 8.5 + 1.2)) * 0.16 * cheer;
      arena.brazierLights.forEach((l, idx) => {
        l.intensity = 26 + Math.sin(totalElapsed * 12 + idx * 2.1) * 5 + Math.sin(totalElapsed * 31 + idx) * 3;
      });
      arena.brazierFlames.forEach((fl, idx) => {
        fl.scale.set(1, 0.86 + Math.sin(totalElapsed * 15 + idx * 1.9) * 0.24, 1);
      });

      // -------------------------------------------------- camera rig
      let tx = sampled.camera.posX;
      let ty = sampled.camera.posY;
      let tz = sampled.camera.posZ;
      if (st.phase === 'idle' && (Math.abs(st.orbitYawOffset) > 0.001 || Math.abs(st.orbitPitchOffset) > 0.001)) {
        const r = Math.hypot(tx, tz);
        const yaw = Math.atan2(tx, tz) + st.orbitYawOffset;
        tx = Math.sin(yaw) * r;
        tz = Math.cos(yaw) * r;
        ty = Math.max(1.2, ty + st.orbitPitchOffset);
      }
      va.set(tx, ty, tz);
      vb.set(sampled.camera.lookX, sampled.camera.lookY, sampled.camera.lookZ);
      let targetFov = sampled.camera.fov;
      if (st.debugCam) {
        va.set(st.debugCam[0], st.debugCam[1], st.debugCam[2]);
        vb.set(st.debugCam[3], st.debugCam[4], st.debugCam[5]);
        targetFov = st.debugCam[6] ?? targetFov;
        camReady = false;
      }
      if (!camReady || sampled.camera.cutId !== lastCutId) {
        camReady = true;
        camPos.copy(va);
        camLook.copy(vb);
        camFov = targetFov;
      } else {
        const kCam = 1 - Math.exp(-8 * rawDt);
        camPos.lerp(va, kCam);
        camLook.lerp(vb, kCam);
        camFov += (targetFov - camFov) * kCam;
      }
      lastCutId = sampled.camera.cutId;

      st.cameraShake = Math.max(0, st.cameraShake - rawDt * 2.4);
      st.punch = Math.max(0, st.punch - rawDt * 4.5);
      st.flash = Math.max(0, st.flash - rawDt * 3.2);
      const trauma = st.cameraShake * st.cameraShake;
      const e = now * 0.001;
      const shakeX = (Math.sin(e * 47.1) + Math.sin(e * 83.7 + 1.3)) * 0.5 * trauma * 0.3;
      const shakeY = (Math.sin(e * 53.9 + 2.1) + Math.sin(e * 71.3)) * 0.5 * trauma * 0.24;

      heroLightLevel += ((sampled.camera.cutId === 1 ? 1 : 0) - heroLightLevel) * (1 - Math.exp(-10 * rawDt));
      heroLight.intensity = heroLightLevel * 42;
      heroLight.position.copy(camPos).add(vc.set(0, 0.9, 0.4));

      // Punch-in: a short dolly toward the point of impact
      vc.subVectors(camLook, camPos).normalize();
      camera.position.copy(camPos).addScaledVector(vc, st.punch * 0.55);
      camera.position.x += shakeX;
      camera.position.y += shakeY;
      const fov = camFov - st.punch * 2.4;
      if (Math.abs(camera.fov - fov) > 0.02) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      camera.lookAt(camLook);
      camera.rotateZ(Math.sin(e * 61.7) * trauma * 0.03);

      // -------------------------------------------------- grade
      grade.uBlur.value = sampled.radialBlur + st.punch * 0.032;
      (grade.uCenter.value as THREE.Vector2).lerp(st.punch > 0.05 ? impactScreen : va2.set(0.5, 0.5), 0.3);
      grade.uAberration.value = trauma * 0.012 + st.punch * 0.004;
      grade.uFlash.value = st.flash;
      grade.uVignette.value = 0.5 + sampled.letterbox * 0.18;
      const ch = sampled.chronoScanAlpha;
      tint.set(1 - ch * 0.3, 1 - ch * 0.05, 1 + ch * 0.25);
      (grade.uTint.value as THREE.Vector3).copy(tint);
      grade.uSaturation.value = 1.08 - ch * 0.4;

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

      post.render();
      if (!revealed) {
        revealed = true;
        renderer.domElement.style.opacity = '1';
      }
      st.debugFrameMs = st.debugFrameMs * 0.9 + (performance.now() - frameStart) * 0.1;
    };
    const va2 = new THREE.Vector2();

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (isDemo) delete (window as unknown as { __duelStage?: unknown }).__duelStage;
      post.dispose();
      envTarget.dispose();
      pmrem.dispose();
      bag.dispose();
      renderer.dispose();
    };
  }, [attacker, defender, terrain, isNight, atkProfile, defProfile]);

  const stillUrl = getArenaLook(terrain, isNight).panoUrl;

  if (webglFailed) {
    return (
      <div className="relative w-full aspect-[21/10] rounded-xl overflow-hidden bg-slate-950 border border-amber-500/30 flex items-center justify-center">
        <img
          src={stillUrl}
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
    <div
      className="relative w-full aspect-[21/10] rounded-xl overflow-hidden bg-[#0b0e14] bg-cover bg-center border border-[#d4a853]/35 shadow-inner select-none cursor-grab active:cursor-grabbing"
      style={{ backgroundImage: `linear-gradient(rgba(8,10,16,0.45), rgba(8,10,16,0.45)), url(${stillUrl})` }}
    >
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ filter: theme === 'ink' ? 'sepia(0.28) contrast(1.08) saturate(0.8)' : undefined }}
      />

      {/* Chrono-Insight scan frame */}
      {chronoTint > 0.05 && (
        <div
          className="pointer-events-none absolute inset-0 border-2 border-cyan-400/70"
          style={{
            opacity: chronoTint * 0.75,
            background: 'radial-gradient(circle at center, transparent 42%, rgba(8,145,178,0.34) 100%)',
          }}
        />
      )}

      {/* Letterbox bars during the intro, signature skills and the finish */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bg-black transition-all duration-300"
        style={{ height: `${Math.round(letterboxAmount * 9)}%` }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-black transition-all duration-300"
        style={{ height: `${Math.round(letterboxAmount * 9)}%` }}
      />

      <div className="pointer-events-none absolute bottom-2 right-2.5 z-10 px-2 py-0.5 rounded-full bg-black/55 border border-white/10 text-[10px] text-slate-300/85 backdrop-blur-sm">
        {lang === 'zh' ? '3D 实景 · 拖拽可环视武将' : 'Real-Time 3D · Drag to Orbit'}
      </div>
    </div>
  );
}
