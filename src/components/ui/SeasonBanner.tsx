import { useEffect, useRef, useState } from 'react';
import type { Language, Season } from '../../game/types.js';
import { prefersReducedMotion } from '../../utils/motion.js';
import { Seal } from './Seal.js';

interface SeasonBannerProps {
  turn: number;
  year: number;
  season: Season;
  lang: Language;
}

const SEASON_CHAR: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const SEASON_EN: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};
const SEASON_LINE: Record<Season, { en: string; zh: string }> = {
  spring: { en: 'The thaw opens the roads.', zh: '冰雪消融，驿道复通。' },
  summer: { en: 'Rivers run high; granaries fill.', zh: '江河水涨，仓廪渐实。' },
  autumn: { en: 'Harvest is in. Armies march.', zh: '秋收已毕，正宜用兵。' },
  winter: { en: 'Snow closes the passes.', zh: '大雪封山，关隘难行。' },
};

/**
 * A brush stroke and a seal mark the turn of the season, just under the top strip so it never
 * covers an event that opens with the new turn. It never blocks input and is gone in under two
 * seconds; with reduced motion it is skipped entirely (the date in the top strip
 * already carries the information).
 */
export function SeasonBanner({ turn, year, season, lang }: SeasonBannerProps) {
  const [visible, setVisible] = useState<{ key: number; leaving: boolean } | null>(null);
  const lastTurn = useRef(turn);

  useEffect(() => {
    if (turn === lastTurn.current) return;
    lastTurn.current = turn;
    if (prefersReducedMotion()) return;
    setVisible({ key: turn, leaving: false });
    const leave = window.setTimeout(() => setVisible({ key: turn, leaving: true }), 1500);
    const done = window.setTimeout(() => setVisible(null), 1800);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, [turn]);

  if (!visible) return null;

  return (
    <div
      key={visible.key}
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-14 z-[60] flex justify-center ${
        visible.leaving ? 'anim-banner-out' : ''
      }`}
    >
      <div className="relative flex items-center gap-4 pl-14 pr-20 py-4">
        <div
          className="anim-brush absolute inset-0"
          style={{
            background: 'var(--tex-brush-banner) center / 100% 100% no-repeat',
            filter: 'drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55))',
          }}
        />
        <Seal char={SEASON_CHAR[season]} size={46} stamped className="relative [animation-delay:240ms]" />
        <div className="relative anim-rise [animation-delay:160ms]">
          <div className="font-brush text-2xl font-bold text-slate-50 leading-none">
            {lang === 'zh' ? `${year}年 · ${SEASON_CHAR[season]}` : `${SEASON_EN[season]}, ${year} AD`}
          </div>
          <div className="mt-1 text-xs text-amber-200 tracking-wide">
            {SEASON_LINE[season][lang === 'zh' ? 'zh' : 'en']}
          </div>
        </div>
      </div>
    </div>
  );
}
