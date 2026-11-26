import * as THREE from 'three';
import type { DisposeBag } from '../duel/duelGeometry3D.js';
import { createFigureCrowd, figureTint, type FigureCrowd, type FigureKit } from '../gfx/figures.js';

/**
 * The people of the city close-up, drawn with the shared figure kit.
 *
 * The garrison stands on the drill ground in the kit its training has earned: raw levies in
 * plain robes with a spear, drilled men in lamellar with helmet and shield, and the better
 * drilled a company is, the more alike its men are dressed and the straighter they stand. At
 * drill, companies march on each other with weapons levelled and fall back. Townsfolk in long
 * robes stand about their business or pace a few steps and turn; a crowd brought together by
 * an event stirs where it stands.
 */
export interface CityPeopleSpec {
  /** `c` is the company a soldier stands in; `r` is the scene's heading (0 faces -Z) */
  soldiers: Array<{ x: number; z: number; r: number; c: number }>;
  townsfolk: Array<{ x: number; z: number; r: number; y?: number }>;
  /** How many of `townsfolk`, counted from the end, were gathered by an event and stay put */
  gathered: number;
  /** 0 raw levies to 3 veterans */
  drillBand: number;
  /** Companies are at drill: they advance on each other and fall back */
  drilling: boolean;
  /** The gathered crowd is angry */
  agitated: boolean;
  /** The realm's colour, as on the map */
  realm: number;
  myth: boolean;
}

export interface CityPeople {
  update(elapsed: number, still: boolean): void;
}

/** Height of the paving the figures stand on */
const GROUND = 0.09;
/** City figures are small: the kit's 1.75 units of height become about 1.2 */
const SCALE = 0.69;
/** The scene's headings turn about -Z; the kit faces +X */
const yawOf = (r: number): number => r + Math.PI / 2;

const hash = (n: number): number => Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;

const TRAINED: FigureKit[] = [
  { headgear: 'helmet', weapon: 'spear', shield: true, armour: true, lite: true },
  { headgear: 'cap', weapon: 'ji', shield: false, armour: true, lite: true },
];
const LEVY: FigureKit = { headgear: 'cap', weapon: 'spear', shield: false, armour: false, lite: true };
const TOWNSFOLK: FigureKit[] = [
  { headgear: 'cap', weapon: 'none', shield: false, armour: false, longRobe: true, lite: true },
  { headgear: 'bare', weapon: 'none', shield: false, armour: false, longRobe: true, lite: true },
];
const ROBES = [0x6c5a44, 0x8a7a5c, 0x4f5a66, 0x7a4a3a, 0x9a8e74, 0x5a6650];

export function buildCityPeople(spec: CityPeopleSpec, bag: DisposeBag, group: THREE.Group): CityPeople {
  const tint = new THREE.Color();
  const dark = new THREE.Color(spec.myth ? 0x34373a : 0x55595c);
  // The map's pigment is a light wash for paper; dyed cloth in daylight is deeper
  const realm = new THREE.Color(spec.realm).multiplyScalar(0.7);
  const crowds: FigureCrowd[] = [];
  const addCrowd = (kit: FigureKit, count: number, castShadow: boolean): FigureCrowd => {
    const figures = bag.add(createFigureCrowd(kit, count));
    figures.mesh.castShadow = castShadow;
    figures.uniforms.uFigIron.value = spec.myth ? 0.45 : 0;
    group.add(figures.mesh);
    crowds.push(figures);
    return figures;
  };

  // ------------------------------------------------------------------------- the garrison
  // Share of raw levies in the ranks, and how alike the men are dressed, by drill
  const levyShare = [0.8, 0.45, 0.15, 0][spec.drillBand] ?? 0;
  const uniformity = [0.1, 0.4, 0.7, 0.95][spec.drillBand] ?? 0.5;
  const kits = [...TRAINED, LEVY];
  const kitOfSoldier = (i: number): number => {
    const seed = hash(i * 3.7 + 11);
    if (seed < levyShare) return 2;
    return hash(i * 9.1 + 5) < 0.72 ? 0 : 1;
  };
  const soldierSlots = spec.soldiers.map((m, i) => ({ m, kit: kitOfSoldier(i), seed: hash(i + 0.5), crowd: null as FigureCrowd | null, index: 0 }));
  kits.forEach((kit, k) => {
    const members = soldierSlots.filter((s) => s.kit === k);
    if (members.length === 0) return;
    // The shadow map is drawn once, so only men who stay where they are may cast into it
    const figures = addCrowd(kit, members.length, !spec.drilling);
    members.forEach((s, n) => {
      s.crowd = figures;
      s.index = n;
      const ragged = 1 - uniformity;
      figures.place(n, s.m.x, GROUND, s.m.z, yawOf(s.m.r) + (s.seed - 0.5) * 0.5 * ragged);
      figures.pose(n, 0, 0, 0, SCALE * (0.97 + s.seed * 0.08 * (0.4 + ragged)));
      figures.look(n, figureTint(tint, realm, dark, spec.myth ? 0.4 : 0.22, s.seed, uniformity), s.seed);
    });
    figures.commit();
  });

  // ------------------------------------------------------------------------- townsfolk
  const strolling = spec.townsfolk.length - spec.gathered;
  const folk = spec.townsfolk.map((m, i) => {
    const seed = hash(i * 1.37 + 3);
    const gathered = i >= strolling;
    return {
      m,
      seed,
      gathered,
      // Some stand about; the rest pace a few steps along the way they face and turn back
      walks: !gathered && seed > 0.52,
      kit: hash(i * 5.3) < 0.6 ? 0 : 1,
      reach: 0.9 + hash(i * 2.1) * 1.3,
      pace: 0.45 + hash(i * 7.7) * 0.35,
      crowd: null as FigureCrowd | null,
      index: 0,
    };
  });
  const dressFolk = (members: typeof folk, kit: FigureKit, castShadow: boolean, cheer: number) => {
    if (members.length === 0) return;
    const figures = addCrowd(kit, members.length, castShadow);
    figures.uniforms.uFigCheer.value = cheer;
    members.forEach((p, n) => {
      p.crowd = figures;
      p.index = n;
      figures.place(n, p.m.x, GROUND + (p.m.y ?? 0), p.m.z, yawOf(p.m.r));
      figures.pose(n, 0, 0, 0, SCALE * (0.9 + p.seed * 0.12));
      const robe = ROBES[Math.floor(hash(n * 3.3 + p.seed) * ROBES.length) % ROBES.length];
      figures.look(n, figureTint(tint, new THREE.Color(robe), dark, spec.myth ? 0.25 : 0, p.seed, 0.2), p.seed);
    });
    figures.commit();
  };
  TOWNSFOLK.forEach((kit, k) => {
    const mine = folk.filter((p) => p.kit === k);
    dressFolk(mine.filter((p) => !p.walks && !p.gathered), kit, true, 0);
    // Walkers keep out of the shadow map, which is drawn once and would hold their shadows still
    dressFolk(mine.filter((p) => p.walks), kit, false, 0);
    // A crowd drawn together by an event: restless if it is a riot
    dressFolk(mine.filter((p) => p.gathered), kit, true, spec.agitated ? 0.55 : 0.12);
  });

  const walkers = folk.filter((p) => p.walks && p.crowd);

  return {
    update(elapsed, still) {
      const time = still ? 0 : elapsed;
      for (const figures of crowds) figures.uniforms.uFigTime.value = time;
      if (still) return;

      if (spec.drilling) {
        // Companies advance on each other and fall back, each as one body, weapons coming
        // down as the lines close
        for (const s of soldierSlots) {
          if (!s.crowd) continue;
          const facing = s.m.c % 2 === 1 ? 1 : -1;
          const phase = elapsed * 0.9 + s.m.c * 0.5;
          const swing = Math.sin(phase);
          s.crowd.place(s.index, s.m.x + facing * (0.9 + 0.9 * swing), GROUND, s.m.z, yawOf(s.m.r));
          s.crowd.pose(s.index, Math.min(1, Math.abs(Math.cos(phase)) * 1.3), Math.max(0, (swing - 0.2) / 0.8), 0);
        }
      }
      for (const p of walkers) {
        // Out and back along a short line; he turns round at each end
        const span = p.reach * 2;
        const along = (elapsed * p.pace + p.seed * 20) % (span * 2);
        const out = along < span;
        const d = (out ? along : span * 2 - along) - p.reach;
        const heading = yawOf(p.m.r) + (out ? 0 : Math.PI);
        // The kit's yaw 0 faces +X, turning toward -Z as it grows
        const baseYaw = yawOf(p.m.r);
        p.crowd!.place(p.index, p.m.x + Math.cos(baseYaw) * d, GROUND + (p.m.y ?? 0), p.m.z - Math.sin(baseYaw) * d, heading);
        p.crowd!.pose(p.index, 0.75, 0, 0);
      }
      for (const figures of crowds) figures.commit();
    },
  };
}
