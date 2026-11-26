import { describe, expect, it } from 'vitest';
import { generateHeuristicAITurn } from '../../server/ai/providers/heuristic.js';
import {
  DRILL_HELD_GAIN,
  DRILL_ORDER_GAIN,
  DRILL_VICTORY_GAIN,
  RAW_LEVY_DRILL,
  RELIEF_ORDER_GAIN,
  SUPPORT_AFTER_CONQUEST,
  SUPPORT_COST_DISCORD,
  SUPPORT_COST_LEVY,
  SUPPORT_COST_SIEGE,
  cityProsperity,
  cityTier,
  drillMoraleBonus,
  drillOfficerBonus,
  mixDrill,
  reliefOfficerBonus,
  supportIncomeFactor,
  supportLevyFactor,
  supportRestingLevel,
} from './cityAspects.js';
import { ACTION_COSTS } from './data.js';
import {
  advanceSeason as advanceSeasonWith,
  buildAssaultConfig,
  createNewGame,
  estimateBattlePreview,
  executeAITurnAction,
  getCityGenerals,
  getFactionIncomeBreakdown,
  levySizeOf,
  performAttackCity,
  performDevelopCity,
  performDevelopFarming,
  performDevelopTrade,
  performDrillTroops,
  performRecruitTroops,
  performReinforceCity,
  performRelief,
  performSowDiscord,
} from './engine.js';
import { validateAndHydrateGameState } from './saveSystem.js';
import { createTacticalBattle } from './tacticalEngine.js';
import type { City, GameState } from './types.js';

function withCity(state: GameState, cityId: string, patch: Partial<City>): GameState {
  return { ...state, cities: { ...state.cities, [cityId]: { ...state.cities[cityId], ...patch } } };
}

function rich(state: GameState, faction: 'wei' | 'shu' | 'wu'): GameState {
  return {
    ...state,
    factions: { ...state.factions, [faction]: { ...state.factions[faction], gold: 5000, food: 5000 } },
  };
}

const incomeOf = (state: GameState, cityId: string) =>
  getFactionIncomeBreakdown(state, 'shu').find((row) => row.cityId === cityId)!;

/** A season in which no city event begins, so each test sees only what it sets up. */
const advanceSeason = (state: GameState) => advanceSeasonWith(state, () => 0.999);

describe('City aspects: farming, trade, drill and the people', () => {
  it('starts every city level, so a new game earns what it always did', () => {
    const state = createNewGame('shu');
    for (const city of Object.values(state.cities)) {
      expect(city.farming).toBe(city.trade);
      expect(city.drill).toBe(50);
      expect(city.support).toBe(50);
      expect(cityProsperity(city)).toBe(city.farming);
    }
    expect(supportIncomeFactor(50)).toBe(1);
    expect(supportLevyFactor(50)).toBe(1);
    expect(drillMoraleBonus(50)).toBe(0);

    // Chengdu: base 260 gold and 280 grain at level 4, with no bonus from Shu itself.
    const chengdu = state.cities.chengdu;
    const bestPolitics = getCityGenerals(state, 'chengdu').reduce((max, g) => Math.max(max, g.politics), 50);
    const governor = 1 + Math.max(0, bestPolitics - 60) / 260;
    const row = incomeOf(state, 'chengdu');
    expect(row.gold).toBe(Math.round((chengdu.baseGold + 4 * 45) * governor));
    expect(row.food).toBe(Math.round((chengdu.baseFood + 4 * 40) * governor));
    expect(row.supportBonus).toBe(0);
  });

  it('raises grain with farming and gold with trade, each on its own', () => {
    const base = rich(withCity(createNewGame('shu'), 'jiangzhou', { farming: 2, trade: 2 }), 'shu');
    const before = incomeOf(base, 'jiangzhou');

    const farmed = performDevelopFarming(base, 'shu', 'jiangzhou', true);
    expect(farmed.cities.jiangzhou.farming).toBe(3);
    expect(farmed.cities.jiangzhou.trade).toBe(2);
    expect(farmed.factions.shu.gold).toBe(5000 - ACTION_COSTS.farmGold);
    expect(farmed.actionPoints).toBe(base.actionPoints - 1);
    expect(incomeOf(farmed, 'jiangzhou').food).toBeGreaterThan(before.food);
    expect(incomeOf(farmed, 'jiangzhou').gold).toBe(before.gold);

    const traded = performDevelopTrade(base, 'shu', 'jiangzhou', true);
    expect(traded.cities.jiangzhou.trade).toBe(3);
    expect(traded.cities.jiangzhou.farming).toBe(2);
    expect(incomeOf(traded, 'jiangzhou').gold).toBeGreaterThan(before.gold);
    expect(incomeOf(traded, 'jiangzhou').food).toBe(before.food);

    // The single "develop" order works on whichever is lower, farming first on a tie.
    const first = performDevelopCity(base, 'shu', 'jiangzhou', true);
    expect([first.cities.jiangzhou.farming, first.cities.jiangzhou.trade]).toEqual([3, 2]);
    const second = performDevelopCity(first, 'shu', 'jiangzhou', true);
    expect([second.cities.jiangzhou.farming, second.cities.jiangzhou.trade]).toEqual([3, 3]);

    // Nothing to improve at the top level, and nothing is charged for it.
    const full = withCity(base, 'jiangzhou', { farming: 5, trade: 5 });
    expect(performDevelopFarming(full, 'shu', 'jiangzhou', true)).toBe(full);
    expect(performDevelopTrade(full, 'shu', 'jiangzhou', true)).toBe(full);
    expect(cityTier(full.cities.jiangzhou)).toBe(5);
  });

  it('scales income and levies with the people’s support', () => {
    const base = createNewGame('shu');
    const neutral = incomeOf(base, 'chengdu');
    const loved = incomeOf(withCity(base, 'chengdu', { support: 100 }), 'chengdu');
    const hated = incomeOf(withCity(base, 'chengdu', { support: 0 }), 'chengdu');
    expect(loved.gold).toBeGreaterThan(neutral.gold);
    expect(hated.gold).toBeLessThan(neutral.gold);
    expect(loved.gold / neutral.gold).toBeCloseTo(1.15, 2);
    expect(hated.food / neutral.food).toBeCloseTo(0.85, 2);

    const city = base.cities.chengdu;
    expect(levySizeOf({ ...city, support: 100 }, 60)).toBe(Math.round(levySizeOf(city, 60) * 1.25));
    expect(levySizeOf({ ...city, support: 0 }, 60)).toBe(Math.round(levySizeOf(city, 60) * 0.75));
  });

  it('pays for a levy in support and drill, and for drill and relief in gold and grain', () => {
    let state = rich(withCity(createNewGame('shu'), 'chengdu', { drill: 80, support: 60 }), 'shu');
    const before = state.cities.chengdu;
    const bestCharisma = getCityGenerals(state, 'chengdu').reduce((max, g) => Math.max(max, g.charisma), 60);
    const levy = levySizeOf(before, bestCharisma);

    state = performRecruitTroops(state, 'shu', 'chengdu', true);
    const levied = state.cities.chengdu;
    expect(levied.troops).toBe(before.troops + levy);
    expect(levied.support).toBe(60 - SUPPORT_COST_LEVY);
    expect(levied.drill).toBe(mixDrill(before.troops, 80, levy, RAW_LEVY_DRILL));
    expect(levied.drill).toBeLessThan(80);

    const drillmaster = getCityGenerals(state, 'chengdu').sort((a, b) => b.command - a.command)[0];
    const goldBefore = state.factions.shu.gold;
    state = performDrillTroops(state, 'shu', 'chengdu', true);
    expect(state.cities.chengdu.drill).toBe(
      Math.min(100, levied.drill + DRILL_ORDER_GAIN + drillOfficerBonus(drillmaster.command))
    );
    expect(state.factions.shu.gold).toBe(goldBefore - ACTION_COSTS.drillGold);

    const steward = getCityGenerals(state, 'chengdu').sort((a, b) => b.charisma - a.charisma)[0];
    const foodBefore = state.factions.shu.food;
    state = performRelief(state, 'shu', 'chengdu', true);
    expect(state.cities.chengdu.support).toBe(
      Math.min(100, levied.support + RELIEF_ORDER_GAIN + reliefOfficerBonus(steward.charisma))
    );
    expect(state.factions.shu.food).toBe(foodBefore - ACTION_COSTS.reliefFood);

    // Neither order does anything, or costs anything, at the top of the scale or without the means.
    const topped = withCity(state, 'chengdu', { drill: 100, support: 100 });
    expect(performDrillTroops(topped, 'shu', 'chengdu', true)).toBe(topped);
    expect(performRelief(topped, 'shu', 'chengdu', true)).toBe(topped);
    const starving = { ...state, factions: { ...state.factions, shu: { ...state.factions.shu, food: 10 } } };
    expect(performRelief(starving, 'shu', 'chengdu', true)).toBe(starving);
    expect(performDrillTroops(state, 'wei', 'chengdu', true)).toBe(state);
  });

  it('merges drill when one garrison reinforces another', () => {
    const base = withCity(
      withCity(createNewGame('shu'), 'chengdu', { troops: 20000, drill: 90 }),
      'jiange',
      { troops: 5000, drill: 30 }
    );
    expect(base.cities.chengdu.neighbors).toContain('jiange');
    const after = performReinforceCity(base, 'shu', 'chengdu', 'jiange', 5000, true);
    expect(after.cities.jiange.troops).toBe(10000);
    expect(after.cities.jiange.drill).toBe(60);
    expect(after.cities.chengdu.drill).toBe(90);
  });

  it('sends a drilled army into battle with higher morale than a raw one', () => {
    const base = withCity(createNewGame('shu'), 'chengdu', { troops: 30000 });
    const moraleOf = (state: GameState) => {
      const config = buildAssaultConfig(state, 'shu', 'chengdu', 'jianning', 12000, 'assault', undefined, true)!;
      const battle = createTacticalBattle(state, config, () => 0.5);
      return {
        attacker: battle.units.find((u) => u.side === 'attacker')!.morale,
        defender: battle.units.find((u) => u.side === 'defender')!.morale,
      };
    };
    const even = moraleOf(base);
    const drilled = moraleOf(withCity(base, 'chengdu', { drill: 100 }));
    const raw = moraleOf(withCity(base, 'chengdu', { drill: 0 }));
    expect(drilled.attacker).toBe(even.attacker + 12);
    expect(raw.attacker).toBe(even.attacker - 12);
    expect(drilled.defender).toBe(even.defender);

    const stoutWalls = moraleOf(withCity(base, 'jianning', { drill: 100 }));
    expect(stoutWalls.defender).toBe(even.defender + 12);
    expect(stoutWalls.attacker).toBe(even.attacker);

    // The war room names drill among the things that weigh on the forecast.
    const forecast = estimateBattlePreview(
      withCity(withCity(base, 'chengdu', { drill: 100 }), 'jianning', { drill: 10 }),
      'shu',
      'chengdu',
      'jianning',
      12000,
      'assault'
    );
    const labels = forecast.modifiers.map((tag) => `${tag.label.en} ${tag.value}`);
    expect(labels).toContain('Well-drilled army (drill 100) +12 Morale');
    expect(labels).toContain('Raw garrison (drill 10) -10 Morale');
    expect(forecast.modifiers.find((tag) => tag.label.en.startsWith('Raw garrison'))?.positive).toBe(true);
  });

  it('hands a conquered city to the victors’ drill and a wary people; a held city pays in support', () => {
    const base = withCity(
      withCity(createNewGame('shu'), 'chengdu', { troops: 40000, drill: 70 }),
      'jianning',
      { support: 80 }
    );
    const taken = performAttackCity(base, 'shu', 'chengdu', 'jianning', 30000, 'fire', 'zhaoyun', true, () => 0.5);
    expect(taken.cities.jianning.owner).toBe('shu');
    expect(taken.cities.jianning.support).toBe(SUPPORT_AFTER_CONQUEST);
    expect(taken.cities.jianning.drill).toBe(70 + DRILL_VICTORY_GAIN);

    // A token force against a strong garrison is thrown back.
    const walled = withCity(base, 'jianning', { troops: 30000, defense: 5, drill: 50, support: 80 });
    const held = performAttackCity(walled, 'shu', 'chengdu', 'jianning', 1000, 'assault', undefined, true, () => 0.5);
    expect(held.cities.jianning.owner).toBe('neutral');
    expect(held.cities.jianning.support).toBe(80 - SUPPORT_COST_SIEGE);
    expect(held.cities.jianning.drill).toBe(50 + DRILL_HELD_GAIN);

    const stirred = performSowDiscord(rich(base, 'shu'), 'shu', 'jianning', undefined, true, () => 0.5);
    expect(stirred.cities.jianning.support).toBe(80 - SUPPORT_COST_DISCORD);
  });

  it('lets drill and support settle each season, and a city in unrest loses men', () => {
    // Both governors are kept on the fields, so drill and support are left to settle by themselves.
    const base = withCity(
      withCity(createNewGame('shu'), 'chengdu', { drill: 90, support: 20, troops: 10000, focus: 'farming' }),
      'jiange',
      { drill: 30, support: 90, focus: 'farming' }
    );
    const next = advanceSeason(base);
    expect(next.cities.chengdu.drill).toBe(88);
    expect(next.cities.jiange.drill).toBe(32);
    expect(next.cities.chengdu.troops).toBe(9500);
    expect(next.cities.chengdu.support).toBe(22);
    expect(next.cities.jiange.support).toBe(88);
    expect(next.chronicle.some((entry) => entry.text.en.includes('Unrest in Chengdu'))).toBe(true);

    // A well-liked general holds support above the middle; an empty city settles at 50.
    expect(supportRestingLevel(100)).toBe(70);
    expect(supportRestingLevel(0)).toBe(50);
    const charisma = getCityGenerals(base, 'chengdu').reduce((max, g) => Math.max(max, g.charisma), 0);
    const settled = advanceSeason(withCity(base, 'chengdu', { support: supportRestingLevel(charisma) }));
    expect(settled.cities.chengdu.support).toBe(supportRestingLevel(charisma));

    // Free cities are left as they are.
    const quiet = advanceSeason(withCity(base, 'jianning', { drill: 80, support: 10, troops: 6900 }));
    expect(quiet.cities.jianning.drill).toBe(80);
    expect(quiet.cities.jianning.support).toBe(10);
  });

  it('loads a save from before the split with farming and trade at the old level', () => {
    const fresh = createNewGame('wu');
    const legacyCities: Record<string, unknown> = {};
    for (const [id, city] of Object.entries(fresh.cities)) {
      const { farming: _farming, trade: _trade, drill: _drill, support: _support, ...rest } = city;
      legacyCities[id] = { ...rest, development: id === 'jianye' ? 5 : id === 'wu' ? 2 : 3 };
    }
    const loaded = validateAndHydrateGameState(JSON.parse(JSON.stringify({ ...fresh, cities: legacyCities })));
    expect(loaded.cities.jianye.farming).toBe(5);
    expect(loaded.cities.jianye.trade).toBe(5);
    expect(loaded.cities.wu.farming).toBe(2);
    expect(loaded.cities.wu.trade).toBe(2);
    expect(loaded.cities.wu.drill).toBe(50);
    expect(loaded.cities.wu.support).toBe(50);
    expect('development' in loaded.cities.wu).toBe(false);

    // A current save keeps its own numbers, and nonsense is brought back into range.
    const current = validateAndHydrateGameState(
      JSON.parse(
        JSON.stringify(withCity(fresh, 'wu', { farming: 4, trade: 1, drill: 77, support: 140 }))
      )
    );
    expect(current.cities.wu.farming).toBe(4);
    expect(current.cities.wu.trade).toBe(1);
    expect(current.cities.wu.drill).toBe(77);
    expect(current.cities.wu.support).toBe(100);
  });

  it('lets rival realms give the new orders, and has them relieve a restless city', () => {
    let state = rich(withCity(createNewGame('shu'), 'ye', { farming: 2, trade: 2, drill: 40, support: 40 }), 'wei');
    state = executeAITurnAction(state, 'wei', { type: 'farm', cityId: 'ye' });
    state = executeAITurnAction(state, 'wei', { type: 'trade', cityId: 'ye' });
    state = executeAITurnAction(state, 'wei', { type: 'drill', cityId: 'ye' });
    state = executeAITurnAction(state, 'wei', { type: 'relief', cityId: 'ye' });
    expect(state.cities.ye.farming).toBe(3);
    expect(state.cities.ye.trade).toBe(3);
    expect(state.cities.ye.drill).toBeGreaterThan(40);
    expect(state.cities.ye.support).toBeGreaterThan(40);
    // A rival cannot give orders in a city it does not hold.
    expect(executeAITurnAction(state, 'wu', { type: 'relief', cityId: 'ye' }).cities.ye.support).toBe(
      state.cities.ye.support
    );

    // With nothing worth attacking, a realm with a city near unrest opens its granaries there.
    let calm = rich(createNewGame('shu'), 'wu');
    for (const city of Object.values(calm.cities)) {
      calm = withCity(calm, city.id, { troops: city.owner === 'wu' ? 3000 : 30000 });
    }
    calm = withCity(calm, 'kuaiji', { support: 12 });
    const decision = generateHeuristicAITurn(calm, 'wu', 'en');
    expect(decision.action).toEqual({ type: 'relief', cityId: 'kuaiji' });
  });
});
