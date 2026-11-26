import * as THREE from 'three';

/**
 * Which curve turns the scenes' linear light into display colour.
 *
 * ACES is what the game ships with. It bends bright yellows, greens and cyans toward white,
 * which matters for faction colours and gilt; AgX and the Khronos Neutral curve keep hue better.
 * The choice is one of taste, so the alternatives are only previews for now:
 * `?tone=agx` or `?tone=neutral` in the page address shows a scene under that curve.
 *
 * AgX and Neutral leave mid-tones darker than three's ACES at the same exposure, so each
 * carries an exposure factor that brings a mid-grey to about the same place. The factors are
 * a starting point for comparison, not a tuned grade.
 */
export type ToneChoice = 'aces' | 'agx' | 'neutral';

const CURVES: Record<ToneChoice, { mapping: THREE.ToneMapping; exposure: number }> = {
  aces: { mapping: THREE.ACESFilmicToneMapping, exposure: 1 },
  agx: { mapping: THREE.AgXToneMapping, exposure: 1.5 },
  neutral: { mapping: THREE.NeutralToneMapping, exposure: 1.45 },
};

let cached: ToneChoice | null = null;

export function getToneChoice(): ToneChoice {
  if (cached) return cached;
  cached = 'aces';
  try {
    const v = new URLSearchParams(window.location.search).get('tone');
    if (v === 'agx' || v === 'neutral' || v === 'aces') cached = v;
  } catch {
    /* no address to read: keep the default */
  }
  return cached;
}

/** Sets the renderer's tone curve; call `toneExposure` wherever a scene sets its exposure. */
export function applyToneMapping(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = CURVES[getToneChoice()].mapping;
}

/** A scene's authored exposure, adjusted for the curve in use. */
export const toneExposure = (exposure: number): number => exposure * CURVES[getToneChoice()].exposure;
