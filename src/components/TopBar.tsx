import {
  AlertTriangle,
  Clock,
  Coins,
  Cpu,
  Crown,
  Eye,
  FastForward,
  HeartHandshake,
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
  getTimelineStage,
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
  const stage = getTimelineStage(state.chrono.divergence);
  const suspicionDanger = state.chrono.suspicion >= state.chrono.trust - 8;

  const dateLabel =
    lang === 'zh'
      ? `${state.year}年 · ${SEASONS_TEXT[state.season].zh}（第 ${state.turn} 季）`
      : `${state.year} AD · ${SEASONS_TEXT[state.season].en} (T${state.turn})`;

  return (
    <header className="ink-panel border-x-0 border-t-0 px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2.5 sticky top-0 z-30">
      {/* Left: Faction Identity + Season */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center font-seal text-lg font-black shadow shrink-0"
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
            <h1 className="font-display text-sm sm:text-base font-bold text-[#f7efe0] leading-tight">
              {tLoc(faction.name, lang)}
            </h1>
            <span className="text-[11px] text-[#9ea3ae] hidden md:inline">
              · {tLoc(faction.rulerName, lang)}
            </span>
          </div>
          <div className="text-[11px] text-[#d4a853] font-medium">{dateLabel}</div>
        </div>
      </div>

      {/* Center: Resources + Chrono Meters */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px]">
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0d1015]/85 border border-white/10">
          <Coins className="w-3.5 h-3.5 text-[#eab308]" />
          <span className="font-semibold text-[#f5ecd7]">{faction.gold.toLocaleString()}</span>
          <span className="text-[10px] text-emerald-400">+{income.gold}</span>
        </div>

        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0d1015]/85 border border-white/10">
          <Wheat className="w-3.5 h-3.5 text-[#f59e0b]" />
          <span className="font-semibold text-[#f5ecd7]">{faction.food.toLocaleString()}</span>
          <span className="text-[10px] text-emerald-400">+{income.food}</span>
        </div>

        <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0d1015]/85 border border-white/10">
          <Shield className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-semibold text-[#f5ecd7]">{(totalTroops / 1000).toFixed(1)}k</span>
        </div>

        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0d1015]/85 border border-[#d4a853]/30">
          <Crown className="w-3.5 h-3.5 text-[#d4a853]" />
          <span className="font-semibold text-[#f5ecd7]">
            {ownedCount}/{VICTORY_CITY_TARGET}
          </span>
        </div>

        {/* Chrono Meters: Trust, Suspicion, Butterfly Divergence */}
        <div
          title={
            lang === 'zh'
              ? '主公信任度：≥80 获得额外行动力，≤35 武将忠诚流失'
              : "Lord's Trust: ≥80 grants +1 AP, ≤35 drains hero loyalty"
          }
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-950/35 border border-emerald-500/30"
        >
          <HeartHandshake className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[#9ea3ae] hidden lg:inline">
            {lang === 'zh' ? '信任' : 'Trust'}
          </span>
          <span className="font-bold text-emerald-300">{state.chrono.trust}</span>
        </div>

        <div
          title={
            lang === 'zh'
              ? '朝堂猜忌：超过主公信任将触发「妖言惑众」弹劾危机！'
              : 'Court Suspicion: exceeding Trust triggers a harsh Sorcery Trial!'
          }
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${
            suspicionDanger
              ? 'bg-rose-950/60 border-rose-500/65 animate-pulse'
              : 'bg-[#0d1015]/85 border-white/10'
          }`}
        >
          <Eye className={`w-3.5 h-3.5 ${suspicionDanger ? 'text-rose-400' : 'text-amber-300'}`} />
          <span className="text-[#9ea3ae] hidden lg:inline">
            {lang === 'zh' ? '猜忌' : 'Susp'}
          </span>
          <span className={`font-bold ${suspicionDanger ? 'text-rose-300' : 'text-amber-200'}`}>
            {state.chrono.suspicion}
          </span>
        </div>

        <div
          title={
            lang === 'zh'
              ? '蝴蝶效应历史偏移：<30% 史书精准 | 30-59% 敌国仿制科技 | ≥60% 史轨崩塌+合纵讨伐！'
              : 'Butterfly Effect Divergence: <30% Sharp | 30-59% Distorted | ≥60% Shattered + Coalition!'
          }
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${
            stage === 'shattered'
              ? 'bg-rose-950/60 border-rose-500/60 text-rose-200'
              : stage === 'distorted'
                ? 'bg-amber-950/45 border-amber-400/45 text-amber-200'
                : 'bg-sky-950/40 border-sky-400/35 text-sky-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{lang === 'zh' ? '偏移' : 'Div'}</span>
          <span className="font-bold">{state.chrono.divergence}%</span>
        </div>

        {state.chrono.coalitionActive && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-700/40 border border-rose-400/65 text-rose-100 font-bold">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
            <span>{lang === 'zh' ? '联军讨逆' : 'Coalition'}</span>
          </div>
        )}

        {/* Action Points */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0d1015]/85 border border-white/10">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <div className="flex items-center gap-1">
            {Array.from({ length: state.maxActionPoints }).map((_, idx) => (
              <span
                key={idx}
                className={`w-2 h-2 rounded-full transition ${
                  idx < state.actionPoints
                    ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                    : 'bg-white/15'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onOpenSettings}
          title={tLoc(UI_TEXT.aiSettings, lang)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[#ebe5d5] transition cursor-pointer"
        >
          <Cpu className="w-3.5 h-3.5 text-[#d4a853]" />
          <span className="hidden xl:inline max-w-[90px] truncate">{providerLabel}</span>
        </button>

        <button
          onClick={onToggleLang}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-[#d4a853] transition cursor-pointer"
        >
          <Languages className="w-3.5 h-3.5" />
          <span>{lang === 'en' ? '中文' : 'EN'}</span>
        </button>

        <button
          onClick={onNewGame}
          title={tLoc(UI_TEXT.newGame, lang)}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[#b8b2a2] hover:text-white transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onEndTurn}
          disabled={isEndingTurn || Boolean(state.winner) || state.isPlayerDefeated}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold text-xs bg-gradient-to-r from-[#c84b31] to-[#a83620] hover:from-[#da573c] hover:to-[#bc3f27] disabled:opacity-50 text-white shadow-lg shadow-red-950/50 transition cursor-pointer"
        >
          {isEndingTurn ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{tLoc(UI_TEXT.aiThinking, lang)}</span>
            </>
          ) : (
            <>
              <FastForward className="w-3.5 h-3.5" />
              <span>{tLoc(UI_TEXT.endTurn, lang)}</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
