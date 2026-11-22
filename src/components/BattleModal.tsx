import { useState } from 'react';
import { Flame, ShieldAlert, Swords, Trophy, X } from 'lucide-react';
import { TACTICS } from '../game/data.js';
import { getFactionGenerals } from '../game/engine.js';
import type { BattleReport, GameState, Language, TacticId } from '../game/types.js';
import { TERRAIN_TEXT, UI_TEXT, tLoc } from '../i18n/translations.js';

interface AttackSetupModalProps {
  state: GameState;
  lang: Language;
  fromCityId: string;
  toCityId: string;
  onCancel: () => void;
  onLaunch: (troops: number, tactic: TacticId, generalId?: string) => void;
}

export function AttackSetupModal({
  state,
  lang,
  fromCityId,
  toCityId,
  onCancel,
  onLaunch,
}: AttackSetupModalProps) {
  const fromCity = state.cities[fromCityId];
  const toCity = state.cities[toCityId];
  const maxTroops = Math.max(1000, fromCity.troops - 1000);
  const [troops, setTroops] = useState(Math.round(maxTroops * 0.72));
  const [tactic, setTactic] = useState<TacticId>(
    toCity.terrain === 'river'
      ? 'fire'
      : toCity.terrain === 'mountain'
        ? 'ambush'
        : toCity.defense >= 4
          ? 'siege'
          : 'assault'
  );

  const factionGenerals = getFactionGenerals(state, state.playerFaction);
  const localGeneral = factionGenerals.find((g) => g.cityId === fromCityId);
  const [generalId, setGeneralId] = useState<string>(localGeneral?.id || factionGenerals[0]?.id || '');

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-lg w-full p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-[#c84b31]" />
            <h2 className="font-display text-xl font-bold text-[#f7efe0]">
              {tLoc(UI_TEXT.battleSetupTitle, lang)}
            </h2>
          </div>
          <button onClick={onCancel} className="text-[#9ea3ae] hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Route Banner */}
        <div className="flex items-center justify-between rounded-xl bg-[#0d1015]/85 border border-white/10 px-4 py-3 text-sm">
          <div>
            <div className="text-[11px] text-[#9ea3ae]">{lang === 'zh' ? '出发地' : 'Origin'}</div>
            <div className="font-bold text-[#f7efe0]">{tLoc(fromCity.name, lang)}</div>
            <div className="text-xs text-emerald-400">
              {fromCity.troops.toLocaleString()} {tLoc(UI_TEXT.troops, lang)}
            </div>
          </div>
          <div className="text-[#c84b31] font-bold text-lg">→</div>
          <div className="text-right">
            <div className="text-[11px] text-[#9ea3ae]">
              {tLoc(TERRAIN_TEXT[toCity.terrain], lang)} · Def Lv.{toCity.defense}
            </div>
            <div className="font-bold text-[#f7efe0]">{tLoc(toCity.name, lang)}</div>
            <div className="text-xs text-rose-400">
              {toCity.troops.toLocaleString()} {tLoc(UI_TEXT.garrison, lang)}
            </div>
          </div>
        </div>

        {/* Lead General */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#d4a853] mb-1.5">
            {tLoc(UI_TEXT.leadGeneral, lang)}
          </label>
          <select
            value={generalId}
            onChange={(e) => setGeneralId(e.target.value)}
            className="w-full rounded-xl bg-[#0d1015] border border-white/15 px-3 py-2.5 text-sm text-[#f5ecd7] focus:outline-none focus:border-[#d4a853]"
          >
            <option value="">{tLoc(UI_TEXT.noGeneralOption, lang)}</option>
            {factionGenerals.map((g) => (
              <option key={g.id} value={g.id}>
                {tLoc(g.name, lang)} ({lang === 'zh' ? '武' : 'W'}:{g.war} /{' '}
                {lang === 'zh' ? '智' : 'I'}:{g.intellect} / {lang === 'zh' ? '统' : 'C'}:
                {g.command}) — {tLoc(TACTICS[g.specialty].name, lang)}
              </option>
            ))}
          </select>
        </div>

        {/* Tactic Selector */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#d4a853] mb-1.5">
            {tLoc(UI_TEXT.selectTactic, lang)}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TACTICS) as TacticId[]).map((tid) => {
              const info = TACTICS[tid];
              const active = tactic === tid;
              return (
                <button
                  key={tid}
                  type="button"
                  onClick={() => setTactic(tid)}
                  className={`text-left p-2.5 rounded-xl border transition cursor-pointer ${
                    active
                      ? 'bg-[#d4a853]/15 border-[#d4a853] text-[#f7efe0]'
                      : 'bg-[#0d1015]/70 border-white/10 text-[#b8b2a2] hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>{tLoc(info.name, lang)}</span>
                  </div>
                  <p className="text-[11px] text-[#9ea3ae] mt-1 leading-snug">
                    {tLoc(info.desc, lang)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Troops Slider */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-wider text-[#d4a853]">
              {tLoc(UI_TEXT.deployTroops, lang)}
            </span>
            <span className="font-bold text-base text-[#f7efe0]">
              {troops.toLocaleString()}{' '}
              <span className="text-xs text-[#9ea3ae] font-normal">
                / {maxTroops.toLocaleString()}
              </span>
            </span>
          </div>
          <input
            type="range"
            min={Math.min(1000, maxTroops)}
            max={maxTroops}
            step={250}
            value={troops}
            onChange={(e) => setTroops(Number(e.target.value))}
            className="w-full accent-[#c84b31] cursor-pointer"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#cfc7b4] transition cursor-pointer"
          >
            {tLoc(UI_TEXT.cancel, lang)}
          </button>
          <button
            onClick={() => onLaunch(troops, tactic, generalId || undefined)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#c84b31] to-[#a83620] hover:from-[#da573c] hover:to-[#bc3f27] text-xs sm:text-sm font-bold text-white flex items-center gap-2 shadow-lg cursor-pointer"
          >
            <Swords className="w-4 h-4" />
            <span>{tLoc(UI_TEXT.launchAttack, lang)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface BattleReportModalProps {
  report: BattleReport;
  state: GameState;
  lang: Language;
  onClose: () => void;
}

export function BattleReportModal({ report, state, lang, onClose }: BattleReportModalProps) {
  const toCity = state.cities[report.toCityId];
  const atkFaction = state.factions[report.attackerFaction];
  const defName =
    report.defenderFaction === 'neutral'
      ? tLoc(UI_TEXT.neutralOwner, lang)
      : tLoc(state.factions[report.defenderFaction].name, lang);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="text-center space-y-2">
          <div
            className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center ${
              report.captured
                ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300'
                : 'bg-rose-500/20 border border-rose-400/50 text-rose-300'
            }`}
          >
            {report.captured ? <Trophy className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
          </div>
          <h3 className="font-display text-2xl font-bold text-[#f7efe0]">
            {report.captured
              ? tLoc(UI_TEXT.battleVictory, lang)
              : tLoc(UI_TEXT.battleRepelled, lang)}
          </h3>
          <p className="text-xs text-[#d4a853]">
            {tLoc(toCity.name, lang)} · {tLoc(TACTICS[report.tactic].name, lang)}
          </p>
        </div>

        <p className="text-sm text-[#e3dccb] leading-relaxed bg-[#0d1015]/80 border border-white/10 rounded-xl p-3.5">
          {tLoc(report.narrative, lang)}
        </p>

        <div className="grid grid-cols-2 gap-3 text-center text-xs">
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
            <div className="text-[#9ea3ae]">{tLoc(atkFaction.shortName, lang)}</div>
            <div className="text-sm font-bold text-[#f7efe0] mt-0.5">
              {report.attackerStartTroops.toLocaleString()}
            </div>
            <div className="text-rose-400 mt-0.5">
              -{report.attackerLosses.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
            <div className="text-[#9ea3ae]">{defName}</div>
            <div className="text-sm font-bold text-[#f7efe0] mt-0.5">
              {report.defenderStartTroops.toLocaleString()}
            </div>
            <div className="text-rose-400 mt-0.5">
              -{report.defenderLosses.toLocaleString()}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[#d4a853] hover:bg-[#e1b866] text-[#11151d] font-bold text-sm transition cursor-pointer"
        >
          {tLoc(UI_TEXT.close, lang)}
        </button>
      </div>
    </div>
  );
}
