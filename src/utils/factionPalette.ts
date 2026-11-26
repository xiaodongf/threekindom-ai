import type { FactionId } from '../game/types.js';

/**
 * The realms' colours for everything drawn in 3D, in one place.
 *
 * `cloth` dresses soldiers and banners in the duel and the war theater; `pigment` is the lighter
 * mineral wash the same realm gets on the campaign map's paper. Both sit on one hue per realm
 * (Wei blue, Shu green, Wu red), so a realm reads as the same colour from the map down to a
 * soldier's coat.
 */
export const FACTION_CLOTH: Record<FactionId, { cloth: string; trim: string; glyph: string }> = {
  wei: { cloth: '#2f5d8c', trim: '#e6c164', glyph: '魏' },
  shu: { cloth: '#2f6e49', trim: '#e8c864', glyph: '蜀' },
  wu: { cloth: '#a62c22', trim: '#f0c45c', glyph: '吴' },
  neutral: { cloth: '#635c51', trim: '#d8bc74', glyph: '汉' },
};

export const FACTION_PIGMENT: Record<FactionId, number> = {
  neutral: 0x9a8f78,
  wei: 0x4c78a8,
  shu: 0x438554,
  wu: 0xc2432f,
};
