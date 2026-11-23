import * as THREE from 'three';
import type { TerrainType } from '../../game/types.js';
import type { HorseCoatId } from '../../game/heroDuelProfiles.js';
import { HORSE_COAT_PALETTES } from '../../game/heroDuelProfiles.js';
import type { VisualThemeId } from '../../utils/visualTheme.js';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

/** Procedurally paints Han dynasty overlapping lamellar armor plates + bump heightmap */
export function createLamellarArmorTextures(
  primaryHex: string,
  trimHex: string,
  registry: THREE.Texture[]
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 256;
  const [cMap, ctx] = makeCanvas(size, size);
  const [cBump, bctx] = makeCanvas(size, size);

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#404040';
  bctx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 10;
  const rowH = size / rows;
  const colW = size / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset;
      const y = r * rowH;

      const g = ctx.createLinearGradient(x, y, x, y + rowH);
      g.addColorStop(0, primaryHex);
      g.addColorStop(0.55, primaryHex);
      g.addColorStop(1, '#090b10');
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);

      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x + 2, y + 2, colW - 4, 3);

      ctx.fillStyle = trimHex;
      ctx.globalAlpha = 0.52;
      ctx.fillRect(x + 1, y + rowH * 0.36, colW - 2, 2);
      ctx.globalAlpha = 1;

      ctx.fillStyle = trimHex;
      ctx.beginPath();
      ctx.arc(x + colW * 0.5, y + rowH * 0.24, 1.9, 0, Math.PI * 2);
      ctx.fill();

      const bg = bctx.createLinearGradient(x, y, x, y + rowH);
      bg.addColorStop(0, '#ededed');
      bg.addColorStop(0.75, '#a8a8a8');
      bg.addColorStop(1, '#1c1c1c');
      bctx.fillStyle = bg;
      bctx.fillRect(x + 1.5, y + 1.5, colW - 3, rowH - 3);
    }
  }

  const map = new THREE.CanvasTexture(cMap);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(cBump);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);

  registry.push(map, bumpMap);
  return { map, bumpMap };
}

/** Organic equine coat sheen & muscle-grain PBR texture */
export function createHorseCoatTextures(
  coatId: HorseCoatId,
  registry: THREE.Texture[]
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const pal = HORSE_COAT_PALETTES[coatId];
  const size = 256;
  const [cMap, ctx] = makeCanvas(size, size);
  const [cBump, bctx] = makeCanvas(size, size);

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, pal.highlight);
  grad.addColorStop(0.45, pal.body);
  grad.addColorStop(1, pal.mane);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 460; i++) {
    const x = (Math.sin(i * 41.3) * 0.5 + 0.5) * size;
    const y = (Math.cos(i * 29.7) * 0.5 + 0.5) * size;
    const len = 8 + (i % 10);
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + 2);
    ctx.stroke();

    bctx.strokeStyle = i % 2 === 0 ? '#969696' : '#6c6c6c';
    bctx.beginPath();
    bctx.moveTo(x, y);
    bctx.lineTo(x + len, y + 2);
    bctx.stroke();
  }

  if (coatId === 'dapple_grey' || coatId === 'white_dragon') {
    for (let i = 0; i < 52; i++) {
      const x = (Math.sin(i * 73.1) * 0.5 + 0.5) * size;
      const y = (Math.cos(i * 51.9) * 0.5 + 0.5) * size;
      const r = 6 + (i % 11);
      ctx.fillStyle =
        coatId === 'dapple_grey' ? 'rgba(255,255,255,0.16)' : 'rgba(203,213,225,0.14)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const map = new THREE.CanvasTexture(cMap);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(cBump);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;

  registry.push(map, bumpMap);
  return { map, bumpMap };
}

/** Brocade-embroidered Han warhorse caparison saddlecloth texture */
export function createCaparisonTexture(
  bgHex: string,
  trimHex: string,
  registry: THREE.Texture[]
): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 128);
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, bgHex);
  grad.addColorStop(1, '#120d0e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  // Subtle woven diamond silk brocade pattern
  ctx.strokeStyle = 'rgba(255,230,170,0.14)';
  ctx.lineWidth = 1.5;
  for (let x = -128; x < 384; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 128, 128);
    ctx.moveTo(x + 128, 0);
    ctx.lineTo(x, 128);
    ctx.stroke();
  }

  // Ornate gold double-border along hem
  ctx.fillStyle = trimHex;
  ctx.fillRect(0, 108, 256, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 103, 256, 4);
  ctx.fillStyle = trimHex;
  ctx.fillRect(0, 98, 256, 3);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  registry.push(tex);
  return tex;
}

/** Layered circular battleground earth/sand/canyon PBR texture with trampled hoof rings */
export function createArenaGroundTextures(
  terrain: TerrainType,
  isNight: boolean,
  theme: VisualThemeId,
  registry: THREE.Texture[]
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 512;
  const [cMap, ctx] = makeCanvas(size, size);
  const [cBump, bctx] = makeCanvas(size, size);

  const cx = size * 0.5;
  const cy = size * 0.5;

  const palettes: Record<TerrainType, { inner: string; mid: string; outer: string }> = {
    plains: { inner: '#9b7b56', mid: '#7d6242', outer: '#475534' },
    river: { inner: '#a6906a', mid: '#847052', outer: '#3e5347' },
    mountain: { inner: '#7e7365', mid: '#5f574d', outer: '#3b3c36' },
    fortress: { inner: '#766b5f', mid: '#585046', outer: '#353230' },
  };
  const pal = palettes[terrain];

  const rad = ctx.createRadialGradient(cx, cy, 18, cx, cy, size * 0.5);
  rad.addColorStop(0, pal.inner);
  rad.addColorStop(0.55, pal.mid);
  rad.addColorStop(0.84, pal.outer);
  rad.addColorStop(1, '#262922');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Organic earth patches & subtle wheel/hoof scuff tracks
  for (let i = 0; i < 42; i++) {
    const a = (i * 2.39996) % (Math.PI * 2);
    const r = 20 + ((i * 37) % 190);
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(54,38,22,0.09)' : 'rgba(218,192,150,0.06)';
    ctx.beginPath();
    ctx.ellipse(px, py, 18 + (i % 24), 10 + (i % 15), a, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 12; i++) {
    const r = 46 + i * 12;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(42,28,14,0.11)' : 'rgba(220,196,158,0.07)';
    ctx.lineWidth = 2 + (i % 3);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.18, r * 0.72, 0.04, 0, Math.PI * 2);
    ctx.stroke();

    bctx.strokeStyle = i % 2 === 0 ? '#686868' : '#949494';
    bctx.lineWidth = 2;
    bctx.beginPath();
    bctx.ellipse(cx, cy, r * 1.18, r * 0.72, 0.04, 0, Math.PI * 2);
    bctx.stroke();
  }

  for (let i = 0; i < 2200; i++) {
    const a = (i * 1.6180339) % 1;
    const b = (i * 0.7548776) % 1;
    const x = a * size;
    const y = b * size;
    const s = 1 + (i % 3);
    ctx.fillStyle =
      i % 4 === 0
        ? 'rgba(255,240,210,0.08)'
        : i % 3 === 0
          ? 'rgba(20,14,8,0.14)'
          : 'rgba(92,70,45,0.12)';
    ctx.fillRect(x, y, s, s);
    bctx.fillStyle = i % 2 === 0 ? '#9c9c9c' : '#626262';
    bctx.fillRect(x, y, s, s);
  }

  if (isNight) {
    ctx.fillStyle = 'rgba(12,18,34,0.28)';
    ctx.fillRect(0, 0, size, size);
  } else if (theme === 'ink') {
    ctx.fillStyle = 'rgba(228,214,185,0.14)';
    ctx.fillRect(0, 0, size, size);
  } else if (theme === 'chrono') {
    ctx.strokeStyle = 'rgba(56,189,248,0.12)';
    ctx.lineWidth = 1;
    for (let r = 60; r <= 200; r += 70) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(cBump);
  registry.push(map, bumpMap);
  return { map, bumpMap };
}

/** Authentic Three Kingdoms vertical calligraphy silk war flag */
export function createSilkBannerTexture(
  glyph: string,
  bgHex: string,
  trimHex: string,
  registry: THREE.Texture[]
): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 256);

  const grad = ctx.createLinearGradient(0, 0, 128, 256);
  grad.addColorStop(0, bgHex);
  grad.addColorStop(1, '#0c0a0d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);

  ctx.strokeStyle = trimHex;
  ctx.lineWidth = 7;
  ctx.strokeRect(8, 8, 112, 240);
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, 96, 224);

  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.arc(64, 116, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = trimHex;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#fdf4dc';
  ctx.font = '900 54px "Noto Serif SC", "Songti SC", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph.slice(0, 1), 64, 120);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  registry.push(tex);
  return tex;
}

/** Loads the studio-painted HD panoramic battlefield artwork onto the 3D arena horizon cyclorama */
export function createPaintedPanoramaTexture(
  terrain: TerrainType,
  isNight: boolean,
  registry: THREE.Texture[]
): THREE.Texture {
  const url = isNight
    ? '/art/bg_night_raid.jpg'
    : terrain === 'river'
      ? '/art/bg_yangtze_river.jpg'
      : terrain === 'mountain'
        ? '/art/bg_mountain_pass.jpg'
        : '/art/bg_plains_siege.jpg';

  const loader = new THREE.TextureLoader();
  const tex = loader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.MirroredRepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(2, 1);
  registry.push(tex);
  return tex;
}

/** Atmospheric sky dome painted with golden dusk / misty river / torchlit night horizon */
export function createSkyDomeTexture(
  terrain: TerrainType,
  isNight: boolean,
  theme: VisualThemeId,
  registry: THREE.Texture[]
): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 256);

  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  if (isNight || terrain === 'fortress') {
    sky.addColorStop(0, '#070b18');
    sky.addColorStop(0.45, '#172342');
    sky.addColorStop(0.7, '#3f282d');
    sky.addColorStop(0.86, '#231a1a');
    sky.addColorStop(1, '#120e10');
  } else if (theme === 'ink') {
    sky.addColorStop(0, '#2a2e36');
    sky.addColorStop(0.45, '#646662');
    sky.addColorStop(0.72, '#c7b89c');
    sky.addColorStop(1, '#4b453a');
  } else if (terrain === 'river') {
    sky.addColorStop(0, '#13243b');
    sky.addColorStop(0.42, '#2d4b6a');
    sky.addColorStop(0.68, '#b8835c');
    sky.addColorStop(1, '#1d2830');
  } else if (terrain === 'mountain') {
    sky.addColorStop(0, '#182438');
    sky.addColorStop(0.4, '#475c74');
    sky.addColorStop(0.68, '#cfa174');
    sky.addColorStop(1, '#262320');
  } else {
    sky.addColorStop(0, '#141e33');
    sky.addColorStop(0.38, '#39435c');
    sky.addColorStop(0.6, '#c67c46');
    sky.addColorStop(0.75, '#e4b26d');
    sky.addColorStop(1, '#261e18');
  }

  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  registry.push(tex);
  return tex;
}

/** Soft billowing radial puff sprite for 3D hoof dust & impact shockwave clouds */
export function createDustPuffTexture(registry: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(235,214,178,0.85)');
  g.addColorStop(0.45, 'rgba(196,170,132,0.45)');
  g.addColorStop(1, 'rgba(160,136,104,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  registry.push(tex);
  return tex;
}
