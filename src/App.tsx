import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Castle,
  Clock,
  Crown,
  FlaskConical,
  Grid2x2,
  Handshake,
  ScrollText,
  ShieldAlert,
  Skull,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { AdvisorPanel } from './components/AdvisorPanel.js';
import { AuthModal } from './components/AuthModal.js';
import { BattleReportModal } from './components/BattleModal.js';
import { ChronicleLog } from './components/ChronicleLog.js';
import { CityPanel } from './components/CityPanel.js';
import { CityView } from './components/CityView.js';
import { DISTRICT_ORDER, type DistrictId } from './components/city/cityLayout.js';
import { DiplomacyPanel } from './components/DiplomacyPanel.js';
import { DuelModal } from './components/DuelModal.js';
import { FactionSelect } from './components/FactionSelect.js';
import { HeroEventModal } from './components/HeroEventModal.js';
import { HeroRecruitModal } from './components/HeroRecruitModal.js';
import { HeroesPanel } from './components/HeroesPanel.js';
import {
  MilitaryModal,
  type OrderRoutePreview,
  OperationReportModal,
  type ExecuteMilitaryPayload,
} from './components/MilitaryModal.js';
import { MultiplayerModal } from './components/MultiplayerModal.js';
import { SaveLoadModal } from './components/SaveLoadModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { StrategyMap, type ActiveMapMarch } from './components/StrategyMap.js';
import { TacticalBattleModal } from './components/TacticalBattleModal.js';
import { TechLabPanel } from './components/TechLabPanel.js';
import { ProvinceRegister } from './components/ProvinceRegister.js';
import { RealmTable } from './components/RealmTable.js';
import { TopBar } from './components/TopBar.js';
import { SeasonBanner } from './components/ui/SeasonBanner.js';
import { WarSceneModal, type WarSceneConfig } from './components/WarSceneModal.js';
import { rivalOrdersForRealmSize } from './game/data.js';
import {
  advanceSeason,
  applyDiplomacyOutcome,
  applyHeroEncounterOutcome,
  applyTacticalBattleOutcome,
  buildAssaultConfig,
  createDefaultPlayerProfile,
  createNewGame,
  executeAITurnAction,
  factionHasTech,
  getCityGenerals,
  performAppointGovernor,
  performAttackCity,
  performDevelopFarming,
  performDevelopTrade,
  performDrillTroops,
  performFortifyCity,
  performNightRaid,
  performPrisonerAction,
  performRecruitTroops,
  performReinforceCity,
  performRelief,
  performRelocateHero,
  performResearchTech,
  performSetGovernorFocus,
  performRewardHero,
  performSabotageBombard,
  performSowDiscord,
  projectStateForViewer,
  resolveStoryEventChoice,
  syncMultiplayerActiveFaction,
} from './game/engine.js';
import {
  buildSaveEnvelope,
  type SaveEnvelopeV1,
  type SaveSlotId,
  type SaveSlotSummary,
  type SavedMidSessionState,
  type SerializedPendingRivalTurn,
} from './game/saveSystem.js';
import type {
  TacticalBattleConfig,
  TacticalBattleOutcome,
  TacticalBattleState,
} from './game/tacticalTypes.js';
import type {
  AIProviderStatus,
  AIRequestConfig,
  AITurnAction,
  BattleReport,
  DiplomacyProposalType,
  DiplomacyResponse,
  DomesticOrder,
  DuelResult,
  FactionId,
  GameState,
  GovernorFocus,
  HeroEncounterMode,
  HeroEncounterResponse,
  Language,
  LocalizedText,
  MilitaryActionType,
  OperationReport,
  PlayableFactionId,
  PlayerProfile,
  TechId,
} from './game/types.js';
import { UI_TEXT, tLoc } from './i18n/translations.js';
import { fetchProviders, requestAITurnDecision } from './services/aiClient.js';
import {
  commitMultiplayerState,
  deleteSoloSave,
  fetchMultiplayerRoom,
  initAuthSession,
  listMultiplayerRooms,
  listSoloSaves,
  loadCachedPreferences,
  loadSoloSave,
  putSoloSave,
  subscribeToRoomEvents,
  triggerSaveFileDownload,
  updateServerPreferences,
  type ClientUser,
  type MultiplayerRoomSummary,
} from './services/persistenceClient.js';
import { battleAudio } from './utils/battleAudio.js';

type RightTab = 'city' | 'heroes' | 'tech' | 'advisor' | 'diplomacy' | 'chronicle';

/** How long an army is shown riding across the map before its battle opens. */
const MAP_MARCH_MS = 1500;

interface WarTheaterQueueItem {
  scene: WarSceneConfig;
  march: ActiveMapMarch;
  battleReport?: BattleReport;
  operationReport?: OperationReport;
}

type WarStage = 'idle' | 'march' | 'theater' | 'report';

function buildBattleWarItem(
  state: GameState,
  battle: BattleReport,
  opts?: { pincerFromCityId?: string; isRiverStrike?: boolean; isPlayerDefending?: boolean }
): WarTheaterQueueItem {
  const atkHero = battle.attackerGeneralId ? state.generals[battle.attackerGeneralId] : undefined;
  const deputyHero = battle.deputyGeneralId ? state.generals[battle.deputyGeneralId] : undefined;
  const defHero = battle.defenderGeneralId ? state.generals[battle.defenderGeneralId] : undefined;
  const targetCity = state.cities[battle.toCityId];
  const fromCity = state.cities[battle.fromCityId];
  const isPlayerDefending = Boolean(opts?.isPlayerDefending);

  const mode: WarSceneConfig['mode'] = opts?.isRiverStrike
    ? 'river_strike'
    : opts?.pincerFromCityId
      ? 'pincer'
      : 'assault';

  const scene: WarSceneConfig = {
    id: `war-${battle.id}`,
    mode,
    attackerFaction: battle.attackerFaction,
    defenderFaction: battle.defenderFaction,
    fromCityId: battle.fromCityId,
    toCityId: battle.toCityId,
    pincerFromCityId: opts?.pincerFromCityId,
    terrain: targetCity?.terrain || 'plains',
    tactic: battle.tactic,
    attackerHero: atkHero,
    deputyHero,
    defenderHero: defHero,
    skillTriggered: battle.skillTriggered,
    attackerStartTroops: battle.attackerStartTroops,
    defenderStartTroops: battle.defenderStartTroops,
    attackerLosses: battle.attackerLosses,
    defenderLosses: battle.defenderLosses,
    attackerWon: battle.captured,
    isPlayerDefending,
    hasGunpowder: factionHasTech(state, battle.attackerFaction, 'gunpowder'),
    hasStirrups: factionHasTech(state, battle.attackerFaction, 'stirrups'),
    hasSteamship: factionHasTech(state, battle.attackerFaction, 'steamship'),
    hasBalloon: factionHasTech(state, battle.attackerFaction, 'balloon'),
    summaryText: battle.narrative,
  };

  const atkShort = state.factions[battle.attackerFaction].shortName;
  const targetName = targetCity?.name || { en: battle.toCityId, zh: battle.toCityId };
  const fromName = fromCity?.name || atkShort;

  const march: ActiveMapMarch = {
    id: `march-${battle.id}`,
    fromCityId: battle.fromCityId,
    toCityId: battle.toCityId,
    pincerFromCityId: opts?.pincerFromCityId,
    faction: battle.attackerFaction,
    mode,
    heroPortrait: atkHero?.portrait,
    isPlayerDefending,
    label: isPlayerDefending
      ? {
          en: `ENEMY ASSAULT! ${atkShort.en} marches on ${targetName.en}!`,
          zh: `敌军来袭！${atkShort.zh}军发兵猛攻${targetName.zh}！`,
        }
      : mode === 'pincer'
        ? {
            en: `Joint Pincer columns converging on ${targetName.en}!`,
            zh: `多路大军合围进逼${targetName.zh}！`,
          }
        : mode === 'river_strike'
          ? {
              en: `Yangtze fleet sailing from ${fromName.en} to ${targetName.en}!`,
              zh: `长江水师自${fromName.zh}顺流奇袭${targetName.zh}！`,
            }
          : {
              en: `${atkShort.en} army marching from ${fromName.en} to ${targetName.en}!`,
              zh: `${atkShort.zh}军自${fromName.zh}挥师进击${targetName.zh}！`,
            },
  };

  return { scene, march, battleReport: battle };
}

function buildOperationWarItem(
  state: GameState,
  op: OperationReport,
  preFromTroops: number,
  preTargetTroops: number,
  preTargetOwner: FactionId,
  isPlayerDefending = false
): WarTheaterQueueItem {
  const atkHero = op.heroId ? state.generals[op.heroId] : undefined;
  const targetCity = state.cities[op.targetCityId];
  const defHero = getCityGenerals(state, op.targetCityId)[0];
  const fromCityId = op.fromCityId || op.targetCityId;

  const startAtk =
    op.type === 'raid'
      ? Math.max(1200, Math.round(preFromTroops * 0.25))
      : op.type === 'bombard'
        ? Math.max(1500, Math.round(preFromTroops * 0.2))
        : 600;
  const startDef = Math.max(op.enemyTroopsLost, preTargetTroops);

  const succeeded =
    op.type === 'discord'
      ? Boolean(op.defectedHeroId) || op.loyaltyReduced >= 15
      : op.enemyTroopsLost > op.friendlyTroopsLost || op.defenseReduced > 0;

  const scene: WarSceneConfig = {
    id: `war-${op.id}`,
    mode: op.type,
    attackerFaction: op.attackerFaction,
    defenderFaction: preTargetOwner,
    fromCityId,
    toCityId: op.targetCityId,
    terrain: targetCity?.terrain || 'plains',
    attackerHero: atkHero,
    defenderHero: defHero,
    attackerStartTroops: startAtk,
    defenderStartTroops: startDef,
    attackerLosses: op.friendlyTroopsLost,
    defenderLosses: op.enemyTroopsLost,
    attackerWon: succeeded,
    isPlayerDefending,
    hasGunpowder: factionHasTech(state, op.attackerFaction, 'gunpowder'),
    hasStirrups: factionHasTech(state, op.attackerFaction, 'stirrups'),
    hasSteamship: factionHasTech(state, op.attackerFaction, 'steamship'),
    hasBalloon: factionHasTech(state, op.attackerFaction, 'balloon'),
    summaryText: op.narrative,
  };

  const atkShort = state.factions[op.attackerFaction].shortName;
  const targetName = targetCity?.name || { en: op.targetCityId, zh: op.targetCityId };

  const labelByType: Record<OperationReport['type'], LocalizedText> = {
    raid: isPlayerDefending
      ? {
          en: `NIGHT RAID! ${atkShort.en} ambushes ${targetName.en}!`,
          zh: `夜袭警报！${atkShort.zh}奇兵劫营${targetName.zh}！`,
        }
      : {
          en: `Night Raid force striking ${targetName.en}!`,
          zh: `轻骑夜袭奔袭${targetName.zh}敌营！`,
        },
    bombard: isPlayerDefending
      ? {
          en: `BOMBARDMENT! ${atkShort.en} shells ${targetName.en}!`,
          zh: `城墙告急！${atkShort.zh}军烈火轰击${targetName.zh}！`,
        }
      : {
          en: `Fire & Black Powder barrage targeting ${targetName.en}!`,
          zh: `雷火投石车阵猛轰${targetName.zh}城防！`,
        },
    discord: {
      en: `Covert agents infiltrating ${targetName.en}!`,
      zh: `密探潜入${targetName.zh}施行离间策反！`,
    },
  };

  const march: ActiveMapMarch = {
    id: `march-${op.id}`,
    fromCityId,
    toCityId: op.targetCityId,
    faction: op.attackerFaction,
    mode: op.type,
    heroPortrait: atkHero?.portrait,
    isPlayerDefending,
    label: labelByType[op.type],
  };

  return { scene, march, operationReport: op };
}

const DEFAULT_PROVIDERS: AIProviderStatus[] = [
  { id: 'gemini', name: 'Google Gemini', configured: false, model: 'gemini-4-hydrogen' },
  { id: 'openai', name: 'OpenAI / Compatible', configured: false, model: 'gpt-4o-mini' },
  { id: 'anthropic', name: 'Anthropic Claude', configured: false, model: 'claude-sonnet-4-20250514' },
  {
    id: 'heuristic',
    name: 'Built-in Tactical AI',
    configured: true,
    model: 'three-kingdoms-heuristic-v1',
  },
];

/**
 * One order a rival realm carries out at the end of a season. A realm's first order is decided by
 * the configured AI ruler; the orders that follow are routine staff work decided by rule, so a
 * larger map does not multiply the calls made to a language model.
 */
interface RivalOrder {
  faction: PlayableFactionId;
  byStaff: boolean;
}

function isPreviewQueryActive(): boolean {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return (
    p.has('faction') ||
    p.get('demoDuel') === '1' ||
    p.get('demoWar') === '1' ||
    p.get('demoMarch') === '1' ||
    p.get('demoTactical') === '1'
  );
}

export default function App() {
  const [isDemoUrl] = useState<boolean>(() => isPreviewQueryActive());
  const [lang, setLang] = useState<Language>(() => {
    const p = new URLSearchParams(window.location.search).get('lang');
    if (p === 'zh' || p === 'en') return p;
    const cached = loadCachedPreferences();
    return cached.lang === 'zh' ? 'zh' : 'en';
  });
  const [gameState, setGameState] = useState<GameState | null>(() => {
    const f = new URLSearchParams(window.location.search).get('faction');
    if (f === 'wei' || f === 'shu' || f === 'wu') {
      return createNewGame(f);
    }
    return null;
  });
  const [selectedCityId, setSelectedCityId] = useState<string | null>(() => {
    const f = new URLSearchParams(window.location.search).get('faction');
    if (f === 'wei') return 'luoyang';
    if (f === 'shu') return 'chengdu';
    if (f === 'wu') return 'jianye';
    return null;
  });
  const [activeTab, setActiveTab] = useState<RightTab>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (
      tab === 'city' ||
      tab === 'heroes' ||
      tab === 'tech' ||
      tab === 'advisor' ||
      tab === 'diplomacy' ||
      tab === 'chronicle'
    ) {
      return tab;
    }
    return 'heroes';
  });
  // The march being planned in the orders sheet, drawn on the map while it is open
  const [orderRoute, setOrderRoute] = useState<OrderRoutePreview | null>(null);
  // The side sheet is contextual: closed until a city, hero or council is asked for.
  const [sheetOpen, setSheetOpen] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get('tab') !== null
  );
  const openTab = (tab: RightTab) => {
    setActiveTab(tab);
    setSheetOpen(true);
  };
  const [focusedHeroId, setFocusedHeroId] = useState<string | null>(null);
  // The city the player has gone down into: the third level of the map
  const [cityViewId, setCityViewId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('demoCity')
  );
  // ?demoCity=luoyang&demoDistrict=walls opens a city with one of its panels, for looking at it
  const [demoDistrict] = useState<DistrictId | null>(() => {
    const asked = new URLSearchParams(window.location.search).get('demoDistrict');
    return DISTRICT_ORDER.find((id) => id === asked) ?? null;
  });
  // Once the close-up has faded in over the map, the map underneath can stop drawing
  const [cityViewCovers, setCityViewCovers] = useState(false);
  useEffect(() => {
    if (!cityViewId) {
      setCityViewCovers(false);
      return;
    }
    const timer = window.setTimeout(() => setCityViewCovers(true), 700);
    return () => window.clearTimeout(timer);
  }, [cityViewId]);
  /** Farming, trade, drill and relief: one order on one aspect of a city the player holds. */
  const issueDomesticOrder = (cityId: string, order: DomesticOrder) => {
    if (!gameState || !canIssueOrders) return;
    const perform =
      order === 'farm'
        ? performDevelopFarming
        : order === 'trade'
          ? performDevelopTrade
          : order === 'drill'
            ? performDrillTroops
            : performRelief;
    commitCampaignState(perform(gameState, gameState.playerFaction, cityId, true));
  };

  /** Appointments and a governor's instructions cost no order, but are still given on your own turn. */
  const appointGovernor = (cityId: string, generalId: string | null) => {
    if (!gameState || !canIssueOrders) return;
    commitCampaignState(performAppointGovernor(gameState, gameState.playerFaction, cityId, generalId));
  };
  const setGovernorFocus = (cityId: string, focus: GovernorFocus) => {
    if (!gameState || !canIssueOrders) return;
    commitCampaignState(performSetGovernorFocus(gameState, gameState.playerFaction, cityId, focus));
  };

  const enterCity = (cityId: string) => {
    setSelectedCityId(cityId);
    setCityViewId(cityId);
    setSheetOpen(false);
    setAttackMode(false);
  };
  const [attackMode, setAttackMode] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get('attackMode') === '1'
  );
  const [isEndingTurn, setIsEndingTurn] = useState(false);

  const [pendingMilitary, setPendingMilitary] = useState<{
    targetCityId: string;
    fromCityId?: string;
    action?: MilitaryActionType;
  } | null>(() => {
    const target = new URLSearchParams(window.location.search).get('target');
    return target ? { targetCityId: target } : null;
  });
  const [activeDuel, setActiveDuel] = useState<{
    payload: ExecuteMilitaryPayload;
    demoAction?: 'strike' | 'feint' | 'guard' | 'skill' | 'chrono_counter' | 'finale';
    demoTimeSec?: number;
    demoTerrain?: 'plains' | 'river' | 'mountain' | 'fortress';
    demoNight?: boolean;
  } | null>(null);
  const [warQueue, setWarQueue] = useState<WarTheaterQueueItem[]>([]);
  const [warStage, setWarStage] = useState<WarStage>('idle');
  const [warBatchTotal, setWarBatchTotal] = useState<number>(0);
  const [heroEncounter, setHeroEncounter] = useState<{
    heroId: string;
    mode: HeroEncounterMode;
  } | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showRealm, setShowRealm] = useState(
    () => new URLSearchParams(window.location.search).get('demoRealm') === '1'
  );
  const [showSaves, setShowSaves] = useState(false);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [currentUser, setCurrentUser] = useState<ClientUser | null>(null);
  const [soloSaves, setSoloSaves] = useState<SaveSlotSummary[]>([]);
  const [mpRooms, setMpRooms] = useState<MultiplayerRoomSummary[]>([]);
  const [activeMpRoom, setActiveMpRoom] = useState<MultiplayerRoomSummary | null>(null);
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [battleStateNonce, setBattleStateNonce] = useState(0);

  const mpVersionRef = useRef<number>(0);
  const mpCommitChainRef = useRef<Promise<void>>(Promise.resolve());
  const liveTacticalBattleRef = useRef<TacticalBattleState | undefined>(undefined);
  const suppressAutosaveRef = useRef<boolean>(false);

  const [providers, setProviders] = useState<AIProviderStatus[]>(DEFAULT_PROVIDERS);
  const [aiConfig, setAiConfig] = useState<AIRequestConfig>(() => {
    const cached = loadCachedPreferences();
    return cached.aiConfig ? { ...cached.aiConfig } : { provider: 'auto' };
  });

  const refreshPersistenceLists = useCallback(async (uid: string) => {
    const [saves, roomsRes] = await Promise.all([
      listSoloSaves(uid),
      listMultiplayerRooms(),
    ]);
    setSoloSaves(saves);
    setMpRooms(roomsRes.myRooms);
  }, []);

  useEffect(() => {
    fetchProviders()
      .then((res) => {
        if (res.providers?.length) setProviders(res.providers);
      })
      .catch(() => {
        // Keep defaults if offline
      });

    initAuthSession().then((user) => {
      setCurrentUser(user);
      const urlHasLang = new URLSearchParams(window.location.search).has('lang');
      if (!urlHasLang && user.prefs?.lang) {
        setLang(user.prefs.lang);
      }
      if (user.prefs?.aiConfig) {
        setAiConfig((prev) => ({
          ...user.prefs.aiConfig!,
          ...(prev.apiKey ? { apiKey: prev.apiKey } : {}),
        }));
      }
      void refreshPersistenceLists(user.id);
    });
  }, [refreshPersistenceLists]);

  const handleAuthChanged = useCallback(
    (nextUser: ClientUser) => {
      setCurrentUser(nextUser);
      if (nextUser.prefs?.lang) setLang(nextUser.prefs.lang);
      if (nextUser.prefs?.aiConfig) {
        setAiConfig((prev) => ({
          ...nextUser.prefs.aiConfig!,
          ...(prev.apiKey ? { apiKey: prev.apiKey } : {}),
        }));
      }
      void refreshPersistenceLists(nextUser.id);
    },
    [refreshPersistenceLists]
  );

  const handleToggleLang = useCallback(() => {
    setLang((prev) => {
      const next: Language = prev === 'en' ? 'zh' : 'en';
      if (!isDemoUrl && currentUser) {
        void updateServerPreferences({ lang: next, aiConfig });
      }
      return next;
    });
  }, [aiConfig, currentUser, isDemoUrl]);

  const handleSaveAiConfig = useCallback(
    (nextConfig: AIRequestConfig) => {
      setAiConfig(nextConfig);
      if (!isDemoUrl && currentUser) {
        void updateServerPreferences({ lang, aiConfig: nextConfig });
      }
    },
    [currentUser, isDemoUrl, lang]
  );

  const [demoElapsed, setDemoElapsed] = useState<number>(0);
  const [demoTacticalPreset, setDemoTacticalPreset] = useState<boolean>(false);

  // 8x8 Direct Tactical Grid Battle pipeline states
  const [tacticalMarch, setTacticalMarch] = useState<{
    march: ActiveMapMarch;
    config: TacticalBattleConfig;
    pendingRivalTurn?: SerializedPendingRivalTurn;
    onAfterTactical?: (updatedState: GameState) => void;
  } | null>(null);
  const [activeTactical, setActiveTactical] = useState<{
    config: TacticalBattleConfig;
    initialBattleState?: TacticalBattleState;
    pendingRivalTurn?: SerializedPendingRivalTurn;
    onAfterTactical?: (updatedState: GameState) => void;
  } | null>(null);
  const [tacticalReportModal, setTacticalReportModal] = useState<{
    report: BattleReport;
    afterClose?: () => void;
  } | null>(null);

  // Incoming Enemy Assault Choice Modal during End Season (Direct 8x8 Defense vs AI Default)
  const [incomingDefensePrompt, setIncomingDefensePrompt] = useState<{
    attackerFaction: PlayableFactionId;
    fromCityId: string;
    toCityId: string;
    troops: number;
    action: AITurnAction;
    proclamation?: string;
    snapshotState: GameState;
    remainingAiFactions: RivalOrder[];
    accumulatedWarItems: WarTheaterQueueItem[];
  } | null>(null);

  // Optional ?demoDuel=1, ?demoWar=1, ?demoMarch=1, or ?demoTactical=1 URL preview for visual inspection
  useEffect(() => {
    if (!gameState) return;
    const params = new URLSearchParams(window.location.search);
    const demoDuel = params.get('demoDuel');
    const demoTactical = params.get('demoTactical');
    const demoWar = params.get('demoWar');
    const demoMarch = params.get('demoMarch');
    const demoTime = Number(params.get('demoTime') || '0');
    const demoTerrain = params.get('demoTerrain');

    if (demoDuel === '1' && !activeDuel) {
      const atkId = params.get('atk') || 'guanyu';
      const defId = params.get('def') || 'lubu';
      const actionParam = params.get('demoDuelAction') || undefined;
      const validAction =
        actionParam === 'strike' ||
        actionParam === 'feint' ||
        actionParam === 'guard' ||
        actionParam === 'skill' ||
        actionParam === 'chrono_counter' ||
        actionParam === 'finale'
          ? actionParam
          : undefined;
      const duelTerrain =
        demoTerrain === 'river' || demoTerrain === 'mountain' || demoTerrain === 'fortress'
          ? demoTerrain
          : 'plains';
      setActiveDuel({
        payload: {
          actionType: 'assault',
          fromCityId: 'jiangling',
          toCityId: 'xiangyang',
          troops: 10000,
          tactic: 'assault',
          generalId: gameState.generals[atkId] ? atkId : 'guanyu',
          defenderHeroId: gameState.generals[defId] ? defId : 'lubu',
          useSignatureSkill: false,
          startDuel: true,
          battleMode: 'ai_default',
        },
        demoAction: validAction,
        demoTimeSec: Number.isFinite(demoTime) && demoTime > 0 ? demoTime : undefined,
        demoTerrain: duelTerrain,
        demoNight: params.get('demoNight') === '1',
      });
      return;
    }

    if (demoTactical === '1' && !activeTactical) {
      // The preview shows a two-city pincer, so Shu is lent the second city the route needs:
      // Chencang for the mountain fight at Tianshui, Shangyong for the river fight at Xiangyang.
      const mountainDemo = demoTerrain === 'mountain';
      const lentCityId = mountainDemo ? 'chencang' : 'shangyong';
      const upgraded: GameState = {
        ...gameState,
        cities: {
          ...gameState.cities,
          [lentCityId]: { ...gameState.cities[lentCityId], owner: 'shu', troops: 9000 },
        },
        chrono: {
          ...gameState.chrono,
          unlockedTechs: ['gunpowder', 'stirrups', 'balloon', 'steamship', 'spyglass'],
        },
      };
      setGameState(upgraded);
      setDemoTacticalPreset(true);
      setActiveTactical({
        config: {
          id: 'demo-tactical',
          fromCityId: mountainDemo ? 'hanzhong' : 'jiangling',
          toCityId: mountainDemo ? 'tianshui' : 'xiangyang',
          attackerFaction: 'shu',
          defenderFaction: 'wei',
          playerSide: 'attacker',
          primaryTroops: 11000,
          pincerFromCityId: lentCityId,
          pincerTroops: 4500,
          tactic: 'fire',
          attackerGeneralId: 'zhugeliang',
          deputyGeneralId: 'guanyu',
          consumeAP: false,
        },
      });
      return;
    }

    if ((demoWar === '1' || demoMarch === '1') && warQueue.length === 0) {
      const atkHero = gameState.generals.guanyu || Object.values(gameState.generals)[0];
      const defHero = gameState.generals.xiahoudun || Object.values(gameState.generals)[1];
      const sampleBattle: BattleReport = {
        id: 'demo-battle',
        turn: gameState.turn,
        attackerFaction: 'shu',
        defenderFaction: 'wei',
        fromCityId: demoTerrain === 'plains' ? 'xiangyang' : 'jiangling',
        toCityId: demoTerrain === 'plains' ? 'wan' : 'xiangyang',
        attackerGeneralId: atkHero?.id,
        defenderGeneralId: defHero?.id,
        tactic: 'fire',
        skillTriggered: atkHero?.signatureSkill.name,
        attackerStartTroops: 14500,
        defenderStartTroops: 11200,
        attackerLosses: 2350,
        defenderLosses: 6840,
        captured: true,
        narrative: {
          en: 'Guan Yu led a Joint Pincer & Black Powder assault, shattering Wei ramparts and seizing the stronghold!',
          zh: '关羽统领多路合围大军携黑火药震天雷猛攻敌城，一举击溃魏军防线、夺下战略重镇！',
        },
      };
      // Shu is lent the cities the previewed route starts from
      const lentIds = demoTerrain === 'plains' ? ['xiangyang'] : ['shangyong'];
      const demoState: GameState = {
        ...gameState,
        cities: {
          ...gameState.cities,
          ...Object.fromEntries(
            lentIds.map((id) => [id, { ...gameState.cities[id], owner: 'shu' as const }])
          ),
        },
        chrono: {
          ...gameState.chrono,
          unlockedTechs: ['gunpowder', 'stirrups', 'balloon', 'steamship'],
        },
      };
      const item = buildBattleWarItem(demoState, sampleBattle, {
        pincerFromCityId: demoTerrain === 'plains' ? undefined : 'shangyong',
      });
      setDemoElapsed(Number.isFinite(demoTime) && demoTime > 0 ? demoTime : 0);
      setWarQueue([item]);
      setWarBatchTotal(1);
      setWarStage(demoMarch === '1' ? 'march' : 'theater');
    }
    // Run only once on mount for URL preview params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Advance On-Map March -> Direct 8x8 Tactical Grid Battle Modal
  useEffect(() => {
    if (!tacticalMarch) return;
    battleAudio.playWarDrum(0.26);
    const timer = window.setTimeout(() => {
      liveTacticalBattleRef.current = undefined;
      setActiveTactical({
        config: tacticalMarch.config,
        pendingRivalTurn: tacticalMarch.pendingRivalTurn,
        onAfterTactical: tacticalMarch.onAfterTactical,
      });
      setTacticalMarch(null);
    }, MAP_MARCH_MS);
    return () => window.clearTimeout(timer);
  }, [tacticalMarch]);

  // Advance Stage 1 (On-Map Animated March) -> Stage 2 (60fps Canvas War Scene Theater)
  useEffect(() => {
    if (warStage !== 'march' || warQueue.length === 0) return;
    battleAudio.playWarDrum(0.26);
    const timer = window.setTimeout(() => {
      setWarStage('theater');
    }, MAP_MARCH_MS);
    return () => window.clearTimeout(timer);
  }, [warStage, warQueue]);

  function enqueueWarItems(items: WarTheaterQueueItem[]) {
    if (items.length === 0) return;
    setDemoElapsed(0);
    setWarQueue(items);
    setWarBatchTotal(items.length);
    setWarStage('march');
  }

  function handleWarTheaterFinish() {
    const active = warQueue[0];
    if (!active) {
      setWarStage('idle');
      return;
    }
    if (active.battleReport || active.operationReport) {
      setWarStage('report');
    } else {
      handleCloseWarReport();
    }
  }

  function handleCloseWarReport() {
    const remaining = warQueue.slice(1);
    if (remaining.length > 0) {
      setWarQueue(remaining);
      setWarStage('march');
    } else {
      setWarQueue([]);
      setWarStage('idle');
      setWarBatchTotal(0);
    }
  }

  const isMyTurnInMp =
    !activeMpRoom ||
    (activeMpRoom.status === 'active' &&
      activeMpRoom.myFaction !== null &&
      activeMpRoom.myFaction === activeMpRoom.activeFaction);

  const canIssueOrders = !activeMpRoom || isMyTurnInMp;

  /** Commits a player campaign state update (local + debounced cloud autosave in solo, live server commit in MP). */
  const commitCampaignState = useCallback(
    (next: GameState) => {
      if (!activeMpRoom) {
        setGameState(next);
        return;
      }
      if (!isMyTurnInMp) return;

      const synced = syncMultiplayerActiveFaction(next);
      setGameState(synced);

      const code = activeMpRoom.code;
      mpCommitChainRef.current = mpCommitChainRef.current
        .then(async () => {
          setSaveIndicator('saving');
          const res = await commitMultiplayerState(code, {
            expectedVersion: mpVersionRef.current,
            state: synced,
            endTurn: false,
            aiConfig,
            language: lang,
          });
          mpVersionRef.current = res.room.stateVersion;
          setActiveMpRoom(res.room);
          const viewerFac = res.room.myFaction ?? res.room.activeFaction;
          if (res.conflict) {
            setGameState(projectStateForViewer(res.state, viewerFac));
          }
          setSaveIndicator('saved');
        })
        .catch(() => {
          setSaveIndicator('offline');
        });
    },
    [activeMpRoom, aiConfig, isMyTurnInMp, lang]
  );

  // Build current solo mid-session state (mid-8x8 tactical battle or incoming defense prompt)
  const buildCurrentMidSession = useCallback((): SavedMidSessionState | undefined => {
    if (activeTactical) {
      return {
        activeTactical: {
          config: activeTactical.config,
          battleState: liveTacticalBattleRef.current ?? activeTactical.initialBattleState,
          pendingRivalTurn: activeTactical.pendingRivalTurn,
        },
      };
    }
    if (incomingDefensePrompt) {
      return {
        incomingDefense: {
          attackerFaction: incomingDefensePrompt.attackerFaction,
          fromCityId: incomingDefensePrompt.fromCityId,
          toCityId: incomingDefensePrompt.toCityId,
          troops: incomingDefensePrompt.troops,
          action: incomingDefensePrompt.action,
          proclamation: incomingDefensePrompt.proclamation,
          remainingAiFactions: incomingDefensePrompt.remainingAiFactions,
          accumulatedWarSnapshots: incomingDefensePrompt.accumulatedWarItems.map((w) => ({
            battleReport: w.battleReport ?? null,
            operationReport: w.operationReport ?? null,
            fromCityId: w.scene.fromCityId,
            toCityId: w.scene.toCityId,
            pincerFromCityId: w.scene.pincerFromCityId,
            isRiverStrike: w.scene.mode === 'river_strike',
            isPlayerDefending: w.scene.isPlayerDefending,
          })),
        },
      };
    }
    return undefined;
  }, [activeTactical, incomingDefensePrompt]);

  const performSoloSlotSave = useCallback(
    async (slotId: SaveSlotId, customLabel?: string) => {
      if (!gameState || activeMpRoom || !currentUser) return;
      setSaveIndicator('saving');
      const envelope = buildSaveEnvelope(
        slotId,
        gameState,
        { selectedCityId, activeTab, sheetOpen },
        {
          label: customLabel,
          session: buildCurrentMidSession(),
        }
      );
      const res = await putSoloSave(currentUser.id, envelope);
      setSaveIndicator(res.syncedToCloud ? 'saved' : 'offline');
      setSoloSaves((prev) => {
        const filtered = prev.filter((s) => s.slotId !== slotId);
        return [res.summary, ...filtered];
      });
    },
    [
      activeMpRoom,
      activeTab,
      buildCurrentMidSession,
      currentUser,
      gameState,
      selectedCityId,
      sheetOpen,
    ]
  );

  // Rolling 400ms debounced solo autosave on campaign or 8x8 battle progression
  useEffect(() => {
    if (!gameState || activeMpRoom || isDemoUrl || !currentUser || suppressAutosaveRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void performSoloSlotSave('autosave');
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    gameState,
    activeTactical,
    incomingDefensePrompt,
    battleStateNonce,
    activeMpRoom,
    isDemoUrl,
    currentUser,
    performSoloSlotSave,
  ]);

  // Keyboard shortcut: Ctrl/Cmd + S opens Imperial Archives (or Multiplayer modal in MP)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const el = e.target as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
          return;
        }
        e.preventDefault();
        if (activeMpRoom) setShowMultiplayer(true);
        else setShowSaves(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMpRoom]);

  // Live SSE synchronization when inside a Shared Multiplayer Room
  useEffect(() => {
    if (!activeMpRoom) return;
    const code = activeMpRoom.code;
    const unsub = subscribeToRoomEvents(code, {
      onRoomUpdate: async (ev) => {
        if (ev.stateVersion <= mpVersionRef.current) return;
        try {
          const fresh = await fetchMultiplayerRoom(code);
          if (!fresh.state) return;
          mpVersionRef.current = fresh.room.stateVersion;
          setActiveMpRoom(fresh.room);
          const viewerFac = fresh.room.myFaction ?? fresh.room.activeFaction;
          setGameState(projectStateForViewer(fresh.state, viewerFac));
          if (
            ev.turnEnded &&
            fresh.room.status === 'active' &&
            fresh.room.myFaction === fresh.room.activeFaction
          ) {
            battleAudio.playWarDrum(0.28);
          }
        } catch {
          // ignore transient fetch errors
        }
      },
      onPresence: async () => {
        try {
          const fresh = await fetchMultiplayerRoom(code);
          setActiveMpRoom(fresh.room);
        } catch {
          // ignore
        }
      },
      onClosed: () => {
        setActiveMpRoom(null);
        setGameState(null);
      },
    });
    return unsub;
  }, [activeMpRoom?.code]);

  function rebuildWarItemsFromSnapshots(
    baseState: GameState,
    snaps: SerializedPendingRivalTurn['accumulatedWarSnapshots']
  ): WarTheaterQueueItem[] {
    const out: WarTheaterQueueItem[] = [];
    for (const s of snaps) {
      if (s.battleReport) {
        out.push(
          buildBattleWarItem(baseState, s.battleReport, {
            pincerFromCityId: s.pincerFromCityId,
            isRiverStrike: s.isRiverStrike,
            isPlayerDefending: s.isPlayerDefending,
          })
        );
      } else if (s.operationReport) {
        const targetCity = baseState.cities[s.toCityId];
        out.push(
          buildOperationWarItem(
            baseState,
            s.operationReport,
            8000,
            targetCity?.troops ?? 6000,
            targetCity?.owner ?? 'neutral',
            Boolean(s.isPlayerDefending)
          )
        );
      }
    }
    return out;
  }

  function restoreFromEnvelope(envelope: SaveEnvelopeV1) {
    suppressAutosaveRef.current = true;
    setActiveMpRoom(null);
    mpVersionRef.current = 0;
    setWarQueue([]);
    setWarStage('idle');
    setWarBatchTotal(0);
    setTacticalMarch(null);
    setTacticalReportModal(null);
    setPendingMilitary(null);
    setActiveDuel(null);
    setHeroEncounter(null);
    setAttackMode(false);
    setDemoTacticalPreset(false);

    setGameState(envelope.state);
    setSelectedCityId(envelope.ui.selectedCityId);
    setActiveTab(envelope.ui.activeTab);
    setSheetOpen(envelope.ui.sheetOpen);

    const savedTac = envelope.session?.activeTactical;
    const savedDef = envelope.session?.incomingDefense;

    if (savedTac) {
      liveTacticalBattleRef.current = savedTac.battleState;
      setIncomingDefensePrompt(null);
      setActiveTactical({
        config: savedTac.config,
        initialBattleState: savedTac.battleState,
        pendingRivalTurn: savedTac.pendingRivalTurn,
        onAfterTactical: savedTac.pendingRivalTurn
          ? (updatedAfterDef) => {
              const items = rebuildWarItemsFromSnapshots(
                updatedAfterDef,
                savedTac.pendingRivalTurn!.accumulatedWarSnapshots
              );
              void runEndTurnPipeline(
                updatedAfterDef,
                savedTac.pendingRivalTurn!.remainingAiFactions,
                items
              );
            }
          : undefined,
      });
    } else if (savedDef) {
      liveTacticalBattleRef.current = undefined;
      setActiveTactical(null);
      setIncomingDefensePrompt({
        attackerFaction: savedDef.attackerFaction,
        fromCityId: savedDef.fromCityId,
        toCityId: savedDef.toCityId,
        troops: savedDef.troops,
        action: savedDef.action,
        proclamation: savedDef.proclamation,
        snapshotState: envelope.state,
        remainingAiFactions: savedDef.remainingAiFactions,
        accumulatedWarItems: rebuildWarItemsFromSnapshots(
          envelope.state,
          savedDef.accumulatedWarSnapshots
        ),
      });
    } else {
      liveTacticalBattleRef.current = undefined;
      setActiveTactical(null);
      setIncomingDefensePrompt(null);
    }

    window.setTimeout(() => {
      suppressAutosaveRef.current = false;
    }, 100);
  }

  function enterMultiplayerCampaign(room: MultiplayerRoomSummary, serverState: GameState) {
    mpVersionRef.current = room.stateVersion;
    setActiveMpRoom(room);
    const viewerFac = room.myFaction ?? room.activeFaction;
    const projected = projectStateForViewer(serverState, viewerFac);
    const cap =
      Object.values(projected.cities).find((c) => c.owner === viewerFac && c.isCapital) ??
      Object.values(projected.cities).find((c) => c.owner === viewerFac);

    setGameState(projected);
    setSelectedCityId(cap?.id ?? null);
    openTab('heroes');
    setFocusedHeroId(null);
    setAttackMode(false);
    setWarQueue([]);
    setWarStage('idle');
    setWarBatchTotal(0);
    setTacticalMarch(null);
    setActiveTactical(null);
    setTacticalReportModal(null);
    setIncomingDefensePrompt(null);
    setPendingMilitary(null);
    setActiveDuel(null);
    setHeroEncounter(null);
    setSaveIndicator('saved');
    if (currentUser) void refreshPersistenceLists(currentUser.id);
  }

  async function handleReturnToTitle() {
    if (gameState && !activeMpRoom && !isDemoUrl && currentUser) {
      await performSoloSlotSave('autosave');
    }
    setActiveMpRoom(null);
    mpVersionRef.current = 0;
    liveTacticalBattleRef.current = undefined;
    setActiveTactical(null);
    setTacticalMarch(null);
    setTacticalReportModal(null);
    setIncomingDefensePrompt(null);
    setPendingMilitary(null);
    setActiveDuel(null);
    setHeroEncounter(null);
    setWarQueue([]);
    setWarStage('idle');
    setCityViewId(null);
    setGameState(null);
    if (currentUser) void refreshPersistenceLists(currentUser.id);
  }

  function startCampaign(faction: PlayableFactionId, profile?: PlayerProfile) {
    setActiveMpRoom(null);
    mpVersionRef.current = 0;
    liveTacticalBattleRef.current = undefined;
    const resolvedProfile =
      profile ||
      createDefaultPlayerProfile(
        currentUser?.avatar ?? 'male',
        currentUser && !currentUser.isGuest ? currentUser.displayName : ''
      );
    const fresh = createNewGame(faction, resolvedProfile);
    const capital = Object.values(fresh.cities).find(
      (c) => c.owner === faction && c.isCapital
    );
    setGameState(fresh);
    setSelectedCityId(capital?.id || null);
    openTab('heroes');
    setFocusedHeroId(null);
    setAttackMode(false);
    setWarQueue([]);
    setWarStage('idle');
    setWarBatchTotal(0);
    setTacticalMarch(null);
    setActiveTactical(null);
    setTacticalReportModal(null);
    setIncomingDefensePrompt(null);
    setDemoTacticalPreset(false);
    setPendingMilitary(null);
    setActiveDuel(null);
    setHeroEncounter(null);
  }

  function handleTogglePlayerAvatar() {
    if (!gameState || !canIssueOrders) return;
    const nextAvatar = gameState.playerProfile.avatar === 'male' ? 'female' : 'male';
    commitCampaignState({
      ...gameState,
      playerProfile: createDefaultPlayerProfile(nextAvatar, gameState.playerProfile.name),
    });
  }

  function handleSelectCity(cityId: string) {
    setSelectedCityId(cityId);
    openTab('city');
  }

  function handleInspectHero(heroId: string) {
    setFocusedHeroId(heroId);
    openTab('heroes');
  }

  function handleTacticalBattleCompleted(outcome: TacticalBattleOutcome) {
    if (!gameState) return;
    const afterHook = activeTactical?.onAfterTactical;
    liveTacticalBattleRef.current = undefined;
    const updated = applyTacticalBattleOutcome(gameState, outcome);
    commitCampaignState(updated);
    setActiveTactical(null);
    setDemoTacticalPreset(false);

    if (updated.lastBattle) {
      setTacticalReportModal({
        report: updated.lastBattle,
        afterClose: afterHook ? () => afterHook(updated) : undefined,
      });
    } else if (afterHook) {
      afterHook(updated);
    }
  }

  function executeAssaultWithOptionalDuel(
    payload: ExecuteMilitaryPayload,
    duelResult?: DuelResult
  ) {
    if (!gameState) return;

    const useTacticalGrid = (payload.battleMode ?? 'tactical') === 'tactical';
    setPendingMilitary(null);
    setActiveDuel(null);
    setAttackMode(false);

    if (useTacticalGrid) {
      const targetCity = gameState.cities[payload.toCityId];
      const fromCity = gameState.cities[payload.fromCityId];
      const atkHero = payload.generalId ? gameState.generals[payload.generalId] : undefined;
      const mode: ActiveMapMarch['mode'] =
        payload.actionType === 'river_strike'
          ? 'river_strike'
          : payload.pincerFromCityId
            ? 'pincer'
            : 'assault';
      // Same order builder the auto-battle and the forecast use (validates the order, clamps troops,
      // falls back to the best general). The player decides on the grid whether to spend the skill.
      const config = buildAssaultConfig(
        gameState,
        gameState.playerFaction,
        payload.fromCityId,
        payload.toCityId,
        payload.troops,
        payload.tactic,
        payload.generalId,
        true,
        {
          deputyGeneralId: payload.deputyId,
          useSignatureSkill: true,
          duelResult,
          pincerFromCityId: payload.pincerFromCityId,
          pincerTroops: payload.pincerTroops,
          isRiverStrike: payload.actionType === 'river_strike',
        },
        'attacker'
      );
      if (!config || gameState.actionPoints < 1) return;
      const march: ActiveMapMarch = {
        id: `tac-march-${Date.now().toString(36)}`,
        fromCityId: payload.fromCityId,
        toCityId: payload.toCityId,
        pincerFromCityId: payload.pincerFromCityId,
        faction: gameState.playerFaction,
        mode,
        heroPortrait: atkHero?.portrait,
        label: {
          en: `Deploying 8×8 Tactical Battlefield: ${fromCity?.name.en || ''} → ${targetCity?.name.en || ''}…`,
          zh: `大军进发，展开 ${targetCity?.name.zh || ''} 8×8 阵前沙盘战…`,
        },
      };
      setDemoTacticalPreset(false);
      setTacticalMarch({ march, config });
      return;
    }

    // AI Default Mode: Auto-resolve & play 3-Stage On-Map March -> 60fps War Scene Animation -> Report
    const updated = performAttackCity(
      gameState,
      gameState.playerFaction,
      payload.fromCityId,
      payload.toCityId,
      payload.troops,
      payload.tactic,
      payload.generalId,
      true,
      Math.random,
      {
        deputyGeneralId: payload.deputyId,
        useSignatureSkill: payload.useSignatureSkill && !duelResult?.skillUsed,
        duelResult,
        pincerFromCityId: payload.pincerFromCityId,
        pincerTroops: payload.pincerTroops,
        isRiverStrike: payload.actionType === 'river_strike',
      }
    );
    commitCampaignState(updated);
    if (updated.lastBattle) {
      const warItem = buildBattleWarItem(updated, updated.lastBattle, {
        pincerFromCityId: payload.pincerFromCityId,
        isRiverStrike: payload.actionType === 'river_strike',
        isPlayerDefending: false,
      });
      enqueueWarItems([warItem]);
    }
  }

  function handleExecuteMilitary(payload: ExecuteMilitaryPayload) {
    if (!gameState || !canIssueOrders) return;

    const preFromTroops = gameState.cities[payload.fromCityId]?.troops ?? 0;
    const preTargetCity = gameState.cities[payload.toCityId];
    const preTargetTroops = preTargetCity?.troops ?? 0;
    const preTargetOwner: FactionId = preTargetCity?.owner ?? 'neutral';

    if (payload.actionType === 'raid') {
      const updated = performNightRaid(
        gameState,
        gameState.playerFaction,
        payload.fromCityId,
        payload.toCityId,
        payload.generalId,
        true
      );
      commitCampaignState(updated);
      setPendingMilitary(null);
      setAttackMode(false);
      if (updated.lastOperation) {
        enqueueWarItems([
          buildOperationWarItem(
            updated,
            updated.lastOperation,
            preFromTroops,
            preTargetTroops,
            preTargetOwner,
            false
          ),
        ]);
      }
      return;
    }

    if (payload.actionType === 'bombard') {
      const updated = performSabotageBombard(
        gameState,
        gameState.playerFaction,
        payload.fromCityId,
        payload.toCityId,
        payload.generalId,
        true
      );
      commitCampaignState(updated);
      setPendingMilitary(null);
      setAttackMode(false);
      if (updated.lastOperation) {
        enqueueWarItems([
          buildOperationWarItem(
            updated,
            updated.lastOperation,
            preFromTroops,
            preTargetTroops,
            preTargetOwner,
            false
          ),
        ]);
      }
      return;
    }

    if (payload.actionType === 'discord') {
      const updated = performSowDiscord(
        gameState,
        gameState.playerFaction,
        payload.toCityId,
        payload.generalId,
        true
      );
      commitCampaignState(updated);
      setPendingMilitary(null);
      setAttackMode(false);
      if (updated.lastOperation) {
        enqueueWarItems([
          buildOperationWarItem(
            updated,
            updated.lastOperation,
            preFromTroops,
            preTargetTroops,
            preTargetOwner,
            false
          ),
        ]);
      }
      return;
    }

    if (payload.startDuel && payload.generalId && payload.defenderHeroId) {
      setActiveDuel({ payload });
      setPendingMilitary(null);
      setAttackMode(false);
      return;
    }

    executeAssaultWithOptionalDuel(payload);
  }

  function handleReinforce(fromCityId: string, toCityId: string) {
    if (!gameState || !canIssueOrders) return;
    const fromCity = gameState.cities[fromCityId];
    if (!fromCity) return;
    const amount = Math.round(fromCity.troops * 0.4);
    commitCampaignState(
      performReinforceCity(gameState, gameState.playerFaction, fromCityId, toCityId, amount, true)
    );
  }

  function handleHeroEncounterResolved(
    heroId: string,
    mode: HeroEncounterMode,
    res: HeroEncounterResponse,
    giftGold: number
  ) {
    if (!gameState || !canIssueOrders) return;
    const hero = gameState.generals[heroId];
    if (!hero) return;

    const summary =
      mode === 'chat'
        ? {
            en: `Held private council with ${hero.name.en} (Loyalty strengthened).`,
            zh: `与${hero.name.zh}帷幄密谈，主客相得，忠诚度提升。`,
          }
        : res.outcome === 'join'
          ? {
              en: `${hero.name.en} swore allegiance to ${gameState.factions[gameState.playerFaction].name.en}!`,
              zh: `大喜！绝世名将${hero.name.zh}感佩你的先知诚意，正式归顺麾下！`,
            }
          : {
              en: `Encounter with ${hero.name.en} (${mode}): ${res.outcome.toUpperCase()}.`,
              zh: `拜访${hero.name.zh}（${mode === 'recruit' ? '招贤' : '劝降'}）：结果 ${res.outcome}。`,
            };

    commitCampaignState(
      applyHeroEncounterOutcome(
        gameState,
        heroId,
        mode,
        res.outcome,
        res.loyaltyDelta,
        res.trustDelta,
        res.divergenceDelta,
        giftGold,
        summary
      )
    );
  }

  function handleDiplomacyResolved(
    targetFaction: PlayableFactionId,
    proposalType: DiplomacyProposalType,
    result: DiplomacyResponse,
    giftGold: number
  ) {
    if (!gameState || !canIssueOrders) return;
    const playerF = gameState.factions[gameState.playerFaction];
    const targetF = gameState.factions[targetFaction];

    const summary = {
      en: `Diplomacy (${proposalType}) with ${targetF.rulerName.en}: ${result.decision.toUpperCase()} (${result.relationDelta >= 0 ? '+' : ''}${result.relationDelta} relation).`,
      zh: `${playerF.shortName.zh}遣使向${targetF.rulerName.zh}交涉（${proposalType}）：结果 ${result.decision}（关系 ${result.relationDelta >= 0 ? '+' : ''}${result.relationDelta}）。`,
    };

    const actualGift = proposalType === 'gift' && result.decision !== 'reject' ? giftGold : 0;

    commitCampaignState(
      applyDiplomacyOutcome(
        gameState,
        gameState.playerFaction,
        targetFaction,
        result.relationDelta,
        result.decision === 'accept' ? result.truceTurns : 0,
        actualGift,
        proposalType === 'war',
        summary
      )
    );
  }

  async function runEndTurnPipeline(
    startState: GameState,
    remainingAiFactions: RivalOrder[],
    accumulatedWarItems: WarTheaterQueueItem[]
  ) {
    setIsEndingTurn(true);
    try {
      let current = startState;
      const warItems = [...accumulatedWarItems];

      // A realm that chooses to hold has nothing more to order this season
      const standingDown = new Set<PlayableFactionId>();

      for (let idx = 0; idx < remainingAiFactions.length; idx++) {
        const { faction: fid, byStaff } = remainingAiFactions[idx];
        if (current.winner || current.isPlayerDefeated) break;
        if (current.factions[fid].isEliminated || standingDown.has(fid)) continue;

        try {
          const decision = await requestAITurnDecision({
            gameState: current,
            factionId: fid,
            language: lang,
            aiConfig: byStaff ? { provider: 'heuristic' } : aiConfig,
          });
          if (decision.action.type === 'hold') standingDown.add(fid);
          // Only the ruler's own order is proclaimed; staff orders speak through what they do
          const proclamation = byStaff ? undefined : decision.proclamation;

          const targetId = decision.action.targetCityId;
          const originCity = current.cities[decision.action.cityId];
          const targetCity = targetId ? current.cities[targetId] : undefined;
          const isValidPlayerAssault =
            decision.action.type === 'attack' &&
            originCity &&
            originCity.owner === fid &&
            targetCity &&
            targetCity.owner === current.playerFaction &&
            originCity.neighbors.includes(targetCity.id) &&
            originCity.troops >= 3500;

          // Pause End Season to ask player: Defend Manually on 8x8 Grid vs AI Default Animation!
          if (isValidPlayerAssault && targetCity && originCity) {
            const ratio = Math.min(0.8, Math.max(0.45, decision.action.troopsRatio ?? 0.65));
            const sendTroops = Math.round(originCity.troops * ratio);
            setGameState(current);
            setIncomingDefensePrompt({
              attackerFaction: fid,
              fromCityId: originCity.id,
              toCityId: targetCity.id,
              troops: sendTroops,
              action: decision.action,
              proclamation,
              snapshotState: current,
              remainingAiFactions: remainingAiFactions.slice(idx + 1),
              accumulatedWarItems: warItems,
            });
            return;
          }

          const prevBattleId = current.lastBattle?.id;
          const prevOpId = current.lastOperation?.id;
          const targetWasPlayer = Boolean(
            targetId && current.cities[targetId]?.owner === current.playerFaction
          );
          const preFromTroops = originCity?.troops ?? 0;
          const preTargetTroops = targetCity?.troops ?? 0;

          current = executeAITurnAction(current, fid, decision.action, proclamation);

          if (targetWasPlayer && current.lastBattle && current.lastBattle.id !== prevBattleId) {
            warItems.push(
              buildBattleWarItem(current, current.lastBattle, { isPlayerDefending: true })
            );
          } else if (
            targetWasPlayer &&
            current.lastOperation &&
            current.lastOperation.id !== prevOpId
          ) {
            warItems.push(
              buildOperationWarItem(
                current,
                current.lastOperation,
                preFromTroops,
                preTargetTroops,
                current.playerFaction,
                true
              )
            );
          }
        } catch (err) {
          console.warn(`AI turn failed for ${fid}:`, err);
        }
      }

      if (!current.winner && !current.isPlayerDefeated) {
        current = advanceSeason(current);
      }

      setGameState(current);
      if (warItems.length > 0) {
        enqueueWarItems(warItems);
      }
    } finally {
      setIsEndingTurn(false);
    }
  }

  function handleResolveIncomingDefense(mode: 'tactical' | 'ai_default') {
    if (!incomingDefensePrompt) return;
    const prompt = incomingDefensePrompt;
    setIncomingDefensePrompt(null);

    if (mode === 'ai_default') {
      const prevBattleId = prompt.snapshotState.lastBattle?.id;
      const afterAi = executeAITurnAction(
        prompt.snapshotState,
        prompt.attackerFaction,
        prompt.action,
        prompt.proclamation
      );
      const nextWarItems = [...prompt.accumulatedWarItems];
      if (afterAi.lastBattle && afterAi.lastBattle.id !== prevBattleId) {
        nextWarItems.push(
          buildBattleWarItem(afterAi, afterAi.lastBattle, { isPlayerDefending: true })
        );
      }
      void runEndTurnPipeline(afterAi, prompt.remainingAiFactions, nextWarItems);
      return;
    }

    // Direct 8x8 Tactical Defense! The rival's order is built exactly as the auto-resolve would build it.
    const config = buildAssaultConfig(
      prompt.snapshotState,
      prompt.attackerFaction,
      prompt.fromCityId,
      prompt.toCityId,
      prompt.troops,
      prompt.action.tactic ?? 'assault',
      undefined,
      false,
      { useSignatureSkill: true },
      'defender'
    );
    if (!config) {
      void runEndTurnPipeline(
        prompt.snapshotState,
        prompt.remainingAiFactions,
        prompt.accumulatedWarItems
      );
      return;
    }
    const atkHero = config.attackerGeneralId
      ? prompt.snapshotState.generals[config.attackerGeneralId]
      : undefined;
    const targetName = prompt.snapshotState.cities[prompt.toCityId]?.name ?? { en: '', zh: '' };
    const atkShort = prompt.snapshotState.factions[prompt.attackerFaction].shortName;
    const march: ActiveMapMarch = {
      id: `tac-def-march-${Date.now().toString(36)}`,
      fromCityId: prompt.fromCityId,
      toCityId: prompt.toCityId,
      faction: prompt.attackerFaction,
      mode: 'assault',
      heroPortrait: atkHero?.portrait,
      isPlayerDefending: true,
      label: {
        en: `DEFEND ${targetName.en}! ${atkShort.en} forces approaching 8×8 perimeter!`,
        zh: `保卫${targetName.zh}！${atkShort.zh}军压境，展开 8×8 守城沙盘战！`,
      },
    };
    const pendingRivalTurn: SerializedPendingRivalTurn = {
      remainingAiFactions: prompt.remainingAiFactions,
      accumulatedWarSnapshots: prompt.accumulatedWarItems.map((w) => ({
        battleReport: w.battleReport ?? null,
        operationReport: w.operationReport ?? null,
        fromCityId: w.scene.fromCityId,
        toCityId: w.scene.toCityId,
        pincerFromCityId: w.scene.pincerFromCityId,
        isRiverStrike: w.scene.mode === 'river_strike',
        isPlayerDefending: w.scene.isPlayerDefending,
      })),
    };
    setDemoTacticalPreset(false);
    setTacticalMarch({
      march,
      config,
      pendingRivalTurn,
      onAfterTactical: (updatedAfterDef) => {
        void runEndTurnPipeline(
          updatedAfterDef,
          prompt.remainingAiFactions,
          prompt.accumulatedWarItems
        );
      },
    });
  }

  async function handleEndTurn() {
    if (
      !gameState ||
      isEndingTurn ||
      gameState.winner ||
      gameState.isPlayerDefeated ||
      incomingDefensePrompt ||
      activeTactical ||
      tacticalMarch
    ) {
      return;
    }
    // The season's marches and battles are watched from the map
    setCityViewId(null);

    if (activeMpRoom) {
      if (!isMyTurnInMp) return;
      setIsEndingTurn(true);
      try {
        await mpCommitChainRef.current;
        const synced = syncMultiplayerActiveFaction(gameState);
        const res = await commitMultiplayerState(activeMpRoom.code, {
          expectedVersion: mpVersionRef.current,
          state: synced,
          endTurn: true,
          aiConfig,
          language: lang,
        });
        mpVersionRef.current = res.room.stateVersion;
        setActiveMpRoom(res.room);
        const viewerFac = res.room.myFaction ?? res.room.activeFaction;
        setGameState(projectStateForViewer(res.state, viewerFac));
        setSaveIndicator('saved');
      } catch (err) {
        console.warn('Multiplayer end turn failed:', err);
        setSaveIndicator('offline');
      } finally {
        setIsEndingTurn(false);
      }
      return;
    }

    const rivalOrders: RivalOrder[] = [];
    for (const fid of ['wei', 'shu', 'wu'] as PlayableFactionId[]) {
      if (fid === gameState.playerFaction || gameState.factions[fid].isEliminated) continue;
      const held = Object.values(gameState.cities).filter((c) => c.owner === fid).length;
      for (let n = 0; n < rivalOrdersForRealmSize(held); n++) {
        rivalOrders.push({ faction: fid, byStaff: n > 0 });
      }
    }
    await runEndTurnPipeline(gameState, rivalOrders, []);
  }

  const providerLabel =
    aiConfig.provider === 'auto'
      ? providers.find((p) => p.id !== 'heuristic' && p.configured)?.id.toUpperCase() ||
        'HEURISTIC'
      : aiConfig.provider.toUpperCase();

  const resumeSoloSummary =
    soloSaves
      .filter((s) => !s.winner && !s.isPlayerDefeated)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ??
    soloSaves[0] ??
    null;

  const resumeMpRoom =
    mpRooms.find((r) => r.status === 'active' && r.myFaction === r.activeFaction) ??
    mpRooms.find((r) => r.status === 'active') ??
    null;

  const sharedPersistenceModals = (
    <>
      {showRealm && gameState && (
        <RealmTable
          state={gameState}
          lang={lang}
          canIssueOrders={canIssueOrders}
          onClose={() => setShowRealm(false)}
          onOpenCity={(cid) => {
            setShowRealm(false);
            enterCity(cid);
          }}
          onAppointGovernor={appointGovernor}
          onSetFocus={setGovernorFocus}
        />
      )}

      {showSettings && (
        <SettingsModal
          lang={lang}
          providers={providers}
          currentConfig={aiConfig}
          onSave={handleSaveAiConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showAuth && currentUser && (
        <AuthModal
          lang={lang}
          user={currentUser}
          onAuthChanged={handleAuthChanged}
          onClose={() => setShowAuth(false)}
        />
      )}

      {showSaves && currentUser && (
        <SaveLoadModal
          lang={lang}
          user={currentUser}
          saves={soloSaves}
          canSaveCurrent={Boolean(gameState && !activeMpRoom)}
          onSaveSlot={async (slotId, customLabel) => {
            await performSoloSlotSave(slotId, customLabel);
          }}
          onLoadSlot={async (slotId) => {
            const env = await loadSoloSave(currentUser.id, slotId);
            restoreFromEnvelope(env);
          }}
          onDeleteSlot={async (slotId) => {
            await deleteSoloSave(currentUser.id, slotId);
            setSoloSaves((prev) => prev.filter((s) => s.slotId !== slotId));
          }}
          onExportSlot={async (slotId) => {
            const env = await loadSoloSave(currentUser.id, slotId);
            triggerSaveFileDownload(env);
          }}
          onExportCurrent={
            gameState && !activeMpRoom
              ? () => {
                  const env = buildSaveEnvelope(
                    'slot-1',
                    gameState,
                    { selectedCityId, activeTab, sheetOpen },
                    { session: buildCurrentMidSession() }
                  );
                  triggerSaveFileDownload(env);
                }
              : undefined
          }
          onImportEnvelope={async (env) => {
            const res = await putSoloSave(currentUser.id, env);
            setSoloSaves((prev) => [
              res.summary,
              ...prev.filter((s) => s.slotId !== env.slotId),
            ]);
            restoreFromEnvelope(env);
          }}
          onOpenAuth={() => setShowAuth(true)}
          onClose={() => setShowSaves(false)}
        />
      )}

      {showMultiplayer && currentUser && (
        <MultiplayerModal
          lang={lang}
          user={currentUser}
          activeRoomCode={activeMpRoom?.code ?? null}
          onEnterCampaign={enterMultiplayerCampaign}
          onOpenAuth={() => setShowAuth(true)}
          onClose={() => {
            setShowMultiplayer(false);
            void refreshPersistenceLists(currentUser.id);
          }}
        />
      )}
    </>
  );

  if (!gameState) {
    return (
      <>
        <FactionSelect
          lang={lang}
          onToggleLang={handleToggleLang}
          onSelectFaction={startCampaign}
          onOpenSettings={() => setShowSettings(true)}
          providers={providers}
          selectedProviderMode={aiConfig.provider}
          user={currentUser}
          resumeSoloSummary={resumeSoloSummary}
          resumeMpRoom={resumeMpRoom}
          totalSaveCount={soloSaves.length}
          activeMpCount={mpRooms.filter((r) => r.status !== 'finished').length}
          onResumeSolo={
            currentUser && resumeSoloSummary
              ? () => {
                  void loadSoloSave(currentUser.id, resumeSoloSummary.slotId).then(
                    restoreFromEnvelope
                  );
                }
              : undefined
          }
          onResumeMpRoom={(room) => {
            void fetchMultiplayerRoom(room.code).then((res) => {
              if (res.state) enterMultiplayerCampaign(res.room, res.state);
              else setShowMultiplayer(true);
            });
          }}
          onOpenSaves={() => setShowSaves(true)}
          onOpenMultiplayer={() => setShowMultiplayer(true)}
          onOpenAuth={() => setShowAuth(true)}
        />
        {sharedPersistenceModals}
      </>
    );
  }

  const zh = lang === 'zh';
  const tabs: Array<{ id: RightTab; label: string; title: string; icon: typeof Castle }> = [
    { id: 'city', label: zh ? '城池' : 'City', title: zh ? '城池' : 'City', icon: Castle },
    { id: 'heroes', label: zh ? '名将' : 'Heroes', title: zh ? '名将录' : 'Heroes', icon: Users },
    { id: 'tech', label: zh ? '科技' : 'Tech', title: zh ? '穿越科技' : 'Future Knowledge', icon: FlaskConical },
    { id: 'advisor', label: zh ? '军师' : 'Council', title: zh ? '军师献策' : 'War Council', icon: Sparkles },
    { id: 'diplomacy', label: zh ? '外交' : 'Envoys', title: zh ? '外交' : 'Diplomacy', icon: Handshake },
    { id: 'chronicle', label: zh ? '史记' : 'Annals', title: zh ? '史记' : 'Chronicle', icon: ScrollText },
  ];
  const activeTabMeta = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  const duelAttacker = activeDuel?.payload.generalId
    ? gameState.generals[activeDuel.payload.generalId]
    : undefined;
  const duelDefender = activeDuel?.payload.defenderHeroId
    ? gameState.generals[activeDuel.payload.defenderHeroId]
    : undefined;
  const activeWarItem = warQueue[0] ?? null;
  const queueBadge =
    warBatchTotal > 1 ? `${warBatchTotal - warQueue.length + 1} / ${warBatchTotal}` : undefined;
  const isBattleIdle =
    warStage === 'idle' &&
    !activeTactical &&
    !tacticalMarch &&
    !tacticalReportModal &&
    !incomingDefensePrompt;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar
        state={gameState}
        lang={lang}
        isEndingTurn={isEndingTurn}
        providerLabel={providerLabel}
        onToggleLang={handleToggleLang}
        onTogglePlayerAvatar={handleTogglePlayerAvatar}
        onOpenSettings={() => setShowSettings(true)}
        onEndTurn={handleEndTurn}
        onNewGame={() => void handleReturnToTitle()}
        user={currentUser}
        saveIndicator={saveIndicator}
        activeMpRoom={activeMpRoom}
        isMyTurnInMp={isMyTurnInMp}
        onOpenSaves={() => setShowSaves(true)}
        onOpenMultiplayer={() => setShowMultiplayer(true)}
        onOpenAuth={() => setShowAuth(true)}
      />

      {activeMpRoom && !isMyTurnInMp && activeMpRoom.status === 'active' && (
        <div className="shrink-0 z-20 bg-gradient-to-r from-[#1f1911] via-[#2b2114] to-[#1f1911] border-b border-amber-400/30 px-4 py-1.5 flex items-center justify-center gap-2 text-xs text-amber-100">
          <Clock className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          <span>
            {zh
              ? `联机模式 · 当前正由【${gameState.factions[activeMpRoom.activeFaction].name.zh}】（${activeMpRoom.seats[activeMpRoom.activeFaction].playerName}）下令行动，你可自由巡视地图与战报，轮到你时将自动同步提醒！`
              : `Multiplayer · ${gameState.factions[activeMpRoom.activeFaction].name.en} (${activeMpRoom.seats[activeMpRoom.activeFaction].playerName}) is issuing orders. Browse freely — the map updates live when your turn begins!`}
          </span>
        </div>
      )}

      <SeasonBanner
        turn={gameState.turn}
        year={gameState.year}
        season={gameState.season}
        lang={lang}
      />

      <main className="relative flex-1 min-h-0 flex">
        {/* The campaign table: the map owns the screen */}
        <div className="relative z-0 flex-1 min-w-0 min-h-0">
          <StrategyMap
            state={gameState}
            lang={lang}
            selectedCityId={selectedCityId}
            attackMode={attackMode && canIssueOrders}
            activeMapMarch={
              tacticalMarch?.march ??
              (warStage === 'march' ? activeWarItem?.march ?? null : null)
            }
            onToggleAttackMode={() => {
              if (!canIssueOrders) return;
              setAttackMode((v) => !v);
            }}
            onSelectCity={handleSelectCity}
            onQuickTargetEnemy={(targetCityId) => {
              if (!canIssueOrders) return;
              setSelectedCityId(targetCityId);
              setPendingMilitary({ targetCityId });
              setAttackMode(false);
            }}
            onInspectHero={handleInspectHero}
            onEnterCity={enterCity}
            diveCityId={cityViewId}
            previewRoute={orderRoute ? { ...orderRoute, coverRightPx: 600 } : null}
            paused={
              cityViewCovers ||
              Boolean(activeDuel) ||
              Boolean(activeTactical) ||
              (warStage !== 'idle' && warStage !== 'march')
            }
          />

          {cityViewId && gameState.cities[cityViewId] && (
            <CityView
              state={gameState}
              lang={lang}
              cityId={cityViewId}
              canIssueOrders={canIssueOrders}
              initialDistrict={demoDistrict}
              onExit={() => setCityViewId(null)}
              onChangeCity={(cid) => {
                setSelectedCityId(cid);
                setCityViewId(cid);
              }}
              onDomesticOrder={issueDomesticOrder}
              onAppointGovernor={appointGovernor}
              onSetFocus={setGovernorFocus}
              onFortify={(cid) => {
                if (!canIssueOrders) return;
                commitCampaignState(performFortifyCity(gameState, gameState.playerFaction, cid, true));
              }}
              onRecruit={(cid) => {
                if (!canIssueOrders) return;
                commitCampaignState(performRecruitTroops(gameState, gameState.playerFaction, cid, true));
              }}
              onReinforce={handleReinforce}
              onOpenMilitary={(targetCityId, fromCityId, action) => {
                if (!canIssueOrders) return;
                setPendingMilitary({ targetCityId, fromCityId, action });
              }}
              onInspectHero={handleInspectHero}
              onRecruitWanderingHero={(heroId) => {
                if (!canIssueOrders) return;
                setHeroEncounter({ heroId, mode: 'recruit' });
              }}
            />
          )}

          {gameState.chronicle[0] && (
            <div className="absolute left-3 bottom-3 z-20 max-w-[min(640px,calc(100%-1.5rem))] ink-panel rounded-md px-3.5 py-2 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <ScrollText className="w-4 h-4 text-[#d4a853] shrink-0" />
                <span className="truncate text-[#e6dfd0]">
                  {tLoc(gameState.chronicle[0].text, lang)}
                </span>
              </div>
              <button
                onClick={() => openTab('chronicle')}
                className="text-[#d4a853] hover:underline shrink-0 font-semibold cursor-pointer"
              >
                {lang === 'zh' ? '全部战报' : 'All Logs'}
              </button>
            </div>
          )}
        </div>

        {/* Contextual sheet: opens for the selected city, hero or council */}
        {sheetOpen && (
        <aside className="anim-sheet-in ink-panel border-y-0 border-r-0 z-20 flex flex-col min-h-0 w-[min(430px,calc(100vw-3.5rem))] max-lg:absolute max-lg:inset-y-0 max-lg:right-14 lg:relative lg:shrink-0">
          <div className="flex items-center justify-between gap-2 pl-5 pr-2 py-2 border-b border-amber-400/15">
            <h2 className="brush-heading font-brush text-lg font-bold text-slate-50 leading-none">
              {activeTabMeta.title}
            </h2>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              title={zh ? '收起' : 'Close'}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-50 hover:bg-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative flex-1 min-h-0">
          <div key={activeTab} className="anim-rise absolute inset-0 overflow-y-auto">
            {activeTab === 'city' && (
              <ProvinceRegister
                key={selectedCityId ? 'chosen' : 'none'}
                state={gameState}
                lang={lang}
                selectedCityId={selectedCityId}
                onSelectCity={handleSelectCity}
                onOpenRealm={() => setShowRealm(true)}
              />
            )}
            {activeTab === 'city' && (
              <CityPanel
                state={gameState}
                lang={lang}
                selectedCityId={selectedCityId}
                onDomesticOrder={issueDomesticOrder}
                onFortify={(cid) => {
                  if (!canIssueOrders) return;
                  commitCampaignState(performFortifyCity(gameState, gameState.playerFaction, cid, true));
                }}
                onRecruit={(cid) => {
                  if (!canIssueOrders) return;
                  commitCampaignState(performRecruitTroops(gameState, gameState.playerFaction, cid, true));
                }}
                onOpenMilitary={(targetCityId, fromCityId, action) => {
                  if (!canIssueOrders) return;
                  setPendingMilitary({ targetCityId, fromCityId, action });
                }}
                onReinforce={handleReinforce}
                onSelectCity={handleSelectCity}
                onEnterCity={enterCity}
                onInspectHero={handleInspectHero}
                onRecruitWanderingHero={(heroId) => {
                  if (!canIssueOrders) return;
                  setHeroEncounter({ heroId, mode: 'recruit' });
                }}
              />
            )}

            {activeTab === 'heroes' && (
              <HeroesPanel
                state={gameState}
                lang={lang}
                focusedHeroId={focusedHeroId}
                onSelectFocusHero={setFocusedHeroId}
                onRelocateHero={(heroId, targetCityId) => {
                  if (!canIssueOrders) return;
                  commitCampaignState(
                    performRelocateHero(
                      gameState,
                      gameState.playerFaction,
                      heroId,
                      targetCityId,
                      true
                    )
                  );
                }}
                onRewardHero={(heroId) => {
                  if (!canIssueOrders) return;
                  commitCampaignState(performRewardHero(gameState, gameState.playerFaction, heroId));
                }}
                onOpenEncounter={(heroId, mode) => {
                  if (!canIssueOrders) return;
                  setHeroEncounter({ heroId, mode });
                }}
                onPrisonerAction={(heroId, action) => {
                  if (!canIssueOrders) return;
                  commitCampaignState(performPrisonerAction(gameState, heroId, action));
                }}
              />
            )}

            {activeTab === 'tech' && (
              <TechLabPanel
                state={gameState}
                lang={lang}
                onResearchTech={(techId: TechId, researcherId?: string) => {
                  if (!canIssueOrders) return;
                  commitCampaignState(performResearchTech(gameState, techId, researcherId));
                }}
              />
            )}

            {activeTab === 'advisor' && (
              <AdvisorPanel state={gameState} lang={lang} aiConfig={aiConfig} />
            )}

            {activeTab === 'diplomacy' && (
              <DiplomacyPanel
                state={gameState}
                lang={lang}
                aiConfig={aiConfig}
                onDiplomacyResolved={handleDiplomacyResolved}
              />
            )}

            {activeTab === 'chronicle' && (
              <ChronicleLog entries={gameState.chronicle} lang={lang} />
            )}
          </div>
          </div>
        </aside>
        )}

        {/* Tab rail: always present, so the sheet is one click away */}
        <nav className="ink-panel border-y-0 border-r-0 z-30 shrink-0 w-14 flex flex-col items-stretch py-2 gap-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = sheetOpen && activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                title={tab.title}
                onClick={() => (active ? setSheetOpen(false) : openTab(tab.id))}
                className={`relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold cursor-pointer border-l-2 ${
                  active
                    ? 'border-amber-300 text-amber-100 bg-amber-400/10'
                    : 'border-transparent text-slate-400 hover:text-slate-50 hover:bg-white/5'
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] ${
                    tab.id === 'tech' || tab.id === 'advisor' ? 'text-chrono-300' : ''
                  }`}
                />
                <span className="truncate max-w-full">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </main>

      {/* Unified War Room Military Operations Modal (5 Operations + Live Odds + Pincer) */}
      {pendingMilitary && canIssueOrders && (
        <MilitaryModal
          state={gameState}
          lang={lang}
          targetCityId={pendingMilitary.targetCityId}
          initialFromCityId={pendingMilitary.fromCityId}
          initialAction={pendingMilitary.action}
          onCancel={() => setPendingMilitary(null)}
          onExecute={handleExecuteMilitary}
          onPreviewRoute={setOrderRoute}
        />
      )}

      {/* Interactive 3-Round Real-Time 3D Cavalry Hero Duel Modal */}
      {activeDuel && duelAttacker && duelDefender && (
        <DuelModal
          state={gameState}
          lang={lang}
          attacker={duelAttacker}
          defender={duelDefender}
          terrain={
            activeDuel.demoTerrain ??
            gameState.cities[activeDuel.payload.toCityId]?.terrain ??
            'plains'
          }
          isNight={
            activeDuel.demoNight ?? activeDuel.payload.actionType === 'raid'
          }
          demoAction={activeDuel.demoAction}
          demoTimeSec={activeDuel.demoTimeSec}
          onComplete={(duelResult) =>
            executeAssaultWithOptionalDuel(activeDuel.payload, duelResult)
          }
        />
      )}

      {/* Incoming Enemy Assault Defense Choice Modal (Direct 8x8 Grid vs AI Default) */}
      {incomingDefensePrompt && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="ink-panel gold-border-glow rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-rose-500/45">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/50">
                <ShieldAlert className="w-6 h-6 text-rose-400 animate-pulse" />
              </div>
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-300">
                  {lang === 'zh' ? '急报 · 敌军兵临城下！' : 'URGENT · ENEMY ASSAULT INCOMING!'}
                </div>
                <h3 className="font-display text-lg font-extrabold text-white">
                  {lang === 'zh'
                    ? `${tLoc(gameState.factions[incomingDefensePrompt.attackerFaction].name, lang)}发兵 ${incomingDefensePrompt.troops.toLocaleString()} 猛攻${tLoc(gameState.cities[incomingDefensePrompt.toCityId]?.name || { en: '', zh: '' }, lang)}！`
                    : `${tLoc(gameState.factions[incomingDefensePrompt.attackerFaction].name, lang)} (${incomingDefensePrompt.troops.toLocaleString()} troops) attacks ${tLoc(gameState.cities[incomingDefensePrompt.toCityId]?.name || { en: '', zh: '' }, lang)}!`}
                </h3>
              </div>
            </div>

            {incomingDefensePrompt.proclamation && (
              <p className="text-xs italic text-slate-200 bg-slate-900/90 border border-slate-700 rounded-xl px-3.5 py-2.5">
                “{incomingDefensePrompt.proclamation}”
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleResolveIncomingDefense('tactical')}
                className="p-3 rounded-xl bg-gradient-to-br from-cyan-600/30 to-indigo-600/30 hover:from-cyan-500/40 hover:to-indigo-500/40 border border-cyan-400 text-left space-y-1 cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-sm font-extrabold text-cyan-100">
                  <Grid2x2 className="w-4 h-4 text-cyan-300" />
                  <span>{lang === 'zh' ? '亲自守城（8×8 沙盘）' : 'Defend Manually (8×8)'}</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  {lang === 'zh'
                    ? '依托城墙、河道与《孙子兵法》空城计/火攻亲手击退敌军！'
                    : 'Command garrison generals behind walls with Empty Fort, Fire & Art of War tactics!'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleResolveIncomingDefense('ai_default')}
                className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-600 text-left space-y-1 cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-sm font-extrabold text-indigo-200">
                  <Bot className="w-4 h-4 text-indigo-300" />
                  <span>{lang === 'zh' ? 'AI 默认守城（看动画）' : 'AI Default (Animation)'}</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  {lang === 'zh'
                    ? '由守城 AI 自动迎敌，观看 60fps 战况动画并结算结果。'
                    : 'Auto-resolve defense and watch the 60fps War Scene Theater animation.'}
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct 8x8 Tactical Grid Battle Modal (The Art of War Edition) */}
      {activeTactical && (
        <TacticalBattleModal
          gameState={gameState}
          config={activeTactical.config}
          lang={lang}
          demoPreset={demoTacticalPreset}
          initialBattleState={activeTactical.initialBattleState}
          onBattleStateChange={(b) => {
            liveTacticalBattleRef.current = b;
            setBattleStateNonce((n) => n + 1);
          }}
          onSaveAndExit={
            !activeMpRoom
              ? (b) => {
                  liveTacticalBattleRef.current = b;
                  void handleReturnToTitle();
                }
              : undefined
          }
          onComplete={handleTacticalBattleCompleted}
        />
      )}

      {/* Post-Tactical-Grid Battle Report + Prisoner Fate Modal */}
      {tacticalReportModal && (
        <BattleReportModal
          report={tacticalReportModal.report}
          state={gameState}
          lang={lang}
          onClose={() => {
            const cb = tacticalReportModal.afterClose;
            setTacticalReportModal(null);
            if (cb) cb();
          }}
          onPersuadePrisoner={(heroId) => setHeroEncounter({ heroId, mode: 'persuade' })}
          onPrisonerAction={(heroId, action) =>
            commitCampaignState(performPrisonerAction(gameState, heroId, action))
          }
        />
      )}

      {/* Stage 2: 60fps HTML5 Canvas 2.5D War Scene Theater Modal (AI Default Mode) */}
      {warStage === 'theater' && activeWarItem && (
        <WarSceneModal
          scene={activeWarItem.scene}
          state={gameState}
          lang={lang}
          queueBadge={queueBadge}
          initialElapsed={demoElapsed}
          onFinish={handleWarTheaterFinish}
        />
      )}

      {/* Stage 3a: Special Military Operation Report Modal (Night Raid / Bombard / Discord) */}
      {warStage === 'report' && activeWarItem?.operationReport && (
        <OperationReportModal
          report={activeWarItem.operationReport}
          state={gameState}
          lang={lang}
          onClose={handleCloseWarReport}
        />
      )}

      {/* Stage 3b: Battle Report + Prisoner Fate Modal */}
      {warStage === 'report' && activeWarItem?.battleReport && (
        <BattleReportModal
          report={activeWarItem.battleReport}
          state={gameState}
          lang={lang}
          onClose={handleCloseWarReport}
          onPersuadePrisoner={(heroId) => setHeroEncounter({ heroId, mode: 'persuade' })}
          onPrisonerAction={(heroId, action) =>
            commitCampaignState(performPrisonerAction(gameState, heroId, action))
          }
        />
      )}

      {/* AI Hero Recruitment / Persuasion / Private Chat Modal */}
      {heroEncounter && canIssueOrders && (
        <HeroRecruitModal
          state={gameState}
          lang={lang}
          aiConfig={aiConfig}
          heroId={heroEncounter.heroId}
          mode={heroEncounter.mode}
          onResolved={handleHeroEncounterResolved}
          onClose={() => setHeroEncounter(null)}
        />
      )}

      {/* Fated History Crisis / Court Suspicion Trial / What-If Event Modal */}
      {isBattleIdle && canIssueOrders && gameState.activeEvent && (
        <HeroEventModal
          event={gameState.activeEvent}
          state={gameState}
          lang={lang}
          onChoose={(choiceId) => commitCampaignState(resolveStoryEventChoice(gameState, choiceId))}
        />
      )}

      {sharedPersistenceModals}

      {/* Victory / Defeat Overlay */}
      {isBattleIdle && (gameState.winner || gameState.isPlayerDefeated) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ink-panel gold-border-glow rounded-2xl max-w-md w-full p-8 text-center space-y-5">
            {gameState.winner === gameState.playerFaction ? (
              <Crown className="w-14 h-14 text-[#d4a853] mx-auto" />
            ) : (
              <Skull className="w-14 h-14 text-rose-500 mx-auto" />
            )}
            <h2 className="font-display text-3xl font-extrabold text-[#f7efe0]">
              {gameState.winner === gameState.playerFaction
                ? tLoc(UI_TEXT.victoryBanner, lang)
                : tLoc(UI_TEXT.defeatBanner, lang)}
            </h2>
            <p className="text-sm text-[#cfc7b4]">
              {gameState.winner
                ? lang === 'zh'
                  ? `${gameState.factions[gameState.winner].name.zh}（${gameState.factions[gameState.winner].rulerName.zh}）于公元 ${gameState.year} 年改写历史、一统华夏！（最终历史偏移度：${gameState.chrono.divergence}%）`
                  : `${gameState.factions[gameState.winner].name.en} under ${gameState.factions[gameState.winner].rulerName.en} rewrote history and unified China in ${gameState.year} AD! (Timeline Divergence: ${gameState.chrono.divergence}%)`
                : ''}
            </p>
            <button
              onClick={() => void handleReturnToTitle()}
              className="w-full py-3 rounded-xl bg-[#d4a853] hover:bg-[#e1b866] text-[#14110d] font-bold text-sm transition cursor-pointer"
            >
              {tLoc(UI_TEXT.playAgain, lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
