import type { City, FactionId, Season, TerrainType } from '../../game/types.js';

/** The five parts of a city the player can open. */
export type DistrictId = 'hall' | 'market' | 'fields' | 'barracks' | 'walls';
export const DISTRICT_ORDER: DistrictId[] = ['hall', 'market', 'fields', 'barracks', 'walls'];

/** Everything about a city that shapes how it is drawn. */
export interface CitySpec {
  id: string;
  terrain: TerrainType;
  /** 1 to 5, from prosperity */
  tier: number;
  /** 1 to 5 */
  defense: number;
  owner: FactionId;
  capital: boolean;
  /** A river port: quays, boats and a moat fed by the river */
  river: boolean;
  troops: number;
  season: Season;
  myth: boolean;
}

export function citySpecOf(city: City, season: Season, river: boolean, myth: boolean): CitySpec {
  return {
    id: city.id,
    terrain: city.terrain,
    tier: Math.max(1, Math.min(5, Math.round(city.development))),
    defense: Math.max(1, Math.min(5, Math.round(city.defense))),
    owner: city.owner,
    capital: Boolean(city.isCapital),
    river,
    troops: city.troops,
    season,
    myth,
  };
}

/** Changes whenever the scene has to be rebuilt. The garrison counts in steps, not by the head. */
export function citySpecKey(spec: CitySpec): string {
  return [
    spec.id,
    spec.terrain,
    spec.tier,
    spec.defense,
    spec.owner,
    spec.capital ? 1 : 0,
    spec.river ? 1 : 0,
    Math.round(spec.troops / 1000),
    spec.season,
    spec.myth ? 1 : 0,
  ].join(':');
}

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const inRect = (r: Rect, x: number, z: number, pad = 0): boolean =>
  x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

/**
 * The ground plan. North is -z and the main gate faces south (+z), toward the viewer; one unit is
 * a little under two metres, so a figure stands about one unit tall.
 */
export interface CityLayout {
  /** From the centre to the inner face of the wall */
  half: number;
  wallH: number;
  wallT: number;
  /** From the centre to the outer face of the wall */
  outer: number;
  gates: { s: boolean; n: boolean; e: boolean; w: boolean };
  moat: { inner: number; width: number } | null;
  /** The river's middle line east of the city, and half its width */
  river: { x: number; half: number } | null;
  /** The east-west street */
  crossZ: number;
  fieldZones: Rect[];
}

const HALF_BY_TIER = [30, 36, 42, 48, 54];

export function cityLayoutOf(spec: CitySpec): CityLayout {
  const half = HALF_BY_TIER[spec.tier - 1] + (spec.capital ? 5 : 0);
  const pass = spec.terrain === 'fortress';
  const wallH = 4.2 + spec.defense * 1.25 + (pass ? 1.6 : 0);
  const wallT = 3 + spec.defense * 0.35;
  const outer = half + wallT;
  const moat = spec.defense >= 4 || spec.river ? { inner: outer + 6, width: 7 } : null;
  const river = spec.river ? { x: outer + 92, half: 30 } : null;

  // Farmland lies wherever the country leaves room for it
  const near = outer + (moat ? 18 : 9);
  const fieldZones: Rect[] = [];
  const south = (side: 1 | -1, reach: number, depth: number): Rect =>
    side > 0
      ? { x0: 7, x1: reach, z0: near, z1: near + depth }
      : { x0: -reach, x1: -7, z0: near, z1: near + depth };
  if (pass) {
    fieldZones.push(south(1, outer - 2, 44), south(-1, outer - 2, 44));
  } else if (spec.terrain === 'mountain') {
    fieldZones.push(south(1, outer + 30, 58), south(-1, outer + 30, 58));
  } else {
    const eastReach = river ? outer + 34 : outer + 78;
    fieldZones.push(south(1, eastReach, 74), south(-1, outer + 78, 74));
    fieldZones.push({ x0: -(near + 62), x1: -near, z0: -half * 0.9, z1: outer - 4 });
    if (!river) fieldZones.push({ x0: near, x1: near + 62, z0: -half * 0.9, z1: outer - 4 });
  }

  return {
    half,
    wallH,
    wallT,
    outer,
    gates: { s: true, n: spec.tier >= 2 || pass, e: spec.tier >= 3 && !pass, w: spec.tier >= 3 && !pass },
    moat,
    river,
    crossZ: half * 0.2,
    fieldZones,
  };
}
