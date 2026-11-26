import { useState } from 'react';
import { ChevronDown, Landmark, ScrollText } from 'lucide-react';
import { PROVINCES, PROVINCE_ORDER } from '../game/data.js';
import type { FactionId, GameState, Language } from '../game/types.js';
import { tLoc } from '../i18n/translations.js';

interface ProvinceRegisterProps {
  state: GameState;
  lang: Language;
  selectedCityId: string | null;
  onSelectCity: (cityId: string) => void;
  /** Opens the realm table: every city the player holds, its governor and the governor's work. */
  onOpenRealm: () => void;
}

const FACTION_CSS: Record<FactionId, string> = {
  wei: '#4c78a8',
  shu: '#438554',
  wu: '#c2432f',
  neutral: '#9a8f78',
};
const FACTION_BADGE: Record<FactionId, string> = { wei: '魏', shu: '蜀', wu: '吴', neutral: '群' };

/**
 * The realm as a register: every city under its province, with who holds it and how many men.
 * It is the list form of the province map, and the quickest way to reach a city by name.
 */
export function ProvinceRegister({ state, lang, selectedCityId, onSelectCity, onOpenRealm }: ProvinceRegisterProps) {
  const zh = lang === 'zh';
  const selected = selectedCityId ? state.cities[selectedCityId] : undefined;
  // Open while nothing is chosen; once a city is on the sheet the register folds to one line
  const [open, setOpen] = useState(!selected);
  const cities = Object.values(state.cities);

  return (
    <section className="border-b border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-2 text-xs text-[#d9d2c2] hover:bg-white/5 cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          <ScrollText className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
          <span className="font-semibold">{zh ? '州郡名册' : 'Province register'}</span>
          <span className="text-[#9ea3ae] truncate">
            {selected
              ? `${tLoc(PROVINCES[selected.province].name, lang)} · ${tLoc(selected.name, lang)}`
              : zh
                ? `十一州 · ${cities.length} 城`
                : `11 provinces · ${cities.length} cities`}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-[#9ea3ae] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div className="px-4 pb-2">
        <button
          type="button"
          onClick={onOpenRealm}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-amber-400/35 bg-amber-400/10 hover:bg-amber-400/20 px-2 py-1.5 text-xs font-semibold text-amber-100 cursor-pointer"
        >
          <Landmark className="w-3.5 h-3.5" />
          {zh ? '治所总览：太守与政务' : 'Realm table: governors and their work'}
        </button>
      </div>

      {open && (
        <div className="px-4 pb-3 space-y-2.5">
          {PROVINCE_ORDER.map((id) => {
            const inProvince = cities.filter((c) => c.province === id);
            const counts = (['wei', 'shu', 'wu', 'neutral'] as FactionId[])
              .map((fid) => ({ fid, n: inProvince.filter((c) => c.owner === fid).length }))
              .filter((row) => row.n > 0);
            return (
              <div key={id}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <h4
                    className={
                      zh
                        ? 'font-brush text-[15px] leading-none text-[#f7efe0]'
                        : 'font-display text-[13px] font-bold text-[#f7efe0]'
                    }
                  >
                    {tLoc(PROVINCES[id].name, lang)}
                  </h4>
                  <span className="flex items-center gap-2 text-[11px] font-semibold text-[#c9c2b2]">
                    {counts.map(({ fid, n }) => (
                      <span key={fid} className="inline-flex items-center gap-1">
                        <span
                          className="inline-block w-2 h-2 rounded-[2px]"
                          style={{ backgroundColor: FACTION_CSS[fid] }}
                        />
                        {zh
                          ? `${FACTION_BADGE[fid]}${n}`
                          : `${fid === 'neutral' ? 'Neutral' : tLoc(state.factions[fid].shortName, lang)} ${n}`}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {inProvince.map((city) => {
                    const isSelected = city.id === selectedCityId;
                    const mine = city.owner === state.playerFaction;
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => onSelectCity(city.id)}
                        className={`flex items-stretch rounded-sm overflow-hidden border text-left cursor-pointer ${
                          isSelected
                            ? 'border-amber-300 bg-amber-300/10'
                            : 'border-white/10 bg-black/20 hover:border-amber-300/50'
                        }`}
                      >
                        <span className="w-1 shrink-0" style={{ backgroundColor: FACTION_CSS[city.owner] }} />
                        <span className="flex-1 min-w-0 flex items-center justify-between gap-2 px-2 py-1">
                          <span
                            className={`truncate text-xs ${mine ? 'font-bold text-[#f7efe0]' : 'text-[#d9d2c2]'}`}
                          >
                            {city.isCapital && <span className="mr-1 text-amber-400">★</span>}
                            {tLoc(city.name, lang)}
                          </span>
                          <span className="text-[11px] tabular-nums text-[#9ea3ae]">
                            {city.troops.toLocaleString()}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
