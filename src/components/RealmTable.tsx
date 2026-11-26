import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Landmark, X } from 'lucide-react';
import { UNREST_SUPPORT } from '../game/cityAspects.js';
import { PROVINCES, PROVINCE_ORDER } from '../game/data.js';
import { getCityGenerals, getFactionCities, getFactionIncomeBreakdown } from '../game/engine.js';
import {
  GOVERNOR_FOCI,
  GOVERNOR_SCORE_CEILING,
  WORKS_PER_LEVEL,
  getAppointedGovernor,
  governorPlanOf,
} from '../game/governors.js';
import type { City, GameState, GovernorFocus, Language } from '../game/types.js';
import { tLoc } from '../i18n/translations.js';
import { cityMarkOf } from './cityEventText.js';
import { FOCUS_TEXT } from './governorText.js';

interface RealmTableProps {
  state: GameState;
  lang: Language;
  /** False while another player holds the turn: the table can be read, not changed. */
  canIssueOrders: boolean;
  onClose: () => void;
  /** Goes into the city's close-up. */
  onOpenCity: (cityId: string) => void;
  onAppointGovernor: (cityId: string, generalId: string | null) => void;
  onSetFocus: (cityId: string, focus: GovernorFocus) => void;
}

type SortKey = 'province' | 'troops' | 'farming' | 'trade' | 'defense' | 'drill' | 'support' | 'income';

/**
 * The whole realm on one sheet: every city the player holds with its five numbers, who governs
 * it and what that governor is working on, so the realm can be run without opening each city.
 */
export function RealmTable({
  state,
  lang,
  canIssueOrders,
  onClose,
  onOpenCity,
  onAppointGovernor,
  onSetFocus,
}: RealmTableProps) {
  const zh = lang === 'zh';
  const [sort, setSort] = useState<SortKey>('province');
  const [ascending, setAscending] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const income = useMemo(() => {
    const rows = getFactionIncomeBreakdown(state, state.playerFaction);
    return new Map(rows.map((row) => [row.cityId, row]));
  }, [state]);

  const cities = useMemo(() => {
    const list = getFactionCities(state, state.playerFaction);
    const value = (c: City): number => {
      if (sort === 'province') return PROVINCE_ORDER.indexOf(c.province) * 1000 + c.x / 10;
      if (sort === 'income') return (income.get(c.id)?.gold ?? 0) + (income.get(c.id)?.food ?? 0);
      return c[sort];
    };
    return list.sort((a, b) => (ascending ? value(a) - value(b) : value(b) - value(a)));
  }, [state, sort, ascending, income]);

  const plans = cities.map((c) => governorPlanOf(state, c.id));
  const leaderless = plans.filter((p) => !p).length;
  const idle = plans.filter((p) => p?.idle).length;
  const restless = cities.filter((c) => c.support < UNREST_SUPPORT).length;

  const head = (key: SortKey, label: string, align = 'text-right') => (
    <th className={`px-2 py-2 font-semibold ${align}`}>
      <button
        type="button"
        onClick={() => {
          if (sort === key) setAscending((v) => !v);
          else {
            setSort(key);
            setAscending(key === 'province');
          }
        }}
        className={`inline-flex items-center gap-1 cursor-pointer hover:text-amber-100 ${
          sort === key ? 'text-amber-200' : ''
        }`}
      >
        {label}
        <ArrowDownUp className={`w-3 h-3 ${sort === key ? 'opacity-100' : 'opacity-30'}`} />
      </button>
    </th>
  );

  const level = (n: number) => (
    <td className="px-2 py-1.5 text-right tabular-nums">
      <span className={n >= 5 ? 'text-amber-200 font-semibold' : 'text-slate-100'}>{n}</span>
      <span className="text-slate-500">/5</span>
    </td>
  );

  const selectClass =
    'rounded-md border border-white/15 bg-slate-950/70 px-1.5 py-1 text-[12px] text-slate-100 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={zh ? '治所总览' : 'Realm table'}
        onClick={(e) => e.stopPropagation()}
        className="ink-panel gold-border-glow rounded-xl w-full max-w-7xl max-h-full flex flex-col min-h-0"
      >
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-white/10">
          <div className="min-w-0">
            <h2
              className={`${zh ? 'font-brush text-[24px]' : 'font-display text-[19px] font-bold'} text-slate-50 leading-none flex items-center gap-2`}
            >
              <Landmark className="w-4.5 h-4.5 text-amber-400" />
              {zh ? '治所总览' : 'Realm table'}
            </h2>
            <p className="mt-1.5 text-[12px] text-slate-300 leading-snug">
              {zh
                ? `${cities.length} 城。太守每季自行推进一项政务，不耗行动力；任免与指派亦不耗行动力。`
                : `${cities.length} cities. Each season every governor moves one thing forward at no order cost. Appointing them and telling them what to work on costs no order either.`}
            </p>
            {(leaderless > 0 || idle > 0 || restless > 0) && (
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-rose-300">
                {leaderless > 0 && (
                  <span>{zh ? `${leaderless} 城无将主政` : `${leaderless} with no general to govern`}</span>
                )}
                {idle > 0 && <span>{zh ? `${idle} 位太守无事可做` : `${idle} with a governor who has nothing to do`}</span>}
                {restless > 0 && <span>{zh ? `${restless} 城民心动荡` : `${restless} in unrest`}</span>}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            title={zh ? '关闭（Esc）' : 'Close (Esc)'}
            aria-label={zh ? '关闭' : 'Close'}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-50 hover:bg-white/5 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full min-w-[1040px] border-collapse text-[13px] whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-[#14110d] text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                {head('province', zh ? '城池' : 'City', 'text-left')}
                {head('troops', zh ? '守军' : 'Garrison')}
                {head('income', zh ? '每季金 / 粮' : 'Gold / grain')}
                {head('farming', zh ? '农' : 'Farming')}
                {head('trade', zh ? '商' : 'Trade')}
                {head('defense', zh ? '城防' : 'Walls')}
                {head('drill', zh ? '训练' : 'Drill')}
                {head('support', zh ? '民心' : 'Support')}
                <th className="px-2 py-2 font-semibold text-left">{zh ? '太守' : 'Governor'}</th>
                <th className="px-2 py-2 font-semibold text-left">{zh ? '所务' : 'Working on'}</th>
                <th className="px-2 py-2 font-semibold text-left">{zh ? '进度' : 'Progress'}</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((city, i) => {
                const plan = plans[i];
                const generals = getCityGenerals(state, city.id);
                const appointed = getAppointedGovernor(state, city.id);
                const row = income.get(city.id);
                const unrest = city.support < UNREST_SUPPORT;
                const mark = cityMarkOf(city, lang);
                return (
                  <tr key={city.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenCity(city.id)}
                        title={zh ? '入城' : 'Enter the city'}
                        className="text-left cursor-pointer hover:underline"
                      >
                        <span className="font-bold text-slate-50">
                          {city.isCapital && <span className="mr-1 text-amber-400">★</span>}
                          {tLoc(city.name, lang)}
                        </span>
                        <span className="ml-1.5 text-[11px] text-slate-400">
                          {tLoc(PROVINCES[city.province].name, lang)}
                        </span>
                      </button>
                      {mark && (
                        <span
                          title={mark.title}
                          className={`ml-1.5 inline-flex items-center gap-1 rounded-sm px-1 py-px text-[11px] font-semibold text-white ${
                            mark.good ? 'bg-emerald-700' : 'bg-rose-700'
                          }`}
                        >
                          {mark.seal}
                          {!zh && <span className="font-normal">{mark.title.split(' · ')[0]}</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-100">
                      {city.troops.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                      {row ? `${row.gold} / ${row.food}` : ''}
                    </td>
                    {level(city.farming)}
                    {level(city.trade)}
                    {level(city.defense)}
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-100">{city.drill}</td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${
                        unrest ? 'text-rose-300 font-semibold' : 'text-slate-100'
                      }`}
                    >
                      {city.support}
                    </td>
                    <td className="px-2 py-1.5">
                      {generals.length === 0 ? (
                        <span className="text-[12px] text-rose-300">{zh ? '城中无将' : 'No general here'}</span>
                      ) : (
                        <select
                          aria-label={zh ? `${city.name.zh}太守` : `Governor of ${city.name.en}`}
                          className={`${selectClass} w-40`}
                          disabled={!canIssueOrders}
                          value={appointed?.id ?? ''}
                          onChange={(e) => onAppointGovernor(city.id, e.target.value || null)}
                        >
                          <option value="">
                            {plan
                              ? zh
                                ? `${tLoc(plan.general.name, lang)}（暂摄）`
                                : `${tLoc(plan.general.name, lang)} (acting)`
                              : zh
                                ? '暂摄'
                                : 'Acting'}
                          </option>
                          {generals.map((g) => (
                            <option key={g.id} value={g.id}>
                              {zh
                                ? `${tLoc(g.name, lang)} · 政${g.politics} 统${g.command} 魅${g.charisma}`
                                : `${tLoc(g.name, lang)} · Rule ${g.politics}, Lead ${g.command}, Charm ${g.charisma}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {plan && (
                        <select
                          aria-label={zh ? `${city.name.zh}太守所务` : `What the governor of ${city.name.en} works on`}
                          className={`${selectClass} w-[8.5rem]`}
                          disabled={!canIssueOrders}
                          value={city.focus ?? 'auto'}
                          onChange={(e) => onSetFocus(city.id, e.target.value as GovernorFocus)}
                        >
                          {GOVERNOR_FOCI.map((f) => (
                            <option key={f} value={f}>
                              {zh ? FOCUS_TEXT[f].zh : FOCUS_TEXT[f].en}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-1.5 min-w-[150px] text-[12px]">
                      {plan && (
                        <span className="mr-2 font-semibold text-slate-100">
                          {zh ? FOCUS_TEXT[plan.task].zh : FOCUS_TEXT[plan.task].en}
                        </span>
                      )}
                      {!plan ? (
                        <span className="text-slate-500">{zh ? '诸事停滞' : 'Nothing goes forward'}</span>
                      ) : plan.task === 'drill' || plan.task === 'relief' ? (
                        plan.idle ? (
                          <span className="text-slate-400">
                            {zh ? `维持于 ${GOVERNOR_SCORE_CEILING}` : `Held at ${GOVERNOR_SCORE_CEILING}`}
                          </span>
                        ) : (
                          <span className="text-slate-300">
                            {zh
                              ? `每季 +${plan.rate}，${plan.seasonsLeft} 季至 ${GOVERNOR_SCORE_CEILING}`
                              : `+${plan.rate} a season, ${GOVERNOR_SCORE_CEILING} in ${plan.seasonsLeft}`}
                          </span>
                        )
                      ) : plan.idle ? (
                        <span className="text-rose-300">{zh ? '已满级，无事可做' : 'At the top level: nothing to do'}</span>
                      ) : (
                        <span className="inline-flex items-center gap-2 align-middle">
                          <span className="h-1.5 w-14 shrink-0 rounded-full bg-white/10 overflow-hidden">
                            <span
                              className="block h-full rounded-full bg-amber-400"
                              style={{ width: `${(plan.works / WORKS_PER_LEVEL) * 100}%` }}
                            />
                          </span>
                          <span className="text-slate-300 tabular-nums">
                            {zh
                              ? `${plan.works}/${WORKS_PER_LEVEL} · 余 ${plan.seasonsLeft} 季`
                              : `${plan.works}/${WORKS_PER_LEVEL} · ${plan.seasonsLeft} ${plan.seasonsLeft === 1 ? 'season' : 'seasons'}`}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
