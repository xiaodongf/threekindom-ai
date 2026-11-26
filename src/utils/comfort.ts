import { useSyncExternalStore } from 'react';
import { prefersReducedMotion } from './motion.js';

/**
 * Comfort switches for battle effects.
 *
 * Screen shake and bright flashes are the two effects most likely to make someone unwell, so
 * each has its own switch, separate from the general motion setting: a player may want the
 * camera to stay still but keep the flashes, or the other way round. Both default to on, or to
 * off when the player (or their system) has asked for reduced motion.
 */
export interface Comfort {
  shake: boolean;
  flash: boolean;
}

const STORAGE_KEY = 'tk_comfort';
let current: Comfort | null = null;
const listeners = new Set<() => void>();

function read(): Comfort {
  const calm = prefersReducedMotion();
  const fallback: Comfort = { shake: !calm, flash: !calm };
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Comfort> | null;
    if (saved && typeof saved === 'object') {
      return {
        shake: typeof saved.shake === 'boolean' ? saved.shake : fallback.shake,
        flash: typeof saved.flash === 'boolean' ? saved.flash : fallback.flash,
      };
    }
  } catch {
    /* nothing saved, or storage unavailable: keep the defaults */
  }
  return fallback;
}

export function getComfort(): Comfort {
  if (current === null) current = read();
  return current;
}

export function setComfort(next: Partial<Comfort>): void {
  current = { ...getComfort(), ...next };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function useComfort(): Comfort {
  return useSyncExternalStore(subscribe, getComfort, getComfort);
}

/** 1 when screen shake is allowed, 0 when it is switched off. */
export const shakeScale = (): number => (getComfort().shake ? 1 : 0);
/** 1 when flashes are allowed, 0 when they are switched off. */
export const flashScale = (): number => (getComfort().flash ? 1 : 0);

/**
 * Keeps full-frame flashes under three a second, the limit accessibility guidelines set for
 * flashing content. Returns a function: call it when an effect wants to flash, and it says
 * whether this one may.
 */
export function createFlashLimiter(minGapMs = 360): (now: number) => boolean {
  let last = -Infinity;
  return (now) => {
    if (!getComfort().flash || now - last < minGapMs) return false;
    last = now;
    return true;
  };
}
