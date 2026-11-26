import { describe, expect, it } from 'vitest';
import {
  CITY_EVENT_RULES,
  PLAGUE_LOSS,
  WALL_SCAR_SEASONS,
  cityEventChances,
  eventIncomeFactor,
  isRiverside,
  rollCityEvent,
} from './cityEvents.js';
import {
  advanceSeason,
  createNewGame,
  getFactionIncomeBreakdown,
  performAttackCity,
  performFortifyCity,
  performSabotageBombard,
  performSetGovernorFocus,
} from './engine.js';
import { governorPlanOf } from './governors.js';
import { validateAndHydrateGameState } from './saveSystem.js';
import type { City, CityEventKind, GameState } from './types.js';

function withCity(state: GameState, cityId: string, patch: Partial<City>): GameState {
  return { ...state, cities: { ...state.cities, [cityId]: { ...state.cities[cityId], ...patch } } };
}

const quiet = () => 0.999;
const chanceOf = (state: GameState, cityId: string, season: GameState['season'], kind: CityEventKind) =>
  cityEventChances(state, state.cities[cityId], season).find(([k]) => k === kind)?.[1] ?? 0;

/** A season in which only the named city rolls low enough for something to begin. */
function seasonWithRollFor(state: GameState, cityId: string, roll: number): GameState {
  const held = Object.values(state.cities).filter((c) => c.owner !== 'neutral');
  const index = held.findIndex((c) => c.id === cityId);
  let call = 0;
  return advanceSeason(state, () => (call++ === index ? roll : 0.999));
}

describe('City events', () => {
  it('gives each event its season and its kind of city', () => {
    const state = createNewGame('wu');
    expect(isRiverside(state.cities.jianye)).toBe(true);
    expect(isRiverside(state.cities.ye)).toBe(false);

    // Floods come to river cities in spring and summer, droughts to the rest in summer.
    expect(chanceOf(state, 'jianye', 'spring', 'flood')).toBeGreaterThan(0);
    expect(chanceOf(state, 'jianye', 'autumn', 'flood')).toBe(0);
    expect(chanceOf(state, 'ye', 'spring', 'flood')).toBe(0);
    expect(chanceOf(state, 'ye', 'summer', 'drought')).toBeGreaterThan(0);
    expect(chanceOf(state, 'jianye', 'summer', 'drought')).toBe(0);

    // A bumper harvest is an autumn thing, likelier on well-farmed land and among a willing people.
    expect(chanceOf(state, 'ye', 'summer', 'harvest')).toBe(0);
    const poor = withCity(state, 'ye', { farming: 1, support: 50 });
    const rich = withCity(state, 'ye', { farming: 5, support: 70 });
    expect(chanceOf(rich, 'ye', 'autumn', 'harvest')).toBeGreaterThan(chanceOf(poor, 'ye', 'autumn', 'harvest'));

    // Fairs follow trade; riots only threaten a city in unrest; free cities are left alone.
    expect(chanceOf(withCity(state, 'ye', { trade: 5 }), 'ye', 'winter', 'fair')).toBeGreaterThan(
      chanceOf(withCity(state, 'ye', { trade: 1 }), 'ye', 'winter', 'fair')
    );
    expect(chanceOf(state, 'ye', 'winter', 'riot')).toBe(0);
    expect(chanceOf(withCity(state, 'ye', { support: 10 }), 'ye', 'winter', 'riot')).toBeGreaterThan(0.3);
    expect(cityEventChances(state, state.cities.wuwei, 'summer')).toEqual([]);

    // Every season's chances leave most cities in peace.
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      for (const city of Object.values(state.cities)) {
        const total = cityEventChances(state, city, season).reduce((sum, [, p]) => sum + p, 0);
        expect(total).toBeLessThan(0.45);
      }
    }
    expect(rollCityEvent(state, state.cities.ye, 'winter', 0.999)).toBeNull();
  });

  it('begins an event as the season turns, changes the city’s income while it lasts, then ends it', () => {
    // Spring turns to summer: a roll just past the plague's sliver lands on the flood.
    const base = createNewGame('wu');
    const before = getFactionIncomeBreakdown(base, 'wu').find((r) => r.cityId === 'jianye')!;
    const summer = seasonWithRollFor(base, 'jianye', 0.02);
    expect(summer.season).toBe('summer');
    expect(summer.cities.jianye.event).toEqual({ kind: 'flood', seasonsLeft: CITY_EVENT_RULES.flood.seasons });
    expect(summer.chronicle[0].text.en).toContain('flooded the fields of Jianye');
    // No other city was touched.
    expect(Object.values(summer.cities).filter((c) => c.event).map((c) => c.id)).toEqual(['jianye']);

    const during = getFactionIncomeBreakdown(summer, 'wu').find((r) => r.cityId === 'jianye')!;
    expect(eventIncomeFactor(summer.cities.jianye)).toEqual({ gold: 1, food: 0.5 });
    expect(during.food).toBeLessThan(before.food * 0.6);
    expect(during.gold).toBeGreaterThan(before.gold * 0.9);

    // It runs two seasons, and nothing new begins on top of it.
    const autumn = advanceSeason(summer, () => 0);
    expect(autumn.cities.jianye.event).toEqual({ kind: 'flood', seasonsLeft: 1 });
    const winter = advanceSeason({ ...autumn, activeEvent: null }, quiet);
    expect(winter.cities.jianye.event).toBeUndefined();
    const after = getFactionIncomeBreakdown(winter, 'wu').find((r) => r.cityId === 'jianye')!;
    expect(after.food).toBeGreaterThan(during.food * 1.5);
  });

  it('counts a plague’s dead, spares a realm with medicine half of them, and sweeps away half-dug fields in a flood', () => {
    const base = withCity(createNewGame('shu'), 'chengdu', { troops: 20000, support: 60 });
    // The first sliver of every roll is the plague.
    const sick = seasonWithRollFor(base, 'chengdu', 0.001);
    expect(sick.cities.chengdu.event?.kind).toBe('plague');
    expect(sick.cities.chengdu.troops).toBe(20000 - Math.round(20000 * PLAGUE_LOSS));
    expect(sick.cities.chengdu.support).toBeLessThan(60);

    const healed: GameState = { ...base, chrono: { ...base.chrono, unlockedTechs: ['medicine'] } };
    const spared = seasonWithRollFor(healed, 'chengdu', 0.001);
    expect(spared.cities.chengdu.troops).toBe(20000 - Math.round(20000 * (PLAGUE_LOSS / 2)));
    expect(chanceOf(healed, 'chengdu', 'summer', 'plague')).toBeLessThan(chanceOf(base, 'chengdu', 'summer', 'plague'));

    let wet = withCity(createNewGame('wu'), 'jianye', { farming: 3, trade: 5 });
    wet = performSetGovernorFocus(wet, 'wu', 'jianye', 'farming');
    wet = withCity(wet, 'jianye', { works: { farming: 60 } });
    const flooded = seasonWithRollFor(wet, 'jianye', 0.02);
    expect(flooded.cities.jianye.event?.kind).toBe('flood');
    expect(flooded.cities.jianye.works?.farming).toBe(0);
  });

  it('halts a rioting city’s works unless its governor is set to the people', () => {
    let state = withCity(createNewGame('shu'), 'chengdu', {
      support: 15,
      farming: 2,
      event: { kind: 'riot', seasonsLeft: 1 },
    });
    state = performSetGovernorFocus(state, 'shu', 'chengdu', 'farming');
    const stalled = advanceSeason(state, quiet);
    expect(stalled.cities.chengdu.works?.farming ?? 0).toBe(0);
    expect(stalled.cities.chengdu.event).toBeUndefined();

    const calming = performSetGovernorFocus(state, 'shu', 'chengdu', 'relief');
    const rate = governorPlanOf(calming, 'chengdu')!.rate;
    expect(advanceSeason(calming, quiet).cities.chengdu.support).toBe(15 + rate);

    // Left in unrest, the city can riot again as soon as the last one is over.
    const again = seasonWithRollFor(state, 'chengdu', 0.2);
    expect(again.cities.chengdu.event).toEqual({ kind: 'riot', seasonsLeft: 1 });
    const gold = (s: GameState) => getFactionIncomeBreakdown(s, 'shu').find((r) => r.cityId === 'chengdu')!.gold;
    expect(gold(again)).toBeLessThan(gold(withCity(again, 'chengdu', { event: undefined })) * 0.6);
  });

  it('leaves a wall broken after a bombardment or a storming until it is mended', () => {
    let state = createNewGame('shu');
    state = {
      ...withCity(state, 'chengdu', { troops: 40000 }),
      factions: { ...state.factions, shu: { ...state.factions.shu, gold: 5000 } },
    };
    const bombed = performSabotageBombard(state, 'shu', 'chengdu', 'jianning', undefined, true, () => 0.5);
    expect(bombed.cities.jianning.wallScar).toBe(WALL_SCAR_SEASONS);
    // It is patched a season at a time.
    let later = bombed;
    for (let n = WALL_SCAR_SEASONS - 1; n >= 1; n--) {
      later = { ...advanceSeason(later, quiet), activeEvent: null };
      expect(later.cities.jianning.wallScar).toBe(n);
    }
    expect(advanceSeason(later, quiet).cities.jianning.wallScar).toBeUndefined();

    const taken = performAttackCity(state, 'shu', 'chengdu', 'jianning', 30000, 'fire', 'zhaoyun', true, () => 0.5);
    expect(taken.cities.jianning.owner).toBe('shu');
    expect(taken.cities.jianning.wallScar).toBe(WALL_SCAR_SEASONS);
    // Raising the walls makes the breach good at once.
    expect(performFortifyCity(taken, 'shu', 'jianning', false).cities.jianning.wallScar).toBeUndefined();
  });

  it('keeps an event and a broken wall through a save, and drops what it does not know', () => {
    const state = withCity(createNewGame('wu'), 'jianye', { event: { kind: 'fair', seasonsLeft: 1 }, wallScar: 2 });
    const loaded = validateAndHydrateGameState(JSON.parse(JSON.stringify(state)));
    expect(loaded.cities.jianye.event).toEqual({ kind: 'fair', seasonsLeft: 1 });
    expect(loaded.cities.jianye.wallScar).toBe(2);

    const odd = validateAndHydrateGameState(
      JSON.parse(
        JSON.stringify(withCity(state, 'jianye', { event: { kind: 'comet' as never, seasonsLeft: 9 }, wallScar: -3 }))
      )
    );
    expect(odd.cities.jianye.event).toBeUndefined();
    expect(odd.cities.jianye.wallScar).toBeUndefined();
  });
});
