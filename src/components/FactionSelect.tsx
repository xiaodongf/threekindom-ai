import { Clock, Cpu, Languages, Shield, Sparkles, Swords } from 'lucide-react';
import { createInitialCities, createInitialFactions } from '../game/data.js';
import { createInitialHeroes } from '../game/heroes.js';
import type { AIProviderStatus, Language, PlayableFactionId } from '../game/types.js';
import { UI_TEXT, tLoc } from '../i18n/translations.js';
import { HeroAvatar } from './HeroAvatar.js';

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
  const heroes = Object.values(createInitialHeroes());

  const configuredCount = providers.filter((p) => p.id !== 'heuristic' && p.configured).length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 left-1/4 w-96 h-96 rounded-full bg-[#3b82f6]/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 w-96 h-96 rounded-full bg-[#ef4444]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 w-96 h-96 rounded-full bg-[#10b981]/10 blur-3xl" />

      {/* Top Bar */}
      <div className="w-full max-w-6xl flex items-center justify-between mb-6 z-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#d4a853]/90">
          <Clock className="w-4 h-4" />
          <span>
            {lang === 'zh'
              ? '时空跃迁：2026 → 公元 214 年 · 硬核蝴蝶效应模式'
              : 'CHRONO-JUMP: 2026 → 214 AD · HARDCORE BUTTERFLY EFFECT'}
          </span>
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

      {/* Time-Traveler Prologue Hero */}
      <div className="text-center max-w-3xl mb-8 z-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#d4a853]/12 border border-[#d4a853]/35 text-[#f0c665] text-xs tracking-wider uppercase mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {lang === 'zh'
              ? '穿越三国 · 携现代科技与史书先知辅佐明主'
              : 'Time-Traveler Grand Strategy · 24 Legendary Heroes & Modern Tech'}
          </span>
        </div>
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-[#f7e7be] via-[#d4a853] to-[#9b722b] mb-3">
          {tLoc(UI_TEXT.appTitle, lang)}
        </h1>
        <p className="text-sm sm:text-base text-[#c4beae] leading-relaxed">
          {lang === 'zh'
            ? '你的时空穿梭机坠落于建安十九年（214年）。你洞悉二十四位三国名将的长处、软肋与历史死劫，更掌握火药、医术与蒸汽战船等现代科技——但切记：过度改写历史将引爆【蝴蝶效应】、招致【朝堂猜忌】与【敌国窃密合纵】！择一明主，共定天下：'
            : 'Your time machine drops you into 214 AD China armed with 21st-century science and secret dossiers on 24 legendary heroes. Recruit icons, fight 3-round duels, and invent modern tech — but beware: every change fuels Butterfly Effect Decay, Court Suspicion, Rival Tech-Copying, and Grand Coalitions!'}
        </p>
      </div>

      {/* Faction Cards with Painted Hero Portraits */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6 z-10">
        {(['wei', 'shu', 'wu'] as PlayableFactionId[]).map((fid) => {
          const faction = factions[fid];
          const ownedCities = cities.filter((c) => c.owner === fid);
          const totalTroops = ownedCities.reduce((sum, c) => sum + c.troops, 0);
          const factionHeroes = heroes.filter((h) => h.faction === fid).slice(0, 4);

          return (
            <div
              key={fid}
              className="ink-panel rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:border-[#d4a853]/65"
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span
                      className="inline-block text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-1.5"
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
                    className="w-12 h-12 rounded-xl flex items-center justify-center font-seal text-2xl font-black shadow-lg shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${faction.color}cc, ${faction.color}55)`,
                      border: `1.5px solid ${faction.accent}`,
                      color: '#fff',
                    }}
                  >
                    {faction.bannerChar}
                  </div>
                </div>

                {/* Iconic Hero Portraits Preview Strip */}
                <div className="mb-4">
                  <div className="text-[10px] uppercase tracking-wider text-[#d4a853] mb-2">
                    {lang === 'zh' ? '核心名将阵容（6名）' : 'Featured Legendary Heroes (6)'}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {factionHeroes.map((h) => (
                      <div key={h.id} className="flex flex-col items-center gap-1">
                        <HeroAvatar hero={h} size="md" />
                        <span className="text-[10px] text-[#e2dac8] font-medium truncate max-w-full">
                          {tLoc(h.name, lang)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Starting Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="rounded-lg bg-[#0d1015]/80 border border-white/5 py-1.5 px-1">
                    <div className="text-[10px] uppercase text-[#8b92a1]">
                      {tLoc(UI_TEXT.cities, lang)}
                    </div>
                    <div className="text-sm font-bold text-[#f5ecd7]">{ownedCities.length}</div>
                  </div>
                  <div className="rounded-lg bg-[#0d1015]/80 border border-white/5 py-1.5 px-1">
                    <div className="text-[10px] uppercase text-[#8b92a1]">
                      {tLoc(UI_TEXT.troops, lang)}
                    </div>
                    <div className="text-sm font-bold text-[#f5ecd7]">
                      {(totalTroops / 1000).toFixed(1)}k
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#0d1015]/80 border border-white/5 py-1.5 px-1">
                    <div className="text-[10px] uppercase text-[#8b92a1]">
                      {tLoc(UI_TEXT.gold, lang)}
                    </div>
                    <div className="text-sm font-bold text-[#d4a853]">{faction.gold}</div>
                  </div>
                </div>

                {/* Trait */}
                <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 mb-5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#d4a853] mb-1">
                    <Shield className="w-3.5 h-3.5" />
                    <span>{tLoc(faction.traitName, lang)}</span>
                  </div>
                  <p className="text-xs text-[#b8b2a2] leading-relaxed">
                    {tLoc(faction.traitDesc, lang)}
                  </p>
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
                <span>
                  {lang === 'zh'
                    ? `投效${faction.rulerName.zh} · 穿越启程`
                    : `Pledge to ${faction.rulerName.en}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
