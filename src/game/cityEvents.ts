import { UNREST_SUPPORT } from './cityAspects.js';
import { YANGTZE_PORT_IDS } from './data.js';
import { factionHasTech } from './queries.js';
import type { City, CityEventKind, GameState, LocalizedText, Season } from './types.js';

/**
 * Things that happen to a city on their own: a bumper harvest, a flood, a drought, a merchants'
 * fair, a plague, a riot. One may begin as a season turns; it shows in the city and changes what
 * the city brings in until it has run its course. Everything here is a pure formula.
 */

export const CITY_EVENT_KINDS: CityEventKind[] = ['harvest', 'flood', 'drought', 'fair', 'plague', 'riot'];

interface EventRule {
  /** Seasons it lasts, counting the one it begins in. */
  seasons: number;
  /** Multipliers on what the city brings in while it lasts. */
  gold: number;
  food: number;
  /** Change to the people's support the moment it begins. */
  support: number;
}

export const CITY_EVENT_RULES: Record<CityEventKind, EventRule> = {
  harvest: { seasons: 1, gold: 1, food: 1.5, support: 4 },
  flood: { seasons: 2, gold: 1, food: 0.5, support: -6 },
  drought: { seasons: 2, gold: 1, food: 0.6, support: -4 },
  fair: { seasons: 1, gold: 1.4, food: 1, support: 2 },
  plague: { seasons: 1, gold: 1, food: 1, support: -5 },
  riot: { seasons: 1, gold: 0.5, food: 1, support: 0 },
};

/** Share of the garrison a plague carries off; a realm with modern medicine loses half as many. */
export const PLAGUE_LOSS = 0.08;
/** Seasons a wall stays visibly broken after a bombardment or a storming, unless repaired. */
export const WALL_SCAR_SEASONS = 3;

/** Whether a city stands on water that can flood its fields. */
export function isRiverside(city: Pick<City, 'id' | 'terrain'>): boolean {
  return city.terrain === 'river' || YANGTZE_PORT_IDS.includes(city.id);
}

/** What the city's income is multiplied by while an event lasts. */
export function eventIncomeFactor(city: Pick<City, 'event'>): { gold: number; food: number } {
  const rule = city.event ? CITY_EVENT_RULES[city.event.kind] : undefined;
  return rule ? { gold: rule.gold, food: rule.food } : { gold: 1, food: 1 };
}

/**
 * The chance of each event beginning in a held city as the given season opens. A city sees at
 * most one, and none while another is still running its course.
 */
export function cityEventChances(
  state: GameState,
  city: City,
  season: Season
): Array<[CityEventKind, number]> {
  if (city.owner === 'neutral') return [];
  const riverside = isRiverside(city);
  const chances: Array<[CityEventKind, number]> = [];
  if (city.support < UNREST_SUPPORT) chances.push(['riot', 0.35]);
  chances.push(['plague', factionHasTech(state, city.owner, 'medicine') ? 0.006 : 0.015]);
  if (riverside && (season === 'spring' || season === 'summer')) chances.push(['flood', 0.07]);
  if (!riverside && season === 'summer') chances.push(['drought', 0.06]);
  if (season === 'autumn') {
    chances.push(['harvest', 0.08 + 0.03 * city.farming + (city.support >= 60 ? 0.04 : 0)]);
  }
  chances.push(['fair', 0.01 + 0.008 * city.trade]);
  return chances;
}

/** One roll in [0, 1) decides which event, if any, begins. */
export function rollCityEvent(
  state: GameState,
  city: City,
  season: Season,
  roll: number
): CityEventKind | null {
  let edge = 0;
  for (const [kind, chance] of cityEventChances(state, city, season)) {
    edge += chance;
    if (roll < edge) return kind;
  }
  return null;
}

/** The city as it stands once an event has begun: support moved, a plague's dead counted. */
export function beginCityEvent(
  state: GameState,
  city: City,
  kind: CityEventKind
): { city: City; troopsLost: number } {
  const rule = CITY_EVENT_RULES[kind];
  let troopsLost = 0;
  let next: City = {
    ...city,
    event: { kind, seasonsLeft: rule.seasons },
    support: Math.max(0, Math.min(100, city.support + rule.support)),
  };
  if (kind === 'plague') {
    const share = factionHasTech(state, city.owner, 'medicine') ? PLAGUE_LOSS / 2 : PLAGUE_LOSS;
    troopsLost = Math.max(0, Math.min(Math.round(city.troops * share), city.troops - 500));
    next = { ...next, troops: city.troops - troopsLost };
  }
  if (kind === 'flood' && next.works?.farming) {
    // The water takes whatever new fields were half dug.
    next = { ...next, works: { ...next.works, farming: 0 } };
  }
  return { city: next, troopsLost };
}

/** How the chronicle records an event beginning. */
export function cityEventChronicle(city: City, kind: CityEventKind, troopsLost: number): LocalizedText {
  const en = city.name.en;
  const zh = city.name.zh;
  switch (kind) {
    case 'harvest':
      return {
        en: `A bumper harvest at ${en}: half as much grain again this season, and the people are glad of it.`,
        zh: `${zh}五谷丰登：本季粮入增五成，百姓欢悦。`,
      };
    case 'flood':
      return {
        en: `The river has flooded the fields of ${en}: its grain is halved for two seasons.`,
        zh: `${zh}江水泛滥，淹没田亩：两季之内粮入减半。`,
      };
    case 'drought':
      return {
        en: `Drought at ${en}: the fields give six tenths of their grain for two seasons.`,
        zh: `${zh}大旱，禾苗枯槁：两季之内粮入仅余六成。`,
      };
    case 'fair':
      return {
        en: `Merchants from far off have set up a fair at ${en}: four tenths more gold this season.`,
        zh: `四方商旅云集${zh}开市：本季金入增四成。`,
      };
    case 'plague':
      return {
        en: `Plague in the camp at ${en}: ${troopsLost.toLocaleString()} of the garrison are dead, and the people are afraid.`,
        zh: `${zh}军中疫病流行，折损 ${troopsLost.toLocaleString()} 人，民心惶惶。`,
      };
    case 'riot':
      return {
        en: `The people of ${en} have risen in riot: its gold is halved this season and the governor's works stand still.`,
        zh: `${zh}百姓聚众生变：本季金入减半，太守诸务停顿。`,
      };
  }
}
