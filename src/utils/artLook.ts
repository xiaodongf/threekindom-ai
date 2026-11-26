import { useSyncExternalStore } from 'react';

/**
 * Art direction.
 *
 * `myth` is the look of the game: dark mythic realism. Low-key light, cold mist, drained colour
 * with bronze-gold highlights, blackened iron, and fire as the only warm source.
 * `classic` is the earlier look, kept as a choice: warm painted sunsets and blue-and-green map
 * pigments on warm ink.
 *
 * The choice is read, in order, from the page address (`?look=classic` or `?look=myth`, which
 * previews a look without saving it), from the player's saved setting, and from the default.
 * The stylesheet follows `<html data-look>`; 3D scenes read the look when they are built.
 */
export type ArtLook = 'classic' | 'myth';

const STORAGE_KEY = 'tk_look';
const DEFAULT_LOOK: ArtLook = 'myth';

const isLook = (v: unknown): v is ArtLook => v === 'classic' || v === 'myth';

let current: ArtLook | null = null;
const listeners = new Set<() => void>();

function readLook(): ArtLook {
  if (typeof window === 'undefined') return DEFAULT_LOOK;
  try {
    const fromAddress = new URLSearchParams(window.location.search).get('look');
    if (isLook(fromAddress)) return fromAddress;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLook(saved)) return saved;
  } catch {
    /* no address or storage to read: keep the default */
  }
  return DEFAULT_LOOK;
}

export function getArtLook(): ArtLook {
  if (current === null) current = readLook();
  return current;
}

export const isMythLook = (): boolean => getArtLook() === 'myth';

/** Puts the look on <html data-look> so the stylesheet can follow it. */
export function applyArtLook(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-look', getArtLook());
}

/** Saves the player's choice and switches at once; open 3D scenes rebuild through `useArtLook`. */
export function setArtLook(look: ArtLook): void {
  if (look === getArtLook()) return;
  current = look;
  try {
    window.localStorage.setItem(STORAGE_KEY, look);
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
  applyArtLook();
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** The current look, re-rendering the caller when the player changes it. */
export function useArtLook(): ArtLook {
  return useSyncExternalStore(subscribe, getArtLook, () => DEFAULT_LOOK);
}
