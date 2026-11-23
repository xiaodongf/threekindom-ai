import type { ReactNode } from 'react';
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
import { CountUp } from './ui/CountUp.js';
import { Seal } from './ui/Seal.js';
import { Art } from './ui/Art.js';

interface TopBarProps {
  state: GameState;
  lang: Language;
  isEndingTurn: boolean;
  providerLabel: string;
  onToggleLang: () => void;
  onTogglePlayerAvatar: () => void;
  onOpenSettings: () => void;
  onEndTurn: () => void;
  onNewGame: () => void;
}

const SEASON_CHAR = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' } as const;

function Stat({
  icon,
  label,
  title,
  children,
  className = '',
}: {
  icon: ReactNode;
  label?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div title={title} className={`flex items-center gap-1.5 px-2.5 first:pl-0 ${className}`}>
      {icon}
      {label && <span className="hidden 2xl:inline text-[11px] text-slate-400">{label}</span>}
      <span className="text-[13px] font-semibold text-slate-50 leading-none">{children}</span>
    </div>
  );
}

const ICON = 'w-3.5 h-3.5 shrink-0';

export function TopBar({
  state,
  lang,
  isEndingTurn,
  providerLabel,
  onToggleLang,
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
      : `${state.year} AD · ${SEASONS_TEXT[state.season].en} · Turn ${state.turn}`;

  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`;

  return (
    <header className="ink-panel relative z-30 shrink-0 border-x-0 border-t-0 px-3 sm:px-4 py-1.5 min-h-12 flex flex-wrap xl:flex-nowrap items-center justify-between gap-x-4 gap-y-1.5">
      {/* The time-traveller: the one place the anachronism colour belongs */}
      <div className="flex items-center gap-2.5 shrink-0">
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
          <Art thumb
            src={state.playerProfile.portrait}
            alt={playerDisplayName}
            className="w-9 h-9 rounded-md object-cover object-top border border-chrono-400/80 shadow-[0_0_12px_rgba(34,211,238,0.28)] group-hover:brightness-110"
          />
          <Seal
            char={faction.bannerChar}
            size={17}
            color={faction.color}
            className="absolute -bottom-1.5 -right-1.5"
          />
        </button>

        <div className="leading-tight">
          <h1 className="font-display text-[15px] font-bold text-slate-50 whitespace-nowrap">
            {playerDisplayName}
            <span className="ml-1.5 text-[11px] font-sans font-normal text-slate-400 hidden 2xl:inline">
              {tLoc(faction.name, lang)}
            </span>
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] text-amber-200/90 whitespace-nowrap">
            <Seal char={SEASON_CHAR[state.season]} size={14} />
            <span>{dateLabel}</span>
          </div>
        </div>
      </div>

      {/* Realm · court · timeline, as one quiet line of whole numbers */}
      <div className="flex flex-wrap items-center gap-y-1 divide-x divide-amber-400/15">
        <Stat
          icon={<Coins className={`${ICON} text-amber-300`} />}
          title={lang === 'zh' ? `金：每季 ${signed(income.gold)}` : `Gold: ${signed(income.gold)} per season`}
        >
          <CountUp value={faction.gold} showDelta />
          <span className="ml-1 text-[10px] font-medium text-emerald-300/90">{signed(income.gold)}</span>
        </Stat>

        <Stat
          icon={<Wheat className={`${ICON} text-yellow-300`} />}
          title={lang === 'zh' ? `粮：每季 ${signed(income.food)}` : `Grain: ${signed(income.food)} per season`}
        >
          <CountUp value={faction.food} showDelta />
          <span className="ml-1 text-[10px] font-medium text-emerald-300/90">{signed(income.food)}</span>
        </Stat>

        <Stat
          className="hidden sm:flex"
          icon={<Shield className={`${ICON} text-sky-300`} />}
          title={lang === 'zh' ? '总兵力' : 'Total troops'}
        >
          <CountUp value={totalTroops} showDelta />
        </Stat>

        <Stat
          icon={<Crown className={`${ICON} text-amber-300`} />}
          title={
            lang === 'zh'
              ? `已据城池 / 一统所需（${VICTORY_CITY_TARGET}）`
              : `Cities held / needed to unify (${VICTORY_CITY_TARGET})`
          }
        >
          {ownedCount}
          <span className="text-slate-400 font-normal">/{VICTORY_CITY_TARGET}</span>
        </Stat>

        <Stat
          icon={<HeartHandshake className={`${ICON} text-emerald-300`} />}
          label={lang === 'zh' ? '信任' : 'Trust'}
          title={
            lang === 'zh'
              ? '主公信任度：≥80 获得额外行动力，≤35 武将忠诚流失'
              : "Lord's Trust: ≥80 grants +1 AP, ≤35 drains hero loyalty"
          }
        >
          <span className="text-emerald-200">
            <CountUp value={state.chrono.trust} />
          </span>
        </Stat>

        <Stat
          className={suspicionDanger ? 'animate-pulse' : ''}
          icon={<Eye className={`${ICON} ${suspicionDanger ? 'text-rose-400' : 'text-amber-300'}`} />}
          label={lang === 'zh' ? '猜忌' : 'Suspicion'}
          title={
            lang === 'zh'
              ? '朝堂猜忌：超过主公信任将触发「妖言惑众」弹劾危机！'
              : 'Court Suspicion: exceeding Trust triggers a harsh Sorcery Trial!'
          }
        >
          <span className={suspicionDanger ? 'text-rose-300' : 'text-amber-100'}>
            <CountUp value={state.chrono.suspicion} />
          </span>
        </Stat>

        <Stat
          icon={
            <Clock
              className={`${ICON} ${
                stage === 'shattered'
                  ? 'text-rose-400'
                  : stage === 'distorted'
                    ? 'text-amber-300'
                    : 'text-chrono-300'
              }`}
            />
          }
          label={lang === 'zh' ? '偏移' : 'Divergence'}
          title={
            lang === 'zh'
              ? '蝴蝶效应历史偏移：<30% 史书精准 | 30-59% 敌国仿制科技 | ≥60% 史轨崩塌+合纵讨伐！'
              : 'Butterfly Effect Divergence: <30% Sharp | 30-59% Distorted | ≥60% Shattered + Coalition!'
          }
        >
          <span
            className={
              stage === 'shattered'
                ? 'text-rose-300'
                : stage === 'distorted'
                  ? 'text-amber-200'
                  : 'text-chrono-200'
            }
          >
            <CountUp value={state.chrono.divergence} />%
          </span>
        </Stat>

        {state.chrono.coalitionActive && (
          <div className="flex items-center gap-1 px-2.5 text-[12px] font-bold text-rose-200">
            <AlertTriangle className={`${ICON} text-rose-400`} />
            <span>{lang === 'zh' ? '联军讨逆' : 'Coalition'}</span>
          </div>
        )}

        {/* Orders left this season */}
        <div
          className="flex items-center gap-1.5 px-2.5"
          title={
            lang === 'zh'
              ? `本季军令：${state.actionPoints} / ${state.maxActionPoints}`
              : `Orders this season: ${state.actionPoints} of ${state.maxActionPoints}`
          }
        >
          <span className="text-[11px] text-slate-400">{lang === 'zh' ? '军令' : 'Orders'}</span>
          <div className="flex items-center gap-1">
            {Array.from({ length: state.maxActionPoints }).map((_, idx) => (
              <span
                key={idx}
                className={`w-2 h-2 rotate-45 transition-colors ${
                  idx < state.actionPoints
                    ? 'bg-amber-300 shadow-[0_0_6px_rgba(208,167,79,0.8)]'
                    : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onOpenSettings}
          title={tLoc(UI_TEXT.aiSettings, lang)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-slate-300 hover:text-slate-50 hover:bg-white/5 cursor-pointer"
        >
          <Cpu className="w-3.5 h-3.5 text-chrono-300" />
          <span className="hidden xl:inline max-w-[90px] truncate">{providerLabel}</span>
        </button>

        <button
          onClick={onToggleLang}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold text-slate-300 hover:text-slate-50 hover:bg-white/5 cursor-pointer"
        >
          <Languages className="w-3.5 h-3.5" />
          <span>{lang === 'en' ? '中文' : 'EN'}</span>
        </button>

        <button
          onClick={onNewGame}
          title={tLoc(UI_TEXT.newGame, lang)}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-50 hover:bg-white/5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onEndTurn}
          disabled={isEndingTurn || Boolean(state.winner) || state.isPlayerDefeated}
          className="ml-1.5 flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs btn-gold cursor-pointer"
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
