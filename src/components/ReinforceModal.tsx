import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowRightLeft, Dumbbell, ShieldAlert, UserCheck, Users, X } from 'lucide-react';
import { drillMoraleBonus, mixDrill } from '../game/cityAspects.js';
import { RIVER_LINKS } from '../game/data.js';
import { getCityGenerals } from '../game/engine.js';
import { getCityGovernor } from '../game/governors.js';
import type { GameState, Language } from '../game/types.js';
import { tLoc } from '../i18n/translations.js';
import { HeroAvatar } from './HeroAvatar.js';
import type { OrderRoutePreview } from './MilitaryModal.js';

interface ReinforceModalProps {
  state: GameState;
  lang: Language;
  toCityId: string;
  initialFromCityId?: string;
  onCancel: () => void;
  onExecute: (
    fromCityId: string,
    toCityId: string,
    troops: number,
    escortGeneralIds: string[]
  ) => void;
  onPreviewRoute?: (route: OrderRoutePreview | null) => void;
}

export function ReinforceModal({
  state,
  lang,
  toCityId,
  initialFromCityId,
  onCancel,
  onExecute,
  onPreviewRoute,
}: ReinforceModalProps) {
  const player = state.playerFaction;
  const toCity = state.cities[toCityId];

  const eligibleSources = useMemo(() => {
    if (!toCity) return [];
    return Object.values(state.cities)
      .filter((c) => {
        if (c.id === toCityId || c.owner !== player || c.troops <= 2000) return false;
        if (c.neighbors.includes(toCityId)) return true;
        return RIVER_LINKS.some(
          ([a, b]) => (a === c.id && b === toCityId) || (b === c.id && a === toCityId)
        );
      })
      .sort((a, b) => b.troops - a.troops);
  }, [state.cities, toCity, toCityId, player]);

  const [fromCityId, setFromCityId] = useState<string>(
    (initialFromCityId && eligibleSources.some((c) => c.id === initialFromCityId)
      ? initialFromCityId
      : eligibleSources[0]?.id) || ''
  );

  const fromCity =
    eligibleSources.find((c) => c.id === fromCityId) || eligibleSources[0];

  const maxSend = fromCity ? Math.max(500, fromCity.troops - 1500) : 500;
  const defaultSend = fromCity
    ? Math.min(maxSend, Math.max(500, Math.round((fromCity.troops * 0.4) / 100) * 100))
    : 500;

  const [troops, setTroops] = useState<number>(defaultSend);
  const [escortIds, setEscortIds] = useState<string[]>([]);

  useEffect(() => {
    if (!fromCity) return;
    const nextMax = Math.max(500, fromCity.troops - 1500);
    const nextDefault = Math.min(
      nextMax,
      Math.max(500, Math.round((fromCity.troops * 0.4) / 100) * 100)
    );
    setTroops(nextDefault);
    setEscortIds([]);
  }, [fromCity?.id]);

  useEffect(() => {
    if (fromCity && toCity) {
      onPreviewRoute?.({ fromCityId: fromCity.id, toCityId: toCity.id });
    }
    return () => onPreviewRoute?.(null);
  }, [fromCity?.id, toCity?.id, onPreviewRoute]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (!toCity) return null;

  const clampedTroops = fromCity
    ? Math.min(Math.max(500, Math.round(troops)), Math.max(500, fromCity.troops - 1500))
    : 0;

  const stationedInFrom = fromCity ? getCityGenerals(state, fromCity.id) : [];
  const originGovId = fromCity ? getCityGovernor(state, fromCity.id)?.general.id : undefined;

  const toggleEscort = (id: string) => {
    setEscortIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const blendedDrill = fromCity
    ? mixDrill(toCity.troops, toCity.drill, clampedTroops, fromCity.drill)
    : toCity.drill;
  const oldMorale = drillMoraleBonus(toCity.drill);
  const newMorale = drillMoraleBonus(blendedDrill);
  const leavesOriginUnstaffed =
    stationedInFrom.length > 0 && escortIds.length >= stationedInFrom.length;

  const canConfirm = Boolean(fromCity && state.actionPoints >= 1 && fromCity.troops - 1500 >= 500);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#14110d] border border-[#c9a86a]/40 shadow-2xl overflow-hidden text-[#f5ecd7]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#1a1611]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-[#f5ecd7]">
                {lang === 'zh'
                  ? `调兵增援 · ${toCity.name.zh}`
                  : `Dispatch Reinforcements · ${toCity.name.en}`}
              </h2>
              <p className="text-[11px] text-[#a8a090]">
                {lang === 'zh'
                  ? '消耗 1 点行动力 · 随军武将同批调防不另耗令'
                  : 'Costs 1 Action Point · Escort officers march in the same order'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-[#a8a090] hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {eligibleSources.length === 0 || !fromCity ? (
          <div className="p-6 text-center text-sm text-[#b8b0a0]">
            {lang === 'zh'
              ? '周边的己方城池兵力不足（出发城需至少留守 1,500 兵并派出 500 兵）。'
              : 'No adjacent friendly city has enough spare troops (must keep 1,500 garrison + send at least 500).'}
          </div>
        ) : (
          <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Staging Source Picker */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#c9a86a] mb-1.5">
                {lang === 'zh' ? '出发友城' : 'Staging Friendly City'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {eligibleSources.map((src) => {
                  const selected = src.id === fromCity.id;
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => setFromCityId(src.id)}
                      className={`text-left px-3 py-2 rounded-xl border transition cursor-pointer ${
                        selected
                          ? 'bg-sky-500/20 border-sky-400/60 text-white'
                          : 'bg-white/[0.03] border-white/10 text-[#d6cec0] hover:bg-white/[0.07]'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>{tLoc(src.name, lang)}</span>
                        <span className="text-[10px] text-sky-300 tabular-nums">
                          {lang === 'zh' ? `训练 ${src.drill}` : `Drill ${src.drill}`}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#a8a090] tabular-nums mt-0.5">
                        {lang === 'zh'
                          ? `驻军 ${src.troops.toLocaleString()} · 可派 ${(src.troops - 1500).toLocaleString()}`
                          : `${src.troops.toLocaleString()} men · Max ${(src.troops - 1500).toLocaleString()}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Troop Slider & Presets */}
            <div className="rounded-xl bg-black/30 border border-white/10 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#e6dec8] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-sky-300" />
                  {lang === 'zh' ? '调遣兵力' : 'Column Strength'}
                </span>
                <span className="text-sm font-bold text-sky-300 tabular-nums">
                  {clampedTroops.toLocaleString()} {lang === 'zh' ? '人' : 'men'}
                </span>
              </div>

              <input
                type="range"
                min={500}
                max={maxSend}
                step={100}
                value={clampedTroops}
                onChange={(e) => setTroops(Number(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer"
              />

              <div className="flex items-center justify-between gap-1.5">
                {(
                  [
                    ['25%', 0.25],
                    ['40%', 0.4],
                    ['60%', 0.6],
                    [lang === 'zh' ? '最大' : 'Max', 1],
                  ] as Array<[string, number]>
                ).map(([label, ratio]) => {
                  const targetVal =
                    ratio >= 1
                      ? maxSend
                      : Math.min(
                          maxSend,
                          Math.max(500, Math.round((fromCity.troops * ratio) / 100) * 100)
                        );
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setTroops(targetVal)}
                      className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-white/12 border border-white/10 text-[11px] text-[#d6cec0] font-medium cursor-pointer"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Before -> After Ledger */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-[#1b1712] border border-[#c9a86a]/25 p-3 text-xs">
              <div>
                <div className="text-[11px] text-[#a8a090]">{tLoc(fromCity.name, lang)}</div>
                <div className="font-bold text-[#f5ecd7] tabular-nums mt-0.5">
                  {fromCity.troops.toLocaleString()} → {(fromCity.troops - clampedTroops).toLocaleString()}
                </div>
                <div className="text-[10px] text-[#8f8778]">
                  {lang === 'zh' ? '留守城防驻军' : 'Remaining garrison'}
                </div>
              </div>

              <ArrowRight className="w-4 h-4 text-sky-400 shrink-0" />

              <div className="text-right">
                <div className="text-[11px] text-[#a8a090]">{tLoc(toCity.name, lang)}</div>
                <div className="font-bold text-emerald-300 tabular-nums mt-0.5">
                  {toCity.troops.toLocaleString()} → {(toCity.troops + clampedTroops).toLocaleString()}
                </div>
                <div className="text-[10px] text-rose-200/90 flex items-center justify-end gap-1 tabular-nums">
                  <Dumbbell className="w-2.5 h-2.5 text-rose-300" />
                  <span>
                    {lang === 'zh' ? '训练' : 'Drill'} {toCity.drill} → {blendedDrill}{' '}
                    ({newMorale >= 0 ? `+${newMorale}` : newMorale}
                    {newMorale !== oldMorale ? ` vs ${oldMorale >= 0 ? `+${oldMorale}` : oldMorale}` : ''})
                  </span>
                </div>
              </div>
            </div>

            {/* Optional Escorting Generals */}
            {stationedInFrom.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#c9a86a] flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    {lang === 'zh' ? '随军同行武将（可选 · 0 额外行动力）' : 'Escorting Officers (Optional · +0 AP)'}
                  </span>
                  <span className="text-[10px] text-[#9e9686]">
                    {escortIds.length}/{stationedInFrom.length}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                  {stationedInFrom.map((g) => {
                    const checked = escortIds.includes(g.id);
                    const isGov = g.id === originGovId;
                    return (
                      <label
                        key={g.id}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border cursor-pointer transition ${
                          checked
                            ? 'bg-amber-500/15 border-amber-400/50'
                            : 'bg-white/[0.03] border-white/8 hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEscort(g.id)}
                            className="accent-amber-400 cursor-pointer"
                          />
                          <HeroAvatar hero={g} size="xs" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#f5ecd7] truncate flex items-center gap-1.5">
                              <span>{tLoc(g.name, lang)}</span>
                              {isGov && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                                  {lang === 'zh' ? '现任太守' : 'Governor'}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#a8a090] tabular-nums">
                              {lang === 'zh'
                                ? `统 ${g.command} · 武 ${g.war} · 政 ${g.politics}`
                                : `CMD ${g.command} · WAR ${g.war} · POL ${g.politics}`}
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {leavesOriginUnstaffed && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-lg px-2.5 py-1">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {lang === 'zh'
                        ? `提示：全员调离后，${fromCity.name.zh}将暂无太守主理政务。`
                        : `Note: Moving all officers leaves ${fromCity.name.en} without a governor.`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={onCancel}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-[#d6cec0] cursor-pointer"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={() => onExecute(fromCity.id, toCity.id, clampedTroops, escortIds)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 disabled:opacity-40 text-xs font-bold text-white shadow flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>
                  {lang === 'zh'
                    ? `调兵 ${clampedTroops.toLocaleString()} 人（1 行动力）`
                    : `March ${clampedTroops.toLocaleString()} Men (1 AP)`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
