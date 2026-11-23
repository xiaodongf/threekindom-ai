const STORAGE_KEY = 'tk_motion';

export type MotionPreference = 'system' | 'reduced' | 'full';

export function loadMotionPreference(): MotionPreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'reduced' || saved === 'full') return saved;
  } catch {
    // storage may be unavailable; fall through to the system setting
  }
  return 'system';
}

/** Applies the preference to <html data-motion> so the stylesheet can collapse animation. */
export function applyMotionPreference(pref: MotionPreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-motion');
  else root.setAttribute('data-motion', pref);
  try {
    if (pref === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignore
  }
}

/** True when decorative motion should be skipped (in-game switch first, then the OS setting). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  const attr = document.documentElement.getAttribute('data-motion');
  if (attr === 'reduced') return true;
  if (attr === 'full') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
