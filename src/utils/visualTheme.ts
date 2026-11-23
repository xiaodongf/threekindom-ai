import type { LocalizedText } from '../game/types.js';

export type VisualThemeId = 'cinema' | 'ink' | 'chrono';

export interface VisualThemeMeta {
  id: VisualThemeId;
  name: LocalizedText;
  shortName: LocalizedText;
  desc: LocalizedText;
  previewGradient: string;
  accentHex: string;
  secondaryHex: string;
  /** CSS filter applied gently to painted art & canvas scenes to match art direction */
  artFilter: string;
  webglFogHex: number;
  webglSkyHex: number;
  webglSunHex: number;
  webglOceanHex: number;
}

export const VISUAL_THEMES: Record<VisualThemeId, VisualThemeMeta> = {
  cinema: {
    id: 'cinema',
    name: { en: 'Epic Fantasy Cinema', zh: '史诗电影写实' },
    shortName: { en: 'Cinema', zh: '史诗电影' },
    desc: {
      en: 'Rich painterly realism, twilight gold highlights, and balanced chrono-cyan accents.',
      zh: '浓墨重彩电影级光影、暮色金辉与天命青蓝微光，与全套名将立绘浑然一体。',
    },
    previewGradient: 'linear-gradient(135deg, #0ea5e9 0%, #1e293b 50%, #f59e0b 100%)',
    accentHex: '#38bdf8',
    secondaryHex: '#f59e0b',
    artFilter: 'saturate(1.06) contrast(1.04)',
    webglFogHex: 0x091729,
    webglSkyHex: 0x071222,
    webglSunHex: 0xffd59e,
    webglOceanHex: 0x0a385c,
  },
  ink: {
    id: 'ink',
    name: { en: 'Classical Ink & Gold', zh: '水墨金箔国风' },
    shortName: { en: 'Ink & Gold', zh: '水墨金箔' },
    desc: {
      en: 'Dark inkstone lacquer, warm parchment gold, vermilion seals, and classical sumi-e warmth.',
      zh: '砚台黑漆、宣纸金箔与朱砂印章，为山河沙盘与战场染上典雅水墨国风意境。',
    },
    previewGradient: 'linear-gradient(135deg, #d4a853 0%, #2b2118 52%, #b91c1c 100%)',
    accentHex: '#e5be6a',
    secondaryHex: '#dc2626',
    artFilter: 'sepia(0.28) saturate(0.92) contrast(1.08)',
    webglFogHex: 0x1a1510,
    webglSkyHex: 0x14100c,
    webglSunHex: 0xffe0a3,
    webglOceanHex: 0x1b333a,
  },
  chrono: {
    id: 'chrono',
    name: { en: 'Cyber-Chrono Obsidian', zh: '时空黑曜霓虹' },
    shortName: { en: 'Chrono', zh: '时空黑曜' },
    desc: {
      en: 'High-contrast obsidian glass, holographic cyan/violet neon rims, and time-traveler telemetry.',
      zh: '极深黑曜石质感、全息青紫时空流光与未来穿越者战术投影视觉。',
    },
    previewGradient: 'linear-gradient(135deg, #22d3ee 0%, #09071a 50%, #a855f7 100%)',
    accentHex: '#22d3ee',
    secondaryHex: '#c084fc',
    artFilter: 'saturate(1.18) contrast(1.12) hue-rotate(-6deg)',
    webglFogHex: 0x070616,
    webglSkyHex: 0x050410,
    webglSunHex: 0x9ee8ff,
    webglOceanHex: 0x082246,
  },
};

export const VISUAL_THEME_ORDER: VisualThemeId[] = ['cinema', 'ink', 'chrono'];

const STORAGE_KEY = 'tk_visual_theme';

export function loadSavedVisualTheme(): VisualThemeId {
  if (typeof window === 'undefined') return 'cinema';
  const urlParam = new URLSearchParams(window.location.search).get('theme');
  if (urlParam === 'cinema' || urlParam === 'ink' || urlParam === 'chrono') {
    return urlParam;
  }
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'cinema' || saved === 'ink' || saved === 'chrono') return saved;
  } catch {
    // ignore storage failures
  }
  return 'cinema';
}

export function saveVisualTheme(theme: VisualThemeId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  document.documentElement.setAttribute('data-theme', theme);
}
