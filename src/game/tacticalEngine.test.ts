import { describe, expect, it } from 'vitest';
import {
  applyTacticalBattleOutcome,
  buildAssaultConfig,
  createNewGame,
  estimateBattlePreview,
  performAttackCity,
} from './engine.js';
import {
  GATE_BASE_HP,
  GATE_HP_PER_DEFENSE,
  calculateStratagemSuccess,
  createTacticalBattle,
  endTacticalSideTurn,
  executeArtOfWarStratagem,
  executeGateAttack,
  executeGunpowderBomb,
  executeHeroSignatureSkill,
  executeTacticalAttack,
  extractTacticalBattleOutcome,
  generateCityTacticalGrid,
  getGateAttackTargets,
  getHeroSkillTargetCoords,
  getRampartDefBonus,
  getReachableTiles,
  moveTacticalUnit,
  previewAttack,
  resolveTacticalBattleByAI,
} from './tacticalEngine.js';
import type { TacticalBattleState, TacticalUnit } from './tacticalTypes.js';
import type { GameState } from './types.js';

/** Shu marches from Jiangling on neutral Xiangyang (river map, walls Lv.3). */
function xiangyangBattle(
  game: GameState = createNewGame('shu'),
  troops = 9000,
  overrides: Partial<Parameters<typeof createTacticalBattle>[1]> = {}
): TacticalBattleState {
  return createTacticalBattle(
    game,
    {
      id: 't-helper',
      fromCityId: 'jiangling',
      toCityId: 'xiangyang',
      attackerFaction: 'shu',
      defenderFaction: 'neutral',
      playerSide: 'attacker',
      primaryTroops: troops,
      tactic: 'assault',
      attackerGeneralId: 'guanyu',
      consumeAP: true,
      ...overrides,
    },
    () => 0.1
  );
}

function place(
  battle: TacticalBattleState,
  placements: Record<string, Partial<TacticalUnit>>
): TacticalBattleState {
  return {
    ...battle,
    units: battle.units.map((u) => (placements[u.id] ? { ...u, ...placements[u.id] } : u)),
  };
}

describe('8x8 Direct Tactical Grid Battle Engine — The Art of War Edition', () => {
  it('generates city-matched 8x8 maps with water/bridges/fords near rivers & lakes, forests, walls, gates, and citadel', () => {
    const riverMap = generateCityTacticalGrid('xiangyang', 'river', 3);
    expect(riverMap.hasWaterFeature).toBe(true);
    expect(riverMap.grid.length).toBe(8);
    expect(riverMap.grid[0].length).toBe(8);

    const flatRiver = riverMap.grid.flat();
    expect(flatRiver.some((t) => t.type === 'water')).toBe(true);
    expect(flatRiver.some((t) => t.type === 'bridge')).toBe(true);
    expect(flatRiver.some((t) => t.type === 'ford')).toBe(true);
    expect(flatRiver.some((t) => t.type === 'forest')).toBe(true);
    expect(flatRiver.some((t) => t.type === 'wall')).toBe(true);
    expect(flatRiver.some((t) => t.type === 'gate')).toBe(true);
    expect(flatRiver.some((t) => t.type === 'citadel')).toBe(true);

    // Non-river plains city (Xuchang) has forests & ramparts without deep river water
    const plainsMap = generateCityTacticalGrid('xuchang', 'plains', 3);
    expect(plainsMap.hasWaterFeature).toBe(false);
    expect(plainsMap.grid.flat().some((t) => t.type === 'water')).toBe(false);
    expect(plainsMap.grid.flat().some((t) => t.type === 'forest')).toBe(true);
  });

  it('blocks land units from water tiles while allowing Wu & Steamship-tech units to sail across water', () => {
    const base = createNewGame('shu');
    const landBattle = createTacticalBattle(
      base,
      {
        id: 't-water-1',
        fromCityId: 'jiangling',
        toCityId: 'xiangyang',
        attackerFaction: 'shu',
        defenderFaction: 'neutral',
        playerSide: 'attacker',
        primaryTroops: 9000,
        tactic: 'assault',
        attackerGeneralId: 'guanyu',
        consumeAP: true,
      },
      () => 0.1
    );

    const leadLand = landBattle.units.find((u) => u.id === 'atk-lead')!;
    // Place lead next to a water tile (row 3, col 2 adjacent to river at col 3)
    const waterRow = landBattle.grid.findIndex((row) => row[3].type === 'water');
    expect(waterRow).toBeGreaterThanOrEqual(0);
    const positionedLand = {
      ...landBattle,
      units: landBattle.units.map((u) =>
        u.id === leadLand.id ? { ...u, row: waterRow, col: 2, hasMoved: false } : u
      ),
    };
    const landMoves = getReachableTiles(
      positionedLand,
      positionedLand.units.find((u) => u.id === leadLand.id)!
    );
    expect(landMoves.some((p) => p.row === waterRow && p.col === 3)).toBe(false);

    // Unlock Steamship -> same unit can now enter water tiles!
    const steamGame = {
      ...base,
      chrono: { ...base.chrono, unlockedTechs: ['steamship' as const] },
    };
    const navalBattle = createTacticalBattle(
      steamGame,
      {
        id: 't-water-2',
        fromCityId: 'jiangling',
        toCityId: 'xiangyang',
        attackerFaction: 'shu',
        defenderFaction: 'neutral',
        playerSide: 'attacker',
        primaryTroops: 9000,
        tactic: 'fire',
        attackerGeneralId: 'guanyu',
        consumeAP: true,
      },
      () => 0.1
    );
    const positionedNaval = {
      ...navalBattle,
      units: navalBattle.units.map((u) =>
        u.id === 'atk-lead' ? { ...u, row: waterRow, col: 2, hasMoved: false } : u
      ),
    };
    const navalMoves = getReachableTiles(
      positionedNaval,
      positionedNaval.units.find((u) => u.id === 'atk-lead')!
    );
    expect(navalMoves.some((p) => p.row === waterRow && p.col === 3)).toBe(true);
  });

  it('determines Art of War stratagem success rate by General Intellect (INT) and triggers "Seen Through!" on failure', () => {
    const game = createNewGame('shu');
    const battle = createTacticalBattle(
      game,
      {
        id: 't-int',
        fromCityId: 'jiangling',
        toCityId: 'xiangyang',
        attackerFaction: 'shu',
        defenderFaction: 'wei',
        playerSide: 'attacker',
        primaryTroops: 10000,
        tactic: 'fire',
        attackerGeneralId: 'zhugeliang', // INT 100
        deputyGeneralId: 'zhangfei', // INT 56
        consumeAP: true,
      },
      () => 0.1
    );

    const enemy = battle.units.find((u) => u.side === 'defender')!;
    const positioned = {
      ...battle,
      units: battle.units.map((u) => {
        if (u.id === 'atk-lead') return { ...u, row: 3, col: 2, intellect: 100 };
        if (u.id === 'atk-deputy') return { ...u, row: 4, col: 2, intellect: 40 };
        if (u.id === enemy.id) return { ...u, row: 3, col: 4, intellect: 88, morale: 80 };
        return u;
      }),
    };

    const smartUnit = positioned.units.find((u) => u.id === 'atk-lead')!;
    const bruteUnit = positioned.units.find((u) => u.id === 'atk-deputy')!;

    const highOdds = calculateStratagemSuccess(positioned, smartUnit, 'feign_disorder', 3, 4);
    const lowOdds = calculateStratagemSuccess(positioned, bruteUnit, 'feign_disorder', 3, 4);
    expect(highOdds.chance).toBeGreaterThan(lowOdds.chance + 35);

    // Force a failed stratagem roll (rng = 0.99 -> 99 >= chance) -> triggers SEEN THROUGH! & enemy +5 Morale
    const afterFail = executeArtOfWarStratagem(
      positioned,
      bruteUnit.id,
      'feign_disorder',
      3,
      4,
      undefined,
      () => 0.99
    );
    expect(afterFail.lastCallout?.kind).toBe('seen_through');
    expect(afterFail.units.find((u) => u.id === enemy.id)!.morale).toBe(85);
    expect(afterFail.sp.attacker).toBe(positioned.sp.attacker - 1);
  });

  it('ignites Forest with Fire Attack, spreads Blazing Fire downwind, and triggers Art of War principles', () => {
    const game = createNewGame('shu');
    const steamGame = {
      ...game,
      chrono: { ...game.chrono, unlockedTechs: ['gunpowder' as const] },
    };
    let battle = createTacticalBattle(
      steamGame,
      {
        id: 't-fire',
        fromCityId: 'jiangling',
        toCityId: 'xiangyang',
        attackerFaction: 'shu',
        defenderFaction: 'wei',
        playerSide: 'attacker',
        primaryTroops: 11000,
        tactic: 'fire',
        attackerGeneralId: 'zhugeliang',
        consumeAP: true,
      },
      () => 0.1
    );

    // Set Eastbound wind ('E' -> dc = +1) and place two adjacent forest tiles at (0,3) & (0,4)
    const grid = battle.grid.map((row) => row.map((t) => ({ ...t })));
    grid[0][3].type = 'forest';
    grid[0][4].type = 'forest';
    grid[0][5].type = 'forest';
    grid[2][2].type = 'ford';

    const defUnit = battle.units.find((u) => u.side === 'defender')!;
    battle = {
      ...battle,
      wind: 'E',
      grid,
      units: battle.units.map((u) => {
        if (u.id === 'atk-lead') return { ...u, row: 0, col: 1 };
        if (u.id === defUnit.id) return { ...u, row: 0, col: 3, troops: 3000, morale: 25 };
        return u;
      }),
    };

    // 1. Cast Fire Attack on Forest (0,3) with guaranteed success (rng = 0.01)
    battle = executeArtOfWarStratagem(battle, 'atk-lead', 'fire_attack', 0, 3, undefined, () => 0.01);
    expect(battle.grid[0][3].fireTurns).toBe(3);
    // Upwind cast immediately spreads to adjacent downwind forest (0,4)!
    expect(battle.grid[0][4].fireTurns).toBe(3);

    // Advance attacker -> defender -> end round: fire spreads further downwind to (0,5)!
    battle = endTacticalSideTurn(battle, () => 0.1);
    battle = endTacticalSideTurn(battle, () => 0.1);
    expect(battle.grid[0][5].fireTurns).toBe(3);

    // 2. Test Sun Tzu "Strike Half-Crossed Water" bonus on Shallow Ford
    const fordBattle = {
      ...battle,
      units: battle.units.map((u) => {
        if (u.id === 'atk-lead') return { ...u, row: 2, col: 1, hasActed: false };
        if (u.id === defUnit.id) return { ...u, row: 2, col: 2, defeated: false, troops: 2000, isNavalCapable: false };
        return u;
      }),
    };
    const atkPrev = previewAttack(
      fordBattle,
      fordBattle.units.find((u) => u.id === 'atk-lead')!,
      fordBattle.units.find((u) => u.id === defUnit.id)!
    );
    expect(atkPrev.principles.some((p) => p.id === 'half_crossed')).toBe(true);

    // 3. Test "Subdue Without Fighting" surrenders low-morale enemy cleanly!
    const lowMoraleBattle = {
      ...fordBattle,
      sp: { attacker: 4, defender: 2 },
      units: fordBattle.units.map((u) =>
        u.id === defUnit.id ? { ...u, morale: 20, troops: 2000, defeated: false } : u
      ),
    };
    const afterSubdue = executeArtOfWarStratagem(
      lowMoraleBattle,
      'atk-lead',
      'subdue_chaos',
      2,
      2,
      undefined,
      () => 0.01
    );
    const surrenderedUnit = afterSubdue.units.find((u) => u.id === defUnit.id)!;
    expect(surrenderedUnit.defeated).toBe(true);
    expect(surrenderedUnit.surrendered).toBe(true);

    // 4. Test Black Powder Bomb shatters City Wall at (1,6) into walkable plains!
    const bombBattle = {
      ...battle,
      units: battle.units.map((u) =>
        u.id === 'atk-lead' ? { ...u, row: 1, col: 4, hasActed: false } : u
      ),
    };
    expect(bombBattle.grid[1][6].type).toBe('wall');
    const afterBomb = executeGunpowderBomb(bombBattle, 'atk-lead', 1, 6);
    expect(afterBomb.grid[1][6].type).toBe('plains');
    expect(afterBomb.gunpowderBombsLeft.attacker).toBe(1);
  });

  it('auto-resolves a complete 8x8 tactical battle via Tactical AI and commits exact results to campaign GameState', () => {
    let game = createNewGame('shu');
    game = {
      ...game,
      cities: {
        ...game.cities,
        jiangling: { ...game.cities.jiangling, troops: 22000 },
      },
    };

    const battle = createTacticalBattle(
      game,
      {
        id: 't-full-ai',
        fromCityId: 'jiangling',
        toCityId: 'xiangyang',
        attackerFaction: 'shu',
        defenderFaction: 'neutral',
        playerSide: 'attacker',
        primaryTroops: 18000,
        tactic: 'fire',
        attackerGeneralId: 'guanyu',
        consumeAP: true,
      },
      () => 0.25
    );

    const finished = resolveTacticalBattleByAI(battle, () => 0.25);
    expect(finished.winner).not.toBeNull();

    const outcome = extractTacticalBattleOutcome(finished);
    const synced = applyTacticalBattleOutcome(game, outcome, () => 0.25);

    expect(synced.actionPoints).toBe(game.actionPoints - 1);
    expect(synced.lastBattle).not.toBeNull();
    expect(synced.lastBattle?.toCityId).toBe('xiangyang');
    if (outcome.attackerWon) {
      expect(synced.cities.xiangyang.owner).toBe('shu');
    } else {
      expect(synced.cities.xiangyang.owner).toBe('neutral');
    }
  });
});

describe('8x8 Tactical Grid — balance rules that tie the grid to the campaign', () => {
  it('deploys exactly the troops committed and never returns more than marched out', () => {
    const game = createNewGame('shu');
    const battle = xiangyangBattle(game, 1000);
    const attackers = battle.units.filter((u) => u.side === 'attacker');
    const defenders = battle.units.filter((u) => u.side === 'defender');
    expect(attackers.reduce((sum, u) => sum + u.troops, 0)).toBe(1000);
    expect(defenders.reduce((sum, u) => sum + u.troops, 0)).toBe(game.cities.xiangyang.troops);
    expect(battle.attackerStartTroops).toBe(1000);

    // Even if the attackers somehow "healed" beyond what they brought, the campaign caps the survivors.
    const inflated: TacticalBattleState = {
      ...battle,
      winner: 'defender',
      units: battle.units.map((u) => (u.side === 'attacker' ? { ...u, troops: 5000 } : u)),
    };
    const after = applyTacticalBattleOutcome(game, extractTacticalBattleOutcome(inflated), () => 0.5);
    expect(after.cities.jiangling.troops).toBe(game.cities.jiangling.troops);
  });

  it('scales morale loss by the share of the squad that falls, not by the number of hits', () => {
    const base = xiangyangBattle(createNewGame('shu'), 9000);
    const striker = base.units.find((u) => u.id === 'def-0')!;
    const small = place(base, {
      'def-0': { row: 3, col: 3 },
      'atk-lead': { row: 3, col: 2, troops: 3000, maxTroops: 3000 },
    });
    const large = place(base, {
      'def-0': { row: 3, col: 3 },
      'atk-lead': { row: 3, col: 2, troops: 12000, maxTroops: 12000 },
    });
    const dropSmall = previewAttack(small, { ...striker, row: 3, col: 3 }, small.units.find((u) => u.id === 'atk-lead')!);
    const dropLarge = previewAttack(large, { ...striker, row: 3, col: 3 }, large.units.find((u) => u.id === 'atk-lead')!);
    // Same blow, same casualties: the 12,000-man squad barely notices, the 3,000-man squad is shaken.
    expect(dropLarge.estimatedDamage).toBe(dropSmall.estimatedDamage);
    expect(dropLarge.moraleDrop).toBeLessThan(dropSmall.moraleDrop / 3);
    expect(dropLarge.moraleDrop).toBeLessThan(10);
  });

  it('lets a broken squad rout with its survivors, but makes an encircled one surrender', () => {
    const base = xiangyangBattle(createNewGame('shu'), 9000);
    // A wavering defender squad out in the open, struck by one attacker: it routs and escapes.
    const routing = place(base, {
      'def-2': { row: 3, col: 4, morale: 4, troops: 6000, maxTroops: 6000 },
      'atk-lead': { row: 3, col: 3 },
      'atk-deputy': { row: 0, col: 0 },
      'atk-support': { row: 7, col: 0 },
    });
    const afterRout = executeTacticalAttack(routing, 'atk-lead', 'def-2');
    const routed = afterRout.units.find((u) => u.id === 'def-2')!;
    expect(routed.defeated).toBe(true);
    expect(routed.routed).toBe(true);
    expect(routed.surrendered).toBe(false);
    expect(routed.escapedTroops).toBeGreaterThan(0);
    const outcomeRout = extractTacticalBattleOutcome({ ...afterRout, winner: 'attacker' });
    expect(outcomeRout.defenderEscapedTroops).toBe(routed.escapedTroops);
    expect(outcomeRout.defenderRemainingTroops).toBeGreaterThanOrEqual(routed.escapedTroops);

    // The same squad hemmed in by three attackers has nowhere to run: it lays down arms.
    const encircled = place(base, {
      'def-2': { row: 3, col: 4, morale: 4, troops: 6000, maxTroops: 6000 },
      'atk-lead': { row: 3, col: 3 },
      'atk-deputy': { row: 2, col: 4 },
      'atk-support': { row: 4, col: 4 },
    });
    const afterSurrender = executeTacticalAttack(encircled, 'atk-lead', 'def-2');
    const surrendered = afterSurrender.units.find((u) => u.id === 'def-2')!;
    expect(surrendered.defeated).toBe(true);
    expect(surrendered.surrendered).toBe(true);
    expect(surrendered.escapedTroops).toBe(0);
  });

  it('keeps gates shut until battered down and only counts the flag after a breach', () => {
    const game = createNewGame('shu');
    let battle = xiangyangBattle(game, 9000);
    const gateHp = GATE_BASE_HP + game.cities.xiangyang.defense * GATE_HP_PER_DEFENSE;
    expect(battle.grid[3][6].gateHp).toBe(gateHp);
    expect(battle.breached).toBe(false);

    // Clear the gateway and stand an attacker in front of it: the gate is closed to him.
    battle = place(battle, {
      'def-0': { row: 1, col: 6 },
      'def-1': { row: 6, col: 6 },
      'def-2': { row: 0, col: 7 },
      'atk-lead': { row: 3, col: 5, hasMoved: false, hasActed: false },
    });
    const lead = () => battle.units.find((u) => u.id === 'atk-lead')!;
    expect(getReachableTiles(battle, lead()).some((p) => p.row === 3 && p.col === 6)).toBe(false);
    expect(getGateAttackTargets(battle, lead())).toContainEqual({ row: 3, col: 6 });

    // A runner who slips around the wall onto the flag does NOT take the city while the gates hold.
    const runner = moveTacticalUnit(
      place(battle, { 'atk-deputy': { row: 2, col: 7, hasMoved: false } }),
      'atk-deputy',
      3,
      7
    );
    expect(runner.grid[3][7].type).toBe('citadel');
    expect(runner.units.find((u) => u.id === 'atk-deputy')!.row).toBe(3);
    expect(runner.winner).toBeNull();

    // Batter the gate down blow by blow.
    let blows = 0;
    while (!battle.breached && blows < 12) {
      battle = executeGateAttack(battle, 'atk-lead', 3, 6);
      battle = place(battle, { 'atk-lead': { hasActed: false } });
      blows += 1;
    }
    expect(battle.breached).toBe(true);
    expect(blows).toBeGreaterThanOrEqual(2);
    expect(battle.grid[3][6].gateHp).toBe(0);
    expect(battle.lastCallout?.kind).toBe('breach');
    expect(getReachableTiles(battle, lead()).some((p) => p.row === 3 && p.col === 6)).toBe(true);

    // With the city open, stepping onto the flag wins the battle.
    const taken = moveTacticalUnit(
      place(battle, { 'atk-deputy': { row: 2, col: 7, hasMoved: false } }),
      'atk-deputy',
      3,
      7
    );
    expect(taken.winner).toBe('attacker');
  });

  it('makes city wall level matter: stronger gates and more protection for defenders on the works', () => {
    const game = createNewGame('shu');
    const withWalls = (level: number) =>
      xiangyangBattle({
        ...game,
        cities: { ...game.cities, xiangyang: { ...game.cities.xiangyang, defense: level } },
      });
    const low = withWalls(1);
    const high = withWalls(5);
    expect(high.grid[3][6].gateHp!).toBeGreaterThan(low.grid[3][6].gateHp!);
    expect(getRampartDefBonus(high)).toBeGreaterThan(getRampartDefBonus(low));

    const strike = (battle: TacticalBattleState) => {
      const b = place(battle, { 'atk-lead': { row: 3, col: 5 } });
      return previewAttack(b, b.units.find((u) => u.id === 'atk-lead')!, b.units.find((u) => u.id === 'def-0')!);
    };
    expect(strike(high).estimatedDamage).toBeLessThan(strike(low).estimatedDamage);
    // A blow on the squad holding the gateway also batters the gate itself.
    expect(strike(low).gateDamage).toBeGreaterThan(0);

    // The War Room plan reaches the grid: Siege Engines hit gates harder and blunt the walls.
    const siege = xiangyangBattle(game, 9000, { tactic: 'siege' });
    const assault = xiangyangBattle(game, 9000, { tactic: 'assault' });
    expect(strike(siege).gateDamage).toBeGreaterThan(strike(assault).gateDamage);
    expect(strike(assault).principles.some((p) => p.id === 'tactic_assault')).toBe(true);
    // A Fire Attack plan arrives with an extra Stratagem Point.
    expect(xiangyangBattle(game, 9000, { tactic: 'fire' }).sp.attacker).toBe(assault.sp.attacker + 1);
  });

  it('respects campaign skill cooldowns and puts every hero who used a skill on cooldown', () => {
    const game = createNewGame('shu');
    const cooling: GameState = {
      ...game,
      generals: { ...game.generals, guanyu: { ...game.generals.guanyu, skillCooldown: 2 } },
    };
    const locked = xiangyangBattle(cooling);
    const lockedLead = locked.units.find((u) => u.id === 'atk-lead')!;
    expect(lockedLead.skillLocked).toBe(true);
    expect(getHeroSkillTargetCoords(locked, lockedLead)).toEqual([]);
    const adjacent = place(locked, { 'atk-lead': { row: 3, col: 5 } });
    expect(executeHeroSignatureSkill(adjacent, 'atk-lead', 3, 6)).toBe(adjacent);

    // Wei assaults Jiangling; only the DEFENDER (Guan Yu) uses his signature skill.
    const weiGame = createNewGame('wei');
    const battle = createTacticalBattle(
      weiGame,
      buildAssaultConfig(weiGame, 'wei', 'xuchang', 'xiangyang', 9000, 'assault', undefined, true, {
        useSignatureSkill: true,
      })!,
      () => 0.1
    );
    const attackerHeroId = battle.units.find((u) => u.side === 'attacker' && u.heroId)!.heroId!;
    const finished: TacticalBattleState = {
      ...battle,
      winner: 'defender',
      // pretend a defending hero spent a skill by tagging a defender squad with a known hero
      units: battle.units.map((u) =>
        u.id === 'def-0' ? { ...u, heroId: 'guanyu', skillUsed: true } : u
      ),
    };
    const outcome = extractTacticalBattleOutcome(finished);
    expect(outcome.skillUsedHeroIds).toEqual(['guanyu']);
    // The report credits no attacking skill, and the attacking general is NOT put on cooldown.
    expect(outcome.skillTriggered).toBeUndefined();
    const after = applyTacticalBattleOutcome(weiGame, outcome, () => 0.5);
    expect(after.generals[attackerHeroId].skillCooldown).toBe(0);
    expect(after.generals.guanyu.skillCooldown).toBe(weiGame.generals.guanyu.signatureSkill.cooldownTurns);
    expect(after.lastBattle?.skillTriggered).toBeUndefined();
  });

  it('resolves auto-battles and the War Room forecast with the same grid engine', () => {
    const game = createNewGame('shu');
    const strong: GameState = {
      ...game,
      cities: { ...game.cities, jiangling: { ...game.cities.jiangling, troops: 40000 } },
    };

    // The forecast is deterministic for the same order and grows with the force committed.
    const few = estimateBattlePreview(strong, 'shu', 'jiangling', 'xiangyang', 3000, 'siege', 'guanyu');
    const fewAgain = estimateBattlePreview(strong, 'shu', 'jiangling', 'xiangyang', 3000, 'siege', 'guanyu');
    const many = estimateBattlePreview(strong, 'shu', 'jiangling', 'xiangyang', 30000, 'siege', 'guanyu');
    expect(fewAgain.estimatedWinChance).toBe(few.estimatedWinChance);
    expect(few.estimatedWinChance).toBeLessThan(30);
    expect(many.estimatedWinChance).toBeGreaterThan(90);
    expect(many.samples).toBeGreaterThan(0);
    expect(many.modifiers.some((m) => m.label.en.startsWith('City Walls'))).toBe(true);

    // The auto-battle agrees with what was forecast: a hopeless assault fails, an overwhelming one succeeds.
    let captures = 0;
    for (let i = 0; i < 10; i++) {
      const res = performAttackCity(strong, 'shu', 'jiangling', 'xiangyang', 30000, 'siege', 'guanyu');
      if (res.cities.xiangyang.owner === 'shu') captures += 1;
    }
    expect(captures).toBeGreaterThanOrEqual(9);
    let failures = 0;
    for (let i = 0; i < 10; i++) {
      const res = performAttackCity(strong, 'shu', 'jiangling', 'xiangyang', 3000, 'siege', 'guanyu');
      if (res.cities.xiangyang.owner === 'neutral') failures += 1;
      // Survivors of a failed assault come home; the staging city never gains troops from a defeat.
      expect(res.cities.jiangling.troops).toBeLessThanOrEqual(strong.cities.jiangling.troops);
    }
    expect(failures).toBeGreaterThanOrEqual(8);
  });

  it('lets the survivors of a fallen garrison withdraw to a friendly neighbouring city', () => {
    // Wu takes Jiangling from Shu: Shu still holds neighbouring Hanzhong and Chengdu.
    const game = createNewGame('wu');
    const config = buildAssaultConfig(game, 'wu', 'chaisang', 'jiangling', 9000, 'fire', undefined, true, {
      useSignatureSkill: true,
    })!;
    const battle = createTacticalBattle(game, config, () => 0.1);
    // The flag falls while most of the garrison is still standing.
    const finished: TacticalBattleState = { ...battle, winner: 'attacker', breached: true };
    const outcome = extractTacticalBattleOutcome(finished);
    expect(outcome.defenderRemainingTroops).toBe(game.cities.jiangling.troops);

    const after = applyTacticalBattleOutcome(game, outcome, () => 0.99);
    expect(after.cities.jiangling.owner).toBe('wu');
    const shuNeighbours = ['hanzhong', 'chengdu'];
    const gained = shuNeighbours.reduce(
      (sum, id) => sum + (after.cities[id].troops - game.cities[id].troops),
      0
    );
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThan(game.cities.jiangling.troops);
    expect(after.lastBattle?.narrative.en).toContain('withdrew to');
  });
});

