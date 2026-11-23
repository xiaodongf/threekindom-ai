import { useState } from 'react';
import { Castle, Coins, Cpu, Languages, Shield, Swords } from 'lucide-react';
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
import { HeroAvatar } from './HeroAvatar.js';
import { Seal } from './ui/Seal.js';
import { Art } from './ui/Art.js';

interface FactionSelectProps {
  lang: Language;
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

const RULER_ID: Record<PlayableFactionId, string> = {
  wei: 'caocao',
  shu: 'liubei',
  wu: 'sunquan',
};

export function FactionSelect({
  lang,
  onToggleLang,
  onSelectFaction,
  onOpenSettings,
  providers,
  selectedProviderMode,
}: FactionSelectProps) {
  const [avatar, setAvatar] = useState<TravelerAvatarId>('male');
  const [playerName, setPlayerName] = useState('');
  const zh = lang === 'zh';

  const factions = createInitialFactions();
  const cities = Object.values(createInitialCities());
  const heroes = Object.values(createInitialHeroes());

  const configuredCount = providers.filter((p) => p.id !== 'heuristic' && p.configured).length;
  const totalHeroes = heroes.length;
  const wanderingCount = heroes.filter((h) => h.status === 'wandering').length;

  const currentProfile = createDefaultPlayerProfile(avatar, playerName);

  return (
    <div className="relative min-h-screen lg:h-screen flex flex-col overflow-hidden">
      {/* Key art, kept quiet so the three leaders carry the screen */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <Art
          src="/art/bg_title_hero.jpg"
          alt=""
          className="anim-art-drift w-full h-full object-cover object-center opacity-30 theme-art-grade"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/55 to-slate-950/95" />
      </div>

      {/* Title strip */}
      <header className="relative z-10 shrink-0 px-5 sm:px-8 pt-5 pb-3 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-4">
          <Seal char="三国" size={60} stamped className="mb-1" />
          <div>
            <h1 className="brush-heading font-brush text-4xl sm:text-5xl font-bold text-slate-50 leading-none">
              {tLoc(UI_TEXT.appTitle, lang)}
            </h1>
            <p className="mt-3 text-[13px] text-slate-300 max-w-2xl leading-relaxed">
              {zh
                ? `公元 214 年，汉室倾颓。你自 2026 年而来，携后世之学与 ${totalHeroes} 位名将的史书档案（${wanderingCount} 位尚在野）——择一主而事之，改写天下。`
                : `214 AD: the Han is falling. You arrive from 2026 with tomorrow's science and the histories of ${totalHeroes} heroes (${wanderingCount} still unsworn). Choose a lord, and rewrite the age.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md ink-panel text-xs text-slate-200 hover:border-amber-300/50 cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-chrono-300" />
            <span>{tLoc(UI_TEXT.aiSettings, lang)}</span>
            <span className="text-chrono-200 uppercase font-semibold">{selectedProviderMode}</span>
            <span className="text-slate-400 hidden sm:inline">
              ({configuredCount > 0 ? `${configuredCount} LLM` : zh ? '离线' : 'offline'})
            </span>
          </button>
          <button
            onClick={onToggleLang}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md ink-panel text-xs font-semibold text-slate-200 hover:border-amber-300/50 cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? '中文' : 'EN'}</span>
          </button>
        </div>
      </header>

      {/* Three hanging scrolls: one lord each, painted large */}
      <main className="relative z-10 flex-1 min-h-0 px-5 sm:px-8 py-3 grid grid-cols-1 md:grid-cols-3 gap-5">
        {(['wei', 'shu', 'wu'] as PlayableFactionId[]).map((fid, idx) => {
          const faction = factions[fid];
          const ownedCities = cities.filter((c) => c.owner === fid);
          const totalTroops = ownedCities.reduce((sum, c) => sum + c.troops, 0);
          const factionHeroes = heroes.filter((h) => h.faction === fid);
          const ruler = factionHeroes.find((h) => h.id === RULER_ID[fid]) ?? factionHeroes[0];
          const featured = factionHeroes.filter((h) => h.id !== ruler?.id).slice(0, 4);

          return (
            <button
              key={fid}
              type="button"
              onClick={() => onSelectFaction(fid, currentProfile)}
              style={{ animationDelay: `${idx * 90}ms` }}
              className="anim-rise group scroll-mount relative min-h-[540px] md:min-h-0 overflow-hidden text-left cursor-pointer hover:-translate-y-1 hover:border-amber-300/80 focus-visible:-translate-y-1"
            >
              {/* The realm behind its lord */}
              <Art
                src={FACTION_ART[fid]}
                alt=""
                className="absolute inset-0 w-full h-full object-cover object-center opacity-40 theme-art-grade"
              />

              {/* The lord: face first, waist-up */}
              {ruler && (
                <Art
                  src={ruler.portrait}
                  alt={tLoc(ruler.name, lang)}
                  className="absolute inset-x-0 top-0 w-full h-[66%] object-cover object-top theme-art-grade transition-transform duration-700 ease-out group-hover:scale-[1.035]"
                  style={{
                    maskImage: 'linear-gradient(to bottom, #000 58%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, #000 58%, transparent 100%)',
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/20 to-slate-950/95" />
              <div
                className="absolute inset-x-0 top-0 h-1.5"
                style={{ background: faction.color }}
              />

              <div className="absolute top-4 left-4 flex items-start gap-2">
                <Seal char={faction.bannerChar} size={50} color={faction.color} />
              </div>
              <span
                className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm bg-slate-950/75 border"
                style={{ color: faction.accent, borderColor: `${faction.color}aa` }}
              >
                {tLoc(UI_TEXT.difficulty[faction.difficulty], lang)}
              </span>

              {/* Name, promise and court */}
              <div className="absolute inset-x-0 bottom-0 p-5 space-y-3">
                <div>
                  <h2 className="font-brush text-3xl font-bold text-slate-50 leading-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                    {tLoc(faction.name, lang)}
                  </h2>
                  <p className="text-[13px] text-amber-200">
                    {tLoc(faction.rulerName, lang)} · {tLoc(faction.rulerTitle, lang)}
                  </p>
                </div>

                <div className="gold-rule" />

                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100 mb-0.5">
                    <Shield className="w-3.5 h-3.5 text-amber-300" />
                    <span>{tLoc(faction.traitName, lang)}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                    {tLoc(faction.traitDesc, lang)}
                  </p>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {featured.map((h) => (
                      <div key={h.id} className="flex flex-col items-center gap-1 w-14">
                        <HeroAvatar hero={h} size="sm" className="!w-12 !h-12" />
                        <span className="text-[10px] text-slate-300 truncate max-w-full">
                          {tLoc(h.name, lang)}
                        </span>
                      </div>
                    ))}
                    {factionHeroes.length - featured.length - 1 > 0 && (
                      <span className="text-[11px] text-slate-400 self-center pb-4">
                        +{factionHeroes.length - featured.length - 1}
                      </span>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-slate-300 space-y-0.5 pb-4 shrink-0">
                    <div className="flex items-center justify-end gap-1">
                      <Castle className="w-3 h-3 text-amber-300" />
                      <span className="font-semibold text-slate-50">{ownedCities.length}</span>
                      <span>{tLoc(UI_TEXT.cities, lang)}</span>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <Swords className="w-3 h-3 text-amber-300" />
                      <span className="font-semibold text-slate-50">
                        {totalTroops.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <Coins className="w-3 h-3 text-amber-300" />
                      <span className="font-semibold text-slate-50">
                        {faction.gold.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className="w-full py-2.5 rounded-md text-sm font-bold flex items-center justify-center gap-2 border transition group-hover:brightness-125"
                  style={{
                    background: `linear-gradient(180deg, ${faction.color}, color-mix(in srgb, ${faction.color} 62%, #000))`,
                    borderColor: faction.accent,
                    color: '#f5eddc',
                  }}
                >
                  <Swords className="w-4 h-4" />
                  <span>
                    {zh ? `投效${faction.rulerName.zh}` : `Pledge to ${faction.rulerName.en}`}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </main>

      {/* The traveller: the one modern thing on the page */}
      <footer className="relative z-10 shrink-0 px-5 sm:px-8 pb-5 pt-2 flex flex-wrap items-center justify-center gap-3 text-xs">
        <Art thumb
          src={currentProfile.portrait}
          alt=""
          className="w-10 h-10 rounded-md object-cover object-top border border-chrono-400/80 shadow-[0_0_14px_rgba(34,211,238,0.3)]"
        />
        <span className="text-chrono-200 font-semibold tracking-wide">
          {zh ? '穿越者 · 2026' : 'The traveller · 2026'}
        </span>
        <input
          type="text"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder={zh ? '你的名字（默认：天命奇士）' : 'Your name (default: Chrono-Strategist)'}
          className="w-64 rounded-md bg-slate-950/80 border border-slate-600 focus:border-chrono-400 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <div className="flex items-center rounded-md border border-slate-600 overflow-hidden">
          {(['male', 'female'] as TravelerAvatarId[]).map((av) => (
            <button
              key={av}
              type="button"
              onClick={() => setAvatar(av)}
              className={`flex items-center gap-1.5 py-1.5 px-2.5 font-semibold cursor-pointer ${
                avatar === av
                  ? 'bg-chrono-400/15 text-chrono-100'
                  : 'bg-slate-950/70 text-slate-400 hover:text-slate-100'
              }`}
            >
              <Art thumb
                src={av === 'female' ? '/portraits/traveler_female.jpg' : '/portraits/traveler_male.jpg'}
                alt=""
                className="w-5 h-5 rounded-full object-cover object-top"
              />
              <span>{av === 'male' ? (zh ? '男' : 'Male') : zh ? '女' : 'Female'}</span>
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
