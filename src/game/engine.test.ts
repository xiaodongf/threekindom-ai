import { describe, expect, it } from 'vitest';
import {
  advanceSeason,
  applyDiplomacyOutcome,
  applyHeroEncounterOutcome,
  canSeeHeroWeakness,
  createNewGame,
  getActiveBondsForHeroes,
  getChronoInsightBonus,
  getFactionCities,
  getRelation,
  performAttackCity,
  performDevelopCity,
  performFortifyCity,
  performPrisonerAction,
  performRecruitTroops,
  performRelocateHero,
  performResearchTech,
  resolveDuelRound,
} from './engine.js';

describe('Three Kingdoms AI — Time-Traveler & Hero-Centric Engine', () => {
  it('initializes 214 AD map with 36 heroes (27 faction + 9 wandering), player profile, and 3 AP', () => {
    const state = createNewGame('shu');
    expect(state.year).toBe(214);
    expect(state.season).toBe('spring');
    expect(state.playerFaction).toBe('shu');
    expect(state.playerProfile.portrait).toBe('/portraits/traveler_male.jpg');
    expect(state.actionPoints).toBe(3);
    expect(Object.keys(state.generals).length).toBe(36);
    expect(
      Object.values(state.generals).filter((g) => g.status === 'wandering').length
    ).toBe(9);
    expect(state.generals.lubu.war).toBe(100);
    expect(state.generals.zhouyu.faction).toBe('wu');
    expect(getFactionCities(state, 'wei').length).toBe(5);
    expect(getFactionCities(state, 'shu').length).toBe(3);
    expect(getFactionCities(state, 'wu').length).toBe(3);
    expect(getFactionCities(state, 'neutral').length).toBe(2);
  });

  it('spends 1 AP for strategic hero relocation and domestic orders', () => {
    let state = createNewGame('wei');
    const startGold = state.factions.wei.gold;
    const startTroops = state.cities.xuchang.troops;

    state = performRelocateHero(state, 'wei', 'xuchu', 'luoyang', true);
    expect(state.generals.xuchu.cityId).toBe('luoyang');
    expect(state.actionPoints).toBe(2);

    state = performDevelopCity(state, 'wei', 'xuchang', true);
    expect(state.cities.xuchang.development).toBe(5);
    expect(state.actionPoints).toBe(1);
    expect(state.factions.wei.gold).toBeLessThan(startGold);

    state = performRecruitTroops(state, 'wei', 'xuchang', true);
    expect(state.cities.xuchang.troops).toBeGreaterThan(startTroops);
    expect(state.actionPoints).toBe(0);

    const beforeFortify = state.cities.xuchang.defense;
    state = performFortifyCity(state, 'wei', 'xuchang', true);
    expect(state.cities.xuchang.defense).toBe(beforeFortify);
  });

  it('activates sworn hero bonds, triggers signature skills, and awards hero XP', () => {
    const bonds = getActiveBondsForHeroes(['guanyu', 'zhangfei']);
    expect(bonds.map((b) => b.id)).toContain('peach_garden');
    expect(bonds.map((b) => b.id)).toContain('five_tigers');

    let state = createNewGame('shu');
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
      'assault',
      'guanyu',
      true,
      () => 0.5,
      { useSignatureSkill: true }
    );

    expect(next.lastBattle?.captured).toBe(true);
    expect(next.lastBattle?.skillTriggered?.en).toBe('Green Dragon Crescent Slash');
    expect(next.cities.xiangyang.owner).toBe('shu');
    expect(next.generals.guanyu.cityId).toBe('xiangyang');
    expect(next.generals.guanyu.skillCooldown).toBe(2);
    expect(next.generals.guanyu.xp).toBeGreaterThan(0);
  });

  it('executes captured hero, permanently removing them and igniting Sworn Vendetta on bonded comrades', () => {
    let state = createNewGame('wei');
    // Simulate capturing Guan Yu
    state = {
      ...state,
      generals: {
        ...state.generals,
        guanyu: { ...state.generals.guanyu, status: 'captured', capturedBy: 'wei' },
      },
    };

    const afterExec = performPrisonerAction(state, 'guanyu', 'execute');
    expect(afterExec.generals.guanyu.status).toBe('executed');
    expect(afterExec.generals.liubei.vendettaAgainst).toContain('wei');
    expect(afterExec.generals.zhangfei.vendettaAgainst).toContain('wei');
    expect(afterExec.chrono.divergence).toBeGreaterThan(state.chrono.divergence);
  });

  it('enforces Hardcore Butterfly Effect: tech unlocks raise Divergence/Suspicion, rival copies tech in 2 turns, and >=60% shatters foresight & forms Coalition', () => {
    let state = createNewGame('shu');
    state = {
      ...state,
      factions: { ...state.factions, shu: { ...state.factions.shu, gold: 3000 } },
      chrono: { ...state.chrono, innovationPoints: 8 },
    };

    expect(canSeeHeroWeakness(state)).toBe(true);
    expect(getChronoInsightBonus(state)).toBe(0.18);

    // Research Stirrups -> schedules rival reverse-engineering
    state = performResearchTech(state, 'stirrups', 'zhugeliang');
    expect(state.chrono.unlockedTechs).toContain('stirrups');
    expect(state.chrono.pendingTechCopies.length).toBe(1);
    expect(state.chrono.divergence).toBe(15);

    // Advance 2 seasons -> rival should finish reverse-engineering Stirrups!
    state = advanceSeason(state);
    state = advanceSeason(state);
    expect(state.chrono.rivalTechs.wei).toContain('stirrups');

    // Push divergence >= 60% -> Shattered Timeline invalidates weakness foresight & triggers Coalition!
    state = {
      ...state,
      chrono: { ...state.chrono, divergence: 65, suspicion: 10 },
    };
    expect(canSeeHeroWeakness(state)).toBe(false);
    expect(getChronoInsightBonus(state)).toBe(0);

    state = advanceSeason(state);
    expect(state.chrono.coalitionActive).toBe(true);
    expect(getRelation(state, 'wei', 'wu').status).toBe('allied');

    // Unlocking Spyglass restores enemy flaw intel even at >= 60% divergence!
    state = performResearchTech(state, 'spyglass', 'zhugeliang');
    expect(canSeeHeroWeakness(state)).toBe(true);
    expect(getChronoInsightBonus(state)).toBe(0.12);
  });

  it('recruits wandering hero via encounter and resolves duel rounds cleanly', () => {
    let state = createNewGame('shu');
    const duelLog = resolveDuelRound(
      state.generals.guanyu,
      state.generals.zhangliao,
      1,
      'chrono_counter',
      'strike',
      0.18
    );
    expect(duelLog.playerDamage).toBeGreaterThan(duelLog.enemyDamage);

    state = applyHeroEncounterOutcome(
      state,
      'machao',
      'recruit',
      'join',
      0,
      5,
      7,
      0,
      { en: 'Ma Chao joined Shu!', zh: '马超归顺蜀汉！' }
    );
    expect(state.generals.machao.faction).toBe('shu');
    expect(state.generals.machao.status).toBe('active');
    expect(state.actionPoints).toBe(2);

    // Diplomacy truce tick verification
    state = applyDiplomacyOutcome(state, 'shu', 'wei', 25, 3, 250, false, {
      en: 'Truce signed.',
      zh: '缔结停战盟约。',
    });
    expect(getRelation(state, 'shu', 'wei').truceTurnsLeft).toBe(3);
    state = advanceSeason(state);
    expect(getRelation(state, 'shu', 'wei').truceTurnsLeft).toBe(2);
  });
});
