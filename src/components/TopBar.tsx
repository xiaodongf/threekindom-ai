import {
  Coins,
  Cpu,
  Crown,
  FastForward,
  Languages,
  Loader2,
  RotateCcw,
  Shield,
  Wheat,
  Zap,
} from 'lucide-react';
import { VICTORY_CITY_TARGET } from '../game/data.js';
import {
  getFactionCities,
  getFactionIncome,
  getFactionTotalTroops,
} from '../game/engine.js';
import type { GameState, Language } from '../game/types.js';
import { SEASONS_TEXT, UI_TEXT, tLoc } from '../i18n/translations.js';

interface TopBarProps {
  state: GameState;
  lang: Language;
  isEndingTurn: boolean;
  providerLabel: string;
  onToggleLang: () => void;
  onOpenSettings: () => void;
  onEndTurn: () => void;
  onNewGame: () => void;
}

export function TopBar({
  state,
  lang,
  isEndingTurn,
  providerLabel,
  onToggleLang,
  onOpenSettings,
  onEndTurn,
  onNewGame,
}: TopBarProps) {
  const faction = state.factions[state.playerFaction];
  const ownedCount = getFactionCities(state, state.playerFaction).length;
  const totalTroops = getFactionTotalTroops(state, state.playerFaction);
  const income = getFactionIncome(state, state.playerFaction);

  const dateLabel =
    lang === 'zh'
      ? `公元 ${state.year} 年 · ${SEASONS_TEXT[state.season].zh}（第 ${state.turn} 季）`
      : `${state.year} AD · ${SEASONS_TEXT[state.season].en} (Turn ${state.turn})`;

  return (
    <header className="ink-panel border-x-0 border-t-0 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
      {/* Left: Faction Identity + Season */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center font-seal text-xl font-black shadow shrink-0"
          style={{
            background: `linear-gradient(135deg, ${faction.color}, ${faction.color}77)`,
            border: `1.5px solid ${faction.accent}`,
            color: '#fff',
          }}
        >
          {faction.bannerChar}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-base sm:text-lg font-bold text-[#f7efe0] leading-tight">
              {tLoc(faction.name, lang)}
            </h1>
            <span className="text-xs text-[#9ea3ae] hidden sm:inline">
              · {tLoc(faction.rulerName, lang)}
            </span>
          </div>
          <div className="text-xs text-[#d4a853] font-medium">{dateLabel}</div>
        </div>
      </div>

      {/* Center: Live Resource Ribbon */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0d1015]/85 border border-white/10">
          <Coins className="w-3.5 h-3.5 text-[#eab308]" />
          <span className="font-semibold text-[#f5ecd7]">{faction.gold.toLocaleString()}</span>
          <span className="text-[10px] text-emerald-400">+{income.gold}</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0d1015]/85 border border-white/10">
          <Wheat className="w-3.5 h-3.5 text-[#f59e0b]" />
          <span className="font-semibold text-[#f5ecd7]">{faction.food.toLocaleString()}</span>
          <span className="text-[10px] text-emerald-400">+{income.food}</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0d1015]/85 border border-white/10">
          <Shield className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-semibold text-[#f5ecd7]">{totalTroops.toLocaleString()}</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0d1015]/85 border border-[#d4a853]/30">
          <Crown className="w-3.5 h-3.5 text-[#d4a853]" />
          <span className="font-semibold text-[#f5ecd7]">
            {ownedCount} / {VICTORY_CITY_TARGET}
          </span>
        </div>

        {/* Action Points */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0d1015]/85 border border-white/10">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[#b8b2a2] hidden md:inline">{tLoc(UI_TEXT.actionPoints, lang)}</span>
          <div className="flex items-center gap-1 ml-0.5">
            {Array.from({ length: state.maxActionPoints }).map((_, idx) => (
              <span
                key={idx}
                className={`w-2.5 h-2.5 rounded-full transition ${
                  idx < state.actionPoints
                    ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                    : 'bg-white/15'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right: Controls & End Turn */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSettings}
          title={tLoc(UI_TEXT.aiSettings, lang)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[#ebe5d5] transition cursor-pointer"
        >
          <Cpu className="w-3.5 h-3.5 text-[#d4a853]" />
          <span className="hidden lg:inline max-w-[110px] truncate">{providerLabel}</span>
        </button>

        <button
          onClick={onToggleLang}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-[#d4a853] transition cursor-pointer"
        >
          <Languages className="w-3.5 h-3.5" />
          <span>{lang === 'en' ? '中文' : 'EN'}</span>
        </button>

        <button
          onClick={onNewGame}
          title={tLoc(UI_TEXT.newGame, lang)}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[#b8b2a2] hover:text-white transition cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={onEndTurn}
          disabled={isEndingTurn || Boolean(state.winner) || state.isPlayerDefeated}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg font-semibold text-xs sm:text-sm bg-gradient-to-r from-[#c84b31] to-[#a83620] hover:from-[#da573c] hover:to-[#bc3f27] disabled:opacity-50 text-white shadow-lg shadow-red-950/50 transition cursor-pointer"
        >
          {isEndingTurn ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{tLoc(UI_TEXT.aiThinking, lang)}</span>
            </>
          ) : (
            <>
              <FastForward className="w-4 h-4" />
              <span>{tLoc(UI_TEXT.endTurn, lang)}</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
