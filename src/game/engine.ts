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
import type {
  AITurnAction,
  BattleReport,
  ChronicleEntry,
  City,
  DiplomaticStatus,
  FactionId,
  GameState,
  General,
  LocalizedText,
  PlayableFactionId,
  Season,
  TacticId,
} from './types.js';

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

let idCounter = 1;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
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
    category: 'system',
    faction: playerFaction,
    text: {
      en: `214 AD — The realm stands divided among Wei, Shu, and Wu. You take command of ${player.name.en} under ${player.rulerName.en}. Capture ${VICTORY_CITY_TARGET} cities to unify China.`,
      zh: `建安十九年（214年）春，天下三分之势已成。主公执掌${player.name.zh}（${player.rulerName.zh}），攻克 ${VICTORY_CITY_TARGET} 座城池即可一统天下！`,
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
    chronicle: [introEntry],
    lastBattle: null,
    recentMarches: [],
    winner: null,
    isPlayerDefeated: false,
  };
}

export function getFactionCities(state: GameState, faction: FactionId): City[] {
  return Object.values(state.cities).filter((c) => c.owner === faction);
}

export function getFactionTotalTroops(state: GameState, faction: FactionId): number {
  return getFactionCities(state, faction).reduce((sum, c) => sum + c.troops, 0);
}

export function getFactionIncome(state: GameState, faction: PlayableFactionId): {
  gold: number;
  food: number;
} {
  const cities = getFactionCities(state, faction);
  const multiplier = faction === 'wei' ? 1.2 : faction === 'wu' ? 1.1 : 1.0;

  let gold = 0;
  let food = 0;
  for (const city of cities) {
    gold += Math.round((city.baseGold + city.development * 45) * multiplier);
    food += Math.round((city.baseFood + city.development * 40) * multiplier);
  }
  return { gold, food };
}

export function getCityGenerals(state: GameState, cityId: string): General[] {
  const city = state.cities[cityId];
  if (!city) return [];
  return Object.values(state.generals).filter(
    (g) => g.cityId === cityId && g.faction === city.owner
  );
}

export function getFactionGenerals(state: GameState, faction: PlayableFactionId): General[] {
  return Object.values(state.generals).filter((g) => g.faction === faction);
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
  return [entry, ...state.chronicle].slice(0, 60);
}

export function checkVictoryState(state: GameState): GameState {
  const counts: Record<PlayableFactionId, number> = { wei: 0, shu: 0, wu: 0 };
  for (const city of Object.values(state.cities)) {
    if (city.owner !== 'neutral') {
      counts[city.owner] += 1;
    }
  }

  const nextFactions = { ...state.factions };
  let activePlayables: PlayableFactionId[] = [];
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

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: { ...state.factions, [factionId]: updatedFaction },
    cities: { ...state.cities, [cityId]: updatedCity },
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

  const goldCost = factionId === 'wei' ? Math.round(ACTION_COSTS.recruitGold * 0.85) : ACTION_COSTS.recruitGold;
  const foodCost = ACTION_COSTS.recruitFood;
  if (faction.gold < goldCost || faction.food < foodCost) return state;

  const bonus = city.development * 350;
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

function getBestGeneralInCity(state: GameState, cityId: string, faction: FactionId): General | undefined {
  if (faction === 'neutral') return undefined;
  const list = Object.values(state.generals).filter(
    (g) => g.cityId === cityId && g.faction === faction
  );
  if (list.length === 0) return undefined;
  return list.sort((a, b) => b.war + b.intellect + b.command - (a.war + a.intellect + a.command))[0];
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
  rng: () => number = Math.random
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
    (attackerGeneralId && state.generals[attackerGeneralId]?.faction === attackerFaction
      ? state.generals[attackerGeneralId]
      : undefined) || getBestGeneralInCity(state, fromCityId, attackerFaction);
  const defenderGeneral = getBestGeneralInCity(state, toCityId, defenderFaction);

  // Compute combat modifiers
  let atkMult = 1.0;
  let defMult = 1.0 + toCity.defense * 0.11;

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

  // General stat modifiers
  const statKey = TACTICS[tactic].statKey;
  if (attackerGeneral) {
    atkMult += (attackerGeneral[statKey] - 65) / 140;
    if (attackerGeneral.specialty === tactic) atkMult += 0.14;
  }
  if (defenderGeneral) {
    const defStat = (defenderGeneral.command + defenderGeneral.intellect) / 2;
    defMult += (defStat - 65) / 150;
  }

  // Subtle battle variance (0.92 - 1.08)
  const variance = 0.92 + rng() * 0.16;
  const atkPower = attackingTroops * Math.max(0.7, atkMult) * variance;
  const defPower = Math.max(1000, toCity.troops) * Math.max(0.8, defMult);

  const captured = atkPower > defPower;
  const ratio = atkPower / Math.max(1, defPower);

  let attackerLosses: number;
  let defenderLosses: number;

  if (captured) {
    const lossFactor = Math.min(0.62, Math.max(0.18, 0.5 / Math.sqrt(ratio)));
    const ambushReduction = tactic === 'ambush' ? 0.85 : 1.0;
    attackerLosses = Math.min(
      attackingTroops - 500,
      Math.round(attackingTroops * lossFactor * ambushReduction)
    );
    defenderLosses = toCity.troops;
  } else {
    const atkLossFactor = Math.min(0.75, Math.max(0.32, 0.58 / Math.max(0.5, ratio)));
    attackerLosses = Math.min(attackingTroops, Math.round(attackingTroops * atkLossFactor));
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

  // Move winning general to captured city; relocate defeated generals to friendly fallback city
  const updatedGenerals = { ...state.generals };
  if (captured && attackerGeneral) {
    updatedGenerals[attackerGeneral.id] = { ...attackerGeneral, cityId: toCityId };
  }
  if (captured && defenderFaction !== 'neutral') {
    const fallbackCity = Object.values(updatedCities).find(
      (c) => c.owner === defenderFaction && c.id !== toCityId
    );
    for (const g of Object.values(updatedGenerals)) {
      if (g.faction === defenderFaction && g.cityId === toCityId && fallbackCity) {
        updatedGenerals[g.id] = { ...g, cityId: fallbackCity.id };
      }
    }
  }

  // Diplomacy penalty if attacking a playable faction (breaks truce!)
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

  const atkNameEn = state.factions[attackerFaction].shortName.en;
  const atkNameZh = state.factions[attackerFaction].shortName.zh;
  const genStrEn = attackerGeneral ? `${attackerGeneral.name.en} led ` : '';
  const genStrZh = attackerGeneral ? `${attackerGeneral.name.zh}率` : '';
  const tacticName = TACTICS[tactic].name;

  const narrative: LocalizedText = captured
    ? {
        en: `${genStrEn}${atkNameEn} forces seized ${toCity.name.en} using ${tacticName.en}! (${attackerLosses.toLocaleString()} lost vs ${defenderLosses.toLocaleString()} enemy casualties).`,
        zh: `${genStrZh}${atkNameZh}军施以「${tacticName.zh}」奇谋，一举攻克${toCity.name.zh}！（我损 ${attackerLosses.toLocaleString()}，敌折 ${defenderLosses.toLocaleString()}）。`,
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
    defenderGeneralId: defenderGeneral?.id,
    tactic,
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
    cities: updatedCities,
    generals: updatedGenerals,
    diplomacy: updatedDiplomacy,
    lastBattle: report,
    recentMarches: [march, ...state.recentMarches].slice(0, 6),
    chronicle: appendChronicle(state, 'battle', narrative, attackerFaction),
  };

  return checkVictoryState(nextState);
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

  const nextScore = Math.max(-100, Math.min(100, rel.score + relationDelta));
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
      next = performAttackCity(
        state,
        factionId,
        city.id,
        target.id,
        send,
        action.tactic ?? 'assault',
        undefined,
        false
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

export function advanceSeason(state: GameState): GameState {
  const nextTurn = state.turn + 1;
  const seasonIdx = (SEASONS.indexOf(state.season) + 1) % SEASONS.length;
  const nextSeason = SEASONS[seasonIdx];
  const nextYear = seasonIdx === 0 ? state.year + 1 : state.year;

  // Collect seasonal taxes & food, pay mild troop upkeep
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

  // Tick down truces
  const nextDiplomacy = { ...state.diplomacy };
  for (const [key, rel] of Object.entries(nextDiplomacy)) {
    const nextTruce = Math.max(0, rel.truceTurnsLeft - 1);
    nextDiplomacy[key] = {
      ...rel,
      truceTurnsLeft: nextTruce,
      status: scoreToStatus(rel.score, nextTruce),
    };
  }

  // Slight natural garrison recovery in neutral cities
  const nextCities = { ...state.cities };
  for (const city of Object.values(nextCities)) {
    if (city.owner === 'neutral' && city.troops < 9000) {
      nextCities[city.id] = { ...city, troops: city.troops + 300 };
    }
  }

  return checkVictoryState({
    ...state,
    turn: nextTurn,
    year: nextYear,
    season: nextSeason,
    actionPoints: state.maxActionPoints,
    factions: nextFactions,
    cities: nextCities,
    diplomacy: nextDiplomacy,
  });
}
