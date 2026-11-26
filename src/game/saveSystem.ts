import { ASPECT_MAX_LEVEL, DRILL_START, SUPPORT_START } from './cityAspects.js';
import { CITY_EVENT_KINDS } from './cityEvents.js';
import {
  createInitialCities,
  createInitialDiplomacy,
  createInitialFactions,
  createInitialGenerals,
} from './data.js';
import { createDefaultChronoState, createDefaultPlayerProfile } from './engine.js';
import { GOVERNOR_FOCI, WORKS_PER_LEVEL } from './governors.js';
import type { TacticalBattleConfig, TacticalBattleState } from './tacticalTypes.js';
import type {
  AIProviderId,
  AIRequestConfig,
  AITurnAction,
  City,
  CityEventKind,
  FactionState,
  GameState,
  General,
  GovernorFocus,
  Language,
  LocalizedText,
  OperationReport,
  PlayableFactionId,
  Season,
  TravelerAvatarId,
} from './types.js';

export const SAVE_SCHEMA_VERSION = 1;
export const MAX_SAVED_CHRONICLE_ENTRIES = 200;

export type SaveSlotId = 'autosave' | 'slot-1' | 'slot-2' | 'slot-3' | 'slot-4' | 'slot-5';

export const MANUAL_SAVE_SLOT_IDS: SaveSlotId[] = [
  'slot-1',
  'slot-2',
  'slot-3',
  'slot-4',
  'slot-5',
];

export const ALL_SAVE_SLOT_IDS: SaveSlotId[] = ['autosave', ...MANUAL_SAVE_SLOT_IDS];

export function isValidSaveSlotId(value: string): value is SaveSlotId {
  return (ALL_SAVE_SLOT_IDS as string[]).includes(value);
}

export type SavedRightTab = 'city' | 'heroes' | 'tech' | 'advisor' | 'diplomacy' | 'chronicle';

export interface SavedUiContext {
  selectedCityId: string | null;
  activeTab: SavedRightTab;
  sheetOpen: boolean;
}

export interface SerializedRivalOrder {
  faction: PlayableFactionId;
  byStaff: boolean;
}

export interface SerializedWarQueueSnapshot {
  battleReport?: GameState['lastBattle'];
  operationReport?: OperationReport | null;
  fromCityId: string;
  toCityId: string;
  pincerFromCityId?: string;
  isRiverStrike?: boolean;
  isPlayerDefending?: boolean;
}

export interface SerializedPendingRivalTurn {
  remainingAiFactions: SerializedRivalOrder[];
  accumulatedWarSnapshots: SerializedWarQueueSnapshot[];
}

export interface SerializedIncomingDefense {
  attackerFaction: PlayableFactionId;
  fromCityId: string;
  toCityId: string;
  troops: number;
  action: AITurnAction;
  proclamation?: string;
  remainingAiFactions: SerializedRivalOrder[];
  accumulatedWarSnapshots: SerializedWarQueueSnapshot[];
}

export interface SavedMidSessionState {
  activeTactical?: {
    config: TacticalBattleConfig;
    battleState?: TacticalBattleState;
    pendingRivalTurn?: SerializedPendingRivalTurn;
  };
  incomingDefense?: SerializedIncomingDefense;
}

export interface SaveSlotSummary {
  slotId: SaveSlotId;
  kind: 'autosave' | 'manual';
  label: string;
  savedAt: string;
  playerFaction: PlayableFactionId;
  playerName: string;
  playerAvatar: TravelerAvatarId;
  year: number;
  season: Season;
  turn: number;
  citiesOwned: number;
  totalCities: number;
  totalTroops: number;
  gold: number;
  food: number;
  divergence: number;
  hasActiveBattle: boolean;
  activeBattleCityName?: LocalizedText;
  winner: PlayableFactionId | null;
  isPlayerDefeated: boolean;
}

export interface SaveEnvelopeV1 {
  version: typeof SAVE_SCHEMA_VERSION;
  slotId: SaveSlotId;
  label: string;
  savedAt: string;
  summary: SaveSlotSummary;
  state: GameState;
  ui: SavedUiContext;
  session?: SavedMidSessionState;
}

export interface PersistedUserPreferences {
  lang?: Language;
  aiConfig?: {
    provider: AIProviderId;
    model?: string;
    baseUrl?: string;
  };
}

/** Strips any secret API keys before storing preferences to SQLite, localStorage, or JSON. */
export function sanitizeUserPreferences(input: {
  lang?: Language;
  aiConfig?: AIRequestConfig;
}): PersistedUserPreferences {
  const out: PersistedUserPreferences = {};
  if (input.lang === 'en' || input.lang === 'zh') {
    out.lang = input.lang;
  }
  if (input.aiConfig) {
    const p = input.aiConfig.provider;
    if (
      p === 'auto' ||
      p === 'gemini' ||
      p === 'openai' ||
      p === 'anthropic' ||
      p === 'heuristic'
    ) {
      out.aiConfig = {
        provider: p,
        ...(input.aiConfig.model?.trim() ? { model: input.aiConfig.model.trim() } : {}),
        ...(input.aiConfig.baseUrl?.trim() ? { baseUrl: input.aiConfig.baseUrl.trim() } : {}),
      };
    }
  }
  return out;
}

export function computeSaveSummary(
  slotId: SaveSlotId,
  state: GameState,
  opts?: {
    label?: string;
    savedAt?: string;
    session?: SavedMidSessionState;
  }
): SaveSlotSummary {
  const savedAt = opts?.savedAt ?? new Date().toISOString();
  const cityList = Object.values(state.cities);
  const owned = cityList.filter((c) => c.owner === state.playerFaction);
  const totalTroops = owned.reduce((sum, c) => sum + c.troops, 0);
  const factionState = state.factions[state.playerFaction];
  const activeTac = opts?.session?.activeTactical;
  const incomingDef = opts?.session?.incomingDefense;
  const hasActiveBattle = Boolean(activeTac || incomingDef);
  const battleCityId = activeTac?.config.toCityId ?? incomingDef?.toCityId;
  const activeBattleCityName = battleCityId ? state.cities[battleCityId]?.name : undefined;

  const defaultLabel = `${factionState.shortName.en} · ${state.year} AD · T${state.turn}`;
  const label = opts?.label?.trim() || defaultLabel;

  return {
    slotId,
    kind: slotId === 'autosave' ? 'autosave' : 'manual',
    label,
    savedAt,
    playerFaction: state.playerFaction,
    playerName: state.playerProfile?.name || '',
    playerAvatar: state.playerProfile?.avatar === 'female' ? 'female' : 'male',
    year: state.year,
    season: state.season,
    turn: state.turn,
    citiesOwned: owned.length,
    totalCities: cityList.length,
    totalTroops,
    gold: factionState?.gold ?? 0,
    food: factionState?.food ?? 0,
    divergence: state.chrono?.divergence ?? 0,
    hasActiveBattle,
    ...(activeBattleCityName ? { activeBattleCityName } : {}),
    winner: state.winner ?? null,
    isPlayerDefeated: Boolean(state.isPlayerDefeated),
  };
}

export function buildSaveEnvelope(
  slotId: SaveSlotId,
  state: GameState,
  ui: SavedUiContext,
  opts?: {
    label?: string;
    savedAt?: string;
    session?: SavedMidSessionState;
  }
): SaveEnvelopeV1 {
  const savedAt = opts?.savedAt ?? new Date().toISOString();
  const trimmedState: GameState = {
    ...state,
    chronicle: Array.isArray(state.chronicle)
      ? state.chronicle.slice(0, MAX_SAVED_CHRONICLE_ENTRIES)
      : [],
  };
  const summary = computeSaveSummary(slotId, trimmedState, {
    label: opts?.label,
    savedAt,
    session: opts?.session,
  });
  return {
    version: SAVE_SCHEMA_VERSION,
    slotId,
    label: summary.label,
    savedAt,
    summary,
    state: trimmedState,
    ui: {
      selectedCityId: ui.selectedCityId ?? null,
      activeTab: ui.activeTab ?? 'heroes',
      sheetOpen: Boolean(ui.sheetOpen),
    },
    ...(opts?.session && (opts.session.activeTactical || opts.session.incomingDefense)
      ? { session: opts.session }
      : {}),
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const VALID_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const VALID_FACTIONS: PlayableFactionId[] = ['wei', 'shu', 'wu'];
const VALID_TABS: SavedRightTab[] = ['city', 'heroes', 'tech', 'advisor', 'diplomacy', 'chronicle'];

function levelOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(ASPECT_MAX_LEVEL, Math.round(value)))
    : fallback;
}

function scoreOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

/**
 * One saved city over its fresh catalogue entry. A save from before cities had farming, trade,
 * drill and support carries a single `development` level instead: farming and trade both take
 * that level, and drill and support start in the middle.
 */
function hydrateCity(cid: string, baseCity: City, savedC: Record<string, unknown>): City {
  const { development: legacyLevel, ...saved } = savedC as Partial<City> & { development?: unknown };
  const legacy = levelOr(legacyLevel, NaN);
  // A governor's post, instruction and half-finished works are kept only in a form the rules accept.
  const { governorId, focus, works, event, wallScar, ...plain } = saved;
  const keptEvent =
    isObject(event) &&
    CITY_EVENT_KINDS.includes(event.kind as CityEventKind) &&
    typeof event.seasonsLeft === 'number' &&
    event.seasonsLeft >= 1
      ? { kind: event.kind as CityEventKind, seasonsLeft: Math.min(4, Math.round(event.seasonsLeft)) }
      : undefined;
  const keptWorks: NonNullable<City['works']> = {};
  if (isObject(works)) {
    for (const task of ['farming', 'trade', 'walls'] as const) {
      const n = (works as Record<string, unknown>)[task];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
        keptWorks[task] = Math.min(WORKS_PER_LEVEL - 1, Math.round(n));
      }
    }
  }
  return {
    ...baseCity,
    ...plain,
    ...(typeof governorId === 'string' && governorId ? { governorId } : {}),
    ...(GOVERNOR_FOCI.includes(focus as GovernorFocus) ? { focus: focus as GovernorFocus } : {}),
    ...(Object.keys(keptWorks).length > 0 ? { works: keptWorks } : {}),
    ...(keptEvent ? { event: keptEvent } : {}),
    ...(typeof wallScar === 'number' && wallScar >= 1 ? { wallScar: Math.min(6, Math.round(wallScar)) } : {}),
    id: cid,
    neighbors: Array.isArray(saved.neighbors) ? (saved.neighbors as string[]) : baseCity.neighbors,
    farming: levelOr(saved.farming, Number.isNaN(legacy) ? baseCity.farming : legacy),
    trade: levelOr(saved.trade, Number.isNaN(legacy) ? baseCity.trade : legacy),
    drill: scoreOr(saved.drill, DRILL_START),
    support: scoreOr(saved.support, SUPPORT_START),
  };
}

/**
 * Validates an untrusted JSON object and hydrates missing defaults so saves remain forward-compatible
 * across game updates while rejecting malformed or corrupted payloads cleanly.
 */
export function validateAndHydrateGameState(raw: unknown): GameState {
  if (!isObject(raw)) {
    throw new Error('Invalid GameState: expected object');
  }
  const playerFaction = raw.playerFaction;
  if (typeof playerFaction !== 'string' || !VALID_FACTIONS.includes(playerFaction as PlayableFactionId)) {
    throw new Error('Invalid GameState: unknown playerFaction');
  }
  const pf = playerFaction as PlayableFactionId;
  const season = VALID_SEASONS.includes(raw.season as Season) ? (raw.season as Season) : 'spring';
  const turn = typeof raw.turn === 'number' && Number.isFinite(raw.turn) && raw.turn >= 1 ? Math.floor(raw.turn) : 1;
  const year = typeof raw.year === 'number' && Number.isFinite(raw.year) && raw.year >= 180 ? Math.floor(raw.year) : 214;

  if (!isObject(raw.cities) || !isObject(raw.factions) || !isObject(raw.generals)) {
    throw new Error('Invalid GameState: missing cities, factions, or generals');
  }

  // Merge over fresh initial catalogs so newly introduced properties/cities/heroes always exist
  const baseFactions = createInitialFactions();
  const hydratedFactions: Record<PlayableFactionId, FactionState> = { ...baseFactions };
  for (const fid of VALID_FACTIONS) {
    const savedF = raw.factions[fid];
    if (isObject(savedF)) {
      hydratedFactions[fid] = {
        ...baseFactions[fid],
        ...(savedF as Partial<FactionState>),
        id: fid,
      };
    }
  }

  const baseCities = createInitialCities();
  const hydratedCities: Record<string, City> = {};
  for (const [cid, baseCity] of Object.entries(baseCities)) {
    const savedC = raw.cities[cid];
    hydratedCities[cid] = isObject(savedC) ? hydrateCity(cid, baseCity, savedC) : baseCity;
  }

  const baseGenerals = createInitialGenerals();
  const hydratedGenerals: Record<string, General> = {};
  for (const [gid, baseGen] of Object.entries(baseGenerals)) {
    const savedG = raw.generals[gid];
    hydratedGenerals[gid] = isObject(savedG)
      ? {
          ...baseGen,
          ...(savedG as Partial<General>),
          id: gid,
          vendettaAgainst: Array.isArray((savedG as Partial<General>).vendettaAgainst)
            ? ((savedG as Partial<General>).vendettaAgainst as PlayableFactionId[])
            : baseGen.vendettaAgainst,
        }
      : baseGen;
  }

  const baseDiplomacy = createInitialDiplomacy();
  const hydratedDiplomacy = { ...baseDiplomacy };
  if (isObject(raw.diplomacy)) {
    for (const [k, baseRel] of Object.entries(baseDiplomacy)) {
      if (isObject(raw.diplomacy[k])) {
        hydratedDiplomacy[k] = {
          ...baseRel,
          ...(raw.diplomacy[k] as Partial<typeof baseRel>),
        };
      }
    }
  }

  const baseChrono = createDefaultChronoState();
  const rawChrono = isObject(raw.chrono) ? raw.chrono : {};
  const hydratedChrono = {
    ...baseChrono,
    ...(rawChrono as Partial<typeof baseChrono>),
    unlockedTechs: Array.isArray(rawChrono.unlockedTechs) ? rawChrono.unlockedTechs : [],
    rivalTechs: {
      wei: Array.isArray((rawChrono.rivalTechs as Record<string, unknown>)?.wei)
        ? ((rawChrono.rivalTechs as Record<string, unknown>).wei as typeof baseChrono.unlockedTechs)
        : [],
      shu: Array.isArray((rawChrono.rivalTechs as Record<string, unknown>)?.shu)
        ? ((rawChrono.rivalTechs as Record<string, unknown>).shu as typeof baseChrono.unlockedTechs)
        : [],
      wu: Array.isArray((rawChrono.rivalTechs as Record<string, unknown>)?.wu)
        ? ((rawChrono.rivalTechs as Record<string, unknown>).wu as typeof baseChrono.unlockedTechs)
        : [],
    },
    pendingTechCopies: Array.isArray(rawChrono.pendingTechCopies) ? rawChrono.pendingTechCopies : [],
    triggeredEventIds: Array.isArray(rawChrono.triggeredEventIds) ? rawChrono.triggeredEventIds : [],
  };

  const rawProfile = isObject(raw.playerProfile) ? raw.playerProfile : {};
  const avatar: TravelerAvatarId = rawProfile.avatar === 'female' ? 'female' : 'male';
  const name = typeof rawProfile.name === 'string' ? rawProfile.name : '';
  const defaultProfile = createDefaultPlayerProfile(avatar, name);
  const playerProfile = {
    ...defaultProfile,
    ...(typeof rawProfile.portrait === 'string' && rawProfile.portrait ? { portrait: rawProfile.portrait } : {}),
  };

  const actionPoints =
    typeof raw.actionPoints === 'number' && Number.isFinite(raw.actionPoints)
      ? Math.max(0, Math.floor(raw.actionPoints))
      : 3;
  const maxActionPoints =
    typeof raw.maxActionPoints === 'number' && Number.isFinite(raw.maxActionPoints)
      ? Math.max(1, Math.floor(raw.maxActionPoints))
      : Math.max(3, actionPoints);

  const chronicle = Array.isArray(raw.chronicle)
    ? (raw.chronicle.slice(0, MAX_SAVED_CHRONICLE_ENTRIES) as GameState['chronicle'])
    : [];

  return {
    turn,
    year,
    season,
    playerFaction: pf,
    playerProfile,
    actionPoints,
    maxActionPoints,
    factions: hydratedFactions,
    cities: hydratedCities,
    generals: hydratedGenerals,
    diplomacy: hydratedDiplomacy,
    chrono: hydratedChrono,
    activeEvent: isObject(raw.activeEvent) ? (raw.activeEvent as unknown as GameState['activeEvent']) : null,
    chronicle,
    lastBattle: isObject(raw.lastBattle) ? (raw.lastBattle as unknown as GameState['lastBattle']) : null,
    lastOperation: isObject(raw.lastOperation)
      ? (raw.lastOperation as unknown as GameState['lastOperation'])
      : null,
    recentMarches: Array.isArray(raw.recentMarches)
      ? (raw.recentMarches as GameState['recentMarches'])
      : [],
    winner:
      typeof raw.winner === 'string' && VALID_FACTIONS.includes(raw.winner as PlayableFactionId)
        ? (raw.winner as PlayableFactionId)
        : null,
    isPlayerDefeated: Boolean(raw.isPlayerDefeated),
    ...(isObject(raw.multiplayer)
      ? { multiplayer: raw.multiplayer as unknown as GameState['multiplayer'] }
      : {}),
  };
}

export function validateAndHydrateSave(
  raw: unknown,
  overrideSlotId?: SaveSlotId
): SaveEnvelopeV1 {
  if (!isObject(raw)) {
    throw new Error('Invalid save data: expected JSON object');
  }
  // Support both full SaveEnvelopeV1 and raw GameState objects if imported directly
  const rawState = isObject(raw.state) ? raw.state : raw;
  const state = validateAndHydrateGameState(rawState);

  const slotId: SaveSlotId =
    overrideSlotId ??
    (typeof raw.slotId === 'string' && isValidSaveSlotId(raw.slotId) ? raw.slotId : 'slot-1');

  const rawUi = isObject(raw.ui) ? raw.ui : {};
  const activeTab: SavedRightTab = VALID_TABS.includes(rawUi.activeTab as SavedRightTab)
    ? (rawUi.activeTab as SavedRightTab)
    : 'heroes';
  const selectedCityId =
    typeof rawUi.selectedCityId === 'string' && state.cities[rawUi.selectedCityId]
      ? rawUi.selectedCityId
      : Object.values(state.cities).find((c) => c.owner === state.playerFaction && c.isCapital)?.id ??
        Object.values(state.cities).find((c) => c.owner === state.playerFaction)?.id ??
        null;

  const ui: SavedUiContext = {
    selectedCityId,
    activeTab,
    sheetOpen: typeof rawUi.sheetOpen === 'boolean' ? rawUi.sheetOpen : true,
  };

  let session: SavedMidSessionState | undefined;
  if (isObject(raw.session)) {
    const s: SavedMidSessionState = {};
    if (isObject(raw.session.activeTactical) && isObject(raw.session.activeTactical.config)) {
      s.activeTactical = raw.session.activeTactical as unknown as SavedMidSessionState['activeTactical'];
    }
    if (isObject(raw.session.incomingDefense)) {
      s.incomingDefense = raw.session.incomingDefense as unknown as SerializedIncomingDefense;
    }
    if (s.activeTactical || s.incomingDefense) {
      session = s;
    }
  }

  const savedAt =
    typeof raw.savedAt === 'string' && !Number.isNaN(Date.parse(raw.savedAt))
      ? raw.savedAt
      : new Date().toISOString();
  const label = typeof raw.label === 'string' ? raw.label : undefined;

  return buildSaveEnvelope(slotId, state, ui, { label, savedAt, session });
}

export function serializeSaveForDownload(envelope: SaveEnvelopeV1): {
  filename: string;
  json: string;
} {
  const safeFaction = envelope.state.playerFaction;
  const filename = `three-kingdoms-${safeFaction}-${envelope.state.year}AD-T${envelope.state.turn}.json`;
  return {
    filename,
    json: JSON.stringify(envelope, null, 2),
  };
}

export function parseImportedSaveJson(
  jsonText: string,
  targetSlotId: SaveSlotId = 'slot-1'
): SaveEnvelopeV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON file');
  }
  return validateAndHydrateSave(parsed, targetSlotId);
}
