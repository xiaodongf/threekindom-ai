import { useState } from 'react';
import {
  Anchor,
  ArrowRightLeft,
  Award,
  Bomb,
  Building2,
  Coins,
  Dumbbell,
  EyeOff,
  Hammer,
  HandHeart,
  Landmark,
  MapPin,
  Moon,
  Shield,
  ShieldAlert,
  Sparkles,
  Sprout,
  Swords,
  UserPlus,
  Users,
  Wheat,
} from 'lucide-react';
import {
  ASPECT_MAX_LEVEL,
  DRILL_ORDER_GAIN,
  RELIEF_ORDER_GAIN,
  SUPPORT_COST_LEVY,
  UNREST_SUPPORT,
  drillOfficerBonus,
  mixDrill,
  reliefOfficerBonus,
} from '../game/cityAspects.js';
import { ACTION_COSTS, PROVINCES, RIVER_LINKS } from '../game/data.js';
import {
  GOVERNOR_FOCI,
  WORKS_PER_LEVEL,
  aspectWorksProgress,
  getAppointedGovernor,
  governorPlanOf,
} from '../game/governors.js';
import {
  CITY_SPECIALTIES,
  CITY_SPECIALTY_IDS,
  SPECIALTY_PROSPERITY_MIN,
  WALL_SCAR_GATE_FACTOR,
  canCharterSpecialty,
  canScoutCityDetails,
  cityEconomyOrderGoldCost,
  cityRawLevyDrill,
  cityRecruitFoodCost,
  factionHasTech,
  formatScoutedTroops,
  getActiveBondsForHeroes,
  getCityCrisisOptions,
  getCityGenerals,
  getCityLandmark,
  getCityWanderingHeroes,
  getEligibleStagingCities,
  getFactionIncomeBreakdown,
  getSummonableGeneralsForCity,
  isTruceActive,
  isYangtzePort,
  levySizeOf,
} from '../game/engine.js';
import { GATE_HP_PER_DEFENSE } from '../game/tacticalEngine.js';
import type {
  City,
  CityCrisisResolutionKind,
  CitySpecialtyId,
  DomesticOrder,
  GameState,
  GovernorFocus,
  Language,
  MilitaryActionType,
} from '../game/types.js';
import { TERRAIN_TEXT, UI_TEXT, tLoc } from '../i18n/translations.js';
import { EVENT_TEXT, eventLasts } from './cityEventText.js';
import { FOCUS_TEXT, TASK_DOING } from './governorText.js';
import { HeroAvatar } from './HeroAvatar.js';

interface CityPanelProps {
  state: GameState;
  lang: Language;
  selectedCityId: string | null;
  canIssueOrders?: boolean;
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
  onAppointGovernor?: (cityId: string, generalId: string | null) => void;
  onSetFocus?: (cityId: string, focus: GovernorFocus) => void;
  onSummonOfficer?: (heroId: string, targetCityId: string) => void;
  onMendBreach?: (cityId: string) => void;
  onResolveCrisis?: (cityId: string, choice: CityCrisisResolutionKind) => void;
  onCharterSpecialty?: (cityId: string, specialty: CitySpecialtyId) => void;
}

export function CityPanel({
  state,
  lang,
  selectedCityId,
  canIssueOrders = true,
  onDomesticOrder,
  onFortify,
  onRecruit,
  onOpenMilitary,
  onReinforce,
  onSelectCity,
  onEnterCity,
  onInspectHero,
  onRecruitWanderingHero,
  onAppointGovernor,
  onSetFocus,
  onSummonOfficer,
  onMendBreach,
  onResolveCrisis,
  onCharterSpecialty,
}: CityPanelProps) {
  const [showSpecialtyPicker, setShowSpecialtyPicker] = useState(false);
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
  const scouted = canScoutCityDetails(state, state.playerFaction, city.id);
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
    canIssueOrders &&
    state.actionPoints > 0 &&
    (adjacentStaging.length > 0 || riverStaging.length > 0 || canSpyglassDiscord);

  const recruitGold =
    state.playerFaction === 'wei'
      ? Math.round(ACTION_COSTS.recruitGold * 0.85)
      : ACTION_COSTS.recruitGold;
  const recruitFood = cityRecruitFoodCost(city);
  const farmGold = cityEconomyOrderGoldCost(city, 'farming');
  const tradeGold = cityEconomyOrderGoldCost(city, 'trade');
  const landmark = getCityLandmark(city.id);
  const activeSpec = city.specialty ? CITY_SPECIALTIES[city.specialty] : undefined;

  const canOrder = isOwned && canIssueOrders && state.actionPoints > 0;
  const canFarm =
    canOrder && city.farming < ASPECT_MAX_LEVEL && playerFaction.gold >= farmGold;
  const canTrade =
    canOrder && city.trade < ASPECT_MAX_LEVEL && playerFaction.gold >= tradeGold;
  const canDrill = canOrder && city.drill < 100 && playerFaction.gold >= ACTION_COSTS.drillGold;
  const canRelief = canOrder && city.support < 100 && playerFaction.food >= ACTION_COSTS.reliefFood;
  const canFortify =
    canOrder && city.defense < 5 && playerFaction.gold >= ACTION_COSTS.fortifyGold;
  const canMendBreach =
    canOrder &&
    Boolean(city.wallScar && city.wallScar > 0) &&
    playerFaction.gold >= ACTION_COSTS.mendBreachGold;
  const canRecruit =
    canOrder &&
    playerFaction.gold >= recruitGold &&
    playerFaction.food >= recruitFood;

  // Outcome previews for the 6 domestic buttons
  const incomeNow =
    isOwned
      ? getFactionIncomeBreakdown(state, state.playerFaction).find((r) => r.cityId === city.id) ?? null
      : null;
  const incomeWith = (patch: Partial<City>) =>
    isOwned
      ? getFactionIncomeBreakdown(
          { ...state, cities: { ...state.cities, [city.id]: { ...city, ...patch } } },
          state.playerFaction
        ).find((r) => r.cityId === city.id) ?? null
      : null;

  const nextFarmIncome = city.farming < ASPECT_MAX_LEVEL ? incomeWith({ farming: city.farming + 1 }) : null;
  const nextTradeIncome = city.trade < ASPECT_MAX_LEVEL ? incomeWith({ trade: city.trade + 1 }) : null;
  const farmDelta = nextFarmIncome && incomeNow ? nextFarmIncome.food - incomeNow.food : 0;
  const tradeDelta = nextTradeIncome && incomeNow ? nextTradeIncome.gold - incomeNow.gold : 0;

  const bestCharisma = generals.reduce((max, g) => Math.max(max, g.charisma), 60);
  const levy = levySizeOf(city, bestCharisma);
  const drillAfterLevy = mixDrill(city.troops, city.drill, levy, cityRawLevyDrill(city));
  const drillmaster = [...generals].sort((a, b) => b.command - a.command)[0];
  const drillTo = Math.min(100, city.drill + DRILL_ORDER_GAIN + drillOfficerBonus(drillmaster?.command ?? 0));
  const steward = [...generals].sort((a, b) => b.charisma - a.charisma)[0];
  const reliefTo = Math.min(100, city.support + RELIEF_ORDER_GAIN + reliefOfficerBonus(steward?.charisma ?? 0));

  const crisisOptions = isOwned ? getCityCrisisOptions(state, city.id) : [];
  const summonable = isOwned && onSummonOfficer
    ? getSummonableGeneralsForCity(state, state.playerFaction, city.id)
    : [];
  const inboundReinforceSource = isOwned
    ? Object.values(state.cities)
        .filter(
          (c) =>
            c.id !== city.id &&
            c.owner === state.playerFaction &&
            c.troops > 2000 &&
            (c.neighbors.includes(city.id) ||
              RIVER_LINKS.some(
                ([a, b]) => (a === c.id && b === city.id) || (b === c.id && a === city.id)
              ))
        )
        .sort((a, b) => b.troops - a.troops)[0]
    : undefined;

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
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ownerColor }} />
            <span className="text-xs font-medium text-[#d4cfc0]">{ownerLabel}</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-[#a8b0bf]">
              {tLoc(TERRAIN_TEXT[city.terrain], lang)}
            </span>
            {!scouted && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 border border-white/10 text-slate-300">
                <EyeOff className="w-2.5 h-2.5 text-amber-300" />
                {lang === 'zh' ? '远方雾报' : 'Distant Scout'}
              </span>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[#9ea3ae]">
            {tLoc(UI_TEXT.garrison, lang)}
          </div>
          <div className="text-lg font-extrabold text-[#f7e7be] tabular-nums">
            {scouted ? city.troops.toLocaleString() : formatScoutedTroops(city.troops, lang)}
          </div>
        </div>
      </div>

      {onEnterCity && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEnterCity(city.id)}
            className="flex-1 btn-gold rounded-md px-3 py-2 text-[13px] flex items-center justify-center gap-2 cursor-pointer"
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
          {isOwned && inboundReinforceSource && (
            <button
              type="button"
              disabled={!canOrder}
              onClick={() => onReinforce(inboundReinforceSource.id, city.id)}
              title={
                lang === 'zh'
                  ? `自邻城（如${inboundReinforceSource.name.zh}）调遣援军与武将入驻此城`
                  : `March reinforcements & officers into ${city.name.en} from friendly neighbors`
              }
              className="shrink-0 rounded-md border border-sky-400/45 bg-sky-500/18 hover:bg-sky-500/30 disabled:opacity-40 px-2.5 py-2 text-[12px] font-semibold text-sky-100 flex items-center gap-1 cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? '调援入城' : 'Call Troops'}</span>
            </button>
          )}
        </div>
      )}

      {/* The city's five aspects + partial governor works */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            [lang === 'zh' ? '农业' : 'Farming', city.farming, 'bg-lime-400', 'text-lime-300', 'farming'],
            [lang === 'zh' ? '商业' : 'Trade', city.trade, 'bg-[#d4a853]', 'text-[#d4a853]', 'trade'],
            [tLoc(UI_TEXT.defense, lang), city.defense, 'bg-sky-400', 'text-sky-400', 'walls'],
          ] as Array<[string, number, string, string, 'farming' | 'trade' | 'walls']>
        ).map(([label, level, bar, text, task]) => {
          const prog = scouted ? aspectWorksProgress(state, city, task) : null;
          const showProg = Boolean(prog && level < ASPECT_MAX_LEVEL && (prog.works > 0 || prog.isActiveTask));
          return (
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
              {showProg && prog && (
                <div className="mt-1.5 space-y-0.5">
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${Math.min(100, (prog.works / WORKS_PER_LEVEL) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[9.5px] text-amber-200/85 tabular-nums flex items-center justify-between">
                    <span>{prog.works}/{WORKS_PER_LEVEL}</span>
                    {prog.isActiveTask && prog.seasonsLeft !== null && (
                      <span>{lang === 'zh' ? `余${prog.seasonsLeft}季` : `${prog.seasonsLeft}s`}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {scouted ? (
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
      ) : (
        <div className="rounded-xl bg-[#12100d]/80 border border-white/8 px-3 py-2 text-[11px] text-[#a8b0bf] flex items-center gap-2">
          <EyeOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>
            {lang === 'zh'
              ? '此城远离我方疆界：需占领邻城，或研造【千里镜 / 热气球】方可侦知精确训练度与民心。'
              : 'Beyond scout range: capture an adjacent city or unlock Spyglass / Recon Balloon to see exact Drill & Support.'}
          </span>
        </div>
      )}

      {/* Inline Governance Controls (Owned) or Governor Recon (Rival) */}
      {city.owner !== 'neutral' &&
        (() => {
          const plan = governorPlanOf(state, city.id);
          const appointed = getAppointedGovernor(state, city.id);
          if (isOwned && onAppointGovernor && onSetFocus) {
            const selectCls =
              'rounded-md border border-white/15 bg-black/50 px-2 py-1 text-[11px] text-[#f5ecd7] disabled:opacity-50 cursor-pointer';
            return (
              <div className="rounded-xl bg-[#12100d]/90 border border-[#d4a853]/25 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#d4a853] uppercase tracking-wider">
                    {lang === 'zh' ? '太守与施政方针（0 行动力）' : 'Governor & Standing Focus (0 AP)'}
                  </span>
                  {incomeNow && (
                    <span className="text-[10px] text-[#c9c2b2] tabular-nums">
                      +{incomeNow.gold}{lang === 'zh' ? '金' : 'G'} · +{incomeNow.food}{lang === 'zh' ? '粮/季' : 'F/s'}
                    </span>
                  )}
                </div>

                {generals.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      aria-label={lang === 'zh' ? '任命太守' : 'Appoint Governor'}
                      disabled={!canIssueOrders}
                      value={appointed?.id ?? ''}
                      onChange={(e) => onAppointGovernor(city.id, e.target.value || null)}
                      className={selectCls}
                    >
                      <option value="">
                        {plan
                          ? lang === 'zh'
                            ? `${tLoc(plan.general.name, lang)}（暂摄）`
                            : `${tLoc(plan.general.name, lang)} (acting)`
                          : lang === 'zh'
                            ? '自动暂摄'
                            : 'Acting'}
                      </option>
                      {generals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {lang === 'zh'
                            ? `${tLoc(g.name, lang)} · 政${g.politics} 统${g.command}`
                            : `${tLoc(g.name, lang)} · POL ${g.politics}`}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label={lang === 'zh' ? '施政重心' : 'Governor Focus'}
                      disabled={!canIssueOrders}
                      value={city.focus ?? 'auto'}
                      onChange={(e) => onSetFocus(city.id, e.target.value as GovernorFocus)}
                      className={selectCls}
                    >
                      {GOVERNOR_FOCI.map((f) => (
                        <option key={f} value={f}>
                          {lang === 'zh' ? FOCUS_TEXT[f].zh : FOCUS_TEXT[f].en}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="text-[11px] text-rose-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {lang === 'zh'
                        ? '城中无将主持政务，太守工程停滞！'
                        : 'No officer stationed here — seasonal works stand still!'}
                    </span>
                  </div>
                )}

                {plan && (
                  <div className="text-[11px] text-[#c9c2b2] flex items-center justify-between gap-2">
                    <span>
                      {lang === 'zh' ? TASK_DOING[plan.task].zh : TASK_DOING[plan.task].en}
                      {plan.idle && (
                        <span className="text-rose-300 ml-1">
                          {lang === 'zh' ? '（已满，请改派）' : '(capped — pick another focus)'}
                        </span>
                      )}
                    </span>
                    {!plan.idle && (
                      <span className="text-amber-300/90 tabular-nums shrink-0">
                        +{plan.rate}/{lang === 'zh' ? '季' : 's'}
                      </span>
                    )}
                  </div>
                )}

                {onSummonOfficer && summonable.length > 0 && (
                  <select
                    aria-label={lang === 'zh' ? '调将入城' : 'Summon Officer'}
                    disabled={!canOrder}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) onSummonOfficer(e.target.value, city.id);
                    }}
                    className={`w-full ${selectCls} ${
                      generals.length === 0
                        ? 'border-amber-400/55 bg-amber-500/12 text-amber-100 font-semibold'
                        : 'border-white/10 text-[#c9c2b2]'
                    }`}
                  >
                    <option value="">
                      {lang === 'zh'
                        ? generals.length === 0
                          ? '＋ 调遣他城武将入驻主政（消耗 1 行动力）'
                          : '＋ 自他城调将增驻（消耗 1 行动力）'
                        : generals.length === 0
                          ? '+ Summon Officer to Govern (1 AP)'
                          : '+ Summon Officer Here (1 AP)'}
                    </option>
                    {summonable.map((cand) => (
                      <option key={cand.general.id} value={cand.general.id}>
                        {lang === 'zh'
                          ? `${tLoc(cand.general.name, lang)} · 政${cand.general.politics} 统${cand.general.command} 魅${cand.general.charisma}（自${cand.fromCity.name.zh}${cand.leavesOriginEmpty ? '·调后空城' : ''}）`
                          : `${tLoc(cand.general.name, lang)} · POL ${cand.general.politics} CMD ${cand.general.command} (from ${cand.fromCity.name.en}${cand.leavesOriginEmpty ? ' · leaves empty' : ''})`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          }

          if (!scouted) return null;

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

      {/* Historical Landmark & Commandery Specialization (Pillar B) */}
      {(landmark || (scouted && activeSpec) || (isOwned && onCharterSpecialty)) && (
        <div className="rounded-xl bg-[#12100d]/90 border border-[#d4a853]/25 p-2.5 space-y-2">
          {landmark && (
            <div className="rounded-lg bg-cyan-500/10 border border-cyan-400/30 px-2.5 py-1.5 text-[11px]">
              <div className="font-bold text-cyan-200 flex items-center justify-between gap-2">
                <span>◆ {tLoc(landmark.name, lang)}</span>
                <span className="text-[9.5px] uppercase tracking-wider text-cyan-300/80">
                  {lang === 'zh' ? '千古名胜' : 'Landmark'}
                </span>
              </div>
              <div className="text-[#d4cfc0] mt-0.5">{tLoc(landmark.summary, lang)}</div>
            </div>
          )}

          {scouted && activeSpec && (
            <div className="rounded-lg bg-amber-500/12 border border-amber-400/35 px-2.5 py-1.5 text-[11px]">
              <div className="font-bold text-amber-200 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-300" />
                  {tLoc(activeSpec.name, lang)}
                </span>
                <span className="px-1.5 py-px rounded bg-amber-500/25 text-[10px] text-amber-100">
                  {tLoc(activeSpec.seal, lang)}
                </span>
              </div>
              <div className="text-[#d6cec0] mt-0.5">{tLoc(activeSpec.summary, lang)}</div>
            </div>
          )}

          {isOwned && onCharterSpecialty && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setShowSpecialtyPicker((v) => !v)}
                className="w-full py-1.5 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-[11px] font-semibold text-[#f5ecd7] flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-[#d4a853]" />
                  {activeSpec
                    ? lang === 'zh'
                      ? '改设郡国专署'
                      : 'Re-Charter Specialization'
                    : lang === 'zh'
                      ? '开设郡国专署（5选1）'
                      : 'Charter Specialization (1 of 5)'}
                </span>
                <span className="text-[10.5px] text-amber-300 flex items-center gap-1 tabular-nums">
                  <Coins className="w-3 h-3 text-yellow-400" />
                  {ACTION_COSTS.specializeGold} · 1 AP
                </span>
              </button>

              {showSpecialtyPicker && (
                <div className="space-y-1.5 pt-1">
                  {CITY_SPECIALTY_IDS.map((spId) => {
                    const def = CITY_SPECIALTIES[spId];
                    const isCurrent = city.specialty === spId;
                    const eligible = canCharterSpecialty(city, spId);
                    const canBuy =
                      canOrder &&
                      !isCurrent &&
                      eligible &&
                      playerFaction.gold >= ACTION_COSTS.specializeGold;
                    return (
                      <button
                        key={spId}
                        type="button"
                        disabled={!canBuy}
                        onClick={() => {
                          onCharterSpecialty(city.id, spId);
                          setShowSpecialtyPicker(false);
                        }}
                        className={`w-full text-left rounded-lg border px-2.5 py-1.5 text-[11px] transition cursor-pointer disabled:cursor-not-allowed ${
                          isCurrent
                            ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
                            : eligible
                              ? 'border-white/15 bg-black/40 hover:bg-white/10 text-[#f5ecd7] disabled:opacity-45'
                              : 'border-white/8 bg-black/25 text-slate-500 opacity-55'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 font-bold">
                          <span>
                            [{tLoc(def.seal, lang)}] {tLoc(def.name, lang)}
                          </span>
                          <span className="text-[10px]">
                            {isCurrent
                              ? lang === 'zh'
                                ? '已设'
                                : 'Active'
                              : !eligible
                                ? lang === 'zh'
                                  ? `需农+商≥${SPECIALTY_PROSPERITY_MIN}`
                                  : `Need Farm+Trade ≥ ${SPECIALTY_PROSPERITY_MIN}`
                                : `${ACTION_COSTS.specializeGold}G`}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#c9c2b2] mt-0.5">
                          {tLoc(def.summary, lang)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Wall Breach Alert + Mend Breach Action */}
      {Boolean(city.wallScar && city.wallScar > 0) && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold flex items-center gap-1.5 text-amber-200">
              <Hammer className="w-3.5 h-3.5" />
              {lang === 'zh'
                ? `城垣缺口（余 ${city.wallScar} 季 · 守城门耐久 -${Math.round((1 - WALL_SCAR_GATE_FACTOR) * 100)}%）`
                : `Breached Ramparts (${city.wallScar}s left · Siege Gate HP -${Math.round((1 - WALL_SCAR_GATE_FACTOR) * 100)}%)`}
            </span>
          </div>
          {isOwned && onMendBreach && (
            <button
              type="button"
              disabled={!canMendBreach}
              onClick={() => onMendBreach(city.id)}
              className="w-full py-1.5 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 disabled:opacity-40 text-amber-100 font-semibold text-xs flex items-center justify-between cursor-pointer"
            >
              <span>{lang === 'zh' ? '抢修城垣缺口（民心 +3）' : 'Mend Breach (+3 Support)'}</span>
              <span className="flex items-center gap-1 tabular-nums">
                <Coins className="w-3 h-3 text-yellow-400" />
                {ACTION_COSTS.mendBreachGold} · 1 AP
              </span>
            </button>
          )}
        </div>
      )}

      {/* City Event + Active Magistrate Crisis Edicts */}
      {city.event && (
        <div
          className={`rounded-xl border px-3 py-2 text-[11px] space-y-2 ${
            EVENT_TEXT[city.event.kind].good
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
              : 'border-red-500/40 bg-red-500/10 text-red-200'
          }`}
        >
          <div>
            <span className="font-bold">
              {lang === 'zh' ? EVENT_TEXT[city.event.kind].name.zh : EVENT_TEXT[city.event.kind].name.en}
            </span>
            {lang === 'zh' ? '（' : ' ('}
            {eventLasts(city.event.seasonsLeft, lang)}
            {lang === 'zh' ? '）' : '). '}
            {lang === 'zh' ? EVENT_TEXT[city.event.kind].effect.zh : EVENT_TEXT[city.event.kind].effect.en}
          </div>

          {isOwned && onResolveCrisis && crisisOptions.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-white/10">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-200">
                {lang === 'zh' ? '郡府应急政令（0 行动力）' : 'Magistrate Crisis Edict (0 AP)'}
              </div>
              {crisisOptions.map((opt) => {
                const affordable =
                  canIssueOrders &&
                  playerFaction.gold >= opt.goldCost &&
                  playerFaction.food >= opt.foodCost;
                return (
                  <button
                    key={opt.choice}
                    type="button"
                    disabled={!affordable}
                    onClick={() => onResolveCrisis(city.id, opt.choice)}
                    className="w-full text-left rounded-lg bg-black/40 hover:bg-black/60 border border-amber-400/40 disabled:opacity-45 px-2.5 py-1.5 transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 font-bold text-xs text-[#f7efe0]">
                      <span>{tLoc(opt.title, lang)}</span>
                      <span className="text-[11px] text-amber-200 flex items-center gap-1 tabular-nums shrink-0">
                        {opt.goldCost > 0 && (
                          <>
                            <Coins className="w-3 h-3 text-yellow-400" />
                            {opt.goldCost}
                          </>
                        )}
                        {opt.foodCost > 0 && (
                          <>
                            <Wheat className="w-3 h-3 text-amber-400 ml-0.5" />
                            {opt.foodCost}
                          </>
                        )}
                        {opt.goldCost === 0 && opt.foodCost === 0 && (
                          <span className="text-rose-300">{lang === 'zh' ? '免耗钱粮' : '0 Cost'}</span>
                        )}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-[#d6cec0] mt-0.5">{tLoc(opt.desc, lang)}</div>
                    {opt.discountReason && (
                      <div className="text-[10px] text-emerald-300 mt-0.5">
                        ✦ {tLoc(opt.discountReason, lang)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
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
                disabled={!canIssueOrders || state.actionPoints < 1}
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
              {!canIssueOrders
                ? lang === 'zh'
                  ? '当前等待其他玩家行动。'
                  : 'Waiting for another player to finish their turn.'
                : state.actionPoints < 1
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

      {/* Domestic Actions with Rich Outcome Previews */}
      {isOwned && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#d4a853] mb-2">
            {lang === 'zh' ? '城池内政（消耗 1 行动力）' : 'Domestic Orders (1 AP)'}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onRecruit(city.id)}
              disabled={!canRecruit}
              title={
                lang === 'zh'
                  ? `募得 ${levy.toLocaleString()} 人 · 训练 ${city.drill}→${drillAfterLevy} · 民心 -${SUPPORT_COST_LEVY}`
                  : `+${levy.toLocaleString()} men · Drill ${city.drill}→${drillAfterLevy} · Support -${SUPPORT_COST_LEVY}`
              }
              className="flex flex-col items-center gap-0.5 p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 disabled:opacity-40 text-xs transition cursor-pointer"
            >
              <Users className="w-4 h-4 text-emerald-300" />
              <span className="font-semibold text-[#f5ecd7]">{tLoc(UI_TEXT.recruit, lang)}</span>
              <span className="text-[9.5px] text-emerald-300/90 tabular-nums">
                +{levy.toLocaleString()} · {lang === 'zh' ? `训${drillAfterLevy}` : `D${drillAfterLevy}`}
              </span>
              <span className="text-[10px] text-[#b8b2a2] flex items-center gap-0.5 tabular-nums">
                <Coins className="w-2.5 h-2.5 text-yellow-400" />
                {recruitGold}
                <Wheat className="w-2.5 h-2.5 text-amber-400 ml-0.5" />
                {recruitFood}
              </span>
            </button>

            <button
              onClick={() => onFortify(city.id)}
              disabled={!canFortify}
              className="flex flex-col items-center gap-0.5 p-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 disabled:opacity-40 text-xs transition cursor-pointer"
            >
              <Shield className="w-4 h-4 text-sky-300" />
              <span className="font-semibold text-[#f5ecd7]">{tLoc(UI_TEXT.fortify, lang)}</span>
              <span className="text-[9.5px] text-sky-300/90 tabular-nums">
                {city.defense >= 5
                  ? lang === 'zh'
                    ? '已满级'
                    : 'Max Lv.5'
                  : lang === 'zh'
                    ? `城门 +${GATE_HP_PER_DEFENSE}`
                    : `Gate +${GATE_HP_PER_DEFENSE}`}
              </span>
              <span className="text-[10px] text-[#b8b2a2] flex items-center gap-0.5 tabular-nums">
                <Coins className="w-2.5 h-2.5 text-yellow-400" />
                {ACTION_COSTS.fortifyGold}
              </span>
            </button>

            {(
              [
                [
                  'farm',
                  canFarm,
                  Sprout,
                  'text-lime-300',
                  lang === 'zh' ? '垦田' : 'Farm',
                  city.farming >= ASPECT_MAX_LEVEL
                    ? lang === 'zh'
                      ? '已满级'
                      : 'Max Lv.5'
                    : `+${farmDelta} ${lang === 'zh' ? '粮/季' : 'F/s'}`,
                  'gold',
                  farmGold,
                ],
                [
                  'trade',
                  canTrade,
                  Building2,
                  'text-amber-300',
                  lang === 'zh' ? '兴商' : 'Trade',
                  city.trade >= ASPECT_MAX_LEVEL
                    ? lang === 'zh'
                      ? '已满级'
                      : 'Max Lv.5'
                    : `+${tradeDelta} ${lang === 'zh' ? '金/季' : 'G/s'}`,
                  'gold',
                  tradeGold,
                ],
                [
                  'drill',
                  canDrill,
                  Dumbbell,
                  'text-rose-300',
                  lang === 'zh' ? '练兵' : 'Drill',
                  city.drill >= 100 ? '100/100' : `${city.drill}→${drillTo}`,
                  'gold',
                  ACTION_COSTS.drillGold,
                ],
                [
                  'relief',
                  canRelief,
                  HandHeart,
                  'text-emerald-300',
                  lang === 'zh' ? '赈济' : 'Relief',
                  city.support >= 100 ? '100/100' : `${city.support}→${reliefTo}`,
                  'food',
                  ACTION_COSTS.reliefFood,
                ],
              ] as Array<[DomesticOrder, boolean, typeof Sprout, string, string, string, 'gold' | 'food', number]>
            ).map(([order, enabled, Icon, tint, label, preview, pays, cost]) => (
              <button
                key={order}
                onClick={() => onDomesticOrder(city.id, order)}
                disabled={!enabled}
                className="flex flex-col items-center gap-0.5 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 disabled:opacity-40 text-xs transition cursor-pointer"
              >
                <Icon className={`w-4 h-4 ${tint}`} />
                <span className="font-semibold text-[#f5ecd7]">{label}</span>
                <span className={`text-[9.5px] ${tint} opacity-90 tabular-nums`}>{preview}</span>
                <span className="text-[10px] text-[#b8b2a2] flex items-center gap-0.5 tabular-nums">
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
            const targetScouted = canScoutCityDetails(state, state.playerFaction, target.id);
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
                    {tLoc(UI_TEXT.garrison, lang)}:{' '}
                    {targetScouted
                      ? target.troops.toLocaleString()
                      : formatScoutedTroops(target.troops, lang)}{' '}
                    · {tLoc(TERRAIN_TEXT[target.terrain], lang)}
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
                        disabled={!canOrder || city.troops <= 2000}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600/25 hover:bg-sky-600/40 border border-sky-400/40 disabled:opacity-40 text-xs font-semibold text-sky-200 transition cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>{tLoc(UI_TEXT.reinforce, lang)}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onOpenMilitary(target.id, city.id, 'assault')}
                        disabled={!canOrder || city.troops <= 2000}
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
