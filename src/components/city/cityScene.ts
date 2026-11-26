import * as THREE from 'three';
import type { Season } from '../../game/types.js';
import { DisposeBag } from '../duel/duelGeometry3D.js';
import { createDustPuffTexture, createGlowTexture } from '../duel/duelTextures3D.js';
import { FACTION_PIGMENT } from '../map/mapTerrain.js';
import { buildCityFlags } from './cityFlags.js';
import { buildCityPeople } from './cityPeople.js';
import { buildEnvironment } from './cityEnvironment.js';
import {
  cityLayoutOf,
  inRect,
  type CityLayout,
  type CitySpec,
  type DistrictId,
  type Rect,
} from './cityLayout.js';
import {
  createCityBuildKit,
  frameToWorld,
  hashString,
  ridgeHalfOf,
  seeded,
  type CityKit,
} from './cityParts.js';

/**
 * One city, built from its own numbers. Prosperity sets how large the walled town is and how full
 * its wards, market and fields are; defence sets the height and furniture of the walls; the
 * garrison fills the drill ground; the season colours the country; the owner flies the banners.
 */
export interface CityWorld {
  group: THREE.Group;
  layout: CityLayout;
  fog: THREE.FogExp2;
  exposure: number;
  /** Where each district's label stands, and how close the camera comes when it is opened. */
  districts: Record<DistrictId, { anchor: THREE.Vector3; focus: THREE.Vector3; dist: number }>;
  hitMeshes: THREE.Mesh[];
  /** Sets how brightly each district's ground is lit: 0 off, 1 fully chosen. */
  setGlow(id: DistrictId, level: number): void;
  update(dt: number, elapsed: number, still: boolean): void;
  dispose(): void;
}

const C = {
  rammed: 0xb39c74,
  brick: 0x8e8b84,
  walk: 0x7c725f,
  plaster: 0xd8ccb2,
  plasterDim: 0xbdaf93,
  mudWall: 0xa48f68,
  timber: 0x4a2c1e,
  lacquer: 0x7e2a1e,
  tile: 0x454a4e,
  thatch: 0x9d8a58,
  stone: 0x8e887a,
  pavement: 0xa39b88,
  packed: 0x8a7a5c,
  road: 0xa3916c,
  drill: 0xab9972,
  wood: 0x6b5236,
  canvas: 0xc9bc9c,
  gold: 0xc9a04a,
  bronze: 0x6a5a3a,
  dark: 0x15120e,
};
const HOUSE_TILES = [0x4b4f52, 0x57524b, 0x44494c, 0x514e49];
const CLOTH = [0x8f3a2c, 0xa3823a, 0x3f5a6c, 0x6c4a34, 0x7a6a3a, 0x4a6650];
/** Fields under a bumper harvest and under drought, whatever the season */
const FIELD_HARVEST = [0xd9b84a, 0xcfa83c, 0xe0c25a, 0xc49a34];
const FIELD_DROUGHT = [0xa08a5c, 0xad9868, 0x94804e, 0xb8a474];
const FIELD: Record<Season, number[]> = {
  spring: [0x86a552, 0x94ae5c, 0x6f9148, 0x7a6446],
  summer: [0x4f7f3a, 0x5e8c40, 0x6c9646, 0x47733a],
  autumn: [0xc4a74e, 0xb8963e, 0xd0b35a, 0x9a8a46],
  winter: [0x8a7b60, 0x93866c, 0xa49b88, 0x7c6e56],
};

interface Extras {
  flags: Array<{ p: THREE.Vector3; size: number }>;
  lamps: THREE.Vector3[];
  /** Small festival lanterns strung along the avenue */
  lanterns: THREE.Vector3[];
  smoke: THREE.Vector3[];
  /** Something burning: a glow, a light and a column of dark smoke */
  fires: THREE.Vector3[];
  /** `c` is the company a soldier stands in, so companies can move as one at drill */
  soldiers: Array<{ x: number; z: number; r: number; c: number }>;
  /** Townsfolk about their business; fewer of them show when the city is afraid */
  people: Array<{ x: number; z: number; r: number }>;
  /** People brought together by what is happening: a crowd, a queue, a work gang */
  gathered: Array<{ x: number; z: number; r: number; y?: number }>;
  trees: Array<{ x: number; z: number; s: number }>;
}

const mixHex = (a: number, b: number, t: number) =>
  new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

/** A timber hall: lacquered frame, plaster panels, tiled roof with its ridge. Returns its height. */
function hallBlock(
  kit: CityKit,
  parent: THREE.Object3D,
  o: {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    roofH: number;
    roof: THREE.Material;
    rot?: number;
    base?: number;
    double?: boolean;
    lift?: number;
    crest?: THREE.Material;
  }
): number {
  const f = kit.frame(parent, o.x, o.z, o.rot ?? 0);
  const y0 = o.base ?? 0;
  const lacquer = kit.paint(C.lacquer);
  const plaster = kit.paint(C.plaster);
  const crest = o.crest ?? kit.paint(C.tile);
  const lift = o.lift ?? 0.5;

  const storey = (w: number, d: number, h: number, y: number) => {
    kit.box(f, lacquer, w, h, d, 0, y, 0);
    kit.box(f, plaster, w * 0.84, h * 0.5, d + 0.08, 0, y + h * 0.3, 0);
    kit.box(f, plaster, w + 0.08, h * 0.5, d * 0.6, 0, y + h * 0.3, 0);
  };
  const cap = (w: number, d: number, h: number, y: number) => {
    kit.roof(f, o.roof, w, d, h, 0, y, 0, 0, { lift });
    const half = ridgeHalfOf(w, d);
    kit.box(f, crest, half * 2 + 0.5, 0.34, 0.34, 0, y + h - 0.12, 0);
    for (const s of [-1, 1]) kit.box(f, crest, 0.3, 0.62, 0.3, s * (half + 0.15), y + h - 0.12, 0);
  };

  storey(o.w, o.d, o.h, y0);
  kit.box(f, kit.paint(C.dark), o.w * 0.2, o.h * 0.72, 0.1, 0, y0, o.d / 2 + 0.07);
  let y = y0 + o.h;
  if (o.double) {
    kit.roof(f, o.roof, o.w + 3.8, o.d + 3.8, o.roofH * 0.5, 0, y, 0, 0, { lift, ridge: 0.8 });
    const w2 = o.w * 0.8;
    const d2 = o.d * 0.74;
    y += o.roofH * 0.26;
    storey(w2, d2, 1.7, y);
    y += 1.7;
    cap(w2 + 3.2, d2 + 3.2, o.roofH, y);
  } else {
    cap(o.w + 3.2, o.d + 3.2, o.roofH, y);
  }
  return y + o.roofH;
}

export function buildCityWorld(spec: CitySpec): CityWorld {
  const bag = new DisposeBag();
  const kit = createCityBuildKit(bag);
  const L = cityLayoutOf(spec);
  const rnd = seeded(hashString(spec.id));
  // The country outside has its own dice, and so does everything that shows the city's condition,
  // so a riot or a fair never reshuffles the houses and fields the player knows.
  const land = seeded(hashString(`${spec.id}:land`));
  const dress = seeded(hashString(`${spec.id}:dress`));
  const pigment = FACTION_PIGMENT[spec.owner];
  const H = L.half;
  const { wallH, wallT, crossZ } = L;
  const tier = spec.tier;
  // The market and the quays grow with trade, the fields and granaries with farming.
  const trade = spec.trade;
  const farming = spec.farming;
  const def = spec.defense;

  const group = new THREE.Group();
  const town = new THREE.Group();
  group.add(town);
  const extras: Extras = {
    flags: [],
    lamps: [],
    lanterns: [],
    smoke: [],
    fires: [],
    soldiers: [],
    people: [],
    gathered: [],
    trees: [],
  };
  const riot = spec.event === 'riot';
  const uneasy = spec.unrest || riot;
  // Timber staging against a wall face, with a gang working on it
  const scaffold = (f: THREE.Object3D, x: number, z: number, len: number, h: number, gang: number) => {
    const pole = kit.paint(C.timber);
    const plank = kit.paint(C.wood);
    const posts = Math.max(2, Math.ceil(len / 2.6) + 1);
    for (let i = 0; i < posts; i++) {
      const px = x - len / 2 + (i * len) / (posts - 1);
      kit.box(f, pole, 0.16, h + 0.6, 0.16, px, 0, z);
      kit.box(f, pole, 0.16, h + 0.6, 0.16, px, 0, z + 1.0);
    }
    for (const level of [0.34, 0.67, 1]) {
      kit.box(f, plank, len + 0.4, 0.1, 1.2, x, h * level, z + 0.5);
      kit.box(f, pole, len + 0.4, 0.1, 0.1, x, h * level + 0.9, z);
    }
    for (let i = 0; i < gang; i++) {
      const p = frameToWorld(f, x - len / 2 + ((i + 0.5) * len) / gang, 0, z - 0.9 - (i % 2) * 0.7);
      extras.gathered.push({ x: p.x, z: p.z, r: dress() * Math.PI * 2 });
    }
  };
  const districts = {} as CityWorld['districts'];
  const hitMeshes: THREE.Mesh[] = [];

  const officialRoof = kit.paint(mixHex(C.tile, pigment, 0.32), 'roof');
  const dark = kit.paint(C.dark);
  const wood = kit.paint(C.wood);
  const paved = tier >= 3;

  // --- hit volumes and the light that marks a district as chosen
  const hitGeo = bag.add(new THREE.BoxGeometry(1, 1, 1));
  const hitMat = bag.add(new THREE.MeshBasicMaterial({ visible: false }));
  const hit = (id: DistrictId, x: number, z: number, w: number, h: number, d: number) => {
    const m = new THREE.Mesh(hitGeo, hitMat);
    m.scale.set(w, h, d);
    m.position.set(x, h / 2, z);
    m.userData.district = id;
    group.add(m);
    hitMeshes.push(m);
  };
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  {
    const ctx = glowCanvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.62 * (1 - i / 14) ** 2})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(i + 0.5, i + 0.5, 127 - i * 2, 127 - i * 2);
    }
  }
  const glowTex = bag.add(new THREE.CanvasTexture(glowCanvas));
  const glowGeo = bag.add(new THREE.PlaneGeometry(1, 1));
  glowGeo.rotateX(-Math.PI / 2);
  const glowMats = {} as Record<DistrictId, THREE.MeshBasicMaterial>;
  for (const id of ['hall', 'market', 'fields', 'barracks', 'walls'] as DistrictId[]) {
    glowMats[id] = bag.add(
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xffc56a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
  }
  const glow = (id: DistrictId, x: number, y: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(glowGeo, glowMats[id]);
    m.scale.set(w, 1, d);
    m.position.set(x, y, z);
    m.renderOrder = 4;
    group.add(m);
  };

  // =============================================================== walls
  const wallMat = kit.paint(def >= 5 ? C.brick : C.rammed, 'wall');
  const walkMat = kit.paint(C.walk, 'wall');
  const stone = kit.paint(C.stone, 'wall');
  const wallCentre = H + wallT / 2;
  const span = L.outer * 2;
  let gateTop = wallH;

  const merlons = (f: THREE.Object3D, x0: number, x1: number, y: number, z: number) => {
    const n = Math.max(1, Math.floor((x1 - x0) / 1.9));
    for (let i = 0; i < n; i++) {
      kit.box(f, wallMat, 1.05, 0.95, 0.55, x0 + ((i + 0.5) * (x1 - x0)) / n, y, z);
    }
  };
  const run = (f: THREE.Object3D, x0: number, x1: number) => {
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    kit.batter(f, wallMat, len, wallH, wallT, cx, 0, 0);
    kit.box(f, walkMat, len, 0.22, wallT * 0.8, cx, wallH, 0);
    kit.box(f, wallMat, len, 0.5, 0.32, cx, wallH + 0.22, -wallT * 0.4 + 0.16);
    if (def >= 2) merlons(f, x0, x1, wallH + 0.22, wallT * 0.4 - 0.28);
    else kit.box(f, wallMat, len, 0.55, 0.4, cx, wallH + 0.22, wallT * 0.4 - 0.2);
    if (def >= 4) {
      // Towers standing out from the face, so the foot of the wall can be covered
      const count = Math.floor(len / 24);
      for (let j = 0; j < count; j++) {
        const x = x0 + ((j + 1) * len) / (count + 1);
        const z = wallT * 0.5 + 1.3;
        kit.batter(f, wallMat, 5.4, wallH + 0.55, 3.6, x, 0, z);
        kit.box(f, walkMat, 5.2, 0.22, 3.0, x, wallH + 0.55, z);
        merlons(f, x - 2.6, x + 2.6, wallH + 0.77, z + 1.2);
        if (def >= 5) {
          kit.box(f, kit.paint(C.lacquer), 3.0, 1.9, 2.0, x, wallH + 0.77, z - 0.3);
          kit.roof(f, officialRoof, 4.8, 3.8, 1.5, x, wallH + 2.67, z - 0.3, 0, { lift: 0.4 });
        }
      }
    }
  };

  const side = (name: 's' | 'n' | 'e' | 'w', x: number, z: number, rot: number) => {
    const f = kit.frame(town, x, z, rot);
    const gated = L.gates[name];
    const main = name === 's';
    if (!gated) {
      run(f, -span / 2, span / 2);
      return;
    }
    const gw = main ? 12 : 9.6;
    const gd = wallT + 2.8;
    const gh = wallH + 1.7;
    if (main && spec.breached) {
      // A stretch west of the gate is down: a stump of wall, rubble spilled outward, staging behind
      const bx = -(span / 2 + gw / 2) / 2;
      run(f, -span / 2, bx - 3.4);
      run(f, bx + 3.4, -gw / 2 + 0.3);
      const broken = kit.paint(mixHex(def >= 5 ? C.brick : C.rammed, 0x3a332a, 0.3), 'wall');
      kit.batter(f, wallMat, 6.8, wallH * 0.36, wallT, bx, 0, 0);
      kit.box(f, wallMat, 1.3, wallH * 0.74, wallT * 0.9, bx - 2.9, 0, 0);
      kit.box(f, wallMat, 1.1, wallH * 0.56, wallT * 0.8, bx + 2.8, 0, 0.1);
      kit.box(f, kit.paint(0x26221e), 5.4, 0.1, wallT * 0.84, bx, wallH * 0.36, 0);
      for (let k = 0; k < 18; k++) {
        const size = 0.5 + dress() * 1.2;
        kit.box(f, broken, size, size * 0.6, size * 0.8, bx + (dress() - 0.5) * 9, 0, wallT / 2 + 0.4 + dress() * 4.6);
      }
      for (let k = 0; k < 5; k++) {
        const size = 0.4 + dress() * 0.7;
        kit.box(f, broken, size, size * 0.6, size, bx + (dress() - 0.5) * 6, wallH * 0.36, (dress() - 0.5) * wallT * 0.6);
      }
      scaffold(f, bx, -wallT / 2 - 1.5, 8, wallH * 0.8, 5);
      extras.smoke.unshift(frameToWorld(f, bx, wallH * 0.5, 0));
    } else {
      run(f, -span / 2, -gw / 2 + 0.3);
    }
    run(f, gw / 2 - 0.3, span / 2);
    if (main && spec.works === 'walls') {
      // The governor's works: staging up the inner face east of the gate, and earth to ram
      const wx = gw / 2 + Math.min(12, span * 0.16);
      scaffold(f, wx, -wallT / 2 - 1.5, 12, wallH, 7);
      kit.box(f, kit.paint(C.rammed, 'earth'), 3.2, 0.9, 1.3, wx + 8.4, 0, -wallT / 2 - 1.1);
      kit.box(f, kit.paint(C.rammed, 'earth'), 2.0, 0.6, 1.1, wx - 8, 0, -wallT / 2 - 1.1);
    }

    // The gatehouse: a block thicker and taller than the wall, pierced by the gateway
    kit.batter(f, wallMat, gw, gh, gd, 0, 0, 0);
    kit.box(f, walkMat, gw - 0.5, 0.25, gd * 0.8, 0, gh, 0);
    merlons(f, -gw / 2 + 0.3, gw / 2 - 0.3, gh + 0.25, gd * 0.4 - 0.3);
    const dw = main ? 4.4 : 3.4;
    const dh = Math.min(5.2, gh * 0.62);
    kit.box(f, dark, dw, dh, gd + 0.24, 0, 0, 0);
    kit.box(f, stone, dw + 1.3, 0.55, gd + 0.4, 0, dh, 0);
    for (const s of [-1, 1]) {
      kit.box(f, stone, 0.55, dh, gd + 0.4, s * (dw / 2 + 0.27), 0, 0);
      // Leaves swung open against the jambs
      kit.box(f, kit.paint(C.lacquer), 0.16, dh * 0.94, dw * 0.46, s * (dw / 2 + 0.7), 0, gd / 2 + dw * 0.23);
    }

    // The tower over the gate
    const storeys = main ? (def >= 4 || spec.capital ? 2 : def >= 2 ? 1 : 0) : def >= 5 ? 2 : def >= 3 ? 1 : 0;
    let y = gh + 0.25;
    if (storeys === 0) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) kit.box(f, kit.paint(C.timber), 0.3, 2.2, 0.3, sx * (gw * 0.36), y, sz * (gd * 0.24));
      }
      kit.roof(f, kit.paint(C.thatch), gw * 0.9, gd * 0.9, 1.5, 0, y + 2.2, 0, 0, { lift: 0.1 });
      y += 3.7;
    } else {
      y = hallBlock(kit, f, {
        x: 0,
        z: 0,
        w: gw * 0.74,
        d: gd * 0.5,
        h: 2.9,
        roofH: 2.3,
        roof: officialRoof,
        base: y,
        double: storeys === 2,
      });
    }
    if (main) gateTop = y;
    for (const s of [-1, 1]) {
      kit.box(f, kit.paint(C.timber), 0.16, 5.4, 0.16, s * (gw / 2 - 0.7), gh, gd * 0.3);
      extras.flags.push({ p: frameToWorld(f, s * (gw / 2 - 0.7), gh + 4.6, gd * 0.3), size: main ? 1.25 : 1 });
      kit.cyl(f, kit.paint(C.bronze, 'metal'), 0.42, 0.3, 1.3, s * (dw / 2 + 2.2), 0, gd / 2 + 2.4);
      extras.lamps.push(frameToWorld(f, s * (dw / 2 + 2.2), 1.75, gd / 2 + 2.4));
    }

    // The road out, and a bridge where it meets the moat
    const road = kit.paint(C.road, 'earth');
    let length = main || spec.terrain === 'fortress' ? 300 : 120;
    if (name === 'e' && L.river) length = L.river.x - L.river.half - L.outer + 2;
    kit.box(f, road, 5.2, 0.07, length, 0, 0, wallT / 2 + length / 2);
    if (L.moat) {
      const mz = wallT / 2 + (L.moat.inner - L.outer) + L.moat.width / 2;
      kit.box(f, kit.paint(C.stone, 'pave'), 6, 0.42, L.moat.width + 3, 0, 0, mz);
      for (const s of [-1, 1]) kit.box(f, stone, 0.3, 0.6, L.moat.width + 3, s * 3, 0.42, mz);
    }
  };
  side('s', 0, wallCentre, 0);
  side('n', 0, -wallCentre, Math.PI);
  side('e', wallCentre, 0, Math.PI / 2);
  side('w', -wallCentre, 0, -Math.PI / 2);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * wallCentre;
      const z = sz * wallCentre;
      if (def >= 3) {
        const size = wallT + 2.8;
        const th = wallH + 1.3;
        kit.box(town, wallMat, size, th, size, x, 0, z);
        kit.box(town, walkMat, size + 0.3, 0.22, size + 0.3, x, th, z);
        for (const k of [-1, 0, 1]) {
          kit.box(town, wallMat, 0.95, 0.9, 0.5, x + k * (size / 3), th + 0.22, z + sz * (size / 2 - 0.2));
          kit.box(town, wallMat, 0.5, 0.9, 0.95, x + sx * (size / 2 - 0.2), th + 0.22, z + k * (size / 3));
        }
        kit.box(town, kit.paint(C.lacquer), 3.4, 2.2, 3.4, x, th + 0.22, z);
        kit.roof(town, officialRoof, 6.2, 6.2, 2.3, x, th + 2.42, z, 0, { ridge: 0.06, lift: 0.5 });
      } else {
        kit.box(town, wallMat, wallT + 0.7, wallH + 0.35, wallT + 0.7, x, 0, z);
      }
    }
  }
  for (const [x, z, w, d] of [
    [0, wallCentre, span, wallT + 3],
    [0, -wallCentre, span, wallT + 3],
    [wallCentre, 0, wallT + 3, span],
    [-wallCentre, 0, wallT + 3, span],
  ] as const) {
    hit('walls', x, z, w, wallH + 1.2, d);
    glow('walls', x, wallH + 0.6, z, w + 2, d + 2);
  }
  hit('walls', 0, wallCentre, 13, gateTop, wallT + 4);
  districts.walls = {
    anchor: new THREE.Vector3(-wallCentre, wallH + (def >= 3 ? 6 : 2.4), wallCentre),
    focus: new THREE.Vector3(0, wallH * 0.5, wallCentre - 6),
    dist: H * 1.7,
  };

  // =============================================================== streets
  kit.box(town, kit.paint(C.packed, 'earth'), H * 2, 0.05, H * 2, 0, 0, 0);
  const street = paved ? kit.paint(C.pavement, 'pave') : kit.paint(C.road, 'earth');
  const cw = Math.max(26, Math.min(56, H * 0.95));
  const cd = Math.max(21, Math.min(42, H * 0.7));
  const hz = -H * 0.44;
  const hallFront = hz + cd / 2;
  kit.box(town, street, 5.6, 0.08, H - hallFront, 0, 0, (H + hallFront) / 2);
  const hallBack = hz - cd / 2;
  if (L.gates.n) {
    // From the north gate the way runs behind the hall and down its east side
    kit.box(town, street, 4.4, 0.08, hallBack + H, 0, 0, (hallBack - H) / 2);
    kit.box(town, street, cw / 2 + 9, 0.08, 3.6, cw / 4 + 2.3, 0, hallBack - 2.3);
    kit.box(town, street, 4.4, 0.08, crossZ - hallBack + 4.1, cw / 2 + 4.6, 0, (crossZ + hallBack - 4.1) / 2);
  }
  kit.box(town, street, H * 2, 0.08, 4.6, 0, 0, crossZ);
  // The open court before the hall
  kit.box(town, kit.paint(C.pavement, 'pave'), cw, 0.09, crossZ - 2.3 - hallFront, 0, 0, (hallFront + crossZ - 2.3) / 2);

  // =============================================================== the hall
  {
    const f = kit.frame(town, 0, hz, 0);
    const cap = kit.paint(C.tile, 'roof');
    const plaster = kit.paint(C.plaster);
    const fence = (x: number, z: number, w: number, d: number) => {
      kit.box(f, plaster, w, 2.3, d, x, 0, z);
      kit.box(f, cap, w + 0.5, 0.3, d + 0.5, x, 2.3, z);
    };
    fence(0, -cd / 2, cw, 0.5);
    fence(-cw / 2, 0, 0.5, cd);
    fence(cw / 2, 0, 0.5, cd);
    fence(-(cw / 4 + 1.6), cd / 2, cw / 2 - 3.2, 0.5);
    fence(cw / 4 + 1.6, cd / 2, cw / 2 - 3.2, 0.5);
    hallBlock(kit, f, { x: 0, z: cd / 2, w: 5.6, d: 2.6, h: 2.8, roofH: 1.9, roof: officialRoof });
    kit.box(f, kit.paint(C.pavement, 'pave'), cw - 1, 0.1, cd - 1, 0, 0, 0);

    const mw = Math.min(cw - 11, 12 + tier * 1.7 + (spec.capital ? 4 : 0));
    const md = mw * 0.48;
    const mz = -cd * 0.14;
    const th = spec.capital ? 1.9 : 1.0;
    kit.box(f, kit.paint(C.stone, 'pave'), mw + 5.4, th, md + 5.4, 0, 0, mz);
    kit.box(f, kit.paint(C.stone, 'pave'), 4.6, th * 0.5, 1.8, 0, 0, mz + md / 2 + 3.5);
    if (spec.capital) kit.box(f, kit.paint(C.stone, 'pave'), mw + 9, 0.7, md + 9, 0, 0, mz);
    const gilt = kit.paint(C.gold, 'metal');
    const top = hallBlock(kit, f, {
      x: 0,
      z: mz,
      w: mw,
      d: md,
      h: spec.capital ? 4.1 : 3.3,
      roofH: spec.capital ? 3.8 : 3.2,
      roof: officialRoof,
      base: th,
      double: tier >= 4 || spec.capital,
      lift: 0.7,
      crest: spec.capital ? gilt : undefined,
    });
    if (tier >= 2) {
      for (const s of [-1, 1]) {
        hallBlock(kit, f, {
          x: s * (cw / 2 - 4),
          z: cd * 0.14,
          w: Math.min(9, cd * 0.36),
          d: 3.8,
          h: 2.5,
          roofH: 1.9,
          roof: officialRoof,
          rot: Math.PI / 2,
        });
      }
    }
    if (tier >= 3) {
      hallBlock(kit, f, { x: 0, z: -cd / 2 + 3.6, w: mw * 0.7, d: 3.6, h: 2.5, roofH: 2.0, roof: officialRoof });
    }
    if (spec.capital) {
      // Gate towers before the palace
      for (const s of [-1, 1]) {
        kit.box(f, kit.paint(C.stone, 'wall'), 2.6, 6.4, 2.6, s * 7.5, 0, cd / 2 + 3);
        kit.box(f, kit.paint(C.lacquer), 2.1, 1.6, 2.1, s * 7.5, 6.4, cd / 2 + 3);
        kit.roof(f, officialRoof, 4.2, 4.2, 1.6, s * 7.5, 8, cd / 2 + 3, 0, { ridge: 0.06, lift: 0.4 });
      }
    }
    for (const s of [-1, 1]) {
      kit.cyl(f, kit.paint(C.bronze, 'metal'), 0.5, 0.34, 1.2, s * (mw / 2 - 1), th, mz + md / 2 + 1.6);
      extras.lamps.push(frameToWorld(f, s * (mw / 2 - 1), th + 1.7, mz + md / 2 + 1.6));
      kit.box(f, kit.paint(C.timber), 0.18, 7, 0.18, s * (mw / 2 + 1.8), 0, mz + md / 2 + 2.4);
      extras.flags.push({ p: frameToWorld(f, s * (mw / 2 + 1.8), 6, mz + md / 2 + 2.4), size: 1.4 });
      extras.lamps.push(frameToWorld(f, s * 3.6, 1.6, cd / 2 + 1.4));
    }
    hit('hall', 0, hz, cw + 1, top, cd + 1);
    glow('hall', 0, 0.24, hz, cw + 3, cd + 3);
    districts.hall = {
      anchor: new THREE.Vector3(0, top + 2.4, hz + mz),
      focus: new THREE.Vector3(0, 3, hz + 2),
      dist: Math.max(58, cw * 1.8),
    };
  }

  // What the people are doing before the hall and along the avenue
  {
    const courtDepth = crossZ - 2.3 - hallFront;
    if (uneasy) {
      // A crowd pressing on the hall gate
      const count = riot ? 72 : 38;
      for (let i = 0; i < count; i++) {
        extras.gathered.push({
          x: (dress() + dress() - 1) * cw * 0.3,
          z: hallFront + 1.4 + dress() * dress() * Math.max(2, courtDepth - 1.5),
          r: Math.PI + (dress() - 0.5) * 0.6,
        });
      }
      extras.fires.push(new THREE.Vector3(-H * 0.6, 2.4, -H * 0.5));
      if (riot) extras.fires.push(new THREE.Vector3(H * 0.62, 2.4, -H * 0.18));
    } else if (spec.works === 'relief') {
      // Grain given out at the hall gate: sacks on a trestle and a queue down the court
      const tx = Math.min(cw / 2 - 4, 7);
      const tz = hallFront + 2.2;
      kit.box(town, wood, 3.4, 0.8, 1.2, tx, 0, tz);
      for (let k = 0; k < 7; k++) {
        kit.box(town, kit.paint(C.canvas), 0.7, 0.45, 0.5, tx - 1.2 + (k % 4) * 0.8, 0.8 + Math.floor(k / 4) * 0.45, tz);
      }
      for (let k = 0; k < 5; k++) kit.box(town, kit.paint(C.canvas), 0.8, 0.5, 0.6, tx + 2.6 + (k % 2) * 0.9, Math.floor(k / 2) * 0.5, tz - 0.3);
      const rows = Math.max(3, Math.floor(courtDepth - 3.2));
      for (let i = 0; i < 18; i++) {
        extras.gathered.push({
          x: tx - 0.6 - Math.floor(i / rows) * 1.3 + (dress() - 0.5) * 0.3,
          z: tz + 1.5 + (i % rows) * 1.0,
          r: Math.PI,
        });
      }
      for (let k = 0; k < 2; k++) extras.gathered.push({ x: tx - 0.8 + k * 1.6, z: tz - 1.0, r: 0 });
    }
    if (spec.thriving && !uneasy) {
      // Lanterns on posts down the avenue, and the street full
      const post = kit.paint(C.timber);
      for (let z = crossZ + 4; z < H - 3; z += 5) {
        for (const sx of [-1, 1]) {
          kit.box(town, post, 0.12, 3.1, 0.12, sx * 3.25, 0, z);
          extras.lanterns.push(new THREE.Vector3(sx * 3.25, 3.0, z));
        }
      }
      for (let z = hallFront + 3; z < crossZ - 3; z += 5) {
        for (const sx of [-1, 1]) extras.lanterns.push(new THREE.Vector3(sx * (cw / 2 - 1.5), 2.6, z));
      }
      for (let i = 0; i < 26; i++) {
        extras.gathered.push({ x: (dress() - 0.5) * 4.2, z: crossZ + 3 + dress() * (H - crossZ - 6), r: dress() * Math.PI * 2 });
      }
    }
  }

  // =============================================================== homes and granaries
  const houses = (rect: Rect, skip: Rect[]) => {
    const density = [0.44, 0.58, 0.72, 0.85, 0.95][tier - 1];
    const wealth = 0.2 + tier * 0.15;
    const cellW = 6.6;
    const cellD = 5.9;
    const cols = Math.floor((rect.x1 - rect.x0) / cellW);
    const rows = Math.floor((rect.z1 - rect.z0) / cellD);
    if (cols < 1 || rows < 1) return;
    const padX = (rect.x1 - rect.x0 - cols * cellW) / 2;
    const padZ = (rect.z1 - rect.z0 - rows * cellD) / 2;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = rect.x0 + padX + (c + 0.5) * cellW + (rnd() - 0.5) * 1.1;
        const z = rect.z0 + padZ + (r + 0.5) * cellD + (rnd() - 0.5) * 0.9;
        if (skip.some((s) => inRect(s, x, z, 2.5))) continue;
        if (rnd() > density) {
          if (rnd() < 0.3) extras.trees.push({ x, z, s: 0.9 + rnd() * 0.5 });
          continue;
        }
        const poor = rnd() > wealth;
        const w = 3.6 + rnd() * 1.5;
        const d = 2.8 + rnd() * 0.8;
        const h = 1.7 + rnd() * 0.5;
        const f = kit.frame(town, x, z, rnd() < 0.72 ? 0 : Math.PI / 2);
        kit.box(f, kit.paint(poor ? C.mudWall : rnd() < 0.5 ? C.plaster : C.plasterDim), w, h, d, 0, 0, 0);
        if (!poor) kit.box(f, kit.paint(C.timber), w + 0.08, 0.16, d + 0.08, 0, h - 0.16, 0);
        kit.box(f, dark, 0.7, 1.15, 0.08, (rnd() - 0.5) * w * 0.4, 0, d / 2 + 0.03);
        if (poor) kit.roof(f, kit.paint(C.thatch), w + 1.0, d + 1.1, 1.35, 0, h, 0, 0, { ridge: 0.72, lift: 0.04 });
        else {
          const tile = HOUSE_TILES[Math.floor(rnd() * HOUSE_TILES.length)];
          kit.roof(f, kit.paint(tile, 'roof'), w + 1.1, d + 1.2, 1.25, 0, h, 0, 0, { ridge: 0.78, lift: 0.22 });
        }
        if (rnd() < 0.16) extras.smoke.push(new THREE.Vector3(x, h + 1.8, z));
      }
    }
  };
  const granaryCount = Math.min(1 + farming, Math.max(1, Math.floor((H - 3 - (cw / 2 + 3)) / 4.2)) * 2);
  const granaryRect: Rect = {
    x0: cw / 2 + 8,
    x1: cw / 2 + 8 + Math.ceil(granaryCount / 2) * 4.2,
    z0: hz - 4.4,
    z1: hz + 4.4,
  };
  for (let i = 0; i < granaryCount; i++) {
    const x = granaryRect.x0 + 2.1 + Math.floor(i / 2) * 4.2;
    const z = hz + (i % 2 === 0 ? -2.2 : 2.2);
    kit.cyl(town, kit.paint(C.stone), 1.7, 1.7, 0.4, x, 0, z);
    kit.cyl(town, kit.paint(C.mudWall), 1.5, 1.4, 2.5, x, 0.4, z);
    kit.cyl(town, kit.paint(C.thatch), 0, 2.0, 1.6, x, 2.9, z);
  }
  const northStreet: Rect = { x0: cw / 2 + 2, x1: cw / 2 + 7.2, z0: -H, z1: crossZ };
  houses({ x0: -H + 2.5, x1: -cw / 2 - 2.5, z0: -H + 2.5, z1: crossZ - 3.2 }, []);
  houses({ x0: cw / 2 + 2.5, x1: H - 2.5, z0: -H + 2.5, z1: crossZ - 3.2 }, [granaryRect, northStreet]);
  if (hallBack - 2.5 - (-H + 2.5) >= 5.6) {
    houses({ x0: -cw / 2, x1: L.gates.n ? -3.4 : cw / 2, z0: -H + 2.5, z1: hallBack - 2.5 }, []);
  }

  // =============================================================== the market
  {
    const r: Rect = { x0: 4.2, x1: H - 2.5, z0: crossZ + 3.4, z1: H - 2.5 };
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    kit.box(town, kit.paint(paved ? C.pavement : C.road, paved ? 'pave' : 'earth'), w - 1, 0.09, d - 1, cx, 0, cz);

    // Shops close the square on its north and east sides
    const taken: Rect[] = [];
    const shop = (x: number, z: number, len: number, rot: number) => {
      const f = kit.frame(town, x, z, rot);
      kit.box(f, kit.paint(C.plasterDim), len, 2.3, 3.4, 0, 0, 0);
      kit.box(f, kit.paint(C.timber), len + 0.08, 0.18, 3.48, 0, 2.12, 0);
      kit.roof(f, kit.paint(HOUSE_TILES[Math.floor(rnd() * 4)], 'roof'), len + 1.2, 4.8, 1.45, 0, 2.3, 0, 0, { ridge: 0.86, lift: 0.2 });
      // An awning over the counter
      kit.box(f, kit.paint(CLOTH[Math.floor(rnd() * CLOTH.length)]), len * 0.8, 0.08, 1.3, 0, 1.75, 2.3);
      kit.box(f, wood, len * 0.7, 0.7, 0.6, 0, 0, 2.2);
    };
    if (trade >= 2) {
      const n = Math.max(1, Math.floor((w - 3) / 8));
      for (let i = 0; i < n; i++) shop(r.x0 + 1.5 + ((i + 0.5) * (w - 3)) / n, r.z0 + 2.2, (w - 3) / n - 0.9, 0);
      taken.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z0 + 6 });
    }
    if (trade >= 3) {
      const n = Math.max(1, Math.floor((d - 10) / 8));
      for (let i = 0; i < n; i++) {
        shop(r.x1 - 2.2, r.z0 + 8 + ((i + 0.5) * (d - 10)) / n, (d - 10) / n - 0.9, -Math.PI / 2);
      }
      taken.push({ x0: r.x1 - 6, x1: r.x1, z0: r.z0, z1: r.z1 });
      // The market tower, from which the wardens watch the square
      const tx = cx - 1;
      const tz = cz + 2;
      kit.box(town, kit.paint(C.stone, 'wall'), 4.4, 3.2, 4.4, tx, 0, tz);
      hallBlock(kit, town, { x: tx, z: tz, w: 3.4, d: 3.4, h: 2.4, roofH: 2.0, roof: officialRoof, base: 3.2, lift: 0.45 });
      taken.push({ x0: tx - 4, x1: tx + 4, z0: tz - 4, z1: tz + 4 });
      extras.lamps.push(new THREE.Vector3(tx + 2.8, 1.8, tz + 2.8), new THREE.Vector3(tx - 2.8, 1.8, tz + 2.8));
    }

    if (spec.works === 'trade') {
      // The governor's works: the frame of a new shop going up, with its timber stacked beside it
      const bx = r.x0 + 6;
      const bz = r.z1 - 4.4;
      const pole = kit.paint(C.timber);
      for (const sx of [-1, 0, 1]) {
        for (const sz of [-1, 1]) kit.box(town, pole, 0.22, 2.9, 0.22, bx + sx * 3.2, 0, bz + sz * 1.6);
      }
      for (const sz of [-1, 1]) kit.box(town, pole, 6.8, 0.2, 0.2, bx, 2.9, bz + sz * 1.6);
      for (const sx of [-1, 0, 1]) kit.box(town, pole, 0.2, 0.2, 3.4, bx + sx * 3.2, 2.9, bz);
      for (let k = 0; k < 5; k++) kit.box(town, wood, 0.14, 0.14, 4.2, bx - 3 + k * 1.5, 3.5, bz);
      for (let k = 0; k < 6; k++) kit.box(town, wood, 3.6, 0.2, 0.24, bx + 6.2, (k % 3) * 0.2, bz - 0.5 + Math.floor(k / 3) * 0.5);
      for (let k = 0; k < 6; k++) {
        extras.gathered.push({ x: bx - 3 + dress() * 6, z: bz - 2.6 + dress() * 5.2, r: dress() * Math.PI * 2 });
      }
      taken.push({ x0: bx - 5, x1: bx + 8.6, z0: bz - 3.4, z1: bz + 3.4 });
    }
    if (riot) {
      // A stall burning in the open part of the square and a mob around it
      const fx = r.x0 + w * 0.2;
      const fz = cz + d * 0.12;
      const charred = kit.paint(0x1c1815);
      for (const sx of [-1, 1]) kit.box(town, charred, 0.12, 1.5, 0.12, fx + sx * 1.1, 0, fz - 0.7);
      kit.box(town, charred, 2.6, 0.5, 1.4, fx, 0, fz);
      kit.box(town, charred, 2.2, 0.1, 1.9, fx + 0.5, 0.5, fz + 0.3);
      extras.fires.push(new THREE.Vector3(fx, 1.3, fz));
      taken.push({ x0: fx - 2.4, x1: fx + 2.4, z0: fz - 2.2, z1: fz + 2.2 });
      for (let i = 0; i < 34; i++) {
        const a = dress() * Math.PI * 2;
        const rad = 3.2 + dress() * 4.5;
        extras.gathered.push({ x: fx + Math.cos(a) * rad, z: fz + Math.sin(a) * rad * 0.8, r: a });
      }
    }

    // Stalls in rows across what is left of the square; a fair fills it, fear empties it
    const usual = [3, 7, 12, 18, 26][trade - 1];
    const want = spec.event === 'fair' ? 999 : uneasy || spec.event === 'plague' ? Math.ceil(usual * 0.55) : usual;
    let stalls = 0;
    for (let z = r.z0 + 3.5; z < r.z1 - 2 && stalls < want; z += 4.4) {
      for (let x = r.x0 + 3; x < r.x1 - 2 && stalls < want; x += 4.6) {
        if (taken.some((t) => inRect(t, x, z, 1.6))) continue;
        const gap = rnd() < 0.14;
        if (gap && spec.event !== 'fair') continue;
        const f = kit.frame(town, x + (rnd() - 0.5) * 0.8, z + (rnd() - 0.5) * 0.6, rnd() < 0.8 ? 0 : Math.PI / 2);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) kit.box(f, wood, 0.1, 1.7, 0.1, sx * 1.15, 0, sz * 0.8);
        }
        kit.roof(f, kit.paint(CLOTH[Math.floor(rnd() * CLOTH.length)]), 3.0, 2.3, 0.75, 0, 1.7, 0, 0, { ridge: 0.7, lift: 0.02 });
        kit.box(f, wood, 2.0, 0.6, 1.0, 0, 0, 0);
        for (let k = 0; k < 3; k++) {
          kit.box(f, kit.paint(CLOTH[Math.floor(rnd() * CLOTH.length)]), 0.38, 0.26, 0.38, -0.6 + k * 0.6, 0.6, (rnd() - 0.5) * 0.4);
        }
        if (rnd() < 0.6) kit.cyl(f, kit.paint(0x6a4a34), 0.24, 0.32, 0.7, 1.6, 0, 0.6);
        for (let k = 0; k < 2; k++) {
          const p = frameToWorld(f, (rnd() - 0.5) * 2.6, 0, 1.5 + rnd() * 0.9);
          extras.people.push({ x: p.x, z: p.z, r: rnd() * Math.PI * 2 });
        }
        stalls += 1;
      }
    }
    if (trade >= 2) extras.smoke.push(new THREE.Vector3(cx + w * 0.2, 3, r.z0 + 2.2));
    extras.lamps.push(new THREE.Vector3(r.x0 + 1.4, 1.8, r.z0 + 1.4), new THREE.Vector3(r.x1 - 1.4, 1.8, r.z1 - 1.4));
    hit('market', cx, cz, w, trade >= 3 ? 8 : 4, d);
    glow('market', cx, 0.26, cz, w + 1.5, d + 1.5);
    districts.market = {
      anchor: new THREE.Vector3(cx, trade >= 3 ? 11.5 : 6.5, cz),
      focus: new THREE.Vector3(cx, 1.5, cz),
      dist: Math.max(46, w * 1.9),
    };
  }

  // =============================================================== the barracks
  {
    const r: Rect = { x0: -H + 2.5, x1: -4.2, z0: crossZ + 3.4, z1: H - 2.5 };
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    // A palisade with its gate on the avenue
    const post = kit.paint(C.wood);
    kit.box(town, post, w, 1.6, 0.3, cx, 0, r.z0);
    kit.box(town, post, w, 1.6, 0.3, cx, 0, r.z1);
    kit.box(town, post, 0.3, 1.6, d, r.x0, 0, cz);
    kit.box(town, post, 0.3, 1.6, d / 2 - 2.2, r.x1, 0, r.z0 + (d / 2 - 2.2) / 2);
    kit.box(town, post, 0.3, 1.6, d / 2 - 2.2, r.x1, 0, r.z1 - (d / 2 - 2.2) / 2);
    for (const s of [-1, 1]) kit.box(town, kit.paint(C.timber), 0.4, 3, 0.4, r.x1, 0, cz + s * 2.2);
    kit.box(town, kit.paint(C.timber), 0.4, 0.4, 4.8, r.x1, 3, cz);

    // Barrack rows down the west side, one for every few thousand men
    const rowDepth = 4.9;
    const blocks = Math.max(1, Math.min(Math.floor((d - 2) / rowDepth), Math.ceil(spec.troops / 6000)));
    const blockW = Math.min(10, w * 0.36);
    for (let i = 0; i < blocks; i++) {
      const z = r.z0 + 3 + i * rowDepth;
      const f = kit.frame(town, r.x0 + 1.6 + blockW / 2, z, 0);
      kit.box(f, kit.paint(C.mudWall), blockW, 2.1, 3.4, 0, 0, 0);
      kit.box(f, kit.paint(C.timber), blockW + 0.08, 0.16, 3.48, 0, 1.94, 0);
      kit.roof(f, kit.paint(0x3a3936, 'roof'), blockW + 1.1, 4.7, 1.3, 0, 2.1, 0, 0, { ridge: 0.88, lift: 0.12 });
      for (let k = 0; k < 3; k++) kit.box(f, dark, 0.6, 1.1, 0.08, -blockW * 0.3 + k * blockW * 0.3, 0, 1.74);
    }

    // The drill ground and the men on it
    const g0 = r.x0 + blockW + 4.4;
    const ground: Rect = { x0: g0, x1: r.x1 - 1.6, z0: r.z0 + 1.6, z1: r.z1 - 5.4 };
    const gw = ground.x1 - ground.x0;
    const gd = ground.z1 - ground.z0;
    if (gw > 3 && gd > 3) {
      kit.box(town, kit.paint(C.drill, 'earth'), gw, 0.09, gd, (ground.x0 + ground.x1) / 2, 0, (ground.z0 + ground.z1) / 2);
      const step = 1.2;
      const cols = Math.max(1, Math.floor((gw - 1.2) / step));
      const rows = Math.max(1, Math.floor((gd - 1.2) / step));
      const men = Math.max(6, Math.min(cols * rows, 240, Math.round(spec.troops / 120)));
      // Companies of five files with a lane between them. How they stand tells their drill: raw
      // levies in a ragged crowd, veterans dressed by the right with a banner to each company.
      const band = spec.drillBand;
      const ragged = band === 0 ? 0.5 : band === 1 ? 0.22 : 0;
      const sick = spec.event === 'plague' ? 0.45 : 1;
      const muster = Math.max(6, Math.round(men * sick));
      const drilling = spec.works === 'drill';
      // The ranks stand in the middle of the ground, not crowded against its north side
      const files = cols - Math.floor(cols / 6);
      const lead = Math.max(0, (rows - Math.ceil(muster / Math.max(1, files))) / 2) * step * 0.7;
      let placed = 0;
      for (let row = 0; row < rows && placed < muster; row++) {
        for (let col = 0; col < cols && placed < muster; col++) {
          if (col % 6 === 5) continue;
          if (ragged > 0 && dress() < ragged * 0.3) continue;
          const company = Math.floor(col / 6);
          extras.soldiers.push({
            x: ground.x1 - 0.8 - col * step + (dress() - 0.5) * ragged * 2,
            z: ground.z0 + 0.8 + lead + row * step + (dress() - 0.5) * ragged * 2,
            // At drill, neighbouring companies face each other across the lane
            r: (drilling && company % 2 === 1 ? -Math.PI / 2 : Math.PI / 2) + (dress() - 0.5) * ragged * 3,
            c: company,
          });
          placed += 1;
        }
      }
      if (band === 3 || drilling) {
        const companies = Math.ceil(cols / 6);
        for (let c = 0; c < companies; c++) {
          const x = ground.x1 - 0.8 - (c * 6 + 2) * step;
          if (x < ground.x0 + 0.5) break;
          kit.box(town, kit.paint(C.timber), 0.12, 3.6, 0.12, x, 0, ground.z0 + lead);
          extras.flags.push({ p: new THREE.Vector3(x, 3.1, ground.z0 + lead), size: 0.62 });
        }
      }
      if (drilling) {
        // The drill-master on a stand, and dust kicked up by the ranks
        kit.box(town, wood, 2.2, 0.7, 2.2, ground.x0 + 1.6, 0, ground.z1 - 1.6);
        extras.gathered.push({ x: ground.x0 + 1.6, z: ground.z1 - 1.6, r: 0, y: 0.7 });
        extras.smoke.unshift(new THREE.Vector3((ground.x0 + ground.x1) / 2, 0.6, (ground.z0 + ground.z1) / 2));
      }
      // Racks of polearms and a row of archery butts along the north side
      for (let k = 0; k < 3; k++) {
        const x = ground.x0 + 1.2 + k * 2.6;
        if (x > ground.x1 - 1) break;
        kit.box(town, wood, 1.8, 1.0, 0.16, x, 0, r.z0 + 0.8);
        for (let j = 0; j < 4; j++) kit.box(town, kit.paint(0x9aa0a4, 'metal'), 0.06, 2.3, 0.06, x - 0.7 + j * 0.46, 0, r.z0 + 0.8);
      }
    }
    // Tents along the south side
    const tents = Math.max(2, Math.min(Math.floor((w - 3) / 3), Math.round(spec.troops / 1800)));
    for (let i = 0; i < tents; i++) {
      const x = r.x1 - 2.4 - i * 3;
      const z = r.z1 - 2.5;
      kit.cyl(town, kit.paint(C.canvas), 0, 1.25, 1.7, x, 0, z);
      kit.box(town, kit.paint(C.timber), 0.07, 0.5, 0.07, x, 1.6, z);
    }
    // A watchtower in the corner
    if (tier >= 2 || def >= 2) {
      const tx = r.x0 + 2.4;
      const tz = r.z1 - 2.6;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) kit.box(town, kit.paint(C.timber), 0.26, 6.4, 0.26, tx + sx * 1.1, 0, tz + sz * 1.1);
      }
      kit.box(town, wood, 3.2, 0.2, 3.2, tx, 5, tz);
      kit.box(town, wood, 3.2, 0.7, 0.12, tx, 5.2, tz + 1.55);
      kit.box(town, wood, 3.2, 0.7, 0.12, tx, 5.2, tz - 1.55);
      kit.roof(town, kit.paint(C.thatch), 4.2, 4.2, 1.5, tx, 6.4, tz, 0, { ridge: 0.06, lift: 0.1 });
    }
    for (let k = 0; k < 3; k++) {
      const z = r.z0 + 2 + k * ((d - 9) / 2);
      kit.box(town, kit.paint(C.timber), 0.16, 5.6, 0.16, g0 - 1.2, 0, z);
      extras.flags.push({ p: new THREE.Vector3(g0 - 1.2, 4.9, z), size: 1 });
    }
    const fire = new THREE.Vector3(r.x1 - 3, 0.5, r.z1 - 5.6);
    kit.cyl(town, kit.paint(C.bronze, 'metal'), 0.5, 0.34, 0.5, fire.x, 0, fire.z);
    extras.lamps.push(fire.clone().setY(1.0));
    extras.smoke.push(fire.clone().setY(1.4));
    hit('barracks', cx, cz, w, 4.5, d);
    glow('barracks', cx, 0.26, cz, w + 1.5, d + 1.5);
    districts.barracks = {
      anchor: new THREE.Vector3(cx, 8, cz),
      focus: new THREE.Vector3(cx, 1.5, cz),
      dist: Math.max(46, w * 1.9),
    };
  }

  // =============================================================== farmland
  {
    const harvest = spec.event === 'harvest';
    const drought = spec.event === 'drought';
    const tones = harvest ? FIELD_HARVEST : drought ? FIELD_DROUGHT : FIELD[spec.season];
    const paddies = !drought && !harvest && spec.river && (spec.season === 'spring' || spec.season === 'summer');
    let opening = spec.works === 'farming';
    const share = [0.5, 0.62, 0.74, 0.86, 0.96][farming - 1];
    const path = kit.paint(C.road, 'earth');
    let first: Rect | null = null;
    for (const zone of L.fieldZones) {
      const zw = zone.x1 - zone.x0;
      const zd = zone.z1 - zone.z0;
      if (zw < 12 || zd < 10) continue;
      if (!first) first = zone;
      const cols = Math.max(1, Math.round(zw / 19));
      const rows = Math.max(1, Math.round(zd / 12.5));
      const pw = zw / cols;
      const pd = zd / rows;
      kit.box(town, path, zw + 1, 0.05, zd + 1, (zone.x0 + zone.x1) / 2, 0, (zone.z0 + zone.z1) / 2);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = zone.x0 + (c + 0.5) * pw;
          const z = zone.z0 + (r + 0.5) * pd;
          // Land nearest the gates is taken up first; the rest waits for a richer city
          const far = Math.hypot(x, z - L.outer) / (L.outer + 90);
          if (far * 0.75 + land() * 0.45 > share + 0.12) {
            if (opening && far < 0.8) {
              // The governor's works: waste being broken into a new field
              opening = false;
              kit.patch(town, kit.paint(0x6b5536, 'field'), pw - 1.3, pd - 1.3, x, 0.08, z, 0);
              kit.box(town, wood, 2.4, 0.9, 1.3, x - pw / 2 + 2, 0, z - pd / 2 + 1.4);
              for (let k = 0; k < 9; k++) {
                extras.gathered.push({ x: x + (dress() - 0.5) * (pw - 3), z: z + (dress() - 0.5) * (pd - 3), r: dress() * Math.PI * 2 });
              }
              continue;
            }
            if (land() < 0.35) {
              const f = kit.frame(town, x, z, land() < 0.5 ? 0 : Math.PI / 2);
              kit.box(f, kit.paint(C.mudWall), 3.6, 1.7, 2.8, 0, 0, 0);
              kit.roof(f, kit.paint(C.thatch), 4.7, 3.9, 1.35, 0, 1.7, 0, 0, { ridge: 0.72, lift: 0.04 });
              if (spec.season === 'autumn' || spec.season === 'winter') {
                kit.cyl(f, kit.paint(0xb39a52), 0, 0.9, 1.4, 3.2, 0, 0.6);
              }
              if (land() < 0.5) extras.smoke.push(new THREE.Vector3(x, 3.3, z));
              extras.trees.push({ x: x - 3.4, z: z - 2.2, s: 1.1 + land() * 0.5 });
            }
            continue;
          }
          const wet = paddies && land() < 0.55;
          const tone = wet ? mixHex(0x3d5a52, tones[0], 0.35) : tones[Math.floor(land() * tones.length)];
          const turned = land() < 0.3;
          kit.patch(
            town,
            kit.paint(tone, wet ? 'matte' : 'field'),
            turned ? pd - 1.3 : pw - 1.3,
            turned ? pw - 1.3 : pd - 1.3,
            x,
            0.08,
            z,
            turned ? Math.PI / 2 : 0
          );
          if (harvest) {
            // Sheaves stooked across the stubble and reapers still at work
            const stooks = 3 + Math.floor(dress() * 4);
            for (let k = 0; k < stooks; k++) {
              kit.cyl(town, kit.paint(0xc9a43e), 0, 0.62, 1.15, x + (dress() - 0.5) * (pw - 4), 0.08, z + (dress() - 0.5) * (pd - 4));
            }
            if (dress() < 0.6) {
              for (let k = 0; k < 3; k++) {
                extras.gathered.push({ x: x + (dress() - 0.5) * (pw - 4), z: z + (dress() - 0.5) * (pd - 4), r: dress() * Math.PI * 2 });
              }
            }
          }
        }
      }
      if (drought) extras.smoke.unshift(new THREE.Vector3((zone.x0 + zone.x1) / 2, 0.5, (zone.z0 + zone.z1) / 2));
      hit('fields', (zone.x0 + zone.x1) / 2, (zone.z0 + zone.z1) / 2, zw, 2.4, zd);
      glow('fields', (zone.x0 + zone.x1) / 2, 0.3, (zone.z0 + zone.z1) / 2, zw + 3, zd + 3);
    }
    const zone = first ?? { x0: 8, x1: 30, z0: L.outer + 10, z1: L.outer + 40 };
    const ax = (zone.x0 + zone.x1) / 2;
    const az = Math.min((zone.z0 + zone.z1) / 2, zone.z0 + 20);
    districts.fields = {
      anchor: new THREE.Vector3(ax, 6, az),
      focus: new THREE.Vector3(ax * 0.7, 1, (zone.z0 + zone.z1) / 2 - 8),
      dist: Math.max(70, (zone.x1 - zone.x0) * 1.25),
    };
  }

  // =============================================================== outside the south gate
  if (spec.event === 'fair' || spec.event === 'plague') {
    const rowZ = L.moat ? L.moat.inner + L.moat.width + 2.6 : L.outer + 4.6;
    const fair = spec.event === 'fair';
    for (let i = 0; i < (fair ? 7 : 5); i++) {
      for (const sx of fair ? [-1, 1] : [-1]) {
        const x = sx * (7.5 + i * 4.3);
        if (fair) {
          // Travelling merchants' booths under bright awnings
          const f = kit.frame(town, x, rowZ, 0);
          for (const px of [-1, 1]) {
            for (const pz of [-1, 1]) kit.box(f, wood, 0.1, 1.8, 0.1, px * 1.3, 0, pz * 0.9);
          }
          kit.roof(f, kit.paint(CLOTH[(i + (sx > 0 ? 3 : 0)) % CLOTH.length]), 3.4, 2.6, 0.85, 0, 1.8, 0, 0, { ridge: 0.7, lift: 0.02 });
          kit.box(f, wood, 2.2, 0.6, 1.0, 0, 0, 0);
          for (let k = 0; k < 3; k++) kit.box(f, kit.paint(CLOTH[(i + k) % CLOTH.length]), 0.4, 0.3, 0.4, -0.6 + k * 0.6, 0.6, 0);
          for (let k = 0; k < 3; k++) {
            extras.gathered.push({ x: x + (dress() - 0.5) * 3, z: rowZ - 1.6 - dress() * 1.2, r: dress() * Math.PI * 2 });
          }
        } else {
          // The sick are kept in tents outside the walls
          kit.cyl(town, kit.paint(0xd9d2c0), 0, 1.5, 1.9, x, 0, rowZ);
          kit.box(town, kit.paint(C.timber), 0.07, 0.5, 0.07, x, 1.8, rowZ);
        }
      }
    }
    if (fair) {
      // Pack animals and carts drawn up on the road
      for (let k = 0; k < 4; k++) kit.box(town, wood, 1.4, 0.9, 2.4, (k % 2 === 0 ? -1 : 1) * 1.3, 0.2, rowZ + 6 + k * 4.2);
      for (let i = 0; i < 16; i++) extras.gathered.push({ x: (dress() - 0.5) * 4, z: L.outer + 1.5 + dress() * 16, r: dress() * Math.PI * 2 });
    } else {
      // Pyres beyond the tents
      extras.fires.push(new THREE.Vector3(-(7.5 + 5 * 4.3 + 4), 0.8, rowZ + 1));
      extras.fires.push(new THREE.Vector3(-(7.5 + 5 * 4.3 + 10), 0.8, rowZ - 0.5));
    }
  }

  // =============================================================== the waterfront
  if (L.river) {
    const bank = L.river.x - L.river.half - 2;
    const plank = kit.paint(0x5c4832);
    const quays = 2 + Math.round(trade / 2);
    for (let i = 0; i < quays; i++) {
      const z = (i - (quays - 1) / 2) * 17;
      kit.box(town, plank, 18, 0.5, 3, bank + 5, -0.1, z);
      for (let k = 0; k < 4; k++) {
        for (const s of [-1, 1]) kit.cyl(town, kit.paint(C.timber), 0.2, 0.2, 2.6, bank - 2 + k * 5, -2, z + s * 1.3);
      }
      // A boat moored at each quay
      const f = kit.frame(town, bank + 9 + (land() - 0.5) * 3, z + (i % 2 === 0 ? 4.4 : -4.4), (land() - 0.5) * 0.3);
      const len = 8 + land() * 4 + trade * 0.6;
      kit.box(f, kit.paint(0x4a3826), len, 1.0, 2.4, 0, -0.9, 0);
      kit.box(f, kit.paint(0x4a3826), 1.6, 1.3, 1.9, len / 2 + 0.4, -0.8, 0);
      kit.box(f, kit.paint(0x4a3826), 1.4, 1.5, 1.7, -len / 2 - 0.3, -0.8, 0);
      kit.box(f, kit.paint(C.plasterDim), len * 0.36, 1.2, 1.9, -len * 0.14, 0.1, 0);
      kit.roof(f, kit.paint(C.thatch), len * 0.44, 2.6, 0.8, -len * 0.14, 1.3, 0, 0, { ridge: 0.8, lift: 0.05 });
      kit.box(f, kit.paint(C.timber), 0.18, 6.2, 0.18, len * 0.16, 0.1, 0);
      kit.box(f, kit.paint(C.canvas), 0.1, 3.6, 3.0, len * 0.16 + 0.15, 2.2, 0);
    }
    // Warehouses behind the quays
    for (const s of [-1, 1]) {
      const f = kit.frame(town, bank - 9, s * (quays * 8.5 + 3), Math.PI / 2);
      kit.box(f, kit.paint(C.mudWall), 11, 2.6, 4.4, 0, 0, 0);
      kit.roof(f, kit.paint(HOUSE_TILES[1], 'roof'), 12.4, 5.8, 1.6, 0, 2.6, 0, 0, { ridge: 0.86, lift: 0.14 });
    }
    kit.box(town, kit.paint(C.road, 'earth'), 9, 0.07, quays * 17 + 16, bank - 3.5, 0, 0);
    extras.lamps.push(new THREE.Vector3(bank - 1, 1.8, 8.5), new THREE.Vector3(bank - 1, 1.8, -8.5));

    // Time-Traveler Paddlewheel Steamship moored at the main river berth
    if (spec.hasSteamship) {
      const sx = bank + 14.5;
      const sz = 0;
      const sf = kit.frame(town, sx, sz, 0.06);
      const ironHull = kit.paint(0x2d3238, 'metal');
      const brass = kit.paint(C.gold, 'metal');
      kit.box(sf, ironHull, 17.5, 1.45, 3.8, 0, -0.85, 0);
      kit.box(sf, ironHull, 2.6, 1.5, 2.8, 9.4, -0.75, 0);
      kit.box(sf, ironHull, 2.2, 1.5, 2.8, -9.2, -0.75, 0);
      // Armored deckhouse & wheelhouse
      kit.box(sf, kit.paint(0x464b52, 'wall'), 8.8, 1.7, 3.1, -0.4, 0.6, 0);
      kit.box(sf, kit.paint(C.timber), 2.8, 1.3, 2.4, 2.2, 2.3, 0);
      kit.box(sf, brass, 3.1, 0.18, 2.7, 2.2, 3.6, 0);
      // Paddlewheel sponsons
      for (const side of [-1, 1]) {
        kit.box(sf, ironHull, 3.8, 1.1, 0.9, -0.6, 0.4, side * 2.25);
      }
      // Twin iron funnels with brass collars & coal smoke
      for (const fx of [-2.4, -0.2]) {
        kit.cyl(sf, kit.paint(0x1f2226, 'metal'), 0.42, 0.48, 5.2, fx, 2.2, 0);
        kit.cyl(sf, brass, 0.47, 0.47, 0.28, fx, 6.4, 0);
        extras.smoke.unshift(frameToWorld(sf, fx, 7.5, 0));
      }
      hit('market', sx, sz, 19, 6, 6);
    }
  }

  // =============================================================== time-traveler props & hero beacons
  const waterwheelSpots: Array<{ x: number; z: number; rot: number }> = [];
  if (spec.hasAgriculture && L.fieldZones.length > 0) {
    const stone = kit.paint(C.stone, 'wall');
    const sluiceWood = kit.paint(C.timber);
    for (let i = 0; i < Math.min(2, L.fieldZones.length); i++) {
      const zf = L.fieldZones[i];
      const wx = i === 0 ? zf.x0 + 3.2 : zf.x1 - 3.2;
      const wz = zf.z0 + 4.5;
      // Stone aqueduct channel & timber axle trestles
      kit.box(town, stone, 2.6, 0.9, 9.5, wx, 0, wz);
      kit.box(town, kit.paint(0x3b666b), 1.6, 0.2, 9.1, wx, 0.82, wz);
      for (const s of [-1, 1]) {
        kit.box(town, sluiceWood, 0.28, 3.1, 0.28, wx + s * 1.15, 0.8, wz);
      }
      waterwheelSpots.push({ x: wx, z: wz, rot: i === 0 ? 0 : Math.PI });
    }
  }

  const balloonAnchor = spec.hasBalloon
    ? new THREE.Vector3(H - 2.2, L.wallH, -H + 2.2)
    : null;
  if (balloonAnchor) {
    // Timber winch capstan & brazier platform on the northeast bastion
    kit.box(town, kit.paint(C.stone, 'wall'), 4.6, 0.45, 4.6, balloonAnchor.x, balloonAnchor.y, balloonAnchor.z);
    kit.box(town, kit.paint(C.timber), 1.8, 1.1, 1.2, balloonAnchor.x, balloonAnchor.y + 0.45, balloonAnchor.z);
  }

  const govBannerSpot = spec.governorChar
    ? new THREE.Vector3(Math.min(cw / 2 - 1.2, 5.4), 0, hallFront + 1.8)
    : null;
  if (govBannerSpot) {
    kit.cyl(town, kit.paint(C.stone, 'wall'), 0.65, 0.8, 0.55, govBannerSpot.x, 0, govBannerSpot.z);
    kit.box(town, kit.paint(C.lacquer), 0.22, 8.8, 0.22, govBannerSpot.x, 0.5, govBannerSpot.z);
    kit.box(town, kit.paint(C.gold, 'metal'), 2.3, 0.16, 0.16, govBannerSpot.x + 1.05, 8.7, govBannerSpot.z);
    kit.cyl(town, kit.paint(C.gold, 'metal'), 0, 0.34, 0.65, govBannerSpot.x, 9.3, govBannerSpot.z);
  }

  const wayfarerSpot = spec.hasWanderingHero
    ? new THREE.Vector3(9.8, 0, (L.moat ? L.moat.inner + L.moat.width : L.outer) + 5.4)
    : null;
  if (wayfarerSpot) {
    // Golden Wayfarer Pavilion outside the south gate
    const wf = kit.frame(town, wayfarerSpot.x, wayfarerSpot.z, 0.2);
    kit.cyl(wf, kit.paint(C.stone, 'pave'), 2.7, 3.0, 0.45, 0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 2 + Math.PI / 4;
      kit.box(wf, kit.paint(C.lacquer), 0.2, 2.5, 0.2, Math.cos(ang) * 1.85, 0.45, Math.sin(ang) * 1.85);
    }
    kit.roof(wf, kit.paint(C.gold, 'metal'), 4.8, 4.8, 1.55, 0, 2.95, 0, 0, { ridge: 0.08, lift: 0.45 });
    kit.box(wf, kit.paint(C.lacquer), 0.16, 5.8, 0.16, -2.8, 0, 1.4);
    extras.gathered.push(
      { x: wayfarerSpot.x - 0.5, z: wayfarerSpot.z + 0.4, r: 0.8 },
      { x: wayfarerSpot.x + 0.6, z: wayfarerSpot.z - 0.3, r: -2.1 }
    );
    hit('hall', wayfarerSpot.x, wayfarerSpot.z, 6.5, 6.2, 6.5);
  }

  // =============================================================== commandery specialty wards (B1)
  const southEdge = (L.moat ? L.moat.inner + L.moat.width : L.outer) + 4.5;
  let armillarySpot: THREE.Vector3 | null = null;
  if (spec.specialty === 'granary' && L.fieldZones.length > 0) {
    const zf = L.fieldZones[0];
    const gx = Math.min(zf.x1 - 5, zf.x0 + 10.5);
    const gz = zf.z0 + 8.5;
    const gf = kit.frame(town, gx, gz, 0);
    kit.box(gf, kit.paint(C.stone, 'pave'), 11.5, 0.55, 8.2, 0, 0, 0);
    for (let i = -1; i <= 1; i++) {
      kit.cyl(gf, kit.paint(C.stone, 'wall'), 1.65, 1.8, 3.2, i * 3.4, 0.55, -0.8);
      kit.cyl(gf, kit.paint(HOUSE_TILES[0], 'roof'), 0, 2.15, 1.5, i * 3.4, 3.75, -0.8);
    }
    kit.box(gf, wood, 2.4, 0.7, 1.4, -2.2, 0.55, 2.4);
    for (let k = 0; k < 4; k++) {
      kit.box(gf, kit.paint(C.canvas), 0.65, 0.45, 0.5, 1.2 + (k % 2) * 0.85, 0.55 + Math.floor(k / 2) * 0.45, 2.3);
    }
    hit('fields', gx, gz, 12.5, 5.8, 9.2);
  } else if (spec.specialty === 'emporium') {
    const ex = Math.min(H - 8.5, 11.5);
    const ez = Math.min(H - 8.5, crossZ + 7.2);
    const gilt = kit.paint(C.gold, 'metal');
    const topY = hallBlock(kit, town, {
      x: ex,
      z: ez,
      w: 7.4,
      d: 5.2,
      h: 3.1,
      roofH: 2.4,
      roof: kit.paint(HOUSE_TILES[1], 'roof'),
      double: true,
      lift: 0.55,
      crest: gilt,
    });
    extras.flags.push({ p: new THREE.Vector3(ex + 4.1, topY - 1.2, ez + 2.6), size: 1.15 });
    extras.lanterns.push(new THREE.Vector3(ex - 2.6, 2.6, ez + 3.0), new THREE.Vector3(ex + 2.6, 2.6, ez + 3.0));
    hit('market', ex, ez, 9, topY + 1, 7);
  } else if (spec.specialty === 'armory') {
    const ax = -13.5;
    const az = southEdge + 5.8;
    const af = kit.frame(town, ax, az, 0);
    // Timber warhorse corral + blacksmith forge shed
    kit.box(af, kit.paint(C.packed, 'earth'), 12.5, 0.14, 9.5, 0, 0, 0);
    kit.box(af, wood, 12.2, 1.2, 0.2, 0, 0, -4.5);
    kit.box(af, wood, 12.2, 1.2, 0.2, 0, 0, 4.5);
    kit.box(af, wood, 0.2, 1.2, 9.0, -6.0, 0, 0);
    kit.box(af, kit.paint(C.stone, 'wall'), 4.6, 2.5, 3.8, 3.4, 0, -1.8);
    kit.roof(af, kit.paint(C.tile, 'roof'), 5.6, 4.8, 1.35, 3.4, 2.5, -1.8, 0, { ridge: 0.8 });
    kit.cyl(af, kit.paint(0x2d2a28, 'wall'), 0.48, 0.62, 4.2, 4.8, 1.2, -2.6);
    // Stylized warhorse silhouettes inside paddock
    for (let k = 0; k < 3; k++) {
      const hx = -3.8 + k * 2.3;
      const hz2 = 0.6 + (k % 2) * 1.6;
      kit.box(af, kit.paint(k === 1 ? 0x7c4a2d : 0x4b3425), 1.45, 0.95, 0.52, hx, 0.55, hz2);
      kit.box(af, kit.paint(k === 1 ? 0x7c4a2d : 0x4b3425), 0.45, 0.75, 0.42, hx + 0.65, 1.15, hz2);
    }
    extras.fires.push(new THREE.Vector3(ax + 4.8, 1.8, az - 1.2));
    extras.smoke.unshift(new THREE.Vector3(ax + 4.8, 5.4, az - 2.6));
    hit('barracks', ax, az, 13.5, 5.5, 10.5);
  } else if (spec.specialty === 'academy') {
    const acx = -Math.min(H - 6.5, cw / 2 + 5.8);
    const acz = hz + 2.2;
    const af = kit.frame(town, acx, acz, 0);
    kit.cyl(af, kit.paint(C.stone, 'pave'), 4.2, 4.6, 0.65, 0, 0, 0);
    kit.cyl(af, kit.paint(C.lacquer), 2.8, 2.8, 2.7, 0, 0.65, 0);
    kit.roof(af, kit.paint(C.tile, 'roof'), 6.8, 6.8, 2.1, 0, 3.35, 0, 0, { ridge: 0.08, lift: 0.5 });
    // Stone plinth south of pavilion for the rotating bronze armillary sphere
    kit.box(af, kit.paint(C.stone, 'wall'), 1.8, 1.2, 1.8, 0, 0, 4.6);
    armillarySpot = new THREE.Vector3(acx, 2.35, acz + 4.6);
    hit('hall', acx, acz + 1.5, 9.5, 6.5, 11.5);
  } else if (spec.specialty === 'bastion') {
    // Outer stone barbican (瓮城) bastions & rampart counterweight trebuchets
    const wallMat = kit.paint(C.brick, 'wall');
    for (const sx of [-1, 1]) {
      const bx = sx * 6.8;
      const bz = L.outer + 2.6;
      kit.box(town, wallMat, 4.2, L.wallH * 0.92, 5.2, bx, 0, bz);
      // Counterweight trebuchet on the south wall walk
      const tx = sx * 12.5;
      const tz = L.half + L.wallT * 0.5;
      kit.box(town, kit.paint(C.timber), 1.6, 2.4, 2.2, tx, L.wallH, tz);
      kit.box(town, kit.paint(C.timber), 0.22, 4.6, 0.22, tx, L.wallH + 1.8, tz + 0.4);
      kit.box(town, kit.paint(C.stone, 'wall'), 0.9, 0.9, 0.9, tx, L.wallH + 1.2, tz - 0.7);
    }
    hit('walls', 0, L.outer + 2.5, 19, L.wallH + 4, 8);
  }

  // =============================================================== historical landmarks (B2)
  if (spec.landmarkId === 'imperial_que') {
    // Luoyang: Vermilion Twin Imperial Que (皇城双阙) flanking the royal avenue
    const gilt = kit.paint(C.gold, 'metal');
    for (const sx of [-1, 1]) {
      const qx = sx * 5.8;
      const qz = crossZ - 2.4;
      kit.box(town, kit.paint(C.stone, 'wall'), 3.4, 5.2, 3.4, qx, 0, qz);
      kit.box(town, kit.paint(C.lacquer), 2.8, 2.4, 2.8, qx, 5.2, qz);
      kit.roof(town, kit.paint(C.tile, 'roof'), 5.0, 5.0, 2.0, qx, 7.6, qz, 0, { ridge: 0.1, lift: 0.55 });
      kit.cyl(town, gilt, 0, 0.35, 0.9, qx, 9.6, qz);
    }
  } else if (spec.landmarkId === 'weiyang_arsenal') {
    // Chang'an: Monumental Bell-and-Drum Arsenal Tower
    const wx = -Math.min(H - 6.5, 8.2);
    const wz = hallFront + 3.4;
    kit.box(town, kit.paint(C.stone, 'wall'), 6.2, 3.8, 6.2, wx, 0, wz);
    const top = hallBlock(kit, town, {
      x: wx,
      z: wz,
      w: 4.8,
      d: 4.8,
      h: 2.8,
      roofH: 2.4,
      roof: kit.paint(C.tile, 'roof'),
      base: 3.8,
      double: true,
      crest: kit.paint(C.bronze, 'metal'),
    });
    hit('walls', wx, wz, 7.5, top + 1, 7.5);
  } else if (spec.landmarkId === 'bronze_sparrow') {
    // Ye: Soaring Triple-Platform Bronze Sparrow Terrace (铜雀三台) on the northwest rampart
    const bx = -H * 0.52;
    const bz = -H + 3.2;
    kit.box(town, kit.paint(C.brick, 'wall'), 9.6, L.wallH + 3.6, 6.8, bx, 0, bz);
    const top = hallBlock(kit, town, {
      x: bx,
      z: bz,
      w: 7.2,
      d: 4.8,
      h: 3.2,
      roofH: 2.8,
      roof: kit.paint(C.tile, 'roof'),
      base: L.wallH + 3.6,
      double: true,
      lift: 0.65,
      crest: kit.paint(C.gold, 'metal'),
    });
    kit.cyl(town, kit.paint(C.gold, 'metal'), 0, 0.55, 1.6, bx, top, bz);
    hit('hall', bx, bz, 11, top + 2, 8);
  } else if (spec.landmarkId === 'yingchuan_granary' && L.fieldZones.length > 0) {
    // Xuchang: Grand Walled Imperial Granary Compound
    const zf = L.fieldZones[0];
    const gx = zf.x0 + 14;
    const gz = zf.z0 + 16;
    const gf = kit.frame(town, gx, gz, 0);
    kit.box(gf, kit.paint(C.mudWall, 'wall'), 13, 1.8, 0.4, 0, 0, -5);
    kit.box(gf, kit.paint(C.mudWall, 'wall'), 13, 1.8, 0.4, 0, 0, 5);
    for (const sx of [-3.4, 3.4]) {
      for (const sz of [-2.2, 2.2]) {
        kit.cyl(gf, kit.paint(C.plaster), 1.8, 1.9, 3.0, sx, 0, sz);
        kit.cyl(gf, kit.paint(C.thatch), 0, 2.3, 1.6, sx, 3.0, sz);
      }
    }
    hit('fields', gx, gz, 14, 5.5, 11);
  } else if (spec.landmarkId === 'dujiangyan') {
    // Chengdu: Dujiangyan Bamboo-Gabion Diversion Weir & Brocade Drying Racks
    const dx = -14.5;
    const dz = southEdge + 8.5;
    const df = kit.frame(town, dx, dz, 0.25);
    kit.box(df, kit.paint(0x3a6b70), 16, 0.22, 7.5, 0, 0.08, 0);
    // Fish-mouth gabion levee
    kit.box(df, kit.paint(0x9a8858, 'wall'), 12.5, 1.15, 2.1, -1.2, 0.1, 0);
    kit.cyl(df, kit.paint(0x9a8858, 'wall'), 0.9, 1.2, 1.15, 5.4, 0.1, 0);
    // Colorful Shu brocade silk racks nearby
    for (let k = 0; k < 3; k++) {
      const rx = dx + 4 + k * 2.8;
      const rz = dz - 6.8;
      kit.box(town, wood, 2.2, 2.1, 0.14, rx, 0, rz);
      kit.box(town, kit.paint(CLOTH[k % CLOTH.length]), 1.9, 1.5, 0.08, rx, 0.45, rz);
    }
    hit('fields', dx, dz - 2, 18, 4, 14);
  } else if (spec.landmarkId === 'sword_gate') {
    // Jiange: Towering Sword Gate Crags & Cliffside Timber Plank Gallery (剑门栈道)
    const rock = kit.paint(0x5b554c, 'wall');
    for (const sx of [-1, 1]) {
      const cx2 = sx * (L.outer + 6.5);
      const cz2 = L.outer - 2;
      kit.box(town, rock, 9.5, L.wallH + 11.5, 11.5, cx2, 0, cz2);
      kit.box(town, rock, 6.2, L.wallH + 15.5, 7.2, cx2 + sx * 2.2, 0, cz2 - 1.5);
      // Cliffside plank road gallery brackets
      kit.box(town, kit.paint(C.timber), 2.4, 0.28, 10.8, cx2 - sx * 5.2, 4.2, cz2);
      for (let p = -4; p <= 4; p += 2) {
        kit.box(town, kit.paint(C.timber), 1.8, 2.2, 0.2, cx2 - sx * 4.6, 2.2, cz2 + p);
      }
    }
    hit('walls', 0, L.outer, (L.outer + 12) * 2, L.wallH + 16, 14);
  } else if (spec.landmarkId === 'stone_citadel' && L.river) {
    // Jianye: Red-Sandstone Shitoucheng Bluff Citadel overlooking the Yangtze
    const bank = L.river.x - L.river.half - 5.5;
    const sz = -22;
    kit.box(town, kit.paint(0x8c4b38, 'wall'), 11.5, 6.8, 10.5, bank, 0, sz);
    kit.box(town, kit.paint(C.brick, 'wall'), 9.2, 3.2, 8.2, bank, 6.8, sz);
    kit.roof(town, kit.paint(C.tile, 'roof'), 7.4, 6.6, 2.2, bank, 10.0, sz, 0, { lift: 0.45 });
    extras.flags.push({ p: new THREE.Vector3(bank + 3.8, 11.2, sz + 3.2), size: 1.35 });
    hit('walls', bank, sz, 12.5, 13, 11.5);
  } else if (spec.landmarkId === 'red_cliffs_yard' && L.river) {
    // Chaisang: Fortified Yangtze Naval Stockade (赤壁水寨) & Admiral Watchtower
    const bank = L.river.x - L.river.half + 3.5;
    const nz = 21;
    kit.box(town, kit.paint(C.timber), 13.5, 1.9, 0.35, bank, -0.4, nz - 5.5);
    kit.box(town, kit.paint(C.timber), 13.5, 1.9, 0.35, bank, -0.4, nz + 5.5);
    kit.box(town, kit.paint(C.timber), 0.35, 1.9, 11.0, bank + 6.6, -0.4, nz);
    kit.box(town, kit.paint(C.timber), 3.4, 6.5, 3.4, bank - 3.5, 0, nz);
    kit.roof(town, kit.paint(C.thatch), 4.8, 4.8, 1.7, bank - 3.5, 6.5, nz, 0, { lift: 0.3 });
    extras.flags.push({ p: new THREE.Vector3(bank - 3.5, 8.4, nz), size: 1.4 });
    hit('barracks', bank, nz, 15, 9.5, 12.5);
  } else if (spec.landmarkId === 'han_citadel') {
    // Xiangyang: Fortified Han River Customs Bridgehead
    const hx = 6.2;
    const hz2 = southEdge + 1.5;
    kit.box(town, kit.paint(C.stone, 'wall'), 5.2, 5.8, 5.2, hx, 0, hz2);
    kit.roof(town, kit.paint(C.tile, 'roof'), 6.6, 6.6, 2.0, hx, 5.8, hz2, 0, { lift: 0.45 });
    hit('walls', hx, hz2, 6.8, 8.2, 6.8);
  } else if (spec.landmarkId === 'hexi_pastures') {
    // Wuwei: Tall Western Rammed-Earth Silk Road Beacon Tower (烽燧)
    const bx = -16.5;
    const bz = southEdge + 9.5;
    kit.box(town, kit.paint(C.rammed, 'wall'), 4.6, 8.8, 4.6, bx, 0, bz);
    kit.box(town, kit.paint(C.rammed, 'wall'), 3.4, 3.4, 3.4, bx, 8.8, bz);
    extras.fires.push(new THREE.Vector3(bx, 12.6, bz));
    extras.smoke.unshift(new THREE.Vector3(bx, 13.0, bz));
    hit('barracks', bx, bz, 7, 13.5, 7);
  }

  kit.finish(town);

  // =============================================================== the living details
  const env = buildEnvironment(spec, L, bag, extras.trees);
  group.add(env.group);

  // The garrison and the townsfolk, drawn with the shared figure kit.
  // In a frightened or sickened city most people stay indoors
  const abroad = spec.event === 'plague' ? 0.25 : riot ? 0.3 : spec.unrest ? 0.5 : 1;
  const townsfolk = extras.people.filter((_, i) => ((i * 7) % 20) / 20 < abroad).concat(extras.gathered);
  const people = buildCityPeople(
    {
      soldiers: extras.soldiers,
      townsfolk,
      gathered: extras.gathered.length,
      drillBand: spec.drillBand,
      drilling: spec.works === 'drill',
      agitated: riot,
      realm: pigment,
      myth: spec.myth,
    },
    bag,
    group
  );

  // Floodwater standing on the fields
  if (spec.event === 'flood') {
    const floodMat = bag.add(
      new THREE.MeshStandardMaterial({
        // Muddy water: dull enough that the low sun does not flare on it
        color: spec.myth ? 0x6c8078 : 0x86a09a,
        roughness: 0.5,
        metalness: 0,
        transparent: true,
        opacity: 0.93,
        emissive: 0x2c2a20,
        emissiveIntensity: 0.3,
      })
    );
    const sheets: Rect[] = L.fieldZones.map((z) => ({ x0: z.x0 - 5, x1: z.x1 + 5, z0: z.z0 - 3, z1: z.z1 + 6 }));
    if (L.river) sheets.push({ x0: L.outer + 20, x1: L.river.x - L.river.half + 4, z0: -L.outer, z1: L.outer + 80 });
    for (const sheet of sheets) {
      const geo = bag.add(new THREE.PlaneGeometry(sheet.x1 - sheet.x0, sheet.z1 - sheet.z0));
      geo.rotateX(-Math.PI / 2);
      const water = new THREE.Mesh(geo, floodMat);
      water.position.set((sheet.x0 + sheet.x1) / 2, 0.5, (sheet.z0 + sheet.z1) / 2);
      water.receiveShadow = true;
      group.add(water);
    }
  }

  // Banners in the owner's colour, flying in the city's wind
  const flagSet = buildCityFlags(extras.flags, spec.owner, pigment, env.wind, bag, group);

  // Braziers and lanterns
  const LAMP_GLOW = 1.6;
  const glowTexture = createGlowTexture(bag);
  const lampMat = bag.add(
    new THREE.SpriteMaterial({
      map: glowTexture,
      // Bright enough to glow, not so bright that bloom burns the lamp to a white ball
      color: new THREE.Color(0xff9a3c).multiplyScalar(spec.myth ? 1.9 : 1.3),
      transparent: true,
      opacity: spec.myth ? 0.95 : 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  const lamps = extras.lamps.map((p, i) => {
    const s = new THREE.Sprite(lampMat);
    s.position.copy(p);
    // The glow is sized to the brazier it sits on
    s.scale.setScalar(LAMP_GLOW);
    group.add(s);
    return { sprite: s, phase: i * 2.3 };
  });
  const lanternMat = bag.add(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(0xff5236).multiplyScalar(spec.myth ? 3.2 : 1.8),
      transparent: true,
      opacity: spec.myth ? 0.95 : 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  for (const p of extras.lanterns) {
    const s = new THREE.Sprite(lanternMat);
    s.position.copy(p);
    s.scale.setScalar(1.25);
    group.add(s);
  }
  // Fires: a hot glow that lights what stands near it
  const fireMat = bag.add(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(0xff5a1e).multiplyScalar(spec.myth ? 3.4 : 2),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  const blazes = extras.fires.map((p, i) => {
    const s = new THREE.Sprite(fireMat);
    s.position.copy(p);
    s.scale.setScalar(5.5);
    group.add(s);
    if (i < 3) {
      const light = new THREE.PointLight(0xff5a20, spec.myth ? 90 : 40, 42, 1.8);
      light.position.copy(p).setY(p.y + 2);
      group.add(light);
    }
    return { sprite: s, phase: i * 1.9 };
  });
  // A few real lights, so the gate and the hall are warmed by their own fires
  const warm = [districts.walls.anchor.clone().setY(3).add(new THREE.Vector3(0, 0, 5)), districts.hall.focus.clone().setY(4), districts.market.focus.clone().setY(4), districts.barracks.focus.clone().setY(3)];
  for (const p of warm) {
    const light = new THREE.PointLight(0xff9a48, spec.myth ? 46 : 20, 46, 1.8);
    light.position.copy(p);
    group.add(light);
  }

  // Hearth smoke
  const smokeMat = bag.add(
    new THREE.SpriteMaterial({
      map: createDustPuffTexture(bag),
      color: spec.myth ? 0x8f948f : 0xd8cfc0,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    })
  );
  const PUFFS = 4;
  const smoke = extras.smoke.slice(0, 16).flatMap((p, i) =>
    Array.from({ length: PUFFS }, (_, k) => {
      const mat = bag.add(smokeMat.clone());
      const s = new THREE.Sprite(mat);
      group.add(s);
      return { sprite: s, mat, origin: p, phase: k / PUFFS + i * 0.37 };
    })
  );
  const BLACK_PUFFS = 11;
  const blackSmoke = extras.fires.flatMap((p, i) =>
    Array.from({ length: BLACK_PUFFS }, (_, k) => {
      const mat = bag.add(smokeMat.clone());
      mat.color.setHex(0x1e1a17);
      const s = new THREE.Sprite(mat);
      group.add(s);
      return { sprite: s, mat, origin: p, phase: k / BLACK_PUFFS + i * 0.23 };
    })
  );
  const placeSmoke = (elapsed: number) => {
    for (const puff of smoke) {
      const t = (elapsed * 0.09 + puff.phase) % 1;
      puff.sprite.position.set(puff.origin.x + t * t * 5, puff.origin.y + t * 9, puff.origin.z - t * 1.5);
      const size = 1.2 + t * 4.6;
      puff.sprite.scale.set(size, size, 1);
      puff.mat.opacity = Math.sin(Math.PI * t) * (spec.myth ? 0.3 : 0.24);
    }
    for (const puff of blackSmoke) {
      const t = (elapsed * 0.05 + puff.phase) % 1;
      puff.sprite.position.set(puff.origin.x + t * t * 12, puff.origin.y + 1 + t * 22, puff.origin.z - t * 4);
      const size = 2.6 + t * 8.5;
      puff.sprite.scale.set(size, size, 1);
      puff.mat.opacity = Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.6 * 0.85;
    }
  };
  placeSmoke(0);

  // =============================================================== animated anachronisms & beacons
  const wheelTimberMat = bag.add(
    new THREE.MeshStandardMaterial({ color: C.timber, roughness: 0.82, metalness: 0.08 })
  );
  const wheelIronMat = bag.add(
    new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 0.52, metalness: 0.65 })
  );

  const waterwheels: THREE.Group[] = [];
  if (waterwheelSpots.length > 0) {
    const rimGeo = bag.add(new THREE.TorusGeometry(2.05, 0.14, 8, 20));
    rimGeo.rotateY(Math.PI / 2);
    const spokeGeo = bag.add(new THREE.BoxGeometry(0.12, 4.1, 0.14));
    const bucketGeo = bag.add(new THREE.BoxGeometry(0.9, 0.28, 0.32));
    for (const spot of waterwheelSpots) {
      const wheel = new THREE.Group();
      wheel.position.set(spot.x, 3.2, spot.z);
      wheel.rotation.y = spot.rot;
      for (const sx of [-0.45, 0.45]) {
        const rim = new THREE.Mesh(rimGeo, wheelTimberMat);
        rim.position.x = sx;
        rim.castShadow = true;
        wheel.add(rim);
      }
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Mesh(spokeGeo, wheelTimberMat);
        sp.rotation.x = (k * Math.PI) / 4;
        wheel.add(sp);
      }
      for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4;
        const bk = new THREE.Mesh(bucketGeo, wheelTimberMat);
        bk.position.set(0, Math.sin(ang) * 2.05, Math.cos(ang) * 2.05);
        bk.rotation.x = -ang;
        wheel.add(bk);
      }
      group.add(wheel);
      waterwheels.push(wheel);
    }
  }

  const paddleWheels: THREE.Group[] = [];
  if (spec.hasSteamship && L.river) {
    const bank = L.river.x - L.river.half - 2;
    const pRimGeo = bag.add(new THREE.TorusGeometry(1.35, 0.1, 6, 16));
    const pBladeGeo = bag.add(new THREE.BoxGeometry(0.16, 2.7, 0.58));
    const shipRoot = new THREE.Group();
    shipRoot.position.set(bank + 14.5, 0.25, 0);
    shipRoot.rotation.y = 0.06;
    for (const side of [-1, 1]) {
      const pw = new THREE.Group();
      pw.position.set(-0.6, 0, side * 2.25);
      const rim = new THREE.Mesh(pRimGeo, wheelIronMat);
      pw.add(rim);
      for (let k = 0; k < 4; k++) {
        const bl = new THREE.Mesh(pBladeGeo, wheelTimberMat);
        bl.rotation.z = (k * Math.PI) / 4;
        pw.add(bl);
      }
      shipRoot.add(pw);
      paddleWheels.push(pw);
    }
    group.add(shipRoot);
  }

  let balloonGroup: THREE.Group | null = null;
  let balloonBurner: THREE.Sprite | null = null;
  const balloonBaseY = balloonAnchor ? balloonAnchor.y + 18.5 : 0;
  if (balloonAnchor) {
    balloonGroup = new THREE.Group();
    balloonGroup.position.set(balloonAnchor.x, balloonBaseY, balloonAnchor.z);

    // Silk envelope with faction equatorial band
    const envGeo = bag.add(new THREE.SphereGeometry(4.1, 18, 14));
    envGeo.scale(1, 1.24, 1);
    const silkMat = bag.add(
      new THREE.MeshStandardMaterial({
        color: mixHex(0xd49a56, pigment, 0.32),
        roughness: 0.72,
        emissive: 0xff7b29,
        emissiveIntensity: spec.myth ? 0.28 : 0.16,
      })
    );
    const envelope = new THREE.Mesh(envGeo, silkMat);
    envelope.castShadow = true;
    balloonGroup.add(envelope);

    const bandGeo = bag.add(new THREE.CylinderGeometry(4.15, 4.05, 1.15, 18, 1, true));
    const bandMat = bag.add(
      new THREE.MeshStandardMaterial({
        color: pigment,
        roughness: 0.7,
        side: THREE.DoubleSide,
        emissive: pigment,
        emissiveIntensity: 0.14,
      })
    );
    balloonGroup.add(new THREE.Mesh(bandGeo, bandMat));

    const throatGeo = bag.add(new THREE.CylinderGeometry(1.3, 0.95, 1.2, 12));
    const throat = new THREE.Mesh(throatGeo, wheelTimberMat);
    throat.position.y = -4.9;
    balloonGroup.add(throat);

    // Wicker scout gondola + suspension ropes
    const basketGeo = bag.add(new THREE.BoxGeometry(1.55, 1.15, 1.55));
    const basketMat = bag.add(new THREE.MeshStandardMaterial({ color: 0x8b6b3e, roughness: 0.9 }));
    const basket = new THREE.Mesh(basketGeo, basketMat);
    basket.position.y = -7.3;
    basket.castShadow = true;
    balloonGroup.add(basket);

    const ropeGeo = bag.add(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 5));
    for (const rx of [-0.65, 0.65]) {
      for (const rz of [-0.65, 0.65]) {
        const rope = new THREE.Mesh(ropeGeo, wheelTimberMat);
        rope.position.set(rx, -6.0, rz);
        balloonGroup.add(rope);
      }
    }

    // Taut winch tether cable down to rampart bastion
    const tetherLen = 11.2;
    const tetherGeo = bag.add(new THREE.CylinderGeometry(0.04, 0.04, tetherLen, 5));
    const tether = new THREE.Mesh(tetherGeo, wheelTimberMat);
    tether.position.y = -7.9 - tetherLen / 2;
    balloonGroup.add(tether);

    const burnerMat = bag.add(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: new THREE.Color(0xff9436).multiplyScalar(spec.myth ? 3.2 : 2.1),
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    balloonBurner = new THREE.Sprite(burnerMat);
    balloonBurner.position.set(0, -5.4, 0);
    balloonBurner.scale.setScalar(4.4);
    balloonGroup.add(balloonBurner);

    group.add(balloonGroup);
  }

  let govBannerMesh: THREE.Mesh | null = null;
  if (govBannerSpot && spec.governorChar && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const baseCol = new THREE.Color(pigment);
      ctx.fillStyle = `#${baseCol.getHexString()}`;
      ctx.fillRect(0, 0, 128, 256);
      ctx.strokeStyle = '#e0b861';
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, 112, 240);
      ctx.strokeStyle = 'rgba(245, 236, 215, 0.45)';
      ctx.lineWidth = 3;
      ctx.strokeRect(18, 18, 92, 220);
      ctx.fillStyle = '#f8efd9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 78px "Noto Serif SC", "Songti SC", serif';
      ctx.fillText(spec.governorChar.slice(0, 1), 64, 108);
      ctx.fillStyle = '#e0b861';
      ctx.font = 'bold 26px "Noto Serif SC", "Songti SC", serif';
      ctx.fillText('太守', 64, 198);
    }
    const bannerTex = bag.add(new THREE.CanvasTexture(canvas));
    bannerTex.colorSpace = THREE.SRGBColorSpace;
    const bGeo = bag.add(new THREE.PlaneGeometry(1.9, 3.8, 1, 4));
    bGeo.translate(0.95, -1.9, 0);
    const bMat = bag.add(
      new THREE.MeshStandardMaterial({
        map: bannerTex,
        roughness: 0.78,
        side: THREE.DoubleSide,
        emissive: pigment,
        emissiveIntensity: 0.1,
      })
    );
    govBannerMesh = new THREE.Mesh(bGeo, bMat);
    govBannerMesh.position.set(govBannerSpot.x + 0.12, 8.65, govBannerSpot.z);
    govBannerMesh.castShadow = true;
    group.add(govBannerMesh);
  }

  let wayfarerBeacon: THREE.Sprite | null = null;
  if (wayfarerSpot) {
    const wfMat = bag.add(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: new THREE.Color(0xffdf6e).multiplyScalar(spec.myth ? 3.5 : 2.3),
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    wayfarerBeacon = new THREE.Sprite(wfMat);
    wayfarerBeacon.position.set(wayfarerSpot.x - 2.8, 5.9, wayfarerSpot.z + 1.4);
    wayfarerBeacon.scale.setScalar(4.8);
    group.add(wayfarerBeacon);

    const wfLight = new THREE.PointLight(0xffcf58, spec.myth ? 55 : 28, 34, 1.8);
    wfLight.position.set(wayfarerSpot.x, 4.2, wayfarerSpot.z);
    group.add(wfLight);
  }

  let armillaryOuter: THREE.Mesh | null = null;
  let armillaryInner: THREE.Mesh | null = null;
  if (armillarySpot) {
    const bronzeMat = bag.add(
      new THREE.MeshStandardMaterial({
        color: 0xc9a04a,
        roughness: 0.35,
        metalness: 0.85,
        emissive: 0x5c4214,
        emissiveIntensity: 0.18,
      })
    );
    const outerGeo = bag.add(new THREE.TorusGeometry(1.05, 0.07, 8, 24));
    const innerGeo = bag.add(new THREE.TorusGeometry(0.78, 0.06, 8, 20));
    armillaryOuter = new THREE.Mesh(outerGeo, bronzeMat);
    armillaryOuter.position.copy(armillarySpot);
    armillaryInner = new THREE.Mesh(innerGeo, bronzeMat);
    armillaryInner.position.copy(armillarySpot);
    group.add(armillaryOuter, armillaryInner);
  }

  const glowLevel: Record<DistrictId, number> = { hall: 0, market: 0, fields: 0, barracks: 0, walls: 0 };

  return {
    group,
    layout: L,
    fog: env.fog,
    exposure: env.exposure,
    districts,
    hitMeshes,
    setGlow: (id, level) => {
      glowLevel[id] = level;
    },
    update: (dt, elapsed, still) => {
      env.update(dt, elapsed, still);
      const k = still ? 1 : 1 - Math.exp(-dt * 9);
      for (const id of Object.keys(glowMats) as DistrictId[]) {
        const pulse = still ? 1 : 0.86 + 0.14 * Math.sin(elapsed * 3.2);
        const want = glowLevel[id] * 0.5 * pulse;
        glowMats[id].opacity += (want - glowMats[id].opacity) * k;
      }
      people.update(elapsed, still);
      if (still) return;
      for (const b of blazes) {
        b.sprite.scale.setScalar(5.5 * (0.85 + 0.2 * Math.sin(elapsed * 9.1 + b.phase) + 0.1 * Math.sin(elapsed * 21 + b.phase)));
      }
      flagSet.update(elapsed);
      for (const l of lamps) {
        l.sprite.scale.setScalar(LAMP_GLOW * (0.9 + 0.14 * Math.sin(elapsed * 7.3 + l.phase) + 0.06 * Math.sin(elapsed * 17.1 + l.phase)));
      }
      for (const ww of waterwheels) {
        ww.rotation.x = elapsed * 0.72;
      }
      for (const pw of paddleWheels) {
        pw.rotation.z = -elapsed * 1.15;
      }
      if (balloonGroup) {
        balloonGroup.position.y = balloonBaseY + Math.sin(elapsed * 0.85) * 0.68;
        balloonGroup.rotation.y = Math.sin(elapsed * 0.36) * 0.14;
      }
      if (balloonBurner) {
        balloonBurner.scale.setScalar(4.4 * (0.88 + 0.18 * Math.sin(elapsed * 6.4)));
      }
      if (govBannerMesh) {
        govBannerMesh.rotation.y = 0.18 + Math.sin(elapsed * 1.7 + 0.6) * 0.18;
      }
      if (wayfarerBeacon) {
        wayfarerBeacon.scale.setScalar(4.8 * (0.9 + 0.16 * Math.sin(elapsed * 3.8)));
      }
      if (armillaryOuter && armillaryInner) {
        armillaryOuter.rotation.y = elapsed * 0.55;
        armillaryOuter.rotation.x = 0.42;
        armillaryInner.rotation.x = elapsed * 0.85;
        armillaryInner.rotation.z = -0.5;
      }
      placeSmoke(elapsed);
    },
    dispose: () => bag.dispose(),
  };
}
