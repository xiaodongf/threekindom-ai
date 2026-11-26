import { describe, expect, it } from 'vitest';
import { generateHeuristicAITurn } from '../../server/ai/providers/heuristic.js';
import { citySpecKey, citySpecOf } from '../components/city/cityLayout.js';
import { cityEventChances, eventIncomeFactor } from './cityEvents.js';
import { ACTION_COSTS } from './data.js';
import {
  advanceSeason,
  buildAssaultConfig,
  canCharterSpecialty,
  cityEconomyOrderGoldCost,
  cityRawLevyDrill,
  cityRiverStrikeFoodCost,
  createNewGame,
  estimateBattlePreview,
  executeAITurnAction,
  getCityLandmark,
  getFactionIncomeBreakdown,
  getFactionUpkeep,
  levySizeOf,
  performCharterSpecialty,
  performDevelopFarming,
  performNightRaid,
  performRecruitTroops,
  performSabotageBombard,
} from './engine.js';
import { governorPlanOf } from './governors.js';
import { validateAndHydrateGameState } from './saveSystem.js';
import { GATE_BASE_HP, GATE_HP_PER_DEFENSE, createTacticalBattle, getRampartDefBonus } from './tacticalEngine.js';
import type { City, GameState } from './types.js';

function withCity(state: GameState, cityId: string, patch: Partial<City>): GameState {
  return {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: { ...state.cities[cityId], ...patch },
    },
  };
}

describe('Pillar B — Commandery Specializations & Historical Landmarks', () => {
  it('enforces charter prosperity rules while allowing Bastion immediately on fortresses', () => {
    let state = createNewGame('shu');
    state = {
      ...state,
      factions: { ...state.factions, shu: { ...state.factions.shu, gold: 1000 } },
    };

    // Jiange starts at farming=1, trade=1, defense=5, terrain='fortress'
    expect(canCharterSpecialty(state.cities.jiange, 'granary')).toBe(false);
    expect(canCharterSpecialty(state.cities.jiange, 'bastion')).toBe(true);
    expect(performCharterSpecialty(state, 'shu', 'jiange', 'granary', true)).toBe(state);

    const apBefore = state.actionPoints;
    state = performCharterSpecialty(state, 'shu', 'jiange', 'bastion', true);
    expect(state.cities.jiange.specialty).toBe('bastion');
    expect(state.factions.shu.gold).toBe(1000 - ACTION_COSTS.specializeGold);
    expect(state.actionPoints).toBe(apBefore - 1);
  });

  it('applies Granary & Emporium economic multipliers, upkeep savings, flood buffer, and order discounts', () => {
    let state = createNewGame('wei');
    state = {
      ...state,
      factions: { ...state.factions, wei: { ...state.factions.wei, gold: 1500 } },
    };

    const baseRow = getFactionIncomeBreakdown(state, 'wei').find((r) => r.cityId === 'ye')!;
    const baseUpkeep = getFactionUpkeep(state, 'wei');

    const withGranary = performCharterSpecialty(state, 'wei', 'ye', 'granary', false);
    const granaryRow = getFactionIncomeBreakdown(withGranary, 'wei').find((r) => r.cityId === 'ye')!;
    expect(granaryRow.food).toBeGreaterThan(Math.round(baseRow.food * 1.2));
    expect(getFactionUpkeep(withGranary, 'wei')).toBeLessThan(baseUpkeep);

    // Granary halves flood grain penalty (0.75 instead of 0.5)
    expect(
      eventIncomeFactor({
        id: 'ye',
        specialty: 'granary',
        event: { kind: 'flood', seasonsLeft: 2 },
      }).food
    ).toBeCloseTo(0.75);

    // Emporium boosts Gold by +25%, raises Fair chance by +3%, and discounts Farm/Trade by 20%
    const withEmporium = performCharterSpecialty(state, 'wei', 'ye', 'emporium', false);
    const empRow = getFactionIncomeBreakdown(withEmporium, 'wei').find((r) => r.cityId === 'ye')!;
    expect(empRow.gold).toBeGreaterThan(Math.round(baseRow.gold * 1.2));
    expect(cityEconomyOrderGoldCost(withEmporium.cities.ye, 'farming')).toBe(96);

    const fairBase =
      cityEventChances(state, state.cities.ye, 'spring').find(([k]) => k === 'fair')?.[1] ?? 0;
    const fairEmp =
      cityEventChances(withEmporium, withEmporium.cities.ye, 'spring').find(([k]) => k === 'fair')?.[1] ?? 0;
    expect(fairEmp - fairBase).toBeCloseTo(0.03);

    const goldBeforeFarm = withEmporium.factions.wei.gold;
    const afterFarm = performDevelopFarming(withEmporium, 'wei', 'ye', false);
    expect(goldBeforeFarm - afterFarm.factions.wei.gold).toBe(96);
  });

  it('applies Armory levy & tactical ATK bonuses and Bastion siege, raid/bombard & drill floor defenses', () => {
    let state = createNewGame('shu');
    state = {
      ...state,
      factions: { ...state.factions, shu: { ...state.factions.shu, gold: 1500, food: 1500 } },
    };

    const baseLevy = levySizeOf(state.cities.hanzhong, 80);
    let armoryState = performCharterSpecialty(state, 'shu', 'hanzhong', 'armory', false);
    expect(levySizeOf(armoryState.cities.hanzhong, 80)).toBeGreaterThan(Math.round(baseLevy * 1.12));
    expect(cityRawLevyDrill(armoryState.cities.hanzhong)).toBe(40);

    armoryState = withCity(armoryState, 'hanzhong', { drill: 60, troops: 10000 });
    const recruited = performRecruitTroops(armoryState, 'shu', 'hanzhong', false);
    const plainRecruited = performRecruitTroops(
      withCity(state, 'hanzhong', { drill: 60, troops: 10000 }),
      'shu',
      'hanzhong',
      false
    );
    expect(recruited.cities.hanzhong.drill).toBeGreaterThan(plainRecruited.cities.hanzhong.drill);

    // Bastion + Jiange Sword Gate stack on 8x8 tactical grid!
    let bastionState = performCharterSpecialty(armoryState, 'shu', 'jiange', 'bastion', false);
    bastionState = withCity(bastionState, 'jiange', { drill: 62, troops: 10000 });
    bastionState = withCity(bastionState, 'chencang', { owner: 'wei', troops: 12000 });

    const battle = createTacticalBattle(bastionState, {
      id: 'bastion-jiange',
      fromCityId: 'hanzhong',
      toCityId: 'chencang',
      attackerFaction: 'shu',
      defenderFaction: 'wei',
      primaryTroops: 8000,
      tactic: 'assault',
      consumeAP: false,
      playerSide: 'attacker',
    });
    expect(battle.attackerStagingAllAtk).toBeCloseTo(0.1);

    // Hanzhong borders Jiange along ROADS: test Wei attacking Shu's Bastion + Sword Gate at Jiange!
    const weiVsJiange = withCity(bastionState, 'hanzhong', { owner: 'wei', troops: 12000 });
    const defBattle = createTacticalBattle(weiVsJiange, {
      id: 'def-jiange',
      fromCityId: 'hanzhong',
      toCityId: 'jiange',
      attackerFaction: 'wei',
      defenderFaction: 'shu',
      primaryTroops: 9000,
      tactic: 'siege',
      consumeAP: false,
      playerSide: 'defender',
    });
    // Base Lv.5 Gate = 4500 + Bastion 900 + Jiange Sword Gate 900 = 6300!
    expect(defBattle.grid[3][6].gateMaxHp).toBe(GATE_BASE_HP + 5 * GATE_HP_PER_DEFENSE + 1800);
    expect(getRampartDefBonus(defBattle)).toBeCloseTo(0.3 + 5 * 0.2 + 0.1 + 0.15);

    const preview = estimateBattlePreview(weiVsJiange, 'wei', 'hanzhong', 'jiange', 9000, 'siege');
    expect(preview.modifiers.some((m) => m.label.en === 'Citadel Bastion')).toBe(true);
    expect(preview.modifiers.some((m) => m.label.en === 'Sword Gate Plank Cliffs')).toBe(true);

    // Bastion halves enemy Night Raid & Bombard casualties and holds Drill floor at 60 across seasons
    const unspecRaid = performNightRaid(state, 'wei', 'chencang', 'hanzhong', undefined, false, () => 0.5);
    const bastionHanzhong = withCity(state, 'hanzhong', { specialty: 'bastion' });
    const specRaid = performNightRaid(bastionHanzhong, 'wei', 'chencang', 'hanzhong', undefined, false, () => 0.5);
    expect(specRaid.lastOperation!.enemyTroopsLost).toBeLessThan(
      unspecRaid.lastOperation!.enemyTroopsLost * 0.6
    );

    const unspecBombard = performSabotageBombard(
      { ...state, factions: { ...state.factions, wei: { ...state.factions.wei, gold: 500 } } },
      'wei',
      'chencang',
      'hanzhong',
      undefined,
      false,
      () => 0.5
    );
    const specBombard = performSabotageBombard(
      { ...bastionHanzhong, factions: { ...bastionHanzhong.factions, wei: { ...bastionHanzhong.factions.wei, gold: 500 } } },
      'wei',
      'chencang',
      'hanzhong',
      undefined,
      false,
      () => 0.5
    );
    expect(specBombard.lastOperation!.enemyTroopsLost).toBeLessThan(
      unspecBombard.lastOperation!.enemyTroopsLost * 0.6
    );

    const nextSeason = advanceSeason(bastionState, () => 0.999);
    expect(nextSeason.cities.jiange.drill).toBeGreaterThanOrEqual(60);
  });

  it('accelerates governor works, heals wounded heroes faster, and generates Innovation Points via Chrono-Academy', () => {
    let state = createNewGame('shu');
    state = {
      ...state,
      factions: { ...state.factions, shu: { ...state.factions.shu, gold: 1000 } },
    };
    const rateBefore = governorPlanOf(state, 'chengdu')!.rate;
    state = performCharterSpecialty(state, 'shu', 'chengdu', 'academy', false);
    const rateAfter = governorPlanOf(state, 'chengdu')!.rate;
    expect(rateAfter).toBeGreaterThan(rateBefore);

    // Wounded hero with 2 turns left recovers in 1 season inside an Academy city!
    state = {
      ...state,
      generals: {
        ...state.generals,
        zhaoyun: {
          ...state.generals.zhaoyun,
          cityId: 'chengdu',
          status: 'wounded',
          woundedTurns: 2,
        },
      },
    };
    const ipBefore = state.chrono.innovationPoints;
    // Turn 1 -> Turn 2 (even turn: +1 base +1 from 1 Academy = +2 Innovation Points!)
    const turn2 = advanceSeason(state, () => 0.999);
    expect(turn2.generals.zhaoyun.status).toBe('active');
    expect(turn2.chrono.innovationPoints).toBe(ipBefore + 2);
  });

  it('activates Historical Landmarks (Chengdu weather immunity, Chaisang free River Fleet, Luoyang Trust & Ye Loyalty)', () => {
    const shu = createNewGame('shu');
    expect(getCityLandmark('chengdu')?.id).toBe('dujiangyan');
    // Chengdu never rolls flood or drought in any season
    for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) {
      const kinds = cityEventChances(shu, shu.cities.chengdu, s).map(([k]) => k);
      expect(kinds).not.toContain('flood');
      expect(kinds).not.toContain('drought');
    }

    // Chaisang launches River Fleet with 0 Food!
    let wu = createNewGame('wu');
    wu = {
      ...wu,
      factions: { ...wu.factions, wu: { ...wu.factions.wu, food: 0 } },
    };
    expect(cityRiverStrikeFoodCost(wu.cities.chaisang)).toBe(0);
    const fleetCfg = buildAssaultConfig(
      wu,
      'wu',
      'chaisang',
      'jiangling',
      5000,
      'fire',
      undefined,
      false,
      { isRiverStrike: true }
    );
    expect(fleetCfg).not.toBeNull();

    // Wei holds Luoyang (+2 Trust/season up to 85) & Ye (+2 Loyalty/season for stationed heroes)
    let wei = createNewGame('wei');
    const yeHero = Object.values(wei.generals).find(
      (g) => g.faction === 'wei' && g.status === 'active' && g.cityId === 'ye'
    )!;
    wei = {
      ...wei,
      chrono: { ...wei.chrono, trust: 70 },
      generals: { ...wei.generals, [yeHero.id]: { ...yeHero, loyalty: 80 } },
    };
    const nextWei = advanceSeason(wei, () => 0.999);
    expect(nextWei.chrono.trust).toBe(72);
    expect(nextWei.generals[yeHero.id].loyalty).toBeGreaterThanOrEqual(82);
  });

  it('lets Rival Heuristic AI charter specializations, preserves specialty on save/load, and updates 3D citySpecKey', () => {
    let state = createNewGame('shu');
    // Give Wei high gold and truces/strong borders so it focuses on domestic buildup -> charters specialty!
    state = {
      ...state,
      factions: { ...state.factions, wei: { ...state.factions.wei, gold: 1200, food: 1200 } },
      diplomacy: {
        ...state.diplomacy,
        'shu-wei': { ...state.diplomacy['shu-wei'], truceTurnsLeft: 3, status: 'truce' },
        'wei-wu': { ...state.diplomacy['wei-wu'], truceTurnsLeft: 3, status: 'truce' },
      },
    };
    // Make neutral borders strong and rear garrisons already marched forward (<6500) so Wei charters a specialty
    state = withCity(state, 'wuwei', { troops: 18000 });
    state = withCity(state, 'shangyong', { troops: 18000 });
    for (const c of Object.values(state.cities)) {
      if (c.owner === 'wei' && c.troops >= 6500) {
        state = withCity(state, c.id, { troops: 6000 });
      }
    }

    const decision = generateHeuristicAITurn(state, 'wei', 'en');
    expect(decision.action.type).toBe('specialize');
    expect(decision.action.specialty).toBeDefined();

    const executed = executeAITurnAction(state, 'wei', decision.action, decision.proclamation);
    expect(executed.cities[decision.action.cityId].specialty).toBe(decision.action.specialty);

    const hydrated = validateAndHydrateGameState(JSON.parse(JSON.stringify(executed)));
    expect(hydrated.cities[decision.action.cityId].specialty).toBe(decision.action.specialty);

    const specA = citySpecOf(state.cities.chengdu, 'spring', false, false);
    const specB = citySpecOf(
      { ...state.cities.chengdu, specialty: 'academy' },
      'spring',
      false,
      false
    );
    expect(specA.landmarkId).toBe('dujiangyan');
    expect(citySpecKey(specB)).not.toBe(citySpecKey(specA));
  });
});
