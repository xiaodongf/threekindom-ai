import { describe, expect, it } from 'vitest';
import {
  advanceSeason,
  applyDiplomacyOutcome,
  createNewGame,
  getFactionCities,
  getRelation,
  performAttackCity,
  performDevelopCity,
  performFortifyCity,
  performRecruitTroops,
} from './engine.js';

describe('Three Kingdoms AI Game Engine', () => {
  it('initializes balanced 214 AD map state for chosen faction', () => {
    const state = createNewGame('shu');
    expect(state.year).toBe(214);
    expect(state.season).toBe('spring');
    expect(state.playerFaction).toBe('shu');
    expect(state.actionPoints).toBe(2);
    expect(getFactionCities(state, 'wei').length).toBe(5);
    expect(getFactionCities(state, 'shu').length).toBe(3);
    expect(getFactionCities(state, 'wu').length).toBe(3);
    expect(getFactionCities(state, 'neutral').length).toBe(2);
  });

  it('develops, fortifies, and recruits while spending AP and resources', () => {
    let state = createNewGame('wei');
    const startGold = state.factions.wei.gold;
    const startTroops = state.cities.xuchang.troops;

    state = performDevelopCity(state, 'wei', 'xuchang', true);
    expect(state.cities.xuchang.development).toBe(5);
    expect(state.actionPoints).toBe(1);
    expect(state.factions.wei.gold).toBeLessThan(startGold);

    state = performRecruitTroops(state, 'wei', 'xuchang', true);
    expect(state.cities.xuchang.troops).toBeGreaterThan(startTroops);
    expect(state.actionPoints).toBe(0);

    // Fortify should be ignored when AP is 0 and consumeAP=true
    const beforeFortify = state.cities.xuchang.defense;
    state = performFortifyCity(state, 'wei', 'xuchang', true);
    expect(state.cities.xuchang.defense).toBe(beforeFortify);
  });

  it('resolves city assault and transfers ownership on victory', () => {
    let state = createNewGame('shu');
    // Boost Jiangling garrison so capture of neutral Xiangyang is decisive
    state = {
      ...state,
      cities: {
        ...state.cities,
        jiangling: { ...state.cities.jiangling, troops: 24000 },
      },
    };

    const next = performAttackCity(
      state,
      'shu',
      'jiangling',
      'xiangyang',
      20000,
      'fire',
      'guanyu',
      true,
      () => 0.5
    );

    expect(next.lastBattle).not.toBeNull();
    expect(next.lastBattle?.captured).toBe(true);
    expect(next.cities.xiangyang.owner).toBe('shu');
    expect(next.generals.guanyu.cityId).toBe('xiangyang');
  });

  it('applies diplomacy truce and ticks it down on season advance', () => {
    let state = createNewGame('wu');
    state = applyDiplomacyOutcome(
      state,
      'wu',
      'wei',
      25,
      3,
      250,
      false,
      { en: 'Truce signed.', zh: '缔结停战盟约。' }
    );

    const rel = getRelation(state, 'wu', 'wei');
    expect(rel.truceTurnsLeft).toBe(3);
    expect(rel.status).toBe('truce');

    state = advanceSeason(state);
    expect(state.season).toBe('summer');
    expect(state.turn).toBe(2);
    expect(state.actionPoints).toBe(2);
    expect(getRelation(state, 'wu', 'wei').truceTurnsLeft).toBe(2);
  });
});
