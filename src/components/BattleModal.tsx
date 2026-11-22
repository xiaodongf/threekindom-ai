import { useState } from 'react';
import {
  Coins,
  Eye,
  Flame,
  Heart,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Swords,
  Trophy,
  X,
} from 'lucide-react';
import { TACTICS } from '../game/data.js';
import {
  canSeeHeroWeakness,
  getActiveBondsForHeroes,
  getCityGenerals,
  getFactionGenerals,
} from '../game/engine.js';
import type { BattleReport, GameState, Language, TacticId } from '../game/types.js';
import { TERRAIN_TEXT, UI_TEXT, tLoc } from '../i18n/translations.js';
import { HeroAvatar } from './HeroAvatar.js';

export interface LaunchCampaignPayload {
  troops: number;
  tactic: TacticId;
  generalId?: string;
  deputyId?: string;
  useSignatureSkill: boolean;
  startDuel: boolean;
  defenderHeroId?: string;
}

interface AttackSetupModalProps {
  state: GameState;
  lang: Language;
  fromCityId: string;
  toCityId: string;
  onCancel: () => void;
  onLaunch: (payload: LaunchCampaignPayload) => void;
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

  const stationedActive = getCityGenerals(state, fromCityId);
  const allActiveFactionHeroes = getFactionGenerals(state, state.playerFaction).filter(
    (g) => g.status === 'active'
  );
  const availableHeroes = stationedActive.length > 0 ? stationedActive : allActiveFactionHeroes;

  const [generalId, setGeneralId] = useState<string>(availableHeroes[0]?.id || '');
  const [deputyId, setDeputyId] = useState<string>(availableHeroes[1]?.id || '');
  const [useSkill, setUseSkill] = useState<boolean>(true);

  const leadHero = generalId ? state.generals[generalId] : undefined;
  const deputyHero = deputyId && deputyId !== generalId ? state.generals[deputyId] : undefined;
  const defendingHeroes = getCityGenerals(state, toCityId).sort(
    (a, b) => b.war + b.command - (a.war + a.command)
  );
  const defenderHero = defendingHeroes[0];

  const activeBonds = getActiveBondsForHeroes(
    [leadHero?.id, deputyHero?.id].filter(Boolean) as string[]
  );
  const canSeeFlaw = canSeeHeroWeakness(state);
  const canUseSkill = Boolean(leadHero && leadHero.skillCooldown === 0);
  const canChallengeDuel = Boolean(leadHero && defenderHero);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-xl w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
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

        {/* Route & Enemy Defender Preview */}
        <div className="flex items-center justify-between rounded-xl bg-[#0d1015]/85 border border-white/10 px-4 py-3 text-sm">
          <div>
            <div className="text-[11px] text-[#9ea3ae]">{lang === 'zh' ? '出发地' : 'Origin'}</div>
            <div className="font-bold text-[#f7efe0]">{tLoc(fromCity.name, lang)}</div>
            <div className="text-xs text-emerald-400">
              {fromCity.troops.toLocaleString()} {tLoc(UI_TEXT.troops, lang)}
            </div>
          </div>
          <div className="text-[#c84b31] font-bold text-lg">→</div>
          <div className="flex items-center gap-2.5 text-right">
            <div>
              <div className="text-[11px] text-[#9ea3ae]">
                {tLoc(TERRAIN_TEXT[toCity.terrain], lang)} · Def Lv.{toCity.defense}
              </div>
              <div className="font-bold text-[#f7efe0]">{tLoc(toCity.name, lang)}</div>
              <div className="text-xs text-rose-400">
                {toCity.troops.toLocaleString()} {tLoc(UI_TEXT.garrison, lang)}
              </div>
            </div>
            {defenderHero && <HeroAvatar hero={defenderHero} size="sm" showLevel />}
          </div>
        </div>

        {/* Chrono-Insight Enemy Flaw Hint */}
        {defenderHero && (
          <div className="rounded-xl bg-sky-950/35 border border-sky-400/30 px-3 py-2 text-[11px] flex items-center gap-2">
            <Eye className="w-4 h-4 text-sky-300 shrink-0" />
            <div className="text-sky-100">
              <span className="font-bold text-sky-300">
                {lang === 'zh' ? `敌方守将 ${defenderHero.name.zh}：` : `Defender ${defenderHero.name.en}: `}
              </span>
              {canSeeFlaw
                ? lang === 'zh'
                  ? `史书软肋怕「${TACTICS[defenderHero.dossier.weakToTactic].name.zh}」计策（可触发先知破招）`
                  : `Vulnerable to ${TACTICS[defenderHero.dossier.weakToTactic].name.en} (Chrono-Insight active!)`
                : lang === 'zh'
                  ? '历史偏移 ≥60% 导致敌将弱点成谜（需【光学望远镜】恢复刺探）'
                  : 'Timeline Shattered — enemy flaw hidden until Spyglasses unlocked!'}
            </div>
          </div>
        )}

        {/* Lead Hero + Deputy Hero Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#d4a853] mb-1">
              {tLoc(UI_TEXT.leadGeneral, lang)}
            </label>
            <select
              value={generalId}
              onChange={(e) => setGeneralId(e.target.value)}
              className="w-full rounded-xl bg-[#0d1015] border border-white/15 px-2.5 py-2 text-xs text-[#f5ecd7]"
            >
              <option value="">{tLoc(UI_TEXT.noGeneralOption, lang)}</option>
              {availableHeroes.map((g) => (
                <option key={g.id} value={g.id}>
                  {tLoc(g.name, lang)} ({lang === 'zh' ? '武' : 'W'}{g.war}/{lang === 'zh' ? '智' : 'I'}{g.intellect})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#cfc7b4] mb-1">
              {lang === 'zh' ? '副将（激活羁绊）' : 'Deputy Hero (Bonds)'}
            </label>
            <select
              value={deputyId}
              onChange={(e) => setDeputyId(e.target.value)}
              className="w-full rounded-xl bg-[#0d1015] border border-white/15 px-2.5 py-2 text-xs text-[#f5ecd7]"
            >
              <option value="">{lang === 'zh' ? '无副将' : 'No Deputy'}</option>
              {availableHeroes
                .filter((g) => g.id !== generalId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {tLoc(g.name, lang)} ({lang === 'zh' ? '武' : 'W'}{g.war}/{lang === 'zh' ? '智' : 'I'}{g.intellect})
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Selected Heroes Preview + Signature Skill Toggle + Bonds */}
        {leadHero && (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <HeroAvatar hero={leadHero} size="sm" showLevel />
                {deputyHero && <HeroAvatar hero={deputyHero} size="sm" showLevel />}
                <div>
                  <div className="text-xs font-bold text-[#f7efe0]">
                    {tLoc(leadHero.name, lang)}
                    {deputyHero ? ` + ${tLoc(deputyHero.name, lang)}` : ''}
                  </div>
                  <div className="text-[11px] text-[#d4a853]">
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
                  className="accent-[#d4a853]"
                />
                <span className={canUseSkill ? 'text-amber-300 font-semibold' : 'text-[#6f7787]'}>
                  {canUseSkill
                    ? lang === 'zh'
                      ? '发动绝技'
                      : 'Trigger Skill'
                    : lang === 'zh'
                      ? `冷却 (${leadHero.skillCooldown}季)`
                      : `CD (${leadHero.skillCooldown}t)`}
                </span>
              </label>
            </div>

            {activeBonds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
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

        {/* Tactic Selector */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#d4a853] mb-1.5">
            {tLoc(UI_TEXT.selectTactic, lang)}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TACTICS) as TacticId[]).map((tid) => {
              const info = TACTICS[tid];
              const active = tactic === tid;
              const isFlawMatch =
                Boolean(defenderHero && canSeeFlaw && defenderHero.dossier.weakToTactic === tid);
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
                  <div className="flex items-center justify-between gap-1 text-xs font-bold">
                    <span className="flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      {tLoc(info.name, lang)}
                    </span>
                    {isFlawMatch && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/25 text-sky-200">
                        {lang === 'zh' ? '克制软肋' : 'Counter!'}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#9ea3ae] mt-0.5 leading-snug">
                    {tLoc(info.desc, lang)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Troops Slider */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
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

        {/* Action Buttons: Direct Assault OR Challenge to Duel */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#cfc7b4] cursor-pointer"
          >
            {tLoc(UI_TEXT.cancel, lang)}
          </button>

          {canChallengeDuel && defenderHero && (
            <button
              onClick={() =>
                onLaunch({
                  troops,
                  tactic,
                  generalId: leadHero?.id,
                  deputyId: deputyHero?.id,
                  useSignatureSkill: canUseSkill && useSkill,
                  startDuel: true,
                  defenderHeroId: defenderHero.id,
                })
              }
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#d4a853] to-[#b58732] hover:from-[#e5bc69] hover:to-[#c59640] text-[#11151d] text-xs sm:text-sm font-extrabold flex items-center gap-1.5 shadow-lg cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {lang === 'zh'
                  ? `阵前单挑 ${defenderHero.name.zh}！`
                  : `Duel ${defenderHero.name.en}!`}
              </span>
            </button>
          )}

          <button
            onClick={() =>
              onLaunch({
                troops,
                tactic,
                generalId: leadHero?.id,
                deputyId: deputyHero?.id,
                useSignatureSkill: canUseSkill && useSkill,
                startDuel: false,
                defenderHeroId: defenderHero?.id,
              })
            }
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
  onPersuadePrisoner: (heroId: string) => void;
  onPrisonerAction: (heroId: string, action: 'ransom' | 'release' | 'execute') => void;
}

export function BattleReportModal({
  report,
  state,
  lang,
  onClose,
  onPersuadePrisoner,
  onPrisonerAction,
}: BattleReportModalProps) {
  const toCity = state.cities[report.toCityId];
  const atkFaction = state.factions[report.attackerFaction];
  const defName =
    report.defenderFaction === 'neutral'
      ? tLoc(UI_TEXT.neutralOwner, lang)
      : tLoc(state.factions[report.defenderFaction].name, lang);

  const capturedHero =
    report.capturedHeroId &&
    state.generals[report.capturedHeroId]?.status === 'captured' &&
    state.generals[report.capturedHeroId]?.capturedBy === state.playerFaction
      ? state.generals[report.capturedHeroId]
      : undefined;

  return (
    <div className="fixed inset-0 z-50 bg-black/78 backdrop-blur-sm flex items-center justify-center p-4">
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
            {report.skillTriggered ? ` · 【${tLoc(report.skillTriggered, lang)}】` : ''}
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

        {/* Immediate Prisoner Fate Box if a Hero was Captured! */}
        {capturedHero && (
          <div className="rounded-xl bg-rose-950/30 border border-rose-400/45 p-3.5 space-y-2.5">
            <div className="flex items-center gap-3">
              <HeroAvatar hero={capturedHero} size="md" showLevel />
              <div>
                <div className="text-xs font-bold uppercase text-rose-300">
                  {lang === 'zh' ? '生擒敌方名将！处置抉择：' : 'Enemy Hero Captured! Decide Fate:'}
                </div>
                <div className="font-display font-bold text-base text-[#f7efe0]">
                  {tLoc(capturedHero.name, lang)} ({tLoc(capturedHero.title, lang)})
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                onClose();
                onPersuadePrisoner(capturedHero.id);
              }}
              className="w-full py-2 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/45 border border-emerald-400/50 text-emerald-100 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? 'AI 亲自劝降归顺' : 'AI Persuade to Defect'}</span>
            </button>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => {
                  onPrisonerAction(capturedHero.id, 'ransom');
                  onClose();
                }}
                className="py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/40 text-amber-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Coins className="w-3 h-3" />
                <span>{lang === 'zh' ? '赎金+350' : 'Ransom'}</span>
              </button>
              <button
                onClick={() => {
                  onPrisonerAction(capturedHero.id, 'release');
                  onClose();
                }}
                className="py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/40 text-sky-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Heart className="w-3 h-3" />
                <span>{lang === 'zh' ? '义释' : 'Release'}</span>
              </button>
              <button
                onClick={() => {
                  onPrisonerAction(capturedHero.id, 'execute');
                  onClose();
                }}
                className="py-1.5 rounded-lg bg-rose-700/40 hover:bg-rose-700/60 border border-rose-500/60 text-rose-100 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
              >
                <ShieldAlert className="w-3 h-3" />
                <span>{lang === 'zh' ? '斩首！' : 'Execute!'}</span>
              </button>
            </div>
          </div>
        )}

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
