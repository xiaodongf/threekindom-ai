import { useEffect, useState } from 'react';
import {
  Castle,
  Crown,
  FlaskConical,
  Handshake,
  ScrollText,
  Skull,
  Sparkles,
  Users,
} from 'lucide-react';
import { AdvisorPanel } from './components/AdvisorPanel.js';
import { BattleReportModal } from './components/BattleModal.js';
import { ChronicleLog } from './components/ChronicleLog.js';
import { CityPanel } from './components/CityPanel.js';
import { DiplomacyPanel } from './components/DiplomacyPanel.js';
import { DuelModal } from './components/DuelModal.js';
import { FactionSelect } from './components/FactionSelect.js';
import { HeroEventModal } from './components/HeroEventModal.js';
import { HeroRecruitModal } from './components/HeroRecruitModal.js';
import { HeroesPanel } from './components/HeroesPanel.js';
import {
  MilitaryModal,
  OperationReportModal,
  type ExecuteMilitaryPayload,
} from './components/MilitaryModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { StrategyMap, type ActiveMapMarch } from './components/StrategyMap.js';
import { TechLabPanel } from './components/TechLabPanel.js';
import { TopBar } from './components/TopBar.js';
import { WarSceneModal, type WarSceneConfig } from './components/WarSceneModal.js';
import {
  advanceSeason,
  applyDiplomacyOutcome,
  applyHeroEncounterOutcome,
  createDefaultPlayerProfile,
  createNewGame,
  executeAITurnAction,
  factionHasTech,
  getCityGenerals,
  performAttackCity,
  performDevelopCity,
  performFortifyCity,
  performNightRaid,
  performPrisonerAction,
  performRecruitTroops,
  performReinforceCity,
  performRelocateHero,
  performResearchTech,
  performRewardHero,
  performSabotageBombard,
  performSowDiscord,
  resolveStoryEventChoice,
} from './game/engine.js';
import type {
  AIProviderStatus,
  AIRequestConfig,
  BattleReport,
  DiplomacyProposalType,
  DiplomacyResponse,
  DuelResult,
  FactionId,
  GameState,
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
import { battleAudio } from './utils/battleAudio.js';

type RightTab = 'city' | 'heroes' | 'tech' | 'advisor' | 'diplomacy' | 'chronicle';

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

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    const p = new URLSearchParams(window.location.search).get('lang');
    return p === 'zh' ? 'zh' : 'en';
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
  const [focusedHeroId, setFocusedHeroId] = useState<string | null>(null);
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
  } | null>(null);
  const [warQueue, setWarQueue] = useState<WarTheaterQueueItem[]>([]);
  const [warStage, setWarStage] = useState<WarStage>('idle');
  const [warBatchTotal, setWarBatchTotal] = useState<number>(0);
  const [heroEncounter, setHeroEncounter] = useState<{
    heroId: string;
    mode: HeroEncounterMode;
  } | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [providers, setProviders] = useState<AIProviderStatus[]>(DEFAULT_PROVIDERS);
  const [aiConfig, setAiConfig] = useState<AIRequestConfig>({ provider: 'auto' });

  useEffect(() => {
    fetchProviders()
      .then((res) => {
        if (res.providers?.length) setProviders(res.providers);
      })
      .catch(() => {
        // Keep defaults if offline
      });
  }, []);

  const [demoElapsed, setDemoElapsed] = useState<number>(0);

  // Optional ?demoWar=1 or ?demoMarch=1 URL preview for instant War Scene inspection
  useEffect(() => {
    if (!gameState) return;
    const params = new URLSearchParams(window.location.search);
    const demoWar = params.get('demoWar');
    const demoMarch = params.get('demoMarch');
    const demoTime = Number(params.get('demoTime') || '0');
    const demoTerrain = params.get('demoTerrain');
    if ((demoWar === '1' || demoMarch === '1') && warQueue.length === 0) {
      const atkHero = gameState.generals.guanyu || Object.values(gameState.generals)[0];
      const defHero = gameState.generals.xiahou || Object.values(gameState.generals)[1];
      const sampleBattle: BattleReport = {
        id: 'demo-battle',
        turn: gameState.turn,
        attackerFaction: 'shu',
        defenderFaction: 'wei',
        fromCityId: 'jiangling',
        toCityId: demoTerrain === 'plains' ? 'xuchang' : 'xiangyang',
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
      const demoState: GameState = {
        ...gameState,
        chrono: {
          ...gameState.chrono,
          unlockedTechs: ['gunpowder', 'stirrups', 'balloon', 'steamship'],
        },
      };
      const item = buildBattleWarItem(demoState, sampleBattle, {
        pincerFromCityId: 'hanzhong',
      });
      setDemoElapsed(Number.isFinite(demoTime) && demoTime > 0 ? demoTime : 0);
      setWarQueue([item]);
      setWarBatchTotal(1);
      setWarStage(demoMarch === '1' ? 'march' : 'theater');
    }
    // Run only once on mount for URL preview params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Advance Stage 1 (On-Map Animated March) -> Stage 2 (60fps Canvas War Scene Theater)
  useEffect(() => {
    if (warStage !== 'march' || warQueue.length === 0) return;
    battleAudio.playWarDrum(0.26);
    const timer = window.setTimeout(() => {
      setWarStage('theater');
    }, 920);
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

  function startCampaign(faction: PlayableFactionId, profile?: PlayerProfile) {
    const fresh = createNewGame(faction, profile || createDefaultPlayerProfile());
    const capital = Object.values(fresh.cities).find(
      (c) => c.owner === faction && c.isCapital
    );
    setGameState(fresh);
    setSelectedCityId(capital?.id || null);
    setActiveTab('heroes');
    setFocusedHeroId(null);
    setAttackMode(false);
    setWarQueue([]);
    setWarStage('idle');
    setWarBatchTotal(0);
    setPendingMilitary(null);
    setActiveDuel(null);
    setHeroEncounter(null);
  }

  function handleTogglePlayerAvatar() {
    if (!gameState) return;
    const nextAvatar = gameState.playerProfile.avatar === 'male' ? 'female' : 'male';
    setGameState({
      ...gameState,
      playerProfile: createDefaultPlayerProfile(nextAvatar, gameState.playerProfile.name),
    });
  }

  function handleSelectCity(cityId: string) {
    setSelectedCityId(cityId);
    setActiveTab('city');
  }

  function handleInspectHero(heroId: string) {
    setFocusedHeroId(heroId);
    setActiveTab('heroes');
  }

  function executeAssaultWithOptionalDuel(
    payload: ExecuteMilitaryPayload,
    duelResult?: DuelResult
  ) {
    if (!gameState) return;
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
    setGameState(updated);
    setPendingMilitary(null);
    setActiveDuel(null);
    setAttackMode(false);
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
    if (!gameState) return;

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
      setGameState(updated);
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
      setGameState(updated);
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
      setGameState(updated);
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
    if (!gameState) return;
    const fromCity = gameState.cities[fromCityId];
    if (!fromCity) return;
    const amount = Math.round(fromCity.troops * 0.4);
    setGameState(
      performReinforceCity(gameState, gameState.playerFaction, fromCityId, toCityId, amount, true)
    );
  }

  function handleHeroEncounterResolved(
    heroId: string,
    mode: HeroEncounterMode,
    res: HeroEncounterResponse,
    giftGold: number
  ) {
    if (!gameState) return;
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

    setGameState(
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
    if (!gameState) return;
    const playerF = gameState.factions[gameState.playerFaction];
    const targetF = gameState.factions[targetFaction];

    const summary = {
      en: `Diplomacy (${proposalType}) with ${targetF.rulerName.en}: ${result.decision.toUpperCase()} (${result.relationDelta >= 0 ? '+' : ''}${result.relationDelta} relation).`,
      zh: `${playerF.shortName.zh}遣使向${targetF.rulerName.zh}交涉（${proposalType}）：结果 ${result.decision}（关系 ${result.relationDelta >= 0 ? '+' : ''}${result.relationDelta}）。`,
    };

    const actualGift = proposalType === 'gift' && result.decision !== 'reject' ? giftGold : 0;

    setGameState(
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

  async function handleEndTurn() {
    if (!gameState || isEndingTurn || gameState.winner || gameState.isPlayerDefeated) return;
    setIsEndingTurn(true);

    try {
      let current = gameState;
      const incomingPlayerAttacks: WarTheaterQueueItem[] = [];
      const aiFactions = (['wei', 'shu', 'wu'] as PlayableFactionId[]).filter(
        (fid) => fid !== current.playerFaction && !current.factions[fid].isEliminated
      );

      for (const fid of aiFactions) {
        if (current.winner || current.isPlayerDefeated) break;
        try {
          const decision = await requestAITurnDecision({
            gameState: current,
            factionId: fid,
            language: lang,
            aiConfig,
          });

          const prevBattleId = current.lastBattle?.id;
          const prevOpId = current.lastOperation?.id;
          const targetId = decision.action.targetCityId;
          const targetWasPlayer = Boolean(
            targetId && current.cities[targetId]?.owner === current.playerFaction
          );
          const preFromTroops = current.cities[decision.action.cityId]?.troops ?? 0;
          const preTargetTroops = targetId ? current.cities[targetId]?.troops ?? 0 : 0;

          current = executeAITurnAction(current, fid, decision.action, decision.proclamation);

          if (targetWasPlayer && current.lastBattle && current.lastBattle.id !== prevBattleId) {
            incomingPlayerAttacks.push(
              buildBattleWarItem(current, current.lastBattle, { isPlayerDefending: true })
            );
          } else if (
            targetWasPlayer &&
            current.lastOperation &&
            current.lastOperation.id !== prevOpId
          ) {
            incomingPlayerAttacks.push(
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
      if (incomingPlayerAttacks.length > 0) {
        enqueueWarItems(incomingPlayerAttacks);
      }
    } finally {
      setIsEndingTurn(false);
    }
  }

  const providerLabel =
    aiConfig.provider === 'auto'
      ? providers.find((p) => p.id !== 'heuristic' && p.configured)?.id.toUpperCase() ||
        'HEURISTIC'
      : aiConfig.provider.toUpperCase();

  if (!gameState) {
    return (
      <>
        <FactionSelect
          lang={lang}
          onToggleLang={() => setLang((l) => (l === 'en' ? 'zh' : 'en'))}
          onSelectFaction={startCampaign}
          onOpenSettings={() => setShowSettings(true)}
          providers={providers}
          selectedProviderMode={aiConfig.provider}
        />
        {showSettings && (
          <SettingsModal
            lang={lang}
            providers={providers}
            currentConfig={aiConfig}
            onSave={setAiConfig}
            onClose={() => setShowSettings(false)}
          />
        )}
      </>
    );
  }

  const tabs: Array<{ id: RightTab; label: string; icon: typeof Castle }> = [
    { id: 'city', label: lang === 'zh' ? '城池' : 'City', icon: Castle },
    { id: 'heroes', label: lang === 'zh' ? '名将录' : 'Heroes', icon: Users },
    { id: 'tech', label: lang === 'zh' ? '科技' : 'Tech', icon: FlaskConical },
    { id: 'advisor', label: lang === 'zh' ? '军师' : 'Council', icon: Sparkles },
    { id: 'diplomacy', label: lang === 'zh' ? '外交' : 'Diplo', icon: Handshake },
    { id: 'chronicle', label: lang === 'zh' ? '史记' : 'Log', icon: ScrollText },
  ];

  const duelAttacker = activeDuel?.payload.generalId
    ? gameState.generals[activeDuel.payload.generalId]
    : undefined;
  const duelDefender = activeDuel?.payload.defenderHeroId
    ? gameState.generals[activeDuel.payload.defenderHeroId]
    : undefined;
  const activeWarItem = warQueue[0] ?? null;
  const queueBadge =
    warBatchTotal > 1 ? `${warBatchTotal - warQueue.length + 1} / ${warBatchTotal}` : undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        state={gameState}
        lang={lang}
        isEndingTurn={isEndingTurn}
        providerLabel={providerLabel}
        onToggleLang={() => setLang((l) => (l === 'en' ? 'zh' : 'en'))}
        onTogglePlayerAvatar={handleTogglePlayerAvatar}
        onOpenSettings={() => setShowSettings(true)}
        onEndTurn={handleEndTurn}
        onNewGame={() => setGameState(null)}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-5 py-4 grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left: Realistic Topographic Map + Chronicle Strip */}
        <div className="xl:col-span-8 space-y-3">
          <StrategyMap
            state={gameState}
            lang={lang}
            selectedCityId={selectedCityId}
            attackMode={attackMode}
            activeMapMarch={warStage === 'march' ? activeWarItem?.march ?? null : null}
            onToggleAttackMode={() => setAttackMode((v) => !v)}
            onSelectCity={handleSelectCity}
            onQuickTargetEnemy={(targetCityId) => {
              setSelectedCityId(targetCityId);
              setPendingMilitary({ targetCityId });
              setAttackMode(false);
            }}
            onInspectHero={handleInspectHero}
          />

          {gameState.chronicle[0] && (
            <div className="ink-panel rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <ScrollText className="w-4 h-4 text-[#d4a853] shrink-0" />
                <span className="truncate text-[#e6dfd0]">
                  {tLoc(gameState.chronicle[0].text, lang)}
                </span>
              </div>
              <button
                onClick={() => setActiveTab('chronicle')}
                className="text-[#d4a853] hover:underline shrink-0 font-semibold cursor-pointer"
              >
                {lang === 'zh' ? '全部战报' : 'All Logs'}
              </button>
            </div>
          )}
        </div>

        {/* Right: 6-Tab Hero-Centric Command Drawer */}
        <aside className="xl:col-span-4 ink-panel rounded-2xl overflow-hidden flex flex-col">
          <div className="grid grid-cols-6 border-b border-slate-700/60 bg-slate-950/65">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[10px] font-semibold border-b-2 transition cursor-pointer ${
                    active
                      ? 'border-cyan-400 text-cyan-200 bg-cyan-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="truncate max-w-full">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-[580px]">
            {activeTab === 'city' && (
              <CityPanel
                state={gameState}
                lang={lang}
                selectedCityId={selectedCityId}
                onDevelop={(cid) =>
                  setGameState(performDevelopCity(gameState, gameState.playerFaction, cid, true))
                }
                onFortify={(cid) =>
                  setGameState(performFortifyCity(gameState, gameState.playerFaction, cid, true))
                }
                onRecruit={(cid) =>
                  setGameState(performRecruitTroops(gameState, gameState.playerFaction, cid, true))
                }
                onOpenMilitary={(targetCityId, fromCityId, action) =>
                  setPendingMilitary({ targetCityId, fromCityId, action })
                }
                onReinforce={handleReinforce}
                onSelectCity={handleSelectCity}
                onInspectHero={handleInspectHero}
                onRecruitWanderingHero={(heroId) =>
                  setHeroEncounter({ heroId, mode: 'recruit' })
                }
              />
            )}

            {activeTab === 'heroes' && (
              <HeroesPanel
                state={gameState}
                lang={lang}
                focusedHeroId={focusedHeroId}
                onSelectFocusHero={setFocusedHeroId}
                onRelocateHero={(heroId, targetCityId) =>
                  setGameState(
                    performRelocateHero(
                      gameState,
                      gameState.playerFaction,
                      heroId,
                      targetCityId,
                      true
                    )
                  )
                }
                onRewardHero={(heroId) =>
                  setGameState(performRewardHero(gameState, gameState.playerFaction, heroId))
                }
                onOpenEncounter={(heroId, mode) => setHeroEncounter({ heroId, mode })}
                onPrisonerAction={(heroId, action) =>
                  setGameState(performPrisonerAction(gameState, heroId, action))
                }
              />
            )}

            {activeTab === 'tech' && (
              <TechLabPanel
                state={gameState}
                lang={lang}
                onResearchTech={(techId: TechId, researcherId?: string) =>
                  setGameState(performResearchTech(gameState, techId, researcherId))
                }
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
        </aside>
      </main>

      {/* Unified War Room Military Operations Modal (5 Operations + Live Odds + Pincer) */}
      {pendingMilitary && (
        <MilitaryModal
          state={gameState}
          lang={lang}
          targetCityId={pendingMilitary.targetCityId}
          initialFromCityId={pendingMilitary.fromCityId}
          initialAction={pendingMilitary.action}
          onCancel={() => setPendingMilitary(null)}
          onExecute={handleExecuteMilitary}
        />
      )}

      {/* Interactive 3-Round Pre-Battle Hero Duel Modal */}
      {activeDuel && duelAttacker && duelDefender && (
        <DuelModal
          state={gameState}
          lang={lang}
          attacker={duelAttacker}
          defender={duelDefender}
          onComplete={(duelResult) =>
            executeAssaultWithOptionalDuel(activeDuel.payload, duelResult)
          }
        />
      )}

      {/* Stage 2: 60fps HTML5 Canvas 2.5D War Scene Theater Modal */}
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
            setGameState(performPrisonerAction(gameState, heroId, action))
          }
        />
      )}

      {/* AI Hero Recruitment / Persuasion / Private Chat Modal */}
      {heroEncounter && (
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
      {warStage === 'idle' && gameState.activeEvent && (
        <HeroEventModal
          event={gameState.activeEvent}
          state={gameState}
          lang={lang}
          onChoose={(choiceId) => setGameState(resolveStoryEventChoice(gameState, choiceId))}
        />
      )}

      {showSettings && (
        <SettingsModal
          lang={lang}
          providers={providers}
          currentConfig={aiConfig}
          onSave={setAiConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Victory / Defeat Overlay */}
      {warStage === 'idle' && (gameState.winner || gameState.isPlayerDefeated) && (
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
              onClick={() => setGameState(null)}
              className="w-full py-3 rounded-xl bg-[#d4a853] hover:bg-[#e1b866] text-[#11151d] font-bold text-sm transition cursor-pointer"
            >
              {tLoc(UI_TEXT.playAgain, lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
