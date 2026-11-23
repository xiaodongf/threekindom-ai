import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  FlaskConical,
  Lightbulb,
  Lock,
  Sparkles,
} from 'lucide-react';
import {
  getFactionGenerals,
  getTechEffectiveGoldCost,
} from '../game/engine.js';
import { MODERN_TECHS, TECH_ORDER } from '../game/tech.js';
import type { GameState, Language, PlayableFactionId, TechId } from '../game/types.js';
import { tLoc } from '../i18n/translations.js';

interface TechLabPanelProps {
  state: GameState;
  lang: Language;
  onResearchTech: (techId: TechId, researcherHeroId?: string) => void;
}

const TECH_ART: Record<TechId, string> = {
  stirrups: '/art/tech_stirrups.jpg',
  medicine: '/art/tech_medicine.jpg',
  agriculture: '/art/tech_agriculture.jpg',
  gunpowder: '/art/tech_gunpowder.jpg',
  spyglass: '/art/tech_spyglass.jpg',
  printing: '/art/tech_printing.jpg',
  balloon: '/art/tech_balloon.jpg',
  steamship: '/art/tech_steamship.jpg',
};

export function TechLabPanel({ state, lang, onResearchTech }: TechLabPanelProps) {
  const player = state.playerFaction;
  const faction = state.factions[player];
  const myActiveHeroes = getFactionGenerals(state, player)
    .filter((g) => g.status === 'active')
    .sort((a, b) => Math.max(b.intellect, b.politics) - Math.max(a.intellect, a.politics));

  const [researcherId, setResearcherId] = useState<string>(myActiveHeroes[0]?.id || '');
  const selectedResearcher = myActiveHeroes.find((h) => h.id === researcherId) || myActiveHeroes[0];

  const rivals = (['wei', 'shu', 'wu'] as PlayableFactionId[]).filter((f) => f !== player);
  const copiedByRivals = rivals.flatMap((fid) =>
    (state.chrono.rivalTechs[fid] || []).map((tid) => ({ fid, tid }))
  );

  return (
    <div className="p-3.5 space-y-3 overflow-y-auto h-[580px]">
      {/* Top Status Banner */}
      <div className="rounded-xl bg-slate-950/80 border border-cyan-500/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-200">
            <FlaskConical className="w-4 h-4 text-cyan-400" />
            <span>{lang === 'zh' ? '穿越者格物工坊' : 'Chrono Modern Tech Lab'}</span>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-cyan-200 bg-cyan-500/15 border border-cyan-400/40 px-2.5 py-0.5 rounded-full">
            <Lightbulb className="w-3.5 h-3.5 text-cyan-300" />
            <span>
              {state.chrono.innovationPoints}{' '}
              {lang === 'zh' ? '灵感' : 'Innovation'}
            </span>
          </div>
        </div>

        {/* Lead Researcher Selector */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-[#9ea3ae] shrink-0">
            {lang === 'zh' ? '主研名将：' : 'Lead Scholar:'}
          </span>
          <select
            value={selectedResearcher?.id || ''}
            onChange={(e) => setResearcherId(e.target.value)}
            className="flex-1 rounded-lg bg-[#161c26] border border-white/15 px-2 py-1 text-[11px] text-[#f5ecd7]"
          >
            {myActiveHeroes.map((h) => (
              <option key={h.id} value={h.id}>
                {tLoc(h.name, lang)} ({lang === 'zh' ? '智' : 'Int'} {h.intellect} /{' '}
                {lang === 'zh' ? '政' : 'Pol'} {h.politics})
              </option>
            ))}
          </select>
        </div>

        {state.chrono.techFrozenTurns > 0 && (
          <div className="text-[11px] px-2.5 py-1.5 rounded-lg bg-rose-950/60 border border-rose-500/45 text-rose-200 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span>
              {lang === 'zh'
                ? `因朝堂弹劾，工坊暂封 ${state.chrono.techFrozenTurns} 季！`
                : `Workshop suspended by Court Trial for ${state.chrono.techFrozenTurns} turn(s)!`}
            </span>
          </div>
        )}

        {copiedByRivals.length > 0 && (
          <div className="text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-950/50 border border-amber-500/40 text-amber-200 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
            <span>
              {lang === 'zh' ? '敌国已仿制科技：' : 'Rival Reverse-Engineered: '}
              {copiedByRivals
                .map(
                  ({ fid, tid }) =>
                    `${tLoc(state.factions[fid].shortName, lang)}→${tLoc(MODERN_TECHS[tid].name, lang)}`
                )
                .join(' · ')}
            </span>
          </div>
        )}
      </div>

      {/* Tech Cards */}
      <div className="space-y-2.5">
        {TECH_ORDER.map((tid) => {
          const tech = MODERN_TECHS[tid];
          const unlocked = state.chrono.unlockedTechs.includes(tid);
          const goldCost = getTechEffectiveGoldCost(tid, selectedResearcher);
          const canAfford =
            !unlocked &&
            state.chrono.techFrozenTurns === 0 &&
            state.chrono.innovationPoints >= tech.innovationCost &&
            faction.gold >= goldCost;

          return (
            <div
              key={tid}
              className={`rounded-xl border overflow-hidden transition ${
                unlocked
                  ? 'bg-emerald-950/25 border-emerald-500/50 shadow-[0_0_16px_rgba(16,185,129,0.14)]'
                  : 'bg-[#0d1015]/90 border-white/10 hover:border-cyan-400/35'
              }`}
            >
              {/* Studio-Painted 16:9 Tech Illustration Banner */}
              <div className="relative h-24 w-full overflow-hidden border-b border-white/10">
                <img
                  src={TECH_ART[tid]}
                  alt={tLoc(tech.name, lang)}
                  loading="lazy"
                  className={`w-full h-full object-cover object-center theme-art-grade transition-transform duration-500 hover:scale-105 ${
                    unlocked ? 'brightness-105' : 'brightness-85'
                  }`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-950/85 border border-amber-400/55 text-amber-300 shadow">
                    T{tech.tier}
                  </span>
                  {unlocked && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/90 text-slate-950 flex items-center gap-0.5 shadow">
                      <CheckCircle2 className="w-3 h-3" />
                      {lang === 'zh' ? '已研造' : 'ACTIVE'}
                    </span>
                  )}
                </div>
                <div className="absolute bottom-1.5 inset-x-3 flex items-end justify-between gap-2">
                  <span className="font-display text-sm font-extrabold text-white drop-shadow-md">
                    {tLoc(tech.name, lang)}
                  </span>
                  {!unlocked && (
                    <button
                      disabled={!canAfford}
                      onClick={() => onResearchTech(tid, selectedResearcher?.id)}
                      className="shrink-0 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-40 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-lg"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{lang === 'zh' ? '研造' : 'Build'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="p-2.5 space-y-2">
                <p className="text-[11px] text-[#cfc7b4] leading-snug">
                  {tLoc(tech.desc, lang)}
                </p>

                {!unlocked && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/5 text-[10px]">
                    <div className="flex items-center gap-2.5 text-[#cfc7b4]">
                      <span className="flex items-center gap-0.5 text-yellow-300 font-semibold">
                        <Coins className="w-3 h-3" />
                        {goldCost}
                      </span>
                      <span className="flex items-center gap-0.5 text-amber-300 font-semibold">
                        <Lightbulb className="w-3 h-3" />
                        {tech.innovationCost}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-rose-300/90">
                      <span>
                        {lang === 'zh' ? `偏移 +${tech.divergenceGain}%` : `+${tech.divergenceGain}% Div`}
                      </span>
                      <span>
                        {lang === 'zh' ? `猜忌 +${tech.suspicionGain}` : `+${tech.suspicionGain} Susp`}
                      </span>
                      {tech.copyableByRivals && (
                        <span className="text-amber-300">
                          {lang === 'zh' ? '· 可被敌仿' : '· Copyable'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
