import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Anchor,
  Bomb,
  Bot,
  ChevronRight,
  Coins,
  Eye,
  Flame,
  GitMerge,
  Grid2x2,
  Moon,
  ShieldAlert,
  Sparkles,
  Swords,
  UserCheck,
  Users,
  Wheat,
  X,
} from 'lucide-react';
import { ACTION_COSTS, TACTICS } from '../game/data.js';
import {
  canSeeHeroWeakness,
  estimateBattlePreview,
  factionHasTech,
  getActiveBondsForHeroes,
  getCityGenerals,
  getEligibleStagingCities,
  getFactionGenerals,
  isTruceActive,
  isYangtzePort,
} from '../game/engine.js';
import type {
  GameState,
  Language,
  MilitaryActionType,
  OperationReport,
  TacticId,
} from '../game/types.js';
import { TERRAIN_TEXT, UI_TEXT, tLoc } from '../i18n/translations.js';
import { HeroAvatar } from './HeroAvatar.js';

export type BattleCommandMode = 'tactical' | 'ai_default';

export interface ExecuteMilitaryPayload {
  actionType: MilitaryActionType;
  fromCityId: string;
  toCityId: string;
  troops: number;
  tactic: TacticId;
  generalId?: string;
  deputyId?: string;
  useSignatureSkill: boolean;
  startDuel: boolean;
  defenderHeroId?: string;
  pincerFromCityId?: string;
  pincerTroops?: number;
  battleMode?: BattleCommandMode;
}

export interface OrderRoutePreview {
  fromCityId: string;
  toCityId: string;
  pincerFromCityId?: string;
}

interface MilitaryModalProps {
  state: GameState;
  lang: Language;
  targetCityId: string;
  initialFromCityId?: string;
  initialAction?: MilitaryActionType;
  onCancel: () => void;
  onExecute: (payload: ExecuteMilitaryPayload) => void;
  /** Called with the march being planned (and with null on close), so the map can show it. */
  onPreviewRoute?: (route: OrderRoutePreview | null) => void;
}

export function MilitaryModal({
  state,
  lang,
  targetCityId,
  initialFromCityId,
  initialAction,
  onCancel,
  onExecute,
  onPreviewRoute,
}: MilitaryModalProps) {
  const player = state.playerFaction;
  const playerFaction = state.factions[player];
  const targetCity = state.cities[targetCityId];

  const adjacentStaging = getEligibleStagingCities(state, player, targetCityId, 'adjacent');
  const riverStaging = getEligibleStagingCities(state, player, targetCityId, 'river');
  const hasSpyglass = factionHasTech(state, player, 'spyglass');
  const hasGunpowder = factionHasTech(state, player, 'gunpowder');
  const hasPrinting = factionHasTech(state, player, 'printing');
  const hasStirrups = factionHasTech(state, player, 'stirrups');
  const canRiver = riverStaging.length > 0 && isYangtzePort(targetCityId);

  const defaultAction: MilitaryActionType =
    initialAction ||
    (adjacentStaging.length > 0
      ? 'assault'
      : canRiver
        ? 'river_strike'
        : 'discord');

  const [actionType, setActionType] = useState<MilitaryActionType>(defaultAction);
  const [battleMode, setBattleMode] = useState<BattleCommandMode>('tactical');
  const stagingList = actionType === 'river_strike' ? riverStaging : adjacentStaging;

  const [fromCityId, setFromCityId] = useState<string>(
    (initialFromCityId && stagingList.some((c) => c.id === initialFromCityId)
      ? initialFromCityId
      : stagingList[0]?.id) || ''
  );

  const activeFromCity =
    stagingList.find((c) => c.id === fromCityId) || stagingList[0];
  const resolvedFromId = activeFromCity?.id || '';

  // Optional 2nd-City Joint Pincer
  const pincerCandidates = adjacentStaging.filter((c) => c.id !== resolvedFromId);
  const [usePincer, setUsePincer] = useState<boolean>(false);
  const [pincerCityId, setPincerCityId] = useState<string>(pincerCandidates[0]?.id || '');
  const activePincerCity = pincerCandidates.find((c) => c.id === pincerCityId) || pincerCandidates[0];
  const maxPincerTroops = activePincerCity ? Math.max(0, activePincerCity.troops - 1000) : 0;
  const [pincerTroops, setPincerTroops] = useState<number>(
    Math.min(Math.max(1000, Math.round(maxPincerTroops * 0.5)), maxPincerTroops)
  );

  const maxTroops = activeFromCity ? Math.max(1000, activeFromCity.troops - 1000) : 1000;
  const [troops, setTroops] = useState<number>(Math.round(maxTroops * 0.72));
  const clampedTroops = Math.min(Math.max(1000, troops), maxTroops);
  const clampedPincerTroops =
    usePincer && actionType === 'assault' && activePincerCity && maxPincerTroops >= 1000
      ? Math.min(Math.max(1000, pincerTroops), maxPincerTroops)
      : 0;

  // The route under consideration is drawn on the map while the sheet is open
  const previewFromId = activeFromCity?.id;
  const previewPincerId =
    usePincer && actionType === 'assault' && clampedPincerTroops > 0 ? activePincerCity?.id : undefined;
  useEffect(() => {
    onPreviewRoute?.(
      previewFromId
        ? { fromCityId: previewFromId, toCityId: targetCityId, pincerFromCityId: previewPincerId }
        : null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFromId, previewPincerId, targetCityId]);
  useEffect(
    () => () => onPreviewRoute?.(null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [tactic, setTactic] = useState<TacticId>(
    targetCity.terrain === 'river'
      ? 'fire'
      : targetCity.terrain === 'mountain'
        ? 'ambush'
        : targetCity.defense >= 4
          ? 'siege'
          : 'assault'
  );

  const allActiveHeroes = getFactionGenerals(state, player).filter((g) => g.status === 'active');
  const stationedInOrigin = resolvedFromId ? getCityGenerals(state, resolvedFromId) : [];

  const sortedHeroes = [...(stationedInOrigin.length > 0 && (actionType === 'assault' || actionType === 'river_strike') ? stationedInOrigin : allActiveHeroes)].sort((a, b) => {
    if (actionType === 'raid') return b.war - a.war;
    if (actionType === 'bombard') return b.intellect - a.intellect;
    if (actionType === 'discord') return b.charisma + b.intellect - (a.charisma + a.intellect);
    return b.war + b.command - (a.war + a.command);
  });

  const [generalId, setGeneralId] = useState<string>(sortedHeroes[0]?.id || '');
  const [deputyId, setDeputyId] = useState<string>(sortedHeroes[1]?.id || '');
  const [useSkill, setUseSkill] = useState<boolean>(true);

  const leadHero =
    sortedHeroes.find((h) => h.id === generalId) || sortedHeroes[0];
  const deputyHero =
    deputyId && deputyId !== leadHero?.id
      ? sortedHeroes.find((h) => h.id === deputyId)
      : undefined;

  const defenders = getCityGenerals(state, targetCityId).sort(
    (a, b) => b.war + b.command - (a.war + a.command)
  );
  const defenderHero = defenders[0];

  const activeBonds = getActiveBondsForHeroes(
    [leadHero?.id, deputyHero?.id].filter(Boolean) as string[]
  );
  const canSeeFlaw = canSeeHeroWeakness(state);
  const canUseSkill = Boolean(leadHero && leadHero.skillCooldown === 0);
  const truceWarning =
    targetCity.owner !== 'neutral' && isTruceActive(state, player, targetCity.owner);

  const isCombatAssault = actionType === 'assault' || actionType === 'river_strike';

  // The forecast plays the assault out on the 8x8 grid a few dozen times (AI on both sides), so it
  // is memoised on the order's inputs and follows the troop sliders with a deferred value.
  const forecastTroops = useDeferredValue(clampedTroops);
  const forecastPincerTroops = useDeferredValue(clampedPincerTroops);
  const leadHeroId = leadHero?.id;
  const deputyHeroId = deputyHero?.id;
  const forecastPincerCityId = activePincerCity?.id;
  const forecastUsesSkill = canUseSkill && useSkill;
  const preview = useMemo(
    () =>
      isCombatAssault && resolvedFromId
        ? estimateBattlePreview(
            state,
            player,
            resolvedFromId,
            targetCityId,
            forecastTroops,
            tactic,
            leadHeroId,
            {
              deputyGeneralId: deputyHeroId,
              useSignatureSkill: forecastUsesSkill,
              pincerFromCityId: forecastPincerTroops > 0 ? forecastPincerCityId : undefined,
              pincerTroops: forecastPincerTroops,
              isRiverStrike: actionType === 'river_strike',
            }
          )
        : null,
    [
      actionType,
      deputyHeroId,
      forecastPincerTroops,
      forecastTroops,
      forecastUsesSkill,
      isCombatAssault,
      leadHeroId,
      forecastPincerCityId,
      player,
      resolvedFromId,
      state,
      tactic,
      targetCityId,
    ]
  );

  const opTabs: Array<{
    id: MilitaryActionType;
    label: string;
    icon: typeof Swords;
    enabled: boolean;
    badge?: string;
  }> = [
    {
      id: 'assault',
      label: lang === 'zh' ? '大军攻城' : 'Assault',
      icon: Swords,
      enabled: adjacentStaging.length > 0,
      badge: pincerCandidates.length > 0 ? (lang === 'zh' ? '可合围' : 'Pincer') : undefined,
    },
    {
      id: 'raid',
      label: lang === 'zh' ? '夜袭劫营' : 'Night Raid',
      icon: Moon,
      enabled: adjacentStaging.some((c) => c.troops >= 2500),
    },
    {
      id: 'bombard',
      label: lang === 'zh' ? '火攻轰城' : 'Bombard',
      icon: Bomb,
      enabled: adjacentStaging.length > 0,
      badge: hasGunpowder ? (lang === 'zh' ? '火药' : 'Powder') : undefined,
    },
    {
      id: 'discord',
      label: lang === 'zh' ? '离间策反' : 'Discord',
      icon: Users,
      enabled: adjacentStaging.length > 0 || hasSpyglass,
      badge: hasPrinting ? (lang === 'zh' ? '传单' : 'Print') : undefined,
    },
    {
      id: 'river_strike',
      label: lang === 'zh' ? '水师奔袭' : 'River Fleet',
      icon: Anchor,
      enabled: canRiver,
    },
  ];

  const canAffordCurrent =
    state.actionPoints >= 1 &&
    (actionType === 'assault'
      ? Boolean(activeFromCity && activeFromCity.troops > 2000)
      : actionType === 'raid'
        ? Boolean(activeFromCity && activeFromCity.troops >= 2500)
        : actionType === 'bombard'
          ? Boolean(activeFromCity && playerFaction.gold >= ACTION_COSTS.bombardGold)
          : actionType === 'discord'
            ? (adjacentStaging.length > 0 || hasSpyglass) &&
              playerFaction.gold >= ACTION_COSTS.discordGold
            : canRiver &&
              Boolean(activeFromCity) &&
              playerFaction.food >= ACTION_COSTS.riverStrikeFood);

  const canDuel = isCombatAssault && canAffordCurrent && Boolean(leadHero && defenderHero);

  function switchOperation(nextOp: MilitaryActionType) {
    setActionType(nextOp);
    const nextStaging = nextOp === 'river_strike' ? riverStaging : adjacentStaging;
    if (nextStaging[0] && !nextStaging.some((c) => c.id === fromCityId)) {
      setFromCityId(nextStaging[0].id);
      setTroops(Math.round(Math.max(1000, nextStaging[0].troops - 1000) * 0.72));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={lang === 'zh' ? '取消' : 'Cancel'}
        onClick={onCancel}
        className="flex-1 cursor-default bg-gradient-to-r from-transparent via-black/10 to-black/50"
      />
      <div className="anim-sheet-in ink-panel border-y-0 border-r-0 h-full w-[min(600px,100vw)] p-5 sm:p-6 space-y-4 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/50 flex items-center justify-center text-rose-300">
              <Swords className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                {lang === 'zh'
                  ? `军事行动 · 进击${targetCity.name.zh}`
                  : `Military Operations · Target: ${targetCity.name.en}`}
              </h2>
              <div className="text-[11px] text-slate-400">
                {tLoc(TERRAIN_TEXT[targetCity.terrain], lang)} ·{' '}
                {lang === 'zh' ? '城防' : 'Walls'} Lv.{targetCity.defense} ·{' '}
                {lang === 'zh' ? '守军' : 'Garrison'} {targetCity.troops.toLocaleString()}
              </div>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 5 Military Action Selector Tabs */}
        <div className="grid grid-cols-5 gap-1.5">
          {opTabs.map((tab) => {
            const Icon = tab.icon;
            const active = actionType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                disabled={!tab.enabled}
                onClick={() => switchOperation(tab.id)}
                className={`relative flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-[10.5px] font-semibold transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-gradient-to-b from-cyan-500/25 to-indigo-600/25 border-cyan-400 text-white shadow-[0_0_16px_rgba(208,167,79,0.2)]'
                    : 'bg-slate-900/70 border-slate-700/80 text-slate-300 hover:border-slate-500'
                }`}
              >
                <Icon className="w-4 h-4 text-cyan-300" />
                <span className="truncate max-w-full">{tab.label}</span>
                {tab.badge && (
                  <span className="text-[8.5px] px-1.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 leading-tight">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Truce Warning */}
        {truceWarning && (
          <div className="rounded-xl bg-amber-950/50 border border-amber-400/45 px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{tLoc(UI_TEXT.truceBlocked, lang)}</span>
          </div>
        )}

        {/* Staging City Picker (except global Spyglass Discord when non-adjacent) */}
        {stagingList.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-slate-950/75 border border-slate-800 p-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-300 mb-1">
                {actionType === 'river_strike'
                  ? lang === 'zh'
                    ? '水师出征港'
                    : 'Yangtze Departure Port'
                  : lang === 'zh'
                    ? '主力出征城池'
                    : 'Primary Staging City'}
              </label>
              <select
                value={resolvedFromId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setFromCityId(nextId);
                  const c = state.cities[nextId];
                  if (c) setTroops(Math.round(Math.max(1000, c.troops - 1000) * 0.72));
                }}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              >
                {stagingList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {tLoc(c.name, lang)} ({c.troops.toLocaleString()} {lang === 'zh' ? '兵' : 'troops'})
                  </option>
                ))}
              </select>
            </div>

            {/* Enemy Target Summary */}
            <div className="flex items-center justify-between gap-2 sm:pl-3 sm:border-l border-slate-800">
              <div>
                <div className="text-[10px] uppercase text-slate-400">
                  {lang === 'zh' ? '目标城池' : 'Target Fortress'}
                </div>
                <div className="text-sm font-bold text-white">{tLoc(targetCity.name, lang)}</div>
                <div className="text-[11px] text-rose-400 font-semibold">
                  {targetCity.troops.toLocaleString()} · Def Lv.{targetCity.defense}
                </div>
              </div>
              {defenderHero && <HeroAvatar hero={defenderHero} size="sm" showLevel />}
            </div>
          </div>
        )}

        {/* JOINT MULTI-CITY PINCER (when attacking from 2+ adjacent owned cities!) */}
        {actionType === 'assault' && pincerCandidates.length > 0 && activePincerCity && (
          <div className="rounded-xl bg-indigo-950/35 border border-indigo-400/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-bold text-indigo-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePincer}
                  onChange={(e) => {
                    setUsePincer(e.target.checked);
                    if (e.target.checked) {
                      const cap = Math.max(0, activePincerCity.troops - 1000);
                      setPincerTroops(Math.min(Math.max(1000, Math.round(cap * 0.5)), cap));
                    }
                  }}
                  className="accent-cyan-400"
                />
                <GitMerge className="w-4 h-4 text-cyan-400" />
                <span>
                  {lang === 'zh'
                    ? '发动【多路合围夹击】（+20% 夹击战力加成！）'
                    : 'Coordinate Joint Pincer Flank (+20% Encirclement Bonus!)'}
                </span>
              </label>
            </div>

            {usePincer && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <select
                  value={activePincerCity.id}
                  onChange={(e) => setPincerCityId(e.target.value)}
                  className="rounded-lg bg-slate-900 border border-indigo-400/40 px-2.5 py-1.5 text-xs text-white"
                >
                  {pincerCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {tLoc(c.name, lang)} ({c.troops.toLocaleString()})
                    </option>
                  ))}
                </select>
                <div>
                  <div className="flex justify-between text-[11px] text-indigo-200 mb-0.5">
                    <span>{lang === 'zh' ? '夹击偏师兵力' : 'Flank Troops'}</span>
                    <span className="font-bold">{clampedPincerTroops.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min={Math.min(1000, maxPincerTroops)}
                    max={maxPincerTroops}
                    step={250}
                    value={clampedPincerTroops}
                    onChange={(e) => setPincerTroops(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Operation-Specific Brief & Hero Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-cyan-300 mb-1">
              {isCombatAssault
                ? tLoc(UI_TEXT.leadGeneral, lang)
                : lang === 'zh'
                  ? '执行名将'
                  : 'Operation Leader'}
            </label>
            <select
              value={leadHero?.id || ''}
              onChange={(e) => setGeneralId(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs text-white"
            >
              {sortedHeroes.map((g) => (
                <option key={g.id} value={g.id}>
                  {tLoc(g.name, lang)} (W{g.war}/I{g.intellect}/Ch{g.charisma})
                </option>
              ))}
            </select>
          </div>

          {isCombatAssault ? (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                {lang === 'zh' ? '副将（激活羁绊）' : 'Deputy Hero (Bonds)'}
              </label>
              <select
                value={deputyId}
                onChange={(e) => setDeputyId(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs text-white"
              >
                <option value="">{lang === 'zh' ? '无副将' : 'No Deputy'}</option>
                {sortedHeroes
                  .filter((g) => g.id !== leadHero?.id)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {tLoc(g.name, lang)} (W{g.war}/I{g.intellect})
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-900/75 border border-slate-800 px-3 py-2 flex items-center gap-2.5">
              {leadHero && <HeroAvatar hero={leadHero} size="sm" showLevel />}
              <div className="text-[11px] text-slate-300 leading-snug">
                {actionType === 'raid' && (
                  <>
                    <div className="font-bold text-amber-300">
                      {lang === 'zh' ? '夜袭劫营效果' : 'Night Raid Impact'}
                    </div>
                    <div>
                      {lang === 'zh'
                        ? `削减 15%–28% 守军并劫粮饷${hasStirrups ? '（马镫+6%杀伤）' : ''}`
                        : `Cuts 15–28% garrison + plunders Gold/Food${hasStirrups ? ' (Stirrups boost!)' : ''}`}
                    </div>
                  </>
                )}
                {actionType === 'bombard' && (
                  <>
                    <div className="font-bold text-rose-300">
                      {lang === 'zh' ? '火攻轰城效果' : 'Bombardment Impact'}
                    </div>
                    <div>
                      {lang === 'zh'
                        ? `城防 -${hasGunpowder ? 2 : 1}，焚毁 1.2k–2.8k 守军（耗 ${ACTION_COSTS.bombardGold} 金）`
                        : `Walls -${hasGunpowder ? 2 : 1}, scorches 1.2k–2.8k troops (${ACTION_COSTS.bombardGold}g)`}
                    </div>
                  </>
                )}
                {actionType === 'discord' && (
                  <>
                    <div className="font-bold text-fuchsia-300">
                      {lang === 'zh' ? '离间策反效果' : 'Sow Discord Impact'}
                    </div>
                    <div>
                      {lang === 'zh'
                        ? `敌将忠诚 -15~25，低于 45 即刻倒戈！（耗 ${ACTION_COSTS.discordGold} 金）`
                        : `Enemy loyalty -15..25 (<45 defects to you!) + desertions (${ACTION_COSTS.discordGold}g)`}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Enemy Heroes Loyalty Preview during Sow Discord */}
        {actionType === 'discord' && (
          <div className="rounded-xl bg-fuchsia-950/25 border border-fuchsia-400/30 p-3 space-y-2">
            <div className="text-[11px] font-bold text-fuchsia-200">
              {lang === 'zh'
                ? '目标城池守将忠诚侦察（忠诚 < 45 触发临阵倒戈！）'
                : 'Enemy Heroes in City (Loyalty < 45 triggers instant defection!)'}
            </div>
            {defenders.length === 0 ? (
              <div className="text-xs text-slate-400">
                {lang === 'zh'
                  ? '本城无名将驻守，策反将直接瓦解守军士气引起大溃逃。'
                  : 'No named heroes stationed; operation will incite mass garrison desertion.'}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {defenders.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 rounded-lg bg-slate-950/80 border border-slate-700 px-2.5 py-1.5 text-xs"
                  >
                    <HeroAvatar hero={d} size="xs" />
                    <span className="font-semibold text-white">{tLoc(d.name, lang)}</span>
                    <span
                      className={`font-mono font-bold ${
                        d.loyalty < 65 ? 'text-amber-300' : 'text-slate-300'
                      }`}
                    >
                      ♥ {d.loyalty}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Full Assault / River Strike Sections */}
        {isCombatAssault && (
          <>
            {/* Lead Hero + Signature Skill + Sworn Bonds */}
            {leadHero && (
              <div className="rounded-xl bg-slate-900/75 border border-slate-700/80 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <HeroAvatar hero={leadHero} size="lg" showLevel />
                    {deputyHero && <HeroAvatar hero={deputyHero} size="md" showLevel />}
                    <div>
                      <div className="font-brush text-lg font-bold text-slate-50 leading-tight">
                        {tLoc(leadHero.name, lang)}
                        {deputyHero ? ` + ${tLoc(deputyHero.name, lang)}` : ''}
                      </div>
                      <div className="text-[11px] text-cyan-300">
                        {tLoc(leadHero.signatureSkill.name, lang)}
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canUseSkill}
                      checked={canUseSkill && useSkill}
                      onChange={(e) => setUseSkill(e.target.checked)}
                      className="accent-cyan-400"
                    />
                    <span className={canUseSkill ? 'text-amber-300 font-semibold' : 'text-slate-500'}>
                      {canUseSkill
                        ? lang === 'zh'
                          ? '发动绝技'
                          : 'Use Skill'
                        : lang === 'zh'
                          ? `冷却 (${leadHero.skillCooldown})`
                          : `CD (${leadHero.skillCooldown})`}
                    </span>
                  </label>
                </div>
                {activeBonds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeBonds.map((b) => (
                      <span
                        key={b.id}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 flex items-center gap-1 font-semibold"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        {tLoc(b.name, lang)} (+{Math.round(b.combatBonus * 100)}%)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chrono-Insight Enemy Flaw Banner */}
            {defenderHero && (
              <div className="rounded-xl bg-cyan-950/35 border border-cyan-400/30 px-3 py-2 text-[11px] flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-300 shrink-0" />
                <div className="text-cyan-100">
                  <span className="font-bold text-cyan-300">
                    {lang === 'zh' ? `敌方守将 ${defenderHero.name.zh}：` : `Defender ${defenderHero.name.en}: `}
                  </span>
                  {canSeeFlaw
                    ? lang === 'zh'
                      ? `弱点怕「${TACTICS[defenderHero.dossier.weakToTactic].name.zh}」`
                      : `Weak to ${TACTICS[defenderHero.dossier.weakToTactic].name.en}`
                    : lang === 'zh'
                      ? '历史偏移 ≥60% 导致弱点成谜'
                      : 'Timeline Shattered — flaw hidden'}
                </div>
              </div>
            )}

            {/* Tactic Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(Object.keys(TACTICS) as TacticId[]).map((tid) => {
                const info = TACTICS[tid];
                const active = tactic === tid;
                const isFlawMatch = Boolean(
                  defenderHero && canSeeFlaw && defenderHero.dossier.weakToTactic === tid
                );
                return (
                  <button
                    key={tid}
                    type="button"
                    onClick={() => setTactic(tid)}
                    className={`text-left p-2 rounded-xl border transition cursor-pointer ${
                      active
                        ? 'bg-cyan-500/18 border-cyan-400 text-white'
                        : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px] font-bold">
                      <span className="flex items-center gap-1 truncate">
                        <Flame className="w-3 h-3 text-amber-400 shrink-0" />
                        {tLoc(info.name, lang)}
                      </span>
                    </div>
                    {isFlawMatch && (
                      <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/25 text-cyan-200 font-semibold">
                        {lang === 'zh' ? '先知克制!' : 'Counter!'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Primary Army Troops Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-cyan-300">
                  {tLoc(UI_TEXT.deployTroops, lang)}
                  {clampedPincerTroops > 0 && (
                    <span className="text-indigo-300 ml-1.5">
                      (+{clampedPincerTroops.toLocaleString()} {lang === 'zh' ? '夹击' : 'Pincer'} ={' '}
                      {(clampedTroops + clampedPincerTroops).toLocaleString()})
                    </span>
                  )}
                </span>
                <span className="font-bold text-white">
                  {clampedTroops.toLocaleString()} / {maxTroops.toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min={Math.min(1000, maxTroops)}
                max={maxTroops}
                step={250}
                value={clampedTroops}
                onChange={(e) => setTroops(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* LIVE VICTORY ODDS FORECAST METER */}
            {preview && (
              <div className="rounded-xl bg-slate-950/85 border border-slate-700/80 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-300">
                    {lang === 'zh' ? '战前胜率推演' : 'Tactical Victory Forecast'}
                  </span>
                  <span
                    className={`font-extrabold text-sm ${
                      preview.estimatedWinChance >= 65
                        ? 'text-emerald-400'
                        : preview.estimatedWinChance >= 45
                          ? 'text-amber-300'
                          : 'text-rose-400'
                    }`}
                  >
                    {preview.estimatedWinChance}%{' '}
                    {preview.estimatedWinChance >= 65
                      ? lang === 'zh'
                        ? '胜券在握'
                        : 'Favorable'
                      : preview.estimatedWinChance >= 45
                        ? lang === 'zh'
                          ? '势均力敌'
                          : 'Contested'
                        : lang === 'zh'
                          ? '风险极高'
                          : 'Risky'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      preview.estimatedWinChance >= 65
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                        : preview.estimatedWinChance >= 45
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-300'
                          : 'bg-gradient-to-r from-rose-600 to-orange-400'
                    }`}
                    style={{ width: `${preview.estimatedWinChance}%` }}
                  />
                </div>
                {activeFromCity && (
                  <div className="border-y border-amber-400/15 divide-y divide-amber-400/10 text-[12px]">
                    {(
                      [
                        [
                          lang === 'zh'
                            ? `${activeFromCity.name.zh}留守`
                            : `${activeFromCity.name.en} garrison`,
                          activeFromCity.troops,
                          Math.max(0, activeFromCity.troops - clampedTroops),
                          'text-slate-50',
                        ],
                        [
                          lang === 'zh' ? '出征之师' : 'Your army',
                          clampedTroops + clampedPincerTroops,
                          Math.max(
                            0,
                            clampedTroops + clampedPincerTroops - (preview.expectedAttackerLosses ?? 0)
                          ),
                          'text-emerald-300',
                        ],
                        [
                          lang === 'zh' ? `${targetCity.name.zh}守军` : `${targetCity.name.en} defenders`,
                          targetCity.troops,
                          Math.max(0, targetCity.troops - (preview.expectedDefenderLosses ?? 0)),
                          'text-rose-300',
                        ],
                      ] as Array<[string, number, number, string]>
                    ).map(([label, before, after, tone]) => (
                      <div key={label} className="flex items-baseline justify-between gap-3 py-1">
                        <span className="text-slate-300">{label}</span>
                        <span className="flex items-baseline gap-2 tabular-nums">
                          <span className="text-slate-500">{before.toLocaleString()}</span>
                          <ChevronRight className="w-3 h-3 self-center text-amber-300/70" />
                          <span className={`text-sm font-bold ${tone}`}>{after.toLocaleString()}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {preview.samples ? (
                  <p className="text-[10px] text-slate-400 leading-snug">
                    {lang === 'zh'
                      ? `依据 ${preview.samples} 场 8×8 沙盘推演（双方皆由 AI 指挥）——与「AI 默认托管」同一套规则；亲临指挥可胜过此数。预计战损：我军约 ${(preview.expectedAttackerLosses ?? 0).toLocaleString()}，敌军约 ${(preview.expectedDefenderLosses ?? 0).toLocaleString()}。`
                      : `From ${preview.samples} simulated 8×8 battles with AI commanding both sides — the same rules as AI Default; commanding in person can beat it. Expected losses: ~${(preview.expectedAttackerLosses ?? 0).toLocaleString()} yours vs ~${(preview.expectedDefenderLosses ?? 0).toLocaleString()} theirs.`}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {preview.modifiers.slice(0, 7).map((m, idx) => (
                    <span
                      key={idx}
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        m.positive
                          ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200'
                          : 'bg-rose-500/15 border-rose-400/35 text-rose-200'
                      }`}
                    >
                      {tLoc(m.label, lang)} {m.value}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* BATTLE COMMAND MODE SELECTOR: Direct 8x8 Tactical Grid vs AI Default Animation */}
            {(actionType === 'assault' || actionType === 'river_strike') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBattleMode('tactical')}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    battleMode === 'tactical'
                      ? 'bg-cyan-500/18 border-cyan-400 shadow-[0_0_16px_rgba(208,167,79,0.22)]'
                      : 'bg-slate-950/70 border-slate-700/80 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-cyan-200 flex items-center gap-1.5">
                      <Grid2x2 className="w-4 h-4 text-cyan-300" />
                      <span>
                        {lang === 'zh' ? '亲临指挥（8×8 沙盘战）' : 'Direct Command (8×8 Grid)'}
                      </span>
                    </span>
                    {battleMode === 'tactical' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-100">
                        {lang === 'zh' ? '已选' : 'SELECTED'}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-300 mt-1">
                    {lang === 'zh'
                      ? '亲自调遣名将，利用江河、密林火攻与《孙子兵法》战法（智力决定成功率）决胜！'
                      : 'Command generals on an 8×8 terrain/water/forest battlefield with INT-driven Art of War tactics!'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setBattleMode('ai_default')}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    battleMode === 'ai_default'
                      ? 'bg-indigo-500/20 border-indigo-400 shadow-[0_0_16px_rgba(208,167,79,0.25)]'
                      : 'bg-slate-950/70 border-slate-700/80 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-indigo-200 flex items-center gap-1.5">
                      <Bot className="w-4 h-4 text-indigo-300" />
                      <span>
                        {lang === 'zh' ? 'AI 默认托管（自动战报动画）' : 'AI Default (Auto-Battle)'}
                      </span>
                    </span>
                    {battleMode === 'ai_default' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-100">
                        {lang === 'zh' ? '已选' : 'SELECTED'}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-300 mt-1">
                    {lang === 'zh'
                      ? '由 AI 自动指挥决战，观看 60fps 战争动画并直接结算胜负！'
                      : 'Let AI resolve the battle automatically and watch the 60fps War Scene animation!'}
                  </p>
                </button>
              </div>
            )}
          </>
        )}

        {/* Footer Execute Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span>1 AP</span>
            {actionType === 'bombard' && (
              <span className="flex items-center gap-0.5 text-amber-300">
                <Coins className="w-3 h-3" /> {ACTION_COSTS.bombardGold}
              </span>
            )}
            {actionType === 'discord' && (
              <span className="flex items-center gap-0.5 text-amber-300">
                <Coins className="w-3 h-3" /> {ACTION_COSTS.discordGold}
              </span>
            )}
            {actionType === 'river_strike' && (
              <span className="flex items-center gap-0.5 text-yellow-300">
                <Wheat className="w-3 h-3" /> {ACTION_COSTS.riverStrikeFood}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
            >
              {tLoc(UI_TEXT.cancel, lang)}
            </button>

            {canDuel && defenderHero && (
              <button
                onClick={() =>
                  onExecute({
                    actionType,
                    fromCityId: resolvedFromId,
                    toCityId: targetCityId,
                    troops: clampedTroops,
                    tactic,
                    generalId: leadHero?.id,
                    deputyId: deputyHero?.id,
                    useSignatureSkill: canUseSkill && useSkill,
                    startDuel: true,
                    defenderHeroId: defenderHero.id,
                    pincerFromCityId: clampedPincerTroops > 0 ? activePincerCity?.id : undefined,
                    pincerTroops: clampedPincerTroops,
                    battleMode,
                  })
                }
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {lang === 'zh' ? `阵前单挑 ${defenderHero.name.zh}` : `Duel ${defenderHero.name.en}`}
                </span>
              </button>
            )}

            <button
              disabled={!canAffordCurrent}
              onClick={() =>
                onExecute({
                  actionType,
                  fromCityId: resolvedFromId,
                  toCityId: targetCityId,
                  troops: clampedTroops,
                  tactic,
                  generalId: leadHero?.id,
                  deputyId: deputyHero?.id,
                  useSignatureSkill: canUseSkill && useSkill,
                  startDuel: false,
                  defenderHeroId: defenderHero?.id,
                  pincerFromCityId: clampedPincerTroops > 0 ? activePincerCity?.id : undefined,
                  pincerTroops: clampedPincerTroops,
                  battleMode,
                })
              }
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-lg cursor-pointer"
            >
              <Swords className="w-4 h-4" />
              <span>
                {actionType === 'raid'
                  ? lang === 'zh'
                    ? '发动夜袭'
                    : 'Launch Night Raid'
                  : actionType === 'bombard'
                    ? lang === 'zh'
                      ? '火攻轰城'
                      : 'Launch Bombardment'
                    : actionType === 'discord'
                      ? lang === 'zh'
                        ? '施放离间'
                        : 'Execute Espionage'
                      : actionType === 'river_strike'
                        ? lang === 'zh'
                          ? '水师奔袭'
                          : 'Launch River Fleet'
                        : tLoc(UI_TEXT.launchAttack, lang)}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface OperationReportModalProps {
  report: OperationReport;
  state: GameState;
  lang: Language;
  onClose: () => void;
}

export function OperationReportModal({
  report,
  state,
  lang,
  onClose,
}: OperationReportModalProps) {
  const target = state.cities[report.targetCityId];
  const defectedHero = report.defectedHeroId ? state.generals[report.defectedHeroId] : undefined;

  const titleByType: Record<OperationReport['type'], { en: string; zh: string }> = {
    raid: { en: 'Night Raid Report', zh: '夜袭劫营战报' },
    bombard: { en: 'Bombardment Report', zh: '火攻轰城战报' },
    discord: { en: 'Espionage & Discord Report', zh: '离间策反密报' },
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/78 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="text-center space-y-1">
          <div className="text-xs font-bold uppercase tracking-widest text-cyan-300">
            {target ? tLoc(target.name, lang) : ''}
          </div>
          <h3 className="font-display text-2xl font-bold text-white">
            {tLoc(titleByType[report.type], lang)}
          </h3>
        </div>

        <p className="text-sm text-slate-200 leading-relaxed bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
          {tLoc(report.narrative, lang)}
        </p>

        <div className="grid grid-cols-2 gap-2.5 text-center text-xs">
          <div className="rounded-xl bg-slate-900/75 border border-slate-800 p-2.5">
            <div className="text-slate-400">{lang === 'zh' ? '敌军损失' : 'Enemy Troops Lost'}</div>
            <div className="text-base font-bold text-rose-400">
              -{report.enemyTroopsLost.toLocaleString()}
            </div>
          </div>

          {report.type === 'raid' && (
            <div className="rounded-xl bg-slate-900/75 border border-slate-800 p-2.5">
              <div className="text-slate-400">{lang === 'zh' ? '劫获粮饷' : 'Plundered'}</div>
              <div className="text-sm font-bold text-amber-300">
                +{report.goldPlundered}g / +{report.foodPlundered}f
              </div>
            </div>
          )}

          {report.type === 'bombard' && (
            <div className="rounded-xl bg-slate-900/75 border border-slate-800 p-2.5">
              <div className="text-slate-400">{lang === 'zh' ? '城防损毁' : 'Walls Damaged'}</div>
              <div className="text-base font-bold text-orange-400">
                -{report.defenseReduced} Lv
              </div>
            </div>
          )}

          {report.type === 'discord' && (
            <div className="rounded-xl bg-slate-900/75 border border-slate-800 p-2.5">
              <div className="text-slate-400">{lang === 'zh' ? '敌将忠诚' : 'Hero Loyalty'}</div>
              <div className="text-base font-bold text-fuchsia-300">
                -{report.loyaltyReduced}
              </div>
            </div>
          )}
        </div>

        {defectedHero && (
          <div className="rounded-xl bg-emerald-950/45 border border-emerald-400/50 p-3 flex items-center gap-3">
            <HeroAvatar hero={defectedHero} size="md" showLevel />
            <div>
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                <UserCheck className="w-4 h-4" />
                <span>{lang === 'zh' ? '临阵倒戈！' : 'HERO DEFECTED!'}</span>
              </div>
              <div className="font-display font-bold text-white">
                {tLoc(defectedHero.name, lang)} ({tLoc(defectedHero.title, lang)})
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl btn-seal font-bold text-sm cursor-pointer"
        >
          {tLoc(UI_TEXT.close, lang)}
        </button>
      </div>
    </div>
  );
}
