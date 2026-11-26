import { describe, expect, it } from 'vitest';
import { citySpecKey, citySpecOf } from '../components/city/cityLayout.js';
import { mixDrill } from './cityAspects.js';
import { ACTION_COSTS } from './data.js';
import {
  WALL_SCAR_GATE_FACTOR,
  aspectWorksProgress,
  canScoutCityDetails,
  createNewGame,
  estimateBattlePreview,
  formatScoutedTroops,
  getCityCrisisOptions,
  getFactionIncomeBreakdown,
  getSummonableGeneralsForCity,
  performAppointGovernor,
  performDevelopFarming,
  performDevelopTrade,
  performFortifyCity,
  performMendWallScar,
  performReinforceCity,
  performResolveCityCrisis,
  performSummonGovernor,
} from './engine.js';
import { GATE_BASE_HP, GATE_HP_PER_DEFENSE, createTacticalBattle } from './tacticalEngine.js';
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

describe('City Management Pillars A + C Enhancements', () => {
  it('clears leftover governor works when manually upgrading farming, trade, or defense to Lv.5', () => {
    let state = createNewGame('wei');
    state = {
      ...state,
      factions: { ...state.factions, wei: { ...state.factions.wei, gold: 2000 } },
    };
    state = withCity(state, 'xuchang', {
      farming: 4,
      trade: 4,
      defense: 4,
      works: { farming: 88, trade: 76, walls: 91 },
    });

    const progBefore = aspectWorksProgress(state, state.cities.xuchang, 'farming');
    expect(progBefore.works).toBe(88);

    state = performDevelopFarming(state, 'wei', 'xuchang', false);
    state = performDevelopTrade(state, 'wei', 'xuchang', false);
    state = performFortifyCity(state, 'wei', 'xuchang', false);

    expect(state.cities.xuchang.farming).toBe(5);
    expect(state.cities.xuchang.trade).toBe(5);
    expect(state.cities.xuchang.defense).toBe(5);
    expect(state.cities.xuchang.works).toEqual({ farming: 0, trade: 0, walls: 0 });
  });

  it('ranks spare officers first for Summon Officer and appoints them governor in 1 AP', () => {
    let state = createNewGame('shu');
    // Make Yong'an owned by Shu with zero officers stationed
    state = withCity(state, 'yongan', { owner: 'shu', governorId: undefined });
    for (const g of Object.values(state.generals)) {
      if (g.cityId === 'yongan' && g.faction === 'shu') {
        state = {
          ...state,
          generals: { ...state.generals, [g.id]: { ...g, cityId: 'chengdu' } },
        };
      }
    }

    const candidates = getSummonableGeneralsForCity(state, 'shu', 'yongan');
    expect(candidates.length).toBeGreaterThan(0);
    // Top candidate should come from a multi-officer city so it does not leave origin empty
    expect(candidates[0].leavesOriginEmpty).toBe(false);

    const chosen = candidates[0].general;
    state = performAppointGovernor(state, 'shu', chosen.cityId, chosen.id);
    expect(state.cities[chosen.cityId].governorId).toBe(chosen.id);

    const apBefore = state.actionPoints;
    const after = performSummonGovernor(state, 'shu', chosen.id, 'yongan', true, true);
    expect(after.actionPoints).toBe(apBefore - 1);
    expect(after.generals[chosen.id].cityId).toBe('yongan');
    expect(after.cities.yongan.governorId).toBe(chosen.id);
    // Origin city's stale governor appointment is cleanly cleared
    expect(after.cities[chosen.cityId].governorId).toBeUndefined();
  });

  it('marches custom reinforcement strength, blends drill, and escorts selected generals in 1 AP', () => {
    let state = createNewGame('wei');
    state = withCity(state, 'xuchang', { troops: 12000, drill: 80 });
    state = withCity(state, 'luoyang', { owner: 'wei', troops: 4000, drill: 40 });

    const xuchangOfficers = Object.values(state.generals).filter(
      (g) => g.faction === 'wei' && g.status === 'active' && g.cityId === 'xuchang'
    );
    expect(xuchangOfficers.length).toBeGreaterThan(0);
    const escort = xuchangOfficers[0];
    state = performAppointGovernor(state, 'wei', 'xuchang', escort.id);

    const expectedDrill = mixDrill(4000, 40, 5000, 80);
    const apBefore = state.actionPoints;

    const next = performReinforceCity(
      state,
      'wei',
      'xuchang',
      'luoyang',
      5000,
      true,
      [escort.id]
    );

    expect(next.actionPoints).toBe(apBefore - 1);
    expect(next.cities.xuchang.troops).toBe(7000);
    expect(next.cities.luoyang.troops).toBe(9000);
    expect(next.cities.luoyang.drill).toBe(expectedDrill);
    expect(next.generals[escort.id].cityId).toBe('luoyang');
    expect(next.cities.xuchang.governorId).toBeUndefined();
  });

  it('applies -30% tactical Gate HP on wallScar, shows Breached Walls forecast tag, and allows Mend Breach on Lv.5 walls', () => {
    let state = createNewGame('shu');
    // Put Xiangyang at Defense Lv.5 with an active wallScar
    state = withCity(state, 'xiangyang', { defense: 5, wallScar: 3, troops: 9000 });
    state = withCity(state, 'jiangling', { troops: 14000 });

    const fullGateHp = GATE_BASE_HP + 5 * GATE_HP_PER_DEFENSE;
    const expectedScarredHp = Math.round(fullGateHp * WALL_SCAR_GATE_FACTOR);

    const battle = createTacticalBattle(state, {
      id: 'scar-test',
      fromCityId: 'jiangling',
      toCityId: 'xiangyang',
      attackerFaction: 'shu',
      defenderFaction: 'wei',
      primaryTroops: 10000,
      tactic: 'siege',
      consumeAP: false,
      playerSide: 'attacker',
    });

    expect(battle.grid[3][6].type).toBe('gate');
    expect(battle.grid[3][6].gateMaxHp).toBe(fullGateHp);
    expect(battle.grid[3][6].gateHp).toBe(expectedScarredHp);
    expect(battle.grid[4][6].gateHp).toBe(expectedScarredHp);

    const preview = estimateBattlePreview(state, 'shu', 'jiangling', 'xiangyang', 10000, 'siege');
    expect(preview.modifiers.some((m) => m.label.en === 'Breached Walls')).toBe(true);

    // Wei owns Xiangyang at Lv.5: performFortifyCity cannot run at Lv.5, but performMendWallScar repairs the breach!
    let weiTurn: GameState = {
      ...state,
      playerFaction: 'wei',
      actionPoints: 3,
      factions: { ...state.factions, wei: { ...state.factions.wei, gold: 500 } },
    };
    expect(performFortifyCity(weiTurn, 'wei', 'xiangyang', true)).toBe(weiTurn);

    const supportBefore = weiTurn.cities.xiangyang.support;
    weiTurn = performMendWallScar(weiTurn, 'wei', 'xiangyang', true);
    expect(weiTurn.cities.xiangyang.wallScar).toBeUndefined();
    expect(weiTurn.cities.xiangyang.support).toBe(Math.min(100, supportBefore + 3));
    expect(weiTurn.factions.wei.gold).toBe(500 - ACTION_COSTS.mendBreachGold);
    expect(weiTurn.actionPoints).toBe(2);
  });

  it('resolves Plague, Flood, and Riot crises via 0-AP Magistrate Edicts with tech discounts', () => {
    let state = createNewGame('wu');
    state = {
      ...state,
      factions: { ...state.factions, wu: { ...state.factions.wu, gold: 500, food: 500 } },
    };

    // 1. Plague with Modern Medicine unlocked -> 50% Gold discount (50G), +14 Support, +2 Trust, 0 AP spent
    let plagueState: GameState = {
      ...withCity(state, 'jianye', {
        support: 50,
        event: { kind: 'plague', seasonsLeft: 1 },
      }),
      chrono: { ...state.chrono, unlockedTechs: ['medicine'], trust: 60 },
    };
    const plagueOpts = getCityCrisisOptions(plagueState, 'jianye');
    expect(plagueOpts).toHaveLength(1);
    expect(plagueOpts[0].goldCost).toBe(50);
    expect(plagueOpts[0].supportDelta).toBe(14);

    const apBefore = plagueState.actionPoints;
    plagueState = performResolveCityCrisis(plagueState, 'wu', 'jianye', 'quarantine');
    expect(plagueState.actionPoints).toBe(apBefore);
    expect(plagueState.cities.jianye.event).toBeUndefined();
    expect(plagueState.cities.jianye.support).toBe(64);
    expect(plagueState.factions.wu.gold).toBe(450);
    expect(plagueState.chrono.trust).toBe(62);

    // 2. Flood with Agriculture tech -> 45G + 45F, restores full seasonal grain income immediately
    let floodState: GameState = {
      ...withCity(state, 'chaisang', {
        support: 55,
        event: { kind: 'flood', seasonsLeft: 2 },
      }),
      chrono: { ...state.chrono, unlockedTechs: ['agriculture'] },
    };
    const floodedFood = getFactionIncomeBreakdown(floodState, 'wu').find(
      (r) => r.cityId === 'chaisang'
    )!.food;
    const floodOpts = getCityCrisisOptions(floodState, 'chaisang');
    expect(floodOpts[0].goldCost).toBe(45);
    expect(floodOpts[0].foodCost).toBe(45);

    floodState = performResolveCityCrisis(floodState, 'wu', 'chaisang', 'waterworks');
    const restoredFood = getFactionIncomeBreakdown(floodState, 'wu').find(
      (r) => r.cityId === 'chaisang'
    )!.food;
    expect(floodState.cities.chaisang.event).toBeUndefined();
    expect(restoredFood).toBeGreaterThan(floodedFood * 1.8);

    // 3. Riot -> Tax Amnesty vs Martial Suppression
    const riotState = withCity(state, 'wu', {
      support: 28,
      drill: 60,
      event: { kind: 'riot', seasonsLeft: 1 },
    });
    const riotOpts = getCityCrisisOptions(riotState, 'wu');
    expect(riotOpts.map((o) => o.choice)).toEqual(['amnesty', 'suppress']);

    const suppressed = performResolveCityCrisis(riotState, 'wu', 'wu', 'suppress');
    expect(suppressed.cities.wu.event).toBeUndefined();
    expect(suppressed.cities.wu.support).toBe(20);
    expect(suppressed.cities.wu.drill).toBe(55);
    expect(suppressed.factions.wu.gold).toBe(500);
  });

  it('enforces enemy city recon fog-of-war until adjacent or Spyglass/Balloon unlocked, and invalidates 3D citySpecKey on tech/hero changes', () => {
    const state = createNewGame('shu');
    // Owned city & bordering rival city are scouted; distant northern city (Ye) is unscouted
    expect(canScoutCityDetails(state, 'shu', 'chengdu')).toBe(true);
    expect(canScoutCityDetails(state, 'shu', 'xiangyang')).toBe(true);
    expect(canScoutCityDetails(state, 'shu', 'ye')).toBe(false);
    expect(formatScoutedTroops(8340, 'en')).toBe('~8,000');
    expect(formatScoutedTroops(8340, 'zh')).toBe('约 8,000');

    const withBalloon: GameState = {
      ...state,
      chrono: { ...state.chrono, unlockedTechs: ['balloon'] },
    };
    expect(canScoutCityDetails(withBalloon, 'shu', 'ye')).toBe(true);

    const specPlain = citySpecOf(state.cities.chengdu, 'spring', false, false, 'farming');
    const specTech = citySpecOf(state.cities.chengdu, 'spring', false, false, 'farming', {
      hasBalloon: true,
      hasAgriculture: true,
      governorChar: '诸',
      hasWanderingHero: true,
    });
    expect(citySpecKey(specTech)).not.toBe(citySpecKey(specPlain));
  });
});
