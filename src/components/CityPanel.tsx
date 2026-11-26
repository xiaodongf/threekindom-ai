import {
  Anchor,
  ArrowRightLeft,
  Bomb,
  Building2,
  Coins,
  Dumbbell,
  HandHeart,
  Landmark,
  MapPin,
  Moon,
  Shield,
  Sparkles,
  Sprout,
  Swords,
  UserPlus,
  Users,
  Wheat,
} from 'lucide-react';
import { ASPECT_MAX_LEVEL, UNREST_SUPPORT } from '../game/cityAspects.js';
import { ACTION_COSTS, PROVINCES } from '../game/data.js';
import { WORKS_PER_LEVEL, governorPlanOf } from '../game/governors.js';
import {
  factionHasTech,
  getActiveBondsForHeroes,
  getCityGenerals,
  getCityWanderingHeroes,
  getEligibleStagingCities,
  isTruceActive,
  isYangtzePort,
} from '../game/engine.js';
import type { DomesticOrder, GameState, Language, MilitaryActionType } from '../game/types.js';
import { TERRAIN_TEXT, UI_TEXT, tLoc } from '../i18n/translations.js';
import { EVENT_TEXT, eventLasts } from './cityEventText.js';
import { TASK_DOING } from './governorText.js';
import { HeroAvatar } from './HeroAvatar.js';

interface CityPanelProps {
  state: GameState;
  lang: Language;
  selectedCityId: string | null;
  /** Farming, trade, drill and relief: the orders that work on one of a city's aspects. */
  onDomesticOrder: (cityId: string, order: DomesticOrder) => void;
  onFortify: (cityId: string) => void;
  onRecruit: (cityId: string) => void;
  onOpenMilitary: (
    targetCityId: string,
    fromCityId?: string,
    action?: MilitaryActionType
  ) => void;
  onReinforce: (fromCityId: string, toCityId: string) => void;
  onSelectCity: (cityId: string) => void;
  /** Goes down into the city's close-up view. */
  onEnterCity?: (cityId: string) => void;
  onInspectHero: (heroId: string) => void;
  onRecruitWanderingHero: (heroId: string) => void;
}

export function CityPanel({
  state,
  lang,
  selectedCityId,
  onDomesticOrder,
  onFortify,
  onRecruit,
  onOpenMilitary,
  onReinforce,
  onSelectCity,
  onEnterCity,
  onInspectHero,
  onRecruitWanderingHero,
}: CityPanelProps) {
  if (!selectedCityId || !state.cities[selectedCityId]) {
    return (
      <div className="p-6 text-center text-sm text-[#9ea3ae] flex flex-col items-center justify-center h-full gap-3">
        <MapPin className="w-8 h-8 text-[#d4a853]/60" />
        <p>{tLoc(UI_TEXT.selectCityPrompt, lang)}</p>
      </div>
    );
  }

  const city = state.cities[selectedCityId];
  const isOwned = city.owner === state.playerFaction;
  const playerFaction = state.factions[state.playerFaction];
  const generals = getCityGenerals(state, city.id);
  const wanderingHere = getCityWanderingHeroes(state, city.id);
  const cityBonds = getActiveBondsForHeroes(generals.map((g) => g.id));

  const adjacentStaging = !isOwned
    ? getEligibleStagingCities(state, state.playerFaction, city.id, 'adjacent')
    : [];
  const riverStaging = !isOwned
    ? getEligibleStagingCities(state, state.playerFaction, city.id, 'river')
    : [];
  const canSpyglassDiscord = !isOwned && factionHasTech(state, state.playerFaction, 'spyglass');
  const canAttackThisEnemy =
    !isOwned &&
    state.actionPoints > 0 &&
    (adjacentStaging.length > 0 || riverStaging.length > 0 || canSpyglassDiscord);

  const recruitGold =
    state.playerFaction === 'wei'
      ? Math.round(ACTION_COSTS.recruitGold * 0.85)
      : ACTION_COSTS.recruitGold;

  const canOrder = isOwned && state.actionPoints > 0;
  const canFarm =
    canOrder && city.farming < ASPECT_MAX_LEVEL && playerFaction.gold >= ACTION_COSTS.farmGold;
  const canTrade =
    canOrder && city.trade < ASPECT_MAX_LEVEL && playerFaction.gold >= ACTION_COSTS.tradeGold;
  const canDrill = canOrder && city.drill < 100 && playerFaction.gold >= ACTION_COSTS.drillGold;
  const canRelief = canOrder && city.support < 100 && playerFaction.food >= ACTION_COSTS.reliefFood;
  const canFortify =
    isOwned &&
    state.actionPoints > 0 &&
    city.defense < 5 &&
    playerFaction.gold >= ACTION_COSTS.fortifyGold;
  const canRecruit =
    isOwned &&
    state.actionPoints > 0 &&
    playerFaction.gold >= recruitGold &&
    playerFaction.food >= ACTION_COSTS.recruitFood;

  const ownerLabel =
    city.owner === 'neutral'
      ? tLoc(UI_TEXT.neutralOwner, lang)
      : tLoc(state.factions[city.owner].name, lang);

  const ownerColor =
    city.owner === 'neutral' ? '#a8a29e' : state.factions[city.owner].color;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* City Header */}
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl font-bold text-[#f7efe0]">
              {tLoc(city.name, lang)}
            </h3>
            <span className="text-xs text-[#9ea3ae]">
              ({tLoc(city.region, lang)} · {tLoc(PROVINCES[city.province].name, lang)})
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ownerColor }} />
            <span className="text-xs font-medium text-[#d4cfc0]">{ownerLabel}</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-[#a8b0bf]">
              {tLoc(TERRAIN_TEXT[city.terrain], lang)}
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[#9ea3ae]">
            {tLoc(UI_TEXT.garrison, lang)}
          </div>
          <div className="text-lg font-extrabold text-[#f7e7be]">
            {city.troops.toLocaleString()}
          </div>
        </div>
      </div>

      {onEnterCity && (
        <button
          type="button"
          onClick={() => onEnterCity(city.id)}
          className="w-full btn-gold rounded-md px-3 py-2 text-[13px] flex items-center justify-center gap-2 cursor-pointer"
        >
          <Landmark className="w-4 h-4" />
          {lang === 'zh'
            ? isOwned
              ? '入城理事'
              : '入城察看'
            : isOwned
              ? 'Enter the city'
              : 'Look inside the city'}
        </button>
      )}

      {/* The city's five aspects */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            [lang === 'zh' ? '农业' : 'Farming', city.farming, 'bg-lime-400', 'text-lime-300'],
            [lang === 'zh' ? '商业' : 'Trade', city.trade, 'bg-[#d4a853]', 'text-[#d4a853]'],
            [tLoc(UI_TEXT.defense, lang), city.defense, 'bg-sky-400', 'text-sky-400'],
          ] as Array<[string, number, string, string]>
        ).map(([label, level, bar, text]) => (
          <div key={label} className="rounded-xl bg-[#12100d]/80 border border-white/5 p-2.5">
            <div className="flex items-center justify-between text-xs text-[#9ea3ae] mb-1.5">
              <span>{label}</span>
              <span className={`${text} font-semibold`}>{level}/5</span>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((lv) => (
                <div
                  key={lv}
                  className={`h-1.5 flex-1 rounded-full ${lv <= level ? bar : 'bg-white/10'}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            [lang === 'zh' ? '训练' : 'Drill', city.drill, 'bg-rose-400', 'text-rose-300'],
            [
              lang === 'zh' ? '民心' : 'Support',
              city.support,
              city.support < UNREST_SUPPORT ? 'bg-red-500' : 'bg-emerald-400',
              city.support < UNREST_SUPPORT ? 'text-red-400' : 'text-emerald-300',
            ],
          ] as Array<[string, number, string, string]>
        ).map(([label, score, bar, text]) => (
          <div key={label} className="rounded-xl bg-[#12100d]/80 border border-white/5 p-2.5">
            <div className="flex items-center justify-between text-xs text-[#9ea3ae] mb-1.5">
              <span>{label}</span>
              <span className={`${text} font-semibold`}>{score}/100</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${score}%` }} />
            </div>
          </div>
        ))}
      </div>
      {city.owner !== 'neutral' &&
        (() => {
          const plan = governorPlanOf(state, city.id);
          return (
            <div className="rounded-lg bg-[#12100d]/80 border border-white/5 px-2.5 py-1.5 text-[11px] text-[#c9c2b2]">
              <span className="text-[#9ea3ae]">{lang === 'zh' ? '太守 ' : 'Governor: '}</span>
              {plan ? (
                <>
                  <span className="font-semibold text-[#f5ecd7]">{tLoc(plan.general.name, lang)}</span>
                  {plan.acting && (lang === 'zh' ? '（暂摄）' : ' (acting)')}
                  {lang === 'zh' ? ' · ' : ', '}
                  {lang === 'zh' ? TASK_DOING[plan.task].zh : TASK_DOING[plan.task].en}
                  {plan.task !== 'drill' && plan.task !== 'relief' && !plan.idle && ` ${plan.works}/${WORKS_PER_LEVEL}`}
                  {plan.idle && (
                    <span className="text-red-300">{lang === 'zh' ? '（无事可做）' : ' (nothing left to do)'}</span>
                  )}
                </>
              ) : (
                <span className="text-red-300">
                  {lang === 'zh' ? '城中无将，诸事停滞' : 'no general here, so nothing goes forward'}
                </span>
              )}
            </div>
          );
        })()}
      {city.event && (
        <div
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
            EVENT_TEXT[city.event.kind].good
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
              : 'border-red-500/40 bg-red-500/10 text-red-200'
          }`}
        >
          <span className="font-bold">
            {lang === 'zh' ? EVENT_TEXT[city.event.kind].name.zh : EVENT_TEXT[city.event.kind].name.en}
          </span>
          {lang === 'zh' ? '（' : ' ('}
          {eventLasts(city.event.seasonsLeft, lang)}
          {lang === 'zh' ? '）' : '). '}
          {lang === 'zh' ? EVENT_TEXT[city.event.kind].effect.zh : EVENT_TEXT[city.event.kind].effect.en}
        </div>
      )}
      {isOwned && city.support < UNREST_SUPPORT && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">
          {lang === 'zh'
            ? '民怨沸腾：收入减少，每季有守军逃散。开仓赈济可回升民心。'
            : 'Unrest: income is cut and part of the garrison deserts each season. Relief restores support.'}
        </div>
      )}

      {/* Wandering Legends Visiting This City! */}
      {wanderingHere.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-[#d4a853]/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#f7e7be]">
            <Sparkles className="w-3.5 h-3.5 text-[#d4a853]" />
            <span>
              {lang === 'zh' ? '在野绝世名将现身此城！' : 'Wandering Legend Spotted Here!'}
            </span>
          </div>
          {wanderingHere.map((wh) => (
            <div key={wh.id} className="flex items-center justify-between gap-2">
              <button
                onClick={() => onInspectHero(wh.id)}
                className="flex items-center gap-2.5 text-left hover:opacity-90 cursor-pointer"
              >
                <HeroAvatar hero={wh} size="sm" />
                <div>
                  <div className="text-xs font-bold text-[#f7efe0]">{tLoc(wh.name, lang)}</div>
                  <div className="text-[10px] text-amber-200/80">
                    {lang === 'zh' ? '武' : 'W'}{wh.war} · {lang === 'zh' ? '智' : 'I'}{wh.intellect} ·{' '}
                    {lang === 'zh' ? '统' : 'C'}{wh.command}
                  </div>
                </div>
              </button>
              <button
                disabled={state.actionPoints < 1}
                onClick={() => onRecruitWanderingHero(wh.id)}
                className="px-2.5 py-1.5 rounded-lg bg-[#d4a853] hover:bg-[#e5bc69] disabled:opacity-40 text-[#14110d] font-bold text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
              >
                <UserPlus className="w-3 h-3" />
                <span>{lang === 'zh' ? '招贤 (1 AP)' : 'Recruit'}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stationed Generals with Painted Portraits */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#d4a853]">
            {tLoc(UI_TEXT.stationedGenerals, lang)}
          </span>
          {cityBonds.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-300">
              {cityBonds.map((b) => tLoc(b.name, lang)).join(' · ')}
            </span>
          )}
        </div>
        {generals.length === 0 ? (
          <div className="text-xs text-[#8b92a1] italic px-1">
            {tLoc(UI_TEXT.noGenerals, lang)}
          </div>
        ) : (
          <div className="space-y-2">
            {generals.map((g) => (
              <button
                key={g.id}
                onClick={() => onInspectHero(g.id)}
                className="w-full flex items-center justify-between rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-[#d4a853]/50 px-2.5 py-2 transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <HeroAvatar hero={g} size="sm" showLevel />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#f7efe0] truncate">
                      {tLoc(g.name, lang)}
                    </div>
                    <div className="text-[10px] text-[#9ea3ae] truncate">{tLoc(g.title, lang)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
                  <span className="text-rose-400">{lang === 'zh' ? '武' : 'W'}{g.war}</span>
                  <span className="text-sky-400">{lang === 'zh' ? '智' : 'I'}{g.intellect}</span>
                  <span className="text-amber-300">{lang === 'zh' ? '统' : 'C'}{g.command}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DIRECT MILITARY OPERATIONS WHEN INSPECTING AN ENEMY / NEUTRAL CITY */}
      {!isOwned && (
        <div className="rounded-xl bg-rose-950/25 border border-rose-500/40 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
              <Swords className="w-3.5 h-3.5" />
              {lang === 'zh' ? '军事打击行动（1 行动力）' : 'Military Operations (1 AP)'}
            </span>
            {adjacentStaging.length >= 2 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/25 border border-indigo-400/45 text-indigo-200 font-semibold">
                {lang === 'zh' ? '可多路合围 +20%' : 'Pincer Ready +20%'}
              </span>
            )}
          </div>

          {!canAttackThisEnemy ? (
            <div className="text-[11px] text-slate-400">
              {state.actionPoints < 1
                ? lang === 'zh'
                  ? '本季行动力已用尽，请点击右上角「结束本季」。'
                  : 'No Action Points remaining this season.'
                : lang === 'zh'
                  ? '需先占领邻接城池（或以水师/蒸汽战船自沿江两站之内的港口奔袭、或研造望远镜远程离间）。'
                  : 'Capture an adjacent city first (or send a river fleet from a port within two stops along the river, which needs Steam Warships unless you are Wu; Spyglasses allow remote espionage).'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {adjacentStaging.length > 0 && (
                <>
                  <button
                    onClick={() => onOpenMilitary(city.id, adjacentStaging[0].id, 'assault')}
                    className="col-span-2 py-2 px-3 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    <span>
                      {adjacentStaging.length >= 2
                        ? lang === 'zh'
                          ? `大军攻城 / 多路合围 ${city.name.zh}`
                          : `Full Assault / Joint Pincer`
                        : lang === 'zh'
                          ? `大军攻伐 ${city.name.zh}`
                          : `Full Assault on ${city.name.en}`}
                    </span>
                  </button>

                  <button
                    onClick={() => onOpenMilitary(city.id, adjacentStaging[0].id, 'raid')}
                    className="py-1.5 px-2 rounded-lg bg-amber-500/18 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Moon className="w-3 h-3" />
                    <span>{lang === 'zh' ? '夜袭劫营' : 'Night Raid'}</span>
                  </button>

                  <button
                    onClick={() => onOpenMilitary(city.id, adjacentStaging[0].id, 'bombard')}
                    className="py-1.5 px-2 rounded-lg bg-rose-500/18 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Bomb className="w-3 h-3" />
                    <span>{lang === 'zh' ? '火攻轰城' : 'Bombard'}</span>
                  </button>
                </>
              )}

              {(adjacentStaging.length > 0 || canSpyglassDiscord) && (
                <button
                  onClick={() =>
                    onOpenMilitary(city.id, adjacentStaging[0]?.id, 'discord')
                  }
                  className="py-1.5 px-2 rounded-lg bg-fuchsia-500/18 hover:bg-fuchsia-500/30 border border-fuchsia-400/40 text-fuchsia-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Users className="w-3 h-3" />
                  <span>{lang === 'zh' ? '离间策反' : 'Sow Discord'}</span>
                </button>
              )}

              {riverStaging.length > 0 && isYangtzePort(city.id) && (
                <button
                  onClick={() =>
                    onOpenMilitary(city.id, riverStaging[0].id, 'river_strike')
                  }
                  className="py-1.5 px-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/45 text-cyan-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Anchor className="w-3 h-3" />
                  <span>{lang === 'zh' ? '水师奔袭' : 'River Fleet'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Domestic Actions */}
      {isOwned && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#d4a853] mb-2">
            {lang === 'zh' ? '城池内政（消耗 1 行动力）' : 'Domestic Orders (1 AP)'}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onRecruit(city.id)}
              disabled={!canRecruit}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 disabled:opacity-40 text-xs transition cursor-pointer"
            >
              <Users className="w-4 h-4 text-emerald-300" />
              <span className="font-semibold text-[#f5ecd7]">{tLoc(UI_TEXT.recruit, lang)}</span>
              <span className="text-[10px] text-[#b8b2a2] flex items-center gap-0.5">
                <Coins className="w-2.5 h-2.5 text-yellow-400" />
                {recruitGold}
                <Wheat className="w-2.5 h-2.5 text-amber-400 ml-0.5" />
                {ACTION_COSTS.recruitFood}
              </span>
            </button>

            <button
              onClick={() => onFortify(city.id)}
              disabled={!canFortify}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 disabled:opacity-40 text-xs transition cursor-pointer"
            >
              <Shield className="w-4 h-4 text-sky-300" />
              <span className="font-semibold text-[#f5ecd7]">{tLoc(UI_TEXT.fortify, lang)}</span>
              <span className="text-[10px] text-[#b8b2a2] flex items-center gap-0.5">
                <Coins className="w-2.5 h-2.5 text-yellow-400" />
                {ACTION_COSTS.fortifyGold}
              </span>
            </button>
            {(
              [
                ['farm', canFarm, Sprout, 'text-lime-300', lang === 'zh' ? '垦田' : 'Farm', 'gold', ACTION_COSTS.farmGold],
                ['trade', canTrade, Building2, 'text-amber-300', lang === 'zh' ? '兴商' : 'Trade', 'gold', ACTION_COSTS.tradeGold],
                ['drill', canDrill, Dumbbell, 'text-rose-300', lang === 'zh' ? '练兵' : 'Drill', 'gold', ACTION_COSTS.drillGold],
                ['relief', canRelief, HandHeart, 'text-emerald-300', lang === 'zh' ? '赈济' : 'Relief', 'food', ACTION_COSTS.reliefFood],
              ] as Array<[DomesticOrder, boolean, typeof Sprout, string, string, 'gold' | 'food', number]>
            ).map(([order, enabled, Icon, tint, label, pays, cost]) => (
              <button
                key={order}
                onClick={() => onDomesticOrder(city.id, order)}
                disabled={!enabled}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 disabled:opacity-40 text-xs transition cursor-pointer"
              >
                <Icon className={`w-4 h-4 ${tint}`} />
                <span className="font-semibold text-[#f5ecd7]">{label}</span>
                <span className="text-[10px] text-[#b8b2a2] flex items-center gap-0.5">
                  {pays === 'gold' ? (
                    <Coins className="w-2.5 h-2.5 text-yellow-400" />
                  ) : (
                    <Wheat className="w-2.5 h-2.5 text-amber-400" />
                  )}
                  {cost}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Adjacent Cities / March Orders */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-[#d4a853] mb-2">
          {tLoc(UI_TEXT.marchOrders, lang)}
        </div>
        <div className="space-y-2">
          {city.neighbors.map((nid) => {
            const target = state.cities[nid];
            if (!target) return null;
            const targetIsOwn = target.owner === state.playerFaction;
            const truce =
              isOwned &&
              !targetIsOwn &&
              target.owner !== 'neutral' &&
              isTruceActive(state, state.playerFaction, target.owner);

            return (
              <div
                key={nid}
                className="flex items-center justify-between gap-2 rounded-xl bg-[#12100d]/80 border border-white/8 px-3 py-2"
              >
                <button
                  onClick={() => onSelectCity(nid)}
                  className="text-left hover:underline cursor-pointer"
                >
                  <div className="text-xs font-semibold text-[#f5ecd7] flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor:
                          target.owner === 'neutral'
                            ? '#a8a29e'
                            : state.factions[target.owner].color,
                      }}
                    />
                    <span>{tLoc(target.name, lang)}</span>
                  </div>
                  <div className="text-[11px] text-[#9ea3ae]">
                    {tLoc(UI_TEXT.garrison, lang)}: {target.troops.toLocaleString()} ·{' '}
                    {tLoc(TERRAIN_TEXT[target.terrain], lang)}
                  </div>
                  {truce && (
                    <div className="text-[10px] text-amber-400 mt-0.5">
                      {tLoc(UI_TEXT.truceBlocked, lang)}
                    </div>
                  )}
                </button>

                {isOwned && (
                  <div className="shrink-0">
                    {targetIsOwn ? (
                      <button
                        onClick={() => onReinforce(city.id, target.id)}
                        disabled={state.actionPoints < 1 || city.troops <= 2500}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600/25 hover:bg-sky-600/40 border border-sky-400/40 disabled:opacity-40 text-xs font-semibold text-sky-200 transition cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>{tLoc(UI_TEXT.reinforce, lang)}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onOpenMilitary(target.id, city.id, 'assault')}
                        disabled={state.actionPoints < 1 || city.troops <= 2000}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 border border-rose-400/55 disabled:opacity-40 text-xs font-semibold text-rose-100 transition cursor-pointer"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        <span>{tLoc(UI_TEXT.attack, lang)}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
