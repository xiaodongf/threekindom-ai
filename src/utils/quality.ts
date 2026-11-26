import { useSyncExternalStore } from 'react';

/**
 * Graphics quality.
 *
 * One setting governs what the four 3D scenes (campaign map, city, duel, war theater) spend:
 * resolution, antialiasing, bloom size, shadow detail and crowd size. `auto` picks a
 * tier from the graphics card the browser reports; the player can override it in Settings, and
 * `?quality=low|medium|high` previews a tier without saving it.
 *
 * The tier numbers are working values, not measured budgets: nothing has yet been timed on
 * integrated graphics. Each scene also steps its resolution down once if it cannot hold its
 * frame rate (see `createFrameGovernor`), whatever tier is chosen.
 */
export type QualityTier = 'low' | 'medium' | 'high';
export type QualityChoice = QualityTier | 'auto';

export interface QualitySettings {
  tier: QualityTier;
  /** Upper limit on the device pixel ratio the 3D scenes render at (the map and city never go above 1.5) */
  pixelRatioCap: number;
  /** Multisampling of the off-screen scene buffer (0 turns it off) */
  msaaSamples: number;
  /** Size of the bloom buffers relative to the frame (bloom already works at half size) */
  bloomScale: number;
  /** Shadow map edge for scenes that redraw shadows every frame */
  shadowMapLive: number;
  /** Shadow map edge for scenes that draw shadows once (the city) */
  shadowMapStatic: number;
  /** Multiplier on crowd sizes: spectators, rank and file */
  crowd: number;
}

const TIERS: Record<QualityTier, QualitySettings> = {
  low: {
    tier: 'low',
    pixelRatioCap: 1,
    msaaSamples: 0,
    bloomScale: 0.5,
    shadowMapLive: 1024,
    shadowMapStatic: 1024,
    crowd: 0.6,
  },
  medium: {
    tier: 'medium',
    pixelRatioCap: 1.5,
    msaaSamples: 4,
    bloomScale: 1,
    shadowMapLive: 2048,
    shadowMapStatic: 2048,
    crowd: 1,
  },
  high: {
    tier: 'high',
    pixelRatioCap: 2,
    msaaSamples: 4,
    bloomScale: 1,
    shadowMapLive: 2048,
    shadowMapStatic: 4096,
    crowd: 1,
  },
};

const STORAGE_KEY = 'tk_quality';
const isChoice = (v: unknown): v is QualityChoice => v === 'auto' || v === 'low' || v === 'medium' || v === 'high';

let choice: QualityChoice | null = null;
let detected: QualityTier | null = null;
const listeners = new Set<() => void>();

/** Guesses a tier from the graphics card name the browser exposes. */
function detectTier(): QualityTier {
  if (typeof document === 'undefined') return 'medium';
  let name = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'low';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    return 'medium';
  }
  if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 'low';
  if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc\(tm\) a|apple m\d/i.test(name)) return 'high';
  if (/intel|uhd|iris|hd graphics|mali|adreno|powervr|radeon\(tm\) graphics|vega|apple gpu/i.test(name)) {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    return cores <= 4 || memory <= 4 ? 'low' : 'medium';
  }
  return 'medium';
}

function readChoice(): QualityChoice {
  if (typeof window === 'undefined') return 'auto';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isChoice(saved)) return saved;
  } catch {
    /* no storage to read: keep the default */
  }
  return 'auto';
}

/** A tier named in the page address previews that tier without saving it. */
function previewTier(): QualityTier | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = new URLSearchParams(window.location.search).get('quality');
    return v === 'low' || v === 'medium' || v === 'high' ? v : null;
  } catch {
    return null;
  }
}

export function getQualityChoice(): QualityChoice {
  if (choice === null) choice = readChoice();
  return choice;
}

/** The tier `auto` resolves to on this machine. */
export function getAutoTier(): QualityTier {
  if (detected === null) detected = detectTier();
  return detected;
}

export function getQualityTier(): QualityTier {
  const preview = previewTier();
  if (preview) return preview;
  const c = getQualityChoice();
  return c === 'auto' ? getAutoTier() : c;
}

export const getQuality = (): QualitySettings => TIERS[getQualityTier()];

/** Saves the player's choice; open 3D scenes rebuild through `useQualityTier`. */
export function setQualityChoice(next: QualityChoice): void {
  if (next === getQualityChoice()) return;
  choice = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
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

/** The tier in force, re-rendering the caller when the player changes the setting. */
export function useQualityTier(): QualityTier {
  return useSyncExternalStore(subscribe, getQualityTier, () => 'medium' as QualityTier);
}

export function useQualityChoice(): QualityChoice {
  return useSyncExternalStore(subscribe, getQualityChoice, () => 'auto' as QualityChoice);
}

/**
 * Watches a scene's first seconds and reports once if it cannot hold its frame rate, so the
 * scene can step its resolution down. Frames 40 to 160 are averaged (the first ones include
 * shader compilation); above 24 ms a frame the scene is asked to drop to pixel ratio 1.
 */
export function createFrameGovernor(onTooSlow: () => void): (frameMs: number) => void {
  let frames = 0;
  let acc = 0;
  return (frameMs) => {
    frames += 1;
    if (frames > 40 && frames <= 160) acc += frameMs;
    if (frames === 160 && acc / 120 > 24) onTooSlow();
  };
}
