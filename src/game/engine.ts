import {
  ACTION_COSTS,
  COALITION_CITY_THRESHOLD,
  NEUTRAL_GARRISON_CAP,
  TACTICS,
  VICTORY_CITY_TARGET,
  YANGTZE_PORT_IDS,
  isWithinRiverStrike,
  ordersForRealmSize,
  createInitialCities,
  createInitialDiplomacy,
  createInitialFactions,
  createInitialGenerals,
  getDiplomacyKey,
} from './data.js';
import {
  ASPECT_MAX_LEVEL,
  DRILL_HELD_GAIN,
  DRILL_ORDER_GAIN,
  DRILL_SEASON_DRIFT,
  DRILL_VICTORY_GAIN,
  FOOD_PER_FARMING_LEVEL,
  GOLD_PER_TRADE_LEVEL,
  LEVY_PER_PROSPERITY,
  RAW_LEVY_DRILL,
  RELIEF_ORDER_GAIN,
  SUPPORT_AFTER_CONQUEST,
  SUPPORT_COST_BOMBARD,
  SUPPORT_COST_DISCORD,
  SUPPORT_COST_LEVY,
  SUPPORT_COST_RAID,
  SUPPORT_COST_SIEGE,
  SUPPORT_SEASON_DRIFT,
  cityProsperity,
  driftToward,
  drillMoraleBonus,
  drillOfficerBonus,
  mixDrill,
  reliefOfficerBonus,
  supportIncomeFactor,
  supportLevyFactor,
  supportRestingLevel,
  unrestDeserters,
} from './cityAspects.js';
import {
  WALL_SCAR_SEASONS,
  beginCityEvent,
  cityEventChronicle,
  eventIncomeFactor,
  rollCityEvent,
} from './cityEvents.js';
import { pickSeasonalStoryEvent } from './events.js';
import {
  GOVERNOR_FOCI,
  applyGovernorSeason,
  canGovern,
  getCityGovernor,
  governorPlanOf,
} from './governors.js';
import {
  factionHasTech,
  getActiveBondsForHeroes,
  getChronoInsightBonus,
  getCityGenerals,
  getTimelineStage,
} from './queries.js';
import {
  GATE_BASE_HP,
  GATE_HP_PER_DEFENSE,
  ASSAULT_PLAN_ATK,
  RAMPART_BASE_DEF,
  RAMPART_DEF_PER_LEVEL,
  SIEGE_PLAN_GATE_MULT,
  SIEGE_PLAN_RAMPART_FACTOR,
  createTacticalBattle,
  extractTacticalBattleOutcome,
  resolveTacticalBattleByAI,
} from './tacticalEngine.js';
import type { TacticalBattleConfig, TacticalBattleOutcome, TacticalSide } from './tacticalTypes.js';
import { MODERN_TECHS } from './tech.js';
import type {
  AITurnAction,
  BattleModifierTag,
  BattlePreview,
  BattleReport,
  ChronicleEntry,
  ChronoState,
  City,
  DiplomaticStatus,
  DuelResult,
  DuelRoundLog,
  DuelStance,
  FactionId,
  GameState,
  General,
  GovernorFocus,
  HeroEncounterMode,
  LocalizedText,
  MarchEvent,
  MultiplayerWorldMeta,
  OperationReport,
  PlayableFactionId,
  PlayerProfile,
  Season,
  TacticId,
  TechId,
} from './types.js';

// Shared read-only queries live in queries.ts; re-exported so callers keep importing from the engine.
export {
  factionHasTech,
  getActiveBondsForHeroes,
  getChronoInsightBonus,
  getCityGenerals,
  getTimelineStage,
};

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

let idCounter = 1;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function createDefaultPlayerProfile(avatar: 'male' | 'female' = 'male', name = ''): PlayerProfile {
  return {
    name: name.trim(),
    avatar,
    portrait: avatar === 'female' ? '/portraits/traveler_female.jpg' : '/portraits/traveler_male.jpg',
  };
}

export function createDefaultChronoState(): ChronoState {
  return {
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
  };
}

export function createNewGame(
  playerFaction: PlayableFactionId,
  playerProfile: PlayerProfile = createDefaultPlayerProfile()
): GameState {
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

  const startingOrders = ordersForRealmSize(
    Object.values(cities).filter((c) => c.owner === playerFaction).length
  );

  return {
    turn: 1,
    year: 214,
    season: 'spring',
    playerFaction,
    playerProfile,
    actionPoints: startingOrders,
    maxActionPoints: startingOrders,
    factions,
    cities,
    generals,
    diplomacy,
    chrono: createDefaultChronoState(),
    activeEvent: null,
    chronicle: [introEntry],
    lastBattle: null,
    lastOperation: null,
    recentMarches: [],
    winner: null,
    isPlayerDefeated: false,
  };
}

export function createMultiplayerGame(opts: {
  roomCode: string;
  roomName: string;
  humanFactions: PlayableFactionId[];
  factionProfiles: Partial<Record<PlayableFactionId, PlayerProfile>>;
}): GameState {
  const turnOrder: PlayableFactionId[] = ['wei', 'shu', 'wu'];
  const orderedHumans = turnOrder.filter((f) => opts.humanFactions.includes(f));
  const firstActive: PlayableFactionId = orderedHumans[0] ?? 'shu';

  const fullProfiles: Record<PlayableFactionId, PlayerProfile> = {
    wei: opts.factionProfiles.wei ?? createDefaultPlayerProfile('male', 'Wei Strategist'),
    shu: opts.factionProfiles.shu ?? createDefaultPlayerProfile('male', 'Shu Strategist'),
    wu: opts.factionProfiles.wu ?? createDefaultPlayerProfile('female', 'Wu Strategist'),
  };
  const factionChronos: Record<PlayableFactionId, ChronoState> = {
    wei: createDefaultChronoState(),
    shu: createDefaultChronoState(),
    wu: createDefaultChronoState(),
  };

  const base = createNewGame(firstActive, fullProfiles[firstActive]);
  const humanNamesEn = orderedHumans.map((f) => `${base.factions[f].shortName.en} (${fullProfiles[f].name || 'Strategist'})`).join(', ');
  const humanNamesZh = orderedHumans.map((f) => `${base.factions[f].shortName.zh}（${fullProfiles[f].name || '奇士'}）`).join('、');

  const mpIntro: ChronicleEntry = {
    id: nextId('log'),
    turn: 1,
    year: 214,
    season: 'spring',
    category: 'chrono',
    faction: firstActive,
    text: {
      en: `214 AD — Shared Timeline Rift! Multiple Time-Travelers descend upon China [${humanNamesEn}]. Capture ${VICTORY_CITY_TARGET} cities to claim the Mandate of Heaven!`,
      zh: `建安十九年（214年）春，群雄联机裂缝开启！多位天命奇士降临乱世【${humanNamesZh}】，夺取 ${VICTORY_CITY_TARGET} 座城池者一统天下！`,
    },
  };

  const mpMeta: MultiplayerWorldMeta = {
    roomCode: opts.roomCode,
    roomName: opts.roomName,
    humanFactions: orderedHumans.length > 0 ? orderedHumans : [firstActive],
    turnOrder,
    activeFaction: firstActive,
    factionChronos,
    factionProfiles: fullProfiles,
  };

  return {
    ...base,
    chrono: factionChronos[firstActive],
    chronicle: [mpIntro],
    multiplayer: mpMeta,
  };
}

/** Syncs the currently active faction's `chrono` and `playerProfile` into `state.multiplayer`. */
export function syncMultiplayerActiveFaction(state: GameState): GameState {
  if (!state.multiplayer) return state;
  const active = state.multiplayer.activeFaction;
  const prevChronos = state.multiplayer.factionChronos;
  const sharedDivergence = Math.max(
    state.chrono.divergence,
    prevChronos.wei.divergence,
    prevChronos.shu.divergence,
    prevChronos.wu.divergence
  );
  const nextChronos: Record<PlayableFactionId, ChronoState> = {
    wei: { ...prevChronos.wei, divergence: sharedDivergence },
    shu: { ...prevChronos.shu, divergence: sharedDivergence },
    wu: { ...prevChronos.wu, divergence: sharedDivergence },
  };
  nextChronos[active] = {
    ...state.chrono,
    divergence: sharedDivergence,
  };
  // If any tech was reverse-engineered into rivalTechs for another human seat, unlock it in their chrono too
  for (const fid of ['wei', 'shu', 'wu'] as PlayableFactionId[]) {
    const copied = state.chrono.rivalTechs[fid] ?? [];
    for (const tid of copied) {
      if (!nextChronos[fid].unlockedTechs.includes(tid)) {
        nextChronos[fid] = {
          ...nextChronos[fid],
          unlockedTechs: [...nextChronos[fid].unlockedTechs, tid],
        };
      }
    }
  }
  const nextProfiles: Record<PlayableFactionId, PlayerProfile> = {
    ...state.multiplayer.factionProfiles,
    [active]: state.playerProfile,
  };
  return {
    ...state,
    chrono: nextChronos[active],
    multiplayer: {
      ...state.multiplayer,
      factionChronos: nextChronos,
      factionProfiles: nextProfiles,
    },
  };
}

/** Switches the canonical multiplayer state onto `nextFaction`'s turn and refills their seasonal orders. */
export function activateMultiplayerSeat(
  state: GameState,
  nextFaction: PlayableFactionId,
  rollStoryEvent = false
): GameState {
  const synced = syncMultiplayerActiveFaction(state);
  if (!synced.multiplayer) return synced;
  const chrono = synced.multiplayer.factionChronos[nextFaction] ?? createDefaultChronoState();
  const profile =
    synced.multiplayer.factionProfiles[nextFaction] ?? createDefaultPlayerProfile('male', '');

  let switched: GameState = checkVictoryState({
    ...synced,
    playerFaction: nextFaction,
    playerProfile: profile,
    chrono,
    activeEvent: null,
    multiplayer: {
      ...synced.multiplayer,
      activeFaction: nextFaction,
    },
  });
  const maxAP = getEffectiveMaxAP(switched);
  switched = {
    ...switched,
    actionPoints: maxAP,
    maxActionPoints: maxAP,
  };
  if (rollStoryEvent && !switched.winner && !switched.isPlayerDefeated) {
    const ev = pickSeasonalStoryEvent(switched);
    if (ev) switched = { ...switched, activeEvent: ev };
  }
  return syncMultiplayerActiveFaction(switched);
}

/** Projects a canonical multiplayer `GameState` for `viewerFaction` so each player sees their own court & tech. */
export function projectStateForViewer(
  state: GameState,
  viewerFaction: PlayableFactionId
): GameState {
  const synced = syncMultiplayerActiveFaction(state);
  if (!synced.multiplayer) return synced;
  const active = synced.multiplayer.activeFaction;
  if (viewerFaction === active) return synced;

  const chrono = synced.multiplayer.factionChronos[viewerFaction] ?? synced.chrono;
  const profile = synced.multiplayer.factionProfiles[viewerFaction] ?? synced.playerProfile;
  const viewerCities = getFactionCities(synced, viewerFaction).length;
  let viewerMaxAP = ordersForRealmSize(viewerCities);
  if (chrono.trust >= 80) viewerMaxAP += 1;
  if (chrono.unlockedTechs.includes('balloon')) viewerMaxAP += 1;

  return {
    ...synced,
    playerFaction: viewerFaction,
    playerProfile: profile,
    chrono,
    actionPoints: 0,
    maxActionPoints: viewerMaxAP,
    activeEvent: null,
    isPlayerDefeated: viewerCities === 0,
  };
}

// ==================== HERO & CHRONO QUERIES ====================

export function canSeeHeroWeakness(state: GameState): boolean {
  return (
    state.chrono.divergence < 60 || state.chrono.unlockedTechs.includes('spyglass')
  );
}

/** Orders the player may give in a season: realm size, the lord's trust and signal balloons. */
export function getEffectiveMaxAP(state: GameState): number {
  let ap = ordersForRealmSize(
    Object.values(state.cities).filter((c) => c.owner === state.playerFaction).length
  );
  if (state.chrono.trust >= 80) ap += 1;
  if (state.chrono.unlockedTechs.includes('balloon')) ap += 1;
  return ap;
}

export function getFactionCities(state: GameState, faction: FactionId): City[] {
  return Object.values(state.cities).filter((c) => c.owner === faction);
}

export function getFactionTotalTroops(state: GameState, faction: FactionId): number {
  return getFactionCities(state, faction).reduce((sum, c) => sum + c.troops, 0);
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

/** Seasonal income city by city, so the interface can explain the total it shows. */
export function getFactionIncomeBreakdown(
  state: GameState,
  faction: PlayableFactionId
): Array<{ cityId: string; gold: number; food: number; governorBonus: number; supportBonus: number }> {
  const cities = getFactionCities(state, faction);
  const multiplier = faction === 'wei' ? 1.2 : faction === 'wu' ? 1.1 : 1.0;
  const foodTechMult = factionHasTech(state, faction, 'agriculture') ? 1.35 : 1.0;
  const goldTechMult = factionHasTech(state, faction, 'printing') ? 1.1 : 1.0;

  return cities.map((city) => {
    // The governor's politics lifts what the city brings in: up to +15%.
    const governorPolitics = getCityGovernor(state, city.id)?.general.politics ?? 50;
    const govBonus = 1 + Math.max(0, governorPolitics - 60) / 260;
    const people = supportIncomeFactor(city.support);
    const event = eventIncomeFactor(city);
    return {
      cityId: city.id,
      gold: Math.round(
        (city.baseGold + city.trade * GOLD_PER_TRADE_LEVEL) * multiplier * govBonus * goldTechMult * people * event.gold
      ),
      food: Math.round(
        (city.baseFood + city.farming * FOOD_PER_FARMING_LEVEL) * multiplier * govBonus * foodTechMult * people * event.food
      ),
      governorBonus: govBonus - 1,
      supportBonus: people - 1,
    };
  });
}

export function getFactionIncome(
  state: GameState,
  faction: PlayableFactionId
): { gold: number; food: number } {
  let gold = 0;
  let food = 0;
  for (const row of getFactionIncomeBreakdown(state, faction)) {
    gold += row.gold;
    food += row.food;
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
  if (
    !winner &&
    state.multiplayer &&
    state.multiplayer.humanFactions.length > 0 &&
    state.multiplayer.humanFactions.every((f) => counts[f] === 0) &&
    activePlayables.length > 0
  ) {
    winner = [...activePlayables].sort((a, b) => counts[b] - counts[a])[0];
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

/** Which of a city's two economic aspects an order improves. */
export type EconomyAspect = 'farming' | 'trade';

function performImproveEconomy(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  aspect: EconomyAspect,
  consumeAP: boolean
): GameState {
  const city = state.cities[cityId];
  const faction = state.factions[factionId];
  if (!city || city.owner !== factionId || city[aspect] >= ASPECT_MAX_LEVEL) return state;
  if (consumeAP && state.actionPoints < 1) return state;
  const cost = aspect === 'farming' ? ACTION_COSTS.farmGold : ACTION_COSTS.tradeGold;
  if (faction.gold < cost) return state;

  const updatedCity: City = { ...city, [aspect]: city[aspect] + 1 };
  const updatedFaction = { ...faction, gold: faction.gold - cost };

  // The general who runs the city learns from the work.
  const updatedGenerals = { ...state.generals };
  const governor = getCityGovernor(state, cityId)?.general;
  if (governor) {
    updatedGenerals[governor.id] = grantHeroXp(governor, 15);
  }

  const level = updatedCity[aspect];
  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: { ...state.factions, [factionId]: updatedFaction },
    cities: { ...state.cities, [cityId]: updatedCity },
    generals: updatedGenerals,
    chronicle: appendChronicle(
      state,
      'economy',
      aspect === 'farming'
        ? {
            en: `${faction.shortName.en} opened new fields at ${city.name.en}: Farming Lv.${level}.`,
            zh: `${faction.shortName.zh}于${city.name.zh}开垦屯田，农业升至 ${level} 级。`,
          }
        : {
            en: `${faction.shortName.en} enlarged the markets of ${city.name.en}: Trade Lv.${level}.`,
            zh: `${faction.shortName.zh}于${city.name.zh}扩建市集，商业升至 ${level} 级。`,
          },
      factionId
    ),
  };
}

/** Open new fields: one more level of farming, which is grain every season. */
export function performDevelopFarming(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  consumeAP = true
): GameState {
  return performImproveEconomy(state, factionId, cityId, 'farming', consumeAP);
}

/** Enlarge the markets: one more level of trade, which is gold every season. */
export function performDevelopTrade(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  consumeAP = true
): GameState {
  return performImproveEconomy(state, factionId, cityId, 'trade', consumeAP);
}

/**
 * "Develop" as a single order, for callers that do not choose: improves whichever of farming and
 * trade is lower (farming on a tie). Does nothing once both are at the top level.
 */
export function performDevelopCity(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  consumeAP = true
): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  const aspect: EconomyAspect = city.farming <= city.trade ? 'farming' : 'trade';
  return performImproveEconomy(state, factionId, cityId, aspect, consumeAP);
}

/**
 * Give a city's post to one of the generals stationed there, or with `null` leave it to whoever
 * is senior. It is an appointment, not an order: it costs nothing.
 */
export function performAppointGovernor(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  generalId: string | null
): GameState {
  const city = state.cities[cityId];
  if (!city || city.owner !== factionId) return state;
  if (generalId === null) {
    if (!city.governorId) return state;
    const { governorId: _vacated, ...rest } = city;
    return { ...state, cities: { ...state.cities, [cityId]: rest } };
  }
  if (!canGovern(state, cityId, generalId) || city.governorId === generalId) return state;
  const general = state.generals[generalId];
  return {
    ...state,
    cities: { ...state.cities, [cityId]: { ...city, governorId: generalId } },
    chronicle: appendChronicle(
      state,
      'economy',
      {
        en: `${general.name.en} was appointed governor of ${city.name.en}.`,
        zh: `拜${general.name.zh}为${city.name.zh}太守。`,
      },
      factionId
    ),
  };
}

/** Tell a city's governor what to work on each season, or leave it to his judgment. Costs nothing. */
export function performSetGovernorFocus(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  focus: GovernorFocus
): GameState {
  const city = state.cities[cityId];
  if (!city || city.owner !== factionId || !GOVERNOR_FOCI.includes(focus)) return state;
  if ((city.focus ?? 'auto') === focus) return state;
  return { ...state, cities: { ...state.cities, [cityId]: { ...city, focus } } };
}

/** Drill the garrison: better drilled men go into battle with higher morale. */
export function performDrillTroops(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  consumeAP = true
): GameState {
  const city = state.cities[cityId];
  const faction = state.factions[factionId];
  if (!city || city.owner !== factionId || city.drill >= 100) return state;
  if (consumeAP && state.actionPoints < 1) return state;
  if (faction.gold < ACTION_COSTS.drillGold) return state;

  const drillmaster = getCityGenerals(state, cityId).sort((a, b) => b.command - a.command)[0];
  const gain = DRILL_ORDER_GAIN + drillOfficerBonus(drillmaster?.command ?? 0);
  const updatedCity: City = { ...city, drill: clamp(city.drill + gain, 0, 100) };

  const updatedGenerals = { ...state.generals };
  if (drillmaster) {
    updatedGenerals[drillmaster.id] = grantHeroXp(drillmaster, 15);
  }

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: {
      ...state.factions,
      [factionId]: { ...faction, gold: faction.gold - ACTION_COSTS.drillGold },
    },
    cities: { ...state.cities, [cityId]: updatedCity },
    generals: updatedGenerals,
    chronicle: appendChronicle(
      state,
      'economy',
      {
        en: `${drillmaster ? drillmaster.name.en : faction.shortName.en} drilled the garrison of ${city.name.en}: drill ${updatedCity.drill}.`,
        zh: `${drillmaster ? drillmaster.name.zh : faction.shortName.zh}于${city.name.zh}校场操练士卒，训练度升至 ${updatedCity.drill}。`,
      },
      factionId
    ),
  };
}

/** Open the granaries to the people: grain from the stores buys their support. */
export function performRelief(
  state: GameState,
  factionId: PlayableFactionId,
  cityId: string,
  consumeAP = true
): GameState {
  const city = state.cities[cityId];
  const faction = state.factions[factionId];
  if (!city || city.owner !== factionId || city.support >= 100) return state;
  if (consumeAP && state.actionPoints < 1) return state;
  if (faction.food < ACTION_COSTS.reliefFood) return state;

  const steward = getCityGenerals(state, cityId).sort((a, b) => b.charisma - a.charisma)[0];
  const gain = RELIEF_ORDER_GAIN + reliefOfficerBonus(steward?.charisma ?? 0);
  const updatedCity: City = { ...city, support: clamp(city.support + gain, 0, 100) };

  const updatedGenerals = { ...state.generals };
  if (steward) {
    updatedGenerals[steward.id] = grantHeroXp(steward, 15);
  }

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: {
      ...state.factions,
      [factionId]: { ...faction, food: faction.food - ACTION_COSTS.reliefFood },
    },
    cities: { ...state.cities, [cityId]: updatedCity },
    generals: updatedGenerals,
    chronicle: appendChronicle(
      state,
      'economy',
      {
        en: `${steward ? steward.name.en : faction.shortName.en} opened the granaries of ${city.name.en} to the people: support ${updatedCity.support}.`,
        zh: `${steward ? steward.name.zh : faction.shortName.zh}于${city.name.zh}开仓赈济百姓，民心升至 ${updatedCity.support}。`,
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

  // Raising the walls also makes good whatever a bombardment or a storming broke.
  const updatedCity: City = { ...city, defense: city.defense + 1, wallScar: undefined };
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

/** Men one levy raises in a city: its prosperity, its best-liked general and the people's support. */
export function levySizeOf(
  city: Pick<City, 'farming' | 'trade' | 'support'>,
  bestCharisma: number
): number {
  const heroLevyBonus = Math.round(Math.max(0, bestCharisma - 60) * 18);
  const base = ACTION_COSTS.recruitTroops + cityProsperity(city) * LEVY_PER_PROSPERITY + heroLevyBonus;
  return Math.round(base * supportLevyFactor(city.support));
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

  const troopsAdded = levySizeOf(city, charismaBonus);
  // Raw recruits water down the garrison's drill, and a levy costs the people's goodwill.
  const updatedCity: City = {
    ...city,
    troops: city.troops + troopsAdded,
    drill: mixDrill(city.troops, city.drill, troopsAdded, RAW_LEVY_DRILL),
    support: clamp(city.support - SUPPORT_COST_LEVY, 0, 100),
  };
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
    [toCityId]: {
      ...toCity,
      troops: toCity.troops + actual,
      drill: mixDrill(toCity.troops, toCity.drill, actual, fromCity.drill),
    },
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
  pincerFromCityId?: string;
  pincerTroops?: number;
  isRiverStrike?: boolean;
}

export function isYangtzePort(cityId: string): boolean {
  return YANGTZE_PORT_IDS.includes(cityId);
}

export function canLaunchRiverStrike(
  state: GameState,
  factionId: PlayableFactionId
): boolean {
  return factionId === 'wu' || factionHasTech(state, factionId, 'steamship');
}

export function getEligibleStagingCities(
  state: GameState,
  factionId: PlayableFactionId,
  targetCityId: string,
  mode: 'adjacent' | 'river' = 'adjacent'
): City[] {
  const target = state.cities[targetCityId];
  if (!target || target.owner === factionId) return [];

  const owned = getFactionCities(state, factionId);
  if (mode === 'river') {
    if (!isYangtzePort(targetCityId) || !canLaunchRiverStrike(state, factionId)) return [];
    return owned
      .filter((c) => isWithinRiverStrike(c.id, targetCityId) && c.troops > 2000)
      .sort((a, b) => b.troops - a.troops);
  }

  return owned
    .filter((c) => c.neighbors.includes(targetCityId) && c.troops > 2000)
    .sort((a, b) => b.troops - a.troops);
}

export function getStrikeableEnemyCityIds(
  state: GameState,
  factionId: PlayableFactionId
): string[] {
  const hasSpyglass = factionHasTech(state, factionId, 'spyglass');
  const riverCapable = canLaunchRiverStrike(state, factionId);
  const ownedPorts = getFactionCities(state, factionId).filter(
    (c) => isYangtzePort(c.id) && c.troops > 2000
  );

  return Object.values(state.cities)
    .filter((city) => {
      if (city.owner === factionId) return false;
      if (hasSpyglass) return true;
      const hasAdjacentStaging = city.neighbors.some(
        (nid) => state.cities[nid]?.owner === factionId
      );
      if (hasAdjacentStaging) return true;
      if (riverCapable && ownedPorts.some((port) => isWithinRiverStrike(port.id, city.id))) {
        return true;
      }
      return false;
    })
    .map((c) => c.id);
}

/**
 * Validate an assault order and describe the 8x8 grid battle it will be fought as.
 * Every assault in the campaign - played by hand, auto-resolved for the player, or launched by a
 * rival - goes through this one function and is decided on the grid, so the forecast, the
 * auto-battle and a hand-played battle all follow the same rules.
 * Returns null when the order is illegal (wrong owner, not adjacent, no troops to spare).
 */
export function buildAssaultConfig(
  state: GameState,
  attackerFaction: PlayableFactionId,
  fromCityId: string,
  toCityId: string,
  troopsToSend: number,
  tactic: TacticId,
  attackerGeneralId: string | undefined,
  consumeAP: boolean,
  options: AttackOptions = {},
  playerSide?: TacticalSide
): TacticalBattleConfig | null {
  const fromCity = state.cities[fromCityId];
  const toCity = state.cities[toCityId];
  if (!fromCity || !toCity) return null;
  if (fromCity.owner !== attackerFaction || toCity.owner === attackerFaction) return null;

  const isValidRiver =
    Boolean(options.isRiverStrike) &&
    isWithinRiverStrike(fromCityId, toCityId) &&
    canLaunchRiverStrike(state, attackerFaction) &&
    state.factions[attackerFaction].food >= ACTION_COSTS.riverStrikeFood;

  if (!fromCity.neighbors.includes(toCityId) && !isValidRiver) return null;

  const maxSend = Math.max(0, fromCity.troops - 1000);
  const primaryTroops = Math.min(Math.max(1000, Math.round(troopsToSend)), maxSend);
  if (primaryTroops <= 0) return null;

  // Optional 2nd-city Joint Pincer army (at least 1,000 men, from a city that also borders the target)
  const pincerCity =
    !isValidRiver &&
    options.pincerFromCityId &&
    options.pincerFromCityId !== fromCityId &&
    state.cities[options.pincerFromCityId]?.owner === attackerFaction &&
    state.cities[options.pincerFromCityId]?.neighbors.includes(toCityId)
      ? state.cities[options.pincerFromCityId]
      : undefined;
  const maxPincer = pincerCity ? Math.max(0, pincerCity.troops - 1000) : 0;
  const pincerTroops =
    pincerCity && options.pincerTroops && options.pincerTroops >= 1000 && maxPincer >= 1000
      ? Math.min(Math.round(options.pincerTroops), maxPincer)
      : 0;

  const isUsable = (id: string | undefined): id is string =>
    Boolean(
      id &&
        state.generals[id]?.faction === attackerFaction &&
        state.generals[id]?.status === 'active'
    );
  const lead = isUsable(attackerGeneralId)
    ? state.generals[attackerGeneralId]
    : getBestGeneralInCity(state, fromCityId, attackerFaction);
  const deputy =
    isUsable(options.deputyGeneralId) && options.deputyGeneralId !== lead?.id
      ? state.generals[options.deputyGeneralId]
      : undefined;

  return {
    id: nextId('tac'),
    fromCityId,
    toCityId,
    attackerFaction,
    defenderFaction: toCity.owner,
    playerSide: playerSide ?? (attackerFaction === state.playerFaction ? 'attacker' : 'defender'),
    primaryTroops,
    pincerFromCityId: pincerTroops > 0 ? pincerCity?.id : undefined,
    pincerTroops: pincerTroops > 0 ? pincerTroops : undefined,
    tactic,
    isRiverStrike: isValidRiver,
    attackerGeneralId: lead?.id,
    deputyGeneralId: deputy?.id,
    consumeAP,
    initialDuelResult: options.duelResult,
    holdLeadSkill: !options.useSignatureSkill,
  };
}

/** Small deterministic PRNG so a forecast for the same order always shows the same number. */
function seededRng(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many simulated battles stand behind a War Room forecast. */
export const FORECAST_SAMPLES = 40;

/** What the campaign situation contributes on the grid, as short tags for the War Room. */
function describeAssaultModifiers(state: GameState, config: TacticalBattleConfig): BattleModifierTag[] {
  const tags: BattleModifierTag[] = [];
  const toCity = state.cities[config.toCityId];
  const attackerFaction = config.attackerFaction;
  const defenderFaction = toCity.owner;
  const lead = config.attackerGeneralId ? state.generals[config.attackerGeneralId] : undefined;
  const deputy = config.deputyGeneralId ? state.generals[config.deputyGeneralId] : undefined;

  const gateHp = GATE_BASE_HP + toCity.defense * GATE_HP_PER_DEFENSE;
  const rampart = Math.round((RAMPART_BASE_DEF + RAMPART_DEF_PER_LEVEL * toCity.defense) * 100);
  tags.push({
    label: { en: `City Walls Lv.${toCity.defense}`, zh: `敌城防 Lv.${toCity.defense}` },
    value:
      config.tactic === 'siege'
        ? `Gate ${gateHp.toLocaleString()} · +${Math.round(rampart * SIEGE_PLAN_RAMPART_FACTOR)}% DEF`
        : `Gate ${gateHp.toLocaleString()} · +${rampart}% DEF`,
    positive: false,
  });

  const fromCity = state.cities[config.fromCityId];
  const atkDrill = drillMoraleBonus(fromCity?.drill ?? 50);
  if (atkDrill !== 0) {
    tags.push({
      label:
        atkDrill > 0
          ? { en: `Well-drilled army (drill ${fromCity.drill})`, zh: `我军训练有素（训练 ${fromCity.drill}）` }
          : { en: `Raw army (drill ${fromCity.drill})`, zh: `我军操练不足（训练 ${fromCity.drill}）` },
      value: `${atkDrill > 0 ? '+' : ''}${atkDrill} Morale`,
      positive: atkDrill > 0,
    });
  }
  const defDrill = drillMoraleBonus(toCity.drill);
  if (defDrill !== 0) {
    tags.push({
      label:
        defDrill > 0
          ? { en: `Well-drilled garrison (drill ${toCity.drill})`, zh: `守军训练有素（训练 ${toCity.drill}）` }
          : { en: `Raw garrison (drill ${toCity.drill})`, zh: `守军操练不足（训练 ${toCity.drill}）` },
      value: `${defDrill > 0 ? '+' : ''}${defDrill} Morale`,
      positive: defDrill < 0,
    });
  }

  const planTag: Record<TacticId, { label: LocalizedText; value: string }> = {
    assault: {
      label: { en: 'Frontal Assault Plan', zh: '正面强攻之策' },
      value: `+${Math.round(ASSAULT_PLAN_ATK * 100)}% ATK`,
    },
    fire: { label: { en: 'Fire Attack Plan', zh: '火攻之策' }, value: '+1 SP · Fire +15%' },
    ambush: { label: { en: 'Mountain Ambush Plan', zh: '伏兵之策' }, value: 'Swift in forest/hills · -20% counter' },
    siege: {
      label: { en: 'Siege Engines Plan', zh: '围城器械之策' },
      value: `+${Math.round((SIEGE_PLAN_GATE_MULT - 1) * 100)}% vs Gates · Walls -${Math.round((1 - SIEGE_PLAN_RAMPART_FACTOR) * 100)}%`,
    },
  };
  tags.push({ ...planTag[config.tactic], positive: true });

  if (lead) {
    const heroAtk = Math.round(((lead.war - 65) * 0.008 + (lead.command - 65) * 0.005) * 100);
    tags.push({
      label: lead.name,
      value: `${heroAtk >= 0 ? '+' : ''}${heroAtk}% ATK`,
      positive: heroAtk >= 0,
    });
    if (lead.skillCooldown > 0) {
      tags.push({
        label: { en: 'Signature Skill Cooling Down', zh: '绝技冷却中' },
        value: `${lead.skillCooldown}`,
        positive: false,
      });
    }
    if (defenderFaction !== 'neutral' && lead.vendettaAgainst.includes(defenderFaction)) {
      tags.push({ label: { en: 'Sworn Vendetta', zh: '血海深仇' }, value: '+20% ATK', positive: true });
    }
  }

  const bond = getActiveBondsForHeroes([lead?.id, deputy?.id].filter(Boolean) as string[]).sort(
    (a, b) => b.combatBonus - a.combatBonus
  )[0];
  if (bond) {
    tags.push({
      label: bond.name,
      value: `+${Math.round(bond.combatBonus * 100)}% ATK`,
      positive: true,
    });
  }

  if (config.pincerTroops) {
    tags.push({ label: { en: 'Joint Pincer Flank', zh: '多路合围夹击' }, value: '+1 Squad', positive: true });
  }
  if (attackerFaction === 'shu' && lead) {
    tags.push({ label: { en: 'Shu Benevolent Valor', zh: '蜀汉仁德精兵' }, value: '+10% ATK', positive: true });
  }
  if (attackerFaction === 'wu') {
    tags.push({ label: { en: 'Wu Fire & Fleet', zh: '东吴水师火攻' }, value: 'Fire +12%', positive: true });
  }
  if (defenderFaction === 'shu' && toCity.terrain === 'mountain') {
    tags.push({ label: { en: 'Shu Mountain Defense', zh: '蜀道山险' }, value: '+12% DEF', positive: false });
  }

  if (attackerFaction === state.playerFaction) {
    const insight = getChronoInsightBonus(state) * 0.75;
    const flawed = getCityGenerals(state, config.toCityId).find(
      (g) => g.dossier.weakToTactic === config.tactic
    );
    if (insight > 0 && flawed) {
      tags.push({
        label: { en: `Chrono-Insight vs ${flawed.name.en}`, zh: `先知克制${flawed.name.zh}` },
        value: `+${Math.round(insight * 100)}% ATK`,
        positive: true,
      });
    }
    if (state.chrono.coalitionActive && defenderFaction !== 'neutral') {
      tags.push({ label: { en: 'Coalition Resolve', zh: '合纵联军死守' }, value: '+12% ATK & DEF', positive: false });
    }
  }

  if (factionHasTech(state, attackerFaction, 'gunpowder')) {
    tags.push({ label: { en: 'Black Powder', zh: '黑火药震天雷' }, value: '2 Bombs · +40% vs Gates', positive: true });
  }
  if (factionHasTech(state, attackerFaction, 'stirrups')) {
    tags.push({ label: { en: 'Steel Stirrups', zh: '双边马镫' }, value: '+15% Cavalry', positive: true });
  }
  if (factionHasTech(state, attackerFaction, 'balloon')) {
    tags.push({ label: { en: 'Recon Balloon', zh: '热气球侦察' }, value: '+12% ATK', positive: true });
  }
  if (factionHasTech(state, defenderFaction, 'gunpowder')) {
    tags.push({ label: { en: 'Rival Gunpowder', zh: '敌仿制火药' }, value: '1 Bomb', positive: false });
  }

  return tags;
}

/**
 * War Room forecast. Plays the ordered assault out on the 8x8 grid FORECAST_SAMPLES times with the
 * tactical AI commanding both sides and reports how often the city fell - the same engine that
 * resolves the real battle, so the number shown is the number you get from an auto-battle.
 */
export function estimateBattlePreview(
  state: GameState,
  attackerFaction: PlayableFactionId,
  fromCityId: string,
  toCityId: string,
  troopsToSend: number,
  tactic: TacticId,
  attackerGeneralId?: string,
  options: AttackOptions = {}
): BattlePreview {
  const config = buildAssaultConfig(
    state,
    attackerFaction,
    fromCityId,
    toCityId,
    troopsToSend,
    tactic,
    attackerGeneralId,
    false,
    options
  );
  if (!config) {
    return { estimatedWinChance: 50, atkPower: 0, defPower: 0, modifiers: [] };
  }

  const toCity = state.cities[toCityId];
  const rng = seededRng(
    [
      state.turn,
      fromCityId,
      toCityId,
      config.primaryTroops,
      config.pincerFromCityId ?? '',
      config.pincerTroops ?? 0,
      tactic,
      config.attackerGeneralId ?? '',
      config.deputyGeneralId ?? '',
      config.isRiverStrike ? 'river' : 'land',
      config.holdLeadSkill ? 'hold' : 'skill',
      config.initialDuelResult?.winner ?? '',
      toCity.troops,
      toCity.defense,
    ].join('|')
  );

  let wins = 0;
  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let i = 0; i < FORECAST_SAMPLES; i++) {
    const outcome = extractTacticalBattleOutcome(
      resolveTacticalBattleByAI(createTacticalBattle(state, config, rng), rng)
    );
    if (outcome.attackerWon) wins += 1;
    attackerLosses += outcome.attackerLosses;
    defenderLosses += outcome.defenderLosses;
  }

  return {
    estimatedWinChance: clamp(Math.round((wins / FORECAST_SAMPLES) * 100), 3, 97),
    atkPower: config.primaryTroops + (config.pincerTroops ?? 0),
    defPower: toCity.troops,
    modifiers: describeAssaultModifiers(state, config),
    expectedAttackerLosses: Math.round(attackerLosses / FORECAST_SAMPLES),
    expectedDefenderLosses: Math.round(defenderLosses / FORECAST_SAMPLES),
    samples: FORECAST_SAMPLES,
  };
}

/**
 * Auto-resolve an assault: the tactical AI fights the battle for both sides on the 8x8 grid and
 * the exact result is committed to the campaign. Used for the player's "AI Default" battles and
 * for every assault a rival launches.
 */
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
  if (consumeAP && state.actionPoints < 1) return state;
  const config = buildAssaultConfig(
    state,
    attackerFaction,
    fromCityId,
    toCityId,
    troopsToSend,
    tactic,
    attackerGeneralId,
    consumeAP,
    options
  );
  if (!config) return state;

  const battle = resolveTacticalBattleByAI(createTacticalBattle(state, config, rng), rng);
  return applyTacticalBattleOutcome(state, extractTacticalBattleOutcome(battle), rng);
}

/** Share of a beaten garrison's survivors that make it to a friendly neighbouring city. */
const WITHDRAWAL_SURVIVAL = 0.75;

/**
 * Commits the exact outcome of an 8x8 Tactical Grid Battle (hand-played or auto-resolved)
 * back into the strategic campaign GameState.
 */
export function applyTacticalBattleOutcome(
  state: GameState,
  outcome: TacticalBattleOutcome,
  rng: () => number = Math.random
): GameState {
  const { config } = outcome;
  const fromCity = state.cities[config.fromCityId];
  const toCity = state.cities[config.toCityId];
  if (!fromCity || !toCity) return state;

  const attackerFaction = config.attackerFaction;
  const defenderFaction = toCity.owner;
  // The battle was fought for a particular owner on each side; ignore a result that no longer applies.
  if (fromCity.owner !== attackerFaction || defenderFaction === attackerFaction) return state;
  const captured = outcome.attackerWon;

  const primaryTroops = Math.min(Math.max(1000, Math.round(config.primaryTroops)), Math.max(0, fromCity.troops - 1000));
  const pincerCity =
    config.pincerFromCityId &&
    config.pincerFromCityId !== config.fromCityId &&
    state.cities[config.pincerFromCityId]?.owner === attackerFaction
      ? state.cities[config.pincerFromCityId]
      : undefined;
  const pincerTroops =
    pincerCity && config.pincerTroops && config.pincerTroops >= 1000
      ? Math.min(Math.round(config.pincerTroops), Math.max(0, pincerCity.troops - 1000))
      : 0;

  const totalSent = Math.max(1, primaryTroops + pincerTroops);
  // Never bring home more men than marched out.
  const survivingAttackers = clamp(outcome.attackerRemainingTroops, 0, totalSent);
  const primaryShare = primaryTroops / totalSent;
  const survivingPrimary = Math.round(survivingAttackers * primaryShare);
  const survivingPincer = survivingAttackers - survivingPrimary;

  const updatedCities = { ...state.cities };
  updatedCities[fromCity.id] = {
    ...fromCity,
    troops: Math.max(500, fromCity.troops - primaryTroops + (captured ? 0 : survivingPrimary)),
  };

  if (pincerCity && pincerTroops > 0) {
    updatedCities[pincerCity.id] = {
      ...pincerCity,
      troops: Math.max(500, pincerCity.troops - pincerTroops + (captured ? 0 : survivingPincer)),
    };
  }

  // When a city falls, whatever is left of its garrison (squads still standing when the flag fell
  // plus routed squads that got away) withdraws to the weakest friendly neighbour, if there is one.
  let withdrawnTroops = 0;
  let withdrawCity: City | undefined;
  if (captured) {
    // The victors garrison the city: it takes their drill, and its people start wary of the new rule.
    const victorDrill =
      pincerCity && pincerTroops > 0
        ? mixDrill(primaryTroops, fromCity.drill, pincerTroops, pincerCity.drill)
        : fromCity.drill;
    updatedCities[toCity.id] = {
      ...toCity,
      owner: attackerFaction,
      troops: Math.max(1000, survivingAttackers),
      defense: Math.max(1, toCity.defense - 1),
      drill: clamp(victorDrill + DRILL_VICTORY_GAIN, 0, 100),
      support: SUPPORT_AFTER_CONQUEST,
      // The old governor's post and instructions fall with the city.
      governorId: undefined,
      focus: 'auto',
      wallScar: WALL_SCAR_SEASONS,
    };

    const survivingDefenders = clamp(outcome.defenderRemainingTroops, 0, toCity.troops);
    if (defenderFaction !== 'neutral' && survivingDefenders > 0) {
      withdrawCity = toCity.neighbors
        .map((id) => updatedCities[id])
        .filter((c): c is City => Boolean(c && c.owner === defenderFaction))
        .sort((a, b) => a.troops - b.troops)[0];
      if (withdrawCity) {
        withdrawnTroops = Math.round(survivingDefenders * WITHDRAWAL_SURVIVAL);
        updatedCities[withdrawCity.id] = {
          ...withdrawCity,
          troops: withdrawCity.troops + withdrawnTroops,
          drill: mixDrill(withdrawCity.troops, withdrawCity.drill, withdrawnTroops, toCity.drill),
        };
      }
    }
  } else {
    // A garrison that held its walls is the better for it; the people inside paid for the siege.
    updatedCities[toCity.id] = {
      ...toCity,
      troops: Math.max(500, Math.min(toCity.troops, outcome.defenderRemainingTroops)),
      drill: clamp(toCity.drill + DRILL_HELD_GAIN, 0, 100),
      support: clamp(toCity.support - SUPPORT_COST_SIEGE, 0, 100),
    };
  }

  const updatedGenerals = { ...state.generals };
  let capturedHeroId: string | undefined;
  let woundedHeroId: string | undefined;
  const duel = config.initialDuelResult;

  // Every hero who spent a signature skill - on either side, or in the pre-battle duel - cools down.
  const skillSpenders = new Set(outcome.skillUsedHeroIds);
  if (duel?.skillUsed) skillSpenders.add(duel.attackerHeroId);
  for (const heroId of skillSpenders) {
    const h = updatedGenerals[heroId];
    if (h) updatedGenerals[heroId] = { ...h, skillCooldown: h.signatureSkill.cooldownTurns };
  }

  if (outcome.attackerGeneralId && updatedGenerals[outcome.attackerGeneralId]) {
    let g = grantHeroXp(updatedGenerals[outcome.attackerGeneralId], captured ? 65 : 28);
    if (captured) {
      g = { ...g, cityId: toCity.id, loyalty: clamp(g.loyalty + 4, 0, 100) };
    }
    // Losing the pre-battle duel leaves the champion wounded (unless Field Medicine patches him up).
    if (duel?.winner === 'defender' && duel.attackerHeroId === g.id && !factionHasTech(state, attackerFaction, 'medicine')) {
      g = { ...g, status: 'wounded', woundedTurns: 1 };
      woundedHeroId = g.id;
    }
    updatedGenerals[g.id] = g;
  }

  if (outcome.deputyGeneralId && updatedGenerals[outcome.deputyGeneralId]) {
    let d = grantHeroXp(updatedGenerals[outcome.deputyGeneralId], captured ? 45 : 18);
    if (captured) d = { ...d, cityId: toCity.id };
    updatedGenerals[d.id] = d;
  }

  if (captured) {
    // The lord of a free city has no realm to fall back on: he is taken, or left masterless in
    // his old city where he can be recruited.
    const fallbackCity =
      defenderFaction === 'neutral'
        ? undefined
        : (withdrawCity ??
          Object.values(updatedCities).find(
            (c) => c.owner === defenderFaction && c.id !== toCity.id
          ));
    const defendersInCity = Object.values(updatedGenerals).filter(
      (g) =>
        g.faction === defenderFaction &&
        g.cityId === toCity.id &&
        (g.status === 'active' || g.status === 'wounded')
    );

    for (const defHero of defendersInCity) {
      const encircledOrSurrendered = outcome.surrenderedOrEncircledHeroIds.includes(defHero.id);
      const captureChance = defenderFaction === 'neutral'
        ? encircledOrSurrendered
          ? 0.82
          : 0.55
        : !fallbackCity
        ? 0.9
        : encircledOrSurrendered
          ? 0.82
          : outcome.defeatedEnemyHeroIds.includes(defHero.id)
            ? 0.48
            : 0.25;

      if (!capturedHeroId && rng() < captureChance) {
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
  } else if (!captured && outcome.defenderGeneralId && updatedGenerals[outcome.defenderGeneralId]) {
    let dg = grantHeroXp(updatedGenerals[outcome.defenderGeneralId], 50);
    // A defending champion beaten in the pre-battle duel fights on wounded.
    if (duel?.winner === 'attacker' && duel.defenderHeroId === dg.id && dg.status === 'active') {
      dg = { ...dg, status: 'wounded', woundedTurns: 1 };
    }
    updatedGenerals[dg.id] = dg;
  }

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

  // A plundering hero who used their skill in a victorious assault carries off the treasury.
  const plunderGold =
    captured &&
    outcome.skillUsedHeroIds.some(
      (id) =>
        state.generals[id]?.faction === attackerFaction &&
        state.generals[id]?.signatureSkill.effect === 'raid_plunder'
    )
      ? 220
      : 0;

  const updatedFactions = { ...state.factions };
  if (config.isRiverStrike || plunderGold > 0) {
    updatedFactions[attackerFaction] = {
      ...updatedFactions[attackerFaction],
      gold: updatedFactions[attackerFaction].gold + plunderGold,
      food: Math.max(
        0,
        updatedFactions[attackerFaction].food - (config.isRiverStrike ? ACTION_COSTS.riverStrikeFood : 0)
      ),
    };
  }

  let nextChrono = { ...state.chrono };
  if (attackerFaction === state.playerFaction) {
    nextChrono = {
      ...nextChrono,
      trust: clamp(nextChrono.trust + (captured ? 8 : -5), 0, 100),
      suspicion: clamp(nextChrono.suspicion + (captured ? -4 : 4), 0, 100),
      divergence: clamp(nextChrono.divergence + (captured ? 4 : 0), 0, 100),
    };
  } else if (defenderFaction === state.playerFaction) {
    nextChrono = {
      ...nextChrono,
      trust: clamp(nextChrono.trust + (captured ? -10 : 6), 0, 100),
      suspicion: clamp(nextChrono.suspicion + (captured ? 6 : -3), 0, 100),
    };
  }

  const capHero = capturedHeroId ? state.generals[capturedHeroId] : undefined;
  const atkShort = state.factions[attackerFaction].shortName;
  const leadHero = outcome.attackerGeneralId ? state.generals[outcome.attackerGeneralId] : undefined;
  const withdrawNote: LocalizedText =
    withdrawCity && withdrawnTroops > 0
      ? {
          en: ` ${withdrawnTroops.toLocaleString()} defenders withdrew to ${withdrawCity.name.en}.`,
          zh: ` 残部 ${withdrawnTroops.toLocaleString()} 人退守${withdrawCity.name.zh}。`,
        }
      : { en: '', zh: '' };
  const narrative: LocalizedText = {
    en: `${leadHero ? `${leadHero.name.en} led ` : ''}${atkShort.en} against ${toCity.name.en} (${TACTICS[config.tactic].name.en}, ${outcome.roundsPlayed} rounds): ${outcome.victoryReason.en}${
      capHero ? ` Captured ${capHero.name.en}!` : ''
    } (Attacker lost ${outcome.attackerLosses.toLocaleString()} vs Defender lost ${outcome.defenderLosses.toLocaleString()}).${withdrawNote.en}`,
    zh: `${leadHero ? `${leadHero.name.zh}率` : ''}${atkShort.zh}军以「${TACTICS[config.tactic].name.zh}」进攻${toCity.name.zh}（激战 ${outcome.roundsPlayed} 合）：${outcome.victoryReason.zh}${
      capHero ? ` 生擒敌将${capHero.name.zh}！` : ''
    }（攻损 ${outcome.attackerLosses.toLocaleString()}，守折 ${outcome.defenderLosses.toLocaleString()}）。${withdrawNote.zh}`,
  };

  const report: BattleReport = {
    id: nextId('battle'),
    turn: state.turn,
    attackerFaction,
    defenderFaction,
    fromCityId: config.fromCityId,
    toCityId: config.toCityId,
    attackerGeneralId: outcome.attackerGeneralId,
    deputyGeneralId: outcome.deputyGeneralId,
    defenderGeneralId: outcome.defenderGeneralId,
    tactic: config.tactic,
    skillTriggered: outcome.skillTriggered,
    duelWinner: duel?.winner,
    capturedHeroId,
    woundedHeroId,
    attackerStartTroops: outcome.attackerStartTroops,
    defenderStartTroops: outcome.defenderStartTroops,
    attackerLosses: outcome.attackerLosses,
    defenderLosses: outcome.defenderLosses,
    captured,
    narrative,
  };

  const newMarches: MarchEvent[] = [
    {
      id: nextId('march'),
      fromCityId: config.fromCityId,
      toCityId: config.toCityId,
      faction: attackerFaction,
      type: config.isRiverStrike ? 'river_strike' : 'attack',
      captured,
    },
  ];
  if (pincerCity && pincerTroops > 0) {
    newMarches.push({
      id: nextId('march'),
      fromCityId: pincerCity.id,
      toCityId: config.toCityId,
      faction: attackerFaction,
      type: 'attack',
      captured,
    });
  }

  const nextState: GameState = {
    ...state,
    actionPoints: config.consumeAP ? Math.max(0, state.actionPoints - 1) : state.actionPoints,
    factions: updatedFactions,
    cities: updatedCities,
    generals: updatedGenerals,
    diplomacy: updatedDiplomacy,
    chrono: nextChrono,
    lastBattle: report,
    recentMarches: [...newMarches, ...state.recentMarches].slice(0, 6),
    chronicle: appendChronicle(state, 'battle', narrative, attackerFaction),
  };

  return checkVictoryState(nextState);
}

// ==================== SPECIAL MILITARY OPERATIONS (NIGHT RAID, BOMBARD, SOW DISCORD) ====================

export function performNightRaid(
  state: GameState,
  attackerFaction: PlayableFactionId,
  fromCityId: string,
  toCityId: string,
  heroId?: string,
  consumeAP = true,
  rng: () => number = Math.random
): GameState {
  const fromCity = state.cities[fromCityId];
  const toCity = state.cities[toCityId];
  if (!fromCity || !toCity) return state;
  if (fromCity.owner !== attackerFaction || toCity.owner === attackerFaction) return state;
  if (!fromCity.neighbors.includes(toCityId) || fromCity.troops < 2500) return state;
  if (consumeAP && state.actionPoints < 1) return state;

  const hero =
    (heroId &&
    state.generals[heroId]?.faction === attackerFaction &&
    state.generals[heroId]?.status === 'active'
      ? state.generals[heroId]
      : undefined) || getBestGeneralInCity(state, fromCityId, attackerFaction);

  const warStat = hero ? hero.war : 75;
  const stirrupBonus = factionHasTech(state, attackerFaction, 'stirrups') ? 0.06 : 0;
  const killRatio = clamp(0.15 + ((warStat - 60) / 400) + stirrupBonus + (rng() * 0.04), 0.14, 0.29);
  const enemyLost = Math.min(Math.max(0, toCity.troops - 500), Math.round(toCity.troops * killRatio));
  const friendlyLost = Math.min(
    Math.max(0, fromCity.troops - 1500),
    Math.round(320 + rng() * 340 * (factionHasTech(state, attackerFaction, 'medicine') ? 0.75 : 1))
  );
  const goldPlundered = Math.round(180 + (warStat - 50) * 2.1 + rng() * 50);
  const foodPlundered = Math.round(140 + (warStat - 50) * 1.8 + rng() * 40);

  const updatedCities = {
    ...state.cities,
    [fromCityId]: { ...fromCity, troops: Math.max(1000, fromCity.troops - friendlyLost) },
    [toCityId]: {
      ...toCity,
      troops: Math.max(500, toCity.troops - enemyLost),
      support: clamp(toCity.support - SUPPORT_COST_RAID, 0, 100),
    },
  };

  const updatedFactions = { ...state.factions };
  updatedFactions[attackerFaction] = {
    ...updatedFactions[attackerFaction],
    gold: updatedFactions[attackerFaction].gold + goldPlundered,
    food: updatedFactions[attackerFaction].food + foodPlundered,
  };
  if (toCity.owner !== 'neutral') {
    const defF = updatedFactions[toCity.owner];
    updatedFactions[toCity.owner] = {
      ...defF,
      gold: Math.max(0, defF.gold - Math.round(goldPlundered * 0.65)),
      food: Math.max(0, defF.food - Math.round(foodPlundered * 0.65)),
    };
  }

  const updatedGenerals = { ...state.generals };
  if (hero) {
    updatedGenerals[hero.id] = grantHeroXp(hero, 34);
  }

  const updatedDiplomacy = { ...state.diplomacy };
  if (toCity.owner !== 'neutral') {
    const key = getDiplomacyKey(attackerFaction, toCity.owner);
    const rel = updatedDiplomacy[key];
    if (rel) {
      const nextScore = clamp(rel.score - 14, -100, 100);
      updatedDiplomacy[key] = {
        ...rel,
        score: nextScore,
        truceTurnsLeft: 0,
        status: scoreToStatus(nextScore, 0),
      };
    }
  }

  const atkName = state.factions[attackerFaction].shortName;
  const narrative: LocalizedText = {
    en: `Night Raid! ${hero ? `${hero.name.en} led ` : ''}${atkName.en} raiders into ${toCity.name.en}, cutting down ${enemyLost.toLocaleString()} defenders and plundering +${goldPlundered} Gold & +${foodPlundered} Food (${friendlyLost} lost).`,
    zh: `夜袭劫营！${hero ? `${hero.name.zh}率` : ''}${atkName.zh}轻骑突袭${toCity.name.zh}，斩杀守军 ${enemyLost.toLocaleString()} 人，劫获粮饷 +${goldPlundered} 金 / +${foodPlundered} 粮（我损 ${friendlyLost}）。`,
  };

  const opReport: OperationReport = {
    id: nextId('op'),
    turn: state.turn,
    type: 'raid',
    attackerFaction,
    targetCityId: toCityId,
    fromCityId,
    heroId: hero?.id,
    enemyTroopsLost: enemyLost,
    friendlyTroopsLost: friendlyLost,
    goldPlundered,
    foodPlundered,
    defenseReduced: 0,
    loyaltyReduced: 0,
    narrative,
  };

  const march: MarchEvent = {
    id: nextId('march'),
    fromCityId,
    toCityId,
    faction: attackerFaction,
    type: 'raid',
  };

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: updatedFactions,
    cities: updatedCities,
    generals: updatedGenerals,
    diplomacy: updatedDiplomacy,
    chrono:
      attackerFaction === state.playerFaction
        ? { ...state.chrono, trust: clamp(state.chrono.trust + 3, 0, 100) }
        : state.chrono,
    lastOperation: opReport,
    recentMarches: [march, ...state.recentMarches].slice(0, 6),
    chronicle: appendChronicle(state, 'battle', narrative, attackerFaction),
  };
}

export function performSabotageBombard(
  state: GameState,
  attackerFaction: PlayableFactionId,
  fromCityId: string,
  toCityId: string,
  heroId?: string,
  consumeAP = true,
  rng: () => number = Math.random
): GameState {
  const fromCity = state.cities[fromCityId];
  const toCity = state.cities[toCityId];
  const faction = state.factions[attackerFaction];
  if (!fromCity || !toCity) return state;
  if (fromCity.owner !== attackerFaction || toCity.owner === attackerFaction) return state;
  if (!fromCity.neighbors.includes(toCityId)) return state;
  if (faction.gold < ACTION_COSTS.bombardGold) return state;
  if (consumeAP && state.actionPoints < 1) return state;

  const hero =
    (heroId &&
    state.generals[heroId]?.faction === attackerFaction &&
    state.generals[heroId]?.status === 'active'
      ? state.generals[heroId]
      : undefined) || getBestGeneralInCity(state, fromCityId, attackerFaction);

  const intStat = hero ? hero.intellect : 75;
  const hasGunpowder = factionHasTech(state, attackerFaction, 'gunpowder');
  const defDrop = Math.min(toCity.defense - 1, hasGunpowder ? 2 : 1);
  const burnedTroops = Math.min(
    Math.max(0, toCity.troops - 500),
    Math.round((1150 + intStat * 12 + rng() * 350) * (hasGunpowder ? 1.38 : 1.0))
  );

  const updatedCities = {
    ...state.cities,
    [toCityId]: {
      ...toCity,
      defense: Math.max(1, toCity.defense - defDrop),
      troops: Math.max(500, toCity.troops - burnedTroops),
      support: clamp(toCity.support - SUPPORT_COST_BOMBARD, 0, 100),
      wallScar: WALL_SCAR_SEASONS,
    },
  };

  const updatedGenerals = { ...state.generals };
  if (hero) {
    updatedGenerals[hero.id] = grantHeroXp(hero, 36);
  }
  for (const g of Object.values(updatedGenerals)) {
    if (g.cityId === toCityId && g.faction === toCity.owner && g.status === 'active') {
      updatedGenerals[g.id] = { ...g, loyalty: clamp(g.loyalty - 6, 0, 100) };
    }
  }

  const updatedFactions = {
    ...state.factions,
    [attackerFaction]: { ...faction, gold: faction.gold - ACTION_COSTS.bombardGold },
  };

  const updatedDiplomacy = { ...state.diplomacy };
  if (toCity.owner !== 'neutral') {
    const key = getDiplomacyKey(attackerFaction, toCity.owner);
    const rel = updatedDiplomacy[key];
    if (rel) {
      const nextScore = clamp(rel.score - 16, -100, 100);
      updatedDiplomacy[key] = {
        ...rel,
        score: nextScore,
        truceTurnsLeft: 0,
        status: scoreToStatus(nextScore, 0),
      };
    }
  }

  const atkName = faction.shortName;
  const narrative: LocalizedText = {
    en: `${hasGunpowder ? 'Thunder-Bomb Bombardment' : 'Fire Stratagem'}! ${hero ? `${hero.name.en} struck ` : `${atkName.en} bombarded `}${toCity.name.en}: Walls -${defDrop} (now Lv.${updatedCities[toCityId].defense}) & scorched ${burnedTroops.toLocaleString()} troops!`,
    zh: `${hasGunpowder ? '震天雷火炮轰城' : '奇谋纵火焚城'}！${hero ? `${hero.name.zh}施计轰击` : `${atkName.zh}军奇袭`}${toCity.name.zh}：城防 -${defDrop}（现 Lv.${updatedCities[toCityId].defense}），焚毁守军 ${burnedTroops.toLocaleString()} 人！`,
  };

  const opReport: OperationReport = {
    id: nextId('op'),
    turn: state.turn,
    type: 'bombard',
    attackerFaction,
    targetCityId: toCityId,
    fromCityId,
    heroId: hero?.id,
    enemyTroopsLost: burnedTroops,
    friendlyTroopsLost: 0,
    goldPlundered: 0,
    foodPlundered: 0,
    defenseReduced: defDrop,
    loyaltyReduced: 6,
    narrative,
  };

  const march: MarchEvent = {
    id: nextId('march'),
    fromCityId,
    toCityId,
    faction: attackerFaction,
    type: 'bombard',
  };

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: updatedFactions,
    cities: updatedCities,
    generals: updatedGenerals,
    diplomacy: updatedDiplomacy,
    chrono:
      attackerFaction === state.playerFaction
        ? {
            ...state.chrono,
            trust: clamp(state.chrono.trust + 3, 0, 100),
            divergence: clamp(state.chrono.divergence + (hasGunpowder ? 4 : 1), 0, 100),
          }
        : state.chrono,
    lastOperation: opReport,
    recentMarches: [march, ...state.recentMarches].slice(0, 6),
    chronicle: appendChronicle(state, 'battle', narrative, attackerFaction),
  };
}

export function performSowDiscord(
  state: GameState,
  attackerFaction: PlayableFactionId,
  toCityId: string,
  heroId?: string,
  consumeAP = true,
  rng: () => number = Math.random
): GameState {
  const toCity = state.cities[toCityId];
  const faction = state.factions[attackerFaction];
  if (!toCity || toCity.owner === attackerFaction) return state;
  if (faction.gold < ACTION_COSTS.discordGold) return state;
  if (consumeAP && state.actionPoints < 1) return state;

  const hasSpyglass = factionHasTech(state, attackerFaction, 'spyglass');
  const adjacentOwned = getEligibleStagingCities(state, attackerFaction, toCityId, 'adjacent');
  if (!hasSpyglass && adjacentOwned.length === 0) return state;

  const hero =
    (heroId &&
    state.generals[heroId]?.faction === attackerFaction &&
    state.generals[heroId]?.status === 'active'
      ? state.generals[heroId]
      : undefined) ||
    getFactionGenerals(state, attackerFaction)
      .filter((g) => g.status === 'active')
      .sort((a, b) => b.charisma + b.intellect - (a.charisma + a.intellect))[0];

  const skillPower = hero ? (hero.charisma + hero.intellect) / 2 : 75;
  const hasPrinting = factionHasTech(state, attackerFaction, 'printing');
  const loyaltyDrop = Math.round((13 + (skillPower - 60) * 0.25) * (hasPrinting ? 1.35 : 1.0));
  const deserters = Math.min(
    Math.max(0, toCity.troops - 500),
    Math.round((620 + skillPower * 7.5 + rng() * 250) * (hasPrinting ? 1.3 : 1.0))
  );

  const updatedCities = {
    ...state.cities,
    [toCityId]: {
      ...toCity,
      troops: Math.max(500, toCity.troops - deserters),
      support: clamp(toCity.support - SUPPORT_COST_DISCORD, 0, 100),
    },
  };

  const updatedGenerals = { ...state.generals };
  if (hero) {
    updatedGenerals[hero.id] = grantHeroXp(hero, 35);
  }

  const rulers = new Set(['caocao', 'liubei', 'sunquan']);
  const capital =
    getFactionCities(state, attackerFaction).find((c) => c.isCapital) ||
    getFactionCities(state, attackerFaction)[0];
  let defectedHeroId: string | undefined;

  for (const g of Object.values(updatedGenerals)) {
    if (g.cityId === toCityId && g.faction === toCity.owner && g.status === 'active') {
      const nextLoyalty = clamp(g.loyalty - loyaltyDrop, 0, 100);
      if (
        !defectedHeroId &&
        !rulers.has(g.id) &&
        !g.vendettaAgainst.includes(attackerFaction) &&
        nextLoyalty < 45
      ) {
        defectedHeroId = g.id;
        updatedGenerals[g.id] = {
          ...g,
          faction: attackerFaction,
          cityId: capital?.id || g.cityId,
          loyalty: 76,
        };
      } else {
        updatedGenerals[g.id] = { ...g, loyalty: nextLoyalty };
      }
    }
  }

  const updatedFactions = {
    ...state.factions,
    [attackerFaction]: { ...faction, gold: faction.gold - ACTION_COSTS.discordGold },
  };

  const defHero = defectedHeroId ? state.generals[defectedHeroId] : undefined;
  const fromCityId = adjacentOwned[0]?.id || capital?.id || toCityId;

  const narrative: LocalizedText = {
    en: `${hasPrinting ? 'Printing-Press Propaganda' : 'Espionage & Sow Discord'} in ${toCity.name.en}! ${hero ? `${hero.name.en} ` : ''}incited ${deserters.toLocaleString()} desertions & -${loyaltyDrop} enemy hero loyalty.${defHero ? ` ${defHero.name.en} DEFECTED to your banner!` : ''}`,
    zh: `${hasPrinting ? '活字传单攻心' : '离间策反'}！${hero ? `${hero.name.zh}暗施反间，` : ''}${toCity.name.zh} ${deserters.toLocaleString()} 士卒哗变溃散，守将忠诚 -${loyaltyDrop}！${defHero ? `守将${defHero.name.zh}竟临阵倒戈归顺我军！` : ''}`,
  };

  const opReport: OperationReport = {
    id: nextId('op'),
    turn: state.turn,
    type: 'discord',
    attackerFaction,
    targetCityId: toCityId,
    fromCityId,
    heroId: hero?.id,
    enemyTroopsLost: deserters,
    friendlyTroopsLost: 0,
    goldPlundered: 0,
    foodPlundered: 0,
    defenseReduced: 0,
    loyaltyReduced: loyaltyDrop,
    defectedHeroId,
    narrative,
  };

  const march: MarchEvent = {
    id: nextId('march'),
    fromCityId,
    toCityId,
    faction: attackerFaction,
    type: 'discord',
  };

  return {
    ...state,
    actionPoints: consumeAP ? state.actionPoints - 1 : state.actionPoints,
    factions: updatedFactions,
    cities: updatedCities,
    generals: updatedGenerals,
    chrono:
      attackerFaction === state.playerFaction
        ? {
            ...state.chrono,
            trust: clamp(state.chrono.trust + (defHero ? 8 : 2), 0, 100),
            divergence: clamp(state.chrono.divergence + (defHero ? 6 : 2), 0, 100),
          }
        : state.chrono,
    lastOperation: opReport,
    recentMarches: [march, ...state.recentMarches].slice(0, 6),
    chronicle: appendChronicle(state, 'hero', narrative, attackerFaction),
  };
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
  } else if (action.type === 'raid' && city && city.owner === factionId && action.targetCityId) {
    const bestGen = getBestGeneralInCity(state, city.id, factionId);
    next = performNightRaid(state, factionId, city.id, action.targetCityId, bestGen?.id, false);
  } else if (action.type === 'bombard' && city && city.owner === factionId && action.targetCityId) {
    const bestGen = getBestGeneralInCity(state, city.id, factionId);
    next = performSabotageBombard(state, factionId, city.id, action.targetCityId, bestGen?.id, false);
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
  } else if (action.type === 'farm' && city && city.owner === factionId) {
    next = performDevelopFarming(state, factionId, city.id, false);
  } else if (action.type === 'trade' && city && city.owner === factionId) {
    next = performDevelopTrade(state, factionId, city.id, false);
  } else if (action.type === 'drill' && city && city.owner === factionId) {
    next = performDrillTroops(state, factionId, city.id, false);
  } else if (action.type === 'relief' && city && city.owner === factionId) {
    next = performRelief(state, factionId, city.id, false);
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

/**
 * Turn the season. `rng` decides which cities an event befalls; pass a fixed one to make a season
 * repeatable.
 */
export function advanceSeason(state: GameState, rng: () => number = Math.random): GameState {
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
      playerCityCount >= COALITION_CITY_THRESHOLD ||
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
    if (city.owner === 'neutral' && city.troops < NEUTRAL_GARRISON_CAP) {
      nextCities[city.id] = { ...city, troops: city.troops + 300 };
    }
  }

  // 7. The garrison and the people of every held city: drill settles back toward the middle,
  //    support moves toward what the city's best-liked general inspires, and a city in unrest
  //    loses part of its garrison to desertion.
  const humanFactions: FactionId[] = state.multiplayer?.humanFactions ?? [state.playerFaction];
  for (const city of Object.values(nextCities)) {
    if (city.owner === 'neutral') {
      // A free city has no governor and no events, but its people still patch a broken wall.
      if (city.wallScar) {
        nextCities[city.id] = { ...city, wallScar: city.wallScar > 1 ? city.wallScar - 1 : undefined };
      }
      continue;
    }
    const bestCharisma = Object.values(nextGenerals)
      .filter((g) => g.cityId === city.id && g.faction === city.owner && g.status === 'active')
      .reduce((max, g) => Math.max(max, g.charisma), 0);
    const deserters = unrestDeserters(city);
    let settled: City = {
      ...city,
      troops: city.troops - deserters,
      drill: driftToward(city.drill, 50, DRILL_SEASON_DRIFT),
      support: driftToward(city.support, supportRestingLevel(bestCharisma), SUPPORT_SEASON_DRIFT),
    };

    // The governor's season: one aspect of the city moves forward without an order being spent.
    // A post whose holder has left the city or the realm is cleared; a wounded governor keeps it.
    const holder = city.governorId ? state.generals[city.governorId] : undefined;
    if (city.governorId && !(holder && holder.cityId === city.id && holder.faction === city.owner &&
        (holder.status === 'active' || holder.status === 'wounded'))) {
      settled = { ...settled, governorId: undefined };
    }
    // A riot stops every work but the winning back of the people.
    const plan = governorPlanOf(state, city.id);
    if (plan && !(city.event?.kind === 'riot' && plan.task !== 'relief')) {
      const worked = applyGovernorSeason(city, settled, plan);
      settled = worked.city;
      if (worked.completed?.task === 'walls') settled = { ...settled, wallScar: undefined };
      if (worked.completed) {
        nextGenerals[plan.general.id] = grantHeroXp(nextGenerals[plan.general.id], 10);
        if (humanFactions.includes(city.owner)) {
          const { task, level } = worked.completed;
          const who = plan.general.name;
          pushLog(
            'economy',
            task === 'farming'
              ? {
                  en: `Governor ${who.en} finished new fields at ${city.name.en}: Farming Lv.${level}.`,
                  zh: `${city.name.zh}太守${who.zh}垦田功成，农业升至 ${level} 级。`,
                }
              : task === 'trade'
                ? {
                    en: `Governor ${who.en} finished the new market at ${city.name.en}: Trade Lv.${level}.`,
                    zh: `${city.name.zh}太守${who.zh}兴市功成，商业升至 ${level} 级。`,
                  }
                : {
                    en: `Governor ${who.en} finished the works on ${city.name.en}'s walls: Defense Lv.${level}.`,
                    zh: `${city.name.zh}太守${who.zh}修城功成，城防升至 ${level} 级。`,
                  },
            city.owner
          );
        }
      }
    }
    // Broken walls are slowly patched; an event runs its course, and a new one may begin.
    if (settled.wallScar) {
      settled = { ...settled, wallScar: settled.wallScar > 1 ? settled.wallScar - 1 : undefined };
    }
    if (settled.event) {
      const left = settled.event.seasonsLeft - 1;
      settled = { ...settled, event: left > 0 ? { ...settled.event, seasonsLeft: left } : undefined };
    }
    const roll = rng();
    if (!settled.event) {
      const kind = rollCityEvent(state, settled, nextSeason, roll);
      if (kind) {
        const begun = beginCityEvent(state, settled, kind);
        settled = begun.city;
        if (humanFactions.includes(city.owner)) {
          pushLog('economy', cityEventChronicle(city, kind, begun.troopsLost), city.owner);
        }
      }
    }
    nextCities[city.id] = settled;
    if (deserters > 0) {
      pushLog(
        'economy',
        {
          en: `Unrest in ${city.name.en}: with the people's support at ${city.support}, ${deserters.toLocaleString()} of the garrison deserted.`,
          zh: `${city.name.zh}民怨沸腾（民心 ${city.support}），守军逃散 ${deserters.toLocaleString()} 人。`,
        },
        city.owner
      );
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

  let nextMultiplayer = state.multiplayer;
  if (nextMultiplayer) {
    const tickedChronos: Record<PlayableFactionId, ChronoState> = {
      wei: { ...nextMultiplayer.factionChronos.wei },
      shu: { ...nextMultiplayer.factionChronos.shu },
      wu: { ...nextMultiplayer.factionChronos.wu },
    };
    for (const fid of ['wei', 'shu', 'wu'] as PlayableFactionId[]) {
      const prevC = fid === state.playerFaction ? state.chrono : tickedChronos[fid];
      const unlocked = [...prevC.unlockedTechs];
      for (const tid of nextRivalTechs[fid] ?? []) {
        if (!unlocked.includes(tid)) unlocked.push(tid);
      }
      tickedChronos[fid] = {
        ...prevC,
        innovationPoints: prevC.innovationPoints + 1,
        techFrozenTurns: Math.max(0, prevC.techFrozenTurns - 1),
        suspicion: clamp(prevC.suspicion - 5, 0, 100),
        coalitionActive,
        unlockedTechs: unlocked,
        rivalTechs: nextRivalTechs,
        pendingTechCopies: remainingCopies,
      };
    }
    nextMultiplayer = {
      ...nextMultiplayer,
      factionChronos: tickedChronos,
    };
  }

  let nextState: GameState = checkVictoryState({
    ...state,
    turn: nextTurn,
    year: nextYear,
    season: nextSeason,
    factions: nextFactions,
    cities: nextCities,
    generals: nextGenerals,
    diplomacy: nextDiplomacy,
    chrono: nextMultiplayer ? nextMultiplayer.factionChronos[state.playerFaction] : nextChrono,
    chronicle: nextChronicle,
    ...(nextMultiplayer ? { multiplayer: nextMultiplayer } : {}),
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
