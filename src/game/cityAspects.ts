import type { City } from './types.js';

/**
 * The numbers behind the five things a city is managed by: farming, trade, walls, the garrison's
 * drill and the people's support. Everything here is a pure formula, so the rules engine and the
 * interface quote the same figures.
 */

/** Farming, trade and walls each run from 1 to this level. */
export const ASPECT_MAX_LEVEL = 5;
/** Drill and support run from 0 to 100; a new game starts every city in the middle. */
export const DRILL_START = 50;
export const SUPPORT_START = 50;

/** Gold a level of trade and grain a level of farming add each season, before bonuses. */
export const GOLD_PER_TRADE_LEVEL = 45;
export const FOOD_PER_FARMING_LEVEL = 40;
/** Extra men a levy raises for each point of prosperity. */
export const LEVY_PER_PROSPERITY = 350;

/** Raw recruits arrive this well drilled and water the garrison's drill down. */
export const RAW_LEVY_DRILL = 20;
/** One drill order adds this much, plus a bonus from the best commander in the city. */
export const DRILL_ORDER_GAIN = 12;
/** Men who took a city, or held one, come out of the fight this much better drilled. */
export const DRILL_VICTORY_GAIN = 4;
export const DRILL_HELD_GAIN = 3;
/** Each season drill moves this far back toward the middle: veterans go slack, recruits learn. */
export const DRILL_SEASON_DRIFT = 2;
/** Morale a fully drilled force gains on the battlefield (and a raw one loses). */
export const DRILL_MORALE_SWING = 12;

/** One relief order adds this much support, plus a bonus from the best-liked general in the city. */
export const RELIEF_ORDER_GAIN = 14;
export const SUPPORT_COST_LEVY = 6;
export const SUPPORT_COST_SIEGE = 4;
export const SUPPORT_COST_RAID = 3;
export const SUPPORT_COST_BOMBARD = 6;
export const SUPPORT_COST_DISCORD = 10;
/** A city taken by force starts its new rule with this much support. */
export const SUPPORT_AFTER_CONQUEST = 30;
/** Each season support moves this far toward what the city's best-liked general inspires. */
export const SUPPORT_SEASON_DRIFT = 2;
/** Below this the people are in unrest and part of the garrison deserts each season. */
export const UNREST_SUPPORT = 25;
export const UNREST_DESERTION = 0.05;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Prosperity is the average of farming and trade (so it can end in .5). */
export function cityProsperity(city: Pick<City, 'farming' | 'trade'>): number {
  return (city.farming + city.trade) / 2;
}

/** Size class of a city for its models and scenes: 1 village .. 5 metropolis. */
export function cityTier(city: Pick<City, 'farming' | 'trade'>): number {
  return clamp(Math.round(cityProsperity(city)), 1, ASPECT_MAX_LEVEL);
}

/** Income multiplier from support: 0.85 at 0, 1.00 at 50, 1.15 at 100. */
export function supportIncomeFactor(support: number): number {
  return 1 + ((clamp(support, 0, 100) - 50) / 50) * 0.15;
}

/** Levy multiplier from support: 0.75 at 0, 1.00 at 50, 1.25 at 100. */
export function supportLevyFactor(support: number): number {
  return 1 + ((clamp(support, 0, 100) - 50) / 50) * 0.25;
}

/** Morale a force takes onto the battlefield from its drill: -12 at 0, 0 at 50, +12 at 100. */
export function drillMoraleBonus(drill: number): number {
  return Math.round(((clamp(drill, 0, 100) - 50) / 50) * DRILL_MORALE_SWING);
}

/** Drill of two bodies of men after they are merged into one garrison. */
export function mixDrill(troopsA: number, drillA: number, troopsB: number, drillB: number): number {
  const total = Math.max(0, troopsA) + Math.max(0, troopsB);
  if (total <= 0) return clamp(Math.round(drillA), 0, 100);
  return clamp(
    Math.round((Math.max(0, troopsA) * drillA + Math.max(0, troopsB) * drillB) / total),
    0,
    100
  );
}

/** Bonus a drill order gets from the best commander stationed in the city (0..10). */
export function drillOfficerBonus(bestCommand: number): number {
  return Math.round(Math.max(0, Math.min(100, bestCommand) - 60) / 4);
}

/** Bonus a relief order gets from the best-liked general stationed in the city (0..10). */
export function reliefOfficerBonus(bestCharisma: number): number {
  return Math.round(Math.max(0, Math.min(100, bestCharisma) - 60) / 4);
}

/** Where support settles with nobody acting on it: 50, or up to 70 under a well-liked general. */
export function supportRestingLevel(bestCharisma: number): number {
  return clamp(Math.round(50 + (bestCharisma - 60) / 2), 50, 70);
}

/** One season's drift of a 0..100 score toward a target, never overshooting it. */
export function driftToward(value: number, target: number, step: number): number {
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
}

/** Men who desert a garrison in a season of unrest; a garrison never falls below 500 this way. */
export function unrestDeserters(city: Pick<City, 'troops' | 'support'>): number {
  if (city.support >= UNREST_SUPPORT) return 0;
  return Math.max(0, Math.min(Math.round(city.troops * UNREST_DESERTION), city.troops - 500));
}

/** A 0..100 score in one word, for the interface. */
export type AspectBand = 'low' | 'fair' | 'good' | 'high';
export function aspectBand(score: number): AspectBand {
  if (score < UNREST_SUPPORT) return 'low';
  if (score < 50) return 'fair';
  if (score < 75) return 'good';
  return 'high';
}
