import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getHeroDuelProfile } from '../game/heroDuelProfiles.js';
import type { FactionId, GameState, General } from '../game/types.js';
import { prefersReducedMotion } from '../utils/motion.js';
import { getArenaLook } from './duel/duelArena3D.js';
import { DisposeBag } from './duel/duelGeometry3D.js';
import { applyRigPose3D, buildMountedGeneralRig3D } from './duel/duelModels3D.js';
import {
  createDustPuffTexture,
  createGroundDetailTextures,
  createImpactFlareTexture,
  createPaintedPanoramaTexture,
  createSilkBannerTexture,
  createSkyDomeTexture,
} from './duel/duelTextures3D.js';
import type { RiderFrameState } from './duel/duelTypes.js';
import type { WarSceneConfig } from './WarSceneModal.js';

interface WarStage3DProps {
  scene: WarSceneConfig;
  state: GameState;
  elapsedRef: React.MutableRefObject<number>;
  onFallback?: () => void;
}

const FACTION_PALETTE: Record<FactionId, { bg: string; trim: string; banner: string }> = {
  wei: { bg: '#2f5d8c', trim: '#e6c164', banner: '魏' },
  shu: { bg: '#2f6e49', trim: '#e8c864', banner: '蜀' },
  wu: { bg: '#a62c22', trim: '#f0c45c', banner: '吴' },
  neutral: { bg: '#635c51', trim: '#d8bc74', banner: '汉' },
};

function makeFallbackCaptain(template: General, faction: FactionId, side: 'atk' | 'def'): General {
  return {
    ...template,
    id: `captain_${faction}_${side}`,
    name: { en: 'Vanguard Commander', zh: '先锋校尉' },
    title: { en: 'Field Captain', zh: '牙门校尉' },
    seal: FACTION_PALETTE[faction].banner,
    faction,
    originalFaction: faction,
    archetype: 'vanguard',
    portrait: '/portraits/unit_cavalry.jpg',
    war: 82,
    intellect: 68,
    command: 78,
  };
}

function part(
  geo: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  scale: [number, number, number] = [1, 1, 1]
): THREE.BufferGeometry {
  const m = new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)))
    .multiply(new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2]));
  geo.applyMatrix4(m);
  return geo;
}

function createStoneWallTexture(bag: DisposeBag): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#4f483f';
  ctx.fillRect(0, 0, 256, 256);
  const rows = 8;
  const cols = 4;
  const rh = 256 / rows;
  const cw = 256 / cols;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (cw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const x = col * cw + off;
      const y = r * rh;
      const shade = 68 + ((r * 17 + col * 31) & 15);
      ctx.fillStyle = `rgb(${shade}, ${shade - 5}, ${shade - 11})`;
      ctx.fillRect(x + 2, y + 2, cw - 4, rh - 4);
      ctx.fillStyle = 'rgba(255,245,225,0.08)';
      ctx.fillRect(x + 2, y + 2, cw - 4, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x + 2, y + rh - 4, cw - 4, 2);
    }
  }
  const tex = bag.add(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 2);
  return tex;
}

interface SoldierSlot {
  startX: number;
  startZ: number;
  clashX: number;
  clashZ: number;
  phase: number;
  fallAt: number; // progress threshold (0..1) when this soldier falls; > 1 means survives
  flank: boolean;
}

interface ShipSlot {
  rig: THREE.Group;
  oars: THREE.Group[];
  wheel?: THREE.Mesh;
  wake: THREE.Mesh;
  startX: number;
  startZ: number;
  clashX: number;
  side: 'atk' | 'def';
  sinkAt: number;
  phase: number;
}

export function WarStage3D({ scene, state, elapsedRef, onFallback }: WarStage3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      onFallback?.();
      return;
    }

    const bag = new DisposeBag();
    const reducedMotion = prefersReducedMotion();
    const isNight = scene.mode === 'raid' || scene.mode === 'discord';
    const isRiver = scene.terrain === 'river' || scene.mode === 'river_strike';
    const isFortress = scene.terrain === 'fortress' || scene.mode === 'bombard';
    const look = getArenaLook(isRiver ? 'river' : scene.terrain, isNight);

    const initW = Math.max(320, host.clientWidth || 960);
    const initH = Math.max(240, host.clientHeight || 520);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(initW, initH);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = look.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const world = new THREE.Scene();
    world.fog = new THREE.FogExp2(look.fog, look.fogDensity * 0.92);

    const camera = new THREE.PerspectiveCamera(38, initW / initH, 0.2, 160);
    camera.position.set(0, 5.2, 18.5);

    // --- Lighting
    const hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemiIntensity * 1.05);
    world.add(hemi);

    const sun = new THREE.DirectionalLight(look.sunColor, look.sunIntensity);
    sun.position.set(look.sunPos[0], look.sunPos[1] + 2, look.sunPos[2]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 58;
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -14;
    sun.shadow.bias = -0.0006;
    world.add(sun);

    const fill = new THREE.DirectionalLight(look.fillColor, look.fillIntensity * 0.85);
    fill.position.set(-look.sunPos[0] * 0.6, 5, 14);
    world.add(fill);

    const blastLight = new THREE.PointLight('#ff8a30', 0, 26, 1.7);
    blastLight.position.set(2, 3.2, 0);
    world.add(blastLight);

    // --- Sky Dome & Horizon-Matched Painted Cyclorama
    const sky = new THREE.Mesh(
      bag.add(new THREE.SphereGeometry(88, 24, 16)),
      bag.add(
        new THREE.MeshBasicMaterial({
          map: createSkyDomeTexture(look.skyStops, bag),
          side: THREE.BackSide,
          fog: false,
          depthWrite: false,
        })
      )
    );
    sky.renderOrder = -2;
    world.add(sky);

    const BACKDROP_RADIUS = 52;
    const BACKDROP_ARC = 165 / 360;
    const bandHeight = look.band[1] - look.band[0];
    const arcLen = BACKDROP_RADIUS * Math.PI * 2 * BACKDROP_ARC;
    const paintH = (arcLen * 768 * bandHeight) / 1376;
    const pano = new THREE.Mesh(
      bag.add(new THREE.CylinderGeometry(BACKDROP_RADIUS, BACKDROP_RADIUS, paintH, 64, 1, true)),
      bag.add(
        new THREE.MeshBasicMaterial({
          map: createPaintedPanoramaTexture(look.panoUrl, look.band, BACKDROP_ARC, bag),
          side: THREE.BackSide,
          fog: false,
          color: new THREE.Color(1.08, 1.08, 1.08),
        })
      )
    );
    pano.scale.x = -1;
    pano.position.y = 3.1 - look.horizon * paintH + paintH * 0.5;
    pano.renderOrder = -1;
    world.add(pano);

    // --- Ground or Living Yangtze River Plane
    let waterGeo: THREE.PlaneGeometry | null = null;
    let waterBase: Float32Array | null = null;
    if (isRiver) {
      waterGeo = bag.add(new THREE.PlaneGeometry(160, 140, 72, 56));
      waterGeo.rotateX(-Math.PI * 0.5);
      waterBase = (waterGeo.attributes.position.array as Float32Array).slice();
      const wPos = waterGeo.attributes.position as THREE.BufferAttribute;
      const wCols = new Float32Array(wPos.count * 3);
      const deep = new THREE.Color(isNight ? '#0e2433' : '#184a52');
      const channel = new THREE.Color(isNight ? '#1b3e52' : '#2c767c');
      const tmpW = new THREE.Color();
      for (let i = 0; i < wPos.count; i++) {
        const band = Math.exp(-Math.pow(wPos.getZ(i) / 14, 2));
        tmpW.copy(deep).lerp(channel, band);
        wCols[i * 3] = tmpW.r;
        wCols[i * 3 + 1] = tmpW.g;
        wCols[i * 3 + 2] = tmpW.b;
      }
      waterGeo.setAttribute('color', new THREE.BufferAttribute(wCols, 3));
      const waterMat = bag.add(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          emissive: isNight ? '#091b28' : '#123a40',
          emissiveIntensity: 0.42,
          roughness: 0.32,
          metalness: 0.14,
        })
      );
      const waterMesh = new THREE.Mesh(waterGeo, waterMat);
      waterMesh.receiveShadow = true;
      world.add(waterMesh);
    } else {
      const groundTex = createGroundDetailTextures(bag);
      const groundGeo = bag.add(new THREE.PlaneGeometry(160, 140, 56, 48));
      groundGeo.rotateX(-Math.PI * 0.5);
      const gPos = groundGeo.attributes.position as THREE.BufferAttribute;
      const gCols = new Float32Array(gPos.count * 3);
      const inner = new THREE.Color(look.groundInner);
      const outer = new THREE.Color(look.groundOuter);
      const tmpC = new THREE.Color();
      for (let i = 0; i < gPos.count; i++) {
        const r = Math.hypot(gPos.getX(i) * 0.8, gPos.getZ(i));
        const k = Math.min(1, Math.max(0, (r - 8) / 28));
        tmpC.copy(inner).lerp(outer, k * k * (3 - 2 * k));
        gCols[i * 3] = tmpC.r;
        gCols[i * 3 + 1] = tmpC.g;
        gCols[i * 3 + 2] = tmpC.b;
      }
      groundGeo.setAttribute('color', new THREE.BufferAttribute(gCols, 3));
      const ground = new THREE.Mesh(
        groundGeo,
        bag.add(
          new THREE.MeshStandardMaterial({
            map: groundTex.map,
            bumpMap: groundTex.bumpMap,
            bumpScale: 1.8,
            vertexColors: true,
            roughness: 0.95,
          })
        )
      );
      ground.receiveShadow = true;
      world.add(ground);
    }

    // --- Stone Fortress Wall & Vermilion Gatehouse (for Siege / Bombard)
    if (isFortress && !isRiver) {
      const wallTex = createStoneWallTexture(bag);
      const wallMat = bag.add(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
      const redWoodMat = bag.add(new THREE.MeshStandardMaterial({ color: '#7a2018', roughness: 0.65 }));
      const roofMat = bag.add(new THREE.MeshStandardMaterial({ color: '#272b30', roughness: 0.72 }));
      const goldMat = bag.add(new THREE.MeshStandardMaterial({ color: '#dfb85c', metalness: 0.85, roughness: 0.3 }));

      const fort = new THREE.Group();
      fort.position.set(14.8, 0, -1.5);
      fort.rotation.y = -0.22;

      const rampart = new THREE.Mesh(bag.add(new THREE.BoxGeometry(3.2, 5.8, 38)), wallMat);
      rampart.position.set(0, 2.9, 0);
      rampart.castShadow = true;
      rampart.receiveShadow = true;
      fort.add(rampart);

      const merlonGeo = bag.add(new THREE.BoxGeometry(0.9, 1.05, 1.5));
      for (let mz = -17; mz <= 17; mz += 2.8) {
        const m = new THREE.Mesh(merlonGeo, wallMat);
        m.position.set(-1.15, 6.3, mz);
        m.castShadow = true;
        fort.add(m);
      }

      // Gatehouse pavilion above the central archway
      const arch = new THREE.Mesh(
        bag.add(new THREE.BoxGeometry(3.35, 3.3, 3.8)),
        bag.add(new THREE.MeshStandardMaterial({ color: '#1a130f', roughness: 0.9 }))
      );
      arch.position.set(-0.05, 1.65, 0);
      fort.add(arch);

      const hall = new THREE.Mesh(bag.add(new THREE.BoxGeometry(2.6, 2.5, 6.6)), redWoodMat);
      hall.position.set(0, 7.05, 0);
      hall.castShadow = true;
      fort.add(hall);

      const roof = new THREE.Mesh(bag.add(new THREE.ConeGeometry(5.2, 2.1, 4)), roofMat);
      roof.rotation.y = Math.PI * 0.25;
      roof.scale.set(0.68, 1, 1.28);
      roof.position.set(0, 9.2, 0);
      roof.castShadow = true;
      fort.add(roof);

      // Glowing red silk fortress lanterns
      const lanternMat = bag.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.75, 0.25) }));
      const lanternGeo = bag.add(new THREE.SphereGeometry(0.24, 10, 8));
      for (const lz of [-2.4, 2.4]) {
        const lan = new THREE.Mesh(lanternGeo, lanternMat);
        lan.scale.set(1, 1.3, 1);
        lan.position.set(-1.55, 6.1, lz);
        fort.add(lan);
        const cap = new THREE.Mesh(bag.add(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 8)), goldMat);
        cap.position.set(-1.55, 6.42, lz);
        fort.add(cap);
      }

      world.add(fort);
    }

    // --- Recon Hot-Air Balloon (Time-Traveler Tech)
    let balloonGroup: THREE.Group | null = null;
    if (scene.hasBalloon) {
      balloonGroup = new THREE.Group();
      const envGeo = bag.add(new THREE.SphereGeometry(1.75, 18, 14));
      envGeo.scale(1, 1.24, 1);
      const envMat = bag.add(
        new THREE.MeshStandardMaterial({
          color: FACTION_PALETTE[scene.attackerFaction].bg,
          roughness: 0.65,
        })
      );
      const env = new THREE.Mesh(envGeo, envMat);
      const band = new THREE.Mesh(
        bag.add(new THREE.TorusGeometry(1.72, 0.1, 8, 24)),
        bag.add(new THREE.MeshStandardMaterial({ color: '#e5c158', metalness: 0.6, roughness: 0.4 }))
      );
      band.rotation.x = Math.PI * 0.5;
      const basket = new THREE.Mesh(
        bag.add(new THREE.CylinderGeometry(0.42, 0.36, 0.55, 8)),
        bag.add(new THREE.MeshStandardMaterial({ color: '#6b492a', roughness: 0.88 }))
      );
      basket.position.y = -2.75;
      const burner = new THREE.Mesh(
        bag.add(new THREE.SphereGeometry(0.22, 8, 8)),
        bag.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.1, 0.5) }))
      );
      burner.position.y = -1.95;
      balloonGroup.add(env, band, basket, burner);
      balloonGroup.position.set(-12, 11.2, -10.5);
      world.add(balloonGroup);
    }

    const atkPal = FACTION_PALETTE[scene.attackerFaction];
    const defPal = FACTION_PALETTE[scene.defenderFaction];

    // --- Fluttering Silk War Banners
    const banners: Array<{ mesh: THREE.Mesh; base: Float32Array; phase: number }> = [];
    if (!isRiver) {
      const woodMat = bag.add(new THREE.MeshStandardMaterial({ color: '#3b2616', roughness: 0.88 }));
      const goldMat = bag.add(new THREE.MeshStandardMaterial({ color: '#e5c158', metalness: 0.9, roughness: 0.3 }));
      const poleGeo = bag.add(new THREE.CylinderGeometry(0.055, 0.075, 6.4, 8));
      const barGeo = bag.add(new THREE.CylinderGeometry(0.03, 0.03, 1.45, 6));
      const finialGeo = bag.add(new THREE.ConeGeometry(0.09, 0.35, 6));
      const bannerSpecs = [
        { x: -12.5, z: -6.2, glyph: scene.attackerHero?.seal ?? atkPal.banner, pal: atkPal, dir: 1 },
        { x: -9.2, z: 5.8, glyph: atkPal.banner, pal: atkPal, dir: 1 },
        { x: 11.8, z: -5.8, glyph: scene.defenderHero?.seal ?? defPal.banner, pal: defPal, dir: -1 },
        { x: 9.8, z: 5.6, glyph: defPal.banner, pal: defPal, dir: -1 },
      ];
      bannerSpecs.forEach((b, idx) => {
        const pole = new THREE.Mesh(poleGeo, woodMat);
        pole.position.set(b.x, 3.2, b.z);
        pole.castShadow = true;
        const finial = new THREE.Mesh(finialGeo, goldMat);
        finial.position.set(b.x, 6.55, b.z);
        const bar = new THREE.Mesh(barGeo, woodMat);
        bar.rotation.z = Math.PI * 0.5;
        bar.position.set(b.x + b.dir * 0.65, 6.05, b.z);
        world.add(pole, finial, bar);

        const clothGeo = bag.add(new THREE.PlaneGeometry(1.3, 2.75, 6, 10));
        const cloth = new THREE.Mesh(
          clothGeo,
          bag.add(
            new THREE.MeshStandardMaterial({
              map: createSilkBannerTexture(b.glyph, b.pal.bg, b.pal.trim, bag),
              side: THREE.DoubleSide,
              roughness: 0.76,
            })
          )
        );
        cloth.position.set(b.x + b.dir * 0.68, 4.65, b.z);
        cloth.castShadow = true;
        world.add(cloth);
        banners.push({
          mesh: cloth,
          base: (clothGeo.attributes.position.array as Float32Array).slice(),
          phase: idx * 1.3,
        });
      });
    }

    // --- 3D Mounted Commander Generals (Leading the Vanguard on Land)
    const templateGeneral = Object.values(state.generals)[0];
    const atkCommander =
      scene.attackerHero ?? makeFallbackCaptain(templateGeneral, scene.attackerFaction, 'atk');
    const defCommander =
      scene.defenderHero ?? makeFallbackCaptain(templateGeneral, scene.defenderFaction, 'def');
    let atkRig: ReturnType<typeof buildMountedGeneralRig3D> | null = null;
    let defRig: ReturnType<typeof buildMountedGeneralRig3D> | null = null;
    if (!isRiver) {
      atkRig = buildMountedGeneralRig3D(atkCommander, getHeroDuelProfile(atkCommander), bag);
      atkRig.root.scale.setScalar(1.06);
      world.add(atkRig.root);

      defRig = buildMountedGeneralRig3D(defCommander, getHeroDuelProfile(defCommander), bag);
      defRig.root.scale.setScalar(1.06);
      world.add(defRig.root);
    }

    // --- Proportionally Sized 3D Armies (Instanced Soldiers on Land, 3D Lou-Chuan Warships on River)
    const maxTroops = Math.max(1, scene.attackerStartTroops, scene.defenderStartTroops);
    const atkLossRatio = Math.min(0.92, scene.attackerLosses / Math.max(1, scene.attackerStartTroops));
    const defLossRatio = Math.min(0.92, scene.defenderLosses / Math.max(1, scene.defenderStartTroops));

    const atkSlots: SoldierSlot[] = [];
    const defSlots: SoldierSlot[] = [];
    let atkBodies: THREE.InstancedMesh | null = null;
    let atkIrons: THREE.InstancedMesh | null = null;
    let atkWood: THREE.InstancedMesh | null = null;
    let defBodies: THREE.InstancedMesh | null = null;
    let defIrons: THREE.InstancedMesh | null = null;
    let defWood: THREE.InstancedMesh | null = null;
    const ships: ShipSlot[] = [];

    if (!isRiver) {
      const bodyGeo = bag.add(
        mergeGeometries([
          part(new THREE.CylinderGeometry(0.19, 0.27, 0.44, 8), 0, 0.74, 0),
          part(new THREE.CylinderGeometry(0.24, 0.19, 0.5, 8), 0, 1.2, 0, 0, 0, 0, [0.82, 1, 1.12]),
          part(new THREE.SphereGeometry(0.13, 8, 6), 0, 1.4, 0.27),
          part(new THREE.SphereGeometry(0.13, 8, 6), 0, 1.4, -0.27),
          part(new THREE.CylinderGeometry(0.065, 0.055, 0.46, 6), 0.06, 1.14, 0.31, 0, 0, 0.15),
          part(new THREE.CylinderGeometry(0.065, 0.055, 0.46, 6), 0.14, 1.16, -0.31, 0, 0, 0.85),
          part(new THREE.BoxGeometry(0.055, 0.84, 0.5), 0.29, 0.98, 0.22, 0, 0, 0.06),
          part(new THREE.ConeGeometry(0.05, 0.26, 6), -0.04, 1.98, 0, 0, 0, 0.3),
        ])
      );
      const ironGeo = bag.add(
        mergeGeometries([
          part(new THREE.SphereGeometry(0.15, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), 0, 1.68, 0),
          part(new THREE.CylinderGeometry(0.165, 0.175, 0.03, 10), 0, 1.69, 0),
          part(new THREE.CylinderGeometry(0.085, 0.075, 0.54, 6), 0, 0.27, 0.11),
          part(new THREE.CylinderGeometry(0.085, 0.075, 0.54, 6), 0, 0.27, -0.11),
          part(new THREE.ConeGeometry(0.048, 0.46, 4), 1.55, 1.46, -0.31, 0, 0, -Math.PI * 0.44),
          part(new THREE.SphereGeometry(0.08, 6, 6), 0.32, 1.0, 0.22, 0, 0, 0, [0.5, 1, 1]),
        ])
      );
      const fleshWoodGeo = bag.add(
        mergeGeometries([
          part(new THREE.SphereGeometry(0.115, 8, 6), 0.015, 1.6, 0),
          part(new THREE.CylinderGeometry(0.022, 0.024, 3.1, 5), 0.22, 1.3, -0.31, 0, 0, -Math.PI * 0.44),
        ])
      );

      const ironMat = bag.add(new THREE.MeshStandardMaterial({ color: '#78808a', metalness: 0.84, roughness: 0.38 }));
      const woodSkinMat = bag.add(new THREE.MeshStandardMaterial({ color: '#84593c', roughness: 0.84 }));
      const atkArmorMat = bag.add(new THREE.MeshStandardMaterial({ color: atkPal.bg, roughness: 0.56, metalness: 0.28 }));
      const defArmorMat = bag.add(new THREE.MeshStandardMaterial({ color: defPal.bg, roughness: 0.56, metalness: 0.28 }));

      const atkTotal = Math.max(18, Math.round(64 * Math.max(0.38, scene.attackerStartTroops / maxTroops)));
      const defTotal = Math.max(18, Math.round(64 * Math.max(0.38, scene.defenderStartTroops / maxTroops)));

      atkBodies = new THREE.InstancedMesh(bodyGeo, atkArmorMat, atkTotal);
      atkIrons = new THREE.InstancedMesh(ironGeo, ironMat, atkTotal);
      atkWood = new THREE.InstancedMesh(fleshWoodGeo, woodSkinMat, atkTotal);
      defBodies = new THREE.InstancedMesh(bodyGeo, defArmorMat, defTotal);
      defIrons = new THREE.InstancedMesh(ironGeo, ironMat, defTotal);
      defWood = new THREE.InstancedMesh(fleshWoodGeo, woodSkinMat, defTotal);

      for (const m of [atkBodies, atkIrons, atkWood, defBodies, defIrons, defWood]) {
        m.castShadow = true;
        m.frustumCulled = false;
        world.add(m);
      }

      const buildSlots = (count: number, side: 'atk' | 'def', lossRatio: number, target: SoldierSlot[]) => {
        const rows = 8;
        const casualties = Math.round(count * lossRatio);
        for (let i = 0; i < count; i++) {
          const isFlank = side === 'atk' && scene.mode === 'pincer' && i >= Math.floor(count * 0.68);
          const r = i % rows;
          const col = Math.floor(i / rows);
          const jitterX = Math.sin(i * 12.9898) * 0.32;
          const jitterZ = Math.cos(i * 78.233) * 0.28;
          let startX: number;
          let startZ: number;
          let clashX: number;
          let clashZ: number;
          if (isFlank) {
            const fc = i - Math.floor(count * 0.68);
            startX = -2.5 + (fc % 4) * 1.35 + jitterX;
            startZ = -12.5 - Math.floor(fc / 4) * 1.4 + jitterZ;
            clashX = 1.2 + (fc % 4) * 1.05 + jitterX * 0.5;
            clashZ = -4.2 - Math.floor(fc / 4) * 1.1;
          } else if (side === 'atk') {
            startX = -15.2 - col * 1.55 + jitterX;
            startZ = -5.6 + r * 1.62 + jitterZ;
            clashX = -1.35 - col * 1.18 + jitterX * 0.4;
            clashZ = -5.2 + r * 1.5 + jitterZ * 0.5;
          } else {
            const baseDef = isFortress ? 9.6 : 13.8;
            const clashDef = isFortress ? 4.2 : 1.35;
            startX = baseDef + col * 1.5 + jitterX;
            startZ = -5.6 + r * 1.62 + jitterZ;
            clashX = clashDef + col * 1.18 + jitterX * 0.4;
            clashZ = -5.2 + r * 1.5 + jitterZ * 0.5;
          }
          // Deterministic shuffle so casualties fall organically across front & middle ranks
          const order = ((i * 19 + 7) % count) / Math.max(1, count);
          const willFall = order < casualties / Math.max(1, count);
          const fallAt = willFall ? 0.28 + (order / Math.max(0.05, casualties / count)) * 0.52 : 9;
          target.push({
            startX,
            startZ,
            clashX,
            clashZ,
            phase: (i * 1.73) % (Math.PI * 2),
            fallAt,
            flank: isFlank,
          });
        }
      };
      buildSlots(atkTotal, 'atk', atkLossRatio, atkSlots);
      buildSlots(defTotal, 'def', defLossRatio, defSlots);
    } else {
      // --- 3D Lou-Chuan & Paddlewheel Steam Warships on the Yangtze!
      const hullMat = bag.add(new THREE.MeshStandardMaterial({ color: '#3b2516', roughness: 0.78 }));
      const deckMat = bag.add(new THREE.MeshStandardMaterial({ color: '#5b3b22', roughness: 0.82 }));
      const roofMat = bag.add(new THREE.MeshStandardMaterial({ color: '#24282e', roughness: 0.7 }));
      const bronzeMat = bag.add(new THREE.MeshStandardMaterial({ color: '#c89b42', metalness: 0.82, roughness: 0.34 }));
      const ironMat = bag.add(new THREE.MeshStandardMaterial({ color: '#3b4048', metalness: 0.78, roughness: 0.4 }));
      const wakeMat = bag.add(
        new THREE.MeshBasicMaterial({
          color: '#e5f8f4',
          transparent: true,
          opacity: 0.52,
          depthWrite: false,
        })
      );
      const shipLanternMat = bag.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.35, 0.45) }));
      const shipLanternGeo = bag.add(new THREE.SphereGeometry(0.16, 8, 6));

      const buildFleet = (side: 'atk' | 'def', count: number, pal: typeof atkPal, lossRatio: number) => {
        const useSteam = side === 'atk' && scene.hasSteamship;
        const sailMat = bag.add(
          new THREE.MeshStandardMaterial({
            map: createSilkBannerTexture(pal.banner, pal.bg, pal.trim, bag),
            side: THREE.DoubleSide,
            roughness: 0.78,
          })
        );
        const hullGeo = bag.add(new THREE.BoxGeometry(4.4, 0.72, 1.38));
        const prowGeo = bag.add(new THREE.ConeGeometry(0.72, 1.35, 4));
        const cabinGeo = bag.add(new THREE.BoxGeometry(2.2, 0.95, 1.08));
        const upperGeo = bag.add(new THREE.BoxGeometry(1.4, 0.78, 0.86));
        const roofGeo = bag.add(new THREE.ConeGeometry(1.35, 0.55, 4));
        const oarGeo = bag.add(new THREE.BoxGeometry(0.05, 0.05, 1.35));

        for (let i = 0; i < count; i++) {
          const rig = new THREE.Group();
          const dir = side === 'atk' ? 1 : -1;

          const hull = new THREE.Mesh(hullGeo, hullMat);
          hull.position.y = 0.24;
          hull.castShadow = true;
          rig.add(hull);

          const prow = new THREE.Mesh(prowGeo, hullMat);
          prow.rotation.z = -dir * Math.PI * 0.5;
          prow.rotation.y = Math.PI * 0.25;
          prow.position.set(dir * 2.65, 0.34, 0);
          rig.add(prow);

          const ram = new THREE.Mesh(bag.add(new THREE.ConeGeometry(0.22, 0.65, 6)), bronzeMat);
          ram.rotation.z = -dir * Math.PI * 0.5;
          ram.position.set(dir * 3.15, 0.14, 0);
          rig.add(ram);

          const cabin = new THREE.Mesh(cabinGeo, deckMat);
          cabin.position.set(-dir * 0.2, 0.98, 0);
          cabin.castShadow = true;
          rig.add(cabin);

          const upper = new THREE.Mesh(upperGeo, bag.add(new THREE.MeshStandardMaterial({ color: pal.bg, roughness: 0.65 })));
          upper.position.set(-dir * 0.25, 1.78, 0);
          upper.castShadow = true;
          rig.add(upper);

          const roof = new THREE.Mesh(roofGeo, roofMat);
          roof.rotation.y = Math.PI * 0.25;
          roof.scale.set(1.25, 1, 0.82);
          roof.position.set(-dir * 0.25, 2.42, 0);
          rig.add(roof);

          // Warm silk war-lanterns at prow & upper watchtower
          const prowLantern = new THREE.Mesh(shipLanternGeo, shipLanternMat);
          prowLantern.position.set(dir * 2.45, 0.88, 0);
          const towerLantern = new THREE.Mesh(shipLanternGeo, shipLanternMat);
          towerLantern.position.set(-dir * 0.92, 2.15, 0);
          rig.add(prowLantern, towerLantern);

          let wheel: THREE.Mesh | undefined;
          if (useSteam) {
            const stack = new THREE.Mesh(bag.add(new THREE.CylinderGeometry(0.16, 0.2, 1.55, 10)), ironMat);
            stack.position.set(dir * 0.85, 1.85, 0);
            rig.add(stack);
            wheel = new THREE.Mesh(bag.add(new THREE.CylinderGeometry(0.62, 0.62, 1.66, 12)), bronzeMat);
            wheel.rotation.x = Math.PI * 0.5;
            wheel.position.set(0.1, 0.32, 0);
            rig.add(wheel);
          } else {
            const mast = new THREE.Mesh(bag.add(new THREE.CylinderGeometry(0.05, 0.07, 3.4, 8)), deckMat);
            mast.position.set(dir * 0.85, 2.1, 0);
            const sail = new THREE.Mesh(bag.add(new THREE.PlaneGeometry(1.15, 1.85)), sailMat);
            sail.position.set(dir * 0.92, 2.35, 0);
            sail.rotation.y = dir > 0 ? 0.35 : -0.35;
            rig.add(mast, sail);
          }

          const oars: THREE.Group[] = [];
          for (let o = -1.4; o <= 1.4; o += 0.7) {
            const oarPivot = new THREE.Group();
            oarPivot.position.set(o, 0.35, 0);
            const oarL = new THREE.Mesh(oarGeo, deckMat);
            oarL.position.set(0, -0.15, 0.95);
            oarL.rotation.x = 0.35;
            const oarR = new THREE.Mesh(oarGeo, deckMat);
            oarR.position.set(0, -0.15, -0.95);
            oarR.rotation.x = -0.35;
            oarPivot.add(oarL, oarR);
            rig.add(oarPivot);
            oars.push(oarPivot);
          }

          const wake = new THREE.Mesh(bag.add(new THREE.RingGeometry(0.7, 1.85, 18)), wakeMat);
          wake.rotation.x = -Math.PI * 0.5;
          wake.scale.set(1.9, 0.75, 1);
          wake.position.y = 0.05;
          world.add(wake);
          world.add(rig);

          const row = i % 3;
          const col = Math.floor(i / 3);
          const startX = side === 'atk' ? -13.5 - col * 5.4 : 13.5 + col * 5.4;
          const clashX = side === 'atk' ? -3.1 - col * 4.4 : 3.1 + col * 4.4;
          const startZ = -4.6 + row * 4.6 + (col % 2) * 1.1;
          const willSink = i >= Math.max(1, Math.round(count * (1 - lossRatio * 0.65)));
          ships.push({
            rig,
            oars,
            wheel,
            wake,
            startX,
            startZ,
            clashX,
            side,
            sinkAt: willSink ? 0.56 + (i / count) * 0.28 : 9,
            phase: i * 1.37,
          });
        }
      };

      const atkShips = Math.max(3, Math.round(6 * Math.max(0.5, scene.attackerStartTroops / maxTroops)));
      const defShips = Math.max(3, Math.round(6 * Math.max(0.5, scene.defenderStartTroops / maxTroops)));
      buildFleet('atk', atkShips, atkPal, atkLossRatio);
      buildFleet('def', defShips, defPal, defLossRatio);
    }

    // --- Instanced 3D Fire-Arrow Volleys
    const MAX_ARROWS = 56;
    const arrowShaftGeo = bag.add(
      mergeGeometries([
        part(new THREE.CylinderGeometry(0.018, 0.018, 0.95, 5), 0, 0, 0, 0, 0, Math.PI * 0.5),
        part(new THREE.ConeGeometry(0.048, 0.18, 5), 0.52, 0, 0, 0, 0, -Math.PI * 0.5),
      ])
    );
    const arrowMat = bag.add(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.6, 1.55, 0.55),
      })
    );
    const arrowMesh = new THREE.InstancedMesh(arrowShaftGeo, arrowMat, MAX_ARROWS);
    arrowMesh.frustumCulled = false;
    world.add(arrowMesh);

    const arrowSpecs = Array.from({ length: MAX_ARROWS }, (_, i) => {
      const fromAtk = i % 2 === 0;
      const wave = Math.floor(i / 14); // 4 waves across the battle
      const t0 = 0.45 + wave * 0.95 + (i % 14) * 0.035;
      const dur = 0.88 + (i % 5) * 0.06;
      const sx = fromAtk ? -11 + (i % 7) * 0.9 : 11 - (i % 7) * 0.9;
      const ex = fromAtk ? 2.2 + (i % 6) * 1.2 : -2.2 - (i % 6) * 1.2;
      const sz = -5.2 + ((i * 3.1) % 10.4);
      const ez = sz + ((i % 3) - 1) * 0.8;
      const peak = 4.2 + (i % 4) * 0.85;
      return { t0, dur, sx, ex, sz, ez, peak };
    });

    // --- Black Powder / Fire Bombardment Shells & Expanding Fireballs
    const hasBombs =
      scene.hasGunpowder || scene.mode === 'bombard' || scene.tactic === 'fire';
    const bombSpecs = hasBombs
      ? [
          { t0: 1.15, dur: 0.78, sx: -9.5, ex: 3.4, sz: -1.8, ez: -1.2, peak: 6.2 },
          { t0: 1.85, dur: 0.82, sx: -8.8, ex: isFortress ? 11.8 : 4.8, sz: 1.6, ez: 0.9, peak: 6.8 },
          { t0: 2.65, dur: 0.76, sx: -7.5, ex: 2.8, sz: -0.4, ez: 2.2, peak: 5.8 },
          { t0: 3.35, dur: 0.8, sx: -8.2, ex: isFortress ? 12.2 : 5.4, sz: 0.8, ez: -2.1, peak: 6.4 },
        ]
      : [];
    const bombGeo = bag.add(new THREE.SphereGeometry(0.24, 10, 8));
    const bombMat = bag.add(new THREE.MeshStandardMaterial({ color: '#231f1d', roughness: 0.6, metalness: 0.7 }));
    const blastGeo = bag.add(new THREE.SphereGeometry(1, 16, 12));
    const bombVisuals = bombSpecs.map(() => {
      const shell = new THREE.Mesh(bombGeo, bombMat);
      shell.visible = false;
      const blast = new THREE.Mesh(
        blastGeo,
        bag.add(
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(3.4, 1.35, 0.32),
            transparent: true,
            opacity: 0,
            depthWrite: false,
          })
        )
      );
      blast.visible = false;
      world.add(shell, blast);
      return { shell, blast };
    });

    // --- Battle Dust Plumes & Steel Clash Sparks (Billboard Sprites)
    const dustTex = createDustPuffTexture(bag);
    const flareTex = createImpactFlareTexture(bag);
    const dustSprites = Array.from({ length: 18 }, (_, i) => {
      const mat = bag.add(
        new THREE.SpriteMaterial({
          map: dustTex,
          color: isRiver ? '#cde5e2' : look.dust,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })
      );
      const sp = new THREE.Sprite(mat);
      world.add(sp);
      return { sp, mat, seed: i * 1.618 };
    });
    const clashSparks = Array.from({ length: 10 }, (_, i) => {
      const mat = bag.add(
        new THREE.SpriteMaterial({
          map: flareTex,
          color: '#ffd88a',
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const sp = new THREE.Sprite(mat);
      world.add(sp);
      return { sp, mat, seed: i * 2.399 };
    });

    // --- Resize handling
    const onResize = () => {
      if (!host) return;
      const w = Math.max(320, host.clientWidth);
      const h = Math.max(240, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    const dummy = new THREE.Object3D();
    const qDir = new THREE.Vector3();
    const xAxis = new THREE.Vector3(1, 0, 0);
    let rafId = 0;
    let prevElapsed = elapsedRef.current;

    const atkFrame: RiderFrameState = {
      x: -10,
      z: 0.4,
      yaw: 0,
      gait: 'gallop',
      gaitSpeed: 0.85,
      rearAngle: 0,
      bodyPitch: 0.08,
      pose: 'charge_windup',
      poseBlend: 0.8,
      trailIntensity: 0,
      trailColor: '#fbbf24',
      disarmed: false,
      fatigue: 0,
    };
    const defFrame: RiderFrameState = {
      x: 10,
      z: -0.4,
      yaw: Math.PI,
      gait: 'gallop',
      gaitSpeed: 0.85,
      rearAngle: 0,
      bodyPitch: 0.08,
      pose: 'charge_windup',
      poseBlend: 0.8,
      trailIntensity: 0,
      trailColor: '#f87171',
      disarmed: false,
      fatigue: 0,
    };

    const renderFrame = () => {
      const t = elapsedRef.current;
      const dt = Math.max(1 / 240, Math.min(0.05, Math.abs(t - prevElapsed) || 1 / 60));
      prevElapsed = t;
      const progress = Math.min(1, Math.max(0, t / 5.4));
      const chargeT = Math.min(1, t / 1.85);
      const chargeEase = 1 - Math.pow(1 - chargeT, 2.2);
      const inMelee = t >= 1.55 && t < 4.25;
      const isClimax = t >= 4.25;

      // 1. Water undulation on River maps
      if (waterGeo && waterBase && !reducedMotion) {
        const pos = waterGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < pos.length; i += 3) {
          const wx = waterBase[i];
          const wz = waterBase[i + 2];
          pos[i + 1] =
            Math.sin(wx * 0.42 + t * 2.1) * 0.09 + Math.cos(wz * 0.55 - t * 1.6) * 0.07;
        }
        waterGeo.attributes.position.needsUpdate = true;
      }

      // 2. Silk banner cloth flutter
      if (!reducedMotion) {
        for (const b of banners) {
          const pos = b.mesh.geometry.attributes.position.array as Float32Array;
          for (let i = 0; i < pos.length; i += 3) {
            const bx = b.base[i];
            const by = b.base[i + 1];
            const u = (bx + 0.65) / 1.3;
            pos[i + 2] = b.base[i + 2] + Math.sin(t * 7.5 + u * 4.2 + by * 1.8 + b.phase) * 0.12 * u;
          }
          b.mesh.geometry.attributes.position.needsUpdate = true;
        }
      }

      // 3. Recon Balloon drift
      if (balloonGroup) {
        balloonGroup.position.x = -12 + progress * 5.5;
        balloonGroup.position.y = 11.2 + Math.sin(t * 1.4) * 0.35;
      }

      // 4. Mounted Commanders & Instanced Soldiers (Land) OR Warship Fleets (River)
      if (!isRiver) {
        if (atkRig && defRig) {
          const atkRetreat = isClimax && !scene.attackerWon ? (t - 4.25) * 4.5 : 0;
          const defRetreat = isClimax && scene.attackerWon ? (t - 4.25) * 4.5 : 0;

          atkFrame.x = -10.5 + chargeEase * 9.35 - atkRetreat;
          atkFrame.z = 0.45;
          atkFrame.yaw = atkRetreat > 0 ? Math.PI : 0;
          atkFrame.gait = isClimax && scene.attackerWon ? 'rear' : inMelee && atkRetreat === 0 ? 'trot' : 'gallop';
          atkFrame.rearAngle = isClimax && scene.attackerWon ? Math.min(0.62, (t - 4.25) * 1.1) : 0;
          atkFrame.pose =
            isClimax && scene.attackerWon
              ? 'victory_raise'
              : inMelee
                ? Math.sin(t * 7) > 0
                  ? 'slash_overhead'
                  : 'thrust'
                : 'charge_windup';
          atkFrame.poseBlend = inMelee ? (t * 2.2) % 1 : 0.85;
          applyRigPose3D(atkRig, atkFrame, dt, t);

          const defStart = isFortress ? 8.2 : 10.5;
          const defClash = isFortress ? 2.4 : 1.15;
          defFrame.x = defStart + (defClash - defStart) * chargeEase + defRetreat;
          defFrame.z = -0.45;
          defFrame.yaw = defRetreat > 0 ? 0 : Math.PI;
          defFrame.gait = isClimax && !scene.attackerWon ? 'rear' : inMelee && defRetreat === 0 ? 'trot' : 'gallop';
          defFrame.rearAngle = isClimax && !scene.attackerWon ? Math.min(0.62, (t - 4.25) * 1.1) : 0;
          defFrame.pose =
            isClimax && !scene.attackerWon
              ? 'victory_raise'
              : inMelee
                ? Math.cos(t * 6.5) > 0
                  ? 'slash_sweep'
                  : 'guard_parry'
                : 'charge_windup';
          defFrame.poseBlend = inMelee ? (t * 2.0 + 0.35) % 1 : 0.85;
          applyRigPose3D(defRig, defFrame, dt, t);
        }

        const updateArmy = (
          slots: SoldierSlot[],
          side: 'atk' | 'def',
          bodies: THREE.InstancedMesh | null,
          irons: THREE.InstancedMesh | null,
          woods: THREE.InstancedMesh | null
        ) => {
          if (!bodies || !irons || !woods) return;
          const lostBattle = side === 'atk' ? !scene.attackerWon : scene.attackerWon;
          const retreatDist = isClimax && lostBattle ? (t - 4.25) * 4.8 : 0;

          for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            const fallenProg = progress - s.fallAt;
            const xBase = s.startX + (s.clashX - s.startX) * chargeEase;
            const zBase = s.startZ + (s.clashZ - s.startZ) * chargeEase;

            if (fallenProg > 0) {
              const fallK = Math.min(1, fallenProg * 6);
              dummy.position.set(xBase, -fallK * 0.12, zBase);
              const dir = side === 'atk' ? 1 : -1;
              dummy.rotation.set(0, dir > 0 ? 0 : Math.PI, dir * fallK * (Math.PI * 0.47));
              dummy.scale.setScalar(0.95);
            } else {
              const lunge =
                inMelee && retreatDist === 0 ? Math.sin(t * 9.5 + s.phase) * 0.28 : 0;
              const strideBob =
                !reducedMotion && (!inMelee || retreatDist > 0)
                  ? Math.abs(Math.sin(t * 11 + s.phase)) * 0.11
                  : Math.abs(Math.sin(t * 6 + s.phase)) * 0.04;
              const rx =
                side === 'atk'
                  ? xBase + lunge - retreatDist
                  : xBase - lunge + retreatDist;
              const rz = zBase + (s.flank && retreatDist > 0 ? -retreatDist * 0.5 : 0);
              dummy.position.set(rx, strideBob, rz);
              let yaw = side === 'atk' ? 0 : Math.PI;
              if (s.flank && chargeT < 0.92) yaw = -Math.PI * 0.36;
              if (retreatDist > 0) yaw = side === 'atk' ? Math.PI : 0;
              dummy.rotation.set(0, yaw, 0);
              dummy.scale.setScalar(1);
            }
            dummy.updateMatrix();
            bodies.setMatrixAt(i, dummy.matrix);
            irons.setMatrixAt(i, dummy.matrix);
            woods.setMatrixAt(i, dummy.matrix);
          }
          bodies.instanceMatrix.needsUpdate = true;
          irons.instanceMatrix.needsUpdate = true;
          woods.instanceMatrix.needsUpdate = true;
        };

        updateArmy(atkSlots, 'atk', atkBodies, atkIrons, atkWood);
        updateArmy(defSlots, 'def', defBodies, defIrons, defWood);
      } else {
        for (const ship of ships) {
          const lost = ship.side === 'atk' ? !scene.attackerWon : scene.attackerWon;
          const retreat = isClimax && lost ? (t - 4.25) * 3.2 : 0;
          const x =
            ship.startX +
            (ship.clashX - ship.startX) * chargeEase +
            (ship.side === 'atk' ? -retreat : retreat);
          const sinkK = progress > ship.sinkAt ? Math.min(1, (progress - ship.sinkAt) * 4.5) : 0;
          const bob = Math.sin(t * 2.4 + ship.phase) * 0.08;
          ship.rig.position.set(x, bob - sinkK * 1.15, ship.startZ);
          ship.rig.rotation.z =
            Math.sin(t * 1.9 + ship.phase) * 0.04 + sinkK * (ship.side === 'atk' ? -0.32 : 0.32);
          ship.rig.rotation.x = sinkK * 0.18;
          ship.wake.position.set(x - (ship.side === 'atk' ? 0.6 : -0.6), 0.05, ship.startZ);
          ship.wake.visible = sinkK < 0.7;
          if (!reducedMotion) {
            for (let oi = 0; oi < ship.oars.length; oi++) {
              ship.oars[oi].rotation.y = Math.sin(t * 5.2 + oi * 0.6 + ship.phase) * 0.36;
            }
            if (ship.wheel) ship.wheel.rotation.z = -t * 5.5;
          }
        }
      }

      // 5. Parabolic 3D Fire-Arrows
      for (let i = 0; i < MAX_ARROWS; i++) {
        const a = arrowSpecs[i];
        const u = (t - a.t0) / a.dur;
        if (u <= 0 || u >= 1) {
          dummy.position.set(0, -50, 0);
          dummy.scale.setScalar(0.001);
          dummy.updateMatrix();
          arrowMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const ax = a.sx + (a.ex - a.sx) * u;
        const az = a.sz + (a.ez - a.sz) * u;
        const ay = 1.45 + 4 * a.peak * u * (1 - u);
        const vx = (a.ex - a.sx) / a.dur;
        const vz = (a.ez - a.sz) / a.dur;
        const vy = (4 * a.peak * (1 - 2 * u)) / a.dur;
        qDir.set(vx, vy, vz).normalize();
        dummy.position.set(ax, ay, az);
        dummy.quaternion.setFromUnitVectors(xAxis, qDir);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        arrowMesh.setMatrixAt(i, dummy.matrix);
      }
      arrowMesh.instanceMatrix.needsUpdate = true;

      // 6. Black Powder / Fire Shells & Shockwave Blasts
      let maxBlastFlash = 0;
      let camShake = 0;
      for (let i = 0; i < bombSpecs.length; i++) {
        const b = bombSpecs[i];
        const vis = bombVisuals[i];
        const u = (t - b.t0) / b.dur;
        if (u > 0 && u < 1) {
          vis.shell.visible = true;
          vis.shell.position.set(
            b.sx + (b.ex - b.sx) * u,
            1.6 + 4 * b.peak * u * (1 - u),
            b.sz + (b.ez - b.sz) * u
          );
          vis.blast.visible = false;
        } else {
          vis.shell.visible = false;
          const after = t - (b.t0 + b.dur);
          if (after >= 0 && after < 0.65) {
            const k = after / 0.65;
            vis.blast.visible = true;
            vis.blast.position.set(b.ex, 1.35 + k * 0.9, b.ez);
            vis.blast.scale.setScalar(0.6 + k * 3.4);
            (vis.blast.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.85;
            const flash = (1 - k) * 34;
            if (flash > maxBlastFlash) {
              maxBlastFlash = flash;
              blastLight.position.set(b.ex, 3.0, b.ez);
            }
            camShake = Math.max(camShake, (1 - k) * 0.22);
          } else {
            vis.blast.visible = false;
          }
        }
      }
      blastLight.intensity = maxBlastFlash;

      // 7. Battle Dust Plumes & Melee Steel Sparks
      for (let i = 0; i < dustSprites.length; i++) {
        const d = dustSprites[i];
        const cycle = (t * 0.85 + d.seed) % 1;
        const activeBand = Math.min(1, chargeT * 1.2);
        const spread = 11 * (1 - chargeEase * 0.62);
        const sideSign = i % 2 === 0 ? -1 : 1;
        const dx = sideSign * spread + Math.sin(d.seed * 7) * 3.5;
        const dz = -4.8 + ((i * 1.9) % 9.6);
        d.sp.position.set(dx + cycle * 0.8, 0.55 + cycle * 1.65, dz);
        const s = 1.6 + cycle * 2.8;
        d.sp.scale.set(s, s * 0.75, 1);
        d.mat.opacity = Math.sin(cycle * Math.PI) * 0.28 * activeBand;
      }

      for (let i = 0; i < clashSparks.length; i++) {
        const spk = clashSparks[i];
        if (!inMelee) {
          spk.mat.opacity = 0;
          continue;
        }
        const cycle = (t * 3.8 + spk.seed) % 1;
        const cx = (isFortress && !isRiver ? 2.1 : 0) + Math.sin(spk.seed * 13 + Math.floor(t * 3.8)) * 2.4;
        const cz = -4.4 + ((i * 2.1 + Math.floor(t * 2)) % 8.8);
        spk.sp.position.set(cx, 1.35 + Math.sin(cycle * Math.PI) * 0.55, cz);
        const sc = 0.65 + (1 - cycle) * 1.15;
        spk.sp.scale.set(sc, sc, 1);
        spk.mat.opacity = Math.pow(1 - cycle, 2) * 0.85;
      }

      // 8. Sweeping Cinematic Camera Choreography
      if (!reducedMotion) {
        const camX = -4.2 + progress * 7.6 + Math.sin(t * 29) * camShake;
        const camY = (isRiver ? 5.6 : 4.6) - Math.sin(progress * Math.PI) * 1.15 + Math.cos(t * 33) * camShake;
        const camZ = (isRiver ? 17.8 : 15.8) - Math.sin(progress * Math.PI) * 2.8;
        camera.position.set(camX, camY, camZ);
        const lookX = isFortress && !isRiver ? 1.8 * chargeEase : 0.4 * (progress - 0.5);
        camera.lookAt(lookX, isRiver ? 1.35 : 1.75, -0.6);
      } else {
        camera.position.set(0, 5.0, 16.5);
        camera.lookAt(0, 1.7, -0.5);
      }

      renderer.render(world, camera);
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      bag.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [scene, elapsedRef, onFallback]);

  return <div ref={mountRef} className="absolute inset-0 w-full h-full" />;
}
