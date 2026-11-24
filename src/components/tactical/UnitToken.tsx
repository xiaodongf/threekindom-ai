import { useEffect, useState, type CSSProperties } from 'react';
import { Anchor, Crosshair, Shield, Wind } from 'lucide-react';
import type { TacticalUnit } from '../../game/tacticalTypes.js';
import type { FactionId, Language } from '../../game/types.js';
import { tLoc } from '../../i18n/translations.js';
import { Art } from '../ui/Art.js';

const FACTION_TOKEN: Record<FactionId, { rim: string; plinth: string; badge: string }> = {
  wei: { rim: '#8fb2d6', plinth: '#3a5f8a', badge: '魏' },
  shu: { rim: '#82ba90', plinth: '#346a43', badge: '蜀' },
  wu: { rim: '#e18a77', plinth: '#a53323', badge: '吴' },
  neutral: { rim: '#c9bda2', plinth: '#6e6453', badge: '群' },
};

/**
 * Troop bar that shows a loss before it takes it away: the lost part stays pale for a beat, then
 * drains. With `preview` set it also marks what a pending attack is expected to remove.
 */
export function DrainBar({
  ratio,
  ally,
  preview,
}: {
  ratio: number;
  ally: boolean;
  /** Expected ratio after the attack being considered. */
  preview?: number | null;
}) {
  const now = Math.max(0, Math.min(1, ratio));
  const [lag, setLag] = useState(now);

  useEffect(() => {
    if (now >= lag) {
      setLag(now);
      return;
    }
    const timer = window.setTimeout(() => setLag(now), 340);
    return () => window.clearTimeout(timer);
  }, [now, lag]);

  const after = preview == null ? null : Math.max(0, Math.min(now, preview));

  return (
    <div className="relative h-[5px] w-full bg-black/85 border border-black/70 overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-slate-50/90"
        style={{ width: `${lag * 100}%`, transition: 'width 520ms cubic-bezier(0.22, 1, 0.36, 1)' }}
      />
      <div
        className={`absolute inset-y-0 left-0 ${ally ? 'bg-emerald-400' : 'bg-rose-400'}`}
        style={{ width: `${now * 100}%` }}
      />
      {after !== null && after < now && (
        <div
          className="anim-preview-blink absolute inset-y-0 bg-slate-50"
          style={{ left: `${after * 100}%`, width: `${(now - after) * 100}%` }}
        />
      )}
      {[0.25, 0.5, 0.75].map((tick) => (
        <span
          key={tick}
          className="absolute inset-y-0 w-px bg-black/55"
          style={{ left: `${tick * 100}%` }}
        />
      ))}
    </div>
  );
}

interface UnitTokenProps {
  unit: TacticalUnit;
  lang: Language;
  ally: boolean;
  spent: boolean;
  /** 'lunge' while striking, 'hit' while being struck; direction is the unit vector of the blow. */
  motion?: { kind: 'lunge' | 'hit'; dx: number; dy: number; key: string } | null;
  previewRatio?: number | null;
  previewLoss?: number | null;
}

const SQUAD_PORTRAIT: Record<TacticalUnit['unitClass'], string> = {
  infantry: '/portraits/unit_infantry.jpg',
  cavalry: '/portraits/unit_cavalry.jpg',
  archer: '/portraits/unit_archer.jpg',
  naval: '/portraits/unit_naval.jpg',
};

/**
 * A squad on the board: its general (or squad captain) as a bust on a plinth in the realm's colour,
 * a clear troop-type glyph, a pennant whose droop is the squad's morale, and its strength as a bar.
 */
export function UnitToken({ unit, lang, ally, spent, motion, previewRatio, previewLoss }: UnitTokenProps) {
  const look = FACTION_TOKEN[unit.faction];
  const morale = unit.morale >= 60 ? 'steady' : unit.morale >= 30 ? 'wavering' : 'breaking';
  const pennant = morale === 'steady' ? '#5c9f6e' : morale === 'wavering' ? '#e0b53a' : '#d4614c';
  const ClassIcon =
    unit.unitClass === 'naval'
      ? Anchor
      : unit.unitClass === 'archer'
        ? Crosshair
        : unit.unitClass === 'cavalry'
          ? Wind
          : Shield;
  const style = (motion ? { '--lx': motion.dx, '--ly': motion.dy } : {}) as CSSProperties;
  const portraitSrc = unit.portrait || SQUAD_PORTRAIT[unit.unitClass];

  return (
    <div
      key={motion?.key ?? 'rest'}
      style={style}
      className={`unit-token relative z-10 w-full h-full flex flex-col items-center justify-end pb-[2%] ${
        spent ? 'is-spent' : ''
      } ${motion ? (motion.kind === 'lunge' ? 'anim-lunge' : 'anim-hit') : ''}`}
    >
      <div className="relative w-[54%] flex flex-col items-center">
        {/* Morale pennant */}
        <span
          title={`${lang === 'zh' ? '士气' : 'Morale'} ${unit.morale}`}
          className="absolute -top-[4%] -left-[6%] z-20 w-[2.5px] h-[48%] bg-[#2c2018] rounded-sm"
        >
          <span
            className="absolute top-0 left-[2.5px] block w-[10px] h-[8px] origin-left"
            style={{
              background: pennant,
              clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
              transform:
                morale === 'steady' ? 'none' : morale === 'wavering' ? 'rotate(18deg)' : 'rotate(58deg)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
            }}
          />
        </span>

        {/* Bust — square 1:1 framing keeps full helmet headroom and guarantees vertical fit inside 1/8th cell */}
        <div
          className="relative w-full aspect-square overflow-hidden border-2 shadow-[0_4px_9px_rgba(0,0,0,0.82)] bg-[#14110d]"
          style={{ borderColor: look.rim, borderRadius: '44% 44% 12% 12% / 40% 40% 10% 10%' }}
        >
          <Art
            thumb
            src={portraitSrc}
            alt={tLoc(unit.name, lang)}
            className="w-full h-full object-cover object-top"
          />
          {!unit.portrait && (
            <span
              className="absolute bottom-0 left-0 px-1 py-px text-[8px] leading-none font-brush text-slate-50 border-t border-r border-black/60"
              style={{ background: `${look.plinth}e6` }}
            >
              {look.badge}
            </span>
          )}
        </div>

        {/* Plinth */}
        <div
          className="relative -mt-[10%] w-[124%] h-[7px] rounded-[50%] border border-black/70 shadow-[0_3px_5px_rgba(0,0,0,0.75)]"
          style={{ background: `linear-gradient(180deg, ${look.rim}, ${look.plinth})` }}
        />

        {/* Troop type badge */}
        <span
          className="absolute -right-[22%] bottom-[1px] z-20 w-[17px] h-[17px] rounded-full border flex items-center justify-center bg-[#14110d] text-slate-50"
          style={{ borderColor: look.rim }}
        >
          <ClassIcon className="w-2.5 h-2.5" />
        </span>

        {previewLoss != null && previewLoss > 0 && (
          <span className="absolute -top-[20%] left-1/2 -translate-x-1/2 z-30 px-1.5 py-px rounded-sm bg-black/90 border border-rose-300/80 text-[10px] font-bold text-rose-200 whitespace-nowrap">
            −{previewLoss.toLocaleString()}
          </span>
        )}
      </div>

      <div className="w-[84%] mt-[2px] space-y-[1.5px]">
        <DrainBar ratio={unit.troops / Math.max(1, unit.maxTroops)} ally={ally} preview={previewRatio} />
        <div className="text-[8.5px] leading-[1.15] font-bold text-slate-50 text-center truncate bg-black/75 px-0.5 rounded-[1px]">
          {tLoc(unit.name, lang)}
        </div>
      </div>

      {(unit.isHiddenAmbush ||
        unit.disorderedTurns > 0 ||
        unit.deathGroundTurns > 0 ||
        unit.wffmStance) && (
        <div className="absolute top-0.5 right-0.5 z-20 flex gap-0.5 text-[9px] bg-black/75 px-1 rounded-sm">
          {unit.isHiddenAmbush && <span title="Ambush">🌲</span>}
          {unit.disorderedTurns > 0 && <span title="Disordered">💫</span>}
          {unit.deathGroundTurns > 0 && <span title="Death Ground">🩸</span>}
          {unit.wffmStance === 'wind' && <span title="Wind">🌪️</span>}
          {unit.wffmStance === 'fire' && <span title="Fire">🔥</span>}
          {unit.wffmStance === 'mountain' && <span title="Mountain">⛰️</span>}
        </div>
      )}
    </div>
  );
}
