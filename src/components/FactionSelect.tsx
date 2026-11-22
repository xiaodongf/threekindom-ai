import { Cpu, Crown, Languages, Shield, Sparkles, Swords } from 'lucide-react';
import { createInitialCities, createInitialFactions } from '../game/data.js';
import type { AIProviderStatus, Language, PlayableFactionId } from '../game/types.js';
import { UI_TEXT, tLoc } from '../i18n/translations.js';

interface FactionSelectProps {
  lang: Language;
  onToggleLang: () => void;
  onSelectFaction: (faction: PlayableFactionId) => void;
  onOpenSettings: () => void;
  providers: AIProviderStatus[];
  selectedProviderMode: string;
}

export function FactionSelect({
  lang,
  onToggleLang,
  onSelectFaction,
  onOpenSettings,
  providers,
  selectedProviderMode,
}: FactionSelectProps) {
  const factions = createInitialFactions();
  const cities = Object.values(createInitialCities());

  const configuredCount = providers.filter((p) => p.id !== 'heuristic' && p.configured).length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Decorative ink backdrop glows */}
      <div className="pointer-events-none absolute -top-24 left-1/4 w-96 h-96 rounded-full bg-[#3b82f6]/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 w-96 h-96 rounded-full bg-[#ef4444]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 w-96 h-96 rounded-full bg-[#10b981]/10 blur-3xl" />

      {/* Top utility controls */}
      <div className="w-full max-w-6xl flex items-center justify-between mb-8 z-10">
        <div className="flex items-center gap-2.5 text-xs uppercase tracking-widest text-[#d4a853]/90">
          <Sparkles className="w-4 h-4" />
          <span>{tLoc(UI_TEXT.victoryGoal, lang)}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg ink-panel hover:border-[#d4a853]/60 text-xs font-medium text-[#ebe5d5] transition cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-[#d4a853]" />
            <span>{tLoc(UI_TEXT.aiSettings, lang)}:</span>
            <span className="text-[#d4a853] uppercase">{selectedProviderMode}</span>
            <span className="text-[#94a3b8]">
              ({configuredCount > 0 ? `${configuredCount} LLM` : 'Offline AI'})
            </span>
          </button>
          <button
            onClick={onToggleLang}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg ink-panel hover:border-[#d4a853]/60 text-xs font-semibold text-[#d4a853] transition cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? '中文' : 'EN'}</span>
          </button>
        </div>
      </div>

      {/* Hero Heading */}
      <div className="text-center max-w-3xl mb-10 z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#d4a853]/10 border border-[#d4a853]/30 text-[#d4a853] text-xs tracking-wider uppercase mb-4">
          <Crown className="w-3.5 h-3.5" />
          <span>{tLoc(UI_TEXT.appSubtitle, lang)}</span>
        </div>
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-[#f7e7be] via-[#d4a853] to-[#9b722b] mb-3">
          {tLoc(UI_TEXT.appTitle, lang)}
        </h1>
        <p className="text-sm sm:text-base text-[#b8b2a2] leading-relaxed">
          {tLoc(UI_TEXT.chooseFactionDesc, lang)}
        </p>
      </div>

      {/* Faction Cards */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6 z-10">
        {(['wei', 'shu', 'wu'] as PlayableFactionId[]).map((fid) => {
          const faction = factions[fid];
          const ownedCities = cities.filter((c) => c.owner === fid);
          const totalTroops = ownedCities.reduce((sum, c) => sum + c.troops, 0);

          return (
            <div
              key={fid}
              className="ink-panel rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:border-[#d4a853]/60 group"
            >
              <div>
                {/* Header & Seal */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <span
                      className="inline-block text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-2"
                      style={{
                        backgroundColor: `${faction.color}22`,
                        color: faction.accent,
                        border: `1px solid ${faction.color}55`,
                      }}
                    >
                      {tLoc(UI_TEXT.difficulty[faction.difficulty], lang)}
                    </span>
                    <h2 className="font-display text-2xl font-bold text-[#f7efe0]">
                      {tLoc(faction.name, lang)}
                    </h2>
                    <p className="text-xs text-[#9ea3ae] mt-0.5">
                      {tLoc(faction.rulerName, lang)} · {tLoc(faction.rulerTitle, lang)}
                    </p>
                  </div>
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center font-seal text-3xl font-black shadow-lg shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${faction.color}cc, ${faction.color}55)`,
                      border: `1.5px solid ${faction.accent}`,
                      color: '#fff',
                    }}
                  >
                    {faction.bannerChar}
                  </div>
                </div>

                {/* Starting Stats */}
                <div className="grid grid-cols-3 gap-2 mb-5 text-center">
                  <div className="rounded-lg bg-[#0d1015]/80 border border-white/5 py-2 px-1">
                    <div className="text-[10px] uppercase text-[#8b92a1]">
                      {tLoc(UI_TEXT.cities, lang)}
                    </div>
                    <div className="text-base font-bold text-[#f5ecd7]">{ownedCities.length}</div>
                  </div>
                  <div className="rounded-lg bg-[#0d1015]/80 border border-white/5 py-2 px-1">
                    <div className="text-[10px] uppercase text-[#8b92a1]">
                      {tLoc(UI_TEXT.troops, lang)}
                    </div>
                    <div className="text-base font-bold text-[#f5ecd7]">
                      {(totalTroops / 1000).toFixed(1)}k
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#0d1015]/80 border border-white/5 py-2 px-1">
                    <div className="text-[10px] uppercase text-[#8b92a1]">
                      {tLoc(UI_TEXT.gold, lang)}
                    </div>
                    <div className="text-base font-bold text-[#d4a853]">{faction.gold}</div>
                  </div>
                </div>

                {/* Trait & Advisor */}
                <div className="space-y-3 mb-6">
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#d4a853] mb-1">
                      <Shield className="w-3.5 h-3.5" />
                      <span>{tLoc(faction.traitName, lang)}</span>
                    </div>
                    <p className="text-xs text-[#b8b2a2] leading-relaxed">
                      {tLoc(faction.traitDesc, lang)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#9ea3ae] px-1">
                    <span>{lang === 'zh' ? '首席军师' : 'Chief Advisor'}</span>
                    <span className="font-semibold text-[#ebe5d5]">
                      {tLoc(faction.advisorName, lang)} ({tLoc(faction.advisorTitle, lang)})
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onSelectFaction(fid)}
                className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${faction.color}, ${faction.color}bb)`,
                  color: '#ffffff',
                }}
              >
                <Swords className="w-4 h-4" />
                <span>{tLoc(UI_TEXT.beginCampaign, lang)}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
