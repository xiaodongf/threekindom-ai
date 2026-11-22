import {
  ACTION_COSTS,
  MAX_ACTION_POINTS,
  TACTICS,
  VICTORY_CITY_TARGET,
  createInitialCities,
  createInitialDiplomacy,
  createInitialFactions,
  createInitialGenerals,
  getDiplomacyKey,
} from './data.js';
import { pickSeasonalStoryEvent } from './events.js';
import { HERO_BONDS } from './heroes.js';
import { MODERN_TECHS } from './tech.js';
import type {
  AITurnAction,
  BattleReport,
  ChronicleEntry,
  City,
  DiplomaticStatus,
  DuelResult,
  DuelRoundLog,
  DuelStance,
  FactionId,
  GameState,
  General,
  HeroBond,
  HeroEncounterMode,
  LocalizedText,
  PlayableFactionId,
  Season,
  TacticId,
  TechId,
  TimelineStage,
} from './types.js';

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

let idCounter = 1;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function createNewGame(playerFaction: PlayableFactionId): GameState {
  const factions = createInitialFactions();
  const cities = createInitialCities();
  const generals = createInitialGenerals();
  const diplomacy = createInitialDiplomacy();
  const player = factions[playerFaction];

  const introEntry: ChronicleEntry = {
    id: nextId('log'),
    turn: 1,
    year: 214,
    season: 'spring',
    category: 'chrono',
    faction: playerFaction,
    text: {
      en: `214 AD — Your time machine lands in Late Han China! Pledging your future foresight and modern science to ${player.rulerName.en} of ${player.name.en}, you vow to reshape history and capture ${VICTORY_CITY_TARGET} commanderies. Beware the Butterfly Effect!`,
      zh: `建安十九年（214年）春，时空穿梭机将你送至汉末乱世！你携二十一世纪现代科技与史书先知投效${player.name.zh}${player.rulerName.zh}，誓夺 ${VICTORY_CITY_TARGET} 座城池一统天下——切记：逆天改命必引蝴蝶效应与朝堂猜忌！`,
    },
  };

  return {
    turn: 1,
    year: 214,
    season: 'spring',
    playerFaction,
    actionPoints: MAX_ACTION_POINTS,
    maxActionPoints: MAX_ACTION_POINTS,
    factions,
    cities,
    generals,
    diplomacy,
    chrono: {
      trust: 55,
      suspicion: 12,
      divergence: 5,
      innovationPoints: 1,
      techFrozenTurns: 0,
      coalitionActive: false,
      unlockedTechs: [],
      rivalTechs: { wei: [], shu: [], wu: [] },
      pendingTechCopies: [],
      triggeredEventIds: [],
    },
    activeEvent: null,
    chronicle: [introEntry],
    lastBattle: null,
    recentMarches: [],
    winner: null,
    isPlayerDefeated: false,
  };
}

// ==================== HERO & CHRONO QUERIES ====================

export function getTimelineStage(divergence: number): TimelineStage {
  if (divergence < 30) return 'sharp';
  if (divergence < 60) return 'distorted';
  return 'shattered';
}

export function canSeeHeroWeakness(state: GameState): boolean {
  return (
    state.chrono.divergence < 60 || state.chrono.unlockedTechs.includes('spyglass')
  );
}

export function getChronoInsightBonus(state: GameState): number {
  const stage = getTimelineStage(state.chrono.divergence);
  if (stage === 'sharp') return 0.18;
  if (stage === 'distorted') return 0.09;
  return state.chrono.unlockedTechs.includes('spyglass') ? 0.12 : 0;
}

export function getEffectiveMaxAP(state: GameState): number {
  let ap = MAX_ACTION_POINTS;
  if (state.chrono.trust >= 80) ap += 1;
  if (state.chrono.unlockedTechs.includes('balloon')) ap += 1;
  return ap;
}

export function factionHasTech(
  state: GameState,
  faction: FactionId,
  techId: TechId
): boolean {
  if (faction === 'neutral') return false;
  if (faction === state.playerFaction) {
    return state.chrono.unlockedTechs.includes(techId);
  }
  return state.chrono.rivalTechs[faction]?.includes(techId) ?? false;
}

export function getFactionCities(state: GameState, faction: FactionId): City[] {
  return Object.values(state.cities).filter((c) => c.owner === faction);
}

export function getFactionTotalTroops(state: GameState, faction: FactionId): number {
  return getFactionCities(state, faction).reduce((sum, c) => sum + c.troops, 0);
}

export function getCityGenerals(state: GameState, cityId: string): General[] {
  const city = state.cities[cityId];
  if (!city) return [];
  return Object.values(state.generals).filter(
    (g) => g.cityId === cityId && g.faction === city.owner && g.status === 'active'
  );
}

export function getCityWanderingHeroes(state: GameState, cityId: string): General[] {
  return Object.values(state.generals).filter(
    (g) => g.cityId === cityId && g.status === 'wandering'
  );
}

export function getFactionGenerals(state: GameState, faction: PlayableFactionId): General[] {
  return Object.values(state.generals).filter(
    (g) => g.faction === faction && (g.status === 'active' || g.status === 'wounded')
  );
}

export function getFactionPrisoners(state: GameState, faction: PlayableFactionId): General[] {
  return Object.values(state.generals).filter(
    (g) => g.status === 'captured' && g.capturedBy === faction
  );
}

export function getActiveBondsForHeroes(heroIds: string[]): HeroBond[] {
  const set = new Set(heroIds);
  return Object.values(HERO_BONDS).filter((bond) => {
    const count = bond.memberIds.filter((id) => set.has(id)).length;
    return count >= 2;
  });
}

export function getFactionIncome(
  state: GameState,
  faction: PlayableFactionId
): { gold: number; food: number } {
  const cities = getFactionCities(state, faction);
  const multiplier = faction === 'wei' ? 1.2 : faction === 'wu' ? 1.1 : 1.0;
  const foodTechMult = factionHasTech(state, faction, 'agriculture') ? 1.35 : 1.0;
  const goldTechMult = factionHasTech(state, faction, 'printing') ? 1.1 : 1.0;

  let gold = 0;
  let food = 0;
  for (const city of cities) {
    const stationed = getCityGenerals(state, city.id);
    const bestPol = stationed.reduce((max, g) => Math.max(max, g.politics), 50);
    const govBonus = 1 + Math.max(0, bestPol - 60) / 260; // up to +15% from top statesman!
    gold += Math.round((city.baseGold + city.development * 45) * multiplier * govBonus * goldTechMult);
    food += Math.round((city.baseFood + city.development * 40) * multiplier * govBonus * foodTechMult);
  }
  return { gold, food };
}

export function getRelation(
  state: GameState,
  a: PlayableFactionId,
  b: PlayableFactionId
) {
  return state.diplomacy[getDiplomacyKey(a, b)];
}

export function isTruceActive(
  state: GameState,
  a: PlayableFactionId,
  b: PlayableFactionId
): boolean {
  const rel = getRelation(state, a, b);
  return Boolean(rel && rel.truceTurnsLeft > 0);
}

export function scoreToStatus(score: number, truceTurnsLeft: number): DiplomaticStatus {
  if (truceTurnsLeft > 0) {
    return score >= 50 ? 'allied' : 'truce';
  }
  if (score <= -45) return 'war';
  if (score <= -15) return 'hostile';
  if (score >= 50) return 'allied';
  return 'neutral';
}

function appendChronicle(
  state: GameState,
  category: ChronicleEntry['category'],
  text: LocalizedText,
  faction?: FactionId
): ChronicleEntry[] {
  const entry: ChronicleEntry = {
    id: nextId('log'),
    turn: state.turn,
    year: state.year,
    season: state.season,
    category,
    faction,
    text,
  };
  return [entry, ...state.chronicle].slice(0, 80);
}

export function grantHeroXp(hero: General, amount: number): General {
  if (hero.level >= 5 || hero.status === 'executed') return hero;
  let xp = hero.xp + amount;
  let level = hero.level;
  let { war, intellect, command, politics, charisma } = hero;

  while (xp >= 100 && level < 5) {
    xp -= 100;
    level += 1;
    if (hero.archetype === 'vanguard') {
      war = Math.min(100, war + 2);
      command = Math.min(100, command + 2);
    } else if (hero.archetype === 'strategist') {
      intellect = Math.min(100, intellect + 2);
      politics = Math.min(100, politics + 2);
    } else if (hero.archetype === 'marshal') {
      command = Math.min(100, command + 2);
      war = Math.min(100, war + 1);
      intellect = Math.min(100, intellect + 1);
    } else {
      politics = Math.min(100, politics + 2);
      charisma = Math.min(100, charisma + 2);
    }
  }

  return { ...hero, level, xp, war, intellect, command, politics, charisma };
}

export function checkVictoryState(state: GameState): GameState {
  const counts: Record<PlayableFactionId, number> = { wei: 0, shu: 0, wu: 0 };
  for (const city of Object.values(state.cities)) {
    if (city.owner !== 'neutral') {
      counts[city.owner] += 1;
    }
  }

  const nextFactions = { ...state.factions };
  const activePlayables: PlayableFactionId[] = [];
  for (const fid of ['wei', 'shu', 'wu'] as PlayableFactionId[]) {
    const eliminated = counts[fid] === 0;
    nextFactions[fid] = { ...nextFactions[fid], isEliminated: eliminated };
    if (!eliminated) activePlayables.push(fid);
  }

  let winner: PlayableFactionId | null = state.winner;
  for (const fid of ['wei', 'shu', 'wu'] as PlayableFactionId[]) {
    if (counts[fid] >= VICTORY_CITY_TARGET) {
      winner = fid;
      break;
    }
  }
  if (!winner && activePlayables.length === 1) {
    winner = activePlayables[0];
  }

  const isPlayerDefeated = counts[state.playerFaction] === 0;

  return {
    ...state,
    factions: nextFactions,
    winner,
    isPlayerDefeated,
  };
}

// ==================== DOMESTIC ACTIONS ====================

export function performDevelopCity(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  consumeAP = true
): GameState {
  const city = state.cities[cityId];
  const faction = state.factions[factionId];
  if (!city || city.owner !== factionId || city.development >= 5) return state;
  if (consumeAP && state.actionPoints < 1) return state;
  if (faction.gold < ACTION_COSTS.developGold) return state;

  const updatedCity: City = { ...city, development: city.development + 1 };
  const updatedFaction = { ...faction, gold: faction.gold - ACTION_COSTS.developGold };

  // Grant XP to stationed governor
  const updatedGenerals = { ...state.generals };
  const governor = getCityGenerals(state, cityId).sort((a, b) => b.politics - a.politics)[0];
  if (governor) {
    updatedGenerals[governor.id] = grantHeroXp(governor, 25);
  }

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: { ...state.factions, [factionId]: updatedFaction },
    cities: { ...state.cities, [cityId]: updatedCity },
    generals: updatedGenerals,
    chronicle: appendChronicle(
      state,
      'economy',
      {
        en: `${faction.shortName.en} developed ${city.name.en} to Prosperity Lv.${updatedCity.development}.`,
        zh: `${faction.shortName.zh}治理${city.name.zh}内政，繁荣度提升至 ${updatedCity.development} 级。`,
      },
      factionId
    ),
  };
}

export function performFortifyCity(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  consumeAP = true
): GameState {
  const city = state.cities[cityId];
  const faction = state.factions[factionId];
  if (!city || city.owner !== factionId || city.defense >= 5) return state;
  if (consumeAP && state.actionPoints < 1) return state;
  if (faction.gold < ACTION_COSTS.fortifyGold) return state;

  const updatedCity: City = { ...city, defense: city.defense + 1 };
  const updatedFaction = { ...faction, gold: faction.gold - ACTION_COSTS.fortifyGold };

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: { ...state.factions, [factionId]: updatedFaction },
    cities: { ...state.cities, [cityId]: updatedCity },
    chronicle: appendChronicle(
      state,
      'economy',
      {
        en: `${faction.shortName.en} fortified ${city.name.en} walls to Defense Lv.${updatedCity.defense}.`,
        zh: `${faction.shortName.zh}加固${city.name.zh}城防，防卫等级升至 ${updatedCity.defense} 级。`,
      },
      factionId
    ),
  };
}

export function performRecruitTroops(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  consumeAP = true
): GameState {
  const city = state.cities[cityId];
  const faction = state.factions[factionId];
  if (!city || city.owner !== factionId) return state;
  if (consumeAP && state.actionPoints < 1) return state;

  const goldCost =
    factionId === 'wei' ? Math.round(ACTION_COSTS.recruitGold * 0.85) : ACTION_COSTS.recruitGold;
  const foodCost = ACTION_COSTS.recruitFood;
  if (faction.gold < goldCost || faction.food < foodCost) return state;

  const stationed = getCityGenerals(state, cityId);
  const charismaBonus = stationed.reduce((max, g) => Math.max(max, g.charisma), 60);
  const heroLevyBonus = Math.round(Math.max(0, charismaBonus - 60) * 18);

  const bonus = city.development * 350 + heroLevyBonus;
  const troopsAdded = ACTION_COSTS.recruitTroops + bonus;
  const updatedCity: City = { ...city, troops: city.troops + troopsAdded };
  const updatedFaction = {
    ...faction,
    gold: faction.gold - goldCost,
    food: faction.food - foodCost,
  };

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: { ...state.factions, [factionId]: updatedFaction },
    cities: { ...state.cities, [cityId]: updatedCity },
    chronicle: appendChronicle(
      state,
      'economy',
      {
        en: `${faction.shortName.en} levied +${troopsAdded.toLocaleString()} soldiers in ${city.name.en}.`,
        zh: `${faction.shortName.zh}于${city.name.zh}募兵 ${troopsAdded.toLocaleString()} 人，军势大振。`,
      },
      factionId
    ),
  };
}

export function performReinforceCity(
  state: GameState,
  factionId: PlayableFactionId,
  fromCityId: string,
  toCityId: string,
  troopsToSend: number,
  consumeAP = true
): GameState {
  const fromCity = state.cities[fromCityId];
  const toCity = state.cities[toCityId];
  if (!fromCity || !toCity) return state;
  if (fromCity.owner !== factionId || toCity.owner !== factionId) return state;
  if (!fromCity.neighbors.includes(toCityId)) return state;
  if (consumeAP && state.actionPoints < 1) return state;

  const maxSend = Math.max(0, fromCity.troops - 1500);
  const actual = Math.min(Math.max(500, Math.round(troopsToSend)), maxSend);
  if (actual <= 0) return state;

  const updatedCities = {
    ...state.cities,
    [fromCityId]: { ...fromCity, troops: fromCity.troops - actual },
    [toCityId]: { ...toCity, troops: toCity.troops + actual },
  };

  const march = {
    id: nextId('march'),
    fromCityId,
    toCityId,
    faction: factionId,
    type: 'reinforce' as const,
  };

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    cities: updatedCities,
    recentMarches: [march, ...state.recentMarches].slice(0, 6),
    chronicle: appendChronicle(
      state,
      'economy',
      {
        en: `${state.factions[factionId].shortName.en} marched ${actual.toLocaleString()} reinforcements from ${fromCity.name.en} to ${toCity.name.en}.`,
        zh: `${state.factions[factionId].shortName.zh}自${fromCity.name.zh}调遣 ${actual.toLocaleString()} 援军进驻${toCity.name.zh}。`,
      },
      factionId
    ),
  };
}

// ==================== HERO ACTIONS (1-AP RELOCATE, REWARD, ENCOUNTER, PRISONERS) ====================

export function performRelocateHero(
  state: GameState,
  factionId: PlayableFactionId,
  heroId: string,
  targetCityId: string,
  consumeAP = true
): GameState {
  const hero = state.generals[heroId];
  const targetCity = state.cities[targetCityId];
  if (!hero || !targetCity) return state;
  if (hero.faction !== factionId || hero.status !== 'active') return state;
  if (targetCity.owner !== factionId || hero.cityId === targetCityId) return state;
  if (consumeAP && state.actionPoints < 1) return state;

  const updatedHero: General = { ...hero, cityId: targetCityId };

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    generals: { ...state.generals, [heroId]: updatedHero },
    chronicle: appendChronicle(
      state,
      'hero',
      {
        en: `${hero.name.en} relocated to ${targetCity.name.en} to take command.`,
        zh: `名将${hero.name.zh}奉调进驻${targetCity.name.zh}。`,
      },
      factionId
    ),
  };
}

export function performRewardHero(
  state: GameState,
  factionId: PlayableFactionId,
  heroId: string
): GameState {
  const hero = state.generals[heroId];
  const faction = state.factions[factionId];
  if (!hero || hero.faction !== factionId || hero.status === 'executed') return state;
  if (faction.gold < ACTION_COSTS.rewardHeroGold || hero.loyalty >= 100) return state;

  const updatedHero: General = {
    ...hero,
    loyalty: clamp(hero.loyalty + 15, 0, 100),
  };

  return {
    ...state,
    factions: {
      ...state.factions,
      [factionId]: { ...faction, gold: faction.gold - ACTION_COSTS.rewardHeroGold },
    },
    generals: { ...state.generals, [heroId]: updatedHero },
    chrono: {
      ...state.chrono,
      trust: clamp(state.chrono.trust + 1, 0, 100),
    },
    chronicle: appendChronicle(
      state,
      'hero',
      {
        en: `Rewarded ${hero.name.en} with silk and gold (Loyalty → ${updatedHero.loyalty}).`,
        zh: `重赏${hero.name.zh}金帛美酒，忠诚度升至 ${updatedHero.loyalty}。`,
      },
      factionId
    ),
  };
}

export function applyHeroEncounterOutcome(
  state: GameState,
  heroId: string,
  mode: HeroEncounterMode,
  outcome: 'join' | 'impressed' | 'refuse' | 'bonded',
  loyaltyDelta: number,
  trustDelta: number,
  divergenceDelta: number,
  giftGold: number,
  summaryText: LocalizedText
): GameState {
  const hero = state.generals[heroId];
  if (!hero) return state;

  const player = state.playerFaction;
  const playerFaction = state.factions[player];
  const capital =
    getFactionCities(state, player).find((c) => c.isCapital) ||
    getFactionCities(state, player)[0];

  const consumeAP = mode === 'recruit' ? 1 : 0;
  if (consumeAP > 0 && state.actionPoints < consumeAP) return state;

  const actualGoldCost = Math.min(playerFaction.gold, Math.max(0, giftGold));
  const updatedFactions = {
    ...state.factions,
    [player]: { ...playerFaction, gold: playerFaction.gold - actualGoldCost },
  };

  let updatedHero: General = { ...hero };
  let extraSuspicion = divergenceDelta >= 6 ? 8 : 0;

  if (mode === 'recruit' && outcome === 'join') {
    const destCityId =
      state.cities[hero.cityId]?.owner === player ? hero.cityId : capital?.id || hero.cityId;
    updatedHero = {
      ...hero,
      faction: player,
      status: 'active',
      cityId: destCityId,
      loyalty: 84,
      capturedBy: undefined,
    };
  } else if (mode === 'persuade' && outcome === 'join') {
    updatedHero = {
      ...hero,
      faction: player,
      status: 'active',
      cityId: capital?.id || hero.cityId,
      loyalty: 74,
      capturedBy: undefined,
    };
  } else if (mode === 'chat') {
    const gain = hero.chattedThisTurn ? 0 : Math.max(2, loyaltyDelta || 3);
    updatedHero = {
      ...hero,
      loyalty: clamp(hero.loyalty + gain, 0, 100),
      chattedThisTurn: true,
    };
  } else {
    updatedHero = {
      ...hero,
      loyalty: clamp(hero.loyalty + loyaltyDelta, 0, 100),
    };
  }

  return {
    ...state,
    actionPoints: state.actionPoints - consumeAP,
    factions: updatedFactions,
    generals: { ...state.generals, [heroId]: updatedHero },
    chrono: {
      ...state.chrono,
      trust: clamp(state.chrono.trust + trustDelta, 0, 100),
      divergence: clamp(state.chrono.divergence + Math.max(0, divergenceDelta), 0, 100),
      suspicion: clamp(state.chrono.suspicion + extraSuspicion, 0, 100),
    },
    chronicle: appendChronicle(state, 'hero', summaryText, player),
  };
}

export function performPrisonerAction(
  state: GameState,
  heroId: string,
  action: 'ransom' | 'release' | 'execute'
): GameState {
  const hero = state.generals[heroId];
  const player = state.playerFaction;
  if (!hero || hero.status !== 'captured' || hero.capturedBy !== player) return state;

  const origFaction = hero.originalFaction;
  const fallbackReturnCity =
    origFaction !== 'neutral'
      ? getFactionCities(state, origFaction).find((c) => c.isCapital) ||
        getFactionCities(state, origFaction)[0]
      : undefined;

  const updatedGenerals = { ...state.generals };
  const updatedFactions = { ...state.factions };
  const updatedDiplomacy = { ...state.diplomacy };
  let nextChrono = { ...state.chrono };
  let logText: LocalizedText;

  if (action === 'ransom') {
    updatedFactions[player] = {
      ...updatedFactions[player],
      gold: updatedFactions[player].gold + ACTION_COSTS.ransomGold,
    };
    updatedGenerals[heroId] = {
      ...hero,
      status: fallbackReturnCity ? 'active' : 'wandering',
      faction: fallbackReturnCity ? origFaction : 'neutral',
      cityId: fallbackReturnCity?.id || hero.cityId,
      capturedBy: undefined,
    };
    logText = {
      en: `Ransomed ${hero.name.en} for +${ACTION_COSTS.ransomGold} Gold.`,
      zh: `放还俘将${hero.name.zh}，收取赎金 ${ACTION_COSTS.ransomGold} 金。`,
    };
  } else if (action === 'release') {
    updatedGenerals[heroId] = {
      ...hero,
      status: fallbackReturnCity ? 'active' : 'wandering',
      faction: fallbackReturnCity ? origFaction : 'neutral',
      cityId: fallbackReturnCity?.id || hero.cityId,
      capturedBy: undefined,
    };
    if (origFaction !== 'neutral' && origFaction !== player) {
      const key = getDiplomacyKey(player, origFaction);
      const rel = updatedDiplomacy[key];
      if (rel) {
        const nextScore = clamp(rel.score + 15, -100, 100);
        updatedDiplomacy[key] = {
          ...rel,
          score: nextScore,
          status: scoreToStatus(nextScore, rel.truceTurnsLeft),
        };
      }
    }
    for (const g of Object.values(updatedGenerals)) {
      if (g.faction === player && g.status === 'active') {
        updatedGenerals[g.id] = { ...g, loyalty: clamp(g.loyalty + 5, 0, 100) };
      }
    }
    nextChrono = {
      ...nextChrono,
      trust: clamp(nextChrono.trust + 4, 0, 100),
      suspicion: clamp(nextChrono.suspicion - 4, 0, 100),
    };
    logText = {
      en: `Released ${hero.name.en} with honor! Your benevolence echoes across China (+5 Loyalty to your heroes).`,
      zh: `义释名将${hero.name.zh}！仁义之名远播天下，麾下众将忠诚 +5。`,
    };
  } else {
    // EXECUTE (斩首) — Permanent removal + Sworn Vendettas (血海深仇)!
    updatedGenerals[heroId] = {
      ...hero,
      status: 'executed',
      capturedBy: undefined,
    };

    const vendettaNamesEn: string[] = [];
    const vendettaNamesZh: string[] = [];
    for (const g of Object.values(updatedGenerals)) {
      if (g.id === heroId || g.status === 'executed') continue;
      const sharesBond = g.bondIds.some((bid) => hero.bondIds.includes(bid));
      if (sharesBond && !g.vendettaAgainst.includes(player)) {
        updatedGenerals[g.id] = {
          ...g,
          vendettaAgainst: [...g.vendettaAgainst, player],
          loyalty: g.faction === player ? clamp(g.loyalty - 30, 0, 100) : g.loyalty,
        };
        vendettaNamesEn.push(g.name.en);
        vendettaNamesZh.push(g.name.zh);
      }
    }

    if (origFaction !== 'neutral' && origFaction !== player) {
      const key = getDiplomacyKey(player, origFaction);
      const rel = updatedDiplomacy[key];
      if (rel) {
        const nextScore = clamp(rel.score - 35, -100, 100);
        updatedDiplomacy[key] = {
          ...rel,
          score: nextScore,
          truceTurnsLeft: 0,
          status: 'war',
        };
      }
    }

    nextChrono = {
      ...nextChrono,
      divergence: clamp(nextChrono.divergence + 12, 0, 100),
      suspicion: clamp(nextChrono.suspicion + 10, 0, 100),
    };

    const vendettaNoteEn = vendettaNamesEn.length
      ? ` SWORN VENDETTA ignited in ${vendettaNamesEn.slice(0, 3).join(', ')} (+20% combat vs you)!`
      : '';
    const vendettaNoteZh = vendettaNamesZh.length
      ? ` 【血海深仇】${vendettaNamesZh.slice(0, 3).join('、')}誓死复仇（对你战力 +20%）！`
      : '';

    logText = {
      en: `Executed ${hero.name.en}! A dark shockwave rips across the timeline (+12% Divergence).${vendettaNoteEn}`,
      zh: `斩首名将${hero.name.zh}！乱世震动（历史偏移 +12%）。${vendettaNoteZh}`,
    };
  }

  return {
    ...state,
    factions: updatedFactions,
    generals: updatedGenerals,
    diplomacy: updatedDiplomacy,
    chrono: nextChrono,
    chronicle: appendChronicle(state, 'hero', logText, player),
  };
}

// ==================== MODERN TECH LAB ====================

export function getTechEffectiveGoldCost(
  techId: TechId,
  researcher?: General
): number {
  const base = MODERN_TECHS[techId].goldCost;
  if (!researcher) return base;
  const bestMind = Math.max(researcher.intellect, researcher.politics);
  if (bestMind >= 90) return Math.round(base * 0.8);
  if (bestMind >= 78) return Math.round(base * 0.9);
  return base;
}

export function performResearchTech(
  state: GameState,
  techId: TechId,
  researcherHeroId?: string
): GameState {
  const tech = MODERN_TECHS[techId];
  const player = state.playerFaction;
  const faction = state.factions[player];
  if (!tech) return state;
  if (state.chrono.techFrozenTurns > 0) return state;
  if (state.chrono.unlockedTechs.includes(techId)) return state;
  if (state.chrono.innovationPoints < tech.innovationCost) return state;

  const researcher =
    researcherHeroId && state.generals[researcherHeroId]?.faction === player
      ? state.generals[researcherHeroId]
      : undefined;
  const goldCost = getTechEffectiveGoldCost(techId, researcher);
  if (faction.gold < goldCost) return state;

  const updatedGenerals = { ...state.generals };
  if (researcher) {
    updatedGenerals[researcher.id] = grantHeroXp(researcher, 45);
  }
  // Medicine immediately heals all wounded player heroes!
  if (techId === 'medicine') {
    for (const g of Object.values(updatedGenerals)) {
      if (g.faction === player && g.status === 'wounded') {
        updatedGenerals[g.id] = { ...g, status: 'active', woundedTurns: 0 };
      }
    }
  }

  // Schedule Hardcore Rival Reverse-Engineering if copyable!
  const nextPendingCopies = [...state.chrono.pendingTechCopies];
  if (tech.copyableByRivals) {
    const rivals = (['wei', 'shu', 'wu'] as PlayableFactionId[])
      .filter((fid) => fid !== player && !state.factions[fid].isEliminated)
      .sort((a, b) => getFactionCities(state, b).length - getFactionCities(state, a).length);
    const topRival = rivals[0];
    if (
      topRival &&
      !state.chrono.rivalTechs[topRival].includes(techId) &&
      !nextPendingCopies.some((p) => p.factionId === topRival && p.techId === techId)
    ) {
      nextPendingCopies.push({ factionId: topRival, techId, turnsRemaining: 2 });
    }
  }

  const nextDivergence = clamp(state.chrono.divergence + tech.divergenceGain, 0, 100);
  const nextSuspicion = clamp(state.chrono.suspicion + tech.suspicionGain, 0, 100);
  const nextTrust = clamp(state.chrono.trust + 5, 0, 100);

  const nextState: GameState = {
    ...state,
    factions: {
      ...state.factions,
      [player]: { ...faction, gold: faction.gold - goldCost },
    },
    generals: updatedGenerals,
    chrono: {
      ...state.chrono,
      innovationPoints: state.chrono.innovationPoints - tech.innovationCost,
      unlockedTechs: [...state.chrono.unlockedTechs, techId],
      divergence: nextDivergence,
      suspicion: nextSuspicion,
      trust: nextTrust,
      pendingTechCopies: nextPendingCopies,
    },
    chronicle: appendChronicle(
      state,
      'chrono',
      {
        en: `Modern Tech Breakthrough: ${tech.name.en} engineered${researcher ? ` with ${researcher.name.en}` : ''}! (Divergence ${nextDivergence}%, Suspicion ${nextSuspicion}).`,
        zh: `格物工坊突破：成功研造【${tech.name.zh}】${researcher ? `（${researcher.name.zh}主研）` : ''}！（历史偏移 ${nextDivergence}%，猜忌 ${nextSuspicion}）。`,
      },
      player
    ),
  };

  const newMaxAP = getEffectiveMaxAP(nextState);
  return {
    ...nextState,
    maxActionPoints: newMaxAP,
    actionPoints: techId === 'balloon' ? nextState.actionPoints + 1 : nextState.actionPoints,
  };
}

// ==================== INTERACTIVE 3-ROUND HERO DUEL ====================

export function pickEnemyDuelStance(
  defender: General,
  round: number,
  rng: () => number = Math.random
): DuelStance {
  if (round === 2 && defender.skillCooldown === 0 && rng() > 0.35) {
    return 'skill';
  }
  const r = rng();
  if (defender.archetype === 'vanguard') {
    return r < 0.55 ? 'strike' : r < 0.8 ? 'feint' : 'guard';
  }
  if (defender.archetype === 'strategist') {
    return r < 0.5 ? 'feint' : r < 0.85 ? 'guard' : 'strike';
  }
  return r < 0.4 ? 'strike' : r < 0.7 ? 'feint' : 'guard';
}

export function resolveDuelRound(
  attacker: General,
  defender: General,
  round: number,
  playerStance: DuelStance,
  enemyStance: DuelStance,
  chronoInsightBonus: number
): DuelRoundLog {
  const atkBase = Math.round(14 + attacker.war * 0.24 + attacker.level * 1.5);
  const defBase = Math.round(14 + defender.war * 0.24 + defender.level * 1.5);

  let dmgToEnemy = atkBase;
  let dmgToPlayer = defBase;

  // Rock-paper-scissors triangle: strike > guard, feint > strike, guard > feint
  const beats = (a: DuelStance, b: DuelStance) =>
    (a === 'strike' && b === 'guard') ||
    (a === 'feint' && b === 'strike') ||
    (a === 'guard' && b === 'feint');

  if (playerStance === 'skill') {
    dmgToEnemy = Math.round(attacker.signatureSkill.duelDamage + attacker.war * 0.14);
    dmgToPlayer = Math.round(defBase * 0.72);
  } else if (playerStance === 'chrono_counter') {
    const mult = chronoInsightBonus > 0 ? 1.45 + chronoInsightBonus : 0.85;
    dmgToEnemy = Math.round((atkBase + attacker.intellect * 0.14) * mult);
    dmgToPlayer = Math.round(defBase * (chronoInsightBonus > 0 ? 0.45 : 1.0));
  } else if (beats(playerStance, enemyStance)) {
    dmgToEnemy = Math.round(atkBase * 1.4);
    dmgToPlayer = Math.round(defBase * 0.55);
  } else if (beats(enemyStance, playerStance)) {
    dmgToEnemy = Math.round(atkBase * 0.6);
    dmgToPlayer = Math.round(defBase * 1.35);
  }

  if (playerStance === 'guard') {
    dmgToPlayer = Math.round(dmgToPlayer * 0.52);
    dmgToEnemy = Math.round(dmgToEnemy * 0.65);
  }
  if (enemyStance === 'guard') {
    dmgToEnemy = Math.round(dmgToEnemy * 0.55);
    dmgToPlayer = Math.round(dmgToPlayer * 0.65);
  }
  if (enemyStance === 'skill') {
    dmgToPlayer = Math.round(defender.signatureSkill.duelDamage + defender.war * 0.12);
  }

  const summary: LocalizedText =
    playerStance === 'skill'
      ? {
          en: `${attacker.name.en} unleashes [${attacker.signatureSkill.name.en}]! "${attacker.signatureSkill.battleCry.en}" (-${dmgToEnemy} HP to ${defender.name.en}).`,
          zh: `${attacker.name.zh}施展绝技【${attacker.signatureSkill.name.zh}】！「${attacker.signatureSkill.battleCry.zh}」（敌损 ${dmgToEnemy} 气血）。`,
        }
      : playerStance === 'chrono_counter'
        ? {
            en: `Chrono-Insight Counter! Exploiting ${defender.name.en}'s historical flaw deals ${dmgToEnemy} damage!`,
            zh: `先知破招！精准洞穿${defender.name.zh}史书软肋，重创 ${dmgToEnemy} 气血！`,
          }
        : {
            en: `Round ${round}: ${attacker.name.en} deals ${dmgToEnemy} dmg while ${defender.name.en} strikes back for ${dmgToPlayer} dmg.`,
            zh: `第 ${round} 合：${attacker.name.zh}斩伤敌将 ${dmgToEnemy} 气血，${defender.name.zh}反击造成 ${dmgToPlayer} 损伤。`,
          };

  return {
    round,
    playerStance,
    enemyStance,
    playerDamage: dmgToEnemy,
    enemyDamage: dmgToPlayer,
    summary,
  };
}

// ==================== UPGRADED HERO-CENTRIC BATTLE RESOLUTION ====================

function getBestGeneralInCity(
  state: GameState,
  cityId: string,
  faction: FactionId
): General | undefined {
  if (faction === 'neutral') return undefined;
  const list = Object.values(state.generals).filter(
    (g) => g.cityId === cityId && g.faction === faction && g.status === 'active'
  );
  if (list.length === 0) return undefined;
  return list.sort(
    (a, b) => b.war + b.intellect + b.command - (a.war + a.intellect + a.command)
  )[0];
}

export interface AttackOptions {
  deputyGeneralId?: string;
  useSignatureSkill?: boolean;
  duelResult?: DuelResult;
}

export function performAttackCity(
  state: GameState,
  attackerFaction: PlayableFactionId,
  fromCityId: string,
  toCityId: string,
  troopsToSend: number,
  tactic: TacticId,
  attackerGeneralId?: string,
  consumeAP = true,
  rng: () => number = Math.random,
  options: AttackOptions = {}
): GameState {
  const fromCity = state.cities[fromCityId];
  const toCity = state.cities[toCityId];
  if (!fromCity || !toCity) return state;
  if (fromCity.owner !== attackerFaction || toCity.owner === attackerFaction) return state;
  if (!fromCity.neighbors.includes(toCityId)) return state;
  if (consumeAP && state.actionPoints < 1) return state;

  const maxSend = Math.max(0, fromCity.troops - 1000);
  const attackingTroops = Math.min(Math.max(1000, Math.round(troopsToSend)), maxSend);
  if (attackingTroops <= 0) return state;

  const defenderFaction = toCity.owner;
  const attackerGeneral =
    (attackerGeneralId &&
    state.generals[attackerGeneralId]?.faction === attackerFaction &&
    state.generals[attackerGeneralId]?.status === 'active'
      ? state.generals[attackerGeneralId]
      : undefined) || getBestGeneralInCity(state, fromCityId, attackerFaction);

  const deputyGeneral =
    options.deputyGeneralId &&
    options.deputyGeneralId !== attackerGeneral?.id &&
    state.generals[options.deputyGeneralId]?.faction === attackerFaction &&
    state.generals[options.deputyGeneralId]?.status === 'active'
      ? state.generals[options.deputyGeneralId]
      : undefined;

  const defenderGeneral = getBestGeneralInCity(state, toCityId, defenderFaction);

  // Compute combat modifiers
  let atkMult = 1.0;
  let defMult = 1.0 + toCity.defense * 0.11;
  let casualtyShield = 1.0;
  let plunderGold = 0;

  // Terrain & Tactic synergies
  if (tactic === 'assault' && toCity.terrain === 'plains') atkMult += 0.16;
  if (tactic === 'fire' && (toCity.terrain === 'river' || toCity.troops >= 10000)) atkMult += 0.2;
  if (tactic === 'ambush' && toCity.terrain === 'mountain') atkMult += 0.22;
  if (tactic === 'siege' && (toCity.terrain === 'fortress' || toCity.defense >= 4)) {
    atkMult += 0.18;
    defMult -= 0.14;
  }

  // Faction traits
  if (attackerFaction === 'shu' && attackerGeneral) atkMult += 0.15;
  if (defenderFaction === 'shu' && toCity.terrain === 'mountain') defMult += 0.16;
  if (attackerFaction === 'wu' && (tactic === 'fire' || toCity.terrain === 'river')) atkMult += 0.22;
  if (defenderFaction === 'wu' && toCity.terrain === 'river') defMult += 0.15;

  // Modern Tech bonuses (for BOTH player and reverse-engineering AI rivals!)
  if (tactic === 'assault' && factionHasTech(state, attackerFaction, 'stirrups')) atkMult += 0.18;
  if ((tactic === 'siege' || tactic === 'fire') && factionHasTech(state, attackerFaction, 'gunpowder')) {
    atkMult += 0.3;
    defMult -= 0.12;
  }
  if (tactic === 'ambush' && factionHasTech(state, attackerFaction, 'spyglass')) atkMult += 0.2;
  if (toCity.terrain === 'river' && factionHasTech(state, attackerFaction, 'steamship')) atkMult += 0.35;
  if (toCity.terrain === 'river' && factionHasTech(state, defenderFaction, 'steamship')) defMult += 0.25;
  if (factionHasTech(state, attackerFaction, 'balloon')) atkMult += 0.1;
  if (factionHasTech(state, attackerFaction, 'medicine')) casualtyShield *= 0.75;
  if (factionHasTech(state, defenderFaction, 'gunpowder')) defMult += 0.14;

  // Anti-Anomaly Grand Coalition resolve for rivals fighting the Time-Traveler
  if (state.chrono.coalitionActive) {
    if (attackerFaction !== state.playerFaction && defenderFaction === state.playerFaction) {
      atkMult += 0.12;
    }
    if (defenderFaction !== state.playerFaction && defenderFaction !== 'neutral') {
      defMult += 0.12;
    }
  }

  // General stat modifiers + Sworn Bonds + Vendettas + Chrono-Insight
  const statKey = TACTICS[tactic].statKey;
  if (attackerGeneral) {
    atkMult += (attackerGeneral[statKey] - 65) / 140 + (attackerGeneral.level - 1) * 0.03;
    if (attackerGeneral.specialty === tactic) atkMult += 0.14;
    if (defenderFaction !== 'neutral' && attackerGeneral.vendettaAgainst.includes(defenderFaction)) {
      atkMult += 0.2; // SWORN VENDETTA!
    }
  }
  if (deputyGeneral) {
    atkMult += Math.max(0.05, (deputyGeneral[statKey] - 60) / 280);
  }
  if (defenderGeneral) {
    const defStat = (defenderGeneral.command + defenderGeneral.intellect) / 2;
    defMult += (defStat - 65) / 150 + (defenderGeneral.level - 1) * 0.03;
    if (defenderGeneral.vendettaAgainst.includes(attackerFaction)) {
      defMult += 0.2;
    }
    // Player Time-Traveler exploiting defender's historical tactic flaw (decays with Butterfly Effect!)
    if (
      attackerFaction === state.playerFaction &&
      defenderGeneral.dossier.weakToTactic === tactic
    ) {
      atkMult += getChronoInsightBonus(state) * 0.75;
    }
  }

  // Active Sworn Bonds (Lead + Deputy or stationed comrades in origin city)
  const attackingHeroIds = [attackerGeneral?.id, deputyGeneral?.id].filter(Boolean) as string[];
  const bondsTriggered = getActiveBondsForHeroes(attackingHeroIds);
  for (const bond of bondsTriggered) {
    atkMult += bond.combatBonus;
  }

  // Signature Skill trigger
  let skillTriggered: LocalizedText | undefined;
  let usedSkillHeroId: string | undefined;
  if (
    attackerGeneral &&
    options.useSignatureSkill &&
    attackerGeneral.skillCooldown === 0
  ) {
    const sk = attackerGeneral.signatureSkill;
    skillTriggered = sk.name;
    usedSkillHeroId = attackerGeneral.id;
    atkMult += sk.powerBonus;
    if (sk.effect === 'fire_ignore_def' || sk.effect === 'siege_breaker') {
      defMult = Math.max(0.95, defMult - 0.28);
    } else if (sk.effect === 'morale_shatter' || sk.effect === 'charisma_charm') {
      defMult = Math.max(0.9, defMult - 0.22);
    } else if (sk.effect === 'casualty_shield' || sk.effect === 'ambush_reflect') {
      casualtyShield *= 0.62;
    } else if (sk.effect === 'river_pierce' && toCity.terrain === 'river') {
      defMult = Math.max(0.95, defMult - 0.24);
    } else if (sk.effect === 'raid_plunder') {
      plunderGold = 220;
    }
  }

  // Pre-Battle Duel Morale Swing
  if (options.duelResult) {
    atkMult += options.duelResult.moraleBonus;
  }

  const variance = 0.92 + rng() * 0.16;
  const atkPower = attackingTroops * Math.max(0.7, atkMult) * variance;
  const defPower = Math.max(1000, toCity.troops) * Math.max(0.8, defMult);

  const captured = atkPower > defPower;
  const ratio = atkPower / Math.max(1, defPower);

  let attackerLosses: number;
  let defenderLosses: number;

  if (captured) {
    const lossFactor = Math.min(0.62, Math.max(0.16, 0.48 / Math.sqrt(ratio)));
    const ambushReduction = tactic === 'ambush' ? 0.85 : 1.0;
    attackerLosses = Math.min(
      attackingTroops - 500,
      Math.round(attackingTroops * lossFactor * ambushReduction * casualtyShield)
    );
    defenderLosses = toCity.troops;
  } else {
    const atkLossFactor = Math.min(0.75, Math.max(0.3, 0.56 / Math.max(0.5, ratio)));
    attackerLosses = Math.min(
      attackingTroops,
      Math.round(attackingTroops * atkLossFactor * casualtyShield)
    );
    defenderLosses = Math.min(
      Math.max(0, toCity.troops - 600),
      Math.round(toCity.troops * Math.min(0.65, 0.42 * ratio))
    );
  }

  const survivingAttackers = Math.max(0, attackingTroops - attackerLosses);
  const updatedCities = { ...state.cities };
  updatedCities[fromCityId] = {
    ...fromCity,
    troops: fromCity.troops - attackingTroops + (captured ? 0 : survivingAttackers),
  };

  if (captured) {
    updatedCities[toCityId] = {
      ...toCity,
      owner: attackerFaction,
      troops: Math.max(1000, survivingAttackers),
      defense: Math.max(1, toCity.defense - 1),
    };
  } else {
    updatedCities[toCityId] = {
      ...toCity,
      troops: Math.max(500, toCity.troops - defenderLosses),
    };
  }

  const updatedGenerals = { ...state.generals };
  let capturedHeroId: string | undefined;
  let woundedHeroId: string | undefined;

  // Update attacker heroes (XP, cooldown, movement, duel wound)
  if (attackerGeneral) {
    let g = grantHeroXp(attackerGeneral, captured ? 55 : 22);
    if (usedSkillHeroId === g.id || options.duelResult?.skillUsed) {
      g = { ...g, skillCooldown: g.signatureSkill.cooldownTurns };
    }
    if (captured) {
      g = { ...g, cityId: toCityId, loyalty: clamp(g.loyalty + 3, 0, 100) };
    }
    if (options.duelResult?.winner === 'defender' && !factionHasTech(state, attackerFaction, 'medicine')) {
      g = { ...g, status: 'wounded', woundedTurns: 1 };
      woundedHeroId = g.id;
    }
    updatedGenerals[g.id] = g;
  }

  if (deputyGeneral) {
    let d = grantHeroXp(deputyGeneral, captured ? 38 : 15);
    if (captured) d = { ...d, cityId: toCityId };
    updatedGenerals[d.id] = d;
  }

  // Handle defending heroes on city capture: Capture Roll vs Retreat!
  if (captured && defenderFaction !== 'neutral') {
    const fallbackCity = Object.values(updatedCities).find(
      (c) => c.owner === defenderFaction && c.id !== toCityId
    );
    const defendersInCity = Object.values(updatedGenerals).filter(
      (g) => g.faction === defenderFaction && g.cityId === toCityId && g.status === 'active'
    );

    for (const defHero of defendersInCity) {
      const duelLost = options.duelResult?.winner === 'attacker' && options.duelResult.defenderHeroId === defHero.id;
      const captureChance = !fallbackCity ? 0.85 : duelLost ? 0.65 : 0.34;
      const immuneCapture = defHero.signatureSkill.effect === 'casualty_shield' && !duelLost;

      if (!capturedHeroId && !immuneCapture && rng() < captureChance) {
        capturedHeroId = defHero.id;
        updatedGenerals[defHero.id] = {
          ...defHero,
          status: 'captured',
          capturedBy: attackerFaction,
          loyalty: clamp(defHero.loyalty - 8, 0, 100),
        };
      } else if (fallbackCity) {
        updatedGenerals[defHero.id] = {
          ...defHero,
          cityId: fallbackCity.id,
          loyalty: clamp(defHero.loyalty - 5, 0, 100),
        };
      } else {
        updatedGenerals[defHero.id] = {
          ...defHero,
          faction: 'neutral',
          status: 'wandering',
          loyalty: 75,
        };
      }
    }
  } else if (defenderGeneral && options.duelResult?.winner === 'attacker') {
    updatedGenerals[defenderGeneral.id] = {
      ...defenderGeneral,
      status: 'wounded',
      woundedTurns: 1,
    };
  }

  // Diplomacy penalty if attacking a playable faction
  const updatedDiplomacy = { ...state.diplomacy };
  if (defenderFaction !== 'neutral') {
    const key = getDiplomacyKey(attackerFaction, defenderFaction);
    const rel = updatedDiplomacy[key];
    if (rel) {
      const nextScore = Math.max(-100, rel.score - (rel.truceTurnsLeft > 0 ? 45 : 22));
      updatedDiplomacy[key] = {
        ...rel,
        score: nextScore,
        truceTurnsLeft: 0,
        status: 'war',
      };
    }
  }

  // Plunder gold + Lord's Trust shifts
  const updatedFactions = { ...state.factions };
  if (plunderGold > 0) {
    updatedFactions[attackerFaction] = {
      ...updatedFactions[attackerFaction],
      gold: updatedFactions[attackerFaction].gold + plunderGold,
    };
  }

  let nextChrono = { ...state.chrono };
  if (attackerFaction === state.playerFaction) {
    nextChrono = {
      ...nextChrono,
      trust: clamp(nextChrono.trust + (captured ? 7 : -6), 0, 100),
      suspicion: clamp(nextChrono.suspicion + (captured ? -4 : 5), 0, 100),
      divergence: clamp(nextChrono.divergence + (captured ? 4 : 0), 0, 100),
    };
  } else if (defenderFaction === state.playerFaction && captured) {
    nextChrono = {
      ...nextChrono,
      trust: clamp(nextChrono.trust - 10, 0, 100),
      suspicion: clamp(nextChrono.suspicion + 6, 0, 100),
    };
  }

  const atkNameEn = state.factions[attackerFaction].shortName.en;
  const atkNameZh = state.factions[attackerFaction].shortName.zh;
  const genStrEn = attackerGeneral ? `${attackerGeneral.name.en} led ` : '';
  const genStrZh = attackerGeneral ? `${attackerGeneral.name.zh}率` : '';
  const tacticName = TACTICS[tactic].name;
  const capHero = capturedHeroId ? state.generals[capturedHeroId] : undefined;

  const narrative: LocalizedText = captured
    ? {
        en: `${genStrEn}${atkNameEn} forces seized ${toCity.name.en} (${tacticName.en})${skillTriggered ? ` with [${skillTriggered.en}]` : ''}!${capHero ? ` Captured ${capHero.name.en}!` : ''} (${attackerLosses.toLocaleString()} lost vs ${defenderLosses.toLocaleString()} enemy casualties).`,
        zh: `${genStrZh}${atkNameZh}军施以「${tacticName.zh}」${skillTriggered ? `并发动绝技【${skillTriggered.zh}】` : ''}，攻克${toCity.name.zh}！${capHero ? `生擒敌将${capHero.name.zh}！` : ''}（我损 ${attackerLosses.toLocaleString()}，敌折 ${defenderLosses.toLocaleString()}）。`,
      }
    : {
        en: `${genStrEn}${atkNameEn} assault on ${toCity.name.en} (${tacticName.en}) was repelled! (${attackerLosses.toLocaleString()} lost vs ${defenderLosses.toLocaleString()} defender losses).`,
        zh: `${genStrZh}${atkNameZh}军以「${tacticName.zh}」猛攻${toCity.name.zh}未克，收兵退回！（攻损 ${attackerLosses.toLocaleString()}，守折 ${defenderLosses.toLocaleString()}）。`,
      };

  const report: BattleReport = {
    id: nextId('battle'),
    turn: state.turn,
    attackerFaction,
    defenderFaction,
    fromCityId,
    toCityId,
    attackerGeneralId: attackerGeneral?.id,
    deputyGeneralId: deputyGeneral?.id,
    defenderGeneralId: defenderGeneral?.id,
    tactic,
    skillTriggered,
    bondsTriggered: bondsTriggered.map((b) => b.name),
    duelWinner: options.duelResult?.winner,
    capturedHeroId,
    woundedHeroId,
    attackerStartTroops: attackingTroops,
    defenderStartTroops: toCity.troops,
    attackerLosses,
    defenderLosses,
    captured,
    narrative,
  };

  const march = {
    id: nextId('march'),
    fromCityId,
    toCityId,
    faction: attackerFaction,
    type: 'attack' as const,
    captured,
  };

  const nextState: GameState = {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: updatedFactions,
    cities: updatedCities,
    generals: updatedGenerals,
    diplomacy: updatedDiplomacy,
    chrono: nextChrono,
    lastBattle: report,
    recentMarches: [march, ...state.recentMarches].slice(0, 6),
    chronicle: appendChronicle(state, 'battle', narrative, attackerFaction),
  };

  return checkVictoryState(nextState);
}

// ==================== STORY EVENTS & DIPLOMACY ====================

export function resolveStoryEventChoice(state: GameState, choiceId: string): GameState {
  const ev = state.activeEvent;
  if (!ev) return state;

  const player = state.playerFaction;
  const faction = state.factions[player];
  const updatedFactions = { ...state.factions };
  const updatedGenerals = { ...state.generals };
  let nextChrono = {
    ...state.chrono,
    triggeredEventIds: [...state.chrono.triggeredEventIds, ev.id],
  };

  let logText: LocalizedText = {
    en: `Resolved event: ${ev.title.en}.`,
    zh: `已处置事件：${ev.title.zh}。`,
  };

  const capital =
    getFactionCities(state, player).find((c) => c.isCapital) ||
    getFactionCities(state, player)[0];

  if (choiceId === 'demonstrate_science' && faction.gold >= 220) {
    updatedFactions[player] = { ...faction, gold: faction.gold - 220 };
    nextChrono.suspicion = clamp(nextChrono.suspicion - 25, 0, 100);
    nextChrono.trust = clamp(nextChrono.trust + 10, 0, 100);
    logText = {
      en: 'Your scientific demonstration hushed court skeptics! (Suspicion -25, Trust +10).',
      zh: '当庭演示格物实效，守旧群臣哑口无言！（猜忌 -25，信任 +10）。',
    };
  } else if (choiceId === 'halt_workshop') {
    nextChrono.techFrozenTurns = 1;
    nextChrono.suspicion = clamp(nextChrono.suspicion - 20, 0, 100);
    nextChrono.trust = clamp(nextChrono.trust + 4, 0, 100);
    logText = {
      en: 'Suspended the Modern Workshop for 1 season to cool court suspicion (-20 Suspicion).',
      zh: '暂封格物工坊一季以安朝堂（猜忌 -20，下季恢复研发）。',
    };
  } else if (choiceId === 'defy_court') {
    for (const g of Object.values(updatedGenerals)) {
      if (g.faction === player && g.status === 'active') {
        updatedGenerals[g.id] = { ...g, loyalty: clamp(g.loyalty - 6, 0, 100) };
      }
    }
    nextChrono.divergence = clamp(nextChrono.divergence + 8, 0, 100);
    nextChrono.suspicion = clamp(nextChrono.suspicion - 10, 0, 100);
    logText = {
      en: 'Defied conservative elders fiercely! Workshop stays open, though hero loyalty slipped (-6).',
      zh: '力排众议保全工坊，但保守众将微有不满（忠诚 -6，偏移 +8%）。',
    };
  } else if (choiceId === 'save_pangtong' && faction.gold >= 200) {
    updatedFactions[player] = { ...faction, gold: faction.gold - 200 };
    if (updatedGenerals.pangtong) {
      updatedGenerals.pangtong = {
        ...updatedGenerals.pangtong,
        faction: player,
        status: 'active',
        cityId: capital?.id || updatedGenerals.pangtong.cityId,
        loyalty: 92,
      };
    }
    nextChrono.divergence = clamp(nextChrono.divergence + 14, 0, 100);
    nextChrono.trust = clamp(nextChrono.trust + 12, 0, 100);
    nextChrono.suspicion = clamp(nextChrono.suspicion + 10, 0, 100);
    logText = {
      en: 'Averted Fallen Phoenix Slope! Stunned by your prophecy, Pang Tong ("Young Phoenix") pledges allegiance to your realm!',
      zh: '逆天改命！庞统避过落凤坡死劫，惊叹你的先知神算，率众投效我军！',
    };
  } else if (choiceId === 'observe_history') {
    nextChrono.suspicion = clamp(nextChrono.suspicion - 8, 0, 100);
    nextChrono.innovationPoints += 1;
    logText = {
      en: 'Kept a low profile around Fallen Phoenix Slope (-8 Suspicion, +1 Innovation).',
      zh: '谨守低调未轻泄天机（猜忌 -8，科技灵感 +1）。',
    };
  } else if (choiceId === 'cure_with_medicine' && ev.heroId && nextChrono.unlockedTechs.includes('medicine')) {
    const h = updatedGenerals[ev.heroId];
    if (h) {
      updatedGenerals[ev.heroId] = {
        ...h,
        intellect: Math.min(100, h.intellect + 3),
        loyalty: 100,
        status: 'active',
      };
    }
    nextChrono.trust = clamp(nextChrono.trust + 15, 0, 100);
    nextChrono.divergence = clamp(nextChrono.divergence + 12, 0, 100);
    logText = {
      en: `Modern Field Medicine miraculously cured ${updatedGenerals[ev.heroId]?.name.en}! (+3 Intellect, +15 Trust, +12% Divergence).`,
      zh: `现代医术妙手回春，救活${updatedGenerals[ev.heroId]?.name.zh}！（智力 +3，主公信任 +15，偏移 +12%）。`,
    };
  } else if (choiceId === 'rest_convalesce' && ev.heroId) {
    const cost = Math.min(faction.gold, 150);
    updatedFactions[player] = { ...faction, gold: faction.gold - cost };
    const h = updatedGenerals[ev.heroId];
    if (h) {
      updatedGenerals[ev.heroId] = { ...h, status: 'wounded', woundedTurns: 1 };
    }
    nextChrono.trust = clamp(nextChrono.trust + 4, 0, 100);
    logText = {
      en: `Ordered strict quarantine and rest for ${updatedGenerals[ev.heroId]?.name.en} (recovers next season).`,
      zh: `妥善照料${updatedGenerals[ev.heroId]?.name.zh}静养一季，病情已稳。`,
    };
  } else if (choiceId === 'embrace_chaos') {
    nextChrono.innovationPoints += 2;
    nextChrono.trust = clamp(nextChrono.trust + 10, 0, 100);
    logText = {
      en: 'Embraced the Shattered Timeline! (+2 Innovation Points, +10 Lord Trust).',
      zh: '既破史轨，自创千秋霸业！（科技灵感 +2，主公信任 +10）。',
    };
  } else if (choiceId === 'fortify_morale') {
    updatedFactions[player] = { ...faction, gold: faction.gold + 300 };
    for (const g of Object.values(updatedGenerals)) {
      if (g.faction === player && g.status === 'active') {
        updatedGenerals[g.id] = { ...g, loyalty: clamp(g.loyalty + 10, 0, 100) };
      }
    }
    logText = {
      en: 'Rallied all heroes for the coalition storm ahead (+10 Loyalty, +300 Gold).',
      zh: '大宴众将共抗合纵强敌！（全体武将忠诚 +10，军饷 +300 金）。',
    };
  } else if (choiceId === 'honor_banquet' && ev.heroId && faction.gold >= 150) {
    updatedFactions[player] = { ...faction, gold: faction.gold - 150 };
    const h = updatedGenerals[ev.heroId];
    if (h) updatedGenerals[ev.heroId] = { ...h, loyalty: clamp(h.loyalty + 20, 0, 100) };
    nextChrono.trust = clamp(nextChrono.trust + 5, 0, 100);
    nextChrono.suspicion = clamp(nextChrono.suspicion - 5, 0, 100);
    logText = {
      en: `Grand banquet won ${h?.name.en}'s unshakable devotion (+20 Loyalty).`,
      zh: `推心置腹赐宴重赏，${h?.name.zh}彻底归心（忠诚 +20）。`,
    };
  } else if (choiceId === 'double_agent' && ev.heroId) {
    updatedFactions[player] = { ...faction, gold: faction.gold + 200 };
    nextChrono.innovationPoints += 1;
    const h = updatedGenerals[ev.heroId];
    if (h) updatedGenerals[ev.heroId] = { ...h, loyalty: clamp(h.loyalty - 5, 0, 100) };
    logText = {
      en: 'Counter-trapped enemy spies for +200 Gold and +1 Innovation!',
      zh: '将计就计擒获敌谍，缴获 200 金并得 +1 灵感！',
    };
  }

  return {
    ...state,
    factions: updatedFactions,
    generals: updatedGenerals,
    chrono: nextChrono,
    activeEvent: null,
    chronicle: appendChronicle(state, 'chrono', logText, player),
  };
}

export function applyDiplomacyOutcome(
  state: GameState,
  fromFaction: PlayableFactionId,
  targetFaction: PlayableFactionId,
  relationDelta: number,
  truceTurns: number,
  giftGold: number,
  declareWar: boolean,
  summaryText: LocalizedText
): GameState {
  const key = getDiplomacyKey(fromFaction, targetFaction);
  const rel = state.diplomacy[key];
  if (!rel) return state;

  const nextScore = clamp(rel.score + relationDelta, -100, 100);
  const nextTruce = declareWar ? 0 : Math.max(rel.truceTurnsLeft, truceTurns);
  const nextStatus: DiplomaticStatus = declareWar
    ? 'war'
    : scoreToStatus(nextScore, nextTruce);

  const nextFactions = { ...state.factions };
  if (giftGold > 0 && nextFactions[fromFaction].gold >= giftGold) {
    nextFactions[fromFaction] = {
      ...nextFactions[fromFaction],
      gold: nextFactions[fromFaction].gold - giftGold,
    };
    nextFactions[targetFaction] = {
      ...nextFactions[targetFaction],
      gold: nextFactions[targetFaction].gold + giftGold,
    };
  }

  return {
    ...state,
    factions: nextFactions,
    diplomacy: {
      ...state.diplomacy,
      [key]: {
        ...rel,
        score: nextScore,
        truceTurnsLeft: nextTruce,
        status: nextStatus,
      },
    },
    chronicle: appendChronicle(state, 'diplomacy', summaryText, fromFaction),
  };
}

export function executeAITurnAction(
  state: GameState,
  factionId: PlayableFactionId,
  action: AITurnAction,
  proclamation?: string
): GameState {
  if (state.factions[factionId].isEliminated) return state;

  let next = state;
  const city = state.cities[action.cityId];

  if (action.type === 'attack' && city && city.owner === factionId && action.targetCityId) {
    const target = state.cities[action.targetCityId];
    if (
      target &&
      target.owner !== factionId &&
      city.neighbors.includes(target.id) &&
      city.troops >= 3500
    ) {
      const ratio = Math.min(0.8, Math.max(0.45, action.troopsRatio ?? 0.65));
      const send = Math.round(city.troops * ratio);
      const bestGen = getBestGeneralInCity(state, city.id, factionId);
      next = performAttackCity(
        state,
        factionId,
        city.id,
        target.id,
        send,
        action.tactic ?? 'assault',
        bestGen?.id,
        false,
        Math.random,
        { useSignatureSkill: Boolean(bestGen && bestGen.skillCooldown === 0) }
      );
    }
  } else if (action.type === 'reinforce' && city && city.owner === factionId && action.targetCityId) {
    const ratio = Math.min(0.6, Math.max(0.3, action.troopsRatio ?? 0.45));
    next = performReinforceCity(
      state,
      factionId,
      city.id,
      action.targetCityId,
      Math.round(city.troops * ratio),
      false
    );
  } else if (action.type === 'recruit' && city && city.owner === factionId) {
    next = performRecruitTroops(state, factionId, city.id, false);
  } else if (action.type === 'develop' && city && city.owner === factionId) {
    next = performDevelopCity(state, factionId, city.id, false);
  } else if (action.type === 'fortify' && city && city.owner === factionId) {
    next = performFortifyCity(state, factionId, city.id, false);
  }

  if (proclamation && proclamation.trim()) {
    const ruler = state.factions[factionId].rulerName;
    next = {
      ...next,
      chronicle: appendChronicle(
        next,
        'ai',
        {
          en: `${ruler.en}: "${proclamation}"`,
          zh: `${ruler.zh}诏曰：「${proclamation}」`,
        },
        factionId
      ),
    };
  }

  return next;
}

// ==================== SEASON ADVANCE + HARDCORE BUTTERFLY EFFECT ENGINE ====================

export function advanceSeason(state: GameState): GameState {
  const nextTurn = state.turn + 1;
  const seasonIdx = (SEASONS.indexOf(state.season) + 1) % SEASONS.length;
  const nextSeason = SEASONS[seasonIdx];
  const nextYear = seasonIdx === 0 ? state.year + 1 : state.year;

  let nextChronicle = [...state.chronicle];
  const pushLog = (category: ChronicleEntry['category'], text: LocalizedText, faction?: FactionId) => {
    nextChronicle = [
      {
        id: nextId('log'),
        turn: nextTurn,
        year: nextYear,
        season: nextSeason,
        category,
        faction,
        text,
      },
      ...nextChronicle,
    ].slice(0, 80);
  };

  // 1. Seasonal Taxes & Upkeep
  const nextFactions = { ...state.factions };
  for (const fid of ['wei', 'shu', 'wu'] as PlayableFactionId[]) {
    if (nextFactions[fid].isEliminated) continue;
    const income = getFactionIncome(state, fid);
    const totalTroops = getFactionTotalTroops(state, fid);
    const foodUpkeep = Math.round(totalTroops * 0.008);
    nextFactions[fid] = {
      ...nextFactions[fid],
      gold: nextFactions[fid].gold + income.gold,
      food: Math.max(0, nextFactions[fid].food + income.food - foodUpkeep),
    };
  }

  // 2. Tick down truces
  const nextDiplomacy = { ...state.diplomacy };
  for (const [key, rel] of Object.entries(nextDiplomacy)) {
    const nextTruce = Math.max(0, rel.truceTurnsLeft - 1);
    nextDiplomacy[key] = {
      ...rel,
      truceTurnsLeft: nextTruce,
      status: scoreToStatus(rel.score, nextTruce),
    };
  }

  // 3. Hero seasonal recovery, cooldowns, bond loyalty & low-trust drain
  const nextGenerals = { ...state.generals };
  const lowTrustDrain = state.chrono.trust <= 35 ? -4 : 0;

  for (const city of Object.values(state.cities)) {
    const activeIds = Object.values(nextGenerals)
      .filter((g) => g.cityId === city.id && g.faction === city.owner && g.status === 'active')
      .map((g) => g.id);
    const bonds = getActiveBondsForHeroes(activeIds);
    for (const bond of bonds) {
      for (const mid of bond.memberIds) {
        if (activeIds.includes(mid) && nextGenerals[mid]) {
          nextGenerals[mid] = {
            ...nextGenerals[mid],
            loyalty: clamp(nextGenerals[mid].loyalty + bond.loyaltyBonus, 0, 100),
          };
        }
      }
    }
  }

  for (const g of Object.values(nextGenerals)) {
    if (g.status === 'executed') continue;
    let nextG = {
      ...g,
      skillCooldown: Math.max(0, g.skillCooldown - 1),
      chattedThisTurn: false,
    };
    if (nextG.status === 'wounded') {
      const rem = Math.max(0, nextG.woundedTurns - 1);
      nextG = { ...nextG, woundedTurns: rem, status: rem === 0 ? 'active' : 'wounded' };
    }
    if (nextG.faction === state.playerFaction && nextG.status === 'active' && lowTrustDrain < 0) {
      nextG = { ...nextG, loyalty: clamp(nextG.loyalty + lowTrustDrain, 0, 100) };
    }
    nextGenerals[g.id] = nextG;
  }

  // 4. Hardcore Rival Tech Reverse-Engineering Countdown
  const nextRivalTechs = {
    wei: [...state.chrono.rivalTechs.wei],
    shu: [...state.chrono.rivalTechs.shu],
    wu: [...state.chrono.rivalTechs.wu],
  };
  const remainingCopies = [];
  for (const copy of state.chrono.pendingTechCopies) {
    if (nextFactions[copy.factionId].isEliminated) continue;
    if (copy.turnsRemaining <= 1) {
      if (!nextRivalTechs[copy.factionId].includes(copy.techId)) {
        nextRivalTechs[copy.factionId].push(copy.techId);
        const tech = MODERN_TECHS[copy.techId];
        const advisor = nextFactions[copy.factionId].advisorName;
        const fName = nextFactions[copy.factionId].shortName;
        pushLog(
          'chrono',
          {
            en: `ESPIONAGE ALERT! ${advisor.en} (${fName.en}) studied battlefield relics and reverse-engineered [${tech.name.en}]!`,
            zh: `敌国窃密警报！${fName.zh}军师${advisor.zh}拆解战场遗物，竟仿制出【${tech.name.zh}】！`,
          },
          copy.factionId
        );
      }
    } else {
      remainingCopies.push({ ...copy, turnsRemaining: copy.turnsRemaining - 1 });
    }
  }

  // 5. Hardcore Anti-Anomaly Grand Coalition Trigger
  let coalitionActive = state.chrono.coalitionActive;
  const playerCityCount = getFactionCities(state, state.playerFaction).length;
  const rivals = (['wei', 'shu', 'wu'] as PlayableFactionId[]).filter(
    (fid) => fid !== state.playerFaction && !nextFactions[fid].isEliminated
  );

  if (
    !coalitionActive &&
    rivals.length === 2 &&
    (state.chrono.divergence >= 60 ||
      playerCityCount >= 6 ||
      state.chrono.unlockedTechs.length >= 3)
  ) {
    coalitionActive = true;
    const rivalKey = getDiplomacyKey(rivals[0], rivals[1]);
    if (nextDiplomacy[rivalKey]) {
      nextDiplomacy[rivalKey] = {
        ...nextDiplomacy[rivalKey],
        score: 70,
        truceTurnsLeft: 5,
        status: 'allied',
      };
    }
    for (const r of rivals) {
      const pKey = getDiplomacyKey(state.playerFaction, r);
      if (nextDiplomacy[pKey]) {
        nextDiplomacy[pKey] = {
          ...nextDiplomacy[pKey],
          score: Math.min(nextDiplomacy[pKey].score, -65),
          truceTurnsLeft: 0,
          status: 'war',
        };
      }
    }
    pushLog('chrono', {
      en: `GRAND COALITION FORMED! Alarmed by your rapid rise & strange inventions, ${nextFactions[rivals[0]].shortName.en} and ${nextFactions[rivals[1]].shortName.en} unite to crush the "Chrono-Anomaly" (+12% rival resolve)!`,
      zh: `【天下合纵讨逆】震慑于你的异世科技与扩张势头，${nextFactions[rivals[0]].shortName.zh}与${nextFactions[rivals[1]].shortName.zh}放下旧怨结成联军，誓共讨天命异数（敌军战力 +12%）！`,
    });
  }

  // 6. Natural neutral garrison replenishment
  const nextCities = { ...state.cities };
  for (const city of Object.values(nextCities)) {
    if (city.owner === 'neutral' && city.troops < 9000) {
      nextCities[city.id] = { ...city, troops: city.troops + 300 };
    }
  }

  const nextChrono = {
    ...state.chrono,
    innovationPoints: state.chrono.innovationPoints + 1,
    techFrozenTurns: Math.max(0, state.chrono.techFrozenTurns - 1),
    suspicion: clamp(state.chrono.suspicion - 5, 0, 100),
    coalitionActive,
    rivalTechs: nextRivalTechs,
    pendingTechCopies: remainingCopies,
  };

  let nextState: GameState = checkVictoryState({
    ...state,
    turn: nextTurn,
    year: nextYear,
    season: nextSeason,
    factions: nextFactions,
    cities: nextCities,
    generals: nextGenerals,
    diplomacy: nextDiplomacy,
    chrono: nextChrono,
    chronicle: nextChronicle,
  });

  const maxAP = getEffectiveMaxAP(nextState);
  nextState = {
    ...nextState,
    maxActionPoints: maxAP,
    actionPoints: maxAP,
  };

  if (!nextState.winner && !nextState.isPlayerDefeated) {
    const storyEvent = pickSeasonalStoryEvent(nextState);
    if (storyEvent) {
      nextState = { ...nextState, activeEvent: storyEvent };
    }
  }

  return nextState;
}
