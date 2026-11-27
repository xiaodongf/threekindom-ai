import { describe, expect, it } from 'vitest';
import { PROVINCES, VICTORY_CITY_TARGET, isWithinRiverStrike } from './data.js';
import { HERO_BONDS } from './heroes.js';
import {
  advanceSeason as advanceSeasonWith,
  applyDiplomacyOutcome,
  applyHeroEncounterOutcome,
  canSeeHeroWeakness,
  createNewGame,
  estimateBattlePreview,
  executeAITurnAction,
  getActiveBondsForHeroes,
  getChronoInsightBonus,
  getEligibleStagingCities,
  getFactionCities,
  getRelation,
  performAttackCity,
  performDevelopCity,
  performFortifyCity,
  performNightRaid,
  performPrisonerAction,
  performRecruitTroops,
  performRelocateHero,
  performResearchTech,
  performSabotageBombard,
  performSowDiscord,
  resolveDuelRound,
} from './engine.js';
import type { GameState } from './types.js';

/** A season in which no city event begins, so each test sees only what it sets up. */
const advanceSeason = (state: GameState) => advanceSeasonWith(state, () => 0.999);

describe('Three Kingdoms AI — Time-Traveler & Hero-Centric Engine', () => {
  it('initializes the 214 AD map with 32 cities, 55 heroes (9 wandering) and orders scaled to the realm', () => {
    const state = createNewGame('shu');
    expect(state.year).toBe(214);
    expect(state.season).toBe('spring');
    expect(state.playerFaction).toBe('shu');
    expect(state.playerProfile.portrait).toBe('/portraits/traveler_male.jpg');
    // Seven cities: the base three orders plus one for the first six cities.
    expect(state.actionPoints).toBe(4);
    expect(createNewGame('wei').actionPoints).toBe(5);
    expect(Object.keys(state.generals).length).toBe(55);
    expect(
      Object.values(state.generals).filter((g) => g.status === 'wandering').length
    ).toBe(9);
    expect(state.generals.lubu.war).toBe(100);
    expect(state.generals.zhouyu.faction).toBe('wu');
    expect(Object.keys(state.cities).length).toBe(32);
    expect(getFactionCities(state, 'wei').length).toBe(14);
    expect(getFactionCities(state, 'shu').length).toBe(7);
    expect(getFactionCities(state, 'wu').length).toBe(7);
    expect(getFactionCities(state, 'neutral').length).toBe(4);
  });

  it('lays out a connected map: every road runs both ways, every province has its seat, every hero a city', () => {
    const state = createNewGame('shu');
    const cities = Object.values(state.cities);
    for (const city of cities) {
      expect(city.neighbors.length).toBeGreaterThan(0);
      expect(new Set(city.neighbors).size).toBe(city.neighbors.length);
      for (const nid of city.neighbors) {
        expect(state.cities[nid]).toBeDefined();
        expect(state.cities[nid].neighbors).toContain(city.id);
      }
    }
    // Every city can be reached from Luoyang by road.
    const reached = new Set(['luoyang']);
    const queue = ['luoyang'];
    while (queue.length > 0) {
      for (const nid of state.cities[queue.shift()!].neighbors) {
        if (!reached.has(nid)) {
          reached.add(nid);
          queue.push(nid);
        }
      }
    }
    expect(reached.size).toBe(cities.length);

    for (const province of Object.values(PROVINCES)) {
      expect(state.cities[province.seatCityId]?.province).toBe(province.id);
    }
    expect(new Set(cities.map((c) => c.province)).size).toBe(Object.keys(PROVINCES).length);
    for (const hero of Object.values(state.generals)) {
      expect(state.cities[hero.cityId]).toBeDefined();
    }
    // No two cities stand closer than the map can draw them apart.
    for (const a of cities) {
      for (const b of cities) {
        if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(50);
      }
    }
    expect(VICTORY_CITY_TARGET).toBeLessThan(cities.length);
  });

  it('opens with a named commander in every city, and bonds that only name real heroes', () => {
    const state = createNewGame('wu');
    for (const city of Object.values(state.cities)) {
      const commanders = Object.values(state.generals).filter(
        (g) => g.cityId === city.id && g.faction === city.owner && g.status === 'active'
      );
      expect(commanders.length, `${city.id} has no commander`).toBeGreaterThan(0);
    }
    for (const bond of Object.values(HERO_BONDS)) {
      for (const id of bond.memberIds) {
        expect(state.generals[id], `${bond.id} names unknown hero ${id}`).toBeDefined();
        expect(state.generals[id].bondIds).toContain(bond.id);
      }
    }
    for (const hero of Object.values(state.generals)) {
      for (const bondId of hero.bondIds) expect(HERO_BONDS[bondId]).toBeDefined();
    }
    expect(new Set(Object.values(state.generals).map((g) => g.signatureSkill.id)).size).toBe(
      Object.keys(state.generals).length
    );
    expect(getActiveBondsForHeroes(['caoren', 'xiahouyuan']).map((b) => b.id)).toContain('cao_xiahou');
  });

  it('takes the lord of a free city prisoner or leaves him masterless when the city falls', () => {
    const base = createNewGame('shu');
    const strong: GameState = {
      ...base,
      cities: { ...base.cities, chengdu: { ...base.cities.chengdu, troops: 40000 } },
    };
    expect(strong.generals.menghuo.faction).toBe('neutral');
    expect(strong.generals.menghuo.status).toBe('active');

    const taken = performAttackCity(strong, 'shu', 'chengdu', 'jianning', 30000, 'fire', 'zhaoyun', true, () => 0.5);
    expect(taken.cities.jianning.owner).toBe('shu');
    expect(taken.generals.menghuo.status).toBe('captured');
    expect(taken.generals.menghuo.capturedBy).toBe('shu');

    const escaped = performAttackCity(strong, 'shu', 'chengdu', 'jianning', 30000, 'fire', 'zhaoyun', true, () => 0.7);
    expect(escaped.cities.jianning.owner).toBe('shu');
    expect(escaped.generals.menghuo.status).toBe('wandering');
    expect(escaped.generals.menghuo.cityId).toBe('jianning');
  });

  it('spends 1 AP for strategic hero relocation and domestic orders', () => {
    // Wei's fourteen cities give five orders; three are enough to show the ledger runs dry.
    let state: GameState = { ...createNewGame('wei'), actionPoints: 3 };
    const startGold = state.factions.wei.gold;
    const startTroops = state.cities.xuchang.troops;

    state = performRelocateHero(state, 'wei', 'xuchu', 'luoyang', true);
    expect(state.generals.xuchu.cityId).toBe('luoyang');
    expect(state.actionPoints).toBe(2);

    state = performDevelopCity(state, 'wei', 'xuchang', true);
    expect(state.cities.xuchang.farming).toBe(5);
    expect(state.cities.xuchang.trade).toBe(4);
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
    const startOrders = state.actionPoints;
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
    expect(state.actionPoints).toBe(startOrders - 1);

    // Diplomacy truce tick verification
    state = applyDiplomacyOutcome(state, 'shu', 'wei', 25, 3, 250, false, {
      en: 'Truce signed.',
      zh: '缔结停战盟约。',
    });
    expect(getRelation(state, 'shu', 'wei').truceTurnsLeft).toBe(3);
    state = advanceSeason(state);
    expect(getRelation(state, 'shu', 'wei').truceTurnsLeft).toBe(2);
  });

  it('executes Joint Pincer Assault, Night Raid, Gunpowder Bombard, Sow Discord defection, and Yangtze River Strike', () => {
    // 1. Joint Pincer Attack by Wei (Luoyang + Xuchang -> a Wan that has slipped out of its hands)
    let weiState = createNewGame('wei');
    weiState = {
      ...weiState,
      cities: {
        ...weiState.cities,
        wan: { ...weiState.cities.wan, owner: 'neutral', troops: 8500 },
      },
    };
    const soloPreview = estimateBattlePreview(
      weiState,
      'wei',
      'luoyang',
      'wan',
      8000,
      'assault',
      'simayi'
    );
    const pincerPreview = estimateBattlePreview(
      weiState,
      'wei',
      'luoyang',
      'wan',
      8000,
      'assault',
      'simayi',
      { pincerFromCityId: 'xuchang', pincerTroops: 6000 }
    );
    expect(pincerPreview.atkPower).toBeGreaterThan(soloPreview.atkPower);
    expect(pincerPreview.estimatedWinChance).toBeGreaterThanOrEqual(soloPreview.estimatedWinChance);

    const afterPincer = performAttackCity(
      weiState,
      'wei',
      'luoyang',
      'wan',
      8000,
      'assault',
      'simayi',
      true,
      () => 0.5,
      { pincerFromCityId: 'xuchang', pincerTroops: 6000 }
    );
    expect(afterPincer.cities.wan.owner).toBe('wei');
    expect(afterPincer.cities.xuchang.troops).toBeLessThan(weiState.cities.xuchang.troops);

    // 2. Night Raid (plunders gold/food and cuts enemy garrison)
    let shuState = createNewGame('shu');
    const preGold = shuState.factions.shu.gold;
    const preTargetTroops = shuState.cities.xiangyang.troops;
    const afterRaid = performNightRaid(shuState, 'shu', 'jiangling', 'xiangyang', 'guanyu', true, () => 0.5);
    expect(afterRaid.factions.shu.gold).toBeGreaterThan(preGold);
    expect(afterRaid.cities.xiangyang.troops).toBeLessThan(preTargetTroops);
    expect(afterRaid.lastOperation?.type).toBe('raid');

    // 3. Fire / Gunpowder Bombardment (destroys -2 walls with gunpowder!)
    let bombState: typeof shuState = {
      ...shuState,
      chrono: { ...shuState.chrono, unlockedTechs: ['gunpowder'] },
    };
    const afterBomb = performSabotageBombard(
      bombState,
      'shu',
      'hanzhong',
      'changan',
      'zhugeliang',
      true,
      () => 0.5
    );
    expect(afterBomb.cities.changan.defense).toBe(shuState.cities.changan.defense - 2);
    expect(afterBomb.lastOperation?.defenseReduced).toBe(2);

    // 4. Sow Discord (lowers loyalty and triggers defection below 45!)
    let discState = createNewGame('wei');
    discState = {
      ...discState,
      generals: {
        ...discState.generals,
        weiyan: { ...discState.generals.weiyan, loyalty: 50 },
      },
    };
    const afterDisc = performSowDiscord(discState, 'wei', 'hanzhong', 'simayi', true, () => 0.5);
    expect(afterDisc.lastOperation?.defectedHeroId).toBe('weiyan');
    expect(afterDisc.generals.weiyan.faction).toBe('wei');

    // 5. Yangtze River Strike: Wu sails from Chaisang past Jiangxia to strike Jiangling, two ports
    //    upriver and not joined to Chaisang by any road.
    let wuState = createNewGame('wu');
    wuState = {
      ...wuState,
      cities: {
        ...wuState.cities,
        chaisang: { ...wuState.cities.chaisang, troops: 26000 },
        jianye: { ...wuState.cities.jianye, troops: 26000 },
      },
    };
    expect(wuState.cities.chaisang.neighbors).not.toContain('jiangling');
    expect(getEligibleStagingCities(wuState, 'wu', 'jiangling', 'river').map((c) => c.id)).toEqual(
      expect.arrayContaining(['chaisang', 'jiangxia'])
    );
    const afterRiver = performAttackCity(
      wuState,
      'wu',
      'chaisang',
      'jiangling',
      22000,
      'fire',
      'zhouyu',
      true,
      () => 0.5,
      { isRiverStrike: true }
    );
    expect(afterRiver.lastBattle?.toCityId).toBe('jiangling');
    expect(afterRiver.recentMarches[0].type).toBe('river_strike');

    // A fleet reaches two ports along the river and no farther: Jianye cannot strike Jiangzhou.
    expect(isWithinRiverStrike('jianye', 'chaisang')).toBe(true);
    expect(isWithinRiverStrike('jianye', 'jiangzhou')).toBe(false);
    expect(isWithinRiverStrike('xiangyang', 'chaisang')).toBe(true);
    expect(isWithinRiverStrike('luoyang', 'jianye')).toBe(false);
    const tooFar = performAttackCity(
      wuState,
      'wu',
      'jianye',
      'jiangzhou',
      22000,
      'fire',
      'sunquan',
      true,
      () => 0.5,
      { isRiverStrike: true }
    );
    expect(tooFar).toBe(wuState);

    // 6. AI Rival Bombardment via executeAITurnAction
    const aiBomb = executeAITurnAction(shuState, 'wei', {
      type: 'bombard',
      cityId: 'changan',
      targetCityId: 'hanzhong',
    });
    expect(aiBomb.cities.hanzhong.defense).toBe(shuState.cities.hanzhong.defense - 1);
    expect(aiBomb.lastOperation?.friendlyTroopsLost).toBeGreaterThan(0);
    expect(aiBomb.cities.changan.troops).toBeLessThan(shuState.cities.changan.troops);
  });

  it('rebalances sabotage bombardment: requires >= 2500 staging troops, inflicts sally losses, and scales pre-gunpowder damage reasonably', () => {
    const state = createNewGame('shu');

    // Skeleton garrison (< 2500) cannot launch cross-border bombardment
    const thinWei: GameState = {
      ...state,
      cities: {
        ...state.cities,
        chencang: { ...state.cities.chencang, troops: 1800 },
      },
    };
    const blocked = performSabotageBombard(thinWei, 'wei', 'chencang', 'hanzhong', 'xiahouyuan', false, () => 0.5);
    expect(blocked).toBe(thinWei);

    // Chencang (7,500) bombarding fortified Hanzhong (11,500, Def Lv.4) without Gunpowder:
    // Hanzhong stays Shu-owned, takes moderate fire losses (< 1,100 rather than 2,100+), and inflicts sally losses on Wei.
    const preGunpowder = performSabotageBombard(state, 'wei', 'chencang', 'hanzhong', 'xiahouyuan', false, () => 0.5);
    expect(preGunpowder.cities.hanzhong.owner).toBe('shu');
    expect(preGunpowder.lastOperation?.enemyTroopsLost).toBeGreaterThan(350);
    expect(preGunpowder.lastOperation?.enemyTroopsLost).toBeLessThan(1100);
    expect(preGunpowder.lastOperation?.friendlyTroopsLost).toBeGreaterThan(150);
    expect(preGunpowder.cities.chencang.troops).toBe(
      state.cities.chencang.troops - preGunpowder.lastOperation!.friendlyTroopsLost
    );

    // With Gunpowder unlocked, bombardment deals heavier casualties and -2 wall levels with fewer attacker losses
    const withPowderState: GameState = {
      ...state,
      chrono: {
        ...state.chrono,
        rivalTechs: { ...state.chrono.rivalTechs, wei: ['gunpowder'] },
      },
    };
    const postGunpowder = performSabotageBombard(
      withPowderState,
      'wei',
      'chencang',
      'hanzhong',
      'xiahouyuan',
      false,
      () => 0.5
    );
    expect(postGunpowder.lastOperation!.defenseReduced).toBe(2);
    expect(postGunpowder.lastOperation!.enemyTroopsLost).toBeGreaterThan(
      preGunpowder.lastOperation!.enemyTroopsLost
    );
    expect(postGunpowder.lastOperation!.friendlyTroopsLost).toBeLessThan(
      preGunpowder.lastOperation!.friendlyTroopsLost
    );
  });
});
