import { useState } from 'react';
import {
  Coins,
  Eye,
  EyeOff,
  Flame,
  Gift,
  Heart,
  Lock,
  MapPin,
  MessageSquare,
  ShieldAlert,
  Skull,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { ACTION_COSTS } from '../game/data.js';
import {
  canSeeHeroWeakness,
  getFactionCities,
  getFactionPrisoners,
} from '../game/engine.js';
import { HERO_BONDS } from '../game/heroes.js';
import type { GameState, General, HeroEncounterMode, Language } from '../game/types.js';
import { tLoc } from '../i18n/translations.js';
import { HeroAvatar } from './HeroAvatar.js';
import { Seal } from './ui/Seal.js';
import { Art } from './ui/Art.js';

type HeroFilter = 'mine' | 'wandering' | 'prisoners' | 'rivals' | 'fallen';

/** The five attributes, each with its pigment: one colour always means one thing. */
const HERO_STATS: Array<{
  key: 'war' | 'intellect' | 'command' | 'politics' | 'charisma';
  zh: string;
  en: string;
  short: string;
  text: string;
  bar: string;
}> = [
  { key: 'war', zh: '武', en: 'War', short: 'W', text: 'text-rose-400', bar: 'bg-rose-400' },
  { key: 'intellect', zh: '智', en: 'Int', short: 'I', text: 'text-sky-400', bar: 'bg-sky-400' },
  { key: 'command', zh: '统', en: 'Cmd', short: 'C', text: 'text-amber-300', bar: 'bg-amber-300' },
  { key: 'politics', zh: '政', en: 'Pol', short: 'P', text: 'text-emerald-400', bar: 'bg-emerald-400' },
  { key: 'charisma', zh: '魅', en: 'Cha', short: 'Ch', text: 'text-fuchsia-300', bar: 'bg-fuchsia-300' },
];

interface HeroesPanelProps {
  state: GameState;
  lang: Language;
  focusedHeroId: string | null;
  onSelectFocusHero: (heroId: string | null) => void;
  onRelocateHero: (heroId: string, targetCityId: string) => void;
  onRewardHero: (heroId: string) => void;
  onOpenEncounter: (heroId: string, mode: HeroEncounterMode) => void;
  onPrisonerAction: (heroId: string, action: 'ransom' | 'release' | 'execute') => void;
}

export function HeroesPanel({
  state,
  lang,
  focusedHeroId,
  onSelectFocusHero,
  onRelocateHero,
  onRewardHero,
  onOpenEncounter,
  onPrisonerAction,
}: HeroesPanelProps) {
  const [filter, setFilter] = useState<HeroFilter>('mine');
  const [relocateTarget, setRelocateTarget] = useState<Record<string, string>>({});

  const player = state.playerFaction;
  const ownedCities = getFactionCities(state, player);
  const canSeeFlaws = canSeeHeroWeakness(state);

  const allHeroes = Object.values(state.generals);
  const myHeroes = allHeroes.filter(
    (g) => g.faction === player && (g.status === 'active' || g.status === 'wounded')
  );
  const wanderingHeroes = allHeroes.filter((g) => g.status === 'wandering');
  const prisoners = getFactionPrisoners(state, player);
  const rivalHeroes = allHeroes.filter(
    (g) =>
      g.faction !== player &&
      g.faction !== 'neutral' &&
      (g.status === 'active' || g.status === 'wounded')
  );
  const fallenHeroes = allHeroes.filter((g) => g.status === 'executed');

  const focusedHero = focusedHeroId ? state.generals[focusedHeroId] : null;
  const listByFilter: Record<HeroFilter, General[]> = {
    mine: myHeroes,
    wandering: wanderingHeroes,
    prisoners,
    rivals: rivalHeroes,
    fallen: fallenHeroes,
  };

  // If user clicked a hero on the map, auto-show that hero's details at top!
  const visibleList = listByFilter[filter];

  const filterTabs: Array<{ id: HeroFilter; label: string; count: number }> = [
    { id: 'mine', label: lang === 'zh' ? '麾下' : 'Mine', count: myHeroes.length },
    { id: 'wandering', label: lang === 'zh' ? '在野' : 'Wandering', count: wanderingHeroes.length },
    { id: 'prisoners', label: lang === 'zh' ? '天牢' : 'Prisoners', count: prisoners.length },
    { id: 'rivals', label: lang === 'zh' ? '敌将' : 'Rivals', count: rivalHeroes.length },
    { id: 'fallen', label: lang === 'zh' ? '英烈' : 'Fallen', count: fallenHeroes.length },
  ];

  const renderHeroCard = (hero: General, expanded: boolean) => {
    const city = state.cities[hero.cityId];
    const isMine = hero.faction === player && (hero.status === 'active' || hero.status === 'wounded');
    const isPrisoner = hero.status === 'captured' && hero.capturedBy === player;
    const isWandering = hero.status === 'wandering';
    const isRival = !isMine && !isWandering && !isPrisoner && hero.status !== 'executed';
    const hasVendetta = hero.vendettaAgainst.includes(player);

    const otherCities = ownedCities.filter((c) => c.id !== hero.cityId);
    const chosenDest = relocateTarget[hero.id] || otherCities[0]?.id || '';
    const bonds = hero.bondIds.map((id) => HERO_BONDS[id]).filter(Boolean);
    const heroFaction = hero.faction === 'neutral' ? undefined : state.factions[hero.faction];

    return (
      <div
        key={hero.id}
        className={`rounded-xl border transition p-3 space-y-2.5 ${
          expanded
            ? 'bg-[#1c1813] border-[#d4a853]/65 shadow-lg'
            : 'bg-[#12100d]/85 border-white/10 hover:border-white/25'
        }`}
      >
        {expanded ? (
          <>
            {/* The hero, painted large: face first, name in brush lettering */}
            <div
              onClick={() => onSelectFocusHero(null)}
              className="anim-rise relative -mx-3 -mt-3 h-72 overflow-hidden cursor-pointer group"
              title={lang === 'zh' ? '收起' : 'Collapse'}
            >
              <Art
                src={hero.portrait}
                alt={tLoc(hero.name, lang)}
                className={`absolute inset-0 w-full h-full object-cover object-top theme-art-grade transition-transform duration-700 ease-out group-hover:scale-[1.03] ${
                  hero.status === 'executed' ? 'grayscale opacity-70' : ''
                }`}
                style={{
                  maskImage: 'linear-gradient(to bottom, #000 60%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, #000 60%, transparent 100%)',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#1c1813]" />
              <Seal
                char={heroFaction?.bannerChar ?? (lang === 'zh' ? '野' : '野')}
                size={34}
                color={heroFaction?.color}
                className="absolute top-3 left-3"
              />
              <span className="absolute top-3 right-3 text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-black/70 text-amber-100 border border-amber-300/40">
                Lv.{hero.level}
              </span>
              <div className="absolute inset-x-3 bottom-1.5">
                <div className="flex items-end justify-between gap-2">
                  <div className="font-brush text-[28px] font-bold text-slate-50 leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                    {tLoc(hero.name, lang)}
                  </div>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-sm bg-black/60 text-amber-200 shrink-0 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {city ? tLoc(city.name, lang) : '-'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-amber-200/90">{tLoc(hero.title, lang)}</div>
              </div>
            </div>

            {/* Five attributes as bars: comparable at a glance */}
            <div className="grid grid-cols-5 gap-2 pt-1">
              {HERO_STATS.map((stat) => {
                const value = hero[stat.key];
                return (
                  <div key={stat.key}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] text-slate-400">
                        {lang === 'zh' ? stat.zh : stat.en}
                      </span>
                      <span className="text-sm font-bold text-slate-50">{value}</span>
                    </div>
                    <div className="mt-0.5 h-1 bg-white/10 overflow-hidden">
                      <div className={`h-full ${stat.bar}`} style={{ width: `${Math.min(100, value)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div
            onClick={() => onSelectFocusHero(hero.id)}
            className="flex items-center gap-3 cursor-pointer"
          >
            <HeroAvatar hero={hero} size="md" showLevel />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display font-bold text-[15px] text-[#f7efe0] truncate">
                  {tLoc(hero.name, lang)}
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-[#d4a853] shrink-0">
                  {city ? tLoc(city.name, lang) : '-'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate">{tLoc(hero.title, lang)}</div>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-mono">
                {HERO_STATS.map((stat) => (
                  <span key={stat.key} className={stat.text}>
                    {lang === 'zh' ? stat.zh : stat.short}
                    {hero[stat.key]}
                  </span>
                ))}
                {isMine && (
                  <span className="ml-auto flex items-center gap-0.5 text-rose-300">
                    <Heart className="w-2.5 h-2.5" />
                    {hero.loyalty}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Vendetta Alert */}
        {hasVendetta && (
          <div className="text-[10px] px-2 py-1 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200 flex items-center gap-1.5">
            <Skull className="w-3 h-3 shrink-0 text-rose-400" />
            <span>
              {lang === 'zh'
                ? '【血海深仇】对你战力 +20% 且誓死不降！'
                : 'SWORN VENDETTA: +20% combat vs you & refuses defection!'}
            </span>
          </div>
        )}

        {/* Expanded Chrono-Dossier & Actions */}
        {expanded && (
          <div className="pt-2.5 border-t border-white/10 space-y-3 text-xs">
            {/* XP & Loyalty */}
            {hero.status !== 'executed' && (
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-black/35 px-2.5 py-1.5 border border-white/5">
                  <div className="flex justify-between text-[#9ea3ae] mb-1">
                    <span>Lv.{hero.level} XP</span>
                    <span>{hero.xp}/100</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-[#d4a853]"
                      style={{ width: `${Math.min(100, hero.xp)}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-black/35 px-2.5 py-1.5 border border-white/5">
                  <div className="flex justify-between text-[#9ea3ae] mb-1">
                    <span>{lang === 'zh' ? '忠诚度' : 'Loyalty'}</span>
                    <span className={hero.loyalty < 60 ? 'text-rose-400' : 'text-emerald-400'}>
                      {hero.loyalty}/100
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400"
                      style={{ width: `${hero.loyalty}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Signature Skill */}
            <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 p-2.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#f7e7be] mb-1">
                <span className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  {tLoc(hero.signatureSkill.name, lang)}
                </span>
                <span className="text-[10px] text-amber-300">
                  {hero.skillCooldown > 0
                    ? lang === 'zh'
                      ? `冷却 ${hero.skillCooldown} 季`
                      : `CD: ${hero.skillCooldown}t`
                    : lang === 'zh'
                      ? '就绪'
                      : 'Ready'}
                </span>
              </div>
              <p className="text-[11px] text-[#cfc7b4] leading-snug">
                {tLoc(hero.signatureSkill.desc, lang)}
              </p>
            </div>

            {/* Sworn Bonds */}
            {bonds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {bonds.map((b) => (
                  <span
                    key={b.id}
                    title={tLoc(b.desc, lang)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 flex items-center gap-1"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    {tLoc(b.name, lang)}
                  </span>
                ))}
              </div>
            )}

            {/* Time-Traveler Historical Dossier (Strengths, Fatal Flaw, Destiny) */}
            <div className="rounded-xl bg-sky-950/30 border border-sky-400/25 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-sky-300">
                <span className="flex items-center gap-1">
                  {canSeeFlaws || !isRival ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {lang === 'zh' ? '穿越者历史档案' : 'Chrono-Dossier (Future Intel)'}
                </span>
                {isRival && !canSeeFlaws && (
                  <span className="text-rose-300 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" />
                    {lang === 'zh' ? '史轨已破' : 'Timeline Shattered'}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#dbeafe]">
                <span className="text-sky-300 font-semibold">
                  {lang === 'zh' ? '长处：' : 'Strength: '}
                </span>
                {tLoc(hero.dossier.historicalStrength, lang)}
              </div>
              <div className="text-[11px] text-amber-100">
                <span className="text-amber-300 font-semibold">
                  {lang === 'zh' ? '软肋：' : 'Fatal Flaw: '}
                </span>
                {isRival && !canSeeFlaws
                  ? lang === 'zh'
                    ? '？？？历史偏移 ≥60% 导致史书失准（研造【光学望远镜】可恢复刺探！）'
                    : '??? Timeline Shattered (≥60% Divergence). Research Optical Spyglasses to restore intel!'
                  : tLoc(hero.dossier.fatalFlaw, lang)}
              </div>
              <div className="text-[11px] text-[#9ea3ae] italic">
                {tLoc(hero.dossier.fatedDestiny, lang)}
              </div>
            </div>

            {/* Action Buttons by Category */}
            {isMine && (
              <div className="space-y-2 pt-1">
                {otherCities.length > 0 && hero.status === 'active' && (
                  <div className="flex gap-1.5">
                    <select
                      value={chosenDest}
                      onChange={(e) =>
                        setRelocateTarget((prev) => ({ ...prev, [hero.id]: e.target.value }))
                      }
                      className="flex-1 rounded-lg bg-[#12100d] border border-white/15 px-2 py-1.5 text-[11px] text-[#f5ecd7]"
                    >
                      {otherCities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {tLoc(c.name, lang)}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={state.actionPoints < 1 || !chosenDest}
                      onClick={() => onRelocateHero(hero.id, chosenDest)}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600/25 hover:bg-sky-600/40 border border-sky-400/40 disabled:opacity-40 text-[11px] font-semibold text-sky-200 flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{lang === 'zh' ? '调遣 (1 AP)' : 'Relocate (1 AP)'}</span>
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={
                      state.factions[player].gold < ACTION_COSTS.rewardHeroGold ||
                      hero.loyalty >= 100
                    }
                    onClick={() => onRewardHero(hero.id)}
                    className="py-1.5 px-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 disabled:opacity-40 text-[11px] font-semibold text-amber-200 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Gift className="w-3 h-3" />
                    <span>
                      {lang === 'zh'
                        ? `赏赐 (${ACTION_COSTS.rewardHeroGold}金)`
                        : `Reward (${ACTION_COSTS.rewardHeroGold}g)`}
                    </span>
                  </button>
                  <button
                    onClick={() => onOpenEncounter(hero.id, 'chat')}
                    className="py-1.5 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-[11px] font-semibold text-emerald-200 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>{lang === 'zh' ? '密谈 (0 AP)' : 'Private Chat'}</span>
                  </button>
                </div>
              </div>
            )}

            {isWandering && (
              <button
                disabled={state.actionPoints < 1}
                onClick={() => onOpenEncounter(hero.id, 'recruit')}
                className="w-full py-2 rounded-xl bg-gradient-to-r from-[#d4a853] to-[#b58732] hover:from-[#e4ba67] hover:to-[#c59640] disabled:opacity-40 text-[#14110d] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>
                  {lang === 'zh'
                    ? '三顾茅庐 · 招贤纳士 (1 AP)'
                    : 'Three Visits · AI Recruitment (1 AP)'}
                </span>
              </button>
            )}

            {isPrisoner && (
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => onOpenEncounter(hero.id, 'persuade')}
                  className="w-full py-2 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/45 text-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{lang === 'zh' ? 'AI 亲自劝降 (0 AP)' : 'AI Persuade to Defect'}</span>
                </button>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => onPrisonerAction(hero.id, 'ransom')}
                    className="py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-[11px] font-semibold text-amber-200 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Coins className="w-3 h-3" />
                    <span>{lang === 'zh' ? '赎金' : 'Ransom'}</span>
                  </button>
                  <button
                    onClick={() => onPrisonerAction(hero.id, 'release')}
                    className="py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-[11px] font-semibold text-sky-200 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Heart className="w-3 h-3" />
                    <span>{lang === 'zh' ? '义释' : 'Release'}</span>
                  </button>
                  <button
                    onClick={() => onPrisonerAction(hero.id, 'execute')}
                    className="py-1.5 rounded-lg bg-rose-700/30 hover:bg-rose-700/50 border border-rose-500/50 text-[11px] font-semibold text-rose-200 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    <span>{lang === 'zh' ? '斩首' : 'Execute'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-3.5 space-y-3 flex flex-col h-full">
      {/* Filter Pills */}
      <div className="flex flex-wrap gap-1">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              filter === tab.id
                ? 'btn-gold shadow'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700/80'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Focused Hero Spotlight if not in current filter */}
      {focusedHero && !visibleList.some((h) => h.id === focusedHero.id) && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-[#d4a853] px-1">
            {lang === 'zh' ? '选中名将档案' : 'Selected Hero Dossier'}
          </div>
          {renderHeroCard(focusedHero, true)}
        </div>
      )}

      {/* Hero List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {visibleList.length === 0 ? (
          <div className="text-center text-xs text-[#8b92a1] py-10">
            {lang === 'zh' ? '此分类暂无武将。' : 'No heroes in this category.'}
          </div>
        ) : (
          visibleList.map((hero) => renderHeroCard(hero, focusedHeroId === hero.id))
        )}
      </div>
    </div>
  );
}
