import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  Clock,
  Coins,
  Cpu,
  Crown,
  Eye,
  FastForward,
  Globe,
  HeartHandshake,
  Languages,
  Loader2,
  RotateCcw,
  Shield,
  UserCheck,
  Wheat,
} from 'lucide-react';
import {
  CITIES_PER_EXTRA_ORDER,
  MAX_ACTION_POINTS,
  MAX_REALM_BONUS_ORDERS,
  VICTORY_CITY_TARGET,
} from '../game/data.js';
import {
  getFactionCities,
  getFactionIncome,
  getFactionIncomeBreakdown,
  getFactionTotalTroops,
  getTimelineStage,
} from '../game/engine.js';
import type { GameState, Language, PlayableFactionId } from '../game/types.js';
import { SEASONS_TEXT, UI_TEXT, tLoc } from '../i18n/translations.js';
import type { ClientUser, MultiplayerRoomSummary } from '../services/persistenceClient.js';
import { CountUp } from './ui/CountUp.js';
import { Seal } from './ui/Seal.js';
import { Tip } from './ui/Tip.js';
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
  user?: ClientUser | null;
  saveIndicator?: 'idle' | 'saving' | 'saved' | 'offline';
  activeMpRoom?: MultiplayerRoomSummary | null;
  isMyTurnInMp?: boolean;
  onOpenSaves?: () => void;
  onOpenMultiplayer?: () => void;
  onOpenAuth?: () => void;
}

const SEASON_CHAR = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' } as const;

function Stat({
  icon,
  label,
  tip,
  align,
  children,
  className = '',
}: {
  icon: ReactNode;
  label?: string;
  tip?: ReactNode;
  align?: 'left' | 'right' | 'center';
  children: ReactNode;
  className?: string;
}) {
  const body = (
    <div className={`flex items-center gap-1.5 px-2.5 ${className}`}>
      {icon}
      {label && <span className="hidden 2xl:inline text-[11px] text-slate-400">{label}</span>}
      <span className="text-[13px] font-semibold text-slate-50 leading-none">{children}</span>
    </div>
  );
  return tip ? (
    <Tip content={tip} align={align}>
      {body}
    </Tip>
  ) : (
    body
  );
}

function TipTitle({ children }: { children: ReactNode }) {
  return <div className="font-display text-[15px] font-bold leading-tight mb-1">{children}</div>;
}

/** Two-column figures inside a tooltip; `mark` highlights the row that applies now. */
function Ledger({ rows, mark }: { rows: Array<[string, string]>; mark?: number }) {
  return (
    <div className="mt-1 border-t border-[#b9a67e]">
      {rows.map(([name, value], i) => (
        <div
          key={i}
          className={`flex items-baseline justify-between gap-4 border-b border-[#b9a67e]/60 py-0.5 ${
            mark === i ? 'font-bold text-[#84281c]' : ''
          }`}
        >
          <span>{name}</span>
          <span className="tabular-nums text-right">{value}</span>
        </div>
      ))}
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
  user,
  saveIndicator = 'idle',
  activeMpRoom,
  isMyTurnInMp = true,
  onOpenSaves,
  onOpenMultiplayer,
  onOpenAuth,
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
  const T = (en: string, zh: string) => (lang === 'zh' ? zh : en);
  const breakdown = getFactionIncomeBreakdown(state, state.playerFaction)
    .slice()
    .sort((x, y) => y.gold - x.gold);
  const cityName = (id: string) => tLoc(state.cities[id].name, lang);

  // Terms that recur inside tooltips, each with a slip of its own
  const ordersTerm = (
    <Tip
      term
      content={
        <span className="block">
          {T(
            'What you may command in one season. Refilled when the season ends.',
            '一季之内可下达的命令，季末恢复。'
          )}
        </span>
      }
    >
      {T('orders', '军令')}
    </Tip>
  );
  const governorTerm = (
    <Tip
      term
      content={
        <span className="block">
          {T(
            "A city's best statesman adds up to 15% to what it yields.",
            '城中政治最高的武将可使该城产出至多增加一成半。'
          )}
        </span>
      }
    >
      {T('a good governor', '良吏治理')}
    </Tip>
  );
  const suspicionTerm = (
    <Tip
      term
      content={
        <span className="block">
          {T(
            `The court's doubt about your strange knowledge, now ${state.chrono.suspicion}.`,
            `朝堂对你奇技的疑心，当前为 ${state.chrono.suspicion}。`
          )}
        </span>
      }
    >
      {T('suspicion', '猜忌')}
    </Tip>
  );

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

      {/* Realm · court · timeline, as one quiet line of whole numbers. Every figure explains itself. */}
      <div className="flex flex-wrap items-center gap-y-1 divide-x divide-amber-400/15">
        <Stat
          icon={<Coins className={`${ICON} text-amber-300`} />}
          tip={
            <>
              <TipTitle>{T('Gold', '金')}</TipTitle>
              <p>
                {T(`${signed(income.gold)} each season, city by city:`, `每季 ${signed(income.gold)}，各城所入：`)}
              </p>
              <Ledger rows={breakdown.map((r) => [cityName(r.cityId), `+${r.gold.toLocaleString()}`])} />
              <p className="mt-1.5">
                {T('Raised by ', '可由')}
                {governorTerm}
                {T(', trade and the people\u2019s support; spent on ', '、商业与民心提升；用于')}
                {ordersTerm}
                {T(', research and rewards.', '、研造与赏赐。')}
              </p>
            </>
          }
        >
          <CountUp value={faction.gold} showDelta />
          <span className="ml-1 text-[10px] font-medium text-emerald-300/90">{signed(income.gold)}</span>
        </Stat>

        <Stat
          icon={<Wheat className={`${ICON} text-yellow-300`} />}
          tip={
            <>
              <TipTitle>{T('Grain', '粮')}</TipTitle>
              <p>
                {T(`${signed(income.food)} each season, city by city:`, `每季 ${signed(income.food)}，各城所入：`)}
              </p>
              <Ledger rows={breakdown.map((r) => [cityName(r.cityId), `+${r.food.toLocaleString()}`])} />
              <p className="mt-1.5">
                {T('Raised by ', '可由')}
                {governorTerm}
                {T(', farming and the people\u2019s support. Armies eat it on the march.', '、农业与民心提升；大军出征即耗粮。')}
              </p>
            </>
          }
        >
          <CountUp value={faction.food} showDelta />
          <span className="ml-1 text-[10px] font-medium text-emerald-300/90">{signed(income.food)}</span>
        </Stat>

        <Stat
          className="hidden sm:flex"
          icon={<Shield className={`${ICON} text-sky-300`} />}
          tip={
            <>
              <TipTitle>{T('Troops', '兵力')}</TipTitle>
              <Ledger
                rows={getFactionCities(state, state.playerFaction)
                  .slice()
                  .sort((x, y) => y.troops - x.troops)
                  .map((c) => [tLoc(c.name, lang), c.troops.toLocaleString()])}
              />
              <p className="mt-1.5">
                {T('Raised in a city with a Recruit ', '于城中征兵需一道')}
                {ordersTerm}
                {T('.', '。')}
              </p>
            </>
          }
        >
          <CountUp value={totalTroops} showDelta />
        </Stat>

        <Stat
          icon={<Crown className={`${ICON} text-amber-300`} />}
          tip={
            <>
              <TipTitle>{T('Cities', '城池')}</TipTitle>
              <p>
                {T(
                  `You hold ${ownedCount}. Hold ${VICTORY_CITY_TARGET} to unify the realm.`,
                  `现据 ${ownedCount} 城，据有 ${VICTORY_CITY_TARGET} 城即可一统天下。`
                )}
              </p>
            </>
          }
        >
          {ownedCount}
          <span className="text-slate-400 font-normal">/{VICTORY_CITY_TARGET}</span>
        </Stat>

        <Stat
          icon={<HeartHandshake className={`${ICON} text-emerald-300`} />}
          label={T('Trust', '信任')}
          tip={
            <>
              <TipTitle>{T("Your lord's trust", '主公信任')}</TipTitle>
              <p>
                {T('At 80 or more you are given one extra ', '达 80 以上，每季多得一道')}
                {ordersTerm}
                {T(' each season. At 35 or less, your heroes begin to lose ', '；跌至 35 以下，麾下武将')}
                <Tip
                  term
                  content={
                    <span className="block">
                      {T(
                        'How firmly a hero stands with you. Low loyalty invites defection; rewards raise it.',
                        '武将追随你的坚定程度。忠诚低则易叛，赏赐可提升。'
                      )}
                    </span>
                  }
                >
                  {T('loyalty', '忠诚')}
                </Tip>
                {T('.', '开始流失。')}
              </p>
              <p className="mt-1.5">
                {T('It must stay above ', '须始终高于')}
                {suspicionTerm}
                {T('.', '。')}
              </p>
            </>
          }
        >
          <span className="text-emerald-200">
            <CountUp value={state.chrono.trust} />
          </span>
        </Stat>

        <Stat
          className={suspicionDanger ? 'animate-pulse' : ''}
          icon={<Eye className={`${ICON} ${suspicionDanger ? 'text-rose-400' : 'text-amber-300'}`} />}
          label={T('Suspicion', '猜忌')}
          tip={
            <>
              <TipTitle>{T('Court suspicion', '朝堂猜忌')}</TipTitle>
              <p>
                {T(
                  'Every marvel you build makes the court wonder what you are. If suspicion passes trust, you face a ',
                  '每造一件奇物，朝堂便多一分疑心。猜忌一旦超过信任，即遭'
                )}
                <Tip
                  term
                  content={
                    <span className="block">
                      {T(
                        'You are tried for sorcery: the workshop is sealed for several seasons and trust falls.',
                        '以「妖言惑众」受审：工坊封禁数季，信任大跌。'
                      )}
                    </span>
                  }
                >
                  {T('sorcery trial', '妖术审判')}
                </Tip>
                {T('.', '。')}
              </p>
              <p className="mt-1.5 font-semibold">
                {T(
                  `Now ${state.chrono.suspicion} against trust ${state.chrono.trust}.`,
                  `当前猜忌 ${state.chrono.suspicion}，信任 ${state.chrono.trust}。`
                )}
              </p>
            </>
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
          label={T('Divergence', '偏移')}
          align="right"
          tip={
            <>
              <TipTitle>{T('Divergence from history', '历史偏移')}</TipTitle>
              <p>{T('How far you have bent the timeline you remember.', '你已将所知的历史扭曲了多少。')}</p>
              <Ledger
                rows={[
                  [T('Under 30%', '30% 以下'), T('your histories hold true', '史书仍然精准')],
                  [T('30–59%', '30–59%'), T('rivals copy your inventions', '敌国仿制你的发明')],
                  [T('60% and over', '60% 以上'), T('history breaks', '史轨崩塌')],
                ]}
                mark={stage === 'shattered' ? 2 : stage === 'distorted' ? 1 : 0}
              />
              <p className="mt-1.5">
                {T('When history breaks, the other realms may form a ', '史轨崩塌之时，诸侯或将结成')}
                <Tip
                  term
                  content={
                    <span className="block">
                      {T(
                        'The other realms set aside their quarrels and march on you together.',
                        '诸侯暂弃前嫌，合兵讨伐于你。'
                      )}
                    </span>
                  }
                >
                  {T('coalition', '讨逆联军')}
                </Tip>
                {T(' against you.', '。')}
              </p>
            </>
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
            <span>{T('Coalition', '联军讨逆')}</span>
          </div>
        )}

        {/* Orders left this season */}
        <Tip
          align="right"
          content={
            <>
              <TipTitle>{T('Orders', '军令')}</TipTitle>
              <p>
                {T(
                  `${state.actionPoints} of ${state.maxActionPoints} left this season. Recruiting, developing, fortifying, moving a hero and every march cost one.`,
                  `本季尚余 ${state.actionPoints} / ${state.maxActionPoints}。征兵、开发、筑防、调遣与每次出征各耗一道。`
                )}
              </p>
              <p className="mt-1.5">
                {T(
                  `A realm gives three orders, and one more for every ${CITIES_PER_EXTRA_ORDER} cities it holds, up to ${MAX_ACTION_POINTS + MAX_REALM_BONUS_ORDERS}.`,
                  `一国每季三道军令，每据 ${CITIES_PER_EXTRA_ORDER} 城再添一道，至多 ${MAX_ACTION_POINTS + MAX_REALM_BONUS_ORDERS} 道。`
                )}
              </p>
            </>
          }
        >
          <div className="flex items-center gap-1.5 px-2.5">
            <span className="text-[11px] text-slate-400">{T('Orders', '军令')}</span>
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
        </Tip>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {activeMpRoom && onOpenMultiplayer ? (
          <button
            type="button"
            onClick={onOpenMultiplayer}
            title={
              lang === 'zh'
                ? `联机房间 #${activeMpRoom.code} · 点击查看房间状态`
                : `Multiplayer Room #${activeMpRoom.code} · Click for room seats`
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-semibold cursor-pointer ${
              isMyTurnInMp
                ? 'border-amber-400/50 bg-amber-400/10 text-amber-100'
                : 'border-white/15 bg-white/5 text-slate-300'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-amber-300" />
            <span className="font-mono text-[11px] hidden sm:inline">#{activeMpRoom.code}</span>
            <span className="flex items-center gap-0.5">
              {(['wei', 'shu', 'wu'] as PlayableFactionId[]).map((f) => {
                const s = activeMpRoom.seats[f];
                return (
                  <span
                    key={f}
                    className={`w-1.5 h-1.5 rounded-full ${
                      s.seatType === 'ai'
                        ? 'bg-indigo-400'
                        : s.online
                          ? 'bg-emerald-400'
                          : 'bg-slate-600'
                    }`}
                  />
                );
              })}
            </span>
          </button>
        ) : (
          onOpenSaves && (
            <button
              type="button"
              onClick={onOpenSaves}
              title={
                lang === 'zh'
                  ? '打开墨卷存档录（Ctrl/Cmd + S）· 战局每步自动保存'
                  : 'Open Imperial Archives (Ctrl/Cmd + S) · Auto-checkpoints active'
              }
              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold text-slate-300 hover:text-slate-50 hover:bg-white/5 cursor-pointer"
            >
              {saveIndicator === 'saving' ? (
                <Loader2 className="w-3.5 h-3.5 text-amber-300 animate-spin" />
              ) : (
                <Archive className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span className="hidden lg:inline">{tLoc(UI_TEXT.archives, lang)}</span>
              {saveIndicator === 'saved' && (
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              )}
            </button>
          )
        )}

        {onOpenAuth && user && (
          <button
            type="button"
            onClick={onOpenAuth}
            title={
              user.isGuest
                ? lang === 'zh'
                  ? '当前为游客会话，点击绑定账号跨设备保存'
                  : 'Guest session — click to claim account & sync across devices'
                : `@${user.username}`
            }
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-chrono-200 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5 text-chrono-300" />
            <span className="hidden 2xl:inline max-w-[84px] truncate">
              {user.isGuest ? (lang === 'zh' ? '游客' : 'Guest') : `@${user.username}`}
            </span>
          </button>
        )}

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
          title={
            lang === 'zh'
              ? '返回主标题页（当前战局已自动封存）'
              : 'Return to Title Screen (progress is saved)'
          }
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-50 hover:bg-white/5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onEndTurn}
          disabled={
            isEndingTurn ||
            Boolean(state.winner) ||
            state.isPlayerDefeated ||
            (Boolean(activeMpRoom) && !isMyTurnInMp)
          }
          className="ml-1.5 flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs btn-gold cursor-pointer disabled:opacity-50"
        >
          {isEndingTurn ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{tLoc(UI_TEXT.aiThinking, lang)}</span>
            </>
          ) : activeMpRoom && !isMyTurnInMp ? (
            <>
              <Clock className="w-3.5 h-3.5" />
              <span>
                {lang === 'zh'
                  ? `等待${state.factions[activeMpRoom.activeFaction].shortName.zh}`
                  : `Waiting: ${state.factions[activeMpRoom.activeFaction].shortName.en}`}
              </span>
            </>
          ) : (
            <>
              <FastForward className="w-3.5 h-3.5" />
              <span>
                {activeMpRoom
                  ? tLoc(UI_TEXT.endKingdomTurn, lang)
                  : tLoc(UI_TEXT.endTurn, lang)}
              </span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
