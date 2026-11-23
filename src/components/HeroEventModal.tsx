import { AlertTriangle, Clock, Coins, FlaskConical, Sparkles } from 'lucide-react';
import { MODERN_TECHS } from '../game/tech.js';
import type { GameState, Language, StoryEvent } from '../game/types.js';
import { tLoc } from '../i18n/translations.js';
import { HeroAvatar } from './HeroAvatar.js';

interface HeroEventModalProps {
  event: StoryEvent;
  state: GameState;
  lang: Language;
  onChoose: (choiceId: string) => void;
}

export function HeroEventModal({ event, state, lang, onChoose }: HeroEventModalProps) {
  const hero = event.heroId ? state.generals[event.heroId] : undefined;
  const playerGold = state.factions[state.playerFaction].gold;

  const isWarning = event.kind === 'suspicion_trial' || event.kind === 'what_if';

  return (
    <div className="fixed inset-0 z-50 bg-black/82 backdrop-blur-md flex items-center justify-center p-4">
      <div className="ink-panel gold-border-glow rounded-2xl max-w-xl w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-white/10 pb-4">
          {hero ? (
            <HeroAvatar hero={hero} size="lg" showLevel />
          ) : (
            <div
              className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
                isWarning
                  ? 'bg-rose-500/20 border border-rose-400/50 text-rose-300'
                  : 'bg-[#d4a853]/20 border border-[#d4a853]/50 text-[#d4a853]'
              }`}
            >
              {isWarning ? <AlertTriangle className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
            </div>
          )}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#d4a853]">
              {tLoc(event.subtitle, lang)}
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#f7efe0] mt-0.5">
              {tLoc(event.title, lang)}
            </h2>
          </div>
        </div>

        {/* Narrative */}
        <p className="text-sm text-[#e6dfd0] leading-relaxed bg-[#12100d]/85 border border-white/10 rounded-xl p-4">
          {tLoc(event.body, lang)}
        </p>

        {/* Choices */}
        <div className="space-y-2.5">
          {event.choices.map((choice) => {
            const missingTech =
              choice.requiresTech && !state.chrono.unlockedTechs.includes(choice.requiresTech);
            const missingGold = Boolean(choice.goldCost && playerGold < choice.goldCost);
            const disabled = Boolean(missingTech || missingGold);

            return (
              <button
                key={choice.id}
                disabled={disabled}
                onClick={() => onChoose(choice.id)}
                className="w-full text-left p-3.5 rounded-xl bg-white/[0.04] hover:bg-[#d4a853]/15 border border-white/15 hover:border-[#d4a853]/60 disabled:opacity-40 transition cursor-pointer space-y-1"
              >
                <div className="flex items-center justify-between gap-2 text-xs sm:text-sm font-bold text-[#f7e7be]">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#d4a853]" />
                    {tLoc(choice.label, lang)}
                  </span>
                  {choice.goldCost && (
                    <span className="text-[11px] text-yellow-300 flex items-center gap-0.5">
                      <Coins className="w-3 h-3" />
                      {choice.goldCost}
                    </span>
                  )}
                  {choice.requiresTech && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-200 flex items-center gap-1">
                      <FlaskConical className="w-3 h-3" />
                      {tLoc(MODERN_TECHS[choice.requiresTech].name, lang)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#b8b2a2]">{tLoc(choice.desc, lang)}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
