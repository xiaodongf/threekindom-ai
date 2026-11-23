import { useState } from 'react';
import { Clock, Cpu, Languages, Palette, Shield, Sparkles, Swords, User } from 'lucide-react';
import { createInitialCities, createInitialFactions } from '../game/data.js';
import { createDefaultPlayerProfile } from '../game/engine.js';
import { createInitialHeroes } from '../game/heroes.js';
import type {
  AIProviderStatus,
  Language,
  PlayableFactionId,
  PlayerProfile,
  TravelerAvatarId,
} from '../game/types.js';
import { UI_TEXT, tLoc } from '../i18n/translations.js';
import { VISUAL_THEMES, VISUAL_THEME_ORDER, type VisualThemeId } from '../utils/visualTheme.js';
import { HeroAvatar } from './HeroAvatar.js';

interface FactionSelectProps {
  lang: Language;
  visualTheme: VisualThemeId;
  onChangeVisualTheme: (theme: VisualThemeId) => void;
  onToggleLang: () => void;
  onSelectFaction: (faction: PlayableFactionId, profile: PlayerProfile) => void;
  onOpenSettings: () => void;
  providers: AIProviderStatus[];
  selectedProviderMode: string;
}

const FACTION_ART: Record<PlayableFactionId, string> = {
  wei: '/art/bg_wei.jpg',
  shu: '/art/bg_shu.jpg',
  wu: '/art/bg_wu.jpg',
};

export function FactionSelect({
  lang,
  visualTheme,
  onChangeVisualTheme,
  onToggleLang,
  onSelectFaction,
  onOpenSettings,
  providers,
  selectedProviderMode,
}: FactionSelectProps) {
  const [avatar, setAvatar] = useState<TravelerAvatarId>('male');
  const [playerName, setPlayerName] = useState('');

  const factions = createInitialFactions();
  const cities = Object.values(createInitialCities());
  const heroes = Object.values(createInitialHeroes());

  const configuredCount = providers.filter((p) => p.id !== 'heuristic' && p.configured).length;
  const totalHeroes = heroes.length;
  const wanderingCount = heroes.filter((h) => h.status === 'wandering').length;

  const currentProfile = createDefaultPlayerProfile(avatar, playerName);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-7 relative overflow-hidden">
      {/* Full-Bleed Studio-Painted Panoramic 214 AD Title Key Art Backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <img
          src="/art/bg_title_hero.jpg"
          alt="Three Kingdoms Chrono Backdrop"
          className="w-full h-full object-cover object-center opacity-45 scale-105 theme-art-grade"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/78 via-slate-950/60 to-slate-950/92" />
      </div>

      {/* Top Bar */}
      <div className="w-full max-w-6xl flex flex-wrap items-center justify-between gap-2.5 mb-5 z-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-200 font-semibold drop-shadow">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span>
            {lang === 'zh'
              ? `时空跃迁：2026 → 214 AD · ${totalHeroes} 位传奇名将（${wanderingCount} 位在野）`
              : `CHRONO-JUMP: 2026 → 214 AD · ${totalHeroes} LEGENDARY HEROES (${wanderingCount} WANDERING)`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 3-Way Player-Selectable Visual Art Theme Switcher */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl ink-panel">
            <Palette className="w-3.5 h-3.5 text-amber-300 mr-0.5" />
            {VISUAL_THEME_ORDER.map((tid) => {
              const tMeta = VISUAL_THEMES[tid];
              const active = visualTheme === tid;
              return (
                <button
                  key={tid}
                  type="button"
                  onClick={() => onChangeVisualTheme(tid)}
                  title={tLoc(tMeta.desc, lang)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    active
                      ? 'bg-cyan-500/25 border border-cyan-300/70 text-white shadow'
                      : 'text-slate-400 hover:text-slate-100 border border-transparent'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-white/50"
                    style={{ background: tMeta.previewGradient }}
                  />
                  <span>{tLoc(tMeta.shortName, lang)}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl ink-panel hover:border-cyan-400/50 text-xs font-medium text-slate-200 transition cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>{tLoc(UI_TEXT.aiSettings, lang)}:</span>
            <span className="text-cyan-300 uppercase font-semibold">{selectedProviderMode}</span>
            <span className="text-slate-400 hidden sm:inline">
              ({configuredCount > 0 ? `${configuredCount} LLM` : 'Offline AI'})
            </span>
          </button>
          <button
            onClick={onToggleLang}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl ink-panel hover:border-cyan-400/50 text-xs font-semibold text-cyan-300 transition cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? '中文' : 'EN'}</span>
          </button>
        </div>
      </div>

      {/* Hero Title + Player Time-Traveler Identity Card */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-5 items-center mb-7 z-10">
        <div className="lg:col-span-7 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/12 border border-cyan-400/35 text-cyan-200 text-xs tracking-wider uppercase mb-3">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {lang === 'zh'
                ? '穿越三国 · 3D 沙盘 · 现代科技与群雄博弈'
                : 'Modern 3D Grand Strategy · Time-Traveler × Hero RPG'}
            </span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-indigo-300 mb-3">
            {tLoc(UI_TEXT.appTitle, lang)}
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            {lang === 'zh'
              ? '时空穿梭机将你送回公元 214 年汉末乱世。你携现代科技与 36 位名将（含吕布、周瑜、典韦、华佗、貂蝉等）的史书软肋档案辅佐明主——但逆天改命将触发硬核【蝴蝶效应】、【朝堂猜忌】、【敌国窃密】与【天下合纵】！'
              : 'Your time machine drops you into 214 AD armed with 21st-century science and secret dossiers on 36 legendary heroes (including Lü Bu, Zhou Yu, Dian Wei, Hua Tuo & Diaochan). Rewrite history — while surviving Hardcore Butterfly Effect Decay, Court Suspicion, Rival Tech-Copying & Grand Coalitions!'}
          </p>
        </div>

        {/* YOUR Player Time-Traveler Avatar Customization Card */}
        <div className="lg:col-span-5 ink-panel gold-border-glow rounded-2xl p-4 flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={currentProfile.portrait}
              alt="Player Chrono-Strategist"
              className="w-24 h-24 rounded-2xl object-cover object-top border-2 border-cyan-400 shadow-[0_0_24px_rgba(56,189,248,0.3)]"
            />
            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500 text-slate-950 whitespace-nowrap shadow">
              {lang === 'zh' ? '穿越者本人' : 'YOU · 2026'}
            </span>
          </div>
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 uppercase tracking-wider">
              <User className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? '自定义你的穿越者形象' : 'Your Time-Traveler Identity'}</span>
            </div>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder={lang === 'zh' ? '输入你的名字（默认：天命奇士）' : 'Your name (default: Chrono-Strategist)'}
              className="w-full rounded-xl bg-slate-950/80 border border-slate-700 focus:border-cyan-400 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as TravelerAvatarId[]).map((av) => (
                <button
                  key={av}
                  type="button"
                  onClick={() => setAvatar(av)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                    avatar === av
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-slate-900/70 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <img
                    src={av === 'female' ? '/portraits/traveler_female.jpg' : '/portraits/traveler_male.jpg'}
                    alt={av}
                    className="w-5 h-5 rounded-full object-cover object-top"
                  />
                  <span>
                    {av === 'male'
                      ? lang === 'zh'
                        ? '男奇士'
                        : 'Male'
                      : lang === 'zh'
                        ? '女奇士'
                        : 'Female'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Faction Cards with Expanded Hero Portraits */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-5 z-10">
        {(['wei', 'shu', 'wu'] as PlayableFactionId[]).map((fid) => {
          const faction = factions[fid];
          const ownedCities = cities.filter((c) => c.owner === fid);
          const totalTroops = ownedCities.reduce((sum, c) => sum + c.troops, 0);
          const factionHeroes = heroes.filter((h) => h.faction === fid);
          const featured = factionHeroes.slice(0, 5);

          return (
            <div
              key={fid}
              className="ink-panel rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/65 shadow-2xl"
            >
              <div>
                {/* Studio-Painted Panoramic Kingdom Vista Header */}
                <div className="relative h-32 w-full overflow-hidden border-b border-slate-700/70">
                  <img
                    src={FACTION_ART[fid]}
                    alt={tLoc(faction.name, lang)}
                    className="w-full h-full object-cover object-center theme-art-grade transition-transform duration-500 hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                  <div className="absolute inset-x-4 bottom-2.5 flex items-end justify-between">
                    <div>
                      <span
                        className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 backdrop-blur-md"
                        style={{
                          backgroundColor: `${faction.color}38`,
                          color: faction.accent,
                          border: `1px solid ${faction.color}88`,
                        }}
                      >
                        {tLoc(UI_TEXT.difficulty[faction.difficulty], lang)}
                      </span>
                      <h2 className="font-display text-2xl font-extrabold text-white drop-shadow-md leading-tight">
                        {tLoc(faction.name, lang)}
                      </h2>
                      <p className="text-[11px] text-slate-200 drop-shadow">
                        {tLoc(faction.rulerName, lang)} · {tLoc(faction.rulerTitle, lang)}
                      </p>
                    </div>
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center font-seal text-2xl font-black shadow-xl shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${faction.color}, ${faction.color}88)`,
                        border: `1.5px solid ${faction.accent}`,
                        color: '#fff',
                      }}
                    >
                      {faction.bannerChar}
                    </div>
                  </div>
                </div>

                <div className="p-4 pb-0">

                {/* 5 Iconic Portraits Strip */}
                <div className="mb-4">
                  <div className="text-[10px] uppercase tracking-wider text-cyan-300 mb-2 font-semibold">
                    {lang === 'zh'
                      ? `核心名将阵容（共 ${factionHeroes.length} 名）`
                      : `Featured Roster (${factionHeroes.length} Heroes)`}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {featured.map((h) => (
                      <div key={h.id} className="flex flex-col items-center gap-1">
                        <HeroAvatar hero={h} size="sm" />
                        <span className="text-[9.5px] text-slate-300 font-medium truncate max-w-full">
                          {tLoc(h.name, lang)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Starting Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="rounded-xl bg-slate-950/75 border border-slate-800 py-1.5 px-1">
                    <div className="text-[10px] uppercase text-slate-400">
                      {tLoc(UI_TEXT.cities, lang)}
                    </div>
                    <div className="text-sm font-bold text-white">{ownedCities.length}</div>
                  </div>
                  <div className="rounded-xl bg-slate-950/75 border border-slate-800 py-1.5 px-1">
                    <div className="text-[10px] uppercase text-slate-400">
                      {tLoc(UI_TEXT.troops, lang)}
                    </div>
                    <div className="text-sm font-bold text-white">
                      {(totalTroops / 1000).toFixed(1)}k
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-950/75 border border-slate-800 py-1.5 px-1">
                    <div className="text-[10px] uppercase text-slate-400">
                      {tLoc(UI_TEXT.gold, lang)}
                    </div>
                    <div className="text-sm font-bold text-amber-300">{faction.gold}</div>
                  </div>
                </div>

                {/* Trait */}
                <div className="rounded-xl bg-slate-900/65 border border-slate-800 p-3 mb-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300 mb-1">
                    <Shield className="w-3.5 h-3.5" />
                    <span>{tLoc(faction.traitName, lang)}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {tLoc(faction.traitDesc, lang)}
                  </p>
                </div>
                </div>
              </div>

              <div className="px-4 pb-4">
                <button
                  onClick={() => onSelectFaction(fid, currentProfile)}
                  className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg hover:brightness-110"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
