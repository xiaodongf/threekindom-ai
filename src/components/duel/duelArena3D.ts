import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FactionId, General, TerrainType } from '../../game/types.js';
import type { DisposeBag } from './duelGeometry3D.js';
import {
  createGroundDetailTextures,
  createPaintedPanoramaTexture,
  createSilkBannerTexture,
  createSkyDomeTexture,
} from './duelTextures3D.js';

/** Art direction for one battlefield: backdrop painting, light rig and atmosphere. */
export interface ArenaLook {
  panoUrl: string;
  /** Vertical slice of the painting wrapped around the horizon (0 = bottom, 1 = top) */
  band: [number, number];
  /** Where the painted horizon sits inside that slice, measured from its bottom */
  horizon: number;
  skyStops: string[];
  fog: string;
  fogDensity: number;
  groundInner: string;
  groundOuter: string;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fillColor: string;
  fillIntensity: number;
  exposure: number;
  dust: string;
  ember: string;
  torches: boolean;
}

export function getArenaLook(terrain: TerrainType, isNight: boolean): ArenaLook {
  if (isNight) {
    return {
      panoUrl: '/art/bg_night_raid.jpg',
      band: [0.3, 1],
      horizon: 0.4,
      skyStops: ['#060912', '#0e1626', '#1b2538'],
      fog: '#1a2233',
      fogDensity: 0.017,
      groundInner: '#4a4a44',
      groundOuter: '#1c2430',
      sunColor: '#a9c6ff',
      sunIntensity: 2.4,
      sunPos: [-8, 12, -10],
      hemiSky: '#5f78aa',
      hemiGround: '#1a1612',
      hemiIntensity: 0.75,
      fillColor: '#ffb070',
      fillIntensity: 1.0,
      exposure: 1.18,
      dust: '#8f8a80',
      ember: '#ff9a3c',
      torches: true,
    };
  }
  if (terrain === 'mountain') {
    return {
      panoUrl: '/art/bg_mountain_pass.jpg',
      band: [0.3, 1],
      horizon: 0.3,
      skyStops: ['#5d6b7c', '#8794a0', '#aab4bd'],
      fog: '#9aa7ad',
      fogDensity: 0.013,
      groundInner: '#857c68',
      groundOuter: '#8f9a98',
      sunColor: '#ffe2b8',
      sunIntensity: 2.7,
      sunPos: [10, 11, -12],
      hemiSky: '#dfe9f2',
      hemiGround: '#4c4a3c',
      hemiIntensity: 1.0,
      fillColor: '#f2f0ea',
      fillIntensity: 0.9,
      exposure: 1.0,
      dust: '#cbc4b2',
      ember: '#fff1d6',
      torches: false,
    };
  }
  if (terrain === 'river') {
    return {
      panoUrl: '/art/bg_yangtze_river.jpg',
      band: [0.36, 1],
      horizon: 0.22,
      skyStops: ['#150f18', '#3a1d22', '#6a3a30'],
      fog: '#5c3f3a',
      fogDensity: 0.013,
      groundInner: '#8a6f56',
      groundOuter: '#4a3836',
      sunColor: '#ff9152',
      sunIntensity: 3.1,
      sunPos: [-1, 5.5, -16],
      hemiSky: '#e9a37c',
      hemiGround: '#2c2622',
      hemiIntensity: 0.8,
      fillColor: '#ffd0b0',
      fillIntensity: 1.05,
      exposure: 1.1,
      dust: '#c9a98a',
      ember: '#ffb070',
      torches: false,
    };
  }
  return {
    panoUrl: '/art/bg_plains_siege.jpg',
    band: [0.38, 1],
    horizon: 0.274,
    skyStops: ['#2c1c14', '#5b3520', '#9a5c30'],
    fog: '#b98556',
    fogDensity: terrain === 'fortress' ? 0.014 : 0.012,
    groundInner: '#a8804f',
    groundOuter: '#b98556',
    sunColor: '#ffb066',
    sunIntensity: 3.3,
    sunPos: [-9, 7, -14],
    hemiSky: '#ffd9b0',
    hemiGround: '#5e3f25',
    hemiIntensity: 0.9,
    fillColor: '#ffe1c4',
    fillIntensity: 1.1,
    exposure: terrain === 'fortress' ? 0.98 : 1.05,
    dust: '#e2c49a',
    ember: '#ffd9a0',
    torches: terrain === 'fortress',
  };
}

export interface ArenaBanner3D {
  mesh: THREE.Mesh;
  basePositions: Float32Array;
  phase: number;
}

export interface DuelArena3D {
  group: THREE.Group;
  look: ArenaLook;
  banners: ArenaBanner3D[];
  brazierLights: THREE.PointLight[];
  brazierFlames: THREE.Mesh[];
  spectators: { left: THREE.Group; right: THREE.Group };
}

const FACTION_HEX: Record<FactionId, { bg: string; trim: string }> = {
  wei: { bg: '#1d4ed8', trim: '#f0c45c' },
  shu: { bg: '#047857', trim: '#facc15' },
  wu: { bg: '#be123c', trim: '#fbbf24' },
  neutral: { bg: '#57534e', trim: '#e5c158' },
};

const BACKDROP_RADIUS = 46;
const BACKDROP_ARC = 150 / 360;
const EYE_LINE = 3.0;

function part(
  geo: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rz = 0,
  scale: [number, number, number] = [1, 1, 1]
): THREE.BufferGeometry {
  const m = new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationZ(rz))
    .multiply(new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2]));
  geo.applyMatrix4(m);
  return geo;
}

/** Builds the battlefield: painted horizon, trampled ground, the two watching armies and their banners. */
export function buildDuelArena3D(
  attacker: General,
  defender: General,
  terrain: TerrainType,
  isNight: boolean,
  bag: DisposeBag
): DuelArena3D {
  const look = getArenaLook(terrain, isNight);
  const group = new THREE.Group();
  const banners: ArenaBanner3D[] = [];
  const brazierLights: THREE.PointLight[] = [];
  const brazierFlames: THREE.Mesh[] = [];

  // ------------------------------------------------------------ sky and painted horizon
  const skyTex = createSkyDomeTexture(look.skyStops, bag);
  const sky = new THREE.Mesh(
    bag.add(new THREE.SphereGeometry(80, 24, 16)),
    bag.add(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }))
  );
  sky.renderOrder = -2;
  group.add(sky);

  const bandHeight = look.band[1] - look.band[0];
  const arcLength = BACKDROP_RADIUS * Math.PI * 2 * BACKDROP_ARC;
  const paintingHeight = (arcLength * 768 * bandHeight) / 1376;
  const panoTex = createPaintedPanoramaTexture(look.panoUrl, look.band, BACKDROP_ARC, bag);
  const pano = new THREE.Mesh(
    bag.add(new THREE.CylinderGeometry(BACKDROP_RADIUS, BACKDROP_RADIUS, paintingHeight, 64, 1, true)),
    bag.add(
      new THREE.MeshBasicMaterial({
        map: panoTex,
        side: THREE.BackSide,
        fog: false,
        color: new THREE.Color(1.12, 1.12, 1.12),
      })
    )
  );
  // Seen from inside the cylinder the painting would read mirrored; flip it back.
  pano.scale.x = -1;
  pano.position.y = EYE_LINE - look.horizon * paintingHeight + paintingHeight * 0.5;
  pano.renderOrder = -1;
  group.add(pano);

  // ------------------------------------------------------------ ground
  const groundTex = createGroundDetailTextures(bag);
  const groundGeo = bag.add(new THREE.PlaneGeometry(150, 150, 60, 60));
  groundGeo.rotateX(-Math.PI * 0.5);
  const gPos = groundGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(gPos.count * 3);
  const inner = new THREE.Color(look.groundInner);
  const outer = new THREE.Color(look.groundOuter);
  const tmp = new THREE.Color();
  for (let i = 0; i < gPos.count; i++) {
    const r = Math.hypot(gPos.getX(i), gPos.getZ(i) * 1.15);
    const t = Math.min(1, Math.max(0, (r - 7) / 26));
    tmp.copy(inner).lerp(outer, t * t * (3 - 2 * t));
    // A lighter, well-trodden patch where the generals meet
    const worn = Math.max(0, 1 - r / 8.5);
    tmp.multiplyScalar(1 + worn * 0.14);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(
    groundGeo,
    bag.add(
      new THREE.MeshStandardMaterial({
        map: groundTex.map,
        bumpMap: groundTex.bumpMap,
        bumpScale: 2.2,
        vertexColors: true,
        roughness: 0.96,
        metalness: 0,
      })
    )
  );
  ground.receiveShadow = true;
  group.add(ground);

  // ------------------------------------------------------------ fortress wall, braziers
  const woodMat = bag.add(new THREE.MeshStandardMaterial({ color: '#4a2f1b', roughness: 0.9 }));
  if (terrain === 'fortress') {
    const wallMat = bag.add(new THREE.MeshStandardMaterial({ color: '#5a5046', roughness: 0.92 }));
    const wall = new THREE.Mesh(bag.add(new THREE.BoxGeometry(70, 6, 2.4)), wallMat);
    wall.position.set(0, 3, -21);
    wall.receiveShadow = true;
    group.add(wall);
    const merlonGeo = bag.add(new THREE.BoxGeometry(1.6, 1.2, 2.5));
    for (let mx = -33; mx <= 33; mx += 3) {
      const merlon = new THREE.Mesh(merlonGeo, wallMat);
      merlon.position.set(mx, 6.6, -21);
      group.add(merlon);
    }
  }

  if (look.torches) {
    const ironMat = bag.add(new THREE.MeshStandardMaterial({ color: '#262220', metalness: 0.7, roughness: 0.45 }));
    const flameMat = bag.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.7, 0.35) }));
    const coreMat = bag.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 1.4) }));
    const standGeo = bag.add(new THREE.CylinderGeometry(0.1, 0.24, 1.3, 8));
    const bowlGeo = bag.add(new THREE.CylinderGeometry(0.42, 0.22, 0.32, 10));
    const flameGeo = bag.add(new THREE.ConeGeometry(0.32, 0.95, 8));
    const coreGeo = bag.add(new THREE.ConeGeometry(0.15, 0.55, 7));
    const spots: Array<[number, number]> = [
      [-6.4, -5.2],
      [6.4, -5.2],
      [-10.5, -2.2],
      [10.5, -2.2],
    ];
    for (const [bx, bz] of spots) {
      const stand = new THREE.Mesh(standGeo, ironMat);
      stand.position.set(bx, 0.65, bz);
      stand.castShadow = true;
      const bowl = new THREE.Mesh(bowlGeo, ironMat);
      bowl.position.set(bx, 1.42, bz);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(bx, 1.98, bz);
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(bx, 1.82, bz);
      group.add(stand, bowl, flame, core);
      brazierFlames.push(flame);
      const light = new THREE.PointLight('#ff8a36', 26, 22, 1.8);
      light.position.set(bx, 2.5, bz + 0.3);
      group.add(light);
      brazierLights.push(light);
    }
  }

  // ------------------------------------------------------------ the two armies
  const leftSpectators = new THREE.Group();
  const rightSpectators = new THREE.Group();
  group.add(leftSpectators, rightSpectators);

  const atkPal = FACTION_HEX[attacker.faction] || FACTION_HEX.shu;
  const defPal = FACTION_HEX[defender.faction] || FACTION_HEX.wei;

  // A foot soldier, facing +X: armour in the faction colour, iron helm and greaves, spear and shield
  const bodyGeo = bag.add(
    mergeGeometries([
      part(new THREE.CylinderGeometry(0.19, 0.27, 0.44, 8), 0, 0.74, 0),
      part(new THREE.CylinderGeometry(0.24, 0.19, 0.5, 8), 0, 1.2, 0, 0, [0.8, 1, 1.12]),
      part(new THREE.SphereGeometry(0.13, 8, 6), 0, 1.4, 0.27),
      part(new THREE.SphereGeometry(0.13, 8, 6), 0, 1.4, -0.27),
      part(new THREE.CylinderGeometry(0.065, 0.055, 0.46, 6), 0.05, 1.14, 0.31, 0.15),
      part(new THREE.CylinderGeometry(0.065, 0.055, 0.46, 6), 0.08, 1.16, -0.31, 0.5),
      part(new THREE.BoxGeometry(0.05, 0.82, 0.48), 0.27, 0.98, 0.2, 0.06),
      part(new THREE.ConeGeometry(0.05, 0.26, 6), -0.03, 1.98, 0, 0.3),
    ])
  );
  const ironGeo = bag.add(
    mergeGeometries([
      part(new THREE.SphereGeometry(0.15, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), 0, 1.68, 0),
      part(new THREE.CylinderGeometry(0.165, 0.175, 0.03, 10), 0, 1.69, 0),
      part(new THREE.CylinderGeometry(0.085, 0.075, 0.54, 6), 0, 0.27, 0.11),
      part(new THREE.CylinderGeometry(0.085, 0.075, 0.54, 6), 0, 0.27, -0.11),
      part(new THREE.ConeGeometry(0.045, 0.42, 4), 0.2, 3.55, -0.3),
      part(new THREE.SphereGeometry(0.075, 6, 6), 0.3, 1.0, 0.2, 0, [0.5, 1, 1]),
    ])
  );
  const fleshWoodGeo = bag.add(
    mergeGeometries([
      part(new THREE.SphereGeometry(0.115, 8, 6), 0.015, 1.6, 0),
      part(new THREE.CylinderGeometry(0.02, 0.024, 3.35, 5), 0.2, 1.7, -0.3),
    ])
  );
  const ironMatArmy = bag.add(new THREE.MeshStandardMaterial({ color: '#6f7680', metalness: 0.85, roughness: 0.4 }));
  const fleshWoodMat = bag.add(new THREE.MeshStandardMaterial({ color: '#7a5236', roughness: 0.85 }));

  const dummy = new THREE.Object3D();
  const populate = (side: 'left' | 'right', target: THREE.Group, bgHex: string) => {
    const rows = 3;
    const perRow = 26;
    const count = rows * perRow;
    const armorMat = bag.add(new THREE.MeshStandardMaterial({ color: bgHex, roughness: 0.6, metalness: 0.3 }));
    const bodies = new THREE.InstancedMesh(bodyGeo, armorMat, count);
    const irons = new THREE.InstancedMesh(ironGeo, ironMatArmy, count);
    const rest = new THREE.InstancedMesh(fleshWoodGeo, fleshWoodMat, count);
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < perRow; i++) {
        const f = (i + (r % 2) * 0.5) / perRow;
        // The two armies close a ring around the duel: each wraps from the far side, past its
        // champion's flank, round toward the camera. Only the arc the camera stands in is left open.
        const ang =
          side === 'left' ? Math.PI * 0.52 + f * Math.PI * 0.78 : Math.PI * 0.48 - f * Math.PI * 0.78;
        const radius = 11.2 + r * 1.6 + Math.sin(i * 12.9898 + r * 4.1) * 0.25;
        const x = Math.cos(ang) * radius;
        const z = -Math.sin(ang) * radius * 0.86 + 0.8;
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, Math.atan2(-z, -x) * -1, 0);
        const sc = 1.02 + Math.sin(i * 7.3 + r) * 0.06;
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        bodies.setMatrixAt(n, dummy.matrix);
        irons.setMatrixAt(n, dummy.matrix);
        rest.setMatrixAt(n, dummy.matrix);
        n++;
      }
    }
    for (const mesh of [bodies, irons, rest]) {
      mesh.castShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      target.add(mesh);
    }
  };
  populate('left', leftSpectators, atkPal.bg);
  populate('right', rightSpectators, defPal.bg);

  // War drums flanking the field
  const drumSkin = bag.add(new THREE.MeshStandardMaterial({ color: '#d9c7a0', roughness: 0.8 }));
  const drumBody = bag.add(new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.55 }));
  const drumGeo = bag.add(new THREE.CylinderGeometry(0.75, 0.75, 0.6, 18));
  const skinGeo = bag.add(new THREE.CylinderGeometry(0.7, 0.7, 0.62, 18));
  const legGeo = bag.add(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 6));
  for (const sx of [-1, 1]) {
    const drum = new THREE.Group();
    const shell = new THREE.Mesh(drumGeo, drumBody);
    shell.rotation.x = Math.PI * 0.5;
    shell.castShadow = true;
    const skin = new THREE.Mesh(skinGeo, drumSkin);
    skin.rotation.x = Math.PI * 0.5;
    drum.add(shell, skin);
    drum.position.set(sx * 8.4, 1.55, -6.4);
    drum.rotation.y = sx * -0.5;
    group.add(drum);
    for (const lx of [-0.45, 0.45]) {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(sx * 8.4 + lx, 0.65, -6.4);
      leg.rotation.z = lx > 0 ? -0.2 : 0.2;
      leg.castShadow = true;
      group.add(leg);
    }
  }

  // ------------------------------------------------------------ war banners
  const factionChar = (f: FactionId) => (f === 'wei' ? '魏' : f === 'shu' ? '蜀' : f === 'wu' ? '吴' : '汉');
  const specs: Array<{ x: number; z: number; glyph: string; pal: { bg: string; trim: string }; dir: number }> = [
    { x: -9.6, z: -7.6, glyph: attacker.seal, pal: atkPal, dir: 1 },
    { x: -5.6, z: -9.6, glyph: factionChar(attacker.faction), pal: atkPal, dir: 1 },
    { x: -12.4, z: -4.0, glyph: factionChar(attacker.faction), pal: atkPal, dir: 1 },
    { x: 9.6, z: -7.6, glyph: defender.seal, pal: defPal, dir: -1 },
    { x: 5.6, z: -9.6, glyph: factionChar(defender.faction), pal: defPal, dir: -1 },
    { x: 12.4, z: -4.0, glyph: factionChar(defender.faction), pal: defPal, dir: -1 },
  ];
  const poleGeo = bag.add(new THREE.CylinderGeometry(0.06, 0.08, 7.4, 8));
  const barGeo = bag.add(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 6));
  const finialGeo = bag.add(new THREE.ConeGeometry(0.1, 0.4, 6));
  const goldMat = bag.add(new THREE.MeshStandardMaterial({ color: '#e5c158', metalness: 1, roughness: 0.3 }));
  specs.forEach((b, idx) => {
    const pole = new THREE.Mesh(poleGeo, woodMat);
    pole.position.set(b.x, 3.7, b.z);
    pole.castShadow = true;
    const finial = new THREE.Mesh(finialGeo, goldMat);
    finial.position.set(b.x, 7.6, b.z);
    const bar = new THREE.Mesh(barGeo, woodMat);
    bar.rotation.z = Math.PI * 0.5;
    bar.position.set(b.x + b.dir * 0.75, 7.0, b.z);
    group.add(pole, finial, bar);

    const clothGeo = bag.add(new THREE.PlaneGeometry(1.5, 3.2, 6, 12));
    const cloth = new THREE.Mesh(
      clothGeo,
      bag.add(
        new THREE.MeshStandardMaterial({
          map: createSilkBannerTexture(b.glyph, b.pal.bg, b.pal.trim, bag),
          side: THREE.DoubleSide,
          roughness: 0.75,
        })
      )
    );
    cloth.position.set(b.x + b.dir * 0.78, 5.4, b.z);
    cloth.castShadow = true;
    group.add(cloth);
    banners.push({
      mesh: cloth,
      basePositions: new Float32Array((clothGeo.attributes.position as THREE.BufferAttribute).array as Float32Array),
      phase: idx * 1.15,
    });
  });

  return { group, look, banners, brazierLights, brazierFlames, spectators: { left: leftSpectators, right: rightSpectators } };
}
