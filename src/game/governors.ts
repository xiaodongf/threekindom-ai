import { ASPECT_MAX_LEVEL } from './cityAspects.js';
import { cityWorksRateMultiplier } from './citySpecialties.js';
import { getCityGenerals } from './queries.js';
import type {
  City,
  GameState,
  General,
  GovernorFocus,
  GovernorTask,
  PlayableFactionId,
  SummonableOfficerCandidate,
} from './types.js';

/**
 * Governors. Every held city has one: the general appointed to the post, or, while the post is
 * empty, the best administrator stationed there acting in the post. A governor adds their politics
 * to the city's income and, every season, works on one aspect of the city without an order being
 * spent. Everything here is a pure formula, so the rules engine and the interface agree.
 */

export const GOVERNOR_TASKS: GovernorTask[] = ['farming', 'trade', 'walls', 'drill', 'relief'];
export const GOVERNOR_FOCI: GovernorFocus[] = ['auto', ...GOVERNOR_TASKS];

/** Works a governor must pile up to raise farming, trade or the walls by one level. */
export const WORKS_PER_LEVEL = 100;
/** A governor drilling the garrison or relieving the people stops at this score. */
export const GOVERNOR_SCORE_CEILING = 85;

/** The skill a governor brings to each task. */
export function taskSkillOf(general: Pick<General, 'politics' | 'command' | 'charisma'>, task: GovernorTask): number {
  if (task === 'farming' || task === 'trade') return general.politics;
  if (task === 'relief') return general.charisma;
  return general.command;
}

/** Works added in a season toward the next level of farming, trade or walls: 8 to 18. */
export function worksPerSeason(skill: number): number {
  return 8 + Math.round(Math.max(0, Math.min(100, skill) - 50) / 5);
}

/** Drill a governor adds in a season: 4 to 8. */
export function drillPerSeason(command: number): number {
  return 4 + Math.round(Math.max(0, Math.min(100, command) - 60) / 10);
}

/** Support a governor wins in a season: 3 to 7. */
export function supportPerSeason(charisma: number): number {
  return 3 + Math.round(Math.max(0, Math.min(100, charisma) - 60) / 10);
}

/** The general appointed to the city, if still serving its owner there. */
export function getAppointedGovernor(state: GameState, cityId: string): General | undefined {
  const city = state.cities[cityId];
  if (!city || city.owner === 'neutral' || !city.governorId) return undefined;
  const g = state.generals[city.governorId];
  return g && g.cityId === cityId && g.faction === city.owner && g.status === 'active' ? g : undefined;
}

/** Whether a general may be given a city's post: an able general of its owner, stationed there. */
export function canGovern(state: GameState, cityId: string, generalId: string): boolean {
  return getCityGenerals(state, cityId).some((g) => g.id === generalId);
}

/**
 * Who runs the city this season: the appointed governor, or with the post empty (or its holder
 * wounded or away) the best administrator among the generals stationed there.
 */
export function getCityGovernor(
  state: GameState,
  cityId: string
): { general: General; acting: boolean } | null {
  const city = state.cities[cityId];
  if (!city || city.owner === 'neutral') return null;
  const appointed = getAppointedGovernor(state, cityId);
  if (appointed) return { general: appointed, acting: false };
  const senior = getCityGenerals(state, cityId).sort(
    (a, b) => b.politics - a.politics || a.id.localeCompare(b.id)
  )[0];
  return senior ? { general: senior, acting: true } : null;
}

function bordersAnotherRealm(state: GameState, city: City): boolean {
  return city.neighbors.some((id) => {
    const other = state.cities[id];
    return Boolean(other && other.owner !== city.owner && other.owner !== 'neutral');
  });
}

/** Whether there is anything left for a governor to do on a task. */
export function taskHasWork(city: City, task: GovernorTask): boolean {
  if (task === 'farming') return city.farming < ASPECT_MAX_LEVEL;
  if (task === 'trade') return city.trade < ASPECT_MAX_LEVEL;
  if (task === 'walls') return city.defense < ASPECT_MAX_LEVEL;
  if (task === 'drill') return city.drill < GOVERNOR_SCORE_CEILING;
  return city.support < GOVERNOR_SCORE_CEILING;
}

/**
 * What a governor left to his own judgment works on: a restless people first, then a raw or
 * thinly walled border garrison, then whichever of farming and trade lags, then the rest.
 */
export function governorsOwnChoice(state: GameState, city: City): GovernorTask {
  if (city.support < 40) return 'relief';
  const border = bordersAnotherRealm(state, city);
  if (border && city.drill < 50 && city.troops >= 5000) return 'drill';
  if (border && city.defense < 3) return 'walls';
  if (city.farming < ASPECT_MAX_LEVEL || city.trade < ASPECT_MAX_LEVEL) {
    if (city.trade >= ASPECT_MAX_LEVEL) return 'farming';
    if (city.farming >= ASPECT_MAX_LEVEL) return 'trade';
    if (city.farming !== city.trade) return city.farming < city.trade ? 'farming' : 'trade';
    // Level with each other: carry on with whichever is already under way, so the governor does
    // not swap between the two from one season to the next as the treasury rises and falls.
    const begun = (city.works?.farming ?? 0) - (city.works?.trade ?? 0);
    if (begun !== 0) return begun > 0 ? 'farming' : 'trade';
    const realm = city.owner === 'neutral' ? undefined : state.factions[city.owner];
    return realm && realm.gold < realm.food ? 'trade' : 'farming';
  }
  if (city.defense < ASPECT_MAX_LEVEL) return 'walls';
  if (city.drill < GOVERNOR_SCORE_CEILING) return 'drill';
  return 'relief';
}

/** The task the city's governor is on this season. */
export function governorTaskOf(state: GameState, city: City): GovernorTask {
  return city.focus && city.focus !== 'auto' ? city.focus : governorsOwnChoice(state, city);
}

export interface GovernorPlan {
  general: General;
  acting: boolean;
  task: GovernorTask;
  /** True when the task was the governor's own choice, not an instruction. */
  ownChoice: boolean;
  skill: number;
  /** Works (farming, trade, walls) or points (drill, support) added this season. */
  rate: number;
  /** For farming, trade and walls: works already piled up toward the next level. */
  works: number;
  /** Seasons until the next level, or until the ceiling for drill and support; 0 with nothing to do. */
  seasonsLeft: number;
  /** Nothing left to do on this task. */
  idle: boolean;
}

/** What the city's governor will do when the season ends, or null with nobody to govern. */
export function governorPlanOf(state: GameState, cityId: string): GovernorPlan | null {
  const city = state.cities[cityId];
  const governor = getCityGovernor(state, cityId);
  if (!city || !governor) return null;
  const task = governorTaskOf(state, city);
  const skill = taskSkillOf(governor.general, task);
  const idle = !taskHasWork(city, task);
  let rate: number;
  let works = 0;
  let seasonsLeft = 0;
  if (task === 'drill' || task === 'relief') {
    rate = task === 'drill' ? drillPerSeason(skill) : supportPerSeason(skill);
    const score = task === 'drill' ? city.drill : city.support;
    seasonsLeft = idle ? 0 : Math.ceil((GOVERNOR_SCORE_CEILING - score) / rate);
  } else {
    rate = Math.round(worksPerSeason(skill) * cityWorksRateMultiplier(city));
    works = city.works?.[task] ?? 0;
    seasonsLeft = idle ? 0 : Math.ceil((WORKS_PER_LEVEL - works) / rate);
  }
  return {
    general: governor.general,
    acting: governor.acting,
    task,
    ownChoice: !city.focus || city.focus === 'auto',
    skill,
    rate,
    works,
    seasonsLeft,
    idle,
  };
}

export interface GovernorResult {
  city: City;
  /** Set when a level of farming, trade or walls was finished this season. */
  completed?: { task: 'farming' | 'trade' | 'walls'; level: number };
}

/**
 * One season of a governor's work on a city. Drill and support given here replace that score's
 * ordinary seasonal drift, so call this after the drift and pass the city as it stood before it.
 */
export function applyGovernorSeason(before: City, drifted: City, plan: GovernorPlan): GovernorResult {
  // A score already past the ceiling is held where it is rather than left to slip back.
  if (plan.task === 'drill') {
    const drill = Math.max(before.drill, Math.min(GOVERNOR_SCORE_CEILING, before.drill + plan.rate));
    return { city: { ...drifted, drill } };
  }
  if (plan.task === 'relief') {
    const support = Math.max(before.support, Math.min(GOVERNOR_SCORE_CEILING, before.support + plan.rate));
    return { city: { ...drifted, support } };
  }
  if (plan.idle) return { city: drifted };
  const task = plan.task;
  const piled = (drifted.works?.[task] ?? 0) + plan.rate;
  if (piled < WORKS_PER_LEVEL) {
    return { city: { ...drifted, works: { ...drifted.works, [task]: piled } } };
  }
  const field = task === 'walls' ? 'defense' : task;
  const level = Math.min(ASPECT_MAX_LEVEL, drifted[field] + 1);
  return {
    city: {
      ...drifted,
      [field]: level,
      // What is left over starts the next level, unless there is no next level.
      works: { ...drifted.works, [task]: level >= ASPECT_MAX_LEVEL ? 0 : piled - WORKS_PER_LEVEL },
    },
    completed: { task, level },
  };
}

/**
 * Partial works accumulated on a city's farming, trade, or walls (0..99), plus seasons remaining
 * if the active governor is currently advancing that aspect.
 */
export function aspectWorksProgress(
  state: GameState,
  city: City,
  task: 'farming' | 'trade' | 'walls'
): { works: number; rate: number; isActiveTask: boolean; seasonsLeft: number | null } {
  const field = task === 'walls' ? 'defense' : task;
  if (city[field] >= ASPECT_MAX_LEVEL) {
    return { works: 0, rate: 0, isActiveTask: false, seasonsLeft: null };
  }
  const works = city.works?.[task] ?? 0;
  const plan = governorPlanOf(state, city.id);
  const riotBlocked = city.event?.kind === 'riot';
  if (plan && plan.task === task && !plan.idle && !riotBlocked) {
    return {
      works,
      rate: plan.rate,
      isActiveTask: true,
      seasonsLeft: plan.seasonsLeft,
    };
  }
  return { works, rate: 0, isActiveTask: false, seasonsLeft: null };
}

/**
 * Active generals of `factionId` stationed in other owned cities who can be summoned (`1 AP`) to
 * govern or reinforce `targetCityId`. Spare officers (whose move will not leave their origin city
 * empty) are ranked first, ordered by administrative & command fit.
 */
export function getSummonableGeneralsForCity(
  state: GameState,
  factionId: PlayableFactionId,
  targetCityId: string
): SummonableOfficerCandidate[] {
  const target = state.cities[targetCityId];
  if (!target || target.owner !== factionId) return [];

  const candidates: SummonableOfficerCandidate[] = [];
  for (const g of Object.values(state.generals)) {
    if (g.faction !== factionId || g.status !== 'active' || g.cityId === targetCityId) continue;
    const fromCity = state.cities[g.cityId];
    if (!fromCity || fromCity.owner !== factionId) continue;

    const originOfficers = getCityGenerals(state, fromCity.id);
    const leavesOriginEmpty = originOfficers.length <= 1;
    const isOriginGovernor = getCityGovernor(state, fromCity.id)?.general.id === g.id;
    const governanceFit = Math.round(g.politics * 0.55 + g.command * 0.25 + g.charisma * 0.2);

    candidates.push({
      general: g,
      fromCity,
      governanceFit,
      isOriginGovernor,
      leavesOriginEmpty,
    });
  }

  return candidates.sort(
    (a, b) =>
      Number(a.leavesOriginEmpty) - Number(b.leavesOriginEmpty) ||
      b.governanceFit - a.governanceFit ||
      b.general.politics - a.general.politics ||
      a.general.id.localeCompare(b.general.id)
  );
}
