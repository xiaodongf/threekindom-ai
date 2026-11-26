/**
 * Switches for looking at one graphics effect at a time.
 *
 * `?fxOff=ao,fog` in the page address turns the named effects off for that visit, so a capture
 * with and without an effect can be compared and its cost measured. Names: `env` (image-based
 * ambient light), `fog` (height fog and model haze), `ao` (baked vertex occlusion),
 * `contact` (contact shadows). Nothing is saved; without the parameter everything is on.
 */
export type FxName = 'env' | 'fog' | 'ao' | 'contact';

let off: Set<string> | null = null;

export function fxOn(name: FxName): boolean {
  if (off === null) {
    off = new Set();
    try {
      const raw = new URLSearchParams(window.location.search).get('fxOff');
      if (raw) raw.split(',').forEach((n) => off!.add(n.trim()));
    } catch {
      /* no address to read: everything stays on */
    }
  }
  return !off.has(name);
}
