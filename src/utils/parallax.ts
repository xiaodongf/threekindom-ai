import type { MouseEvent } from 'react';
import { prefersReducedMotion } from './motion.js';

/**
 * Pointer parallax for painted art. Spread these on a container; images inside with the class
 * `parallax` (near layer) or `parallax-far` (backdrop) shift against each other as the pointer
 * moves, which gives a flat painting a little depth. Positions go straight to CSS variables, so
 * no React state changes while the pointer moves.
 */
export const parallaxProps = {
  onMouseMove(e: MouseEvent<HTMLElement>) {
    if (prefersReducedMotion()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
    el.style.setProperty('--py', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
  },
  onMouseLeave(e: MouseEvent<HTMLElement>) {
    e.currentTarget.style.setProperty('--px', '0');
    e.currentTarget.style.setProperty('--py', '0');
  },
};
