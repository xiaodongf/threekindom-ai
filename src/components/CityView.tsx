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
import { ACTION_COSTS, PROVINCES } from '../game/data.js';
import {
  factionHasTech,
  getCityGenerals,
  getCityWanderingHeroes,
  getEligibleStagingCities,
  getFactionCities,
  getFactionIncomeBreakdown,
  isTruceActive,
  isYangtzePort,
} from '../game/engine.js';
import {
  GATE_BASE_HP,
  GATE_HP_PER_DEFENSE,
  RAMPART_BASE_DEF,
  RAMPART_DEF_PER_LEVEL,
} from '../game/tacticalEngine.js';
import type { City, GameState, Language, MilitaryActionType, Season } from '../game/types.js';
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
  onDevelop: (cityId: string) => void;
  onFortify: (cityId: string) => void;
  onRecruit: (cityId: string) => void;
  onReinforce: (fromCityId: string, toCityId: string) => void;
  onOpenMilitary: (targetCityId: string, fromCityId?: string, action?: MilitaryActionType) => void;
  onInspectHero: (heroId: string) => void;
  onRecruitWanderingHero: (heroId: string) => void;
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
  onDevelop,
  onFortify,
  onRecruit,
  onReinforce,
  onOpenMilitary,
  onInspectHero,
  onRecruitWanderingHero,
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
  const spec = useMemo(
    () =>
      city
        ? citySpecOf(
            city,
            season,
            city.terrain === 'river' || isYangtzePort(city.id),
            look === 'myth'
          )
        : null,
    [city, season, look]
  );

  if (!city || !spec) return null;

  const owned = city.owner === state.playerFaction;
  const player = state.factions[state.playerFaction];
  const orders = state.actionPoints;
  const mayOrder = canIssueOrders && owned && orders > 0;
  const generals = getCityGenerals(state, city.id);
  const wandering = getCityWanderingHeroes(state, city.id);
  const governor = [...generals].sort((a, b) => b.politics - a.politics)[0];
  const income =
    city.owner === 'neutral'
      ? null
      : getFactionIncomeBreakdown(state, city.owner).find((row) => row.cityId === city.id) ?? null;
  // What one more level of prosperity would bring, worked out by the same rule the season uses
  const richer =
    city.owner === 'neutral' || city.development >= 5
      ? null
      : getFactionIncomeBreakdown(
          { ...state, cities: { ...state.cities, [city.id]: { ...city, development: city.development + 1 } } },
          city.owner
        ).find((row) => row.cityId === city.id) ?? null;
  const upkeep = Math.round(city.troops * 0.008);

  const recruitGold =
    state.playerFaction === 'wei' ? Math.round(ACTION_COSTS.recruitGold * 0.85) : ACTION_COSTS.recruitGold;
  const bestCharisma = generals.reduce((max, g) => Math.max(max, g.charisma), 60);
  const levy =
    ACTION_COSTS.recruitTroops + city.development * 350 + Math.round(Math.max(0, bestCharisma - 60) * 18);

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

  const labels: Record<DistrictId, DistrictLabel> = {
    hall: {
      seal: DISTRICT_NAME.hall.seal,
      title: city.isCapital ? (zh ? '宫城' : 'Palace') : zh ? DISTRICT_NAME.hall.zh : 'Hall',
      value: governor ? tLoc(governor.name, lang) : zh ? '无人主政' : 'No governor',
    },
    market: {
      seal: DISTRICT_NAME.market.seal,
      title: zh ? DISTRICT_NAME.market.zh : DISTRICT_NAME.market.en,
      value: income ? `+${gold(income.gold)}` : zh ? `繁荣 ${city.development} 级` : `Prosperity ${city.development}`,
    },
    fields: {
      seal: DISTRICT_NAME.fields.seal,
      title: zh ? DISTRICT_NAME.fields.zh : DISTRICT_NAME.fields.en,
      value: income ? `+${grain(income.food)}` : zh ? `繁荣 ${city.development} 级` : `Prosperity ${city.development}`,
    },
    barracks: {
      seal: DISTRICT_NAME.barracks.seal,
      title: zh ? DISTRICT_NAME.barracks.zh : DISTRICT_NAME.barracks.en,
      value: zh ? `${city.troops.toLocaleString()} 人` : `${city.troops.toLocaleString()} men`,
    },
    walls: {
      seal: DISTRICT_NAME.walls.seal,
      title: zh ? DISTRICT_NAME.walls.zh : 'Walls',
      value: zh ? `城防 ${city.defense} 级` : `Level ${city.defense}`,
    },
  };

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
  const developBlock = blocked(ACTION_COSTS.developGold, 0, city.development >= 5);
  const fortifyBlock = blocked(ACTION_COSTS.fortifyGold, 0, city.defense >= 5);
  const recruitBlock = blocked(recruitGold, ACTION_COSTS.recruitFood);

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
      <Coins className="w-3.5 h-3.5" />
      {g}
      {f > 0 && (
        <>
          <Wheat className="w-3.5 h-3.5 ml-1" />
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
          <span className="block text-[11px] text-slate-400 truncate">
            {zh
              ? `武${g.war} 智${g.intellect} 统${g.command} 政${g.politics} 魅${g.charisma}`
              : `War ${g.war} · Mind ${g.intellect} · Lead ${g.command} · Rule ${g.politics}`}
          </span>
        </span>
      </button>
      {extra}
    </div>
  );

  const developOrder = order(
    zh ? '兴修内政' : 'Develop the city',
    costOf(ACTION_COSTS.developGold),
    developBlock,
    () => onDevelop(city.id),
    richer && income
      ? zh
        ? `繁荣升至 ${city.development + 1} 级：每季多得 ${richer.gold - income.gold} 金、${richer.food - income.food} 粮，每次募兵多 350 人。`
        : `Prosperity ${city.development + 1}: ${richer.gold - income.gold} more gold and ${richer.food - income.food} more grain a season, and 350 more men from each levy.`
      : undefined
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
      <Section title={zh ? '主政' : 'Who governs'}>
        {governor ? (
          <>
            {heroRow(governor)}
            <p className="text-[12px] text-slate-300 leading-snug">
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
            {zh ? '城中无将，无人主持政务。' : 'No general is stationed here, so no one runs the city.'}
          </p>
        )}
      </Section>
      {generals.length > 1 && (
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

  const prosperityBlock = (
    <div className="space-y-1.5">
      <Row label={zh ? '繁荣' : 'Prosperity'}>{zh ? `${city.development} / 5 级` : `Level ${city.development} of 5`}</Row>
      <LevelBar level={city.development} tone="bg-amber-400" />
    </div>
  );

  const marketPanel = (
    <>
      <Section title={zh ? '商税' : 'Trade'}>
        {prosperityBlock}
        {income && <Row label={zh ? '每季金入' : 'Gold a season'}>{gold(income.gold)}</Row>}
        <p className="text-[12px] text-slate-400 leading-snug">
          {zh
            ? '市集越盛，摊肆越密；繁荣同时充实金与粮。'
            : 'The busier the market, the more stalls fill the square. Prosperity feeds both gold and grain.'}
        </p>
      </Section>
      {owned && <Section title={zh ? '下令' : 'Order'}>{developOrder}</Section>}
    </>
  );

  const fieldsPanel = (
    <>
      <Section title={zh ? '田赋' : 'Harvest'}>
        {prosperityBlock}
        {income && <Row label={zh ? '每季粮入' : 'Grain a season'}>{grain(income.food)}</Row>}
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
      {owned && <Section title={zh ? '下令' : 'Order'}>{developOrder}</Section>}
    </>
  );

  const ownNeighbours = city.neighbors.map((id) => state.cities[id]).filter((c): c is City => Boolean(c));
  const barracksPanel = (
    <>
      <Section title={zh ? '守军' : 'Garrison'}>
        <Row label={zh ? '兵力' : 'Under arms'}>{city.troops.toLocaleString()}</Row>
        <Row label={zh ? '耗粮' : 'Eats'}>{`${grain(upkeep)} ${perSeason}`}</Row>
        <Row label={zh ? '统兵' : 'Commanders'}>
          {generals.length > 0 ? generals.map((g) => tLoc(g.name, lang)).join(zh ? '、' : ', ') : zh ? '无' : 'None'}
        </Row>
      </Section>
      {owned && (
        <>
          <Section title={zh ? '下令' : 'Order'}>
            {order(
              zh ? '募兵' : 'Raise a levy',
              costOf(recruitGold, ACTION_COSTS.recruitFood),
              recruitBlock,
              () => onRecruit(city.id),
              zh
                ? `可得 ${levy.toLocaleString()} 人（城越繁荣、守将魅力越高，应募越多）。`
                : `Brings ${levy.toLocaleString()} men. A richer city and a well-loved general bring more.`
            )}
          </Section>
          {ownNeighbours.some((n) => n.owner === state.playerFaction) && (
            <Section title={zh ? '分兵增援（调四成守军）' : 'Send two fifths of the garrison'}>
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
                        disabled={!mayOrder || city.troops <= 2500}
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

  const wallsPanel = (
    <>
      <Section title={zh ? '城防' : 'Defences'}>
        <div className="space-y-1.5">
          <Row label={zh ? '城防' : 'Walls'}>{zh ? `${city.defense} / 5 级` : `Level ${city.defense} of 5`}</Row>
          <LevelBar level={city.defense} tone="bg-sky-400" />
        </div>
        <Row label={zh ? '城门坚固' : 'Gate strength'}>
          {(GATE_BASE_HP + city.defense * GATE_HP_PER_DEFENSE).toLocaleString()}
        </Row>
        <Row label={zh ? '守军据墙之利' : 'Cover for the defenders'}>
          {Math.round((RAMPART_BASE_DEF + RAMPART_DEF_PER_LEVEL * city.defense) * 100)}%
        </Row>
      </Section>
      {owned && (
        <Section title={zh ? '下令' : 'Order'}>
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
                {zh ? '守军' : 'Garrison'} <b className="text-amber-200">{city.troops.toLocaleString()}</b>
              </span>
              <span>
                {zh ? '繁荣' : 'Prosperity'} <b className="text-amber-200">{city.development}</b>
              </span>
              <span>
                {zh ? '城防' : 'Walls'} <b className="text-amber-200">{city.defense}</b>
              </span>
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
            {!owned && (
              <p className="rounded-md border border-amber-400/20 bg-amber-400/5 px-2.5 py-2 text-[12px] text-amber-100/90 leading-snug">
                {zh
                  ? `此城属${ownerName}，以下为探报所得，不可在此下令。`
                  : `This city is held by ${ownerName}. What follows is what your scouts report; you give no orders here.`}
              </p>
            )}
            {panels[district]}
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
