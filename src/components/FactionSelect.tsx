import { useEffect, useState, type CSSProperties } from 'react';
import {
  Archive,
  Castle,
  Coins,
  Cpu,
  Globe,
  Languages,
  Play,
  Shield,
  Swords,
  UserCheck,
} from 'lucide-react';
import { createInitialCities, createInitialFactions } from '../game/data.js';
import { createDefaultPlayerProfile } from '../game/engine.js';
import { createInitialHeroes } from '../game/heroes.js';
import type { SaveSlotSummary } from '../game/saveSystem.js';
import type {
  AIProviderStatus,
  Language,
  PlayableFactionId,
  PlayerProfile,
  TravelerAvatarId,
} from '../game/types.js';
import { SEASONS_TEXT, UI_TEXT, tLoc } from '../i18n/translations.js';
import type { ClientUser, MultiplayerRoomSummary } from '../services/persistenceClient.js';
import { parallaxProps } from '../utils/parallax.js';
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
  user?: ClientUser | null;
  resumeSoloSummary?: SaveSlotSummary | null;
  resumeMpRoom?: MultiplayerRoomSummary | null;
  totalSaveCount?: number;
  activeMpCount?: number;
  onResumeSolo?: () => void;
  onResumeMpRoom?: (room: MultiplayerRoomSummary) => void;
  onOpenSaves?: () => void;
  onOpenMultiplayer?: () => void;
  onOpenAuth?: () => void;
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
  user,
  resumeSoloSummary,
  resumeMpRoom,
  totalSaveCount = 0,
  activeMpCount = 0,
  onResumeSolo,
  onResumeMpRoom,
  onOpenSaves,
  onOpenMultiplayer,
  onOpenAuth,
}: FactionSelectProps) {
  const [avatar, setAvatar] = useState<TravelerAvatarId>(() => user?.avatar ?? 'male');
  const [playerName, setPlayerName] = useState(() =>
    user && !user.isGuest ? user.displayName : ''
  );
  const zh = lang === 'zh';

  useEffect(() => {
    if (!user) return;
    setAvatar(user.avatar);
    if (!user.isGuest && !playerName) {
      setPlayerName(user.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.isGuest]);

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

        <div className="flex flex-wrap items-center gap-1.5">
          {onOpenMultiplayer && (
            <button
              type="button"
              onClick={onOpenMultiplayer}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md ink-panel text-xs font-semibold text-amber-100 hover:border-amber-300/60 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-amber-300" />
              <span>{tLoc(UI_TEXT.multiplayer, lang)}</span>
              {activeMpCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400/25 text-amber-200 text-[10px] font-bold">
                  {activeMpCount}
                </span>
              )}
            </button>
          )}
          {onOpenSaves && (
            <button
              type="button"
              onClick={onOpenSaves}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md ink-panel text-xs font-semibold text-slate-200 hover:border-amber-300/50 cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5 text-amber-300" />
              <span>{tLoc(UI_TEXT.archives, lang)}</span>
              {totalSaveCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300 text-[10px] font-bold">
                  {totalSaveCount}
                </span>
              )}
            </button>
          )}
          {onOpenAuth && user && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md ink-panel text-xs font-semibold text-chrono-200 hover:border-chrono-400/60 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-chrono-300" />
              <span>
                {user.isGuest ? (zh ? '游客 · 登录/绑定' : 'Guest · Sign In') : `@${user.username}`}
              </span>
            </button>
          )}
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

      {/* Continue Chronicle Bar (Solo Save or Active Multiplayer Room) */}
      {(resumeSoloSummary || resumeMpRoom) && (
        <div className="relative z-10 shrink-0 px-5 sm:px-8 pb-1 flex flex-wrap gap-2.5">
          {resumeSoloSummary && onResumeSolo && (
            <div className="flex-1 min-w-[290px] ink-panel gold-border-glow rounded-xl px-4 py-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Seal
                  char={factions[resumeSoloSummary.playerFaction].bannerChar}
                  size={34}
                  color={factions[resumeSoloSummary.playerFaction].color}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    <span>{tLoc(UI_TEXT.continueChronicle, lang)}</span>
                    {resumeSoloSummary.hasActiveBattle && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-500/25 text-rose-200 border border-rose-400/40 text-[10px]">
                        {zh ? '⚔️ 8×8 沙盘激战中' : '⚔️ Mid-8×8 Battle'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-200 truncate">
                    <span className="font-bold text-slate-50">
                      {tLoc(factions[resumeSoloSummary.playerFaction].name, lang)}
                    </span>{' '}
                    ·{' '}
                    {zh
                      ? `${resumeSoloSummary.year}年${SEASONS_TEXT[resumeSoloSummary.season].zh}（第 ${resumeSoloSummary.turn} 季）· ${resumeSoloSummary.citiesOwned}/${resumeSoloSummary.totalCities} 城`
                      : `${resumeSoloSummary.year} AD ${SEASONS_TEXT[resumeSoloSummary.season].en} (T${resumeSoloSummary.turn}) · ${resumeSoloSummary.citiesOwned}/${resumeSoloSummary.totalCities} Cities`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onResumeSolo}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg btn-gold text-xs font-bold cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{tLoc(UI_TEXT.resumeCampaign, lang)}</span>
                </button>
              </div>
            </div>
          )}

          {resumeMpRoom && onResumeMpRoom && (
            <div className="flex-1 min-w-[290px] ink-panel rounded-xl border border-chrono-400/40 px-4 py-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {resumeMpRoom.myFaction && (
                  <Seal
                    char={factions[resumeMpRoom.myFaction].bannerChar}
                    size={34}
                    color={factions[resumeMpRoom.myFaction].color}
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-chrono-200">
                    <span>
                      {zh ? `联机战局 #${resumeMpRoom.code}` : `Multiplayer #${resumeMpRoom.code}`}
                    </span>
                    {resumeMpRoom.myFaction === resumeMpRoom.activeFaction &&
                      resumeMpRoom.status === 'active' && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-400/25 text-amber-100 border border-amber-300/60 text-[10px]">
                          {zh ? '⚡ 轮到你下令' : '⚡ YOUR TURN'}
                        </span>
                      )}
                  </div>
                  <div className="text-xs text-slate-200 truncate">
                    <span className="font-bold text-slate-50">{resumeMpRoom.name}</span> ·{' '}
                    {zh
                      ? `${resumeMpRoom.year}年${SEASONS_TEXT[resumeMpRoom.season].zh}（第 ${resumeMpRoom.turn} 季）`
                      : `${resumeMpRoom.year} AD ${SEASONS_TEXT[resumeMpRoom.season].en} (T${resumeMpRoom.turn})`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onResumeMpRoom(resumeMpRoom)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg btn-gold text-xs font-bold cursor-pointer shrink-0"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{zh ? '进入联机' : 'Enter Room'}</span>
              </button>
            </div>
          )}
        </div>
      )}

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
              {...parallaxProps}
              style={{ animationDelay: `${idx * 90}ms` }}
              className="anim-rise group scroll-mount relative min-h-[540px] md:min-h-0 overflow-hidden text-left cursor-pointer hover:-translate-y-1 hover:border-amber-300/80 focus-visible:-translate-y-1"
            >
              {/* The realm behind its lord */}
              <Art
                src={FACTION_ART[fid]}
                alt=""
                className="parallax-far absolute inset-0 w-full h-full object-cover object-center opacity-40 theme-art-grade"
              />

              {/* The lord: face first, waist-up */}
              {ruler && (
                <Art
                  src={ruler.portrait}
                  alt={tLoc(ruler.name, lang)}
                  className="parallax absolute inset-x-0 top-0 w-full h-[66%] object-cover object-top theme-art-grade"
                  style={{
                    maskImage: 'linear-gradient(to bottom, #000 58%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, #000 58%, transparent 100%)',
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/20 to-slate-950/95" />
              {/* Subtle realm atmosphere: northern frost/sparks for Wei, bamboo mist for Shu, river embers for Wu */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((m) => {
                  const moteColor =
                    fid === 'wei'
                      ? 'rgba(216, 232, 255, 0.85)'
                      : fid === 'shu'
                        ? 'rgba(182, 236, 198, 0.8)'
                        : 'rgba(255, 174, 120, 0.85)';
                  const moteGlow =
                    fid === 'wei'
                      ? '0 0 6px rgba(130, 180, 240, 0.7)'
                      : fid === 'shu'
                        ? '0 0 7px rgba(105, 198, 136, 0.65)'
                        : '0 0 7px rgba(235, 98, 60, 0.75)';
                  const left = 12 + ((m * 17 + idx * 11) % 76);
                  const top = 16 + ((m * 23 + idx * 7) % 52);
                  const size = fid === 'shu' ? 4 + (m % 3) : 2.5 + (m % 3);
                  return (
                    <span
                      key={m}
                      className="kingdom-mote absolute rounded-full"
                      style={
                        {
                          left: `${left}%`,
                          top: `${top}%`,
                          width: `${size}px`,
                          height: `${size}px`,
                          background: moteColor,
                          boxShadow: moteGlow,
                          '--mote-dx': `${fid === 'wei' ? -14 + m * 5 : 12 + m * 4}px`,
                          '--mote-dy': `${fid === 'wei' ? 54 : -56}px`,
                          '--mote-dur': `${6.4 + m * 0.85}s`,
                          '--mote-delay': `${-m * 1.15}s`,
                          '--mote-alpha': fid === 'shu' ? 0.42 : 0.58,
                        } as CSSProperties
                      }
                    />
                  );
                })}
              </div>
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
