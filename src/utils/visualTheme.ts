/**
 * The game has one art direction: ink on paper. These are the few scene colours the WebGL map
 * needs that cannot come from CSS.
 */
export const INK_LOOK = {
  webglFogHex: 0x1a1510,
  webglSkyHex: 0x14100c,
  webglSunHex: 0xffe0a3,
  webglOceanHex: 0x1b333a,
} as const;
