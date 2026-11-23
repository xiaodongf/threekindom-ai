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
import { StrategyMap } from './components/StrategyMap.js';
import { TechLabPanel } from './components/TechLabPanel.js';
import { TopBar } from './components/TopBar.js';
import {
  advanceSeason,
  applyDiplomacyOutcome,
  applyHeroEncounterOutcome,
  createDefaultPlayerProfile,
  createNewGame,
  executeAITurnAction,
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
  GameState,
  HeroEncounterMode,
  HeroEncounterResponse,
  Language,
  MilitaryActionType,
  OperationReport,
  PlayableFactionId,
  PlayerProfile,
  TechId,
} from './game/types.js';
import { UI_TEXT, tLoc } from './i18n/translations.js';
import { fetchProviders, requestAITurnDecision } from './services/aiClient.js';

type RightTab = 'city' | 'heroes' | 'tech' | 'advisor' | 'diplomacy' | 'chronicle';

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
  const [battleReportModal, setBattleReportModal] = useState<BattleReport | null>(null);
  const [operationReportModal, setOperationReportModal] = useState<OperationReport | null>(null);
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
    setBattleReportModal(null);
    setOperationReportModal(null);
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
      setBattleReportModal(updated.lastBattle);
    }
  }

  function handleExecuteMilitary(payload: ExecuteMilitaryPayload) {
    if (!gameState) return;

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
      if (updated.lastOperation) setOperationReportModal(updated.lastOperation);
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
      if (updated.lastOperation) setOperationReportModal(updated.lastOperation);
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
      if (updated.lastOperation) setOperationReportModal(updated.lastOperation);
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
          current = executeAITurnAction(current, fid, decision.action, decision.proclamation);
        } catch (err) {
          console.warn(`AI turn failed for ${fid}:`, err);
        }
      }

      if (!current.winner && !current.isPlayerDefeated) {
        current = advanceSeason(current);
      }

      setGameState(current);
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

      {/* Special Military Operation Report Modal (Night Raid / Bombard / Discord) */}
      {operationReportModal && (
        <OperationReportModal
          report={operationReportModal}
          state={gameState}
          lang={lang}
          onClose={() => setOperationReportModal(null)}
        />
      )}

      {/* Battle Report + Prisoner Fate Modal */}
      {battleReportModal && (
        <BattleReportModal
          report={battleReportModal}
          state={gameState}
          lang={lang}
          onClose={() => setBattleReportModal(null)}
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
      {gameState.activeEvent && (
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
      {(gameState.winner || gameState.isPlayerDefeated) && (
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
