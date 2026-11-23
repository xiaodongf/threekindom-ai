import { describe, expect, it } from 'vitest';
import { applyTacticalBattleOutcome, createNewGame } from './engine.js';
import {
  calculateStratagemSuccess,
  createTacticalBattle,
  endTacticalSideTurn,
  executeArtOfWarStratagem,
  executeGunpowderBomb,
  extractTacticalBattleOutcome,
  generateCityTacticalGrid,
  getReachableTiles,
  previewAttack,
  resolveTacticalBattleByAI,
} from './tacticalEngine.js';

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
