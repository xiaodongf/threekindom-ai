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
  Palette,
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
import { VISUAL_THEMES, VISUAL_THEME_ORDER, type VisualThemeId } from '../utils/visualTheme.js';

interface TopBarProps {
  state: GameState;
  lang: Language;
  visualTheme: VisualThemeId;
  isEndingTurn: boolean;
  providerLabel: string;
  onToggleLang: () => void;
  onChangeVisualTheme: (theme: VisualThemeId) => void;
  onTogglePlayerAvatar: () => void;
  onOpenSettings: () => void;
  onEndTurn: () => void;
  onNewGame: () => void;
}

export function TopBar({
  state,
  lang,
  visualTheme,
  isEndingTurn,
  providerLabel,
  onToggleLang,
  onChangeVisualTheme,
  onTogglePlayerAvatar,
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

  const playerDisplayName =
    state.playerProfile.name || (lang === 'zh' ? '天命奇士' : 'Chrono-Strategist');

  const dateLabel =
    lang === 'zh'
      ? `${state.year}年 · ${SEASONS_TEXT[state.season].zh}（第 ${state.turn} 季）`
      : `${state.year} AD · ${SEASONS_TEXT[state.season].en} (T${state.turn})`;

  return (
    <header className="ink-panel border-x-0 border-t-0 px-3 sm:px-4 py-2 flex flex-wrap xl:flex-nowrap items-center justify-between gap-2 sticky top-0 z-30">
      {/* Left: YOUR Time-Traveler Portrait + Kingdom Badge */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onTogglePlayerAvatar}
          title={
            lang === 'zh'
              ? '点击切换你的穿越者头像（男/女）'
              : 'Click to switch your Time-Traveler portrait'
          }
          className="relative group cursor-pointer shrink-0"
        >
          <img
            src={state.playerProfile.portrait}
            alt={playerDisplayName}
            className="w-9 h-9 rounded-xl object-cover object-top border-2 border-cyan-400 shadow-[0_0_16px_rgba(56,189,248,0.35)] group-hover:scale-105 transition"
          />
          <span
            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-md flex items-center justify-center font-seal text-[10px] font-black text-white shadow border border-white/40"
            style={{ backgroundColor: faction.color }}
          >
            {faction.bannerChar}
          </span>
        </button>

        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="font-display text-sm font-bold text-white leading-tight whitespace-nowrap">
              {playerDisplayName}
            </h1>
            <span className="text-[11px] text-slate-400 hidden 2xl:inline">
              · {tLoc(faction.name, lang)}
            </span>
          </div>
          <div className="text-[11px] text-cyan-300 font-medium whitespace-nowrap">{dateLabel}</div>
        </div>
      </div>

      {/* Center: Sleek Modern Resource & Chrono Ribbon */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/85 border border-slate-700/70">
          <Coins className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-white">{faction.gold.toLocaleString()}</span>
          <span className="text-[10px] text-emerald-400">+{income.gold}</span>
        </div>

        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/85 border border-slate-700/70">
          <Wheat className="w-3.5 h-3.5 text-yellow-400" />
          <span className="font-semibold text-white">{faction.food.toLocaleString()}</span>
          <span className="text-[10px] text-emerald-400">+{income.food}</span>
        </div>

        <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/85 border border-slate-700/70">
          <Shield className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-semibold text-white">{(totalTroops / 1000).toFixed(1)}k</span>
        </div>

        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-950/60 border border-indigo-400/35">
          <Crown className="w-3.5 h-3.5 text-indigo-300" />
          <span className="font-semibold text-white">
            {ownedCount}/{VICTORY_CITY_TARGET}
          </span>
        </div>

        {/* Chrono Meters */}
        <div
          title={
            lang === 'zh'
              ? '主公信任度：≥80 获得额外行动力，≤35 武将忠诚流失'
              : "Lord's Trust: ≥80 grants +1 AP, ≤35 drains hero loyalty"
          }
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-950/45 border border-emerald-500/35"
        >
          <HeartHandshake className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400 hidden lg:inline">
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
              ? 'bg-rose-950/70 border-rose-500/70 animate-pulse'
              : 'bg-slate-900/85 border-slate-700/70'
          }`}
        >
          <Eye className={`w-3.5 h-3.5 ${suspicionDanger ? 'text-rose-400' : 'text-amber-300'}`} />
          <span className="text-slate-400 hidden lg:inline">
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
              ? 'bg-rose-950/70 border-rose-500/65 text-rose-200'
              : stage === 'distorted'
                ? 'bg-amber-950/50 border-amber-400/50 text-amber-200'
                : 'bg-cyan-950/50 border-cyan-400/40 text-cyan-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{lang === 'zh' ? '偏移' : 'Div'}</span>
          <span className="font-bold">{state.chrono.divergence}%</span>
        </div>

        {state.chrono.coalitionActive && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600/35 border border-rose-400/70 text-rose-100 font-bold">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
            <span>{lang === 'zh' ? '联军讨逆' : 'Coalition'}</span>
          </div>
        )}

        {/* Action Points */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/85 border border-slate-700/70">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <div className="flex items-center gap-1">
            {Array.from({ length: state.maxActionPoints }).map((_, idx) => (
              <span
                key={idx}
                className={`w-2 h-2 rounded-full transition ${
                  idx < state.actionPoints
                    ? 'bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]'
                    : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            const nextIdx = (VISUAL_THEME_ORDER.indexOf(visualTheme) + 1) % VISUAL_THEME_ORDER.length;
            onChangeVisualTheme(VISUAL_THEME_ORDER[nextIdx]);
          }}
          title={
            lang === 'zh'
              ? `当前画风：${VISUAL_THEMES[visualTheme].name.zh}（点击切换史诗电影 / 水墨金箔 / 时空黑曜）`
              : `Art Theme: ${VISUAL_THEMES[visualTheme].name.en} (Click to switch Cinema / Ink & Gold / Chrono)`
          }
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/75 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-amber-200 transition cursor-pointer"
        >
          <span
            className="w-2.5 h-2.5 rounded-full border border-white/50 shrink-0"
            style={{ background: VISUAL_THEMES[visualTheme].previewGradient }}
          />
          <Palette className="w-3.5 h-3.5 text-amber-300 hidden sm:inline" />
          <span className="hidden lg:inline">{tLoc(VISUAL_THEMES[visualTheme].shortName, lang)}</span>
        </button>

        <button
          onClick={onOpenSettings}
          title={tLoc(UI_TEXT.aiSettings, lang)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/75 hover:bg-slate-700/80 border border-slate-700 text-xs text-slate-200 transition cursor-pointer"
        >
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden xl:inline max-w-[90px] truncate">{providerLabel}</span>
        </button>

        <button
          onClick={onToggleLang}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/75 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-cyan-300 transition cursor-pointer"
        >
          <Languages className="w-3.5 h-3.5" />
          <span>{lang === 'en' ? '中文' : 'EN'}</span>
        </button>

        <button
          onClick={onNewGame}
          title={tLoc(UI_TEXT.newGame, lang)}
          className="p-1.5 rounded-lg bg-slate-800/75 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onEndTurn}
          disabled={isEndingTurn || Boolean(state.winner) || state.isPlayerDefeated}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold text-xs bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-50 text-white shadow-lg shadow-cyan-950/50 transition cursor-pointer"
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
