import {
  ArrowRightLeft,
  Building2,
  Coins,
  MapPin,
  Shield,
  Sparkles,
  Swords,
  UserPlus,
  Users,
  Wheat,
} from 'lucide-react';
import { ACTION_COSTS } from '../game/data.js';
import {
  getActiveBondsForHeroes,
  getCityGenerals,
  getCityWanderingHeroes,
  isTruceActive,
} from '../game/engine.js';
import type { GameState, Language } from '../game/types.js';
import { TERRAIN_TEXT, UI_TEXT, tLoc } from '../i18n/translations.js';
import { HeroAvatar } from './HeroAvatar.js';

interface CityPanelProps {
  state: GameState;
  lang: Language;
  selectedCityId: string | null;
  onDevelop: (cityId: string) => void;
  onFortify: (cityId: string) => void;
  onRecruit: (cityId: string) => void;
  onOpenAttack: (fromCityId: string, toCityId: string) => void;
  onReinforce: (fromCityId: string, toCityId: string) => void;
  onSelectCity: (cityId: string) => void;
  onInspectHero: (heroId: string) => void;
  onRecruitWanderingHero: (heroId: string) => void;
}

export function CityPanel({
  state,
  lang,
  selectedCityId,
  onDevelop,
  onFortify,
  onRecruit,
  onOpenAttack,
  onReinforce,
  onSelectCity,
  onInspectHero,
  onRecruitWanderingHero,
}: CityPanelProps) {
  if (!selectedCityId || !state.cities[selectedCityId]) {
    return (
      <div className="p-6 text-center text-sm text-[#9ea3ae] flex flex-col items-center justify-center h-full gap-3">
        <MapPin className="w-8 h-8 text-[#d4a853]/60" />
        <p>{tLoc(UI_TEXT.selectCityPrompt, lang)}</p>
      </div>
    );
  }

  const city = state.cities[selectedCityId];
  const isOwned = city.owner === state.playerFaction;
  const playerFaction = state.factions[state.playerFaction];
  const generals = getCityGenerals(state, city.id);
  const wanderingHere = getCityWanderingHeroes(state, city.id);
  const cityBonds = getActiveBondsForHeroes(generals.map((g) => g.id));

  const recruitGold =
    state.playerFaction === 'wei'
      ? Math.round(ACTION_COSTS.recruitGold * 0.85)
      : ACTION_COSTS.recruitGold;

  const canDevelop =
    isOwned &&
    state.actionPoints > 0 &&
    city.development < 5 &&
    playerFaction.gold >= ACTION_COSTS.developGold;
  const canFortify =
    isOwned &&
    state.actionPoints > 0 &&
    city.defense < 5 &&
    playerFaction.gold >= ACTION_COSTS.fortifyGold;
  const canRecruit =
    isOwned &&
    state.actionPoints > 0 &&
    playerFaction.gold >= recruitGold &&
    playerFaction.food >= ACTION_COSTS.recruitFood;

  const ownerLabel =
    city.owner === 'neutral'
      ? tLoc(UI_TEXT.neutralOwner, lang)
      : tLoc(state.factions[city.owner].name, lang);

  const ownerColor =
    city.owner === 'neutral' ? '#a8a29e' : state.factions[city.owner].color;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-[580px]">
      {/* City Header */}
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl font-bold text-[#f7efe0]">
              {tLoc(city.name, lang)}
            </h3>
            <span className="text-xs text-[#9ea3ae]">({tLoc(city.region, lang)})</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ownerColor }} />
            <span className="text-xs font-medium text-[#d4cfc0]">{ownerLabel}</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-[#a8b0bf]">
              {tLoc(TERRAIN_TEXT[city.terrain], lang)}
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[#9ea3ae]">
            {tLoc(UI_TEXT.garrison, lang)}
          </div>
          <div className="text-lg font-extrabold text-[#f7e7be]">
            {city.troops.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-[#0d1015]/80 border border-white/5 p-2.5">
          <div className="flex items-center justify-between text-xs text-[#9ea3ae] mb-1.5">
            <span>{tLoc(UI_TEXT.prosperity, lang)}</span>
            <span className="text-[#d4a853] font-semibold">Lv.{city.development}/5</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((lv) => (
              <div
                key={lv}
                className={`h-1.5 flex-1 rounded-full ${
                  lv <= city.development ? 'bg-[#d4a853]' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-[#0d1015]/80 border border-white/5 p-2.5">
          <div className="flex items-center justify-between text-xs text-[#9ea3ae] mb-1.5">
            <span>{tLoc(UI_TEXT.defense, lang)}</span>
            <span className="text-sky-400 font-semibold">Lv.{city.defense}/5</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((lv) => (
              <div
                key={lv}
                className={`h-1.5 flex-1 rounded-full ${
                  lv <= city.defense ? 'bg-sky-400' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Wandering Legends Visiting This City! */}
      {wanderingHere.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-[#d4a853]/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#f7e7be]">
            <Sparkles className="w-3.5 h-3.5 text-[#d4a853]" />
            <span>
              {lang === 'zh' ? '在野绝世名将现身此城！' : 'Wandering Legend Spotted Here!'}
            </span>
          </div>
          {wanderingHere.map((wh) => (
            <div key={wh.id} className="flex items-center justify-between gap-2">
              <button
                onClick={() => onInspectHero(wh.id)}
                className="flex items-center gap-2.5 text-left hover:opacity-90 cursor-pointer"
              >
                <HeroAvatar hero={wh} size="sm" />
                <div>
                  <div className="text-xs font-bold text-[#f7efe0]">{tLoc(wh.name, lang)}</div>
                  <div className="text-[10px] text-amber-200/80">
                    {lang === 'zh' ? '武' : 'W'}{wh.war} · {lang === 'zh' ? '智' : 'I'}{wh.intellect} ·{' '}
                    {lang === 'zh' ? '统' : 'C'}{wh.command}
                  </div>
                </div>
              </button>
              <button
                disabled={state.actionPoints < 1}
                onClick={() => onRecruitWanderingHero(wh.id)}
                className="px-2.5 py-1.5 rounded-lg bg-[#d4a853] hover:bg-[#e5bc69] disabled:opacity-40 text-[#11151d] font-bold text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
              >
                <UserPlus className="w-3 h-3" />
                <span>{lang === 'zh' ? '招贤 (1 AP)' : 'Recruit'}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stationed Generals with Painted Portraits */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#d4a853]">
            {tLoc(UI_TEXT.stationedGenerals, lang)}
          </span>
          {cityBonds.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-300">
              {cityBonds.map((b) => tLoc(b.name, lang)).join(' · ')}
            </span>
          )}
        </div>
        {generals.length === 0 ? (
          <div className="text-xs text-[#8b92a1] italic px-1">
            {tLoc(UI_TEXT.noGenerals, lang)}
          </div>
        ) : (
          <div className="space-y-2">
            {generals.map((g) => (
              <button
                key={g.id}
                onClick={() => onInspectHero(g.id)}
                className="w-full flex items-center justify-between rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-[#d4a853]/50 px-2.5 py-2 transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <HeroAvatar hero={g} size="sm" showLevel />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#f7efe0] truncate">
                      {tLoc(g.name, lang)}
                    </div>
                    <div className="text-[10px] text-[#9ea3ae] truncate">{tLoc(g.title, lang)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
                  <span className="text-rose-400">{lang === 'zh' ? '武' : 'W'}{g.war}</span>
                  <span className="text-sky-400">{lang === 'zh' ? '智' : 'I'}{g.intellect}</span>
                  <span className="text-amber-300">{lang === 'zh' ? '统' : 'C'}{g.command}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Domestic Actions */}
      {isOwned && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#d4a853] mb-2">
            {lang === 'zh' ? '城池内政（消耗 1 行动力）' : 'Domestic Orders (1 AP)'}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onRecruit(city.id)}
              disabled={!canRecruit}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 disabled:opacity-40 text-xs transition cursor-pointer"
            >
              <Users className="w-4 h-4 text-emerald-300" />
              <span className="font-semibold text-[#f5ecd7]">{tLoc(UI_TEXT.recruit, lang)}</span>
              <span className="text-[10px] text-[#b8b2a2] flex items-center gap-0.5">
                <Coins className="w-2.5 h-2.5 text-yellow-400" />
                {recruitGold}
                <Wheat className="w-2.5 h-2.5 text-amber-400 ml-0.5" />
                {ACTION_COSTS.recruitFood}
              </span>
            </button>

            <button
              onClick={() => onDevelop(city.id)}
              disabled={!canDevelop}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 disabled:opacity-40 text-xs transition cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-amber-300" />
              <span className="font-semibold text-[#f5ecd7]">{tLoc(UI_TEXT.develop, lang)}</span>
              <span className="text-[10px] text-[#b8b2a2] flex items-center gap-0.5">
                <Coins className="w-2.5 h-2.5 text-yellow-400" />
                {ACTION_COSTS.developGold}
              </span>
            </button>

            <button
              onClick={() => onFortify(city.id)}
              disabled={!canFortify}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 disabled:opacity-40 text-xs transition cursor-pointer"
            >
              <Shield className="w-4 h-4 text-sky-300" />
              <span className="font-semibold text-[#f5ecd7]">{tLoc(UI_TEXT.fortify, lang)}</span>
              <span className="text-[10px] text-[#b8b2a2] flex items-center gap-0.5">
                <Coins className="w-2.5 h-2.5 text-yellow-400" />
                {ACTION_COSTS.fortifyGold}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Adjacent Cities / March Orders */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-[#d4a853] mb-2">
          {tLoc(UI_TEXT.marchOrders, lang)}
        </div>
        <div className="space-y-2">
          {city.neighbors.map((nid) => {
            const target = state.cities[nid];
            if (!target) return null;
            const targetIsOwn = target.owner === state.playerFaction;
            const truce =
              isOwned &&
              !targetIsOwn &&
              target.owner !== 'neutral' &&
              isTruceActive(state, state.playerFaction, target.owner);

            return (
              <div
                key={nid}
                className="flex items-center justify-between gap-2 rounded-xl bg-[#0d1015]/80 border border-white/8 px-3 py-2"
              >
                <button
                  onClick={() => onSelectCity(nid)}
                  className="text-left hover:underline cursor-pointer"
                >
                  <div className="text-xs font-semibold text-[#f5ecd7] flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor:
                          target.owner === 'neutral'
                            ? '#a8a29e'
                            : state.factions[target.owner].color,
                      }}
                    />
                    <span>{tLoc(target.name, lang)}</span>
                  </div>
                  <div className="text-[11px] text-[#9ea3ae]">
                    {tLoc(UI_TEXT.garrison, lang)}: {target.troops.toLocaleString()} ·{' '}
                    {tLoc(TERRAIN_TEXT[target.terrain], lang)}
                  </div>
                  {truce && (
                    <div className="text-[10px] text-amber-400 mt-0.5">
                      {tLoc(UI_TEXT.truceBlocked, lang)}
                    </div>
                  )}
                </button>

                {isOwned && (
                  <div className="shrink-0">
                    {targetIsOwn ? (
                      <button
                        onClick={() => onReinforce(city.id, target.id)}
                        disabled={state.actionPoints < 1 || city.troops <= 2500}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600/25 hover:bg-sky-600/40 border border-sky-400/40 disabled:opacity-40 text-xs font-semibold text-sky-200 transition cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>{tLoc(UI_TEXT.reinforce, lang)}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onOpenAttack(city.id, target.id)}
                        disabled={state.actionPoints < 1 || city.troops <= 2000}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#c84b31]/30 hover:bg-[#c84b31]/50 border border-[#c84b31]/60 disabled:opacity-40 text-xs font-semibold text-orange-100 transition cursor-pointer"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        <span>{tLoc(UI_TEXT.attack, lang)}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
