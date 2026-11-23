import { useState } from 'react';
import { Eye, Flame, Shield, Sparkles, Swords, Trophy } from 'lucide-react';
import {
  getChronoInsightBonus,
  pickEnemyDuelStance,
  resolveDuelRound,
} from '../game/engine.js';
import type {
  DuelResult,
  DuelRoundLog,
  DuelStance,
  GameState,
  General,
  Language,
} from '../game/types.js';
import { tLoc } from '../i18n/translations.js';
import { battleAudio } from '../utils/battleAudio.js';
import { HeroAvatar } from './HeroAvatar.js';

interface DuelModalProps {
  state: GameState;
  lang: Language;
  attacker: General;
  defender: General;
  onComplete: (result: DuelResult) => void;
}

export function DuelModal({
  state,
  lang,
  attacker,
  defender,
  onComplete,
}: DuelModalProps) {
  const [round, setRound] = useState(1);
  const [atkHp, setAtkHp] = useState(100);
  const [defHp, setDefHp] = useState(100);
  const [skillUsed, setSkillUsed] = useState(false);
  const [chronoUsed, setChronoUsed] = useState(false);
  const [logs, setLogs] = useState<DuelRoundLog[]>([]);
  const [finished, setFinished] = useState<DuelResult | null>(null);
  const [clashAnimKey, setClashAnimKey] = useState(0);
  const [lastClashFlash, setLastClashFlash] = useState<'steel' | 'skill' | 'chrono' | null>(null);

  const insightBonus = getChronoInsightBonus(state);
  const canUseSkill = !skillUsed && attacker.skillCooldown === 0;
  const canUseChrono = !chronoUsed && insightBonus > 0;

  function playRound(stance: DuelStance) {
    if (finished) return;
    const enemyStance = pickEnemyDuelStance(defender, round);
    const log = resolveDuelRound(
      attacker,
      defender,
      round,
      stance,
      enemyStance,
      insightBonus
    );

    const nextAtkHp = Math.max(0, atkHp - log.enemyDamage);
    const nextDefHp = Math.max(0, defHp - log.playerDamage);
    const nextLogs = [...logs, log];
    const nextSkillUsed = skillUsed || stance === 'skill';
    if (stance === 'skill') {
      setSkillUsed(true);
      setLastClashFlash('skill');
      battleAudio.playSkillSurge(0.24);
    } else if (stance === 'chrono_counter') {
      setChronoUsed(true);
      setLastClashFlash('chrono');
      battleAudio.playSkillSurge(0.22);
    } else {
      setLastClashFlash('steel');
      battleAudio.playSteelClash(0.2);
    }
    setClashAnimKey((k) => k + 1);
    window.setTimeout(() => setLastClashFlash(null), 540);

    setAtkHp(nextAtkHp);
    setDefHp(nextDefHp);
    setLogs(nextLogs);

    if (nextDefHp <= 0 || nextAtkHp <= 0 || round >= 3) {
      const winner: DuelResult['winner'] =
        nextDefHp < nextAtkHp
          ? 'attacker'
          : nextAtkHp < nextDefHp
            ? 'defender'
            : 'draw';
      const moraleBonus = winner === 'attacker' ? 0.22 : winner === 'defender' ? -0.12 : 0.04;
      battleAudio.playOutcomeHorn(winner === 'attacker', 0.2);
      setFinished({
        winner,
        attackerHeroId: attacker.id,
        defenderHeroId: defender.id,
        attackerHpLeft: nextAtkHp,
        defenderHpLeft: nextDefHp,
        rounds: nextLogs,
        moraleBonus,
        skillUsed: nextSkillUsed,
      });
    } else {
      setRound((r) => r + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl animate-modal-in relative">
        {/* Studio-Painted Arena Backdrop */}
        <div className="relative p-6 space-y-5">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <img
              src="/art/bg_plains_siege.jpg"
              alt="Duel Arena"
              className="w-full h-full object-cover opacity-28 theme-art-grade"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/70 to-slate-950/95" />
          </div>

          <div className="relative z-10 space-y-5">
            {/* Header */}
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#d4a853]">
                <Swords className="w-4 h-4" />
                <span>
                  {finished
                    ? lang === 'zh'
                      ? '阵前单挑结果'
                      : 'Duel Concluded'
                    : lang === 'zh'
                      ? `阵前单挑 · 第 ${round} / 3 回合`
                      : `Hero Duel · Round ${round} of 3`}
                </span>
              </div>
              <h2 className="font-display text-2xl font-extrabold text-[#f7efe0] drop-shadow">
                {tLoc(attacker.name, lang)} <span className="text-[#fb7185]">VS</span>{' '}
                {tLoc(defender.name, lang)}
              </h2>
            </div>

            {/* Portraits & HP Bars with Dynamic Lunge & Clash Spark Flash! */}
            <div className="relative grid grid-cols-2 gap-4 items-center">
              {lastClashFlash && (
                <div
                  className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-24 h-24 rounded-full blur-md animate-ping ${
                    lastClashFlash === 'chrono'
                      ? 'bg-cyan-400/80'
                      : lastClashFlash === 'skill'
                        ? 'bg-amber-400/85'
                        : 'bg-yellow-200/75'
                  }`}
                />
              )}

              {/* Attacker */}
              <div
                key={`atk-${clashAnimKey}`}
                className={`rounded-xl bg-[#0d1015]/88 border border-emerald-500/45 p-3.5 flex items-center gap-3 backdrop-blur-sm ${
                  clashAnimKey > 0 ? 'animate-duel-lunge-left' : ''
                }`}
              >
                <HeroAvatar hero={attacker} size="lg" showLevel />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="font-display font-bold text-base text-[#f7efe0] truncate">
                    {tLoc(attacker.name, lang)}
                  </div>
                  <div className="text-[11px] text-[#9ea3ae]">
                    {lang === 'zh' ? '武力' : 'War'} {attacker.war} · {lang === 'zh' ? '智力' : 'Int'}{' '}
                    {attacker.intellect}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-emerald-300">HP</span>
                      <span className="text-white">{atkHp}/100</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-300"
                        style={{ width: `${atkHp}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Defender */}
              <div
                key={`def-${clashAnimKey}`}
                className={`rounded-xl bg-[#0d1015]/88 border border-rose-500/45 p-3.5 flex items-center gap-3 flex-row-reverse text-right backdrop-blur-sm ${
                  clashAnimKey > 0 ? 'animate-duel-lunge-right' : ''
                }`}
              >
                <HeroAvatar hero={defender} size="lg" showLevel />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="font-display font-bold text-base text-[#f7efe0] truncate">
                    {tLoc(defender.name, lang)}
                  </div>
                  <div className="text-[11px] text-[#9ea3ae]">
                    {lang === 'zh' ? '武力' : 'War'} {defender.war} · {lang === 'zh' ? '智力' : 'Int'}{' '}
                    {defender.intellect}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-white">{defHp}/100</span>
                      <span className="text-rose-300">HP</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-l from-rose-500 to-orange-400 transition-all duration-300 ml-auto"
                        style={{ width: `${defHp}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

        {/* Round Log */}
        <div className="rounded-xl bg-[#0a0e14]/90 border border-white/10 p-3 space-y-2 min-h-[108px] max-h-[160px] overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center text-xs text-[#9ea3ae] py-6">
              {lang === 'zh'
                ? '两军阵前战鼓雷鸣！请选择招式：刚猛强攻克固守 · 诱敌反击克强攻 · 固守蓄势克反击。'
                : 'War drums thunder between the lines! Strike beats Guard · Feint beats Strike · Guard beats Feint.'}
            </div>
          ) : (
            logs.map((l) => (
              <div
                key={l.round}
                className="text-xs text-[#ebe5d5] bg-white/[0.03] border-l-2 border-[#d4a853] px-3 py-1.5 rounded-r-lg"
              >
                {tLoc(l.summary, lang)}
              </div>
            ))
          )}
        </div>

        {/* Stance Buttons OR Finish Button */}
        {!finished ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => playRound('strike')}
                className="p-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-400/40 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-200">
                  <Swords className="w-3.5 h-3.5" />
                  <span>{lang === 'zh' ? '刚猛强攻' : 'Fierce Strike'}</span>
                </div>
                <div className="text-[10px] text-[#b8b2a2] mt-0.5">
                  {lang === 'zh' ? '克制「固守」· 高武力伤害' : 'Beats Guard · High War dmg'}
                </div>
              </button>

              <button
                onClick={() => playRound('feint')}
                className="p-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/35 border border-amber-400/40 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-200">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{lang === 'zh' ? '诱敌反击' : 'Feint & Counter'}</span>
                </div>
                <div className="text-[10px] text-[#b8b2a2] mt-0.5">
                  {lang === 'zh' ? '克制「强攻」· 智武反制' : 'Beats Strike · Tactical riposte'}
                </div>
              </button>

              <button
                onClick={() => playRound('guard')}
                className="p-3 rounded-xl bg-sky-600/20 hover:bg-sky-600/35 border border-sky-400/40 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-sky-200">
                  <Shield className="w-3.5 h-3.5" />
                  <span>{lang === 'zh' ? '固守蓄势' : 'Guard & Focus'}</span>
                </div>
                <div className="text-[10px] text-[#b8b2a2] mt-0.5">
                  {lang === 'zh' ? '克制「反击」· 减伤保血' : 'Beats Feint · Halves damage'}
                </div>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={!canUseSkill}
                onClick={() => playRound('skill')}
                className="p-2.5 rounded-xl bg-gradient-to-r from-[#d4a853]/25 to-[#c84b31]/25 hover:from-[#d4a853]/40 hover:to-[#c84b31]/40 border border-[#d4a853]/60 disabled:opacity-35 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#f7e7be]">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {lang === 'zh' ? '绝技：' : 'Skill: '}
                    {tLoc(attacker.signatureSkill.name, lang)}
                  </span>
                </div>
                <div className="text-[10px] text-[#cfc7b4] mt-0.5">
                  {canUseSkill
                    ? lang === 'zh'
                      ? '单挑爆发绝杀！（本战限一次）'
                      : 'Massive burst strike! (Once per duel)'
                    : lang === 'zh'
                      ? '冷却中或已施展'
                      : 'On cooldown or already used'}
                </div>
              </button>

              <button
                disabled={!canUseChrono}
                onClick={() => playRound('chrono_counter')}
                className="p-2.5 rounded-xl bg-sky-500/18 hover:bg-sky-500/30 border border-sky-400/50 disabled:opacity-35 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-sky-200">
                  <Eye className="w-3.5 h-3.5 text-sky-300" />
                  <span>{lang === 'zh' ? '穿越者先知破招' : 'Chrono-Insight Counter'}</span>
                </div>
                <div className="text-[10px] text-sky-100/80 mt-0.5">
                  {insightBonus > 0
                    ? lang === 'zh'
                      ? `洞穿敌将史书软肋（先知加成 +${Math.round(insightBonus * 100)}%）`
                      : `Exploit historical flaw (+${Math.round(insightBonus * 100)}% foresight edge)`
                    : lang === 'zh'
                      ? '历史偏移 ≥60%，史书先知已失效！'
                      : 'Timeline Shattered — unlock Spyglass to restore!'}
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.04] border border-[#d4a853]/45 p-4 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-lg font-display font-bold text-[#f7e7be]">
              <Trophy className="w-5 h-5 text-[#d4a853]" />
              <span>
                {finished.winner === 'attacker'
                  ? lang === 'zh'
                    ? `${attacker.name.zh}阵前大胜！我军士气 +22%，敌将大概率被俘！`
                    : `${attacker.name.en} wins the duel! +22% Army Morale & High Capture Odds!`
                  : finished.winner === 'defender'
                    ? lang === 'zh'
                      ? `${attacker.name.zh}单挑负伤！我军士气 -12%！`
                      : `${attacker.name.en} was bested & wounded! (-12% Army Morale)`
                    : lang === 'zh'
                      ? '大战百合不分胜负！三军士气微涨（+4%）。'
                      : 'An epic draw! (+4% Army Morale)'}
              </span>
            </div>
            <button
              onClick={() => onComplete(finished)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#c84b31] to-[#a83620] hover:from-[#da573c] hover:to-[#bc3f27] text-white font-bold text-sm cursor-pointer"
            >
              {lang === 'zh' ? '鸣鼓进军 · 决战城下！' : 'Charge into Army Battle!'}
            </button>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
