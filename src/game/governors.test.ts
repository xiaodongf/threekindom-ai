import { describe, expect, it } from 'vitest';
import {
  advanceSeason as advanceSeasonWith,
  createNewGame,
  getCityGenerals,
  getFactionIncomeBreakdown,
  performAppointGovernor,
  performAttackCity,
  performRelocateHero,
  performSetGovernorFocus,
} from './engine.js';
import {
  GOVERNOR_SCORE_CEILING,
  WORKS_PER_LEVEL,
  drillPerSeason,
  getCityGovernor,
  governorPlanOf,
  governorsOwnChoice,
  supportPerSeason,
  worksPerSeason,
} from './governors.js';
import { validateAndHydrateGameState } from './saveSystem.js';
import type { City, GameState } from './types.js';

function withCity(state: GameState, cityId: string, patch: Partial<City>): GameState {
  return { ...state, cities: { ...state.cities, [cityId]: { ...state.cities[cityId], ...patch } } };
}

/** Seasons until a predicate holds, with story events dismissed along the way. */
function seasonsUntil(start: GameState, done: (s: GameState) => boolean, limit = 40): [GameState, number] {
  let state = start;
  for (let n = 1; n <= limit; n++) {
    state = { ...advanceSeason(state), activeEvent: null };
    if (done(state)) return [state, n];
  }
  return [state, -1];
}

/** A season in which no city event begins, so each test sees only what it sets up. */
const advanceSeason = (state: GameState) => advanceSeasonWith(state, () => 0.999);

describe('Governors', () => {
  it('lets the best administrator act until someone is appointed, and counts the governor’s politics for income', () => {
    const state = createNewGame('shu');
    const stationed = getCityGenerals(state, 'chengdu');
    expect(stationed.length).toBeGreaterThan(1);
    const senior = [...stationed].sort((a, b) => b.politics - a.politics)[0];
    const junior = [...stationed].sort((a, b) => a.politics - b.politics)[0];
    expect(senior.politics).toBeGreaterThan(junior.politics);

    expect(getCityGovernor(state, 'chengdu')).toEqual({ general: senior, acting: true });
    const incomeOf = (s: GameState) => getFactionIncomeBreakdown(s, 'shu').find((r) => r.cityId === 'chengdu')!;
    const before = incomeOf(state);

    const appointed = performAppointGovernor(state, 'shu', 'chengdu', junior.id);
    expect(getCityGovernor(appointed, 'chengdu')).toEqual({ general: appointed.generals[junior.id], acting: false });
    expect(appointed.actionPoints).toBe(state.actionPoints);
    expect(incomeOf(appointed).gold).toBeLessThan(before.gold);

    // Only an able general of the realm, stationed in the city, can hold its post.
    expect(performAppointGovernor(state, 'shu', 'chengdu', 'caocao')).toBe(state);
    expect(performAppointGovernor(state, 'wei', 'chengdu', junior.id)).toBe(state);
    const elsewhere = getCityGenerals(state, 'jiangling')[0];
    expect(performAppointGovernor(state, 'shu', 'chengdu', elsewhere.id)).toBe(state);

    // Withdrawing the appointment hands the city back to the senior general.
    const vacated = performAppointGovernor(appointed, 'shu', 'chengdu', null);
    expect(vacated.cities.chengdu.governorId).toBeUndefined();
    expect(getCityGovernor(vacated, 'chengdu')?.acting).toBe(true);
    expect(incomeOf(vacated).gold).toBe(before.gold);
  });

  it('moves the instructed aspect forward each season at the governor’s pace, with no order spent', () => {
    let state = withCity(createNewGame('shu'), 'jiangzhou', { farming: 2, trade: 2 });
    state = performSetGovernorFocus(state, 'shu', 'jiangzhou', 'trade');
    expect(state.actionPoints).toBe(createNewGame('shu').actionPoints);
    const plan = governorPlanOf(state, 'jiangzhou')!;
    expect(plan.task).toBe('trade');
    expect(plan.ownChoice).toBe(false);
    expect(plan.rate).toBe(worksPerSeason(plan.general.politics));
    expect(plan.seasonsLeft).toBe(Math.ceil(WORKS_PER_LEVEL / plan.rate));
    const goldBefore = state.factions.shu.gold;

    const one = { ...advanceSeason(state), activeEvent: null };
    expect(one.cities.jiangzhou.works?.trade).toBe(plan.rate);
    expect(one.cities.jiangzhou.trade).toBe(2);

    const [done, seasons] = seasonsUntil(state, (s) => s.cities.jiangzhou.trade === 3);
    expect(seasons).toBe(plan.seasonsLeft);
    expect(done.cities.jiangzhou.farming).toBe(2);
    // What was left over starts the next level.
    expect(done.cities.jiangzhou.works?.trade).toBe(plan.rate * seasons - WORKS_PER_LEVEL);
    expect(done.chronicle.some((e) => e.text.en.includes('finished the new market at Jiangzhou'))).toBe(true);
    // The governor's works are not paid for out of the treasury.
    expect(done.factions.shu.gold).toBeGreaterThan(goldBefore);
    // The work taught the governor something.
    expect(done.generals[plan.general.id].xp + done.generals[plan.general.id].level * 100).toBeGreaterThan(
      state.generals[plan.general.id].xp + state.generals[plan.general.id].level * 100
    );
  });

  it('drills the garrison or wins the people up to the ceiling, then holds them there', () => {
    let state = withCity(createNewGame('shu'), 'chengdu', { drill: 60, support: 60 });
    state = performSetGovernorFocus(state, 'shu', 'chengdu', 'drill');
    const drillPlan = governorPlanOf(state, 'chengdu')!;
    expect(drillPlan.rate).toBe(drillPerSeason(drillPlan.general.command));
    const one = advanceSeason(state);
    expect(one.cities.chengdu.drill).toBe(60 + drillPlan.rate);

    const [top] = seasonsUntil(state, (s) => s.cities.chengdu.drill >= GOVERNOR_SCORE_CEILING);
    expect(top.cities.chengdu.drill).toBe(GOVERNOR_SCORE_CEILING);
    expect(governorPlanOf(top, 'chengdu')?.idle).toBe(true);
    expect(advanceSeason(top).cities.chengdu.drill).toBe(GOVERNOR_SCORE_CEILING);
    // A score the player pushed past the ceiling is held, not dragged back down.
    expect(advanceSeason(withCity(top, 'chengdu', { drill: 96 })).cities.chengdu.drill).toBe(96);

    const relief = performSetGovernorFocus(state, 'shu', 'chengdu', 'relief');
    const reliefPlan = governorPlanOf(relief, 'chengdu')!;
    expect(reliefPlan.rate).toBe(supportPerSeason(reliefPlan.general.charisma));
    expect(advanceSeason(relief).cities.chengdu.support).toBe(60 + reliefPlan.rate);
  });

  it('leaves a governor without instructions to see to the most pressing thing', () => {
    const base = createNewGame('shu');
    const calm = withCity(base, 'chengdu', { farming: 3, trade: 4, defense: 4, drill: 60, support: 60 });
    expect(governorsOwnChoice(calm, calm.cities.chengdu)).toBe('farming');
    expect(governorPlanOf(calm, 'chengdu')?.ownChoice).toBe(true);

    // With farming and trade level, the governor carries on with whichever is already begun.
    const level = withCity(calm, 'chengdu', { farming: 3, trade: 3 });
    const first = governorsOwnChoice(level, level.cities.chengdu);
    const other = first === 'farming' ? 'trade' : 'farming';
    const swung = {
      ...withCity(level, 'chengdu', { works: { [first]: 12 } }),
      factions: {
        ...level.factions,
        shu: { ...level.factions.shu, gold: level.factions.shu.food, food: level.factions.shu.gold },
      },
    };
    expect(governorsOwnChoice(swung, swung.cities.chengdu)).toBe(first);
    const begunOther = withCity(level, 'chengdu', { works: { [other]: 12 } });
    expect(governorsOwnChoice(begunOther, begunOther.cities.chengdu)).toBe(other);

    const restless = withCity(calm, 'chengdu', { support: 30 });
    expect(governorsOwnChoice(restless, restless.cities.chengdu)).toBe('relief');

    // Hanzhong faces Wei across the passes: a raw garrison or low walls come before the fields.
    expect(base.cities.hanzhong.neighbors.some((id) => base.cities[id].owner === 'wei')).toBe(true);
    const raw = withCity(base, 'hanzhong', { drill: 35, support: 60 });
    expect(governorsOwnChoice(raw, raw.cities.hanzhong)).toBe('drill');
    const lowWalls = withCity(base, 'hanzhong', { drill: 70, support: 60, defense: 2 });
    expect(governorsOwnChoice(lowWalls, lowWalls.cities.hanzhong)).toBe('walls');

    const finished = withCity(calm, 'chengdu', { farming: 5, trade: 5, defense: 5, drill: 60 });
    expect(governorsOwnChoice(finished, finished.cities.chengdu)).toBe('drill');

    // An instruction that has nothing left to do is reported as idle rather than quietly changed.
    const stuck = performSetGovernorFocus(withCity(calm, 'chengdu', { farming: 5 }), 'shu', 'chengdu', 'farming');
    expect(governorPlanOf(stuck, 'chengdu')).toMatchObject({ task: 'farming', idle: true, seasonsLeft: 0 });
    expect(advanceSeason(stuck).cities.chengdu.farming).toBe(5);
  });

  it('runs rival realms’ cities the same way, and nothing moves in a city with no general', () => {
    const state = createNewGame('shu');
    // Ye is Wei's: its governor works without any order from the rival's turn.
    const plan = governorPlanOf(state, 'ye')!;
    const next = advanceSeason(state);
    const ye = next.cities.ye;
    const before = state.cities.ye;
    const moved =
      (ye.works?.farming ?? 0) + (ye.works?.trade ?? 0) + (ye.works?.walls ?? 0) > 0 ||
      ye.drill > before.drill ||
      ye.support > before.support;
    expect(plan.general.faction).toBe('wei');
    expect(moved).toBe(true);
    // Rivals' finished works are not written into the player's chronicle.
    const [later] = seasonsUntil(state, (s) => s.cities.ye.farming + s.cities.ye.trade + s.cities.ye.defense > 11);
    expect(later.chronicle.some((e) => e.text.en.includes('at Ye'))).toBe(false);

    // Empty a city of generals: no governor, no plan, no works.
    let empty = state;
    for (const g of getCityGenerals(state, 'jiange')) {
      empty = performRelocateHero(empty, 'shu', g.id, 'chengdu', false);
    }
    expect(getCityGenerals(empty, 'jiange')).toHaveLength(0);
    expect(getCityGovernor(empty, 'jiange')).toBeNull();
    expect(governorPlanOf(empty, 'jiange')).toBeNull();
    const after = advanceSeason(empty).cities.jiange;
    expect(after.works ?? {}).toEqual({});
    expect([after.farming, after.trade, after.defense]).toEqual([
      empty.cities.jiange.farming,
      empty.cities.jiange.trade,
      empty.cities.jiange.defense,
    ]);
  });

  it('clears a post when its holder leaves or the city falls, and keeps it through a save', () => {
    const base = createNewGame('shu');
    const junior = [...getCityGenerals(base, 'chengdu')].sort((a, b) => a.politics - b.politics)[0];
    let state = performAppointGovernor(base, 'shu', 'chengdu', junior.id);
    state = performSetGovernorFocus(state, 'shu', 'chengdu', 'walls');
    state = withCity(state, 'chengdu', { works: { walls: 40 } });

    const loaded = validateAndHydrateGameState(JSON.parse(JSON.stringify(state)));
    expect(loaded.cities.chengdu.governorId).toBe(junior.id);
    expect(loaded.cities.chengdu.focus).toBe('walls');
    expect(loaded.cities.chengdu.works).toEqual({ walls: 40 });
    const nonsense = validateAndHydrateGameState(
      JSON.parse(JSON.stringify(withCity(state, 'chengdu', { focus: 'plunder' as never, works: { walls: 4000 } })))
    );
    expect(nonsense.cities.chengdu.focus).toBeUndefined();
    expect(nonsense.cities.chengdu.works).toEqual({ walls: WORKS_PER_LEVEL - 1 });

    // The governor rides off to another city: someone else acts at once, and the post is cleared at season's end.
    const gone = performRelocateHero(state, 'shu', junior.id, 'jiange', false);
    expect(getCityGovernor(gone, 'chengdu')?.acting).toBe(true);
    expect(getCityGovernor(gone, 'chengdu')?.general.id).not.toBe(junior.id);
    expect(advanceSeason(gone).cities.chengdu.governorId).toBeUndefined();

    // A conquered city starts again with no appointment and no instruction.
    let war = withCity(base, 'chengdu', { troops: 40000 });
    war = withCity(war, 'jianning', { focus: 'walls', governorId: 'menghuo' });
    const taken = performAttackCity(war, 'shu', 'chengdu', 'jianning', 30000, 'fire', 'zhaoyun', true, () => 0.5);
    expect(taken.cities.jianning.owner).toBe('shu');
    expect(taken.cities.jianning.governorId).toBeUndefined();
    expect(taken.cities.jianning.focus).toBe('auto');
    expect(governorPlanOf(taken, 'jianning')?.task).toBe('relief');
  });
});
