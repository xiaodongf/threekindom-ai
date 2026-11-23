import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Eye,
  FastForward,
  Flame,
  Shield,
  SkipForward,
  Sparkles,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  getChronoInsightBonus,
  pickEnemyDuelStance,
  resolveDuelRound,
} from '../game/engine.js';
import { getHeroDuelProfile } from '../game/heroDuelProfiles.js';
import type {
  DuelResult,
  DuelRoundLog,
  DuelStance,
  GameState,
  General,
  Language,
  TerrainType,
} from '../game/types.js';
import { tLoc } from '../i18n/translations.js';
import { battleAudio } from '../utils/battleAudio.js';
import { loadSavedVisualTheme, type VisualThemeId } from '../utils/visualTheme.js';
import { DuelStage3D } from './DuelStage3D.js';
import { HeroAvatar } from './HeroAvatar.js';
import { classifyDuelMatchup } from './duel/duelChoreography.js';
import type {
  DuelCalloutBanner,
  DuelCutInState,
  DuelExchangeEvent,
} from './duel/duelTypes.js';

interface DuelModalProps {
  state: GameState;
  lang: Language;
  attacker: General;
  defender: General;
  terrain?: TerrainType;
  isNight?: boolean;
  theme?: VisualThemeId;
  /** Optional demo preview triggers for direct visual inspection */
  demoAction?: DuelStance | 'finale';
  demoTimeSec?: number;
  onComplete: (result: DuelResult) => void;
}

function buildDuelResult(
  attacker: General,
  defender: General,
  atkHpLeft: number,
  defHpLeft: number,
  rounds: DuelRoundLog[],
  skillUsed: boolean
): DuelResult {
  const winner: DuelResult['winner'] =
    defHpLeft < atkHpLeft ? 'attacker' : atkHpLeft < defHpLeft ? 'defender' : 'draw';
  const moraleBonus = winner === 'attacker' ? 0.22 : winner === 'defender' ? -0.12 : 0.04;
  return {
    winner,
    attackerHeroId: attacker.id,
    defenderHeroId: defender.id,
    attackerHpLeft: atkHpLeft,
    defenderHpLeft: defHpLeft,
    rounds,
    moraleBonus,
    skillUsed,
  };
}

export function DuelModal({
  state,
  lang,
  attacker,
  defender,
  terrain = 'plains',
  isNight = false,
  theme,
  demoAction,
  demoTimeSec,
  onComplete,
}: DuelModalProps) {
  const activeTheme = theme ?? loadSavedVisualTheme();
  const atkProfile = useMemo(() => getHeroDuelProfile(attacker), [attacker]);
  const defProfile = useMemo(() => getHeroDuelProfile(defender), [defender]);

  const [round, setRound] = useState(1);
  // Committed authoritative HP values (for round math)
  const [atkHp, setAtkHp] = useState(100);
  const [defHp, setDefHp] = useState(100);
  // Displayed live HP & fighting-game delayed ghost trail HP
  const [displayAtkHp, setDisplayAtkHp] = useState(100);
  const [displayDefHp, setDisplayDefHp] = useState(100);
  const [ghostAtkHp, setGhostAtkHp] = useState(100);
  const [ghostDefHp, setGhostDefHp] = useState(100);

  const [skillUsed, setSkillUsed] = useState(false);
  const [chronoUsed, setChronoUsed] = useState(false);
  const [logs, setLogs] = useState<DuelRoundLog[]>([]);
  const [finished, setFinished] = useState<DuelResult | null>(null);

  // 3D Animation Theater States
  const [isIntro, setIsIntro] = useState(!demoAction);
  const [activeExchange, setActiveExchange] = useState<DuelExchangeEvent | null>(null);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [muted, setMuted] = useState(battleAudio.muted);
  const [autoDuel, setAutoDuel] = useState(false);
  const [showFullLog, setShowFullLog] = useState(false);
  const [cutIn, setCutIn] = useState<DuelCutInState | null>(null);
  const [callouts, setCallouts] = useState<DuelCalloutBanner[]>([]);

  const exchangeCounterRef = useRef(0);
  const pendingResultRef = useRef<DuelResult | null>(null);

  const insightBonus = getChronoInsightBonus(state);
  const canUseSkill = !skillUsed && attacker.skillCooldown === 0;
  const canUseChrono = !chronoUsed && insightBonus > 0;
  const isAnimating = Boolean(activeExchange);

  // Delayed fighting-game ghost HP drain trail
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGhostAtkHp(displayAtkHp);
      setGhostDefHp(displayDefHp);
    }, 340);
    return () => window.clearTimeout(timer);
  }, [displayAtkHp, displayDefHp]);

  const handleCallout = useCallback((banner: DuelCalloutBanner) => {
    setCallouts((prev) => [...prev.slice(-2), banner]);
    window.setTimeout(() => {
      setCallouts((prev) => prev.filter((c) => c.id !== banner.id));
    }, 1450);
  }, []);

  const handleApplyHp = useCallback((nextAtk: number, nextDef: number) => {
    setDisplayAtkHp(nextAtk);
    setDisplayDefHp(nextDef);
  }, []);

  const finalizeExchange = useCallback((ev: DuelExchangeEvent) => {
    setActiveExchange(null);
    setCutIn(null);
    setDisplayAtkHp(ev.atkHpAfter);
    setDisplayDefHp(ev.defHpAfter);
    setLogs((prev) => (prev.some((l) => l.round === ev.log.round) ? prev : [...prev, ev.log]));

    if (ev.isFinalRound && pendingResultRef.current) {
      setFinished(pendingResultRef.current);
      setAutoDuel(false);
    } else {
      setRound((r) => Math.min(3, r + 1));
    }
  }, []);

  const playRound = useCallback(
    (stance: DuelStance) => {
      if (finished || activeExchange) return;
      setIsIntro(false);

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
      const nextSkillUsed = skillUsed || stance === 'skill';
      if (stance === 'skill') setSkillUsed(true);
      if (stance === 'chrono_counter') setChronoUsed(true);

      const isFinalRound = nextDefHp <= 0 || nextAtkHp <= 0 || round >= 3;
      const nextLogs = [...logs, log];
      let finalRes: DuelResult | null = null;
      if (isFinalRound) {
        finalRes = buildDuelResult(
          attacker,
          defender,
          nextAtkHp,
          nextDefHp,
          nextLogs,
          nextSkillUsed
        );
      }
      pendingResultRef.current = finalRes;

      setAtkHp(nextAtkHp);
      setDefHp(nextDefHp);

      exchangeCounterRef.current += 1;
      const matchup = classifyDuelMatchup(log);
      setActiveExchange({
        id: exchangeCounterRef.current,
        round,
        log,
        matchup,
        isFinalRound,
        winnerIfFinal: finalRes?.winner,
        atkHpAfter: nextAtkHp,
        defHpAfter: nextDefHp,
      });
    },
    [
      activeExchange,
      atkHp,
      attacker,
      defHp,
      defender,
      finished,
      insightBonus,
      logs,
      round,
      skillUsed,
    ]
  );

  // Optional demo preview auto-trigger (for visual QA)
  const demoTriggeredRef = useRef(false);
  useEffect(() => {
    if (!demoAction || demoTriggeredRef.current) return;
    demoTriggeredRef.current = true;
    if (demoAction === 'finale') {
      const sampleLog = resolveDuelRound(attacker, defender, 3, 'skill', 'guard', insightBonus);
      const res = buildDuelResult(attacker, defender, 68, 0, [sampleLog], true);
      setAtkHp(68);
      setDefHp(0);
      setDisplayAtkHp(68);
      setDisplayDefHp(0);
      setGhostAtkHp(68);
      setGhostDefHp(0);
      setLogs([sampleLog]);
      setFinished(res);
      return;
    }
    playRound(demoAction);
  }, [attacker, defender, demoAction, insightBonus, playRound]);

  // Auto-Duel Watch Mode: automatically picks smart stances once idle!
  useEffect(() => {
    if (!autoDuel || finished || activeExchange || isIntro) return;
    const timer = window.setTimeout(() => {
      if (round === 2 && canUseSkill) {
        playRound('skill');
      } else if (round === 1 && canUseChrono && insightBonus >= 0.15) {
        playRound('chrono_counter');
      } else {
        const smartStance = pickEnemyDuelStance(attacker, round);
        playRound(smartStance === 'skill' && !canUseSkill ? 'strike' : smartStance);
      }
    }, 420);
    return () => window.clearTimeout(timer);
  }, [
    activeExchange,
    attacker,
    autoDuel,
    canUseChrono,
    canUseSkill,
    finished,
    insightBonus,
    isIntro,
    playRound,
    round,
  ]);

  const handleToggleMute = () => {
    const next = !muted;
    battleAudio.muted = next;
    setMuted(next);
  };

  /** Skip either finishes the current animation exchange or fast-resolves remaining rounds */
  const handleSkip = () => {
    if (finished) return;
    if (activeExchange) {
      finalizeExchange(activeExchange);
      return;
    }
    // Fast-resolve all remaining rounds immediately
    let curRound = round;
    let curAtk = atkHp;
    let curDef = defHp;
    let curSkill = skillUsed;
    let curChrono = chronoUsed;
    const accLogs = [...logs];

    while (curRound <= 3 && curAtk > 0 && curDef > 0) {
      let stance: DuelStance = 'strike';
      if (curRound === 2 && !curSkill && attacker.skillCooldown === 0) {
        stance = 'skill';
        curSkill = true;
      } else if (curRound === 1 && !curChrono && insightBonus > 0) {
        stance = 'chrono_counter';
        curChrono = true;
      } else {
        const autoPick = pickEnemyDuelStance(attacker, curRound);
        stance = autoPick === 'skill' ? 'strike' : autoPick;
      }
      const enemyStance = pickEnemyDuelStance(defender, curRound);
      const log = resolveDuelRound(attacker, defender, curRound, stance, enemyStance, insightBonus);
      curAtk = Math.max(0, curAtk - log.enemyDamage);
      curDef = Math.max(0, curDef - log.playerDamage);
      accLogs.push(log);
      curRound += 1;
    }

    const res = buildDuelResult(attacker, defender, curAtk, curDef, accLogs, curSkill);
    setIsIntro(false);
    setAutoDuel(false);
    setSkillUsed(curSkill);
    setChronoUsed(curChrono);
    setAtkHp(curAtk);
    setDefHp(curDef);
    setDisplayAtkHp(curAtk);
    setDisplayDefHp(curDef);
    setLogs(accLogs);
    setFinished(res);
  };

  const latestLog = logs[logs.length - 1];

  return (
    <div className="fixed inset-0 z-50 bg-black/88 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl animate-modal-in relative border border-[#d4a853]/45">
        <div className="p-3.5 sm:p-5 space-y-3 bg-gradient-to-b from-[#0d111a] via-[#0b0f17] to-[#080b11]">
          {/* Top Cinema Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-[11px] font-extrabold uppercase tracking-wider text-[#f7e7be]">
                <Swords className="w-3.5 h-3.5 text-[#d4a853]" />
                <span>
                  {finished
                    ? lang === 'zh'
                      ? '阵前马战决出胜负'
                      : 'Cavalry Duel Concluded'
                    : lang === 'zh'
                      ? `阵前马战单挑 · 第 ${round} / 3 合`
                      : `Mounted Hero Duel · Round ${round} / 3`}
                </span>
              </div>

              {/* 3-Round Pip Tracker */}
              <div className="hidden sm:flex items-center gap-1">
                {[1, 2, 3].map((r) => (
                  <span
                    key={r}
                    className={`w-2.5 h-2.5 rounded-full border transition ${
                      r < round || finished
                        ? 'bg-[#d4a853] border-amber-200'
                        : r === round
                          ? 'bg-rose-500 border-rose-200 animate-pulse'
                          : 'bg-white/10 border-white/20'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Playback Controls: Auto-Duel, 1x/2x Speed, Mute, Skip */}
            <div className="flex items-center gap-1.5">
              {!finished && (
                <button
                  type="button"
                  onClick={() => {
                    setIsIntro(false);
                    setAutoDuel((v) => !v);
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    autoDuel
                      ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100'
                      : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>
                    {autoDuel
                      ? lang === 'zh'
                        ? '自动观战中'
                        : 'Auto-Duel ON'
                      : lang === 'zh'
                        ? '自动观战'
                        : 'Auto-Duel'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-[11px] font-bold text-slate-200 cursor-pointer"
                title={lang === 'zh' ? '切换战斗倍速' : 'Toggle animation speed'}
              >
                <FastForward className="w-3.5 h-3.5 text-amber-300" />
                <span>{speed}×</span>
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 cursor-pointer"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-300" />}
              </button>

              {!finished && (
                <button
                  type="button"
                  onClick={handleSkip}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/12 border border-white/15 text-[11px] font-bold text-slate-300 cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>{lang === 'zh' ? '跳过' : 'Skip'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Fighting-Game Broadcast Dual HP Bar HUD */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2.5 sm:gap-4 items-center">
            {/* Left General (Player) */}
            <div className="flex items-center gap-2.5 min-w-0">
              <HeroAvatar hero={attacker} size="md" showLevel />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="truncate">
                    <span className="font-display font-extrabold text-sm sm:text-base text-[#f7efe0]">
                      {tLoc(attacker.name, lang)}
                    </span>
                    <span className="ml-1.5 text-[10px] text-amber-300/90 hidden sm:inline">
                      · {tLoc(atkProfile.horseName, lang)}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-extrabold text-emerald-300 shrink-0">
                    {displayAtkHp}
                  </span>
                </div>
                {/* Angled HP bar with delayed ghost damage trail */}
                <div className="relative h-3 rounded-sm bg-white/10 overflow-hidden -skew-x-12 border border-emerald-400/35">
                  <div
                    className="absolute inset-y-0 left-0 bg-amber-300/85 transition-all duration-500"
                    style={{ width: `${ghostAtkHp}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-emerald-400 to-teal-300 transition-all duration-200"
                    style={{ width: `${displayAtkHp}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                  <span>
                    {lang === 'zh' ? '武' : 'WAR'} <strong className="text-slate-200">{attacker.war}</strong>
                  </span>
                  <span>
                    {lang === 'zh' ? '智' : 'INT'} <strong className="text-slate-200">{attacker.intellect}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Center VS Crest */}
            <div className="flex flex-col items-center justify-center px-1">
              <span className="font-display font-black text-base sm:text-xl text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-rose-500 drop-shadow">
                VS
              </span>
            </div>

            {/* Right General (Enemy) */}
            <div className="flex items-center gap-2.5 flex-row-reverse text-right min-w-0">
              <HeroAvatar hero={defender} size="md" showLevel />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2 flex-row-reverse">
                  <div className="truncate">
                    <span className="mr-1.5 text-[10px] text-rose-300/90 hidden sm:inline">
                      {tLoc(defProfile.horseName, lang)} ·
                    </span>
                    <span className="font-display font-extrabold text-sm sm:text-base text-[#f7efe0]">
                      {tLoc(defender.name, lang)}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-extrabold text-rose-300 shrink-0">
                    {displayDefHp}
                  </span>
                </div>
                <div className="relative h-3 rounded-sm bg-white/10 overflow-hidden skew-x-12 border border-rose-400/35">
                  <div
                    className="absolute inset-y-0 right-0 bg-amber-300/85 transition-all duration-500"
                    style={{ width: `${ghostDefHp}%` }}
                  />
                  <div
                    className="absolute inset-y-0 right-0 bg-gradient-to-l from-rose-600 via-rose-400 to-orange-400 transition-all duration-200"
                    style={{ width: `${displayDefHp}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 flex items-center justify-end gap-2">
                  <span>
                    {lang === 'zh' ? '武' : 'WAR'} <strong className="text-slate-200">{defender.war}</strong>
                  </span>
                  <span>
                    {lang === 'zh' ? '智' : 'INT'} <strong className="text-slate-200">{defender.intellect}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Center 16:9 Real-Time 3D WebGL Cavalry Duel Arena + Cut-In & Callout Overlays */}
          <div className="relative">
            <DuelStage3D
              attacker={attacker}
              defender={defender}
              terrain={terrain}
              isNight={isNight}
              theme={activeTheme}
              lang={lang}
              atkHp={displayAtkHp}
              defHp={displayDefHp}
              speed={speed}
              activeExchange={activeExchange}
              finaleWinner={finished?.winner ?? null}
              demoTimeSec={demoTimeSec}
              onIntroComplete={() => setIsIntro(false)}
              onApplyHp={handleApplyHp}
              onExchangeComplete={finalizeExchange}
              onCutInChange={setCutIn}
              onCallout={handleCallout}
            />

            {/* Floating Combat Callouts (GUARD BREAK!, FEINT RIPOSTE!, CHRONO COUNTER!) */}
            {callouts.map((c) => (
              <div
                key={c.id}
                className={`pointer-events-none absolute top-1/3 z-20 px-3.5 py-1 rounded-full font-display font-black text-sm sm:text-lg tracking-wider uppercase shadow-xl border backdrop-blur-sm animate-float-up ${
                  c.side === 'left'
                    ? 'left-[30%]'
                    : c.side === 'right'
                      ? 'left-[70%]'
                      : 'left-1/2'
                } ${
                  c.tone === 'cyan'
                    ? 'bg-cyan-950/90 border-cyan-300 text-cyan-200'
                    : c.tone === 'crimson'
                      ? 'bg-rose-950/90 border-rose-400 text-rose-100'
                      : c.tone === 'emerald'
                        ? 'bg-emerald-950/90 border-emerald-300 text-emerald-100'
                        : 'bg-amber-950/90 border-amber-300 text-amber-100'
                }`}
              >
                {tLoc(c.text, lang)}
              </div>
            ))}

            {/* KOEI-Style Diagonal Hero Skill / Chrono Portrait Cut-In Slash! */}
            {cutIn && (
              <div className="pointer-events-none absolute inset-x-0 bottom-[9%] z-30 overflow-hidden">
                <div
                  className={`mx-auto flex items-center gap-4 px-6 py-3 border-y-2 backdrop-blur-md shadow-2xl animate-duel-cutin ${
                    cutIn.side === 'right' ? 'flex-row-reverse text-right' : ''
                  } ${
                    cutIn.kind === 'chrono'
                      ? 'bg-gradient-to-r from-slate-950/95 via-cyan-950/92 to-slate-950/95 border-cyan-300/90'
                      : 'bg-gradient-to-r from-slate-950/95 via-amber-950/92 to-slate-950/95 border-amber-300/90'
                  }`}
                >
                  <img
                    src={cutIn.portrait}
                    alt={tLoc(cutIn.heroName, lang)}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border-2 shadow-lg shrink-0"
                    style={{ borderColor: cutIn.accentColor }}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[10px] font-extrabold uppercase tracking-[0.22em]"
                      style={{ color: cutIn.accentColor }}
                    >
                      {tLoc(cutIn.heroName, lang)} ·{' '}
                      {cutIn.kind === 'chrono'
                        ? lang === 'zh'
                          ? '时空先知破招'
                          : 'CHRONO FORESIGHT'
                        : lang === 'zh'
                          ? '无双绝技发动'
                          : 'SIGNATURE SKILL'}
                    </div>
                    <div className="font-display text-lg sm:text-2xl font-black text-white drop-shadow">
                      {tLoc(cutIn.skillName, lang)}
                    </div>
                    <div className="text-xs italic text-amber-100/90 truncate">
                      “{tLoc(cutIn.battleCry, lang)}”
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Compact Latest Clash Ticker + Expandable Round Log */}
          <div className="rounded-xl bg-[#090d14]/95 border border-white/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-[#ebe5d5] truncate">
                {isAnimating ? (
                  <span className="text-amber-300 font-semibold animate-pulse">
                    {lang === 'zh'
                      ? '⚔️ 两将策马交锋中，寒光飞溅……'
                      : '⚔️ Generals clashing on horseback — steel sparks fly…'}
                  </span>
                ) : latestLog ? (
                  <span>{tLoc(latestLog.summary, lang)}</span>
                ) : (
                  <span className="text-[#9ea3ae]">
                    {lang === 'zh'
                      ? '两军阵前战鼓雷鸣！刚猛强攻克固守 · 诱敌反击克强攻 · 固守蓄势克反击。'
                      : 'War drums thunder between the armies! Strike beats Guard · Feint beats Strike · Guard beats Feint.'}
                  </span>
                )}
              </div>
              {logs.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowFullLog((v) => !v)}
                  className="inline-flex items-center gap-0.5 text-[10px] text-amber-300/90 hover:text-amber-200 shrink-0 cursor-pointer"
                >
                  <span>{lang === 'zh' ? `战报(${logs.length})` : `Log (${logs.length})`}</span>
                  {showFullLog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>

            {showFullLog && logs.length > 1 && (
              <div className="mt-2 pt-2 border-t border-white/10 space-y-1 max-h-24 overflow-y-auto">
                {logs.map((l) => (
                  <div key={l.round} className="text-[11px] text-[#d5cebe]">
                    {tLoc(l.summary, lang)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Stance Command Deck OR Conclusion Banner */}
          {!finished ? (
            <div className={`space-y-2 transition-opacity ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={isAnimating}
                  onClick={() => playRound('strike')}
                  className="p-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-400/40 text-left transition cursor-pointer disabled:cursor-wait"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-200">
                    <Swords className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '刚猛强攻' : 'Fierce Strike'}</span>
                  </div>
                  <div className="text-[10px] text-[#b8b2a2] mt-0.5">
                    {lang === 'zh' ? '克「固守」· 策马破盾重劈' : 'Beats Guard · Heavy cleave'}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isAnimating}
                  onClick={() => playRound('feint')}
                  className="p-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/35 border border-amber-400/40 text-left transition cursor-pointer disabled:cursor-wait"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-200">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '诱敌反击' : 'Feint & Counter'}</span>
                  </div>
                  <div className="text-[10px] text-[#b8b2a2] mt-0.5">
                    {lang === 'zh' ? '克「强攻」· 侧马闪避回锋' : 'Beats Strike · Evade & riposte'}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isAnimating}
                  onClick={() => playRound('guard')}
                  className="p-2.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/35 border border-sky-400/40 text-left transition cursor-pointer disabled:cursor-wait"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-200">
                    <Shield className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '固守蓄势' : 'Guard & Focus'}</span>
                  </div>
                  <div className="text-[10px] text-[#b8b2a2] mt-0.5">
                    {lang === 'zh' ? '克「反击」· 铁壁格挡反刺' : 'Beats Feint · Parry & halve dmg'}
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!canUseSkill || isAnimating}
                  onClick={() => playRound('skill')}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-[#d4a853]/25 to-[#c84b31]/25 hover:from-[#d4a853]/40 hover:to-[#c84b31]/40 border border-[#d4a853]/60 disabled:opacity-35 text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#f7e7be]">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span className="truncate">
                      {lang === 'zh' ? '无双绝技：' : 'Skill: '}
                      {tLoc(attacker.signatureSkill.name, lang)}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#cfc7b4] mt-0.5">
                    {canUseSkill
                      ? lang === 'zh'
                        ? '触发特写连斩 · 单挑爆发绝杀（限一次）'
                        : 'Cinematic cut-in burst strike! (Once per duel)'
                      : lang === 'zh'
                        ? '冷却中或已施展'
                        : 'On cooldown or already used'}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={!canUseChrono || isAnimating}
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
                        ? `子弹时间洞穿敌将招路（先知加成 +${Math.round(insightBonus * 100)}%）`
                        : `Bullet-time flaw scan (+${Math.round(insightBonus * 100)}% foresight edge)`
                      : lang === 'zh'
                        ? '历史偏移 ≥60%，史书先知已失效！'
                        : 'Timeline Shattered — unlock Spyglass to restore!'}
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-white/[0.04] border border-[#d4a853]/50 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-sm sm:text-base font-display font-bold text-[#f7e7be]">
                <Trophy className="w-5 h-5 text-[#d4a853] shrink-0" />
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
                type="button"
                onClick={() => onComplete(finished)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#c84b31] to-[#a83620] hover:from-[#da573c] hover:to-[#bc3f27] text-white font-bold text-sm cursor-pointer shrink-0 shadow-lg"
              >
                {lang === 'zh' ? '鸣鼓进军 · 决战城下！' : 'Charge into Army Battle!'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
