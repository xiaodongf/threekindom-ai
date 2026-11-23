import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../utils/motion.js';

interface CountUpProps {
  value: number;
  /** Formats the number on screen; defaults to a grouped integer. */
  format?: (n: number) => string;
  /** Show a "+120" / "-80" marker that lifts off the number when it changes. */
  showDelta?: boolean;
  className?: string;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString();

/**
 * A number that counts to its new value instead of snapping, so a change in gold, grain or troops
 * is seen as well as read. The length of the count scales with the size of the change.
 */
export function CountUp({ value, format = defaultFormat, showDelta = false, className = '' }: CountUpProps) {
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState<{ amount: number; key: number } | null>(null);
  const shownRef = useRef(value);
  const keyRef = useRef(0);

  useEffect(() => {
    const from = shownRef.current;
    const diff = value - from;
    if (diff === 0) return;

    if (showDelta) {
      keyRef.current += 1;
      setDelta({ amount: diff, key: keyRef.current });
    }

    if (prefersReducedMotion()) {
      shownRef.current = value;
      setShown(value);
      return;
    }

    const duration = Math.min(900, 260 + Math.log10(Math.abs(diff) + 1) * 190);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + diff * eased;
      shownRef.current = current;
      setShown(current);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        shownRef.current = value;
        setShown(value);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, showDelta]);

  useEffect(() => {
    if (!delta) return;
    const timer = window.setTimeout(() => setDelta(null), 1300);
    return () => window.clearTimeout(timer);
  }, [delta]);

  return (
    <span className={`relative inline-block ${className}`}>
      <span>{format(shown)}</span>
      {delta && (
        <span
          key={delta.key}
          aria-hidden
          className={`anim-delta pointer-events-none absolute left-1/2 -translate-x-1/2 -top-3.5 whitespace-nowrap text-[10px] font-bold ${
            delta.amount > 0 ? 'text-emerald-300' : 'text-rose-300'
          }`}
        >
          {delta.amount > 0 ? '+' : '−'}
          {format(Math.abs(delta.amount))}
        </span>
      )}
    </span>
  );
}
