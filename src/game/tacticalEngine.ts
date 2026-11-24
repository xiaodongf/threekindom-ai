import { HERO_BONDS } from './heroes.js';
import { factionHasTech, getChronoInsightBonus, getCityGenerals } from './queries.js';
import type {
  ArtOfWarPrincipleTag,
  ArtOfWarStratagemDef,
  ArtOfWarStratagemId,
  AttackDamagePreview,
  GateAttackPreview,
  GridCoord,
  StratagemSuccessPreview,
  TacticalBattleConfig,
  TacticalBattleOutcome,
  TacticalBattleState,
  TacticalCallout,
  TacticalSide,
  TacticalTile,
  TacticalTileType,
  TacticalUnit,
  TacticalUnitClass,
  WffmStance,
  WindDirection,
} from './tacticalTypes.js';
import {
  TACTICAL_GRID_SIZE,
  TACTICAL_MAX_ROUNDS,
  TACTICAL_MAX_SP,
} from './tacticalTypes.js';
import type {
  DuelResult,
  FactionId,
  GameState,
  General,
  HeroBond,
  LocalizedText,
} from './types.js';

/** Gate hit points: a Lv.3 wall takes about three solid blows to break; each Fortify level adds more. */
export const GATE_BASE_HP = 1500;
export const GATE_HP_PER_DEFENSE = 600;
/** Share of a blow that also batters the gate when its target is standing in the gateway. */
export const GATE_SPLASH_SHARE = 0.5;
/**
 * Morale lost per 100% of a squad's full strength killed in a single blow. Morale loss follows the
 * share of the squad that falls, not the number of hits, so a large army is not broken by pinpricks:
 * a fresh squad (morale 84) breaks once it has lost roughly 70% of its men.
 */
export const MORALE_LOSS_PER_FULL_STRENGTH = 120;
/**
 * Fire Attack casualties on the tile set alight / the tile the wind carries it to, before the
 * caster's Intellect, squad size, wind and forest multipliers. Kept below a direct blow (920)
 * because it ignores cover, draws no counter-attack and reaches three tiles.
 */
export const FIRE_ATTACK_DAMAGE = 700;
export const FIRE_SPREAD_DAMAGE = 380;
/**
 * Standing in Blazing Fire burns this share of a squad each round, up to a cap - a blaze is only
 * so wide, so it must not melt a 12,000-man squad four times faster than a 3,000-man one.
 */
export const BURN_SHARE = 0.14;
export const BURN_CAP = 600;
/**
 * Enemy squads that must stand next to a squad for it to count as encircled - the same three
 * (the striker plus two more) that earn the "Encircled!" attack bonus. An encircled squad whose
 * morale breaks cannot run and surrenders; with fewer around it, it routs and its survivors escape.
 */
export const ENCIRCLEMENT_SQUADS = 3;
/** Squads on opposite sides of a sworn bond must fight within this many tiles to feel it. */
export const BOND_RANGE = 2;

/** Cities fought over across water even where their own ground is not river terrain. */
export const WATER_ADJACENT_CITY_IDS = new Set([
  'xiangyang',
  'jiangling',
  'chaisang',
  'jianye',
  'kuaiji',
  'hefei',
  'changsha',
  'luoyang',
  // Yangtze ports and river crossings added with the 32-city map
  'jiangzhou',
  'yongan',
  'jiangxia',
  'lujiang',
  'wu',
  'xiapi',
  'puyang',
  'tongguan',
]);

export const WIND_DELTA: Record<WindDirection, { dr: number; dc: number; label: LocalizedText }> = {
  N: { dr: -1, dc: 0, label: { en: 'North Wind (↓ South)', zh: '北风（向南吹）' } },
  S: { dr: 1, dc: 0, label: { en: 'South Wind (↑ North)', zh: '南风（向北吹）' } },
  E: { dr: 0, dc: 1, label: { en: 'West Wind (→ East)', zh: '西风（向东吹）' } },
  W: { dr: 0, dc: -1, label: { en: 'East Wind (← West)', zh: '东风（向西吹）' } },
};

export const ART_OF_WAR_STRATAGEMS: Record<ArtOfWarStratagemId, ArtOfWarStratagemDef> = {
  fire_attack: {
    id: 'fire_attack',
    name: { en: 'Fire Attack', zh: '火攻 · 借风纵火' },
    chapter: { en: 'Ch. 12: Attack by Fire', zh: '《孙子兵法·火攻篇》' },
    quote: {
      en: '“Wait for the proper season and wind; strike with fire and the enemy will crumble.”',
      zh: '「发火有时，起火有日；借风纵火，敌营自溃！」',
    },
    desc: {
      en: 'Ignite Forest, Bridge, Water, or an enemy squad (range 3). Blazing Fire spreads downwind every turn!',
      zh: '点燃3格内密林、浮桥、江面或敌军，造成火焰杀伤并随风蔓延3回合！',
    },
    spCost: 1,
    baseChance: 68,
    range: 3,
    targetsEnemy: false,
    targetsTile: true,
  },
  feign_disorder: {
    id: 'feign_disorder',
    name: { en: 'Feign Disorder (Lure)', zh: '佯败诱敌' },
    chapter: { en: 'Ch. 1: Laying Plans', zh: '《孙子兵法·计篇》' },
    quote: {
      en: '“All warfare is based on deception. Hold out baits to entice the enemy.”',
      zh: '「兵者，诡道也！利而诱之，乱而取之！」',
    },
    desc: {
      en: 'Entice an enemy within range 3 to move 1–2 tiles toward you (into Fords, Fire, or Ambush!) & -15% DEF.',
      zh: '引诱3格内敌军向我方移动1-2格（诱入浅滩、火海或伏击圈），且防御-15%！',
    },
    spCost: 1,
    baseChance: 65,
    range: 3,
    targetsEnemy: true,
    targetsTile: false,
  },
  empty_fort_ambush: {
    id: 'empty_fort_ambush',
    name: { en: 'Empty Fort / Ambush', zh: '虚实设伏 · 空城计' },
    chapter: { en: 'Ch. 6: Weak & Strong', zh: '《孙子兵法·虚实篇》' },
    quote: {
      en: '“Attack where he is unprepared; appear where you are not expected.”',
      zh: '「攻其无备，出其不意；虚虚实实，敌不敢进！」',
    },
    desc: {
      en: 'On Gate/Citadel: Empty Fort intimidates nearby foes (-25% ATK, -1 Move). Elsewhere: Conceals unit for +35% Ambush strike!',
      zh: '在城门/本阵发动【空城计】震慑周围敌军（攻-25%、移动-1）；在林地/高地则【埋伏】触发+35%奇袭！',
    },
    spCost: 1,
    baseChance: 66,
    range: 0,
    targetsEnemy: false,
    targetsTile: false,
  },
  wffm: {
    id: 'wffm',
    name: { en: 'Wind·Forest·Fire·Mtn', zh: '风林火山' },
    chapter: { en: 'Ch. 7: Maneuvering', zh: '《孙子兵法·军争篇》' },
    quote: {
      en: '“Swift as the Wind, quiet as the Forest, fierce as Fire, immovable as the Mountain.”',
      zh: '「其疾如风，其徐如林，侵掠如火，不动如山！」',
    },
    desc: {
      en: 'Adopt 1 of 4 Sun Tzu stances for 2 turns: Wind (+2 Move), Forest (Stealth +25% DEF), Fire (+30% ATK & burn), or Mountain (+40% DEF).',
      zh: '择一军争之势持续2回合：风(+2移速)、林(潜行+25%防)、火(+30%攻并引燃)、山(+40%防且免疫诱敌)。',
    },
    spCost: 1,
    baseChance: 74,
    range: 0,
    targetsEnemy: false,
    targetsTile: false,
  },
  death_ground: {
    id: 'death_ground',
    name: { en: 'Death Ground', zh: '置之死地而后生' },
    chapter: { en: 'Ch. 11: Nine Situations', zh: '《孙子兵法·九地篇》' },
    quote: {
      en: '“Cast troops into death ground and they will survive; plunge them into peril and they will prevail!”',
      zh: '「投之亡地然后存，陷之死地然后生！」',
    },
    desc: {
      en: 'Usable at ≤60% troops or backed against Water/Wall: restores Morale to 100, +40% ATK & unbreakable for 2 turns.',
      zh: '兵力≤60%或背水/靠墙时可发动：士气瞬间回满至100，2回合攻击+40%且绝不溃退！',
    },
    spCost: 2,
    baseChance: 72,
    range: 0,
    targetsEnemy: false,
    targetsTile: false,
  },
  subdue_chaos: {
    id: 'subdue_chaos',
    name: { en: 'Subdue / Sow Chaos', zh: '上兵伐谋 · 乱阵' },
    chapter: { en: 'Ch. 3: Stratagem', zh: '《孙子兵法·谋攻篇》' },
    quote: {
      en: '“Supreme excellence consists of breaking the enemy’s resistance without fighting.”',
      zh: '「上兵伐谋，不战而屈人之兵，善之善者也！」',
    },
    desc: {
      en: 'Range 3 psychological strike (INT vs INT): Disorders enemy (-20% DEF, -25~35 Morale). Surrenders immediately if Morale hits 0!',
      zh: '3格心理攻势（智力对决）：令敌混乱（防-20%、士气-25~35），士气归零立即不战而降！',
    },
    spCost: 2,
    baseChance: 58,
    range: 3,
    targetsEnemy: true,
    targetsTile: false,
  },
};

export const WFFM_STANCES: Record<
  WffmStance,
  { id: WffmStance; name: LocalizedText; short: LocalizedText; desc: LocalizedText }
> = {
  wind: {
    id: 'wind',
    name: { en: 'Swift as Wind', zh: '其疾如风' },
    short: { en: 'Wind', zh: '风' },
    desc: { en: '+2 Movement range for 2 turns', zh: '2回合移动力 +2' },
  },
  forest: {
    id: 'forest',
    name: { en: 'Quiet as Forest', zh: '其徐如林' },
    short: { en: 'Forest', zh: '林' },
    desc: { en: 'Hidden Ambush + 25% DEF for 2 turns', zh: '潜行埋伏且防御 +25%' },
  },
  fire: {
    id: 'fire',
    name: { en: 'Fierce as Fire', zh: '侵掠如火' },
    short: { en: 'Fire', zh: '火' },
    desc: { en: '+30% ATK & attacks ignite Forests', zh: '攻击 +30% 且攻击可引燃森林' },
  },
  mountain: {
    id: 'mountain',
    name: { en: 'Immovable Mountain', zh: '不动如山' },
    short: { en: 'Mountain', zh: '山' },
    desc: { en: '+40% DEF & immune to Flank/Lure', zh: '防御 +40% 且免疫夹击与诱敌' },
  },
};

let tacCounter = 1;
function nextTacId(prefix: string): string {
  tacCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${tacCounter}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function manhattan(r1: number, c1: number, r2: number, c2: number): number {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2);
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < TACTICAL_GRID_SIZE && col >= 0 && col < TACTICAL_GRID_SIZE;
}

function getUnitAt(state: TacticalBattleState, row: number, col: number): TacticalUnit | undefined {
  return state.units.find((u) => !u.defeated && u.row === row && u.col === col);
}

function sideHasTech(
  state: TacticalBattleState,
  side: TacticalSide,
  tech: 'gunpowder' | 'stirrups' | 'steamship' | 'balloon' | 'spyglass' | 'medicine'
): boolean {
  if (side === 'attacker') {
    if (tech === 'gunpowder') return state.attackerHasGunpowder;
    if (tech === 'stirrups') return state.attackerHasStirrups;
    if (tech === 'steamship') return state.attackerHasSteamship;
    if (tech === 'balloon') return state.attackerHasBalloon;
    if (tech === 'spyglass') return state.attackerHasSpyglass;
    return state.attackerHasMedicine;
  }
  if (tech === 'gunpowder') return state.defenderHasGunpowder;
  if (tech === 'stirrups') return state.defenderHasStirrups;
  if (tech === 'steamship') return state.defenderHasSteamship;
  if (tech === 'balloon') return state.defenderHasBalloon;
  if (tech === 'spyglass') return state.defenderHasSpyglass;
  return state.defenderHasMedicine;
}

function appendLog(
  state: TacticalBattleState,
  side: TacticalSide | 'system',
  text: LocalizedText
): TacticalBattleState['logs'] {
  return [{ id: nextTacId('tlog'), round: state.round, side, text }, ...state.logs].slice(0, 30);
}

// ==================== 8x8 MAP GENERATOR ====================

export function generateCityTacticalGrid(
  cityId: string,
  terrain: 'plains' | 'mountain' | 'river' | 'fortress',
  cityDefense: number,
  isRiverStrike = false
): { grid: TacticalTile[][]; hasWaterFeature: boolean } {
  const hasWaterFeature =
    terrain === 'river' || WATER_ADJACENT_CITY_IDS.has(cityId) || isRiverStrike;

  const grid: TacticalTile[][] = [];
  for (let r = 0; r < TACTICAL_GRID_SIZE; r++) {
    const row: TacticalTile[] = [];
    for (let c = 0; c < TACTICAL_GRID_SIZE; c++) {
      row.push({ row: r, col: c, type: 'plains', fireTurns: 0 });
    }
    grid.push(row);
  }

  const setT = (r: number, c: number, type: TacticalTileType) => {
    if (!inBounds(r, c)) return;
    grid[r][c] = {
      row: r,
      col: c,
      type,
      fireTurns: 0,
      gateHp: type === 'gate' ? GATE_BASE_HP + cityDefense * GATE_HP_PER_DEFENSE : undefined,
      gateMaxHp: type === 'gate' ? GATE_BASE_HP + cityDefense * GATE_HP_PER_DEFENSE : undefined,
    };
  };

  if (hasWaterFeature) {
    // Winding river/lake channel running vertically down columns 2-4 with 2 bridges & 2 shallow fords
    const riverCols =
      cityId === 'chaisang' || cityId === 'jianye' || cityId === 'jiangxia' || isRiverStrike
        ? [
            [2, 3],
            [2, 3],
            [3],
            [3],
            [3],
            [3, 4],
            [3, 4],
            [4],
          ]
        : [[3], [3], [3], [3], [4], [4], [3], [3]];

    for (let r = 0; r < 8; r++) {
      for (const c of riverCols[r]) {
        setT(r, c, 'water');
      }
    }
    // Guaranteed river crossings: Bridges & Shallow Fords ("Half-Crossed Water" traps!)
    setT(2, riverCols[2][0], 'bridge');
    setT(5, riverCols[5][0], 'bridge');
    if (riverCols[5][1] !== undefined) setT(5, riverCols[5][1], 'bridge');
    setT(1, riverCols[1][riverCols[1].length - 1], 'ford');
    if (riverCols[1].length > 1) setT(1, riverCols[1][0], 'ford');
    setT(6, riverCols[6][0], 'ford');
    if (riverCols[6][1] !== undefined) setT(6, riverCols[6][1], 'ford');

    // Dense flammable lakeside forests for Red Cliffs / Xiangyang fire traps!
    const forests: Array<[number, number]> = [
      [0, 1], [1, 1], [1, 2],
      [6, 1], [6, 2], [7, 2],
      [0, 4], [1, 4], [1, 5],
      [6, 5], [7, 4], [7, 5],
      [3, 5], [4, 5],
    ];
    for (const [fr, fc] of forests) {
      if (grid[fr][fc].type === 'plains') setT(fr, fc, 'forest');
    }

    // Strategic riverside hill overlooks
    setT(2, 5, 'hill');
    setT(4, 2, 'hill');
  } else if (terrain === 'mountain') {
    // Mountain Pass (Hanzhong / Chengdu): high ground ridges & dense forest ambush canyons
    const hills: Array<[number, number]> = [
      [0, 2], [1, 2], [1, 3], [2, 4],
      [5, 3], [6, 3], [6, 4], [7, 4],
      [2, 5], [5, 5],
    ];
    for (const [hr, hc] of hills) setT(hr, hc, 'hill');

    const forests: Array<[number, number]> = [
      [0, 3], [0, 4], [1, 4],
      [2, 2], [3, 2], [4, 2], [4, 3], [3, 4],
      [5, 2], [6, 2], [7, 2], [7, 3],
      [6, 5], [1, 5],
    ];
    for (const [fr, fc] of forests) {
      if (grid[fr][fc].type === 'plains') setT(fr, fc, 'forest');
    }
  } else if (terrain === 'fortress') {
    // Fortified Imperial Citadel (Luoyang / Chang'an / Hefei fallback): outer ridge + woods + fortress
    const hills: Array<[number, number]> = [
      [1, 3], [2, 3], [5, 3], [6, 3], [3, 5],
    ];
    for (const [hr, hc] of hills) setT(hr, hc, 'hill');

    const forests: Array<[number, number]> = [
      [0, 2], [0, 3], [0, 4],
      [2, 4], [3, 3], [4, 3], [4, 4],
      [6, 4], [7, 2], [7, 3], [7, 4],
    ];
    for (const [fr, fc] of forests) {
      if (grid[fr][fc].type === 'plains') setT(fr, fc, 'forest');
    }
  } else {
    // North/Central Plains (Ye / Xuchang): open cavalry corridors flanked by flammable forest groves!
    const forests: Array<[number, number]> = [
      [0, 2], [0, 3], [1, 2], [1, 3], [1, 4],
      [3, 3], [4, 4],
      [6, 2], [6, 3], [6, 4], [7, 2], [7, 3],
      [2, 5], [5, 5],
    ];
    for (const [fr, fc] of forests) setT(fr, fc, 'forest');
    setT(2, 2, 'hill');
    setT(5, 4, 'hill');
  }

  // Defender City Ramparts (Column 6) & Citadel Command Flag (Row 3, Col 7)
  // Rows 1,2,5,6 are fortress walls (impassable to attackers until blown open by Black Powder);
  // Rows 3,4 are City Gates: closed to attackers until battered down (HP scales with the city's wall level).
  // Rows 0 & 7 remain flank routes into the city, but the Citadel Flag only counts once a gate or wall is breached.
  setT(1, 6, 'wall');
  setT(2, 6, 'wall');
  setT(3, 6, 'gate');
  setT(4, 6, 'gate');
  setT(5, 6, 'wall');
  setT(6, 6, 'wall');
  setT(3, 7, 'citadel');
  setT(4, 7, 'plains');

  // Ensure attacker & defender spawns are clear of impassable walls
  if (grid[3][1].type === 'water') setT(3, 1, 'ford');
  if (grid[4][1].type === 'water') setT(4, 1, 'ford');

  return { grid, hasWaterFeature };
}

// ==================== UNIT CREATION & INITIALIZATION ====================

function heroToUnitClass(
  hero: General | undefined,
  fallbackIndex: number,
  isNaval: boolean
): TacticalUnitClass {
  if (isNaval) return 'naval';
  if (hero) {
    if (hero.archetype === 'vanguard') return 'cavalry';
    if (hero.archetype === 'strategist' || hero.archetype === 'statesman') return 'archer';
    return 'infantry';
  }
  return fallbackIndex === 0 ? 'infantry' : fallbackIndex === 1 ? 'cavalry' : 'archer';
}

function buildSquadUnit(params: {
  id: string;
  side: TacticalSide;
  faction: FactionId;
  hero?: General;
  fallbackName: LocalizedText;
  fallbackIndex: number;
  row: number;
  col: number;
  troops: number;
  hasStirrups: boolean;
  isNavalCapable: boolean;
  forceNavalClass?: boolean;
  isFlankSquad?: boolean;
  initialMorale?: number;
  skillLocked?: boolean;
  stealthyMarch?: boolean;
}): TacticalUnit {
  const unitClass = heroToUnitClass(
    params.hero,
    params.fallbackIndex,
    Boolean(params.forceNavalClass)
  );
  const baseMove =
    unitClass === 'cavalry'
      ? params.hasStirrups
        ? 4
        : 3
      : unitClass === 'naval'
        ? 3
        : 2;
  const attackRange = unitClass === 'archer' ? 2 : 1;

  return {
    id: params.id,
    side: params.side,
    faction: params.faction,
    heroId: params.hero?.id,
    name: params.hero ? params.hero.name : params.fallbackName,
    title: params.hero
      ? params.hero.title
      : { en: 'Field Captain', zh: '偏将都尉' },
    portrait: params.hero?.portrait,
    unitClass,
    isNavalCapable: params.isNavalCapable,
    row: params.row,
    col: params.col,
    // Exactly the men committed: no minimum, so a token force is not padded with phantom soldiers.
    troops: Math.max(1, Math.round(params.troops)),
    maxTroops: Math.max(1, Math.round(params.troops)),
    morale: clamp(params.initialMorale ?? 82, 20, 100),
    war: params.hero?.war ?? 68,
    intellect: params.hero?.intellect ?? 64,
    command: params.hero?.command ?? 70,
    specialty: params.hero?.specialty ?? 'assault',
    moveRange: baseMove,
    attackRange,
    hasMoved: false,
    hasActed: false,
    skillUsed: false,
    skillLocked: Boolean(params.skillLocked) || Boolean(params.hero && params.hero.skillCooldown > 0),
    isHiddenAmbush: false,
    disorderedTurns: 0,
    intimidatedTurns: 0,
    luredDefDebuffTurns: 0,
    fortifiedTurns: 0,
    deathGroundTurns: 0,
    wffmTurns: 0,
    isFlankSquad: params.isFlankSquad,
    stealthyMarch: Boolean(params.stealthyMarch),
    defeated: false,
    escapedTroops: 0,
  };
}

/** Split a force into squads by weight so the squads add up to exactly the troops committed. */
function splitTroops(total: number, weights: number[]): number[] {
  const whole = Math.max(weights.length, Math.round(total));
  const parts = weights.map((w) => Math.max(1, Math.floor(whole * w)));
  parts[0] += whole - parts.reduce((sum, n) => sum + n, 0);
  return parts;
}

export function createTacticalBattle(
  gameState: GameState,
  config: TacticalBattleConfig,
  rng: () => number = Math.random
): TacticalBattleState {
  const targetCity = gameState.cities[config.toCityId];
  const { grid, hasWaterFeature } = generateCityTacticalGrid(
    config.toCityId,
    targetCity?.terrain ?? 'plains',
    targetCity?.defense ?? 3,
    Boolean(config.isRiverStrike)
  );

  const atkGunpowder = factionHasTech(gameState, config.attackerFaction, 'gunpowder');
  const atkStirrups = factionHasTech(gameState, config.attackerFaction, 'stirrups');
  const atkSteamship = factionHasTech(gameState, config.attackerFaction, 'steamship');
  const atkBalloon = factionHasTech(gameState, config.attackerFaction, 'balloon');
  const atkSpyglass = factionHasTech(gameState, config.attackerFaction, 'spyglass');
  const atkMedicine = factionHasTech(gameState, config.attackerFaction, 'medicine');

  const defFaction = config.defenderFaction;
  const defGunpowder = factionHasTech(gameState, defFaction, 'gunpowder');
  const defStirrups = factionHasTech(gameState, defFaction, 'stirrups');
  const defSteamship = factionHasTech(gameState, defFaction, 'steamship');
  const defBalloon = factionHasTech(gameState, defFaction, 'balloon');
  const defSpyglass = factionHasTech(gameState, defFaction, 'spyglass');
  const defMedicine = factionHasTech(gameState, defFaction, 'medicine');

  const atkNavalCapable =
    config.attackerFaction === 'wu' || atkSteamship || Boolean(config.isRiverStrike);
  const defNavalCapable = defFaction === 'wu' || defSteamship;

  // Resolve Attacker Heroes (lead, deputy, plus optional extra general from staging city)
  const stagingHeroes = getCityGenerals(gameState, config.fromCityId);
  const leadAtkHero =
    (config.attackerGeneralId ? gameState.generals[config.attackerGeneralId] : undefined) ||
    stagingHeroes[0];
  const deputyAtkHero =
    (config.deputyGeneralId && config.deputyGeneralId !== leadAtkHero?.id
      ? gameState.generals[config.deputyGeneralId]
      : undefined) ||
    stagingHeroes.find((g) => g.id !== leadAtkHero?.id);
  const thirdAtkHero = stagingHeroes.find(
    (g) => g.id !== leadAtkHero?.id && g.id !== deputyAtkHero?.id
  );

  // A pincer column needs at least 1,000 men to count (same threshold the campaign layer deducts by).
  const pincerTroops =
    config.pincerFromCityId && config.pincerTroops && config.pincerTroops >= 1000
      ? Math.round(config.pincerTroops)
      : 0;
  const totalDefTroops = Math.max(1, Math.round(targetCity?.troops ?? 6000));
  const [leadTroops, deputyTroops, supportTroops] = splitTroops(
    config.primaryTroops,
    pincerTroops > 0 ? [0.48, 0.28, 0.24] : [0.45, 0.3, 0.25]
  );
  // The lead general's signature skill sits out if held in reserve or already spent in the pre-battle duel.
  const leadSkillLocked =
    Boolean(config.holdLeadSkill) ||
    Boolean(
      config.initialDuelResult?.skillUsed &&
        config.initialDuelResult.attackerHeroId === leadAtkHero?.id
    );

  const duelMoraleAtk =
    config.initialDuelResult?.winner === 'attacker'
      ? 96
      : config.initialDuelResult?.winner === 'defender'
        ? 68
        : 84;
  const duelMoraleDef =
    config.initialDuelResult?.winner === 'defender'
      ? 96
      : config.initialDuelResult?.winner === 'attacker'
        ? 66
        : 84;

  const units: TacticalUnit[] = [];

  // Attacker Squads (3 primary + optional 4th Joint Pincer Flank Squad!)
  const atkSpawns: Array<[number, number]> = [
    [3, 1],
    [2, 0],
    [5, 0],
  ];

  units.push(
    buildSquadUnit({
      id: 'atk-lead',
      side: 'attacker',
      faction: config.attackerFaction,
      stealthyMarch: config.tactic === 'ambush',
      hero: leadAtkHero,
      fallbackName: { en: 'Vanguard Commander', zh: '先锋主将' },
      fallbackIndex: 0,
      row: atkSpawns[0][0],
      col: atkSpawns[0][1],
      troops: leadTroops,
      hasStirrups: atkStirrups,
      isNavalCapable: atkNavalCapable,
      forceNavalClass: Boolean(config.isRiverStrike),
      initialMorale: duelMoraleAtk,
      skillLocked: leadSkillLocked,
    }),
    buildSquadUnit({
      id: 'atk-deputy',
      side: 'attacker',
      faction: config.attackerFaction,
      stealthyMarch: config.tactic === 'ambush',
      hero: deputyAtkHero,
      fallbackName: { en: 'Left Wing Cavalry', zh: '左翼骑军' },
      fallbackIndex: 1,
      row: atkSpawns[1][0],
      col: atkSpawns[1][1],
      troops: deputyTroops,
      hasStirrups: atkStirrups,
      isNavalCapable: atkNavalCapable,
      forceNavalClass: Boolean(config.isRiverStrike),
      initialMorale: duelMoraleAtk,
    }),
    buildSquadUnit({
      id: 'atk-support',
      side: 'attacker',
      faction: config.attackerFaction,
      stealthyMarch: config.tactic === 'ambush',
      hero: thirdAtkHero,
      fallbackName: { en: 'Strategist Archers', zh: '中军弓弩营' },
      fallbackIndex: 2,
      row: atkSpawns[2][0],
      col: atkSpawns[2][1],
      troops: supportTroops,
      hasStirrups: atkStirrups,
      isNavalCapable: atkNavalCapable,
      initialMorale: duelMoraleAtk,
    })
  );

  // 4th Joint Pincer Flank Squad spawning on the northern flank (row 0, col 1 or 4)
  if (pincerTroops > 0 && config.pincerFromCityId) {
    const pincerHero = getCityGenerals(gameState, config.pincerFromCityId).find(
      (g) => g.id !== leadAtkHero?.id && g.id !== deputyAtkHero?.id && g.id !== thirdAtkHero?.id
    );
    const flankCol = grid[0][4].type !== 'water' && grid[0][4].type !== 'wall' ? 4 : 1;
    units.push(
      buildSquadUnit({
        id: 'atk-pincer',
        side: 'attacker',
        faction: config.attackerFaction,
        stealthyMarch: config.tactic === 'ambush',
        hero: pincerHero,
        fallbackName: { en: 'Pincer Flank Corps', zh: '合围奇兵' },
        fallbackIndex: 1,
        row: 0,
        col: flankCol,
        troops: pincerTroops,
        hasStirrups: atkStirrups,
        isNavalCapable: atkNavalCapable,
        isFlankSquad: true,
        initialMorale: Math.min(100, duelMoraleAtk + 8),
      })
    );
  }

  // Defender Squads (up to 3 stationed heroes + Garrison Captain on Gate/Citadel)
  const defHeroes = getCityGenerals(gameState, config.toCityId);
  const defCount = Math.max(3, Math.min(4, defHeroes.length + (defHeroes.length < 3 ? 1 : 0)));
  // The garrison starts behind its works: two squads in the gateways, the rest manning the walls
  // beside them. (Squads posted outside the walls were cut down before they could fall back.)
  const defSpawns: Array<[number, number]> = [
    [3, 6], // Holding North City Gate!
    [4, 6], // Holding South City Gate!
    [2, 6], // North wall, beside the gate
    [5, 6], // South wall, beside the gate
  ];
  const defSquadTroops = splitTroops(
    totalDefTroops,
    defCount === 4 ? [0.32, 0.26, 0.22, 0.2] : [0.4, 0.32, 0.28]
  );

  for (let i = 0; i < defCount; i++) {
    const h = defHeroes[i];
    const [sr, sc] = defSpawns[i];
    const safeCol = grid[sr][sc].type === 'water' && !defNavalCapable ? 5 : sc;
    units.push(
      buildSquadUnit({
        id: `def-${i}`,
        side: 'defender',
        faction: defFaction,
        hero: h,
        fallbackName:
          i === 0
            ? { en: 'Citadel Warden', zh: '守城大将' }
            : i === 1
              ? { en: 'Gate Garrison', zh: '城门守军' }
              : { en: 'City Archers', zh: '守城弓弩营' },
        fallbackIndex: i === 2 ? 2 : i,
        row: sr,
        col: safeCol,
        troops: defSquadTroops[i],
        hasStirrups: defStirrups,
        isNavalCapable: defNavalCapable,
        initialMorale: duelMoraleDef,
      })
    );
  }

  const windChoices: WindDirection[] = ['E', 'W', 'N', 'S'];
  const wind = windChoices[Math.floor(rng() * windChoices.length) % windChoices.length];

  const atkStart = units
    .filter((u) => u.side === 'attacker')
    .reduce((sum, u) => sum + u.troops, 0);
  const defStart = units
    .filter((u) => u.side === 'defender')
    .reduce((sum, u) => sum + u.troops, 0);

  const introLog: LocalizedText = {
    en: `Battle of ${targetCity?.name.en || config.toCityId} begins! Wind: ${WIND_DELTA[wind].label.en}. Break a gate and seize the Citadel Flag, or rout the enemy!`,
    zh: `${targetCity?.name.zh || config.toCityId}之战打响！当前风向：${WIND_DELTA[wind].label.zh}。攻破城门后夺取本阵大旗，或击溃全部守军即可获胜！`,
  };

  // Campaign context that follows the armies onto the grid.
  const playerFaction = gameState.playerFaction;
  const coalitionSide: TacticalSide | null = !gameState.chrono.coalitionActive
    ? null
    : config.attackerFaction !== playerFaction && defFaction === playerFaction
      ? 'attacker'
      : config.attackerFaction === playerFaction && defFaction !== 'neutral'
        ? 'defender'
        : null;
  const chronoInsightAtk =
    config.attackerFaction === playerFaction ? getChronoInsightBonus(gameState) * 0.75 : 0;

  return {
    config,
    cityName: targetCity?.name ?? { en: config.toCityId, zh: config.toCityId },
    cityDefense: targetCity?.defense ?? 3,
    cityTerrain: targetCity?.terrain ?? 'plains',
    breached: false,
    coalitionSide,
    chronoInsightAtk,
    hasWaterFeature,
    grid,
    units,
    round: 1,
    maxRounds: TACTICAL_MAX_ROUNDS,
    activeSide: 'attacker',
    wind,
    // A Fire Attack plan arrives with kindling prepared: one extra Stratagem Point.
    sp: { attacker: config.tactic === 'fire' ? 3 : 2, defender: 2 },
    attackerHasGunpowder: atkGunpowder,
    attackerHasStirrups: atkStirrups,
    attackerHasSteamship: atkSteamship,
    attackerHasBalloon: atkBalloon,
    attackerHasSpyglass: atkSpyglass,
    attackerHasMedicine: atkMedicine,
    defenderHasGunpowder: defGunpowder,
    defenderHasStirrups: defStirrups,
    defenderHasSteamship: defSteamship,
    defenderHasBalloon: defBalloon,
    defenderHasSpyglass: defSpyglass,
    defenderHasMedicine: defMedicine,
    gunpowderBombsLeft: {
      attacker: atkGunpowder ? 2 : 0,
      defender: defGunpowder ? 1 : 0,
    },
    attackerStartTroops: atkStart,
    defenderStartTroops: defStart,
    winner: null,
    lastCallout: null,
    logs: [{ id: nextTacId('tlog'), round: 1, side: 'system', text: introLog }],
    duelUsedOnGrid: Boolean(config.initialDuelResult),
    preBattleHeroes: { ...gameState.generals },
  };
}

// ==================== CITY WALLS, GATES & CAMPAIGN CONTEXT ====================

export function isIntactGate(tile: TacticalTile): boolean {
  return tile.type === 'gate' && (tile.gateHp ?? 0) > 0;
}

/**
 * DEF bonus for defenders fighting from walls, standing gates, or the citadel: +50% at Lv.1,
 * +90% at Lv.3, +130% at Lv.5. Troops behind good walls are hard to kill until a gate gives way,
 * which is what makes Fortify (and breaking gates) worth doing.
 */
export const RAMPART_BASE_DEF = 0.3;
export const RAMPART_DEF_PER_LEVEL = 0.2;
export function getRampartDefBonus(state: TacticalBattleState): number {
  return RAMPART_BASE_DEF + RAMPART_DEF_PER_LEVEL * state.cityDefense;
}

/** Does this squad currently enjoy the protection of the city's works? */
function isOnRampart(state: TacticalBattleState, unit: TacticalUnit): boolean {
  if (unit.side !== 'defender') return false;
  const tile = state.grid[unit.row][unit.col];
  return tile.type === 'wall' || tile.type === 'citadel' || isIntactGate(tile);
}

/** What a Siege Engines plan leaves of the walls' protection, and its bonus when battering gates. */
export const SIEGE_PLAN_RAMPART_FACTOR = 0.7;
export const SIEGE_PLAN_GATE_MULT = 1.5;
/** ATK bonus a Frontal Assault plan gives every direct blow by the attacking army. */
export const ASSAULT_PLAN_ATK = 0.15;

/**
 * Rampart DEF a squad gets against a blow from `strikerSide`. A Siege Engines plan strips away
 * part of what the walls are worth to the attacking army - against blows, fire and skills alike.
 */
function rampartCoverAgainst(
  state: TacticalBattleState,
  target: TacticalUnit,
  strikerSide: TacticalSide
): number {
  if (!isOnRampart(state, target)) return 0;
  const siegeEngines = strikerSide === 'attacker' && state.config.tactic === 'siege';
  return getRampartDefBonus(state) * (siegeEngines ? SIEGE_PLAN_RAMPART_FACTOR : 1);
}

function heroOfUnit(state: TacticalBattleState, unit: TacticalUnit): General | undefined {
  return unit.heroId ? state.preBattleHeroes[unit.heroId] : undefined;
}

function opposingFaction(state: TacticalBattleState, side: TacticalSide): FactionId {
  return side === 'attacker' ? state.config.defenderFaction : state.config.attackerFaction;
}

/** The strongest sworn bond a hero shares with a living comrade fighting within BOND_RANGE tiles. */
export function getActiveUnitBond(
  state: TacticalBattleState,
  unit: TacticalUnit
): HeroBond | undefined {
  const hero = heroOfUnit(state, unit);
  if (!hero || hero.bondIds.length === 0) return undefined;
  let best: HeroBond | undefined;
  for (const bondId of hero.bondIds) {
    const bond = HERO_BONDS[bondId];
    if (!bond) continue;
    const comradeNearby = state.units.some(
      (other) =>
        other.id !== unit.id &&
        !other.defeated &&
        other.side === unit.side &&
        Boolean(other.heroId) &&
        bond.memberIds.includes(other.heroId!) &&
        manhattan(other.row, other.col, unit.row, unit.col) <= BOND_RANGE
    );
    if (comradeNearby && (!best || bond.combatBonus > best.combatBonus)) best = bond;
  }
  return best;
}

/**
 * How hard a squad hits for its size. Every source of damage a squad deals - blows, gate battering,
 * Fire Attack, signature skills - scales by this, so a token squad cannot burn or cleave like an army.
 */
function squadStrengthFactor(unit: TacticalUnit): number {
  return Math.sqrt(Math.max(400, unit.troops) / 3000);
}

/** Stone works do not hold a blaze: walls, gates and the citadel never become Blazing Fire tiles. */
function isStoneWorks(tile: TacticalTile): boolean {
  return tile.type === 'wall' || tile.type === 'gate' || tile.type === 'citadel';
}

/** Men a squad loses for standing in (or being dragged into) Blazing Fire for a round. */
function burnCasualties(unit: TacticalUnit, share = BURN_SHARE): number {
  return Math.min(unit.troops, BURN_CAP, Math.max(200, Math.round(unit.maxTroops * share)));
}

/** Morale a squad loses when `damage` of its men fall in one blow, plus any flat psychological shock. */
function moraleLossFromCasualties(damage: number, unit: TacticalUnit, shock = 0): number {
  if (damage <= 0) return shock;
  const share = Math.min(1, damage / Math.max(1, unit.maxTroops));
  return Math.round(share * MORALE_LOSS_PER_FULL_STRENGTH) + shock;
}

// ==================== MOVEMENT & PATHFINDING ====================

export function getUnitEffectiveMove(unit: TacticalUnit): number {
  let mv = unit.moveRange;
  if (unit.wffmTurns > 0 && unit.wffmStance === 'wind') mv += 2;
  if (unit.intimidatedTurns > 0) mv = Math.max(1, mv - 1);
  return mv;
}

export function getUnitEffectiveAttackRange(
  state: TacticalBattleState,
  unit: TacticalUnit
): number {
  let range = unit.attackRange;
  const tile = state.grid[unit.row][unit.col];
  // Sun Tzu High Ground: Archers/Strategists gain +1 range on Hills or Walls!
  if (unit.unitClass === 'archer' && (tile.type === 'hill' || tile.type === 'wall')) {
    range += 1;
  }
  return range;
}

export function getTileMoveCost(
  tile: TacticalTile,
  unit: TacticalUnit
): number | null {
  if (tile.type === 'wall' && unit.side === 'attacker') return null;
  if (isIntactGate(tile) && unit.side === 'attacker') return null;
  if (tile.type === 'water') {
    return unit.isNavalCapable ? 1 : null;
  }
  if (tile.fireTurns > 0) return 2;
  if (tile.type === 'forest' || tile.type === 'hill' || tile.type === 'ford') {
    if (unit.wffmTurns > 0 && unit.wffmStance === 'wind') return 1;
    // A Mountain Ambush plan scouts hidden trails: forests and hills do not slow the attackers.
    if (unit.stealthyMarch && tile.type !== 'ford') return 1;
    return 2;
  }
  return 1;
}

export function getReachableTiles(
  state: TacticalBattleState,
  unit: TacticalUnit
): GridCoord[] {
  if (unit.defeated || unit.hasMoved) return [];
  const maxMove = getUnitEffectiveMove(unit);
  const visited = new Map<string, number>();
  const queue: Array<{ row: number; col: number; dist: number }> = [
    { row: unit.row, col: unit.col, dist: 0 },
  ];
  visited.set(`${unit.row},${unit.col}`, 0);

  const reachable: GridCoord[] = [];
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  while (queue.length > 0) {
    queue.sort((a, b) => a.dist - b.dist);
    const cur = queue.shift()!;
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      if (!inBounds(nr, nc)) continue;
      const tile = state.grid[nr][nc];
      const cost = getTileMoveCost(tile, unit);
      if (cost === null) continue;

      const occupant = getUnitAt(state, nr, nc);
      // Cannot pass through enemy units (unless enemy is hidden ambush — triggers trap on entry!)
      if (occupant && occupant.side !== unit.side && !occupant.isHiddenAmbush) continue;

      const nextDist = cur.dist + cost;
      if (nextDist > maxMove) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key) && visited.get(key)! <= nextDist) continue;
      visited.set(key, nextDist);

      // Can only stop on an unoccupied tile (or hidden enemy tile won't be stopped on)
      if (!occupant) {
        reachable.push({ row: nr, col: nc });
        queue.push({ row: nr, col: nc, dist: nextDist });
      } else if (occupant.side === unit.side) {
        // Can pass through friendly squad, just cannot stop on top of them
        queue.push({ row: nr, col: nc, dist: nextDist });
      }
    }
  }

  return reachable;
}

// ==================== ART OF WAR POSITIONAL PRINCIPLES & COMBAT ====================

function isBackedAgainstObstacle(state: TacticalBattleState, unit: TacticalUnit): boolean {
  const behindCol = unit.side === 'attacker' ? unit.col - 1 : unit.col + 1;
  if (!inBounds(unit.row, behindCol)) return false;
  const behindTile = state.grid[unit.row][behindCol];
  return behindTile.type === 'water' || behindTile.type === 'wall';
}

function countAdjacentAlliesOf(
  state: TacticalBattleState,
  targetRow: number,
  targetCol: number,
  allySide: TacticalSide,
  excludeUnitId?: string
): number {
  let count = 0;
  for (const u of state.units) {
    if (u.defeated || u.side !== allySide || u.id === excludeUnitId) continue;
    if (manhattan(u.row, u.col, targetRow, targetCol) === 1) count += 1;
  }
  return count;
}

export function getAttackTargets(
  state: TacticalBattleState,
  unit: TacticalUnit
): TacticalUnit[] {
  if (unit.defeated || unit.hasActed) return [];
  const range = getUnitEffectiveAttackRange(state, unit);
  const revealsAmbush =
    sideHasTech(state, unit.side, 'balloon') || sideHasTech(state, unit.side, 'spyglass');
  return state.units.filter(
    (other) =>
      !other.defeated &&
      other.side !== unit.side &&
      (!other.isHiddenAmbush || revealsAmbush || manhattan(unit.row, unit.col, other.row, other.col) <= 1) &&
      manhattan(unit.row, unit.col, other.row, other.col) <= range
  );
}

export function previewAttack(
  state: TacticalBattleState,
  attacker: TacticalUnit,
  defender: TacticalUnit
): AttackDamagePreview {
  const atkTile = state.grid[attacker.row][attacker.col];
  const defTile = state.grid[defender.row][defender.col];
  const principles: ArtOfWarPrincipleTag[] = [];

  let atkMult = 1.0 + (attacker.war - 65) * 0.008 + (attacker.command - 65) * 0.005;
  let defMult = 1.0 + (defender.command - 65) * 0.007;

  // Morale scaling
  atkMult *= 0.72 + (attacker.morale / 100) * 0.42;
  defMult *= 0.78 + (defender.morale / 100) * 0.34;

  // 1. Sun Tzu Ch. 9: High Ground Advantage (居高临下)
  if ((atkTile.type === 'hill' || atkTile.type === 'wall') && defTile.type !== 'hill' && defTile.type !== 'wall') {
    atkMult += 0.15;
    principles.push({
      id: 'high_ground',
      label: { en: 'High Ground (Art of War Ch.9)', zh: '居高临下（《行军篇》）' },
      value: '+15% ATK',
      positive: true,
    });
  }
  if (defTile.type === 'hill') {
    defMult += 0.25;
    principles.push({
      id: 'def_hill',
      label: { en: 'Enemy High Ground', zh: '敌占高地' },
      value: '-25% DMG',
      positive: false,
    });
  }

  // 2. Sun Tzu Ch. 9: Strike Half-Crossed Water (半渡而击)
  if (defTile.type === 'ford' && !defender.isNavalCapable) {
    atkMult += 0.25;
    defMult -= 0.18;
    principles.push({
      id: 'half_crossed',
      label: { en: 'Strike Half-Crossed Water! (Ch.9)', zh: '半渡而击！（《行军篇》）' },
      value: '+25% ATK',
      positive: true,
    });
  }

  // 3. Sun Tzu Ch. 7: Flanking & Encirclement (合围夹击)
  const immuneFlank = defender.wffmTurns > 0 && defender.wffmStance === 'mountain';
  const extraAllies = countAdjacentAlliesOf(
    state,
    defender.row,
    defender.col,
    attacker.side,
    attacker.id
  );
  if (!immuneFlank && extraAllies >= 2) {
    atkMult += 0.3;
    principles.push({
      id: 'encircled',
      label: { en: 'Encircled! (Art of War Ch.7)', zh: '多面合围！（《军争篇》）' },
      value: '+30% ATK',
      positive: true,
    });
  } else if (!immuneFlank && extraAllies === 1) {
    atkMult += 0.15;
    principles.push({
      id: 'flanked',
      label: { en: 'Flank Pincer (Ch.7)', zh: '两翼夹击' },
      value: '+15% ATK',
      positive: true,
    });
  }

  // 4. Sun Tzu Ch. 11: Back to the Water (背水一战)
  if (isBackedAgainstObstacle(state, attacker)) {
    atkMult += 0.15;
    principles.push({
      id: 'back_water',
      label: { en: 'Back to the Water (Ch.11)', zh: '背水一战（《九地篇》）' },
      value: '+15% ATK',
      positive: true,
    });
  }

  // Terrain Cover & Cavalry / Naval / Fortress Synergies
  if (attacker.unitClass === 'cavalry' && atkTile.type === 'plains' && defTile.type === 'plains') {
    atkMult += 0.2;
    principles.push({
      id: 'plains_charge',
      label: { en: 'Plains Cavalry Charge', zh: '平原铁骑突阵' },
      value: '+20% ATK',
      positive: true,
    });
  }
  if (defTile.type === 'forest' && defTile.fireTurns === 0) {
    defMult += 0.2;
    principles.push({
      id: 'forest_cover',
      label: { en: 'Forest Cover', zh: '密林掩护' },
      value: '+20% DEF',
      positive: false,
    });
  }
  if (defTile.fireTurns > 0) {
    defMult -= 0.18;
    principles.push({
      id: 'burning_foe',
      label: { en: 'Enemy in Blazing Fire', zh: '敌陷烈火' },
      value: '-18% DEF',
      positive: true,
    });
  }
  const tactic = state.config.tactic;
  // Siege Engines strip away part of what the walls are worth; a breached gate is worth nothing.
  const rampart = rampartCoverAgainst(state, defender, attacker.side);
  if (rampart > 0) {
    const siegeEngines = attacker.side === 'attacker' && tactic === 'siege';
    defMult += rampart;
    principles.push({
      id: 'city_ramparts',
      label: siegeEngines
        ? { en: `Walls Lv.${state.cityDefense} (weakened by Siege Engines)`, zh: `城防 Lv.${state.cityDefense}（器械削弱）` }
        : { en: `City Walls Lv.${state.cityDefense}`, zh: `城墙城门 Lv.${state.cityDefense}` },
      value: `+${Math.round(rampart * 100)}% DEF`,
      positive: false,
    });
  }

  // Campaign context: the plan chosen in the War Room, faction traits, sworn bonds, vendettas, coalition.
  if (attacker.side === 'attacker' && tactic === 'assault') {
    atkMult += ASSAULT_PLAN_ATK;
    principles.push({
      id: 'tactic_assault',
      label: { en: 'Frontal Assault Plan', zh: '正面强攻之策' },
      value: `+${Math.round(ASSAULT_PLAN_ATK * 100)}% ATK`,
      positive: true,
    });
  }
  if (attacker.faction === 'shu' && attacker.heroId) {
    atkMult += 0.1;
    principles.push({
      id: 'trait_shu_valor',
      label: { en: 'Shu Benevolent Valor', zh: '蜀汉仁德精兵' },
      value: '+10% ATK',
      positive: true,
    });
  }
  if (defender.side === 'defender' && defender.faction === 'shu' && state.cityTerrain === 'mountain') {
    defMult += 0.12;
    principles.push({
      id: 'trait_shu_mountain',
      label: { en: 'Shu Mountain Defense', zh: '蜀道山险' },
      value: '+12% DEF',
      positive: false,
    });
  }
  const bond = getActiveUnitBond(state, attacker);
  if (bond) {
    atkMult += bond.combatBonus;
    principles.push({
      id: 'sworn_bond',
      label: bond.name,
      value: `+${Math.round(bond.combatBonus * 100)}% ATK`,
      positive: true,
    });
  }
  const strikerHero = heroOfUnit(state, attacker);
  const strikerFoe = opposingFaction(state, attacker.side);
  if (strikerHero && strikerFoe !== 'neutral' && strikerHero.vendettaAgainst.includes(strikerFoe)) {
    atkMult += 0.2;
    principles.push({
      id: 'vendetta',
      label: { en: 'Sworn Vendetta', zh: '血海深仇' },
      value: '+20% ATK',
      positive: true,
    });
  }
  if (state.coalitionSide === attacker.side) {
    atkMult += 0.12;
    principles.push({
      id: 'coalition_atk',
      label: { en: 'Coalition Resolve', zh: '合纵联军之势' },
      value: '+12% ATK',
      positive: true,
    });
  }
  if (state.coalitionSide === defender.side) {
    defMult += 0.12;
    principles.push({
      id: 'coalition_def',
      label: { en: 'Coalition Resolve', zh: '合纵联军死守' },
      value: '+12% DEF',
      positive: false,
    });
  }
  if (attacker.side === 'attacker' && state.chronoInsightAtk > 0) {
    const targetHero = heroOfUnit(state, defender);
    if (targetHero && targetHero.dossier.weakToTactic === tactic) {
      atkMult += state.chronoInsightAtk;
      principles.push({
        id: 'chrono_insight',
        label: { en: 'Chrono-Insight: Known Flaw', zh: '先知克制软肋' },
        value: `+${Math.round(state.chronoInsightAtk * 100)}% ATK`,
        positive: true,
      });
    }
  }

  // Naval & Modern Tech bonuses
  if ((atkTile.type === 'water' || defTile.type === 'water') && attacker.isNavalCapable) {
    const navalBonus = sideHasTech(state, attacker.side, 'steamship') ? 0.3 : 0.22;
    atkMult += navalBonus;
    principles.push({
      id: 'naval_supremacy',
      label: sideHasTech(state, attacker.side, 'steamship')
        ? { en: 'Steam Warship Supremacy', zh: '蒸汽战船压制' }
        : { en: 'Yangtze Fleet Advantage', zh: '水师江战优势' },
      value: `+${Math.round(navalBonus * 100)}% ATK`,
      positive: true,
    });
  }
  if (sideHasTech(state, attacker.side, 'balloon')) {
    atkMult += 0.12;
    principles.push({
      id: 'balloon_recon',
      label: { en: 'Recon Balloon Spotter', zh: '热气球侦察校准' },
      value: '+12% ATK',
      positive: true,
    });
  }
  if (attacker.unitClass === 'cavalry' && sideHasTech(state, attacker.side, 'stirrups')) {
    atkMult += 0.15;
    principles.push({
      id: 'stirrups',
      label: { en: 'Steel Stirrups Charge', zh: '双边马镫冲锋' },
      value: '+15% ATK',
      positive: true,
    });
  }

  // Active Art of War Stances & Statuses
  if (attacker.deathGroundTurns > 0) {
    atkMult += 0.4;
    principles.push({
      id: 'death_ground',
      label: { en: 'Death Ground Surge', zh: '死地绝杀' },
      value: '+40% ATK',
      positive: true,
    });
  }
  if (attacker.wffmTurns > 0 && attacker.wffmStance === 'fire') {
    atkMult += 0.3;
    principles.push({
      id: 'wffm_fire',
      label: { en: 'Fierce as Fire Stance', zh: '侵掠如火' },
      value: '+30% ATK',
      positive: true,
    });
  }
  if (attacker.intimidatedTurns > 0) {
    atkMult -= 0.25;
    principles.push({
      id: 'intimidated',
      label: { en: 'Intimidated (Empty Fort)', zh: '空城震慑' },
      value: '-25% ATK',
      positive: false,
    });
  }
  if (defender.wffmTurns > 0 && defender.wffmStance === 'mountain') {
    defMult += 0.4;
    principles.push({
      id: 'wffm_mtn',
      label: { en: 'Immovable Mountain', zh: '不动如山' },
      value: '+40% DEF',
      positive: false,
    });
  } else if (defender.wffmTurns > 0 && defender.wffmStance === 'forest') {
    defMult += 0.25;
  }
  if (defender.fortifiedTurns > 0) {
    defMult += 0.25;
  }
  if (defender.disorderedTurns > 0) {
    defMult -= 0.2;
    principles.push({
      id: 'disordered',
      label: { en: 'Enemy Disordered', zh: '敌阵大乱' },
      value: '-20% DEF',
      positive: true,
    });
  }
  if (defender.luredDefDebuffTurns > 0) {
    defMult -= 0.15;
    principles.push({
      id: 'lured_debuff',
      label: { en: 'Lured Out of Position', zh: '中计诱敌' },
      value: '-15% DEF',
      positive: true,
    });
  }

  const troopFactor = squadStrengthFactor(attacker);
  const rawDamage = 920 * troopFactor * Math.max(0.45, atkMult) / Math.max(0.55, defMult);
  const estimatedDamage = Math.min(defender.troops, Math.max(180, Math.round(rawDamage)));

  // Counter-attack if defender survives and attacker is within defender's attack range
  const dist = manhattan(attacker.row, attacker.col, defender.row, defender.col);
  const defRange = getUnitEffectiveAttackRange(state, defender);
  let counterDamage = 0;
  if (defender.troops - estimatedDamage > 0 && dist <= defRange && defender.disorderedTurns === 0) {
    const survivingFactor = Math.sqrt(Math.max(300, defender.troops - estimatedDamage) / 3000);
    const medShield = sideHasTech(state, attacker.side, 'medicine') ? 0.78 : 1.0;
    // A Mountain Ambush plan strikes from cover: attackers take 20% less in return.
    const ambushPlan = attacker.side === 'attacker' && tactic === 'ambush' ? 0.8 : 1.0;
    counterDamage = Math.max(
      0,
      Math.min(
        attacker.troops - 1,
        Math.max(80, Math.round(420 * survivingFactor * (defender.war / 80) * medShield * ambushPlan))
      )
    );
  }

  // Morale follows the share of the squad that falls (plus a jolt when surrounded), never the hit count.
  const moraleDrop = moraleLossFromCasualties(
    estimatedDamage,
    defender,
    !immuneFlank && extraAllies >= 2 ? 8 : 0
  );
  const counterMoraleDrop = moraleLossFromCasualties(counterDamage, attacker);

  // Striking a defender who holds a standing gate also batters the gate itself.
  const gateDamage =
    attacker.side === 'attacker' && defender.side === 'defender' && isIntactGate(defTile)
      ? Math.round(computeGateDamage(state, attacker).damage * GATE_SPLASH_SHARE)
      : 0;

  return { estimatedDamage, counterDamage, moraleDrop, counterMoraleDrop, gateDamage, principles };
}

// ==================== BATTERING THE GATES ====================

function computeGateDamage(
  state: TacticalBattleState,
  unit: TacticalUnit
): { damage: number; principles: ArtOfWarPrincipleTag[] } {
  const principles: ArtOfWarPrincipleTag[] = [];
  let mult = 1.0 + (unit.war - 65) * 0.008 + (unit.command - 65) * 0.005;
  mult *= 0.72 + (unit.morale / 100) * 0.42;
  if (unit.intimidatedTurns > 0) mult *= 0.75;

  if (state.config.tactic === 'siege') {
    mult *= SIEGE_PLAN_GATE_MULT;
    principles.push({
      id: 'tactic_siege',
      label: { en: 'Siege Engines Plan', zh: '围城器械之策' },
      value: `+${Math.round((SIEGE_PLAN_GATE_MULT - 1) * 100)}% vs Gates`,
      positive: true,
    });
  }
  if (sideHasTech(state, unit.side, 'gunpowder')) {
    mult *= 1.4;
    principles.push({
      id: 'gunpowder_petards',
      label: { en: 'Black Powder Petards', zh: '黑火药破门' },
      value: '+40% vs Gates',
      positive: true,
    });
  }
  if (heroOfUnit(state, unit)?.signatureSkill.effect === 'siege_breaker') {
    mult *= 1.4;
    principles.push({
      id: 'siege_breaker',
      label: { en: 'Born Siege Breaker', zh: '攻坚名将' },
      value: '+40% vs Gates',
      positive: true,
    });
  }

  const troopFactor = squadStrengthFactor(unit);
  return { damage: Math.max(120, Math.round(920 * troopFactor * Math.max(0.45, mult))), principles };
}

/** Standing gates an attacking squad can batter right now (an occupied gate is struck through its defender). */
export function getGateAttackTargets(
  state: TacticalBattleState,
  unit: TacticalUnit
): GridCoord[] {
  if (unit.defeated || unit.hasActed || unit.side !== 'attacker') return [];
  const range = getUnitEffectiveAttackRange(state, unit);
  const coords: GridCoord[] = [];
  for (const row of state.grid) {
    for (const tile of row) {
      if (!isIntactGate(tile)) continue;
      if (manhattan(unit.row, unit.col, tile.row, tile.col) > range) continue;
      if (getUnitAt(state, tile.row, tile.col)) continue;
      coords.push({ row: tile.row, col: tile.col });
    }
  }
  return coords;
}

export function previewGateAttack(
  state: TacticalBattleState,
  unit: TacticalUnit,
  row: number,
  col: number
): GateAttackPreview {
  const { damage, principles } = computeGateDamage(state, unit);
  const hp = state.grid[row][col].gateHp ?? 0;
  const gateDamage = Math.min(hp, damage);
  return { gateDamage, gateHpLeft: hp - gateDamage, breaches: hp - gateDamage <= 0, principles };
}

/**
 * Apply damage to one gate tile of a (already cloned) grid. Returns what the caller needs to
 * announce a breach; the grid is mutated in place.
 */
function batterGate(
  grid: TacticalTile[][],
  row: number,
  col: number,
  damage: number
): { dealt: number; breachedNow: boolean } {
  const tile = grid[row][col];
  if (!isIntactGate(tile) || damage <= 0) return { dealt: 0, breachedNow: false };
  const dealt = Math.min(tile.gateHp ?? 0, Math.round(damage));
  tile.gateHp = (tile.gateHp ?? 0) - dealt;
  return { dealt, breachedNow: tile.gateHp <= 0 };
}

function breachCallout(state: TacticalBattleState, by: TacticalUnit | undefined): TacticalCallout {
  return {
    id: nextTacId('call'),
    kind: 'breach',
    title: { en: 'GATE BREACHED!', zh: '城门告破！' },
    quote: {
      en: '“The walls are open — the Citadel Flag is ours for the taking!”',
      zh: '「城门已破，直取本阵大旗！」',
    },
    subtitle: {
      en: `${by ? `${by.name.en} broke` : 'The attackers broke'} into ${state.cityName.en}! The Citadel Flag can now be seized.`,
      zh: `${by ? by.name.zh : '攻城大军'}攻破${state.cityName.zh}城门！此刻起可夺取本阵大旗。`,
    },
    side: 'attacker',
  };
}

export function executeGateAttack(
  state: TacticalBattleState,
  unitId: string,
  row: number,
  col: number
): TacticalBattleState {
  if (state.winner) return state;
  const unit = state.units.find((u) => u.id === unitId && !u.defeated);
  if (!unit || unit.side !== state.activeSide || unit.hasActed) return state;
  if (!getGateAttackTargets(state, unit).some((p) => p.row === row && p.col === col)) return state;

  const nextGrid = state.grid.map((r) => r.map((t) => ({ ...t })));
  const { dealt, breachedNow } = batterGate(nextGrid, row, col, computeGateDamage(state, unit).damage);
  const nextUnits = state.units.map((u) =>
    u.id === unit.id ? { ...u, hasActed: true, isHiddenAmbush: false } : u
  );

  const hpLeft = nextGrid[row][col].gateHp ?? 0;
  const summary: LocalizedText = breachedNow
    ? {
        en: `${unit.name.en} smashed the city gate for ${dealt.toLocaleString()} — the gate is DOWN!`,
        zh: `${unit.name.zh}猛撞城门 ${dealt.toLocaleString()}——城门轰然洞开！`,
      }
    : {
        en: `${unit.name.en} battered the city gate for ${dealt.toLocaleString()} (${hpLeft.toLocaleString()} left).`,
        zh: `${unit.name.zh}冲撞城门 ${dealt.toLocaleString()}（城门尚余 ${hpLeft.toLocaleString()}）。`,
      };

  const nextSp = { ...state.sp };
  if (breachedNow) nextSp.attacker = Math.min(TACTICAL_MAX_SP, nextSp.attacker + 1);

  return evaluateVictory({
    ...state,
    grid: nextGrid,
    units: nextUnits,
    sp: nextSp,
    breached: state.breached || breachedNow,
    lastCallout: breachedNow ? breachCallout(state, unit) : state.lastCallout,
    logs: appendLog(state, unit.side, summary),
  });
}

// ==================== INTELLECT-DRIVEN ART OF WAR STRATAGEMS ====================

export function canUseDeathGround(state: TacticalBattleState, unit: TacticalUnit): boolean {
  return unit.troops / Math.max(1, unit.maxTroops) <= 0.6 || isBackedAgainstObstacle(state, unit);
}

export function calculateStratagemSuccess(
  state: TacticalBattleState,
  caster: TacticalUnit,
  stratagemId: ArtOfWarStratagemId,
  targetRow: number,
  targetCol: number
): StratagemSuccessPreview {
  const def = ART_OF_WAR_STRATAGEMS[stratagemId];
  const targetUnit = getUnitAt(state, targetRow, targetCol);
  const targetTile = state.grid[targetRow][targetCol];
  const factors: ArtOfWarPrincipleTag[] = [];

  let bonus = 0;

  // Determine whether this cast contests an enemy General's INT or a self/terrain discipline check
  const isEmptyFortMode =
    stratagemId === 'empty_fort_ambush' &&
    (state.grid[caster.row][caster.col].type === 'gate' ||
      state.grid[caster.row][caster.col].type === 'citadel');

  let opposingUnit: TacticalUnit | undefined =
    targetUnit && targetUnit.side !== caster.side ? targetUnit : undefined;

  if (isEmptyFortMode) {
    // Empty Fort Ruse contests the highest-INT enemy within range 3!
    const nearbyEnemies = state.units.filter(
      (u) => !u.defeated && u.side !== caster.side && manhattan(u.row, u.col, caster.row, caster.col) <= 3
    );
    opposingUnit = nearbyEnemies.sort((a, b) => b.intellect - a.intellect)[0];
  }

  let chance: number;
  let targetInt: number;

  if (opposingUnit) {
    targetInt = opposingUnit.intellect;
    const diff = caster.intellect - targetInt;
    chance = def.baseChance + diff * 0.9;
    factors.push({
      id: 'int_duel',
      label: {
        en: `General INT (${caster.intellect} vs ${targetInt})`,
        zh: `智力对决（${caster.intellect} vs ${targetInt}）`,
      },
      value: `${diff >= 0 ? '+' : ''}${Math.round(diff * 0.9)}%`,
      positive: diff >= 0,
    });
  } else {
    targetInt = 55;
    const diff = caster.intellect - 55;
    chance = def.baseChance + diff * 0.8;
    factors.push({
      id: 'int_mastery',
      label: {
        en: `General Intellect (INT ${caster.intellect})`,
        zh: `将领智力掌控（智 ${caster.intellect}）`,
      },
      value: `${diff >= 0 ? '+' : ''}${Math.round(diff * 0.8)}%`,
      positive: diff >= 0,
    });
  }

  // Situational Bonuses
  const specialtyMatch =
    (stratagemId === 'fire_attack' && caster.specialty === 'fire') ||
    ((stratagemId === 'feign_disorder' || stratagemId === 'empty_fort_ambush') &&
      caster.specialty === 'ambush') ||
    (stratagemId === 'subdue_chaos' && (caster.specialty === 'fire' || caster.specialty === 'ambush')) ||
    (stratagemId === 'wffm' && caster.specialty === 'assault');
  if (specialtyMatch) {
    bonus += 10;
    factors.push({
      id: 'spec_match',
      label: { en: 'General Specialty Synergy', zh: '兵法特长契合' },
      value: '+10%',
      positive: true,
    });
  }

  if (stratagemId === 'fire_attack') {
    const wd = WIND_DELTA[state.wind];
    const upwindAligned =
      (wd.dr !== 0 && Math.sign(targetRow - caster.row) === wd.dr) ||
      (wd.dc !== 0 && Math.sign(targetCol - caster.col) === wd.dc);
    if (upwindAligned || targetTile.type === 'forest') {
      bonus += 10;
      factors.push({
        id: 'wind_fuel',
        label: upwindAligned
          ? { en: 'Upwind Fire Synergy (Ch.12)', zh: '顺风借势（《火攻篇》）' }
          : { en: 'Dense Dry Forest Fuel', zh: '密林引燃加成' },
        value: '+10%',
        positive: true,
      });
    }
  }

  // The plan chosen in the War Room readies the matching stratagems for the attacking army.
  const planMatch =
    caster.side === 'attacker' &&
    ((state.config.tactic === 'fire' && stratagemId === 'fire_attack') ||
      (state.config.tactic === 'ambush' &&
        (stratagemId === 'feign_disorder' || stratagemId === 'empty_fort_ambush')));
  if (planMatch) {
    bonus += 15;
    factors.push({
      id: 'war_room_plan',
      label:
        state.config.tactic === 'fire'
          ? { en: 'Fire Attack Plan', zh: '火攻之策已备' }
          : { en: 'Mountain Ambush Plan', zh: '伏兵之策已备' },
      value: '+15%',
      positive: true,
    });
  }
  if (stratagemId === 'fire_attack' && caster.faction === 'wu') {
    bonus += 12;
    factors.push({
      id: 'trait_wu_fire',
      label: { en: 'Wu Fire Mastery', zh: '东吴火攻之利' },
      value: '+12%',
      positive: true,
    });
  }

  if (opposingUnit && (opposingUnit.disorderedTurns > 0 || opposingUnit.morale < 45)) {
    bonus += 12;
    factors.push({
      id: 'shaken_foe',
      label: { en: 'Shaken / Disordered Foe', zh: '敌军士气动摇' },
      value: '+12%',
      positive: true,
    });
  }

  if (sideHasTech(state, caster.side, 'spyglass') || sideHasTech(state, caster.side, 'balloon')) {
    bonus += 10;
    factors.push({
      id: 'foreknowledge',
      label: { en: 'Foreknowledge Tech (Ch.13)', zh: '知彼知己·先知侦察' },
      value: '+10%',
      positive: true,
    });
  }

  const finalChance = opposingUnit
    ? clamp(Math.round(chance + bonus), 15, 95)
    : clamp(Math.round(chance + bonus), 30, 98);

  return {
    stratagemId,
    chance: finalChance,
    casterInt: caster.intellect,
    targetInt,
    spCost: def.spCost,
    factors,
    summary: {
      en: `${def.name.en} — ${finalChance}% Success (INT ${caster.intellect}${opposingUnit ? ` vs ${targetInt}` : ''})`,
      zh: `${def.name.zh} — 成功率 ${finalChance}%（智 ${caster.intellect}${opposingUnit ? ` vs ${targetInt}` : ''}）`,
    },
  };
}

export function getStratagemTargetCoords(
  state: TacticalBattleState,
  caster: TacticalUnit,
  stratagemId: ArtOfWarStratagemId
): GridCoord[] {
  if (caster.defeated || caster.hasActed || caster.disorderedTurns > 0) return [];
  const def = ART_OF_WAR_STRATAGEMS[stratagemId];
  if (state.sp[caster.side] < def.spCost) return [];

  if (stratagemId === 'death_ground') {
    return canUseDeathGround(state, caster) ? [{ row: caster.row, col: caster.col }] : [];
  }
  if (stratagemId === 'wffm' || stratagemId === 'empty_fort_ambush') {
    return [{ row: caster.row, col: caster.col }];
  }

  const extraRange = caster.unitClass === 'archer' && state.grid[caster.row][caster.col].type === 'hill' ? 1 : 0;
  const maxRange = def.range + extraRange;
  const coords: GridCoord[] = [];

  for (let r = 0; r < TACTICAL_GRID_SIZE; r++) {
    for (let c = 0; c < TACTICAL_GRID_SIZE; c++) {
      const d = manhattan(caster.row, caster.col, r, c);
      if (d === 0 || d > maxRange) continue;
      const occupant = getUnitAt(state, r, c);
      const tile = state.grid[r][c];

      if (stratagemId === 'fire_attack') {
        if (
          tile.type === 'forest' ||
          tile.type === 'bridge' ||
          tile.type === 'water' ||
          (occupant && occupant.side !== caster.side)
        ) {
          coords.push({ row: r, col: c });
        }
      } else if (def.targetsEnemy) {
        if (occupant && occupant.side !== caster.side) {
          coords.push({ row: r, col: c });
        }
      }
    }
  }

  return coords;
}

/**
 * Who a Fire Attack on (targetRow, targetCol) would scorch and for how much, if it succeeds:
 * the squad on the tile set alight, plus one on the downwind tile when that is forest or a bridge.
 */
export function previewFireAttackHits(
  state: TacticalBattleState,
  caster: TacticalUnit,
  targetRow: number,
  targetCol: number
): Array<{ unit: TacticalUnit; damage: number; onPrimary: boolean }> {
  const tile = state.grid[targetRow][targetCol];
  const wd = WIND_DELTA[state.wind];
  const dr = targetRow + wd.dr;
  const dc = targetCol + wd.dc;
  const spreads =
    inBounds(dr, dc) && (state.grid[dr][dc].type === 'forest' || state.grid[dr][dc].type === 'bridge');
  const upwindAligned =
    (wd.dr !== 0 && Math.sign(targetRow - caster.row) === wd.dr) ||
    (wd.dc !== 0 && Math.sign(targetCol - caster.col) === wd.dc);
  const windMult = upwindAligned ? 1.25 : 1.0;
  // Wu's fire mastery makes the flames bite 20% harder; the size of the squad setting them matters too.
  const fireMastery = (caster.faction === 'wu' ? 1.2 : 1.0) * squadStrengthFactor(caster);

  const hits: Array<{ unit: TacticalUnit; damage: number; onPrimary: boolean }> = [];
  for (const u of state.units) {
    if (u.defeated || u.side === caster.side) continue;
    const onPrimary = u.row === targetRow && u.col === targetCol;
    const onSpread = spreads && u.row === dr && u.col === dc;
    if (!onPrimary && !onSpread) continue;
    const baseDmg = onPrimary ? FIRE_ATTACK_DAMAGE : FIRE_SPREAD_DAMAGE;
    // Defenders behind stone take less from flames, by the same margin the walls protect them in melee.
    const stoneCover = 1 + rampartCoverAgainst(state, u, caster.side);
    const damage = Math.min(
      u.troops,
      Math.round(
        (baseDmg *
          (caster.intellect / 78) *
          windMult *
          (tile.type === 'forest' ? 1.25 : 1.0) *
          fireMastery) /
          stoneCover
      )
    );
    hits.push({ unit: u, damage, onPrimary });
  }
  return hits;
}

// ==================== VICTORY CHECK HELPER ====================

function evaluateVictory(state: TacticalBattleState): TacticalBattleState {
  if (state.winner) return state;

  const atkAlive = state.units.filter((u) => u.side === 'attacker' && !u.defeated);
  const defAlive = state.units.filter((u) => u.side === 'defender' && !u.defeated);

  // 1. Check Citadel Flag Capture! The flag only counts once a gate or wall has been breached,
  //    so a runner cannot take a walled city by slipping around its intact defenses.
  const citadelOccupant = state.units.find(
    (u) => !u.defeated && u.side === 'attacker' && state.grid[u.row][u.col].type === 'citadel'
  );
  if (citadelOccupant && state.breached) {
    return {
      ...state,
      winner: 'attacker',
      victoryReason: {
        en: `${citadelOccupant.name.en} seized the Citadel Flag of ${state.cityName.en}!`,
        zh: `${citadelOccupant.name.zh}率先杀入本阵，夺下${state.cityName.zh}大旗！`,
      },
    };
  }

  // 2. All defenders routed/surrendered
  if (defAlive.length === 0) {
    return {
      ...state,
      winner: 'attacker',
      victoryReason: {
        en: `All defending forces of ${state.cityName.en} were routed or surrendered!`,
        zh: `${state.cityName.zh}守军全线溃败投降，城池易主！`,
      },
    };
  }

  // 3. All attackers routed
  if (atkAlive.length === 0) {
    return {
      ...state,
      winner: 'defender',
      victoryReason: {
        en: `The invading forces were shattered before the walls of ${state.cityName.en}!`,
        zh: `来犯敌军在${state.cityName.zh}城下全军覆没，守城大捷！`,
      },
    };
  }

  // 4. Turn limit reached (Defender holds out!)
  if (state.round > state.maxRounds) {
    return {
      ...state,
      winner: 'defender',
      victoryReason: {
        en: `${state.cityName.en} held strong through ${state.maxRounds} rounds as attacker supplies ran dry!`,
        zh: `${state.cityName.zh}坚守 ${state.maxRounds} 回合不失，敌军粮尽退兵！`,
      },
    };
  }

  return state;
}

/**
 * Apply casualties and morale loss to a squad. When morale breaks while men are still alive the
 * squad leaves the field: with a way out it routs and its survivors live to fight another day
 * (`escapedTroops`); encircled by ENCIRCLEMENT_SQUADS or more enemy squads, or talked into
 * submission (`noEscape`), it surrenders and they are lost.
 */
function applyDamageToUnit(
  state: TacticalBattleState,
  unit: TacticalUnit,
  damage: number,
  moraleDrop: number,
  attackerSide: TacticalSide,
  opts: { noEscape?: boolean } = {}
): TacticalUnit {
  const nextTroops = Math.max(0, unit.troops - Math.max(0, Math.round(damage)));
  const nextMorale =
    unit.deathGroundTurns > 0
      ? Math.max(50, unit.morale - Math.round(moraleDrop * 0.4))
      : clamp(unit.morale - Math.round(moraleDrop), 0, 100);
  const brokenByMorale = nextMorale <= 0 && unit.deathGroundTurns === 0 && nextTroops > 0;
  const defeated = nextTroops <= 0 || brokenByMorale;
  const surrounded =
    defeated &&
    countAdjacentAlliesOf(state, unit.row, unit.col, attackerSide) >= ENCIRCLEMENT_SQUADS;
  const escapes = brokenByMorale && !surrounded && !opts.noEscape;

  return {
    ...unit,
    troops: defeated ? 0 : nextTroops,
    escapedTroops: escapes ? nextTroops : 0,
    morale: nextMorale,
    defeated,
    routed: escapes,
    surrendered: brokenByMorale && !escapes,
    encircledWhenDefeated: surrounded,
  };
}

/** One-line note appended to a log line when a blow breaks a squad's morale. */
function routNote(unit: TacticalUnit): LocalizedText {
  if (unit.routed) {
    return {
      en: ` ${unit.name.en} broke and fled the field with ${unit.escapedTroops.toLocaleString()} survivors.`,
      zh: ` ${unit.name.zh}军心崩溃，率 ${unit.escapedTroops.toLocaleString()} 残兵溃退离场。`,
    };
  }
  if (unit.surrendered) {
    return {
      en: ` ${unit.name.en}, cut off with no way out, laid down arms.`,
      zh: ` ${unit.name.zh}陷入重围、走投无路，弃械而降。`,
    };
  }
  return { en: '', zh: '' };
}

// ==================== ACTION EXECUTORS ====================

export function moveTacticalUnit(
  state: TacticalBattleState,
  unitId: string,
  toRow: number,
  toCol: number
): TacticalBattleState {
  if (state.winner) return state;
  const unit = state.units.find((u) => u.id === unitId && !u.defeated);
  if (!unit || unit.side !== state.activeSide || unit.hasMoved) return state;

  const reachable = getReachableTiles(state, unit);
  if (!reachable.some((p) => p.row === toRow && p.col === toCol)) return state;

  let nextUnits = state.units.map((u) =>
    u.id === unitId
      ? { ...u, row: toRow, col: toCol, hasMoved: true, isHiddenAmbush: false }
      : u
  );
  let movedUnit = nextUnits.find((u) => u.id === unitId)!;
  let nextLogs = state.logs;
  let nextCallout: TacticalCallout | null = state.lastCallout;
  const nextSp = { ...state.sp };

  // Check if moving adjacent to a hidden enemy Ambush unit springs the trap!
  const ambusher = nextUnits.find(
    (other) =>
      !other.defeated &&
      other.side !== movedUnit.side &&
      other.isHiddenAmbush &&
      manhattan(other.row, other.col, toRow, toCol) === 1
  );

  if (ambusher) {
    // The ambusher strikes as it would in a normal attack, +35% for surprise (scales with its own
    // strength rather than taking a fixed share of the victim).
    const strike = previewAttack({ ...state, units: nextUnits }, ambusher, movedUnit);
    const ambDmg = Math.min(movedUnit.troops, Math.round(strike.estimatedDamage * 1.35));
    movedUnit = applyDamageToUnit(
      state,
      movedUnit,
      ambDmg,
      moraleLossFromCasualties(ambDmg, movedUnit, 8),
      ambusher.side
    );
    movedUnit = { ...movedUnit, hasActed: true }; // Ambush halts advance!
    nextUnits = nextUnits.map((u) =>
      u.id === movedUnit.id
        ? movedUnit
        : u.id === ambusher.id
          ? { ...u, isHiddenAmbush: false }
          : u
    );
    nextSp[ambusher.side] = Math.min(TACTICAL_MAX_SP, nextSp[ambusher.side] + 1);
    nextCallout = {
      id: nextTacId('call'),
      kind: 'ambush',
      title: { en: 'AMBUSH SPRUNG!', zh: '中伏奇袭！' },
      quote: ART_OF_WAR_STRATAGEMS.empty_fort_ambush.quote,
      subtitle: {
        en: `${ambusher.name.en} ambushed ${movedUnit.name.en} for ${ambDmg.toLocaleString()} casualties!`,
        zh: `${ambusher.name.zh}伏兵杀出，重创${movedUnit.name.zh} ${ambDmg.toLocaleString()} 人并阻断其行动！`,
      },
      side: ambusher.side,
    };
    nextLogs = appendLog(state, ambusher.side, nextCallout.subtitle);
  }

  // Stepping directly into Blazing Fire burns immediately!
  const destTile = state.grid[toRow][toCol];
  if (!movedUnit.defeated && destTile.fireTurns > 0) {
    const fireDmg = burnCasualties(movedUnit);
    movedUnit = applyDamageToUnit(
      state,
      movedUnit,
      fireDmg,
      moraleLossFromCasualties(fireDmg, movedUnit),
      movedUnit.side === 'attacker' ? 'defender' : 'attacker'
    );
    nextUnits = nextUnits.map((u) => (u.id === movedUnit.id ? movedUnit : u));
    nextLogs = appendLog({ ...state, logs: nextLogs }, 'system', {
      en: `${movedUnit.name.en} marched through Blazing Fire and lost ${fireDmg.toLocaleString()} troops!${routNote(movedUnit).en}`,
      zh: `${movedUnit.name.zh}踏入烈火，折损 ${fireDmg.toLocaleString()} 兵马！${routNote(movedUnit).zh}`,
    });
  }

  // Reaching the flag behind intact defenses does not take the city yet: say so once it happens.
  if (
    !movedUnit.defeated &&
    movedUnit.side === 'attacker' &&
    destTile.type === 'citadel' &&
    !state.breached
  ) {
    nextLogs = appendLog({ ...state, logs: nextLogs }, 'system', {
      en: `${movedUnit.name.en} reached the Citadel Flag, but the gates still hold — breach a gate or wall to claim ${state.cityName.en}!`,
      zh: `${movedUnit.name.zh}已逼近本阵大旗，然城门未破——须先攻破城门或城墙方可夺城！`,
    });
  }

  return evaluateVictory({
    ...state,
    units: nextUnits,
    sp: nextSp,
    lastCallout: nextCallout,
    logs: nextLogs,
  });
}

export function executeTacticalAttack(
  state: TacticalBattleState,
  attackerId: string,
  defenderId: string
): TacticalBattleState {
  if (state.winner) return state;
  const attacker = state.units.find((u) => u.id === attackerId && !u.defeated);
  const defender = state.units.find((u) => u.id === defenderId && !u.defeated);
  if (!attacker || !defender || attacker.side !== state.activeSide || attacker.hasActed) {
    return state;
  }

  const validTargets = getAttackTargets(state, attacker);
  if (!validTargets.some((t) => t.id === defenderId)) return state;

  const prev = previewAttack(state, attacker, defender);
  const updatedDef = applyDamageToUnit(state, defender, prev.estimatedDamage, prev.moraleDrop, attacker.side);
  let updatedAtk = applyDamageToUnit(state, attacker, prev.counterDamage, prev.counterMoraleDrop, defender.side);
  updatedAtk = { ...updatedAtk, hasActed: true, isHiddenAmbush: false };

  // WFFM "Fierce as Fire" ignites Forest tile on hit!
  const nextGrid = state.grid.map((row) => row.map((t) => ({ ...t })));
  // A blow against a defender in the gateway also batters the gate behind them.
  const gateHit = batterGate(nextGrid, defender.row, defender.col, prev.gateDamage);
  if (
    attacker.wffmTurns > 0 &&
    attacker.wffmStance === 'fire' &&
    (nextGrid[defender.row][defender.col].type === 'forest' ||
      nextGrid[defender.row][defender.col].type === 'bridge')
  ) {
    nextGrid[defender.row][defender.col].fireTurns = 3;
  }

  const nextSp = { ...state.sp };
  if (
    updatedDef.defeated ||
    gateHit.breachedNow ||
    prev.principles.some((p) => p.id === 'flanked' || p.id === 'encircled' || p.id === 'half_crossed')
  ) {
    nextSp[attacker.side] = Math.min(TACTICAL_MAX_SP, nextSp[attacker.side] + 1);
  }

  const nextUnits = state.units.map((u) => {
    if (u.id === updatedAtk.id) return updatedAtk;
    if (u.id === updatedDef.id) return updatedDef;
    return u;
  });

  const gateNoteEn = gateHit.breachedNow
    ? ' The gate behind them gave way!'
    : gateHit.dealt > 0
      ? ` Gate -${gateHit.dealt.toLocaleString()}.`
      : '';
  const gateNoteZh = gateHit.breachedNow
    ? ' 其身后城门亦告攻破！'
    : gateHit.dealt > 0
      ? ` 城门受损 ${gateHit.dealt.toLocaleString()}。`
      : '';
  const summary: LocalizedText = {
    en: `${attacker.name.en} struck ${defender.name.en} for ${prev.estimatedDamage.toLocaleString()} casualties${
      updatedDef.defeated ? ' — DEFEATED!' : prev.counterDamage > 0 ? ` (took ${prev.counterDamage.toLocaleString()} counter)` : ''
    }.${routNote(updatedDef).en}${routNote(updatedAtk).en}${gateNoteEn}`,
    zh: `${attacker.name.zh}猛攻${defender.name.zh}，斩杀 ${prev.estimatedDamage.toLocaleString()} 人${
      updatedDef.defeated ? '——敌军溃败！' : prev.counterDamage > 0 ? `（受反击损 ${prev.counterDamage.toLocaleString()} 人）` : ''
    }。${routNote(updatedDef).zh}${routNote(updatedAtk).zh}${gateNoteZh}`,
  };

  return evaluateVictory({
    ...state,
    grid: nextGrid,
    units: nextUnits,
    sp: nextSp,
    breached: state.breached || gateHit.breachedNow,
    lastCallout: gateHit.breachedNow ? breachCallout(state, attacker) : state.lastCallout,
    logs: appendLog(state, attacker.side, summary),
  });
}

export function executeArtOfWarStratagem(
  state: TacticalBattleState,
  casterId: string,
  stratagemId: ArtOfWarStratagemId,
  targetRow: number,
  targetCol: number,
  stance?: WffmStance,
  rng: () => number = Math.random
): TacticalBattleState {
  if (state.winner) return state;
  const caster = state.units.find((u) => u.id === casterId && !u.defeated);
  if (!caster || caster.side !== state.activeSide || caster.hasActed || caster.disorderedTurns > 0) {
    return state;
  }

  const def = ART_OF_WAR_STRATAGEMS[stratagemId];
  if (state.sp[caster.side] < def.spCost) return state;

  const validCoords = getStratagemTargetCoords(state, caster, stratagemId);
  if (!validCoords.some((p) => p.row === targetRow && p.col === targetCol)) return state;

  const odds = calculateStratagemSuccess(state, caster, stratagemId, targetRow, targetCol);
  const roll = rng() * 100;
  const nextSp = {
    ...state.sp,
    [caster.side]: Math.max(0, state.sp[caster.side] - def.spCost),
  };

  // FAILED STRATAGEM — "SEEN THROUGH!" (计谋被识破！)
  if (roll >= odds.chance) {
    const targetUnit = getUnitAt(state, targetRow, targetCol);
    const enemyRep =
      (targetUnit && targetUnit.side !== caster.side ? targetUnit : undefined) ||
      state.units
        .filter((u) => !u.defeated && u.side !== caster.side)
        .sort((a, b) => b.intellect - a.intellect)[0];

    const nextUnits = state.units.map((u) => {
      if (u.id === caster.id) return { ...u, hasActed: true };
      if (enemyRep && u.id === enemyRep.id) {
        return { ...u, morale: clamp(u.morale + 5, 0, 100) };
      }
      return u;
    });

    const callout: TacticalCallout = {
      id: nextTacId('call'),
      kind: 'seen_through',
      title: { en: 'STRATAGEM SEEN THROUGH!', zh: '计谋被识破！' },
      quote: {
        en: `“A shallow ruse! You cannot deceive ${enemyRep?.name.en || 'us'}!”`,
        zh: `「雕虫小技，岂能瞒过${enemyRep?.name.zh || '我军'}！」`,
      },
      subtitle: {
        en: `${caster.name.en}'s ${def.name.en} failed (${odds.chance}% INT odds). ${enemyRep?.name.en || 'Enemy'} +5 Morale!`,
        zh: `${caster.name.zh}施展【${def.name.zh}】被识破（成功率 ${odds.chance}%），${enemyRep?.name.zh || '敌军'}士气 +5！`,
      },
      side: enemyRep ? enemyRep.side : caster.side,
    };

    return {
      ...state,
      units: nextUnits,
      sp: nextSp,
      lastCallout: callout,
      logs: appendLog(state, caster.side, callout.subtitle),
    };
  }

  // SUCCESSFUL STRATAGEM!
  let nextGrid = state.grid.map((row) => row.map((t) => ({ ...t })));
  let nextUnits = state.units.map((u) => (u.id === caster.id ? { ...u, hasActed: true } : u));
  let subtitle: LocalizedText = { en: '', zh: '' };
  let calloutKind: TacticalCallout['kind'] = 'stratagem';

  if (stratagemId === 'fire_attack') {
    calloutKind = 'fire';
    const tile = nextGrid[targetRow][targetCol];
    if (!isStoneWorks(tile)) tile.fireTurns = 3;
    const wd = WIND_DELTA[state.wind];
    // Also ignite 1 tile downwind if it's a forest or bridge!
    const dr = targetRow + wd.dr;
    const dc = targetCol + wd.dc;
    if (
      inBounds(dr, dc) &&
      (nextGrid[dr][dc].type === 'forest' || nextGrid[dr][dc].type === 'bridge')
    ) {
      nextGrid[dr][dc].fireTurns = 3;
    }

    const hits = previewFireAttackHits(state, caster, targetRow, targetCol);
    const hitNames = hits.map((h) => h.unit.name.en);
    const hitNamesZh = hits.map((h) => h.unit.name.zh);
    const totalBurn = hits.reduce((sum, h) => sum + h.damage, 0);

    nextUnits = nextUnits.map((u) => {
      const hit = hits.find((h) => h.unit.id === u.id);
      if (!hit) return u;
      return applyDamageToUnit(
        state,
        u,
        hit.damage,
        moraleLossFromCasualties(hit.damage, u, hit.onPrimary ? 4 : 2),
        caster.side
      );
    });

    subtitle =
      hitNames.length > 0
        ? {
            en: `${caster.name.en} unleashed Fire Attack (${odds.chance}%), scorching ${hitNames.join(', ')} for ${totalBurn.toLocaleString()} casualties!`,
            zh: `${caster.name.zh}施展火攻成功（${odds.chance}%），烈焰席卷${hitNamesZh.join('、')}造成 ${totalBurn.toLocaleString()} 伤亡！`,
          }
        : {
            en: `${caster.name.en} set the battlefield ablaze (${odds.chance}%)! Flames will spread ${WIND_DELTA[state.wind].label.en}.`,
            zh: `${caster.name.zh}纵火点燃战地（${odds.chance}%），火势将随${WIND_DELTA[state.wind].label.zh}蔓延！`,
          };
  } else if (stratagemId === 'feign_disorder') {
    const target = nextUnits.find(
      (u) => !u.defeated && u.side !== caster.side && u.row === targetRow && u.col === targetCol
    );
    if (target) {
      const immune = target.wffmTurns > 0 && target.wffmStance === 'mountain';
      let curR = target.row;
      let curC = target.col;
      if (!immune) {
        // Pull 1-2 tiles closer to caster along walkable tiles!
        for (let step = 0; step < 2; step++) {
          const bestStep = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]
            .map(([dr, dc]) => ({ r: curR + dr, c: curC + dc }))
            .filter(
              (p) =>
                inBounds(p.r, p.c) &&
                getTileMoveCost(nextGrid[p.r][p.c], target) !== null &&
                !nextUnits.some((u) => !u.defeated && u.row === p.r && u.col === p.c) &&
                manhattan(p.r, p.c, caster.row, caster.col) <
                  manhattan(curR, curC, caster.row, caster.col)
            )
            .sort(
              (a, b) =>
                manhattan(a.r, a.c, caster.row, caster.col) -
                manhattan(b.r, b.c, caster.row, caster.col)
            )[0];
          if (!bestStep) break;
          curR = bestStep.r;
          curC = bestStep.c;
        }
      }
      let pulled = { ...target, row: curR, col: curC, luredDefDebuffTurns: 2 };
      // If lured straight into Blazing Fire, burn immediately!
      if (nextGrid[curR][curC].fireTurns > 0) {
        const burn = burnCasualties(pulled, 0.16);
        pulled = applyDamageToUnit(
          state,
          pulled,
          burn,
          moraleLossFromCasualties(burn, pulled, 4),
          caster.side
        );
      }
      nextUnits = nextUnits.map((u) => (u.id === target.id ? pulled : u));
      subtitle = {
        en: `${caster.name.en} lured ${target.name.en} out of formation (${odds.chance}%)! Target DEF -15%.`,
        zh: `${caster.name.zh}佯败诱敌成功（${odds.chance}%），${target.name.zh}中计冒进，防御 -15%！`,
      };
    }
  } else if (stratagemId === 'empty_fort_ambush') {
    const casterTile = nextGrid[caster.row][caster.col];
    const isEmptyFort = casterTile.type === 'gate' || casterTile.type === 'citadel';
    if (isEmptyFort) {
      let affected = 0;
      nextUnits = nextUnits.map((u) => {
        if (!u.defeated && u.side !== caster.side && manhattan(u.row, u.col, caster.row, caster.col) <= 3) {
          affected += 1;
          return {
            ...u,
            intimidatedTurns: 2,
            morale: clamp(u.morale - 12, 0, 100),
          };
        }
        return u;
      });
      subtitle = {
        en: `${caster.name.en} played the Empty Fort Ruse (${odds.chance}%)! ${affected} nearby enemy squads intimidated (-25% ATK, -1 Move)!`,
        zh: `${caster.name.zh}大开城门施展【空城计】（${odds.chance}%），震慑周围 ${affected} 支敌军（攻-25%、移动-1）！`,
      };
    } else {
      nextUnits = nextUnits.map((u) =>
        u.id === caster.id ? { ...u, isHiddenAmbush: true, hasActed: true } : u
      );
      subtitle = {
        en: `${caster.name.en} concealed their troops in Hidden Ambush (${odds.chance}%)! First adjacent foe takes +35% ambush damage.`,
        zh: `${caster.name.zh}布下十面埋伏（${odds.chance}%），首个逼近敌军将遭 +35% 伏兵奇袭！`,
      };
    }
  } else if (stratagemId === 'wffm') {
    const chosen: WffmStance = stance || 'fire';
    nextUnits = nextUnits.map((u) =>
      u.id === caster.id
        ? {
            ...u,
            wffmStance: chosen,
            wffmTurns: 2,
            isHiddenAmbush: chosen === 'forest' ? true : u.isHiddenAmbush,
            // Wind stance allows moving right after casting if not yet moved!
            hasActed: true,
          }
        : u
    );
    subtitle = {
      en: `${caster.name.en} adopted [${WFFM_STANCES[chosen].name.en}] (${odds.chance}%) — ${WFFM_STANCES[chosen].desc.en}!`,
      zh: `${caster.name.zh}展开军争之势【${WFFM_STANCES[chosen].name.zh}】（${odds.chance}%）——${WFFM_STANCES[chosen].desc.zh}！`,
    };
  } else if (stratagemId === 'death_ground') {
    nextUnits = nextUnits.map((u) =>
      u.id === caster.id
        ? { ...u, morale: 100, deathGroundTurns: 2, hasActed: true }
        : u
    );
    subtitle = {
      en: `${caster.name.en} swore a Death Ground oath (${odds.chance}%)! Morale 100, +40% ATK & unbreakable for 2 turns!`,
      zh: `${caster.name.zh}破釜沉舟【置之死地而后生】（${odds.chance}%）！士气回满100、攻击+40%且绝不溃退！`,
    };
  } else if (stratagemId === 'subdue_chaos') {
    const target = nextUnits.find(
      (u) => !u.defeated && u.side !== caster.side && u.row === targetRow && u.col === targetCol
    );
    if (target) {
      const mDrop = caster.intellect >= 90 ? 35 : 26;
      const updated = applyDamageToUnit(state, target, 0, mDrop, caster.side, { noEscape: true });
      const finalTarget = { ...updated, disorderedTurns: 2 };
      nextUnits = nextUnits.map((u) => (u.id === target.id ? finalTarget : u));
      subtitle = finalTarget.defeated
        ? {
            en: `${caster.name.en} broke ${target.name.en}'s will without bloodshed (${odds.chance}%) — ENEMY SURRENDERED!`,
            zh: `${caster.name.zh}【上兵伐谋】攻心为上（${odds.chance}%），${target.name.zh}士气崩溃、不战而降！`,
          }
        : {
            en: `${caster.name.en} sowed chaos in ${target.name.en} (${odds.chance}%): Disordered, -${mDrop} Morale, -20% DEF!`,
            zh: `${caster.name.zh}扰乱${target.name.zh}军心（${odds.chance}%）：陷入混乱、士气-${mDrop}、防御-20%！`,
          };
    }
  }

  const callout: TacticalCallout = {
    id: nextTacId('call'),
    kind: calloutKind,
    title: def.name,
    quote: def.quote,
    subtitle,
    side: caster.side,
  };

  return evaluateVictory({
    ...state,
    grid: nextGrid,
    units: nextUnits,
    sp: nextSp,
    lastCallout: callout,
    logs: appendLog(state, caster.side, subtitle),
  });
}

// ==================== HERO SIGNATURE SKILL, BLACK POWDER BOMB, RALLY & DUEL ====================

/** Signature skills that act on the caster's own position rather than a chosen tile. */
export function isSelfCenteredSkill(effect: General['signatureSkill']['effect']): boolean {
  return (
    effect === 'casualty_shield' ||
    effect === 'mandate_rally' ||
    effect === 'morale_shatter' ||
    effect === 'charisma_charm'
  );
}

/**
 * Tiles a squad may aim its hero's signature skill at right now. Empty when the skill is spent,
 * on campaign cooldown, held in reserve, or the squad has already acted.
 */
export function getHeroSkillTargetCoords(
  state: TacticalBattleState,
  unit: TacticalUnit
): GridCoord[] {
  if (unit.defeated || unit.hasActed || unit.skillUsed || unit.skillLocked || !unit.heroId) return [];
  const hero = state.preBattleHeroes[unit.heroId];
  if (!hero) return [];
  const eff = hero.signatureSkill.effect;
  if (isSelfCenteredSkill(eff)) return [{ row: unit.row, col: unit.col }];

  const isStorm = eff === 'fire_ignore_def' || eff === 'river_pierce';
  const maxRange = isStorm ? 3 : 2;
  const coords: GridCoord[] = [];
  for (let r = 0; r < TACTICAL_GRID_SIZE; r++) {
    for (let c = 0; c < TACTICAL_GRID_SIZE; c++) {
      const d = manhattan(unit.row, unit.col, r, c);
      if (d === 0 || d > maxRange) continue;
      const occupant = getUnitAt(state, r, c);
      if ((occupant && occupant.side !== unit.side) || eff === 'fire_ignore_def') {
        coords.push({ row: r, col: c });
      }
    }
  }
  return coords;
}

export function executeHeroSignatureSkill(
  state: TacticalBattleState,
  unitId: string,
  targetRow: number,
  targetCol: number
): TacticalBattleState {
  if (state.winner) return state;
  const caster = state.units.find((u) => u.id === unitId && !u.defeated);
  if (!caster || caster.side !== state.activeSide || !caster.heroId) return state;
  if (!getHeroSkillTargetCoords(state, caster).some((p) => p.row === targetRow && p.col === targetCol)) {
    return state;
  }

  const hero = state.preBattleHeroes[caster.heroId];
  if (!hero) return state;

  const sk = hero.signatureSkill;
  const nextGrid = state.grid.map((row) => row.map((t) => ({ ...t })));
  let nextUnits = state.units.map((u) =>
    u.id === caster.id ? { ...u, skillUsed: true, hasActed: true, isHiddenAmbush: false } : u
  );

  let totalDmg = 0;
  let hitCount = 0;
  const strength = squadStrengthFactor(caster);
  // Even a legendary blow lands softer on troops behind the city's works.
  const coverOf = (target: TacticalUnit) => 1 + rampartCoverAgainst(state, target, caster.side);

  if (sk.effect === 'fire_ignore_def' || sk.effect === 'river_pierce') {
    // 3-tile Fire / River Storm centered on target + downwind!
    const wd = WIND_DELTA[state.wind];
    const blastTiles: GridCoord[] = [
      { row: targetRow, col: targetCol },
      { row: targetRow + wd.dr, col: targetCol + wd.dc },
      { row: targetRow + wd.dc, col: targetCol + wd.dr },
    ].filter((p) => inBounds(p.row, p.col));

    for (const bt of blastTiles) {
      if (!isStoneWorks(nextGrid[bt.row][bt.col])) {
        nextGrid[bt.row][bt.col].fireTurns = 3;
      }
    }
    nextUnits = nextUnits.map((u) => {
      if (u.defeated || u.side === caster.side) return u;
      if (!blastTiles.some((bt) => bt.row === u.row && bt.col === u.col)) return u;
      const dmg = Math.min(u.troops, Math.round((1150 * (caster.intellect / 76) * strength) / coverOf(u)));
      totalDmg += dmg;
      hitCount += 1;
      return applyDamageToUnit(state, u, dmg, moraleLossFromCasualties(dmg, u, 6), caster.side);
    });
  } else if (sk.effect === 'morale_shatter' || sk.effect === 'charisma_charm') {
    // AoE Roar / Mandate Shockwave hitting enemies within range 2 of caster!
    nextUnits = nextUnits.map((u) => {
      if (u.defeated || u.side === caster.side) return u;
      if (manhattan(u.row, u.col, caster.row, caster.col) > 2) return u;
      const dmg = Math.min(
        u.troops,
        Math.round((880 * (Math.max(caster.war, caster.intellect) / 80) * strength) / coverOf(u))
      );
      totalDmg += dmg;
      hitCount += 1;
      // A morale-shattering roar is the one physical blow that also carries a heavy flat shock.
      const damaged = applyDamageToUnit(state, u, dmg, moraleLossFromCasualties(dmg, u, 12), caster.side);
      return { ...damaged, disorderedTurns: Math.max(1, damaged.disorderedTurns) };
    });
  } else if (sk.effect === 'casualty_shield' || sk.effect === 'mandate_rally') {
    // Rally & Heal all nearby allied squads within range 2!
    nextUnits = nextUnits.map((u) => {
      if (u.defeated || u.side !== caster.side) return u;
      if (manhattan(u.row, u.col, caster.row, caster.col) > 2) return u;
      hitCount += 1;
      return {
        ...u,
        morale: clamp(u.morale + 25, 0, 100),
        fortifiedTurns: 2,
        troops: Math.min(u.maxTroops, u.troops + Math.round(u.maxTroops * 0.12)),
      };
    });
  } else {
    // Vanguard Cleave / Siege Breaker: devastating blow on target + adjacent enemy!
    nextUnits = nextUnits.map((u) => {
      if (u.defeated || u.side === caster.side) return u;
      const isMain = u.row === targetRow && u.col === targetCol;
      const isCleave = manhattan(u.row, u.col, targetRow, targetCol) === 1;
      if (!isMain && !isCleave) return u;
      const dmg = Math.min(
        u.troops,
        Math.round(((isMain ? 1550 : 750) * (caster.war / 82) * strength) / coverOf(u))
      );
      totalDmg += dmg;
      hitCount += 1;
      return applyDamageToUnit(
        state,
        u,
        dmg,
        moraleLossFromCasualties(dmg, u, isMain ? 6 : 2),
        caster.side
      );
    });
  }

  const subtitle: LocalizedText =
    sk.effect === 'casualty_shield' || sk.effect === 'mandate_rally'
      ? {
          en: `${hero.name.en} unleashed [${sk.name.en}]! Rallied ${hitCount} allied squads (+25 Morale & +25% DEF)!`,
          zh: `${hero.name.zh}施展绝技【${sk.name.zh}】，鼓舞 ${hitCount} 支友军（士气+25、防御+25%）！`,
        }
      : {
          en: `${hero.name.en} unleashed [${sk.name.en}], inflicting ${totalDmg.toLocaleString()} casualties across ${hitCount} enemy squad(s)!`,
          zh: `${hero.name.zh}施展绝技【${sk.name.zh}】，重创 ${hitCount} 支敌军共 ${totalDmg.toLocaleString()} 人！`,
        };

  const callout: TacticalCallout = {
    id: nextTacId('call'),
    kind: 'skill',
    title: sk.name,
    quote: sk.battleCry,
    subtitle,
    side: caster.side,
  };

  return evaluateVictory({
    ...state,
    grid: nextGrid,
    units: nextUnits,
    lastCallout: callout,
    logs: appendLog(state, caster.side, subtitle),
  });
}

export function executeGunpowderBomb(
  state: TacticalBattleState,
  casterId: string,
  targetRow: number,
  targetCol: number
): TacticalBattleState {
  if (state.winner) return state;
  const caster = state.units.find((u) => u.id === casterId && !u.defeated);
  if (!caster || caster.side !== state.activeSide || caster.hasActed) return state;
  if (state.gunpowderBombsLeft[caster.side] <= 0) return state;
  if (!inBounds(targetRow, targetCol)) return state;
  if (manhattan(caster.row, caster.col, targetRow, targetCol) > 3) return state;

  const nextGrid = state.grid.map((row) => row.map((t) => ({ ...t })));
  const area: GridCoord[] = [
    { row: targetRow, col: targetCol },
    { row: targetRow + 1, col: targetCol },
    { row: targetRow, col: targetCol + 1 },
    { row: targetRow + 1, col: targetCol + 1 },
  ].filter((p) => inBounds(p.row, p.col));

  let wallsBreached = 0;
  for (const p of area) {
    const t = nextGrid[p.row][p.col];
    if (t.type === 'wall') {
      t.type = 'plains';
      wallsBreached += 1;
    }
    // Black powder tears a standing gate off its hinges outright.
    if (batterGate(nextGrid, p.row, p.col, t.gateHp ?? 0).breachedNow) {
      wallsBreached += 1;
    }
    if (t.type !== 'water' && !isStoneWorks(t)) {
      t.fireTurns = Math.max(t.fireTurns, 2);
    }
  }
  const breachedNow = wallsBreached > 0 && !state.breached;

  let totalDmg = 0;
  let nextUnits = state.units.map((u) => {
    if (u.id === caster.id) return { ...u, hasActed: true };
    if (u.defeated || u.side === caster.side) return u;
    if (!area.some((p) => p.row === u.row && p.col === u.col)) return u;
    const dmg = Math.min(u.troops, 1180);
    totalDmg += dmg;
    return applyDamageToUnit(state, u, dmg, moraleLossFromCasualties(dmg, u, 6), caster.side);
  });

  const subtitle: LocalizedText = {
    en: `BLACK POWDER BOMB! Shattered ${wallsBreached} wall/gate section(s), ignited 2×2 zone, and dealt ${totalDmg.toLocaleString()} blast casualties!${
      breachedNow ? ' The city is breached — the Citadel Flag can now be seized!' : ''
    }`,
    zh: `黑火药震天雷轰炸！炸塌 ${wallsBreached} 段城墙城门、引燃 2×2 区域，造成 ${totalDmg.toLocaleString()} 爆炸伤亡！${
      breachedNow ? '城防已破，可直取本阵大旗！' : ''
    }`,
  };

  const callout: TacticalCallout = {
    id: nextTacId('call'),
    kind: 'tech',
    title: { en: 'Black Powder Bomb (2×2 AoE)', zh: '黑火药震天雷（2×2 爆破）' },
    quote: {
      en: '“21st-century chemistry meets Han dynasty ramparts!”',
      zh: '「以现代雷火之威，轰开千年坚城！」',
    },
    subtitle,
    side: caster.side,
  };

  return evaluateVictory({
    ...state,
    grid: nextGrid,
    units: nextUnits,
    gunpowderBombsLeft: {
      ...state.gunpowderBombsLeft,
      [caster.side]: state.gunpowderBombsLeft[caster.side] - 1,
    },
    breached: state.breached || wallsBreached > 0,
    lastCallout: callout,
    logs: appendLog(state, caster.side, subtitle),
  });
}

export function executeRallyHold(
  state: TacticalBattleState,
  unitId: string
): TacticalBattleState {
  if (state.winner) return state;
  const unit = state.units.find((u) => u.id === unitId && !u.defeated);
  if (!unit || unit.side !== state.activeSide || unit.hasActed) return state;

  const hasMed = sideHasTech(state, unit.side, 'medicine');
  const heal = hasMed ? Math.round(unit.maxTroops * 0.08) : 0;

  const nextUnits = state.units.map((u) =>
    u.id === unitId
      ? {
          ...u,
          hasActed: true,
          fortifiedTurns: 2,
          morale: clamp(u.morale + 15, 0, 100),
          troops: Math.min(u.maxTroops, u.troops + heal),
        }
      : u
  );

  return {
    ...state,
    units: nextUnits,
    logs: appendLog(state, unit.side, {
      en: `${unit.name.en} rallied & fortified (+25% DEF, +15 Morale${heal > 0 ? `, +${heal} healed` : ''}).`,
      zh: `${unit.name.zh}鼓舞坚守（防御+25%、士气+15${heal > 0 ? `，现代军医救治+${heal}人` : ''}）。`,
    }),
  };
}

export function applyGridDuelResult(
  state: TacticalBattleState,
  attackerUnitId: string,
  defenderUnitId: string,
  duel: DuelResult
): TacticalBattleState {
  const atk = state.units.find((u) => u.id === attackerUnitId);
  const def = state.units.find((u) => u.id === defenderUnitId);
  if (!atk || !def) return state;

  let nextUnits = state.units.map((u) => {
    if (u.id === atk.id) {
      // A signature skill spent in single combat is spent for the rest of the battle.
      const base = { ...u, hasActed: true, skillUsed: u.skillUsed || duel.skillUsed };
      if (duel.winner === 'attacker') {
        return { ...base, morale: 100 };
      }
      if (duel.winner === 'defender') {
        return applyDamageToUnit(state, base, Math.round(u.maxTroops * 0.2), 28, def.side);
      }
      return base;
    }
    if (u.id === def.id) {
      if (duel.winner === 'attacker') {
        return applyDamageToUnit(state, u, Math.round(u.maxTroops * 0.32), 38, atk.side);
      }
      if (duel.winner === 'defender') {
        return { ...u, morale: 100 };
      }
    }
    return u;
  });

  const subtitle: LocalizedText =
    duel.winner === 'attacker'
      ? {
          en: `${atk.name.en} triumphed in single combat over ${def.name.en}, shattering enemy morale!`,
          zh: `${atk.name.zh}阵前单挑力挫${def.name.zh}，敌军士气大溃！`,
        }
      : duel.winner === 'defender'
        ? {
            en: `${def.name.en} bested ${atk.name.en} in single combat!`,
            zh: `${def.name.zh}阵前单挑胜出，己方士气大振！`,
          }
        : {
            en: `${atk.name.en} and ${def.name.en} fought to a fierce draw!`,
            zh: `${atk.name.zh}与${def.name.zh}大战数合，不分胜负！`,
          };

  const callout: TacticalCallout = {
    id: nextTacId('call'),
    kind: 'duel',
    title: { en: 'Battlefield Duel Resolved!', zh: '阵前单挑决胜！' },
    subtitle,
    side: duel.winner === 'defender' ? def.side : atk.side,
  };

  return evaluateVictory({
    ...state,
    units: nextUnits,
    duelUsedOnGrid: true,
    lastCallout: callout,
    logs: appendLog(state, 'system', subtitle),
  });
}

// ==================== END SIDE TURN & DOWNWIND FIRE PROPAGATION ====================

export function endTacticalSideTurn(
  state: TacticalBattleState,
  rng: () => number = Math.random
): TacticalBattleState {
  if (state.winner) return state;

  const finishingSide = state.activeSide;
  const nextSide: TacticalSide = finishingSide === 'attacker' ? 'defender' : 'attacker';
  const nextRound = finishingSide === 'defender' ? state.round + 1 : state.round;

  let nextGrid = state.grid.map((row) => row.map((t) => ({ ...t })));
  let nextUnits = state.units.map((u) => ({ ...u }));
  let nextLogs = state.logs;

  // At the end of each full round (after defender finishes), spread Blazing Fire downwind & burn units!
  if (finishingSide === 'defender') {
    const wd = WIND_DELTA[state.wind];
    const newlyIgnited: GridCoord[] = [];

    for (let r = 0; r < TACTICAL_GRID_SIZE; r++) {
      for (let c = 0; c < TACTICAL_GRID_SIZE; c++) {
        if (nextGrid[r][c].fireTurns > 0) {
          const nr = r + wd.dr;
          const nc = c + wd.dc;
          if (
            inBounds(nr, nc) &&
            nextGrid[nr][nc].fireTurns === 0 &&
            (nextGrid[nr][nc].type === 'forest' || nextGrid[nr][nc].type === 'bridge') &&
            rng() < 0.85
          ) {
            newlyIgnited.push({ row: nr, col: nc });
          }
          nextGrid[r][c].fireTurns = Math.max(0, nextGrid[r][c].fireTurns - 1);
        }
      }
    }

    for (const p of newlyIgnited) {
      nextGrid[p.row][p.col].fireTurns = 3;
    }

    if (newlyIgnited.length > 0) {
      nextLogs = appendLog(state, 'system', {
        en: `The ${WIND_DELTA[state.wind].label.en} fanned Blazing Fire across ${newlyIgnited.length} more tile(s)!`,
        zh: `${WIND_DELTA[state.wind].label.zh}助火势，烈焰蔓延至 ${newlyIgnited.length} 处新地格！`,
      });
    }

    // Apply burn damage to any squad standing on Blazing Fire!
    for (let i = 0; i < nextUnits.length; i++) {
      const u = nextUnits[i];
      if (u.defeated) continue;
      if (nextGrid[u.row][u.col].fireTurns > 0) {
        const burn = burnCasualties(u);
        nextUnits[i] = applyDamageToUnit(
          state,
          u,
          burn,
          moraleLossFromCasualties(burn, u),
          u.side === 'attacker' ? 'defender' : 'attacker'
        );
        nextLogs = appendLog({ ...state, logs: nextLogs }, 'system', {
          en: `${u.name.en} suffered ${burn.toLocaleString()} burn casualties in the flames!${routNote(nextUnits[i]).en}`,
          zh: `${u.name.zh}深陷火海，烧伤折损 ${burn.toLocaleString()} 兵马！${routNote(nextUnits[i]).zh}`,
        });
      }
    }
  }

  // Refresh next active side's units & decay timers
  nextUnits = nextUnits.map((u) => {
    if (u.side !== nextSide || u.defeated) return u;
    return {
      ...u,
      hasMoved: false,
      hasActed: false,
      disorderedTurns: Math.max(0, u.disorderedTurns - 1),
      intimidatedTurns: Math.max(0, u.intimidatedTurns - 1),
      luredDefDebuffTurns: Math.max(0, u.luredDefDebuffTurns - 1),
      fortifiedTurns: Math.max(0, u.fortifiedTurns - 1),
      deathGroundTurns: Math.max(0, u.deathGroundTurns - 1),
      wffmTurns: Math.max(0, u.wffmTurns - 1),
      wffmStance: u.wffmTurns <= 1 ? undefined : u.wffmStance,
    };
  });

  const nextSp = {
    ...state.sp,
    [nextSide]: Math.min(TACTICAL_MAX_SP, state.sp[nextSide] + 1),
  };

  return evaluateVictory({
    ...state,
    grid: nextGrid,
    units: nextUnits,
    round: nextRound,
    activeSide: nextSide,
    sp: nextSp,
    logs: nextLogs,
  });
}

// ==================== SMART ART OF WAR TACTICAL AI ====================

const CITADEL_TILE: GridCoord = { row: 3, col: 7 };

function intactGateCoords(state: TacticalBattleState): GridCoord[] {
  const coords: GridCoord[] = [];
  for (const row of state.grid) {
    for (const tile of row) {
      if (isIntactGate(tile)) coords.push({ row: tile.row, col: tile.col });
    }
  }
  return coords;
}

/** The flag needs a guard once the walls are breached or an attacker has slipped inside them. */
function isFlagThreatened(state: TacticalBattleState): boolean {
  if (state.breached) return true;
  return state.units.some((u) => !u.defeated && u.side === 'attacker' && u.col >= 6);
}

/**
 * Marching distance (in movement points, for this squad's terrain costs) from every tile to the
 * nearest goal tile. Real path distance - around rivers, walls and closed gates - so squads cross
 * at the bridges instead of piling up on the near bank.
 */
function marchDistanceMap(
  state: TacticalBattleState,
  unit: TacticalUnit,
  goals: GridCoord[]
): number[][] {
  const FAR = 99;
  const dist: number[][] = Array.from({ length: TACTICAL_GRID_SIZE }, () =>
    Array<number>(TACTICAL_GRID_SIZE).fill(FAR)
  );
  const queue: Array<{ row: number; col: number; d: number }> = [];
  for (const g of goals) {
    dist[g.row][g.col] = 0;
    queue.push({ row: g.row, col: g.col, d: 0 });
  }
  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d);
    const cur = queue.shift()!;
    if (cur.d > dist[cur.row][cur.col]) continue;
    // Walking from a neighbour into `cur` costs what it costs to enter `cur`.
    const enterCost = getTileMoveCost(state.grid[cur.row][cur.col], unit);
    if (enterCost === null) continue;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      if (!inBounds(nr, nc)) continue;
      if (getTileMoveCost(state.grid[nr][nc], unit) === null) continue;
      const nd = cur.d + enterCost;
      if (nd < dist[nr][nc]) {
        dist[nr][nc] = nd;
        queue.push({ row: nr, col: nc, d: nd });
      }
    }
  }
  return dist;
}

/** Where an attacking squad is trying to get to: the flag once the city is open, a gate until then. */
function attackerMarchGoals(state: TacticalBattleState, unit: TacticalUnit): GridCoord[] {
  if (state.breached) return [CITADEL_TILE];
  const goals: GridCoord[] = [];
  for (const gate of intactGateCoords(state)) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = gate.row + dr;
      const c = gate.col + dc;
      if (inBounds(r, c) && getTileMoveCost(state.grid[r][c], unit) !== null) goals.push({ row: r, col: c });
    }
  }
  return goals.length > 0 ? goals : [CITADEL_TILE];
}

/** How much the AI likes standing on a tile. Used for both candidate tiles and the squad's current one. */
function scoreAITile(
  state: TacticalBattleState,
  unit: TacticalUnit,
  row: number,
  col: number,
  enemies: TacticalUnit[],
  marchDist: number[][] | null
): number {
  const tile = state.grid[row][col];
  const side = unit.side;
  let score = 0;
  if (tile.fireTurns > 0) score -= 120;
  if (tile.type === 'hill') score += 22;
  if (tile.type === 'forest' && tile.fireTurns === 0) score += 14;
  if (tile.type === 'ford' && !unit.isNavalCapable) score -= 18;

  if (side === 'attacker') {
    // March on the flag once the city is open; until then the flag is worthless, so close on a gate.
    if (state.breached && tile.type === 'citadel') score += 500;
    if (marchDist) score -= marchDist[row][col] * 9;
    if (!state.breached) {
      const gates = intactGateCoords(state);
      const gateDist = Math.min(...gates.map((g) => manhattan(row, col, g.row, g.col)));
      const reach = unit.unitClass === 'archer' ? (tile.type === 'hill' ? 3 : 2) : 1;
      if (gateDist <= reach) score += 16;
    }
  } else {
    // Defenders fight from the works and do not chase into the open field.
    if (tile.type === 'wall' || tile.type === 'citadel' || isIntactGate(tile)) score += 90;
    if (col >= 5) score += 12;
    if (col < 4) score -= (4 - col) * 22;
    if (tile.type === 'citadel' && isFlagThreatened(state)) {
      const comradeOnFlag = state.units.some(
        (u) =>
          u.id !== unit.id &&
          !u.defeated &&
          u.side === side &&
          state.grid[u.row][u.col].type === 'citadel'
      );
      if (!comradeOnFlag) score += 300;
    }
  }

  // Distance to nearest enemy matched to unit class range
  if (enemies.length > 0) {
    const nearestDist = Math.min(...enemies.map((e) => manhattan(row, col, e.row, e.col)));
    if (unit.unitClass === 'archer') {
      score += nearestDist === 2 ? 32 : nearestDist === 1 ? -10 : -nearestDist * 5;
    } else {
      score += nearestDist === 1 ? 38 : -nearestDist * 8;
    }

    // Flanking bonus awareness!
    for (const e of enemies) {
      if (manhattan(row, col, e.row, e.col) === 1) {
        score += countAdjacentAlliesOf(state, e.row, e.col, side, unit.id) * 18;
      }
    }
  }

  return score;
}

/** Best place to drop a Black Powder Bomb, or null when nothing in range is worth one. */
function pickAIBombTarget(state: TacticalBattleState, unit: TacticalUnit): GridCoord | null {
  let best: GridCoord | null = null;
  let bestValue = 59; // must at least catch one enemy squad or open the city
  for (let r = 0; r < TACTICAL_GRID_SIZE; r++) {
    for (let c = 0; c < TACTICAL_GRID_SIZE; c++) {
      if (manhattan(unit.row, unit.col, r, c) > 3) continue;
      let value = 0;
      let ownWorksHit = false;
      for (const [dr, dc] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const tr = r + dr;
        const tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const tile = state.grid[tr][tc];
        const isWorks = tile.type === 'wall' || isIntactGate(tile);
        if (isWorks) {
          if (unit.side === 'defender') ownWorksHit = true;
          else value += isIntactGate(tile) ? (state.breached ? 30 : 100) : state.breached ? 10 : 40;
        }
        const occupant = getUnitAt(state, tr, tc);
        if (occupant) value += occupant.side === unit.side ? -80 : 60;
      }
      // A defender never blows up its own walls or gates.
      if (ownWorksHit) continue;
      if (value > bestValue) {
        bestValue = value;
        best = { row: r, col: c };
      }
    }
  }
  return best;
}

export function executeSingleAITurnStep(
  state: TacticalBattleState,
  rng: () => number = Math.random
): { state: TacticalBattleState; finishedSideTurn: boolean } {
  if (state.winner) return { state, finishedSideTurn: true };

  const side = state.activeSide;
  const readyUnit = state.units.find((u) => !u.defeated && u.side === side && !u.hasActed);

  if (!readyUnit) {
    return { state: endTacticalSideTurn(state, rng), finishedSideTurn: true };
  }

  let cur = state;
  let unit = readyUnit;

  // 1. Move to the best tactical tile, or hold position if nothing reachable beats where we stand
  if (!unit.hasMoved) {
    const reachable = getReachableTiles(cur, unit);
    const enemies = cur.units.filter((u) => !u.defeated && u.side !== side);
    if (reachable.length > 0 && enemies.length > 0) {
      const marchDist =
        side === 'attacker' ? marchDistanceMap(cur, unit, attackerMarchGoals(cur, unit)) : null;
      let bestTile: GridCoord | null = null;
      let bestScore = scoreAITile(cur, unit, unit.row, unit.col, enemies, marchDist);

      for (const tileCoord of reachable) {
        const score = scoreAITile(cur, unit, tileCoord.row, tileCoord.col, enemies, marchDist);
        if (score > bestScore) {
          bestScore = score;
          bestTile = tileCoord;
        }
      }

      if (bestTile) {
        cur = moveTacticalUnit(cur, unit.id, bestTile.row, bestTile.col);
        if (cur.winner) return { state: cur, finishedSideTurn: true };
        const refreshed = cur.units.find((u) => u.id === unit.id);
        if (!refreshed || refreshed.defeated || refreshed.hasActed) {
          return { state: cur, finishedSideTurn: false };
        }
        unit = refreshed;
      }
    }
  }

  // 2. Black Powder Bomb: open the gates/walls, or catch enemy squads (never our own works)
  if (cur.gunpowderBombsLeft[side] > 0) {
    const bombAt = pickAIBombTarget(cur, unit);
    if (bombAt) {
      cur = executeGunpowderBomb(cur, unit.id, bombAt.row, bombAt.col);
      return { state: cur, finishedSideTurn: Boolean(cur.winner) };
    }
  }

  // 3. Consider INT-driven Art of War Stratagem if SP available and success odds >= 58%!
  if (cur.sp[side] >= 1 && unit.disorderedTurns === 0) {
    // Priority A: Fire Attack on the enemy squad it would hurt most - but only when the flames
    // are expected to do at least as much as this squad's best direct blow would.
    const bestBlow = Math.max(
      0,
      ...getAttackTargets(cur, unit).map((t) => previewAttack(cur, unit, t).estimatedDamage)
    );
    const fireOption = getStratagemTargetCoords(cur, unit, 'fire_attack')
      .filter((p) => {
        const occ = getUnitAt(cur, p.row, p.col);
        return occ && occ.side !== side;
      })
      .map((p) => {
        const chance = calculateStratagemSuccess(cur, unit, 'fire_attack', p.row, p.col).chance;
        const damage = previewFireAttackHits(cur, unit, p.row, p.col).reduce((sum, h) => sum + h.damage, 0);
        return { p, chance, expected: (damage * chance) / 100 };
      })
      .sort((a, b) => b.expected - a.expected)[0];
    if (fireOption && fireOption.chance >= 60 && fireOption.expected >= bestBlow) {
      cur = executeArtOfWarStratagem(cur, unit.id, 'fire_attack', fireOption.p.row, fireOption.p.col, undefined, rng);
      return { state: cur, finishedSideTurn: Boolean(cur.winner) };
    }

    // Priority B: Subdue Without Fighting on low-morale enemy if high INT
    if (cur.sp[side] >= 2 && unit.intellect >= 78) {
      const chaosCoords = getStratagemTargetCoords(cur, unit, 'subdue_chaos');
      const shaken = chaosCoords
        .map((p) => getUnitAt(cur, p.row, p.col))
        .filter((u): u is TacticalUnit => Boolean(u))
        .sort((a, b) => a.morale - b.morale)[0];
      if (shaken && shaken.morale <= 65) {
        const odds = calculateStratagemSuccess(cur, unit, 'subdue_chaos', shaken.row, shaken.col);
        if (odds.chance >= 60) {
          cur = executeArtOfWarStratagem(cur, unit.id, 'subdue_chaos', shaken.row, shaken.col, undefined, rng);
          return { state: cur, finishedSideTurn: Boolean(cur.winner) };
        }
      }
    }

    // Priority C: Death Ground if wounded
    if (cur.sp[side] >= 2 && canUseDeathGround(cur, unit) && unit.deathGroundTurns === 0) {
      const odds = calculateStratagemSuccess(cur, unit, 'death_ground', unit.row, unit.col);
      if (odds.chance >= 62) {
        cur = executeArtOfWarStratagem(cur, unit.id, 'death_ground', unit.row, unit.col, undefined, rng);
        return { state: cur, finishedSideTurn: Boolean(cur.winner) };
      }
    }
  }

  // 4. Hero Signature Skill, a direct attack on the most valuable enemy in range, or the gate itself
  const targets = getAttackTargets(cur, unit);
  const skillAim = pickAISkillTarget(cur, unit, targets);
  if (skillAim) {
    cur = executeHeroSignatureSkill(cur, unit.id, skillAim.row, skillAim.col);
    return { state: cur, finishedSideTurn: Boolean(cur.winner) };
  }

  // Value of a blow on a squad: casualties, plus the damage it does to a gate the squad is holding.
  const valueOf = (t: TacticalUnit) => {
    const prev = previewAttack(cur, unit, t);
    // An enemy squad standing on our flag must be thrown off it before anything else.
    const onFlag = cur.grid[t.row][t.col].type === 'citadel' && side === 'defender' ? 50000 : 0;
    return onFlag + (prev.estimatedDamage >= t.troops ? 10000 : 0) + prev.estimatedDamage + prev.gateDamage;
  };
  const bestTarget = [...targets].sort((a, b) => valueOf(b) - valueOf(a))[0];

  // Value of battering an undefended gate: its damage, and a great deal if this blow opens the city.
  const gates = getGateAttackTargets(cur, unit).map((g) => ({
    coord: g,
    preview: previewGateAttack(cur, unit, g.row, g.col),
  }));
  const bestGate = gates.sort(
    (a, b) =>
      Number(b.preview.breaches) - Number(a.preview.breaches) ||
      a.preview.gateHpLeft - b.preview.gateHpLeft
  )[0];
  const gateValue = bestGate ? bestGate.preview.gateDamage + (bestGate.preview.breaches ? 10000 : 0) : -1;

  if (bestGate && (!bestTarget || gateValue > valueOf(bestTarget))) {
    cur = executeGateAttack(cur, unit.id, bestGate.coord.row, bestGate.coord.col);
    return { state: cur, finishedSideTurn: Boolean(cur.winner) };
  }
  if (bestTarget) {
    cur = executeTacticalAttack(cur, unit.id, bestTarget.id);
    return { state: cur, finishedSideTurn: Boolean(cur.winner) };
  }

  // 5. Fallback: Rally / Hold (or Wind stance to close distance faster!)
  if (cur.sp[side] >= 1 && unit.wffmTurns === 0 && unit.disorderedTurns === 0) {
    const stance: WffmStance = side === 'attacker' ? 'wind' : 'mountain';
    const odds = calculateStratagemSuccess(cur, unit, 'wffm', unit.row, unit.col);
    if (odds.chance >= 65) {
      cur = executeArtOfWarStratagem(cur, unit.id, 'wffm', unit.row, unit.col, stance, rng);
      return { state: cur, finishedSideTurn: false };
    }
  }

  cur = executeRallyHold(cur, unit.id);
  return { state: cur, finishedSideTurn: false };
}

/** Where (if anywhere) the AI should spend this squad's signature skill right now. */
function pickAISkillTarget(
  state: TacticalBattleState,
  unit: TacticalUnit,
  attackTargets: TacticalUnit[]
): GridCoord | null {
  const coords = getHeroSkillTargetCoords(state, unit);
  if (coords.length === 0 || !unit.heroId) return null;
  const effect = state.preBattleHeroes[unit.heroId]?.signatureSkill.effect;
  if (!effect) return null;
  const self: GridCoord = { row: unit.row, col: unit.col };

  if (effect === 'casualty_shield' || effect === 'mandate_rally') {
    // Rally & heal: worth it once a squad nearby (or our own) is hurt or wavering.
    const someoneNeedsIt = state.units.some(
      (u) =>
        !u.defeated &&
        u.side === unit.side &&
        manhattan(u.row, u.col, unit.row, unit.col) <= 2 &&
        (u.morale < 55 || u.troops < u.maxTroops * 0.65)
    );
    return someoneNeedsIt ? self : null;
  }

  if (effect === 'morale_shatter' || effect === 'charisma_charm') {
    const inRoar = state.units.filter(
      (u) => !u.defeated && u.side !== unit.side && manhattan(u.row, u.col, unit.row, unit.col) <= 2
    ).length;
    return inRoar >= 2 || (inRoar === 1 && state.round >= 2) ? self : null;
  }

  // Aimed skills: strike the largest enemy squad in reach once battle is joined.
  const aimed = coords
    .map((p) => ({ p, occupant: getUnitAt(state, p.row, p.col) }))
    .filter((x) => x.occupant && x.occupant.side !== unit.side)
    .sort((a, b) => b.occupant!.troops - a.occupant!.troops)[0];
  if (!aimed) return null;
  return state.round >= 2 || attackTargets.length >= 2 ? aimed.p : null;
}

/** Run remaining battle turns automatically via Tactical AI (for testing or instant finish). */
export function resolveTacticalBattleByAI(
  state: TacticalBattleState,
  rng: () => number = Math.random
): TacticalBattleState {
  let cur = state;
  let guard = 0;
  while (!cur.winner && guard < 240) {
    cur = executeSingleAITurnStep(cur, rng).state;
    guard += 1;
  }
  return cur;
}

// ==================== OUTCOME SUMMARY BUILDER ====================

export function extractTacticalBattleOutcome(state: TacticalBattleState): TacticalBattleOutcome {
  // Survivors = squads still on the field + routed squads that got away. Squads that were wiped
  // out or surrendered count for nothing.
  const survivorsOf = (side: TacticalSide) =>
    state.units
      .filter((u) => u.side === side)
      .reduce((sum, u) => sum + (u.defeated ? u.escapedTroops : u.troops), 0);
  const escapedOf = (side: TacticalSide) =>
    state.units
      .filter((u) => u.side === side && u.defeated)
      .reduce((sum, u) => sum + u.escapedTroops, 0);

  const attackerRemainingTroops = survivorsOf('attacker');
  const defenderRemainingTroops = survivorsOf('defender');

  const attackerLosses = Math.max(0, state.attackerStartTroops - attackerRemainingTroops);
  const defenderLosses = Math.max(0, state.defenderStartTroops - defenderRemainingTroops);
  const attackerWon = state.winner === 'attacker';

  const losingSide: TacticalSide = attackerWon ? 'defender' : 'attacker';
  const defeatedEnemyHeroIds = state.units
    .filter((u) => u.side === losingSide && u.defeated && u.heroId)
    .map((u) => u.heroId!);
  const surrenderedOrEncircledHeroIds = state.units
    .filter(
      (u) =>
        u.side === losingSide &&
        u.defeated &&
        u.heroId &&
        (u.surrendered || u.encircledWhenDefeated)
    )
    .map((u) => u.heroId!);

  const leadAtk = state.units.find((u) => u.side === 'attacker' && u.heroId);
  const deputyAtk = state.units.find(
    (u) => u.side === 'attacker' && u.heroId && u.heroId !== leadAtk?.heroId
  );
  const leadDef = state.units.find((u) => u.side === 'defender' && u.heroId);

  // Every hero who spent a signature skill goes on cooldown; the report credits an attacking hero only.
  const skillUsedHeroIds = state.units.filter((u) => u.skillUsed && u.heroId).map((u) => u.heroId!);
  const attackerSkillHero = state.units.find((u) => u.side === 'attacker' && u.skillUsed && u.heroId);
  const skillTriggered = attackerSkillHero?.heroId
    ? state.preBattleHeroes[attackerSkillHero.heroId]?.signatureSkill.name
    : undefined;

  return {
    config: state.config,
    attackerWon,
    attackerStartTroops: state.attackerStartTroops,
    defenderStartTroops: state.defenderStartTroops,
    attackerLosses,
    defenderLosses,
    attackerRemainingTroops,
    defenderRemainingTroops,
    attackerEscapedTroops: escapedOf('attacker'),
    defenderEscapedTroops: escapedOf('defender'),
    attackerGeneralId: leadAtk?.heroId,
    deputyGeneralId: deputyAtk?.heroId,
    defenderGeneralId: leadDef?.heroId,
    skillTriggered,
    skillUsedHeroIds,
    defeatedEnemyHeroIds,
    surrenderedOrEncircledHeroIds,
    roundsPlayed: Math.min(state.round, state.maxRounds),
    victoryReason: state.victoryReason || {
      en: attackerWon ? 'City captured in tactical combat!' : 'City defense held!',
      zh: attackerWon ? '阵前决战大获全胜，攻克城池！' : '阵前坚守大捷，击退敌军！',
    },
  };
}
