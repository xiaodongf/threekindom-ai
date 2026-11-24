import * as THREE from 'three';
import type { General } from '../../game/types.js';
import type { HeroDuelProfile, HorseCoatId } from '../../game/heroDuelProfiles.js';
import { HORSE_COAT_PALETTES } from '../../game/heroDuelProfiles.js';
import type { DisposeBag } from './duelGeometry3D.js';
import { bestArt } from '../../utils/art.js';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

/** Deterministic pseudo-random stream so every duel paints identical textures. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function finish(
  bag: DisposeBag,
  canvas: HTMLCanvasElement,
  opts: { srgb?: boolean; repeat?: [number, number] } = {}
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.anisotropy = 8;
  return bag.add(tex);
}

/** Overlapping Han lamellar plates laced in rows, with a matching height map. */
export function createLamellarArmorTextures(
  primaryHex: string,
  trimHex: string,
  bag: DisposeBag
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 256;
  const [cMap, ctx] = makeCanvas(size, size);
  const [cBump, bctx] = makeCanvas(size, size);

  ctx.fillStyle = '#07080c';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#202020';
  bctx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 8;
  const rowH = size / rows;
  const colW = size / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset;
      const y = r * rowH;

      const g = ctx.createLinearGradient(x, y, x, y + rowH);
      g.addColorStop(0, primaryHex);
      g.addColorStop(0.7, primaryHex);
      g.addColorStop(1, '#0a0c12');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x + 1.5, y + 1, colW - 3, rowH - 1, [2, 2, 7, 7]);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x + 3, y + 2.5, colW - 6, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x + 3, y + 5, 2.5, rowH - 12);

      // Lacing cords and rivets in the trim colour
      ctx.fillStyle = trimHex;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x + colW * 0.3, y + rowH * 0.26, 2.2, rowH * 0.3);
      ctx.fillRect(x + colW * 0.66, y + rowH * 0.26, 2.2, rowH * 0.3);
      ctx.globalAlpha = 1;

      const bg = bctx.createLinearGradient(x, y, x, y + rowH);
      bg.addColorStop(0, '#f2f2f2');
      bg.addColorStop(0.8, '#9a9a9a');
      bg.addColorStop(1, '#303030');
      bctx.fillStyle = bg;
      bctx.beginPath();
      bctx.roundRect(x + 1.5, y + 1, colW - 3, rowH - 1, [2, 2, 7, 7]);
      bctx.fill();
    }
  }

  return {
    map: finish(bag, cMap, { repeat: [3, 3] }),
    bumpMap: finish(bag, cBump, { srgb: false, repeat: [3, 3] }),
  };
}

/**
 * Horse coat. U runs around the body (0 = spine, 0.5 = belly) so the back catches a sheen and
 * the belly falls into shade; V runs along the body.
 */
export function createHorseCoatTextures(
  coatId: HorseCoatId,
  bag: DisposeBag
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const pal = HORSE_COAT_PALETTES[coatId];
  const size = 256;
  const [cMap, ctx] = makeCanvas(size, size);
  const [cBump, bctx] = makeCanvas(size, size);
  const rnd = seeded(coatId.length * 977 + 13);

  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, pal.highlight);
  grad.addColorStop(0.2, pal.body);
  grad.addColorStop(0.5, pal.mane);
  grad.addColorStop(0.8, pal.body);
  grad.addColorStop(1, pal.highlight);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // Keep the belly from going fully to the mane colour
  ctx.fillStyle = pal.body;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 700; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = 6 + rnd() * 12;
    ctx.strokeStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 3, y + len);
    ctx.stroke();
    bctx.strokeStyle = rnd() > 0.5 ? '#8c8c8c' : '#747474';
    bctx.beginPath();
    bctx.moveTo(x, y);
    bctx.lineTo(x, y + len);
    bctx.stroke();
  }

  if (coatId === 'dapple_grey' || coatId === 'white_dragon') {
    for (let i = 0; i < 70; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 5 + rnd() * 9;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, coatId === 'dapple_grey' ? 'rgba(255,255,255,0.2)' : 'rgba(190,200,215,0.16)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    map: finish(bag, cMap, { repeat: [1, 1] }),
    bumpMap: finish(bag, cBump, { srgb: false, repeat: [1, 1] }),
  };
}

/** Silk brocade saddle cloth with a gold double hem. */
export function createCaparisonTexture(
  bgHex: string,
  trimHex: string,
  bag: DisposeBag
): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 256, 256);
  const shade = ctx.createLinearGradient(0, 0, 256, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.42)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  shade.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(255,225,160,0.2)';
  ctx.lineWidth = 1.4;
  for (let x = -256; x < 512; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 256, 256);
    ctx.moveTo(x + 256, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  // Hems run along both lower edges of the cloth (U = 0 and U = 1 are the two flanks)
  for (const x of [0, 256 - 12]) {
    ctx.fillStyle = trimHex;
    ctx.fillRect(x, 0, 12, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x === 0 ? 12 : x - 3, 0, 3, 256);
    ctx.fillStyle = trimHex;
    ctx.fillRect(x === 0 ? 19 : x - 9, 0, 2, 256);
  }
  // ...and along the front and back edges (V = 0 and V = 1)
  for (const y of [0, 256 - 10]) {
    ctx.fillStyle = trimHex;
    ctx.fillRect(0, y, 256, 10);
  }
  return finish(bag, c);
}

/** Tiling trampled-earth detail; tinted per terrain through vertex colours on the ground mesh. */
export function createGroundDetailTextures(bag: DisposeBag): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const [cMap, ctx] = makeCanvas(size, size);
  const [cBump, bctx] = makeCanvas(size, size);
  const rnd = seeded(4242);

  ctx.fillStyle = '#c8c2b8';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Every mark is drawn nine times with wrap-around offsets so the tile repeats seamlessly.
  const tiled = (draw: (c: CanvasRenderingContext2D, ox: number, oy: number) => void, c: CanvasRenderingContext2D) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) draw(c, ox, oy);
  };

  for (let i = 0; i < 150; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const rx = 18 + rnd() * 60;
    const ry = 10 + rnd() * 34;
    const rot = rnd() * Math.PI;
    const dark = rnd() > 0.45;
    const alpha = 0.09 + rnd() * 0.14;
    tiled((c, ox, oy) => {
      c.fillStyle = dark ? `rgba(40,30,20,${alpha})` : `rgba(255,246,228,${alpha})`;
      c.beginPath();
      c.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2);
      c.fill();
    }, ctx);
    tiled((c, ox, oy) => {
      c.fillStyle = dark ? 'rgba(90,90,90,0.25)' : 'rgba(170,170,170,0.25)';
      c.beginPath();
      c.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2);
      c.fill();
    }, bctx);
  }

  // Crescent hoof prints
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const rot = rnd() * Math.PI * 2;
    tiled((c, ox, oy) => {
      c.strokeStyle = 'rgba(30,22,14,0.3)';
      c.lineWidth = 2.6;
      c.beginPath();
      c.arc(x + ox, y + oy, 6, rot, rot + Math.PI * 1.25);
      c.stroke();
    }, ctx);
    tiled((c, ox, oy) => {
      c.strokeStyle = '#4a4a4a';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x + ox, y + oy, 6, rot, rot + Math.PI * 1.25);
      c.stroke();
    }, bctx);
  }

  for (let i = 0; i < 5200; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const s = 1 + rnd() * 2.2;
    const v = rnd();
    ctx.fillStyle =
      v > 0.66 ? 'rgba(255,248,232,0.16)' : v > 0.33 ? 'rgba(28,20,12,0.2)' : 'rgba(110,92,70,0.18)';
    ctx.fillRect(x, y, s, s);
    bctx.fillStyle = v > 0.5 ? '#a4a4a4' : '#5c5c5c';
    bctx.fillRect(x, y, s, s);
  }

  // Scattered pebbles
  for (let i = 0; i < 70; i++) {
    const x = 6 + rnd() * (size - 12);
    const y = 6 + rnd() * (size - 12);
    const r = 1.5 + rnd() * 3.2;
    ctx.fillStyle = 'rgba(232,226,214,0.75)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.75, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,14,8,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + r * 0.7, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    bctx.fillStyle = '#d8d8d8';
    bctx.beginPath();
    bctx.arc(x, y, r, 0, Math.PI * 2);
    bctx.fill();
  }

  return {
    map: finish(bag, cMap, { repeat: [14, 14] }),
    bumpMap: finish(bag, cBump, { srgb: false, repeat: [14, 14] }),
  };
}

/** Vertical calligraphy silk war flag. */
export function createSilkBannerTexture(
  glyph: string,
  bgHex: string,
  trimHex: string,
  bag: DisposeBag
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

  return finish(bag, c);
}

/**
 * Painted battlefield backdrop. Only the upper band of the artwork (sky down to the far ground)
 * is wrapped around the horizon, centred behind the duel and mirrored beyond the edges, so the
 * painting is neither stretched nor split by a seam in the middle of the shot.
 */
export function createPaintedPanoramaTexture(
  url: string,
  band: [number, number],
  arcFraction: number,
  bag: DisposeBag
): THREE.Texture {
  const tex = new THREE.TextureLoader().load(bestArt(url));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.MirroredRepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const repeatX = 1 / arcFraction;
  tex.repeat.set(repeatX, band[1] - band[0]);
  tex.offset.set(0.5 - 0.5 * repeatX, band[0]);
  tex.anisotropy = 8;
  return bag.add(tex);
}

/** Vertical sky gradient for the dome above the painted horizon. */
export function createSkyDomeTexture(stops: string[], bag: DisposeBag): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(8, 256);
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  stops.forEach((s, i) => sky.addColorStop(i / Math.max(1, stops.length - 1), s));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 8, 256);
  return finish(bag, c);
}

/** Soft, lumpy puff for hoof dust and impact clouds. */
export function createDustPuffTexture(bag: DisposeBag): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const rnd = seeded(77);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 26;
    const x = 64 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d;
    const r = 18 + rnd() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.2)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(bag, c, { srgb: false });
}

/** Round soft glow used for sparks, embers and light blooms. */
export function createGlowTexture(bag: DisposeBag): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return finish(bag, c, { srgb: false });
}

/** Many-pointed star burst for the instant steel meets steel. */
export function createImpactFlareTexture(bag: DisposeBag): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = makeCanvas(size, size);
  const rnd = seeded(909);
  ctx.translate(size / 2, size / 2);
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.34);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
  ctx.fill();
  const rays = 14;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + rnd() * 0.25;
    const len = size * (0.3 + rnd() * 0.2);
    const w = 3 + rnd() * 5;
    ctx.save();
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -w);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, w);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return finish(bag, c, { srgb: false });
}

/** Soft-edged ring that expands along the ground under a heavy blow. */
export function createShockRingTexture(bag: DisposeBag): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.86, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(bag, c, { srgb: false });
}

/** Weapon-trail gradient: bright leading edge that feathers out across the blade's width. */
export function createTrailTexture(bag: DisposeBag): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.9, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return finish(bag, c, { srgb: false });
}

/**
 * Painted hero face texture mapped onto the head SphereGeometry (+X front is at U = 0.5, V = 0.5).
 * Gives each general tailored complexion, brow/eye expression, facial hair, scars, or Xiahou Dun's eyepatch.
 */
export function createHeroFaceTexture(
  hero: General,
  profile: HeroDuelProfile,
  bag: DisposeBag
): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  const id = hero.id;

  const baseSkin =
    id === 'guanyu'
      ? '#b84c3e'
      : profile.isHeroine
        ? '#ecc3a8'
        : id === 'zhangfei' || id === 'menghuo' || id === 'yanbaihu'
          ? '#be825c'
          : profile.isScholarRobe
            ? '#e2b290'
            : '#d69e78';

  ctx.fillStyle = baseSkin;
  ctx.fillRect(0, 0, S, S);

  // Subtle cheek & temple shading around front face (cx = 128, cy = 128)
  const warmGlow = ctx.createRadialGradient(128, 126, 8, 128, 132, 74);
  warmGlow.addColorStop(0, 'rgba(255, 235, 215, 0.22)');
  warmGlow.addColorStop(0.65, 'rgba(0, 0, 0, 0)');
  warmGlow.addColorStop(1, 'rgba(38, 18, 10, 0.28)');
  ctx.fillStyle = warmGlow;
  ctx.fillRect(0, 0, S, S);

  // Hairline / sideburns strictly behind the ears (ears sit at U = 0.25 -> x = 64 and U = 0.75 -> x = 192)
  const hairCol =
    id === 'huangzhong' || id === 'yanyan' || id === 'huatuo'
      ? '#d8dee6'
      : id === 'caozhang'
        ? '#c78824'
        : '#18151a';
  ctx.fillStyle = hairCol;
  ctx.fillRect(0, 0, S, 76);
  ctx.fillRect(0, 0, 48, S);
  ctx.fillRect(S - 48, 0, 48, S);
  // Neat sideburn tabs in front of the ears
  if (!profile.isHeroine) {
    ctx.fillRect(48, 84, 8, 52);
    ctx.fillRect(S - 56, 84, 8, 52);
  } else {
    // Soft temple locks for heroines
    ctx.beginPath();
    ctx.moveTo(48, 76);
    ctx.quadraticCurveTo(60, 118, 52, 162);
    ctx.lineTo(48, 162);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(S - 48, 76);
    ctx.quadraticCurveTo(S - 60, 118, S - 52, 162);
    ctx.lineTo(S - 48, 162);
    ctx.closePath();
    ctx.fill();
  }

  // Sculpted ears at U = 0.25 (x = 62) and U = 0.75 (x = 194)
  for (const ex of [61, 195]) {
    ctx.fillStyle = 'rgba(48, 20, 12, 0.34)';
    ctx.beginPath();
    ctx.ellipse(ex, 132, 4.5, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 232, 212, 0.2)';
    ctx.beginPath();
    ctx.ellipse(ex + (ex < 128 ? 1.5 : -1.5), 131, 2.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose bridge highlight & nostrils (aligned with 3D nose cone at equator y = 136..148)
  ctx.fillStyle = 'rgba(255, 244, 230, 0.26)';
  ctx.fillRect(125, 124, 6, 24);
  ctx.fillStyle = 'rgba(52, 24, 16, 0.48)';
  ctx.beginPath();
  ctx.arc(123, 150, 2.2, 0, Math.PI * 2);
  ctx.arc(133, 150, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (left & right of U = 0.5, positioned clearly below helmet/hood brow line)
  for (const side of [-1, 1]) {
    const ex = 128 + side * 20;
    const ey = 128;
    // Sclera
    ctx.fillStyle = '#f5efe6';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 8.2, profile.isHeroine ? 4.8 : 3.9, side * -0.08, 0, Math.PI * 2);
    ctx.fill();
    // Iris & pupil
    ctx.fillStyle = '#1b1410';
    ctx.beginPath();
    ctx.arc(ex - side * 1, ey, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - side * 2, ey - 1, 1.1, 0, Math.PI * 2);
    ctx.fill();
    // Upper lash / ink eyeliner
    ctx.strokeStyle = '#120e0c';
    ctx.lineWidth = profile.isHeroine ? 2.3 : 2.0;
    ctx.beginPath();
    ctx.moveTo(ex - 8.5, ey + side * 0.8);
    ctx.quadraticCurveTo(ex, ey - 5.2, ex + 8.5, ey - side * 0.8);
    ctx.stroke();

    // Expressive sword-brows
    ctx.strokeStyle = hairCol;
    ctx.lineWidth = profile.isHeroine ? 2.4 : 4.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - side * 8.5, ey - 7.5);
    ctx.quadraticCurveTo(ex, ey - 11, ex + side * 11, ey - (profile.isHeroine ? 9 : 13.5));
    ctx.stroke();
  }

  // Xiahou Dun's iconic black leather eyepatch over his left eye
  if (id === 'xiahoudun') {
    ctx.strokeStyle = '#1b1614';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(64, 108);
    ctx.lineTo(192, 144);
    ctx.stroke();
    ctx.fillStyle = '#1a1614';
    ctx.strokeStyle = '#b68c3a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(148, 128, 11.5, 8.8, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Cheek battle-scars for scarred vanguard veterans (visible on both profile & 3/4 view)
  if (id === 'caoren' || id === 'yuejin' || id === 'liaohua' || id === 'yanbaihu' || id === 'zhoutai') {
    ctx.strokeStyle = 'rgba(112, 34, 28, 0.76)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(92, 134);
    ctx.lineTo(106, 156);
    ctx.moveTo(146, 135);
    ctx.lineTo(156, 156);
    ctx.stroke();
  }

  // Mouth / mustache & goatee
  if (profile.isHeroine) {
    ctx.fillStyle = 'rgba(218, 108, 102, 0.24)';
    ctx.beginPath();
    ctx.arc(102, 142, 12, 0, Math.PI * 2);
    ctx.arc(154, 142, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#b83b34';
    ctx.beginPath();
    ctx.ellipse(128, 164, 7.5, 3.3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(84, 38, 30, 0.78)';
    ctx.fillRect(119, 163, 18, 3);
    if (hero.war >= 78 || profile.hasLongBeard || hero.intellect >= 85) {
      ctx.strokeStyle = hairCol;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(128, 158);
      ctx.quadraticCurveTo(113, 158, 103, 168);
      ctx.moveTo(128, 158);
      ctx.quadraticCurveTo(143, 158, 153, 168);
      ctx.stroke();

      ctx.fillStyle = hairCol;
      ctx.beginPath();
      ctx.moveTo(121, 170);
      ctx.lineTo(135, 170);
      ctx.lineTo(128, 190);
      ctx.closePath();
      ctx.fill();
    }
  }

  return finish(bag, c);
}

/** Coursed Han fortress stone-brick diffuse + bump map for siege duel arenas. */
export function createFortressWallTextures(bag: DisposeBag): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const S = 256;
  const [cMap, ctx] = makeCanvas(S, S);
  const [cBump, bctx] = makeCanvas(S, S);
  const rnd = seeded(9187);

  ctx.fillStyle = '#48413a';
  ctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#303030';
  bctx.fillRect(0, 0, S, S);

  const rows = 8;
  const cols = 4;
  const rh = S / rows;
  const cw = S / cols;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (cw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * cw + off;
      const y = r * rh;
      const v = 76 + Math.floor(rnd() * 22);
      ctx.fillStyle = `rgb(${v}, ${v - 5}, ${v - 11})`;
      ctx.fillRect(x + 2, y + 2, cw - 4, rh - 4);
      ctx.fillStyle = 'rgba(255,245,225,0.09)';
      ctx.fillRect(x + 2, y + 2, cw - 4, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + 2, y + rh - 4, cw - 4, 2);

      const bv = 175 + Math.floor(rnd() * 50);
      bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bctx.fillRect(x + 2, y + 2, cw - 4, rh - 4);
    }
  }

  return {
    map: finish(bag, cMap, { repeat: [14, 2] }),
    bumpMap: finish(bag, cBump, { srgb: false, repeat: [14, 2] }),
  };
}
