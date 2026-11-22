import { useEffect, useState } from 'react';
import {
  Castle,
  Crown,
  Handshake,
  ScrollText,
  Skull,
  Sparkles,
} from 'lucide-react';
import { AdvisorPanel } from './components/AdvisorPanel.js';
import { AttackSetupModal, BattleReportModal } from './components/BattleModal.js';
import { ChronicleLog } from './components/ChronicleLog.js';
import { CityPanel } from './components/CityPanel.js';
import { DiplomacyPanel } from './components/DiplomacyPanel.js';
import { FactionSelect } from './components/FactionSelect.js';
import { SettingsModal } from './components/SettingsModal.js';
import { StrategyMap } from './components/StrategyMap.js';
import { TopBar } from './components/TopBar.js';
import {
  advanceSeason,
  applyDiplomacyOutcome,
  createNewGame,
  executeAITurnAction,
  performAttackCity,
  performDevelopCity,
  performFortifyCity,
  performRecruitTroops,
  performReinforceCity,
} from './game/engine.js';
import type {
  AIProviderStatus,
  AIRequestConfig,
  BattleReport,
  DiplomacyProposalType,
  DiplomacyResponse,
  GameState,
  Language,
  PlayableFactionId,
  TacticId,
} from './game/types.js';
import { UI_TEXT, tLoc } from './i18n/translations.js';
import { fetchProviders, requestAITurnDecision } from './services/aiClient.js';

type RightTab = 'city' | 'advisor' | 'diplomacy' | 'chronicle';

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
  const [lang, setLang] = useState<Language>('en');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RightTab>('city');
  const [isEndingTurn, setIsEndingTurn] = useState(false);

  const [pendingAttack, setPendingAttack] = useState<{
    fromCityId: string;
    toCityId: string;
  } | null>(null);
  const [battleReportModal, setBattleReportModal] = useState<BattleReport | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [providers, setProviders] = useState<AIProviderStatus[]>(DEFAULT_PROVIDERS);
  const [aiConfig, setAiConfig] = useState<AIRequestConfig>({ provider: 'auto' });

  useEffect(() => {
    fetchProviders()
      .then((res) => {
        if (res.providers?.length) setProviders(res.providers);
      })
      .catch(() => {
        // Keep defaults if backend not reachable yet
      });
  }, []);

  function startCampaign(faction: PlayableFactionId) {
    const fresh = createNewGame(faction);
    const capital = Object.values(fresh.cities).find(
      (c) => c.owner === faction && c.isCapital
    );
    setGameState(fresh);
    setSelectedCityId(capital?.id || null);
    setActiveTab('city');
    setBattleReportModal(null);
    setPendingAttack(null);
  }

  function handleSelectCity(cityId: string) {
    setSelectedCityId(cityId);
    setActiveTab('city');
  }

  function handleLaunchAttack(troops: number, tactic: TacticId, generalId?: string) {
    if (!gameState || !pendingAttack) return;
    const updated = performAttackCity(
      gameState,
      gameState.playerFaction,
      pendingAttack.fromCityId,
      pendingAttack.toCityId,
      troops,
      tactic,
      generalId,
      true
    );
    setGameState(updated);
    setPendingAttack(null);
    if (updated.lastBattle) {
      setBattleReportModal(updated.lastBattle);
    }
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
    { id: 'city', label: tLoc(UI_TEXT.tabCity, lang), icon: Castle },
    { id: 'advisor', label: tLoc(UI_TEXT.tabAdvisor, lang), icon: Sparkles },
    { id: 'diplomacy', label: tLoc(UI_TEXT.tabDiplomacy, lang), icon: Handshake },
    { id: 'chronicle', label: tLoc(UI_TEXT.tabChronicle, lang), icon: ScrollText },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        state={gameState}
        lang={lang}
        isEndingTurn={isEndingTurn}
        providerLabel={providerLabel}
        onToggleLang={() => setLang((l) => (l === 'en' ? 'zh' : 'en'))}
        onOpenSettings={() => setShowSettings(true)}
        onEndTurn={handleEndTurn}
        onNewGame={() => setGameState(null)}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-5 py-4 grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left: Strategic Map + Quick Chronicle Strip */}
        <div className="xl:col-span-8 space-y-3">
          <StrategyMap
            state={gameState}
            lang={lang}
            selectedCityId={selectedCityId}
            onSelectCity={handleSelectCity}
          />

          {/* Latest Dispatch Ticker */}
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

        {/* Right: Tabbed Command Panel */}
        <aside className="xl:col-span-4 ink-panel rounded-2xl overflow-hidden flex flex-col">
          <div className="grid grid-cols-4 border-b border-white/10 bg-[#0d1015]/70">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[11px] font-semibold border-b-2 transition cursor-pointer ${
                    active
                      ? 'border-[#d4a853] text-[#f7e7be] bg-white/[0.04]'
                      : 'border-transparent text-[#8b92a1] hover:text-[#ebe5d5]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="truncate max-w-full">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-[540px]">
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
                onOpenAttack={(fromCityId, toCityId) => setPendingAttack({ fromCityId, toCityId })}
                onReinforce={handleReinforce}
                onSelectCity={handleSelectCity}
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

      {/* Modals */}
      {pendingAttack && (
        <AttackSetupModal
          state={gameState}
          lang={lang}
          fromCityId={pendingAttack.fromCityId}
          toCityId={pendingAttack.toCityId}
          onCancel={() => setPendingAttack(null)}
          onLaunch={handleLaunchAttack}
        />
      )}

      {battleReportModal && (
        <BattleReportModal
          report={battleReportModal}
          state={gameState}
          lang={lang}
          onClose={() => setBattleReportModal(null)}
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
                  ? `${gameState.factions[gameState.winner].name.zh}（${gameState.factions[gameState.winner].rulerName.zh}）于公元 ${gameState.year} 年一统华夏！`
                  : `${gameState.factions[gameState.winner].name.en} under ${gameState.factions[gameState.winner].rulerName.en} unified the realm in ${gameState.year} AD!`
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
