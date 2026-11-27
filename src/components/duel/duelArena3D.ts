import * as THREE from 'three';
import type { FactionId, General, TerrainType } from '../../game/types.js';
import { isMythLook } from '../../utils/artLook.js';
import { FACTION_CLOTH } from '../../utils/factionPalette.js';
import { SOLDIER_KITS, createFigureCrowd, figureTint, type FigureCrowd } from '../gfx/figures.js';
import { buildCamp, type Camp } from '../gfx/camp.js';
import { createWind, type Wind } from '../gfx/wind.js';
import { createFire, type Fire } from '../gfx/fire.js';
import { mergeRigid, type DisposeBag } from './duelGeometry3D.js';
import {
  createFortressWallTextures,
  createDustPuffTexture,
  createCoalBedTexture,
  createDrumSkinTexture,
  createGroundDetailTextures,
  createPaintedPanoramaTexture,
  createSilkBannerTexture,
  createSilkLanternTexture,
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
  /** Multiplies the painted backdrop: white leaves it as painted */
  panoTint: [number, number, number];
  /** How much ground mist hangs over the field, 0 to 1 */
  mist: number;
  /** Colour of that mist */
  mistColor: string;
  /** How far the rank and file's colours are pulled toward dark iron, 0 to 1 */
  armyIron: number;
}

type BaseLook = Omit<ArenaLook, 'panoTint' | 'mist' | 'mistColor' | 'armyIron'>;

/**
 * Dark mythic realism: the same battlefields under a heavy sky. Colour is drained from the
 * land and kept for fire, banners and gilt; a low gold or pale light rims the figures from
 * behind, cold light fills the shadows, and mist swallows the middle distance.
 */
function mythLook(base: BaseLook, terrain: TerrainType, isNight: boolean): ArenaLook {
  if (isNight) {
    return {
      ...base,
      skyStops: ['#030406', '#0a1018', '#1a2530'],
      fog: '#141c24',
      fogDensity: 0.03,
      groundInner: '#33342f',
      groundOuter: '#12171c',
      sunColor: '#b9cfe6',
      sunIntensity: 2.0,
      hemiSky: '#4d6480',
      hemiGround: '#0d0b09',
      hemiIntensity: 0.6,
      fillColor: '#ff9a52',
      fillIntensity: 0.9,
      exposure: 1.2,
      dust: '#6c7276',
      ember: '#ffa24a',
      torches: true,
      panoTint: [0.42, 0.4, 0.38],
      mist: 0.8,
      mistColor: '#5d7186',
      armyIron: 0.46,
    };
  }
  if (terrain === 'mountain') {
    return {
      ...base,
      skyStops: ['#0a0d10', '#272f35', '#69767a'],
      fog: '#465154',
      fogDensity: 0.03,
      groundInner: '#4a4a42',
      groundOuter: '#2a3134',
      sunColor: '#e8ead6',
      sunIntensity: 2.3,
      sunPos: [9, 8, -13],
      hemiSky: '#8a989d',
      hemiGround: '#14120e',
      hemiIntensity: 0.7,
      fillColor: '#9fb3bd',
      fillIntensity: 0.9,
      exposure: 1.15,
      dust: '#7f8683',
      ember: '#ffb060',
      torches: true,
      panoTint: [0.3, 0.33, 0.35],
      mist: 1,
      mistColor: '#93a09f',
      armyIron: 0.46,
    };
  }
  if (terrain === 'river') {
    return {
      ...base,
      skyStops: ['#040608', '#101a20', '#3a4c50'],
      fog: '#22302f',
      fogDensity: 0.026,
      groundInner: '#3a3a34',
      groundOuter: '#182022',
      sunColor: '#cfe0e2',
      sunIntensity: 2.4,
      sunPos: [-1, 6.5, -16],
      hemiSky: '#6d8790',
      hemiGround: '#0d1110',
      hemiIntensity: 0.66,
      fillColor: '#ffa468',
      fillIntensity: 0.95,
      exposure: 1.2,
      dust: '#8ea3a3',
      ember: '#ffa860',
      torches: false,
      panoTint: [0.34, 0.43, 0.47],
      mist: 0.9,
      mistColor: '#7f9896',
      armyIron: 0.42,
    };
  }
  return {
    ...base,
    skyStops: ['#060708', '#1b1d20', '#56412c'],
    fog: '#2d2b28',
    fogDensity: terrain === 'fortress' ? 0.03 : 0.027,
    groundInner: '#40382c',
    groundOuter: '#1b1a18',
    sunColor: '#ffb672',
    sunIntensity: 2.9,
    sunPos: [-9, 5.2, -14],
    hemiSky: '#6c7a85',
    hemiGround: '#110e0b',
    hemiIntensity: 0.68,
    fillColor: '#9db4c6',
    fillIntensity: 0.85,
    exposure: 1.18,
    dust: '#75706a',
    ember: '#ffae5a',
    torches: true,
    panoTint: [0.5, 0.45, 0.42],
    mist: 0.75,
    mistColor: '#8c8a84',
    armyIron: 0.46,
  };
}

export function getArenaLook(terrain: TerrainType, isNight: boolean): ArenaLook {
  const base = baseArenaLook(terrain, isNight);
  if (isMythLook()) return mythLook(base, terrain, isNight);
  return { ...base, panoTint: [1, 1, 1], mist: 0, mistColor: '#ffffff', armyIron: 0 };
}

function baseArenaLook(terrain: TerrainType, isNight: boolean): BaseLook {
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

/** The rank and file's faction colours sink toward this under the dark look */
export const DARK_IRON = new THREE.Color('#1c1e21');


export interface DuelArena3D {
  group: THREE.Group;
  look: ArenaLook;
  /** The field's wind; the stage advances it and strengthens it when the ranks roar */
  wind: Wind;
  /** The tents, racks and fires behind the ranks */
  camp: Camp;
  brazierLights: THREE.PointLight[];
  brazierFlames: THREE.Object3D[];
  /** The braziers' flames and embers (none where the field has no fires); the stage sets its clock */
  fire: Fire | null;
  /** The painted horizon, so the fog can take its colour from it */
  backdrop: { texture: THREE.Texture; horizonV: number; tint: THREE.Color; arc: number };
  spectators: { left: THREE.Group; right: THREE.Group };
  /** The watching ranks, for the stage to set their clock and their cheering */
  crowds: { left: FigureCrowd[]; right: FigureCrowd[] };
}

/** Cloth and trim for one realm's soldiers and banners */
const realmCloth = (faction: FactionId, fallback: FactionId): { bg: string; trim: string } => {
  const c = FACTION_CLOTH[faction] ?? FACTION_CLOTH[fallback];
  return { bg: c.cloth, trim: c.trim };
};

const BACKDROP_RADIUS = 46;
const BACKDROP_ARC = 150 / 360;
const EYE_LINE = 3.0;

/** Builds the battlefield: painted horizon, trampled ground, the two watching armies and their banners. */
export function buildDuelArena3D(
  attacker: General,
  defender: General,
  terrain: TerrainType,
  isNight: boolean,
  bag: DisposeBag,
  /** Multiplier on the size of the watching armies (the quality setting) */
  crowd = 1
): DuelArena3D {
  const look = getArenaLook(terrain, isNight);
  const group = new THREE.Group();
  const wind = bag.add(createWind(0.96, 0.28));
  const brazierLights: THREE.PointLight[] = [];
  const brazierFlames: THREE.Object3D[] = [];

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
  const panoTint = new THREE.Color(...look.panoTint).multiplyScalar(1.12);
  const pano = new THREE.Mesh(
    bag.add(new THREE.CylinderGeometry(BACKDROP_RADIUS, BACKDROP_RADIUS, paintingHeight, 64, 1, true)),
    bag.add(
      new THREE.MeshBasicMaterial({
        map: panoTex,
        side: THREE.BackSide,
        fog: false,
        color: panoTint,
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
    const brickTex = createFortressWallTextures(bag);
    const wallMat = bag.add(
      new THREE.MeshStandardMaterial({
        map: brickTex.map,
        bumpMap: brickTex.bumpMap,
        bumpScale: 1.6,
        roughness: 0.9,
      })
    );
    const wall = new THREE.Mesh(bag.add(new THREE.BoxGeometry(70, 6, 2.4)), wallMat);
    wall.position.set(0, 3, -21);
    wall.receiveShadow = true;
    group.add(wall);
    const merlonGeo = bag.add(new THREE.BoxGeometry(1.6, 1.2, 2.5));
    for (let mx = -33; mx <= 33; mx += 3) {
      if (Math.abs(mx) < 4.5) continue;
      const merlon = new THREE.Mesh(merlonGeo, wallMat);
      merlon.position.set(mx, 6.6, -21);
      group.add(merlon);
    }

    // Central Vermilion Gatehouse Tower & Glowing Silk Lanterns
    const redWood = bag.add(new THREE.MeshStandardMaterial({ color: '#7a2018', roughness: 0.65 }));
    const roofTile = bag.add(new THREE.MeshStandardMaterial({ color: '#262a30', roughness: 0.72 }));
    const archDark = bag.add(new THREE.MeshStandardMaterial({ color: '#16110d', roughness: 0.95 }));
    const arch = new THREE.Mesh(bag.add(new THREE.BoxGeometry(4.6, 3.8, 2.6)), archDark);
    arch.position.set(0, 1.9, -20.9);
    const gateHall = new THREE.Mesh(bag.add(new THREE.BoxGeometry(9.6, 2.8, 3.0)), redWood);
    gateHall.position.set(0, 7.4, -21);
    const gateRoof = new THREE.Mesh(bag.add(new THREE.ConeGeometry(7.8, 2.4, 4)), roofTile);
    gateRoof.rotation.y = Math.PI * 0.25;
    gateRoof.scale.set(1.05, 1, 0.56);
    gateRoof.position.set(0, 9.8, -21);
    group.add(arch, gateHall, gateRoof);

    // Silk lanterns lit from inside: red silk over ribs, dark caps, a tassel below. Bright enough
    // to glow, not so bright that bloom turns them into white discs.
    const lanternMat = bag.add(
      new THREE.MeshBasicMaterial({ map: createSilkLanternTexture(bag), color: new THREE.Color(1.35, 1.15, 1.05) })
    );
    const capMat = bag.add(new THREE.MeshStandardMaterial({ color: '#1d1512', roughness: 0.6 }));
    const lanternGeo = bag.add(new THREE.SphereGeometry(0.28, 16, 12));
    const capGeo = bag.add(new THREE.CylinderGeometry(0.13, 0.15, 0.07, 10));
    const lanternTasselGeo = bag.add(new THREE.ConeGeometry(0.05, 0.26, 6));
    lanternTasselGeo.rotateX(Math.PI);
    const tasselMat = bag.add(new THREE.MeshStandardMaterial({ color: '#7d1a12', roughness: 0.8 }));
    for (const lx of [-15, -9, -3.6, 3.6, 9, 15]) {
      const lan = new THREE.Mesh(lanternGeo, lanternMat);
      lan.scale.set(1, 1.18, 1);
      lan.position.set(lx, 5.7, -19.55);
      const top = new THREE.Mesh(capGeo, capMat);
      top.position.set(lx, 5.7 + 0.33, -19.55);
      const bottom = new THREE.Mesh(capGeo, capMat);
      bottom.position.set(lx, 5.7 - 0.33, -19.55);
      const tassel = new THREE.Mesh(lanternTasselGeo, tasselMat);
      tassel.position.set(lx, 5.7 - 0.5, -19.55);
      group.add(lan, top, bottom, tassel);
    }
  }

  let fire: Fire | null = null;
  if (look.torches) {
    fire = createFire(bag);
    const ironMat = bag.add(new THREE.MeshStandardMaterial({ color: '#262220', metalness: 0.7, roughness: 0.45 }));
    // The coals glow on their own; the bowl's rim catches the light from them
    const coalMat = bag.add(
      new THREE.MeshBasicMaterial({ map: createCoalBedTexture(bag), color: new THREE.Color(1.25, 1.1, 1.0) })
    );
    const standGeo = bag.add(new THREE.CylinderGeometry(0.1, 0.24, 1.3, 8));
    const bowlGeo = bag.add(new THREE.CylinderGeometry(0.42, 0.22, 0.32, 14));
    const rimGeo = bag.add(new THREE.TorusGeometry(0.42, 0.035, 6, 24));
    rimGeo.rotateX(Math.PI / 2);
    const coalGeo = bag.add(new THREE.CircleGeometry(0.39, 18));
    coalGeo.rotateX(-Math.PI / 2);
    const spots: Array<[number, number]> = [
      [-6.4, -5.2],
      [6.4, -5.2],
      [-10.5, -2.2],
      [10.5, -2.2],
    ];
    spots.forEach(([bx, bz], i) => {
      const stand = new THREE.Mesh(standGeo, ironMat);
      stand.position.set(bx, 0.65, bz);
      stand.castShadow = true;
      const bowl = new THREE.Mesh(bowlGeo, ironMat);
      bowl.position.set(bx, 1.42, bz);
      const rim = new THREE.Mesh(rimGeo, ironMat);
      rim.position.set(bx, 1.58, bz);
      const coals = new THREE.Mesh(coalGeo, coalMat);
      coals.position.set(bx, 1.535, bz);
      const flame = new THREE.Group();
      flame.position.set(bx, 1.52, bz);
      flame.add(fire!.flame(0.9, 1.4, i * 0.29 + 0.11));
      group.add(stand, bowl, rim, coals, flame);
      brazierFlames.push(flame);
      const light = new THREE.PointLight('#ff8a36', 26, 22, 1.8);
      light.position.set(bx, 2.5, bz + 0.3);
      group.add(light);
      brazierLights.push(light);
    });
    group.add(fire.embers(spots.map(([bx, bz]) => new THREE.Vector3(bx, 1.75, bz)), 16, 2.6));
  }

  // ------------------------------------------------------------ ground mist (dark look)
  if (look.mist > 0) {
    const mistTex = createDustPuffTexture(bag);
    for (let i = 0; i < 14; i++) {
      const ang = Math.PI * (0.08 + (i / 13) * 0.84);
      const radius = 13 + (i % 4) * 3.2;
      const mat = bag.add(
        new THREE.SpriteMaterial({
          map: mistTex,
          color: look.mistColor,
          transparent: true,
          opacity: (0.18 + (i % 3) * 0.05) * look.mist,
          depthWrite: false,
        })
      );
      const bank = new THREE.Sprite(mat);
      bank.position.set(Math.cos(ang) * radius * 1.25, 1.0 + (i % 3) * 0.6, -Math.sin(ang) * radius);
      const size = 10 + (i % 5) * 2.2;
      bank.scale.set(size * 1.9, size * 0.5, 1);
      group.add(bank);
    }
  }

  // ------------------------------------------------------------ the two armies
  const leftSpectators = new THREE.Group();
  const rightSpectators = new THREE.Group();
  group.add(leftSpectators, rightSpectators);

  const atkPal = realmCloth(attacker.faction, 'shu');
  const defPal = realmCloth(defender.faction, 'wei');

  // The watching ranks are drawn with the shared figure kit: three kits mixed through each
  // army, every man with his own coat, height, stance and place in the idle sway.
  const crowds: { left: FigureCrowd[]; right: FigureCrowd[] } = { left: [], right: [] };
  const tint = new THREE.Color();
  const populate = (side: 'left' | 'right', target: THREE.Group, bgHex: string) => {
    const rows = 3;
    const perRow = Math.max(12, Math.round(26 * crowd));
    // The ring's colours are muted toward grey, so the realm reads but the heroes' colours lead
    const realm = new THREE.Color(bgHex);
    const grey = realm.r * 0.3 + realm.g * 0.59 + realm.b * 0.11;
    realm.lerp(new THREE.Color(grey, grey, grey), 0.3);
    const men: Array<{ x: number; z: number; yaw: number; size: number; seed: number; kit: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < perRow; i++) {
        // Shoulder to shoulder, but not on a surveyor's line: each man is a little off his mark
        const jitter = Math.sin(i * 47.13 + r * 9.7 + (side === 'left' ? 0 : 3.1)) * 0.3;
        const f = (i + (r % 2) * 0.5 + jitter) / perRow;
        // The two armies close a ring around the duel: each wraps from the far side, past its
        // champion's flank, round toward the camera. Only the arc the camera stands in is left open.
        const ang =
          side === 'left' ? Math.PI * 0.52 + f * Math.PI * 0.78 : Math.PI * 0.48 - f * Math.PI * 0.78;
        const radius = 11.2 + r * 1.6 + Math.sin(i * 12.9898 + r * 4.1) * 0.25;
        const x = Math.cos(ang) * radius;
        const z = -Math.sin(ang) * radius * 0.86 + 0.8;
        const seed = Math.abs(Math.sin(i * 91.7 + r * 37.3 + (side === 'left' ? 1.7 : 5.3)) * 43758.5453) % 1;
        // Shield-and-spear men hold the front rank; ji and sabre men stand among those behind
        const kit = r === 0 ? 0 : seed < 0.5 ? 0 : seed < 0.78 ? 1 : 2;
        men.push({
          x,
          z,
          // Facing the duel, give or take a glance to either side
          yaw: Math.atan2(z, -x) + (seed - 0.5) * 0.3,
          size: 0.97 + seed * 0.1,
          seed,
          kit,
        });
      }
    }
    SOLDIER_KITS.forEach((kit, k) => {
      const group = men.filter((m) => m.kit === k);
      if (group.length === 0) return;
      const figures = bag.add(createFigureCrowd(kit, group.length));
      group.forEach((m, i) => {
        figures.place(i, m.x, 0, m.z, m.yaw);
        figures.pose(i, 0, 0, 0, m.size);
        figures.look(i, figureTint(tint, realm, DARK_IRON, look.armyIron, m.seed), m.seed);
      });
      figures.commit();
      figures.uniforms.uFigIron.value = look.armyIron;
      // The ring is the audience: kept well under the two champions in brightness, and every
      // man stands his own way instead of the whole ring copying one pose
      figures.uniforms.uFigValue.value = 0.7;
      figures.uniforms.uFigVariety.value = 1;
      target.add(figures.mesh);
      crowds[side].push(figures);
    });
  };
  populate('left', leftSpectators, atkPal.bg);
  populate('right', rightSpectators, defPal.bg);

  const factionGlyph = (f: FactionId) => (FACTION_CLOTH[f] ?? FACTION_CLOTH.neutral).glyph;

  // ------------------------------------------------------------ war drums
  // Each army's drum stands on a wooden cradle by its braziers: a bellied barrel of red lacquer
  // with bronze hoops and side rings, hide heads nailed down with a row of studs and painted with
  // the army's character, and two sticks resting across the top.
  const lacquerMat = bag.add(new THREE.MeshStandardMaterial({ color: '#5a1912', roughness: 0.42, metalness: 0.04 }));
  const bronzeMat = bag.add(new THREE.MeshStandardMaterial({ color: '#8a6a34', roughness: 0.4, metalness: 0.85 }));
  const knobMat = bag.add(new THREE.MeshStandardMaterial({ color: '#6e1810', roughness: 0.85 }));
  const DRUM_HALF = 0.37;
  const barrelProfile: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    barrelProfile.push(new THREE.Vector2(0.64 + 0.1 * Math.sin(t * Math.PI), (t - 0.5) * DRUM_HALF * 2));
  }
  const barrelGeo = bag.add(new THREE.LatheGeometry(barrelProfile, 32));
  barrelGeo.rotateX(Math.PI / 2);
  const drumHeadGeo = bag.add(new THREE.CircleGeometry(0.645, 40));
  const hoopGeo = bag.add(new THREE.TorusGeometry(0.652, 0.024, 6, 40));
  const studGeo = bag.add(new THREE.SphereGeometry(0.019, 6, 4));
  const sideRingGeo = bag.add(new THREE.TorusGeometry(0.075, 0.013, 5, 14));
  sideRingGeo.rotateY(Math.PI / 2);
  const legGeo = bag.add(new THREE.CylinderGeometry(0.04, 0.05, 1, 6));
  const stickGeo = bag.add(new THREE.CylinderGeometry(0.016, 0.02, 0.52, 6));
  const knobGeo = bag.add(new THREE.SphereGeometry(0.045, 8, 6));
  /** A wooden member running between two points of the cradle */
  const beam = (parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void => {
    const m = new THREE.Mesh(legGeo, woodMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.scale.y = a.distanceTo(b);
    m.castShadow = true;
    parent.add(m);
  };
  const STUDS = 36;
  const studMatrix = new THREE.Matrix4();
  for (const sx of [-1, 1]) {
    const drum = new THREE.Group();
    drum.position.set(sx * 8.4, 1.55, -6.4);
    drum.rotation.y = sx * -0.5;
    group.add(drum);

    const barrel = new THREE.Mesh(barrelGeo, lacquerMat);
    barrel.castShadow = true;
    drum.add(barrel);
    const glyph = factionGlyph(sx < 0 ? attacker.faction : defender.faction);
    const skinMat = bag.add(
      new THREE.MeshStandardMaterial({ map: createDrumSkinTexture(glyph, bag), color: '#a39b90', roughness: 0.9 })
    );
    const studs = new THREE.InstancedMesh(studGeo, bronzeMat, STUDS * 2);
    studs.userData.keep = true;
    for (const face of [1, -1]) {
      const head = new THREE.Mesh(drumHeadGeo, skinMat);
      head.position.z = face * DRUM_HALF;
      if (face < 0) head.rotation.y = Math.PI;
      const hoop = new THREE.Mesh(hoopGeo, bronzeMat);
      hoop.position.z = face * (DRUM_HALF - 0.005);
      drum.add(head, hoop);
      for (let k = 0; k < STUDS; k++) {
        const a = (k / STUDS) * Math.PI * 2;
        studMatrix.makeTranslation(Math.cos(a) * 0.668, Math.sin(a) * 0.668, face * (DRUM_HALF - 0.055));
        studs.setMatrixAt((face > 0 ? 0 : STUDS) + k, studMatrix);
      }
    }
    drum.add(studs);
    for (const rx of [-1, 1]) {
      const ring = new THREE.Mesh(sideRingGeo, bronzeMat);
      ring.position.set(rx * 0.745, -0.06, 0);
      drum.add(ring);
    }

    // Cradle: four splayed legs, two rails under the barrel, a stretcher at each end
    const footY = -1.55;
    const railY = -0.63;
    for (const lx of [-1, 1]) {
      for (const lz of [-1, 1]) {
        beam(drum, new THREE.Vector3(lx * 0.56, footY, lz * 0.4), new THREE.Vector3(lx * 0.42, railY, lz * 0.3));
      }
      beam(drum, new THREE.Vector3(lx * 0.42, railY, -0.38), new THREE.Vector3(lx * 0.42, railY, 0.38));
    }
    for (const lz of [-1, 1]) {
      beam(drum, new THREE.Vector3(-0.5, -1.2, lz * 0.36), new THREE.Vector3(0.5, -1.2, lz * 0.36));
    }

    // Two sticks laid across the top, their cloth-bound heads toward the painted face
    for (const k of [-1, 1]) {
      const stick = new THREE.Group();
      stick.userData.static = true;
      stick.position.set(k * 0.12, 0.76, 0.02);
      stick.rotation.set(Math.PI / 2 - 0.08, 0, k * 0.22);
      const shaft = new THREE.Mesh(stickGeo, woodMat);
      const knob = new THREE.Mesh(knobGeo, knobMat);
      knob.position.y = 0.27;
      stick.add(shaft, knob);
      drum.add(stick);
    }
    // The whole drum is one rigid object: a draw per material instead of one per part
    mergeRigid(drum, { matte: woodMat, metal: bronzeMat }, bag);
  }

  // ------------------------------------------------------------ war banners
  const specs: Array<{ x: number; z: number; glyph: string; pal: { bg: string; trim: string }; dir: number }> = [
    { x: -9.6, z: -7.6, glyph: attacker.seal, pal: atkPal, dir: 1 },
    { x: -5.6, z: -9.6, glyph: factionGlyph(attacker.faction), pal: atkPal, dir: 1 },
    { x: -12.4, z: -4.0, glyph: factionGlyph(attacker.faction), pal: atkPal, dir: 1 },
    { x: 9.6, z: -7.6, glyph: defender.seal, pal: defPal, dir: -1 },
    { x: 5.6, z: -9.6, glyph: factionGlyph(defender.faction), pal: defPal, dir: -1 },
    { x: 12.4, z: -4.0, glyph: factionGlyph(defender.faction), pal: defPal, dir: -1 },
  ];
  const poleGeo = bag.add(new THREE.CylinderGeometry(0.06, 0.08, 7.4, 8));
  const barGeo = bag.add(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 6));
  const finialGeo = bag.add(new THREE.ConeGeometry(0.1, 0.4, 6));
  const goldMat = bag.add(new THREE.MeshStandardMaterial({ color: '#e5c158', metalness: 1, roughness: 0.3 }));
  specs.forEach((b) => {
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
    // Hung from the bar along its top edge; the lower end swings free
    wind.cloth(cloth, { axis: 'y', pin: 1.6, length: -3.2, amplitude: 0.3, ripples: 6.4, drift: 0.3 });
    group.add(cloth);
  });

  // The camp behind the ranks fills the ground between the ring and the painted horizon
  const camp = buildCamp(
    {
      layout: 'ring',
      left: new THREE.Color(atkPal.bg).lerp(DARK_IRON, look.armyIron * 0.6),
      right: new THREE.Color(defPal.bg).lerp(DARK_IRON, look.armyIron * 0.6),
      // A fortress wall closes the field off not far behind the ring
      maxDepth: terrain === 'fortress' ? 18.5 : 40,
      fires: look.torches,
      wind,
    },
    bag
  );
  group.add(camp.group);

  return {
    group,
    look,
    wind,
    camp,
    brazierLights,
    brazierFlames,
    fire,
    backdrop: {
      texture: panoTex,
      horizonV: look.band[0] + look.horizon * bandHeight,
      tint: panoTint,
      arc: BACKDROP_ARC,
    },
    spectators: { left: leftSpectators, right: rightSpectators },
    crowds,
  };
}
