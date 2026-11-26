import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Anchor,
  ArrowLeft,
  ArrowRightLeft,
  Bomb,
  ChevronLeft,
  ChevronRight,
  Coins,
  Moon,
  Swords,
  UserPlus,
  Users,
  Wheat,
  X,
} from 'lucide-react';
import {
  ASPECT_MAX_LEVEL,
  DRILL_ORDER_GAIN,
  DRILL_SEASON_DRIFT,
  RELIEF_ORDER_GAIN,
  SUPPORT_COST_LEVY,
  SUPPORT_SEASON_DRIFT,
  UNREST_DESERTION,
  UNREST_SUPPORT,
  aspectBand,
  drillMoraleBonus,
  drillOfficerBonus,
  mixDrill,
  reliefOfficerBonus,
  supportIncomeFactor,
  supportLevyFactor,
  supportRestingLevel,
} from '../game/cityAspects.js';
import { ACTION_COSTS, PROVINCES } from '../game/data.js';
import { CITY_EVENT_KINDS } from '../game/cityEvents.js';
import {
  GOVERNOR_FOCI,
  GOVERNOR_SCORE_CEILING,
  GOVERNOR_TASKS,
  WORKS_PER_LEVEL,
  getCityGovernor,
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
  cityExtraGateHp,
  cityExtraRampartDef,
  cityRawLevyDrill,
  cityRecruitFoodCost,
  cityUpkeepFactor,
  factionHasTech,
  formatScoutedTroops,
  getCityCrisisOptions,
  getCityGenerals,
  getCityLandmark,
  getCityWanderingHeroes,
  getEligibleStagingCities,
  getFactionCities,
  getFactionIncomeBreakdown,
  getSummonableGeneralsForCity,
  isTruceActive,
  isYangtzePort,
  levySizeOf,
} from '../game/engine.js';
import {
  GATE_BASE_HP,
  GATE_HP_PER_DEFENSE,
  RAMPART_BASE_DEF,
  RAMPART_DEF_PER_LEVEL,
} from '../game/tacticalEngine.js';
import type {
  City,
  CityCrisisResolutionKind,
  CityEventKind,
  CitySpecialtyId,
  DomesticOrder,
  GameState,
  GovernorFocus,
  GovernorTask,
  Language,
  MilitaryActionType,
  Season,
} from '../game/types.js';
import { EVENT_TEXT, eventLasts } from './cityEventText.js';
import { FOCUS_TEXT, TASK_DOING, TASK_SKILL } from './governorText.js';
import { TERRAIN_TEXT, tLoc } from '../i18n/translations.js';
import { useArtLook } from '../utils/artLook.js';
import { citySpecOf, type DistrictId } from './city/cityLayout.js';
import { CityStage3D, type DistrictLabel } from './CityStage3D.js';
import { HeroAvatar } from './HeroAvatar.js';
import { Seal } from './ui/Seal.js';

interface CityViewProps {
  state: GameState;
  lang: Language;
  cityId: string;
  /** False while another player holds the turn: the city can be looked at, not ordered. */
  canIssueOrders: boolean;
  /** Opens this district's panel on arrival. */
  initialDistrict?: DistrictId | null;
  onExit: () => void;
  onChangeCity: (cityId: string) => void;
  /** Farming, trade, drill and relief. */
  onDomesticOrder: (cityId: string, order: DomesticOrder) => void;
  /** Give the city's post to a general stationed there, or with null leave it to the senior one. */
  onAppointGovernor: (cityId: string, generalId: string | null) => void;
  onSetFocus: (cityId: string, focus: GovernorFocus) => void;
  onFortify: (cityId: string) => void;
  onRecruit: (cityId: string) => void;
  onReinforce: (fromCityId: string, toCityId: string) => void;
  onOpenMilitary: (targetCityId: string, fromCityId?: string, action?: MilitaryActionType) => void;
  onInspectHero: (heroId: string) => void;
  onRecruitWanderingHero: (heroId: string) => void;
  onSummonOfficer?: (heroId: string, targetCityId: string) => void;
  onMendBreach?: (cityId: string) => void;
  onResolveCrisis?: (cityId: string, choice: CityCrisisResolutionKind) => void;
  onCharterSpecialty?: (cityId: string, specialty: CitySpecialtyId) => void;
}

const PANEL_WIDTH = 372;

const DISTRICT_NAME: Record<DistrictId, { seal: string; en: string; zh: string }> = {
  hall: { seal: '府', en: 'Governor’s hall', zh: '官署' },
  market: { seal: '市', en: 'Market', zh: '市集' },
  fields: { seal: '农', en: 'Farmland', zh: '农田' },
  barracks: { seal: '兵', en: 'Barracks', zh: '军营' },
  walls: { seal: '防', en: 'Walls and gates', zh: '城防' },
};

function LevelBar({ level, tone }: { level: number; tone: string }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((lv) => (
        <div key={lv} className={`h-1.5 flex-1 rounded-full ${lv <= level ? tone : 'bg-white/10'}`} />
      ))}
    </div>
  );
}

const BAND_TEXT = {
  low: { en: 'unrest', zh: '动荡' },
  fair: { en: 'uneasy', zh: '不稳' },
  good: { en: 'settled', zh: '安定' },
  high: { en: 'devoted', zh: '归心' },
} as const;
const DRILL_TEXT = {
  low: { en: 'raw', zh: '乌合' },
  fair: { en: 'green', zh: '生疏' },
  good: { en: 'trained', zh: '娴熟' },
  high: { en: 'veteran', zh: '精锐' },
} as const;

/** A 0 to 100 score with its bar. */
function ScoreBar({ score, tone }: { score: number; tone: string }) {
  return (
    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-100 text-right">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">{title}</h4>
      {children}
    </section>
  );
}

/** The close-up of one city: the scene, its five districts, and the orders each one takes. */
export function CityView({
  state,
  lang,
  cityId,
  canIssueOrders,
  initialDistrict = null,
  onExit,
  onChangeCity,
  onDomesticOrder,
  onAppointGovernor,
  onSetFocus,
  onFortify,
  onRecruit,
  onReinforce,
  onOpenMilitary,
  onInspectHero,
  onRecruitWanderingHero,
  onSummonOfficer,
  onMendBreach,
  onResolveCrisis,
  onCharterSpecialty,
}: CityViewProps) {
  const zh = lang === 'zh';
  const look = useArtLook();
  const [district, setDistrict] = useState<DistrictId | null>(initialDistrict);
  const city = state.cities[cityId] as City | undefined;

  // Esc closes the open district first, then the city. Dialogs opened from here keep their own Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (document.querySelector('.fixed.inset-0.z-50')) return;
      e.preventDefault();
      if (district) setDistrict(null);
      else onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [district, onExit]);

  // ?demoSeason=autumn shows a city in another season, for looking at the scene
  const season = useMemo<Season>(() => {
    const asked = new URLSearchParams(window.location.search).get('demoSeason');
    return asked === 'spring' || asked === 'summer' || asked === 'autumn' || asked === 'winter'
      ? asked
      : state.season;
  }, [state.season]);
  const governorTask = city && city.owner !== 'neutral' ? (governorPlanOf(state, city.id)?.task ?? null) : null;
  const specGovernor = city ? getCityGovernor(state, city.id)?.general : undefined;
  const specWanderingCount = city ? getCityWanderingHeroes(state, city.id).length : 0;
  const specHasBalloon = Boolean(city && city.owner !== 'neutral' && factionHasTech(state, city.owner, 'balloon'));
  const specHasAgriculture = Boolean(
    city && city.owner !== 'neutral' && factionHasTech(state, city.owner, 'agriculture')
  );
  const specHasSteamship = Boolean(
    city &&
      city.owner !== 'neutral' &&
      factionHasTech(state, city.owner, 'steamship') &&
      (city.terrain === 'river' || isYangtzePort(city.id))
  );
  const spec = useMemo(() => {
    if (!city) return null;
    const isRiverCity = city.terrain === 'river' || isYangtzePort(city.id);
    const base = citySpecOf(city, season, isRiverCity, look === 'myth', governorTask, {
      hasBalloon: specHasBalloon,
      hasAgriculture: specHasAgriculture,
      hasSteamship: specHasSteamship,
      governorChar: specGovernor ? specGovernor.name.zh.slice(0, 1) : null,
      hasWanderingHero: specWanderingCount > 0,
    });
    // ?demoScene=flood,breached,unrest,works:walls,drill:3,balloon,agriculture,steamship,wayfarer dresses the scene
    const asked = new URLSearchParams(window.location.search).get('demoScene');
    if (!asked) return base;
    const dressed = { ...base };
    for (const word of asked.split(',')) {
      if ((CITY_EVENT_KINDS as string[]).includes(word)) dressed.event = word as CityEventKind;
      else if (word === 'unrest') dressed.unrest = true;
      else if (word === 'thriving') dressed.thriving = true;
      else if (word === 'breached') dressed.breached = true;
      else if (word === 'balloon') dressed.hasBalloon = true;
      else if (word === 'agriculture') dressed.hasAgriculture = true;
      else if (word === 'steamship') dressed.hasSteamship = true;
      else if (word === 'wayfarer') dressed.hasWanderingHero = true;
      else if (
        word.startsWith('spec:') &&
        (CITY_SPECIALTY_IDS as string[]).includes(word.slice(5))
      ) {
        dressed.specialty = word.slice(5) as CitySpecialtyId;
      } else if (word.startsWith('works:') && (GOVERNOR_TASKS as string[]).includes(word.slice(6))) {
        dressed.works = word.slice(6) as GovernorTask;
      } else if (/^drill:[0-3]$/.test(word)) dressed.drillBand = Number(word.slice(6));
    }
    return dressed;
  }, [
    city,
    season,
    look,
    governorTask,
    specHasBalloon,
    specHasAgriculture,
    specHasSteamship,
    specGovernor?.id,
    specWanderingCount,
  ]);

  if (!city || !spec) return null;

  const owned = city.owner === state.playerFaction;
  const scouted = canScoutCityDetails(state, state.playerFaction, city.id);
  const player = state.factions[state.playerFaction];
  const orders = state.actionPoints;
  const mayOrder = canIssueOrders && owned && orders > 0;
  const generals = getCityGenerals(state, city.id);
  const wandering = getCityWanderingHeroes(state, city.id);
  const governing = getCityGovernor(state, city.id);
  const governor = governing?.general;
  const plan = governorPlanOf(state, city.id);
  const crisisOptions = owned ? getCityCrisisOptions(state, city.id) : [];
  const summonable =
    owned && onSummonOfficer
      ? getSummonableGeneralsForCity(state, state.playerFaction, city.id)
      : [];
  const income =
    !scouted || city.owner === 'neutral'
      ? null
      : getFactionIncomeBreakdown(state, city.owner).find((row) => row.cityId === city.id) ?? null;
  // What the city would bring in with some of its numbers changed, by the rule the season uses
  const incomeWith = (patch: Partial<City>) =>
    city.owner === 'neutral'
      ? null
      : getFactionIncomeBreakdown(
          { ...state, cities: { ...state.cities, [city.id]: { ...city, ...patch } } },
          city.owner
        ).find((row) => row.cityId === city.id) ?? null;
  const upkeep = Math.round(city.troops * 0.008 * cityUpkeepFactor(city));
  const landmark = getCityLandmark(city.id);
  const activeSpec = city.specialty ? CITY_SPECIALTIES[city.specialty] : undefined;

  const recruitGold =
    state.playerFaction === 'wei' ? Math.round(ACTION_COSTS.recruitGold * 0.85) : ACTION_COSTS.recruitGold;
  const recruitFood = cityRecruitFoodCost(city);
  const farmGold = cityEconomyOrderGoldCost(city, 'farming');
  const tradeGold = cityEconomyOrderGoldCost(city, 'trade');
  const rawDrillHere = cityRawLevyDrill(city);
  const bestCharisma = generals.reduce((max, g) => Math.max(max, g.charisma), 60);
  const levy = levySizeOf(city, bestCharisma);
  const drillAfterLevy = mixDrill(city.troops, city.drill, levy, rawDrillHere);
  const drillmaster = [...generals].sort((a, b) => b.command - a.command)[0];
  const drillGain = DRILL_ORDER_GAIN + drillOfficerBonus(drillmaster?.command ?? 0);
  const steward = [...generals].sort((a, b) => b.charisma - a.charisma)[0];
  const reliefGain = RELIEF_ORDER_GAIN + reliefOfficerBonus(steward?.charisma ?? 0);
  const supportRest = supportRestingLevel(steward?.charisma ?? 0);
  const unrest = city.support < UNREST_SUPPORT;
  const pct = (factor: number) => {
    const n = Math.round((factor - 1) * 100);
    return `${n > 0 ? '+' : ''}${n}%`;
  };
  const morale = drillMoraleBonus(city.drill);

  const ownerName =
    city.owner === 'neutral' ? (zh ? '中立' : 'Neutral') : tLoc(state.factions[city.owner].name, lang);
  const ownerColor = city.owner === 'neutral' ? '#a8a29e' : state.factions[city.owner].color;

  const myCities = getFactionCities(state, state.playerFaction).sort(
    (a, b) => a.province.localeCompare(b.province) || a.x - b.x
  );
  const myIndex = myCities.findIndex((c) => c.id === city.id);
  const step = (dir: 1 | -1) => {
    if (myCities.length < 2 || myIndex < 0) return;
    onChangeCity(myCities[(myIndex + dir + myCities.length) % myCities.length].id);
  };

  const gold = (n: number) => (zh ? `${n} 金` : `${n} gold`);
  const grain = (n: number) => (zh ? `${n} 粮` : `${n} grain`);
  const perSeason = zh ? '每季' : 'a season';

  const eventText = city.event ? EVENT_TEXT[city.event.kind] : null;
  const labels: Record<DistrictId, DistrictLabel> = {
    hall: {
      seal: DISTRICT_NAME.hall.seal,
      title: city.isCapital ? (zh ? '宫城' : 'Palace') : zh ? DISTRICT_NAME.hall.zh : 'Hall',
      value: !scouted
        ? governor
          ? tLoc(governor.name, lang)
          : zh
            ? '探报未详'
            : 'Unscouted'
        : unrest
          ? zh
            ? `民心 ${city.support} · 动荡`
            : `Support ${city.support} · unrest`
          : governor
            ? tLoc(governor.name, lang)
            : zh
              ? '无人主政'
              : 'No governor',
    },
    market: {
      seal: DISTRICT_NAME.market.seal,
      title: zh ? DISTRICT_NAME.market.zh : DISTRICT_NAME.market.en,
      value: income ? `+${gold(income.gold)}` : zh ? `商业 ${city.trade} 级` : `Trade ${city.trade}`,
    },
    fields: {
      seal: DISTRICT_NAME.fields.seal,
      title: zh ? DISTRICT_NAME.fields.zh : DISTRICT_NAME.fields.en,
      value: income ? `+${grain(income.food)}` : zh ? `农业 ${city.farming} 级` : `Farming ${city.farming}`,
    },
    barracks: {
      seal: DISTRICT_NAME.barracks.seal,
      title: zh ? DISTRICT_NAME.barracks.zh : DISTRICT_NAME.barracks.en,
      value: !scouted
        ? `${formatScoutedTroops(city.troops, lang)}${zh ? ' 人' : ' men'}`
        : zh
          ? `${city.troops.toLocaleString()} 人 · 训练 ${city.drill}`
          : `${city.troops.toLocaleString()} men · drill ${city.drill}`,
    },
    walls: {
      seal: DISTRICT_NAME.walls.seal,
      title: zh ? DISTRICT_NAME.walls.zh : 'Walls',
      value: zh
        ? `城防 ${city.defense} 级${city.wallScar ? ' · 缺口' : ''}`
        : `Level ${city.defense}${city.wallScar ? ' · breached' : ''}`,
    },
  };

  // The district where an event shows carries its name
  if (eventText) {
    const tagged = labels[eventText.district];
    tagged.value = `${zh ? eventText.name.zh : eventText.name.en} · ${tagged.value}`;
  }

  // --- what stops an order, said in words
  const blocked = (needGold: number, needFood = 0, atCap = false): string | null => {
    if (!owned) return null;
    if (!canIssueOrders) return zh ? '尚未轮到你下令' : 'It is not your turn';
    if (atCap) return zh ? '已至最高等级' : 'Already at the highest level';
    if (orders < 1) return zh ? '本季行动力已用尽' : 'No orders left this season';
    if (player.gold < needGold) return zh ? `国库不足（需 ${needGold} 金）` : `Not enough gold (needs ${needGold})`;
    if (player.food < needFood) return zh ? `粮草不足（需 ${needFood} 粮）` : `Not enough grain (needs ${needFood})`;
    return null;
  };
  const farmBlock = blocked(farmGold, 0, city.farming >= ASPECT_MAX_LEVEL);
  const tradeBlock = blocked(tradeGold, 0, city.trade >= ASPECT_MAX_LEVEL);
  const drillBlock = blocked(ACTION_COSTS.drillGold, 0, city.drill >= 100);
  const reliefBlock = blocked(0, ACTION_COSTS.reliefFood, city.support >= 100);
  const fortifyBlock = blocked(ACTION_COSTS.fortifyGold, 0, city.defense >= 5);
  const mendBreachBlock = blocked(ACTION_COSTS.mendBreachGold, 0, !city.wallScar || city.wallScar <= 0);
  const recruitBlock = blocked(recruitGold, recruitFood);

  const order = (
    label: string,
    cost: ReactNode,
    block: string | null,
    run: () => void,
    gain?: string
  ) => (
    <div className="space-y-1.5">
      {gain && <p className="text-[12px] text-slate-300 leading-snug">{gain}</p>}
      <button
        type="button"
        disabled={Boolean(block)}
        onClick={run}
        className="w-full btn-gold rounded-md px-3 py-2 text-[13px] flex items-center justify-between gap-2 cursor-pointer disabled:cursor-not-allowed"
      >
        <span>{label}</span>
        <span className="flex items-center gap-1.5 text-[12px] font-semibold opacity-90">{cost}</span>
      </button>
      {block && <p className="text-[11px] text-rose-300">{block}</p>}
    </div>
  );
  const costOf = (g: number, f = 0) => (
    <>
      {g > 0 && (
        <>
          <Coins className="w-3.5 h-3.5" />
          {g}
        </>
      )}
      {f > 0 && (
        <>
          <Wheat className={`w-3.5 h-3.5 ${g > 0 ? 'ml-1' : ''}`} />
          {f}
        </>
      )}
      <span className="ml-1">· {zh ? '1 行动力' : '1 order'}</span>
    </>
  );

  const heroRow = (g: (typeof generals)[number], extra?: ReactNode) => (
    <div key={g.id} className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => onInspectHero(g.id)}
        className="flex items-center gap-2.5 min-w-0 text-left rounded-md px-1.5 py-1 hover:bg-white/5 cursor-pointer flex-1"
      >
        <HeroAvatar hero={g} size="sm" showLevel />
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-slate-50 truncate">{tLoc(g.name, lang)}</span>
          <span className="block text-[11px] text-slate-400 leading-snug">
            {zh
              ? `武${g.war} 智${g.intellect} 统${g.command} 政${g.politics} 魅${g.charisma}`
              : `War ${g.war} · Mind ${g.intellect} · Lead ${g.command} · Rule ${g.politics} · Charm ${g.charisma}`}
          </span>
        </span>
      </button>
      {extra}
    </div>
  );

  const moreTrade = city.trade < ASPECT_MAX_LEVEL ? incomeWith({ trade: city.trade + 1 }) : null;
  const moreFarming = city.farming < ASPECT_MAX_LEVEL ? incomeWith({ farming: city.farming + 1 }) : null;
  const tradeOrder = order(
    zh ? '扩建市集' : 'Enlarge the market',
    costOf(tradeGold),
    tradeBlock,
    () => onDomesticOrder(city.id, 'trade'),
    moreTrade && income
      ? zh
        ? `商业升至 ${city.trade + 1} 级：每季多得 ${moreTrade.gold - income.gold} 金。`
        : `Trade ${city.trade + 1}: ${moreTrade.gold - income.gold} more gold a season.`
      : undefined
  );
  const farmOrder = order(
    zh ? '开垦屯田' : 'Open new fields',
    costOf(farmGold),
    farmBlock,
    () => onDomesticOrder(city.id, 'farm'),
    moreFarming && income
      ? zh
        ? `农业升至 ${city.farming + 1} 级：每季多得 ${moreFarming.food - income.food} 粮。`
        : `Farming ${city.farming + 1}: ${moreFarming.food - income.food} more grain a season.`
      : undefined
  );
  const reliefTo = Math.min(100, city.support + reliefGain);
  const afterRelief = incomeWith({ support: reliefTo });
  const reliefOrder = order(
    zh ? '开仓赈济' : 'Open the granaries',
    costOf(0, ACTION_COSTS.reliefFood),
    reliefBlock,
    () => onDomesticOrder(city.id, 'relief'),
    city.support < 100
      ? zh
        ? `民心 ${city.support} → ${reliefTo}${
            steward && reliefOfficerBonus(steward.charisma) > 0
              ? `（${tLoc(steward.name, lang)}得民望，多 ${reliefOfficerBonus(steward.charisma)}）`
              : ''
          }${afterRelief && income ? `：此城每季多得 ${afterRelief.gold - income.gold} 金、${afterRelief.food - income.food} 粮。` : '。'}`
        : `Support ${city.support} → ${reliefTo}${
            steward && reliefOfficerBonus(steward.charisma) > 0
              ? ` (${reliefOfficerBonus(steward.charisma)} of it thanks to ${tLoc(steward.name, lang)})`
              : ''
          }${afterRelief && income ? `: ${afterRelief.gold - income.gold} more gold and ${afterRelief.food - income.food} more grain a season from this city.` : '.'}`
      : undefined
  );
  const drillTo = Math.min(100, city.drill + drillGain);
  const drillOrder = order(
    zh ? '校场练兵' : 'Drill the garrison',
    costOf(ACTION_COSTS.drillGold),
    drillBlock,
    () => onDomesticOrder(city.id, 'drill'),
    city.drill < 100
      ? zh
        ? `训练 ${city.drill} → ${drillTo}${
            drillmaster && drillOfficerBonus(drillmaster.command) > 0
              ? `（${tLoc(drillmaster.name, lang)}善统兵，多 ${drillOfficerBonus(drillmaster.command)}）`
              : ''
          }：临阵士气 ${morale >= 0 ? '+' : ''}${morale} → ${drillMoraleBonus(drillTo) >= 0 ? '+' : ''}${drillMoraleBonus(drillTo)}。`
        : `Drill ${city.drill} → ${drillTo}${
            drillmaster && drillOfficerBonus(drillmaster.command) > 0
              ? ` (${drillOfficerBonus(drillmaster.command)} of it thanks to ${tLoc(drillmaster.name, lang)})`
              : ''
          }: morale in battle goes from ${morale >= 0 ? '+' : ''}${morale} to ${drillMoraleBonus(drillTo) >= 0 ? '+' : ''}${drillMoraleBonus(drillTo)}.`
      : undefined
  );

  const peopleBlock = scouted ? (
    <Section title={zh ? '民心' : 'The people'}>
      <div className="space-y-1.5">
        <Row label={zh ? '民心' : 'Support'}>
          <span className={unrest ? 'text-rose-300' : undefined}>
            {city.support} / 100 · {zh ? BAND_TEXT[aspectBand(city.support)].zh : BAND_TEXT[aspectBand(city.support)].en}
          </span>
        </Row>
        <ScoreBar score={city.support} tone={unrest ? 'bg-rose-500' : 'bg-emerald-400'} />
      </div>
      <Row label={zh ? '岁入' : 'Income'}>{pct(supportIncomeFactor(city.support))}</Row>
      <Row label={zh ? '应募' : 'Levies'}>{pct(supportLevyFactor(city.support))}</Row>
      <p className="text-[12px] text-slate-400 leading-snug">
        {unrest
          ? zh
            ? `民心低于 ${UNREST_SUPPORT}：每季守军逃散 ${Math.round(UNREST_DESERTION * 100)}%。`
            : `Below ${UNREST_SUPPORT} the city is in unrest: ${Math.round(UNREST_DESERTION * 100)}% of the garrison deserts each season.`
          : zh
            ? `每季向 ${supportRest} 靠拢 ${SUPPORT_SEASON_DRIFT} 点${supportRest > 50 && steward ? `（${tLoc(steward.name, lang)}魅力 ${steward.charisma}）` : ''}。募兵、围城与敌方离间会折损民心。`
            : `Each season it moves ${SUPPORT_SEASON_DRIFT} toward ${supportRest}${supportRest > 50 && steward ? ` (${tLoc(steward.name, lang)}, charm ${steward.charisma})` : ''}. Levies, sieges and enemy plots wear it down.`}
      </p>
    </Section>
  ) : (
    <Section title={zh ? '民心' : 'The people'}>
      <p className="text-[12px] text-slate-400 leading-snug">
        {zh
          ? '此城远离我方疆界：需据有邻接城池，或研造【千里镜 / 热气球】方可侦知城中民心与岁入实数。'
          : 'Beyond scout reach: capture an adjacent city or unlock Spyglass / Recon Balloon to inspect internal Support and tax figures.'}
      </p>
    </Section>
  );

  // --- the panels
  const hallPanel = (
    <>
      <Section title={zh ? '城池' : 'The city'}>
        <Row label={zh ? '所属' : 'Held by'}>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ownerColor }} />
            {ownerName}
          </span>
        </Row>
        <Row label={zh ? '州郡' : 'Province'}>{tLoc(PROVINCES[city.province].name, lang)}</Row>
        <Row label={zh ? '地势' : 'Country'}>{tLoc(TERRAIN_TEXT[city.terrain], lang)}</Row>
        {income && (
          <Row label={zh ? '每季所入' : 'Brings in a season'}>
            {gold(income.gold)} · {grain(income.food)}
          </Row>
        )}
      </Section>
      <Section title={zh ? '太守' : 'Governor'}>
        {governor ? (
          <>
            {heroRow(
              governor,
              <span
                className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${
                  governing?.acting
                    ? 'border-slate-400/40 text-slate-300'
                    : 'border-amber-400/50 bg-amber-400/10 text-amber-200'
                }`}
              >
                {governing?.acting ? (zh ? '暂摄' : 'Acting') : zh ? '太守' : 'Appointed'}
              </span>
            )}
            <p className="text-[12px] text-slate-300 leading-snug">
              {governing?.acting &&
                (zh ? '未拜太守，由城中政务最高者暂摄。' : 'No governor is appointed, so the best administrator here acts. ')}
              {income && income.governorBonus > 0
                ? zh
                  ? `政务 ${governor.politics}，为此城岁入增益 ${Math.round(income.governorBonus * 100)}%。`
                  : `Rule ${governor.politics} adds ${Math.round(income.governorBonus * 100)}% to what this city brings in.`
                : zh
                  ? `政务 ${governor.politics}，尚不足以增益岁入（需高于 60）。`
                  : `Rule ${governor.politics} is too low to add to the city’s income (it must pass 60).`}
            </p>
          </>
        ) : (
          <p className="text-[12px] text-slate-400">
            {zh
              ? '城中无将，无人主持政务，诸事停滞。'
              : 'No general is stationed here, so no one runs the city and no works go forward.'}
          </p>
        )}
        {owned && generals.length > 1 && (
          <div className="space-y-1 pt-1">
            <div className="text-[11px] text-slate-400">
              {zh ? '改任（任免不耗行动力）' : 'Give the post to (an appointment costs no order)'}
            </div>
            {generals
              .filter((g) => g.id !== governor?.id)
              .map((g) =>
                heroRow(
                  g,
                  <button
                    type="button"
                    disabled={!canIssueOrders}
                    onClick={() => onAppointGovernor(city.id, g.id)}
                    className="shrink-0 rounded-md border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 px-2 py-1 text-[11px] font-semibold text-amber-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {zh ? '拜为太守' : 'Appoint'}
                  </button>
                )
              )}
            {!governing?.acting && (
              <button
                type="button"
                disabled={!canIssueOrders}
                onClick={() => onAppointGovernor(city.id, null)}
                className="text-[11px] text-slate-400 hover:text-slate-100 underline underline-offset-2 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                {zh ? '撤去任命，由政务最高者暂摄' : 'Withdraw the appointment and let the best administrator act'}
              </button>
            )}
          </div>
        )}
        {owned && onSummonOfficer && summonable.length > 0 && (
          <div className="pt-1.5 space-y-1">
            <div className="text-[11px] text-slate-400">
              {zh ? '自他城调将入驻（消耗 1 行动力）' : 'Summon an officer from another city (1 order)'}
            </div>
            <select
              aria-label={zh ? '调将入城' : 'Summon officer'}
              disabled={!mayOrder}
              value=""
              onChange={(e) => {
                if (e.target.value) onSummonOfficer(e.target.value, city.id);
              }}
              className="w-full rounded-md border border-amber-400/40 bg-slate-950/80 px-2 py-1.5 text-[12px] text-amber-100 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <option value="">
                {zh
                  ? generals.length === 0
                    ? '＋ 调将入城主政（1 行动力）'
                    : '＋ 调将入驻此城（1 行动力）'
                  : generals.length === 0
                    ? '+ Summon officer to govern (1 order)'
                    : '+ Summon officer here (1 order)'}
              </option>
              {summonable.map((cand) => (
                <option key={cand.general.id} value={cand.general.id}>
                  {zh
                    ? `${tLoc(cand.general.name, lang)} · 政${cand.general.politics} 统${cand.general.command} 魅${cand.general.charisma}（自${cand.fromCity.name.zh}${cand.leavesOriginEmpty ? '·调后空城' : ''}）`
                    : `${tLoc(cand.general.name, lang)} · Rule ${cand.general.politics}, Lead ${cand.general.command} (from ${cand.fromCity.name.en}${cand.leavesOriginEmpty ? ' · leaves empty' : ''})`}
                </option>
              ))}
            </select>
          </div>
        )}
      </Section>
      {plan && (
        <Section title={zh ? '太守所务（每季自行推进，不耗行动力）' : 'The governor’s work (each season, no order spent)'}>
          {owned && (
            <div className="grid grid-cols-3 gap-1">
              {GOVERNOR_FOCI.map((f) => {
                const on = (city.focus ?? 'auto') === f;
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    disabled={!canIssueOrders}
                    onClick={() => onSetFocus(city.id, f)}
                    className={`rounded-md border px-1.5 py-1.5 text-[12px] font-semibold cursor-pointer disabled:cursor-not-allowed ${
                      on
                        ? 'border-amber-300 bg-amber-300/15 text-amber-100'
                        : 'border-white/15 bg-white/5 text-slate-300 hover:border-amber-300/50'
                    }`}
                  >
                    {zh ? FOCUS_TEXT[f].zh : FOCUS_TEXT[f].en}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-[12px] text-slate-200 leading-snug">
            {zh
              ? `${tLoc(plan.general.name, lang)}${plan.ownChoice ? '自行决定' : '奉命'}${TASK_DOING[plan.task].zh}。`
              : `${tLoc(plan.general.name, lang)} is ${TASK_DOING[plan.task].en}${plan.ownChoice ? ', at the governor’s own discretion' : ', as instructed'}.`}
          </p>
          {plan.task === 'drill' || plan.task === 'relief' ? (
            <p className="text-[12px] text-slate-400 leading-snug">
              {plan.idle
                ? zh
                  ? `已至太守所能及之上限（${GOVERNOR_SCORE_CEILING}），只能维持不坠；再高须亲自下令。`
                  : `It has reached the most a governor can do (${GOVERNOR_SCORE_CEILING}) and is held there. Going higher takes your own orders.`
                : zh
                  ? `${TASK_SKILL[plan.task].zh} ${plan.skill}：每季 +${plan.rate}，约 ${plan.seasonsLeft} 季后至 ${GOVERNOR_SCORE_CEILING}。`
                  : `${TASK_SKILL[plan.task].en} ${plan.skill} adds ${plan.rate} a season, reaching ${GOVERNOR_SCORE_CEILING} in about ${plan.seasonsLeft} ${plan.seasonsLeft === 1 ? 'season' : 'seasons'}.`}
            </p>
          ) : plan.idle ? (
            <p className="text-[12px] text-rose-300 leading-snug">
              {zh ? '此项已至最高等级，太守无事可做，请另行指派。' : 'This is already at the highest level, so the governor has nothing to do. Choose another task.'}
            </p>
          ) : (
            <>
              <ScoreBar score={(plan.works / WORKS_PER_LEVEL) * 100} tone="bg-amber-400" />
              <p className="text-[12px] text-slate-400 leading-snug">
                {zh
                  ? `工程 ${plan.works}/${WORKS_PER_LEVEL}。${TASK_SKILL[plan.task].zh} ${plan.skill}：每季 +${plan.rate}，约 ${plan.seasonsLeft} 季后升一级。`
                  : `Works ${plan.works} of ${WORKS_PER_LEVEL}. ${TASK_SKILL[plan.task].en} ${plan.skill} adds ${plan.rate} a season: the next level in about ${plan.seasonsLeft} ${plan.seasonsLeft === 1 ? 'season' : 'seasons'}.`}
              </p>
            </>
          )}
        </Section>
      )}
      {peopleBlock}
      {owned && <Section title={zh ? '下令' : 'Order'}>{reliefOrder}</Section>}
      {!owned && generals.length > 1 && (
        <Section title={zh ? '驻城诸将' : 'Also stationed here'}>
          <div className="space-y-0.5">{generals.filter((g) => g.id !== governor?.id).map((g) => heroRow(g))}</div>
        </Section>
      )}
      {wandering.length > 0 && (
        <Section title={zh ? '在野名士' : 'Wandering in the city'}>
          <div className="space-y-0.5">
            {wandering.map((g) =>
              heroRow(
                g,
                <button
                  type="button"
                  disabled={!canIssueOrders || orders < 1}
                  onClick={() => onRecruitWanderingHero(g.id)}
                  className="btn-gold rounded-md px-2.5 py-1.5 text-[12px] flex items-center gap-1 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {zh ? '招贤' : 'Recruit'}
                </button>
              )
            )}
          </div>
        </Section>
      )}
    </>
  );

  const levelBlock = (label: string, level: number, tone: string) => (
    <div className="space-y-1.5">
      <Row label={label}>{zh ? `${level} / 5 级` : `Level ${level} of 5`}</Row>
      <LevelBar level={level} tone={tone} />
    </div>
  );
  const supportNote =
    income && Math.round(income.supportBonus * 100) !== 0 ? (
      <Row label={zh ? '其中民心增减' : 'Of which, the people’s support'}>{pct(1 + income.supportBonus)}</Row>
    ) : null;

  const marketPanel = (
    <>
      <Section title={zh ? '商税' : 'Trade'}>
        {levelBlock(zh ? '商业' : 'Trade', city.trade, 'bg-amber-400')}
        {income && <Row label={zh ? '每季金入' : 'Gold a season'}>{gold(income.gold)}</Row>}
        {supportNote}
        <p className="text-[12px] text-slate-400 leading-snug">
          {zh ? '商业越盛，市肆摊贩越密，每季金入越多。' : 'The more trade, the more shops and stalls fill the square, and the more gold each season.'}
        </p>
      </Section>
      {owned && <Section title={zh ? '下令' : 'Order'}>{tradeOrder}</Section>}
    </>
  );

  const fieldsPanel = (
    <>
      <Section title={zh ? '田赋' : 'Harvest'}>
        {levelBlock(zh ? '农业' : 'Farming', city.farming, 'bg-lime-400')}
        {income && <Row label={zh ? '每季粮入' : 'Grain a season'}>{grain(income.food)}</Row>}
        {supportNote}
        <Row label={zh ? '守军耗粮' : 'The garrison eats'}>{`${grain(upkeep)} ${perSeason}`}</Row>
        {income && (
          <Row label={zh ? '此城盈余' : 'Left over'}>
            <span className={income.food - upkeep < 0 ? 'text-rose-300' : 'text-emerald-300'}>
              {income.food - upkeep >= 0 ? '+' : ''}
              {grain(income.food - upkeep)}
            </span>
          </Row>
        )}
      </Section>
      {owned && <Section title={zh ? '下令' : 'Order'}>{farmOrder}</Section>}
    </>
  );

  const ownNeighbours = city.neighbors.map((id) => state.cities[id]).filter((c): c is City => Boolean(c));
  const barracksPanel = (
    <>
      <Section title={zh ? '守军' : 'Garrison'}>
        <Row label={zh ? '兵力' : 'Under arms'}>
          {scouted ? city.troops.toLocaleString() : formatScoutedTroops(city.troops, lang)}
        </Row>
        {scouted && <Row label={zh ? '耗粮' : 'Eats'}>{`${grain(upkeep)} ${perSeason}`}</Row>}
        <Row label={zh ? '统兵' : 'Commanders'}>
          {generals.length > 0 ? generals.map((g) => tLoc(g.name, lang)).join(zh ? '、' : ', ') : zh ? '无' : 'None'}
        </Row>
      </Section>
      <Section title={zh ? '训练' : 'Drill'}>
        {scouted ? (
          <>
            <div className="space-y-1.5">
              <Row label={zh ? '训练度' : 'Drill'}>
                {city.drill} / 100 · {zh ? DRILL_TEXT[aspectBand(city.drill)].zh : DRILL_TEXT[aspectBand(city.drill)].en}
              </Row>
              <ScoreBar score={city.drill} tone="bg-rose-400" />
            </div>
            <Row label={zh ? '临阵士气' : 'Morale in battle'}>
              <span className={morale < 0 ? 'text-rose-300' : morale > 0 ? 'text-emerald-300' : undefined}>
                {morale >= 0 ? '+' : ''}
                {morale}
              </span>
            </Row>
            <p className="text-[12px] text-slate-400 leading-snug">
              {zh
                ? `此城之兵出征或守城，皆以此士气临阵。每季向 50 回落或回升 ${DRILL_SEASON_DRIFT} 点；新募之兵训练为 ${rawDrillHere}，会拉低全军。`
                : `Men from this city attack and defend with this morale. Each season drill moves ${DRILL_SEASON_DRIFT} back toward 50, and new levies arrive at ${rawDrillHere} and pull the garrison down.`}
            </p>
          </>
        ) : (
          <p className="text-[12px] text-slate-400 leading-snug">
            {zh
              ? '远处斥候难辨敌军操练深浅；占领邻接城池或研造【千里镜 / 热气球】后可洞察守军训练度。'
              : 'Distant scouts cannot gauge garrison drill; capture an adjacent city or unlock Spyglass / Recon Balloon to inspect it.'}
          </p>
        )}
      </Section>
      {owned && (
        <>
          <Section title={zh ? '下令' : 'Order'}>
            {order(
              zh ? '募兵' : 'Raise a levy',
              costOf(recruitGold, recruitFood),
              recruitBlock,
              () => onRecruit(city.id),
              zh
                ? `可得 ${levy.toLocaleString()} 人；民心 -${SUPPORT_COST_LEVY}，训练 ${city.drill} → ${drillAfterLevy}。城越繁荣、民心越高、守将越得人望，应募越多。`
                : `Brings ${levy.toLocaleString()} men. Support falls by ${SUPPORT_COST_LEVY} and drill goes from ${city.drill} to ${drillAfterLevy}. A richer, more willing city and a well-loved general bring more.`
            )}
            {drillOrder}
          </Section>
          {ownNeighbours.some((n) => n.owner === state.playerFaction) && (
            <Section title={zh ? '分兵增援（调遣兵马与随军武将）' : 'Dispatch reinforcements & officers'}>
              <div className="space-y-1.5">
                {ownNeighbours
                  .filter((n) => n.owner === state.playerFaction)
                  .map((n) => (
                    <div key={n.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="text-slate-200">
                        {tLoc(n.name, lang)}
                        <span className="text-slate-400"> · {n.troops.toLocaleString()}</span>
                      </span>
                      <button
                        type="button"
                        disabled={!mayOrder || city.troops <= 2000}
                        onClick={() => onReinforce(city.id, n.id)}
                        className="flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-600/20 hover:bg-sky-600/35 px-2.5 py-1.5 text-[12px] font-semibold text-sky-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        {zh ? '增援' : 'Reinforce'}
                      </button>
                    </div>
                  ))}
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );

  // What the player can do to a city that is not theirs
  const adjacentStaging = !owned ? getEligibleStagingCities(state, state.playerFaction, city.id, 'adjacent') : [];
  const riverStaging = !owned ? getEligibleStagingCities(state, state.playerFaction, city.id, 'river') : [];
  const farDiscord = !owned && factionHasTech(state, state.playerFaction, 'spyglass');
  const canStrike =
    !owned && canIssueOrders && orders > 0 && (adjacentStaging.length > 0 || riverStaging.length > 0 || farDiscord);
  const strike = (label: string, icon: ReactNode, action: MilitaryActionType, from?: string, wide = false) => (
    <button
      type="button"
      onClick={() => onOpenMilitary(city.id, from, action)}
      className={`${wide ? 'col-span-2 btn-seal py-2' : 'border border-rose-400/40 bg-rose-500/15 hover:bg-rose-500/30 text-rose-100 py-1.5'} rounded-md px-2 text-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer`}
    >
      {icon}
      {label}
    </button>
  );

  const fullGateHp = GATE_BASE_HP + city.defense * GATE_HP_PER_DEFENSE + cityExtraGateHp(city);
  const effectiveGateHp =
    city.wallScar && city.wallScar > 0
      ? Math.max(1, Math.round(fullGateHp * WALL_SCAR_GATE_FACTOR))
      : fullGateHp;

  const wallsPanel = (
    <>
      <Section title={zh ? '城防' : 'Defences'}>
        <div className="space-y-1.5">
          <Row label={zh ? '城防' : 'Walls'}>{zh ? `${city.defense} / 5 级` : `Level ${city.defense} of 5`}</Row>
          <LevelBar level={city.defense} tone="bg-sky-400" />
        </div>
        <Row label={zh ? '城门坚固' : 'Gate strength'}>
          {city.wallScar && city.wallScar > 0 ? (
            <span className="text-amber-300">
              {effectiveGateHp.toLocaleString()} / {fullGateHp.toLocaleString()} (-
              {Math.round((1 - WALL_SCAR_GATE_FACTOR) * 100)}%)
            </span>
          ) : (
            fullGateHp.toLocaleString()
          )}
        </Row>
        <Row label={zh ? '守军据墙之利' : 'Cover for the defenders'}>
          {Math.round(
            (RAMPART_BASE_DEF + RAMPART_DEF_PER_LEVEL * city.defense + cityExtraRampartDef(city)) * 100
          )}
          %
        </Row>
      </Section>
      {owned && (
        <Section title={zh ? '下令' : 'Order'}>
          {Boolean(city.wallScar && city.wallScar > 0) &&
            onMendBreach &&
            order(
              zh ? '抢修城垣缺口' : 'Mend breached ramparts',
              costOf(ACTION_COSTS.mendBreachGold),
              mendBreachBlock,
              () => onMendBreach(city.id),
              zh
                ? `立即修复城墙缺口（城门耐久恢复至 ${fullGateHp.toLocaleString()}，民心 +3）。`
                : `Immediately restores full Gate HP (${fullGateHp.toLocaleString()}) and adds +3 Support.`
            )}
          {order(
            zh ? '加固城防' : 'Strengthen the walls',
            costOf(ACTION_COSTS.fortifyGold),
            fortifyBlock,
            () => onFortify(city.id),
            city.defense < 5
              ? zh
                ? `城防升至 ${city.defense + 1} 级：城门 +${GATE_HP_PER_DEFENSE}，据墙之利 +${Math.round(RAMPART_DEF_PER_LEVEL * 100)}%。`
                : `Level ${city.defense + 1}: the gate gains ${GATE_HP_PER_DEFENSE} and the defenders’ cover ${Math.round(RAMPART_DEF_PER_LEVEL * 100)}%.`
              : undefined
          )}
        </Section>
      )}
      {!owned && (
        <Section title={zh ? '用兵（1 行动力）' : 'Move against it (1 order)'}>
          {!canStrike ? (
            <p className="text-[12px] text-slate-400 leading-snug">
              {!canIssueOrders
                ? zh
                  ? '尚未轮到你下令。'
                  : 'It is not your turn.'
                : orders < 1
                  ? zh
                    ? '本季行动力已用尽。'
                    : 'No orders left this season.'
                  : zh
                    ? '须先据有与之相邻的城池，或自沿江两站之内的港口发水师。'
                    : 'You need a city next to it first, or a river port within two stops to send a fleet from.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {adjacentStaging.length > 0 && (
                <>
                  {strike(
                    adjacentStaging.length >= 2 ? (zh ? '大军攻城 · 多路合围' : 'Assault from several sides') : zh ? '大军攻城' : 'Assault',
                    <Swords className="w-3.5 h-3.5" />,
                    'assault',
                    adjacentStaging[0].id,
                    true
                  )}
                  {strike(zh ? '夜袭' : 'Night raid', <Moon className="w-3.5 h-3.5" />, 'raid', adjacentStaging[0].id)}
                  {strike(zh ? '火攻' : 'Bombard', <Bomb className="w-3.5 h-3.5" />, 'bombard', adjacentStaging[0].id)}
                </>
              )}
              {(adjacentStaging.length > 0 || farDiscord) &&
                strike(zh ? '离间' : 'Sow discord', <Users className="w-3.5 h-3.5" />, 'discord', adjacentStaging[0]?.id)}
              {riverStaging.length > 0 &&
                isYangtzePort(city.id) &&
                strike(zh ? '水师奔袭' : 'River fleet', <Anchor className="w-3.5 h-3.5" />, 'river_strike', riverStaging[0].id)}
            </div>
          )}
        </Section>
      )}
      <Section title={zh ? '道路所通' : 'Where the roads lead'}>
        <div className="space-y-1.5">
          {ownNeighbours.map((n) => {
            const mine = n.owner === state.playerFaction;
            const truce = owned && !mine && n.owner !== 'neutral' && isTruceActive(state, state.playerFaction, n.owner);
            return (
              <div key={n.id} className="flex items-center justify-between gap-2 text-[13px]">
                <button
                  type="button"
                  onClick={() => onChangeCity(n.id)}
                  className="flex items-center gap-1.5 text-left text-slate-200 hover:text-white hover:underline cursor-pointer"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: n.owner === 'neutral' ? '#a8a29e' : state.factions[n.owner].color }}
                  />
                  {tLoc(n.name, lang)}
                  <span className="text-slate-400">· {n.troops.toLocaleString()}</span>
                </button>
                {owned && !mine && (
                  <button
                    type="button"
                    disabled={!mayOrder || city.troops <= 2000 || truce}
                    title={truce ? (zh ? '停战之中' : 'A truce is in force') : undefined}
                    onClick={() => onOpenMilitary(n.id, city.id, 'assault')}
                    className="flex items-center gap-1 rounded-md border border-rose-400/50 bg-rose-600/25 hover:bg-rose-600/45 px-2.5 py-1.5 text-[12px] font-semibold text-rose-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    {zh ? '出兵' : 'Attack'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );

  const panels: Record<DistrictId, ReactNode> = {
    hall: hallPanel,
    market: marketPanel,
    fields: fieldsPanel,
    barracks: barracksPanel,
    walls: wallsPanel,
  };

  return (
    <div className="anim-city-in absolute inset-0 z-30 overflow-hidden bg-slate-950">
      <CityStage3D
        spec={spec}
        selected={district}
        insetRight={PANEL_WIDTH + 12}
        labels={labels}
        onSelect={setDistrict}
        onLeave={onExit}
        onFailed={onExit}
      />

      {/* Where you are, and the way back */}
      <div className="absolute left-3 top-3 z-10 flex items-start gap-2">
        <button
          type="button"
          onClick={onExit}
          title={zh ? '回到地图（Esc）' : 'Back to the map (Esc)'}
          className="ink-panel rounded-md px-3 py-2 flex items-center gap-1.5 text-[13px] font-semibold text-amber-100 hover:text-white hover:border-amber-300/60 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          {zh ? '地图' : 'Map'}
        </button>
        <div className="ink-panel rounded-md pl-2.5 pr-3.5 py-2 flex items-center gap-3">
          <Seal char={city.name.zh.slice(0, 2)} size={38} color={ownerColor} />
          <div className="leading-tight">
            <div className="flex items-baseline gap-2">
              <h2 className={`${zh ? 'font-brush text-[24px]' : 'font-display text-[20px] font-bold'} text-slate-50 leading-none`}>
                {city.isCapital && <span className="mr-1 text-amber-400">★</span>}
                {tLoc(city.name, lang)}
              </h2>
              <span className="text-[12px] text-slate-400">
                {tLoc(PROVINCES[city.province].name, lang)} · {tLoc(TERRAIN_TEXT[city.terrain], lang)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[12px] text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ownerColor }} />
                {ownerName}
              </span>
              <span>
                {zh ? '守军' : 'Garrison'}{' '}
                <b className="text-amber-200">
                  {scouted ? city.troops.toLocaleString() : formatScoutedTroops(city.troops, lang)}
                </b>
              </span>
              {(
                [
                  [zh ? '农' : 'Farming', String(city.farming), false],
                  [zh ? '商' : 'Trade', String(city.trade), false],
                  [zh ? '城防' : 'Walls', String(city.defense), false],
                  [zh ? '训练' : 'Drill', scouted ? String(city.drill) : '?', false],
                  [zh ? '民心' : 'Support', scouted ? String(city.support) : '?', scouted && unrest],
                ] as Array<[string, string, boolean]>
              ).map(([label, value, bad]) => (
                <span key={label}>
                  {label} <b className={bad ? 'text-rose-300' : 'text-amber-200'}>{value}</b>
                </span>
              ))}
              {landmark && (
                <button
                  type="button"
                  onClick={() => setDistrict(landmark.district)}
                  title={tLoc(landmark.summary, lang)}
                  className="rounded-sm px-1.5 py-px font-semibold bg-cyan-800/80 hover:bg-cyan-700 text-cyan-100 cursor-pointer"
                >
                  ◆ {tLoc(landmark.name, lang)}
                </button>
              )}
              {scouted && activeSpec && (
                <button
                  type="button"
                  onClick={() => setDistrict(activeSpec.district)}
                  title={tLoc(activeSpec.summary, lang)}
                  className="rounded-sm px-1.5 py-px font-semibold bg-amber-600/85 hover:bg-amber-500 text-slate-950 cursor-pointer"
                >
                  {tLoc(activeSpec.name, lang)}
                </button>
              )}
              {eventText && (
                <button
                  type="button"
                  onClick={() => setDistrict(eventText.district)}
                  className={`rounded-sm px-1.5 py-px font-semibold text-white cursor-pointer ${
                    eventText.good ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-rose-700 hover:bg-rose-600'
                  }`}
                >
                  {zh ? eventText.name.zh : eventText.name.en}
                  {owned && crisisOptions.length > 0 && (zh ? ' · 颁令赈灾' : ' · Resolve')}
                </button>
              )}
            </div>
          </div>
        </div>
        {owned && myCities.length > 1 && (
          <div className="ink-panel rounded-md flex items-stretch overflow-hidden">
            <button
              type="button"
              onClick={() => step(-1)}
              title={zh ? '上一座城' : 'Previous city'}
              aria-label={zh ? '上一座城' : 'Previous city'}
              className="px-2 py-2 text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-1 flex items-center text-[11px] text-slate-400 tabular-nums">
              {myIndex + 1}/{myCities.length}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              title={zh ? '下一座城' : 'Next city'}
              aria-label={zh ? '下一座城' : 'Next city'}
              className="px-2 py-2 text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* The chosen district */}
      {district && (
        <aside
          key={district}
          style={{ width: `min(${PANEL_WIDTH}px, calc(100% - 1.5rem))` }}
          className="anim-sheet-in ink-panel absolute right-3 top-3 bottom-3 z-10 rounded-md flex flex-col min-h-0"
        >
          <header className="flex items-center justify-between gap-2 pl-3 pr-2 py-2.5 border-b border-amber-400/15">
            <div className="flex items-center gap-2.5">
              <Seal char={DISTRICT_NAME[district].seal} size={30} />
              <h3 className={`${zh ? 'font-brush text-[20px]' : 'font-display text-[17px] font-bold'} text-slate-50 leading-none`}>
                {district === 'hall' && city.isCapital
                  ? zh
                    ? '宫城'
                    : 'Palace'
                  : zh
                    ? DISTRICT_NAME[district].zh
                    : DISTRICT_NAME[district].en}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {owned && (
                <span className="text-[11px] text-slate-400">
                  {zh ? '行动力' : 'Orders'}{' '}
                  <b className={orders > 0 ? 'text-amber-200' : 'text-rose-300'}>
                    {orders}/{state.maxActionPoints}
                  </b>
                </span>
              )}
              <button
                type="button"
                onClick={() => setDistrict(null)}
                title={zh ? '收起' : 'Close'}
                aria-label={zh ? '收起' : 'Close'}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-50 hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-4">
            {eventText && city.event && (
              <div
                className={`rounded-md border px-2.5 py-2 text-[12px] leading-snug space-y-2 ${
                  eventText.good
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                    : 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                }`}
              >
                <p>
                  <b>{zh ? eventText.name.zh : eventText.name.en}</b>
                  {zh ? '（' : ' ('}
                  {eventLasts(city.event.seasonsLeft, lang)}
                  {zh ? '）' : '). '}
                  {zh ? eventText.effect.zh : eventText.effect.en}
                </p>
                {owned && onResolveCrisis && crisisOptions.length > 0 && (
                  <div className="space-y-1.5 pt-1.5 border-t border-white/10">
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-200">
                      {zh ? '郡府应急政令（不耗行动力）' : 'Magistrate Crisis Edict (0 orders)'}
                    </div>
                    {crisisOptions.map((opt) => {
                      const canPay =
                        canIssueOrders &&
                        player.gold >= opt.goldCost &&
                        player.food >= opt.foodCost;
                      return (
                        <button
                          key={opt.choice}
                          type="button"
                          disabled={!canPay}
                          onClick={() => onResolveCrisis(city.id, opt.choice)}
                          className="w-full text-left rounded-md bg-slate-950/75 hover:bg-slate-900 border border-amber-400/40 disabled:opacity-45 px-2.5 py-1.5 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <div className="flex items-center justify-between gap-2 font-bold text-slate-50">
                            <span>{tLoc(opt.title, lang)}</span>
                            <span className="text-[11px] text-amber-200 flex items-center gap-1 tabular-nums">
                              {opt.goldCost > 0 && (
                                <>
                                  <Coins className="w-3 h-3" />
                                  {opt.goldCost}
                                </>
                              )}
                              {opt.foodCost > 0 && (
                                <>
                                  <Wheat className="w-3 h-3 ml-0.5" />
                                  {opt.foodCost}
                                </>
                              )}
                              {opt.goldCost === 0 && opt.foodCost === 0 && (
                                <span className="text-rose-300">{zh ? '免耗钱粮' : '0 Cost'}</span>
                              )}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300 mt-0.5">{tLoc(opt.desc, lang)}</div>
                          {opt.discountReason && (
                            <div className="text-[10.5px] text-emerald-300 mt-0.5">
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
            {city.wallScar && district === 'walls' && (
              <p className="rounded-md border border-slate-400/25 bg-white/5 px-2.5 py-2 text-[12px] text-slate-200 leading-snug">
                {zh
                  ? `城墙有缺口未补，约 ${city.wallScar} 季后修复；加固城防可立即修好。`
                  : `The wall is breached and still being patched: about ${city.wallScar} more ${city.wallScar === 1 ? 'season' : 'seasons'}. Strengthening the walls mends it at once.`}
              </p>
            )}
            {!owned && (
              <p className="rounded-md border border-amber-400/20 bg-amber-400/5 px-2.5 py-2 text-[12px] text-amber-100/90 leading-snug">
                {zh
                  ? `此城属${ownerName}，以下为探报所得，不可在此下令。`
                  : `This city is held by ${ownerName}. What follows is what your scouts report; you give no orders here.`}
              </p>
            )}
            {landmark && (district === landmark.district || district === 'hall') && (
              <div className="rounded-md border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-2 text-[12px] space-y-1">
                <div className="font-bold text-cyan-200 flex items-center justify-between">
                  <span>◆ {tLoc(landmark.name, lang)}</span>
                  <span className="text-[10px] uppercase tracking-wider text-cyan-300/80">
                    {zh ? '千古名胜' : 'Landmark'}
                  </span>
                </div>
                <p className="text-slate-200 leading-snug">{tLoc(landmark.summary, lang)}</p>
                <p className="text-[11px] text-slate-400 leading-snug">{tLoc(landmark.lore, lang)}</p>
              </div>
            )}
            {scouted && activeSpec && (district === activeSpec.district || district === 'hall') && (
              <div className="rounded-md border border-amber-400/40 bg-amber-500/12 px-2.5 py-2 text-[12px] space-y-1">
                <div className="font-bold text-amber-200 flex items-center justify-between">
                  <span>{tLoc(activeSpec.name, lang)}</span>
                  <span className="rounded bg-amber-500/25 px-1.5 py-px text-[10px] text-amber-100">
                    {tLoc(activeSpec.seal, lang)}
                  </span>
                </div>
                <p className="text-slate-200 leading-snug">{tLoc(activeSpec.summary, lang)}</p>
                <p className="text-[11px] text-slate-400 leading-snug">{tLoc(activeSpec.lore, lang)}</p>
              </div>
            )}
            {panels[district]}
            {owned && onCharterSpecialty && (
              <Section
                title={
                  zh
                    ? '郡国专署（5选1 · 240金 · 1行动力）'
                    : 'Commandery Specialization (1 of 5 · 240 gold · 1 order)'
                }
              >
                <div className="space-y-1.5">
                  {CITY_SPECIALTY_IDS.filter(
                    (spId) => district === 'hall' || CITY_SPECIALTIES[spId].district === district
                  ).map((spId) => {
                    const def = CITY_SPECIALTIES[spId];
                    const isCurrent = city.specialty === spId;
                    const eligible = canCharterSpecialty(city, spId);
                    const canBuy =
                      mayOrder &&
                      !isCurrent &&
                      eligible &&
                      player.gold >= ACTION_COSTS.specializeGold;
                    return (
                      <button
                        key={spId}
                        type="button"
                        disabled={!canBuy}
                        onClick={() => onCharterSpecialty(city.id, spId)}
                        className={`w-full text-left rounded-md border px-2.5 py-2 text-[12px] transition cursor-pointer disabled:cursor-not-allowed ${
                          isCurrent
                            ? 'border-amber-300 bg-amber-400/15 text-amber-100'
                            : eligible
                              ? 'border-white/15 bg-white/5 hover:border-amber-300/60 text-slate-100 disabled:opacity-45'
                              : 'border-white/10 bg-black/20 text-slate-500 opacity-55'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 font-bold">
                          <span>
                            [{tLoc(def.seal, lang)}] {tLoc(def.name, lang)}
                          </span>
                          <span className="text-[11px] text-amber-200 tabular-nums">
                            {isCurrent
                              ? zh
                                ? '已设此署'
                                : 'Active'
                              : !eligible
                                ? zh
                                  ? `需农+商≥${SPECIALTY_PROSPERITY_MIN}`
                                  : `Need Farm+Trade ≥ ${SPECIALTY_PROSPERITY_MIN}`
                                : `${ACTION_COSTS.specializeGold} ${zh ? '金' : 'gold'}`}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                          {tLoc(def.summary, lang)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}
          </div>
        </aside>
      )}

      <div className="pointer-events-none absolute left-3 bottom-3 z-10 text-[11px] text-slate-200/85 bg-slate-950/75 px-3 py-1 rounded-full border border-amber-400/25">
        {zh
          ? '点选城中一处以理事 · 拖拽转视 · 右键拖拽平移 · 滚轮缩放，拉远至尽头即回地图'
          : 'Click a part of the city to manage it · Drag to turn · Right-drag to move · Scroll to zoom; pull all the way back to return to the map'}
      </div>
    </div>
  );
}
