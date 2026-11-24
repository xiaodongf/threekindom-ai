import * as THREE from 'three';
import {
  LAKE_FEATURES,
  LAND_PATHS,
  MAP_HEIGHT,
  MAP_WIDTH,
  RIVER_FEATURES,
} from '../../game/mapGeo.js';
import type { City } from '../../game/types.js';
import type { DisposeBag } from '../duel/duelGeometry3D.js';

/** World size of the campaign sheet. Map coordinates (1000 x 660) are scaled onto it. */
export const WORLD_W = 100;
export const WORLD_H = 66;
/** Metres encoded at full white in public/map/china_height.png (see scripts/build-terrain.mjs). */
const HEIGHT_MAX_M = 6500;
/** World height of the tallest relief; real scale would read as noise, so relief is exaggerated. */
const RELIEF_TOP = 7.4;

export function mapToWorld(x: number, y: number): { wx: number; wz: number } {
  return { wx: (x / MAP_WIDTH - 0.5) * WORLD_W, wz: (y / MAP_HEIGHT - 0.5) * WORLD_H };
}

/** Exaggerated, lowland-friendly relief curve: hills near the cities stay visible. */
function reliefOf(metres: number): number {
  return RELIEF_TOP * Math.pow(Math.min(1, metres / 5200), 0.66);
}

export interface MapWorld {
  /** RG half-float: R = world height, G = metres / 6500. Row 0 is the northern edge. */
  heightTex: THREE.DataTexture;
  /** RGBA8: R land, G coast proximity (0.5 at the shore), B rivers and lakes, A roads. */
  maskTex: THREE.DataTexture;
  /** RG8, nearest: R = index of the city that holds this ground, G = index across the nearest border. */
  provinceTex: THREE.DataTexture;
  /**
   * RG8, linear, 1 = 48 map units or more: R = distance to the nearest border between two cities,
   * G = distance to the nearest border between two provinces (州).
   */
  borderTex: THREE.DataTexture;
  texW: number;
  texH: number;
  /** City order used by the province texture and the shader's city table. */
  cityIds: string[];
  /** Index of the city whose ground a map coordinate falls on. */
  cityIndexAt(mapX: number, mapY: number): number;
  /** World height of the terrain at a map coordinate (before any paper-mode flattening). */
  heightAt(mapX: number, mapY: number): number;
  /** Metres above sea level at a map coordinate. */
  metresAt(mapX: number, mapY: number): number;
  isLand(mapX: number, mapY: number): boolean;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function channelCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.scale(w / MAP_WIDTH, h / MAP_HEIGHT);
  return [c, ctx];
}

function readChannel(c: HTMLCanvasElement): Uint8ClampedArray {
  const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const out = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4];
  return out;
}

/** Separable box blur on a float field, a few passes of which approximate a Gaussian. */
function boxBlur(src: Float32Array, w: number, h: number, radius: number, passes: number): Float32Array {
  const a = src;
  const b = new Float32Array(src.length);
  const win = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -radius; x <= radius; x++) acc += a[row + Math.max(0, Math.min(w - 1, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / win;
        acc += a[row + Math.min(w - 1, x + radius + 1)] - a[row + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += b[Math.max(0, Math.min(h - 1, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / win;
        acc += b[Math.min(h - 1, y + radius + 1) * w + x] - b[Math.max(0, y - radius) * w + x];
      }
    }
  }
  return a;
}

/**
 * Builds everything the terrain shader and the scene need to know about the ground: real relief
 * from the baked elevation image, coast / river / road masks drawn from the game's map geometry,
 * and the static partition of the land into the provinces each city holds.
 */
export async function buildMapWorld(cities: City[], bag: DisposeBag): Promise<MapWorld> {
  const img = await loadImage('/map/china_height.png');
  const texW = img.naturalWidth;
  const texH = img.naturalHeight;

  // --- masks drawn from the same vector data as the flat map, so both views agree
  const [landC, landCtx] = channelCanvas(texW, texH);
  landCtx.fillStyle = '#fff';
  for (const d of LAND_PATHS) landCtx.fill(new Path2D(d));
  const land = readChannel(landC);

  const [waterC, waterCtx] = channelCanvas(texW, texH);
  waterCtx.strokeStyle = '#fff';
  waterCtx.fillStyle = '#fff';
  waterCtx.lineCap = 'round';
  waterCtx.lineJoin = 'round';
  for (const river of RIVER_FEATURES) {
    waterCtx.lineWidth = river.width * 1.15 + 0.6;
    waterCtx.stroke(new Path2D(river.d));
  }
  for (const lake of LAKE_FEATURES) waterCtx.fill(new Path2D(lake.d));
  const water = readChannel(waterC);

  const [roadC, roadCtx] = channelCanvas(texW, texH);
  roadCtx.strokeStyle = '#fff';
  roadCtx.lineWidth = 1.5;
  roadCtx.lineCap = 'round';
  roadCtx.setLineDash([5, 4]);
  const byId = new Map(cities.map((c) => [c.id, c]));
  const drawn = new Set<string>();
  for (const city of cities) {
    for (const nid of city.neighbors) {
      const other = byId.get(nid);
      const key = [city.id, nid].sort().join('|');
      if (!other || drawn.has(key)) continue;
      drawn.add(key);
      roadCtx.beginPath();
      roadCtx.moveTo(city.x, city.y);
      const mx = (city.x + other.x) / 2;
      const my = (city.y + other.y) / 2;
      const nx = -(other.y - city.y) * 0.08;
      const ny = (other.x - city.x) * 0.08;
      roadCtx.quadraticCurveTo(mx + nx, my + ny, other.x, other.y);
      roadCtx.stroke();
    }
  }
  const road = readChannel(roadC);

  const landF = new Float32Array(texW * texH);
  for (let i = 0; i < landF.length; i++) landF[i] = land[i] / 255;
  const coast = boxBlur(Float32Array.from(landF), texW, texH, 9, 3);
  const landSoft = boxBlur(Float32Array.from(landF), texW, texH, 1, 1);

  const mask = new Uint8Array(texW * texH * 4);
  for (let i = 0; i < landF.length; i++) {
    mask[i * 4] = Math.round(landSoft[i] * 255);
    mask[i * 4 + 1] = Math.round(coast[i] * 255);
    mask[i * 4 + 2] = water[i];
    mask[i * 4 + 3] = road[i];
  }
  const maskTex = bag.add(new THREE.DataTexture(mask, texW, texH, THREE.RGBAFormat));
  maskTex.magFilter = THREE.LinearFilter;
  maskTex.minFilter = THREE.LinearFilter;
  maskTex.needsUpdate = true;

  // --- relief
  const hc = document.createElement('canvas');
  hc.width = texW;
  hc.height = texH;
  const hctx = hc.getContext('2d', { willReadFrequently: true })!;
  hctx.drawImage(img, 0, 0);
  const raw = hctx.getImageData(0, 0, texW, texH).data;
  const metresRaw = new Float32Array(texW * texH);
  for (let i = 0; i < metresRaw.length; i++) {
    const v = raw[i * 4] / 255;
    metresRaw[i] = v * v * HEIGHT_MAX_M;
  }
  // Real terrain at this scale is noise; a light blur keeps ranges and basins, drops the speckle.
  const metres = boxBlur(metresRaw, texW, texH, 1, 2);
  const worldY = new Float32Array(texW * texH);
  const heightData = new Uint16Array(texW * texH * 2);
  for (let i = 0; i < worldY.length; i++) {
    const l = landSoft[i];
    const y = l * (0.1 + reliefOf(metres[i]));
    worldY[i] = y;
    heightData[i * 2] = THREE.DataUtils.toHalfFloat(y);
    heightData[i * 2 + 1] = THREE.DataUtils.toHalfFloat((metres[i] * l) / HEIGHT_MAX_M);
  }
  const heightTex = bag.add(
    new THREE.DataTexture(heightData, texW, texH, THREE.RGFormat, THREE.HalfFloatType)
  );
  heightTex.magFilter = THREE.LinearFilter;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  // --- each piece of ground belongs to its nearest city, and through the city to a province
  const cityIds = cities.map((c) => c.id);
  const pw = 512;
  const ph = Math.round((pw * MAP_HEIGHT) / MAP_WIDTH);
  const province = new Uint8Array(pw * ph * 2);
  const border = new Uint8Array(pw * ph * 2);
  const cx = cities.map((c) => c.x);
  const cy = cities.map((c) => c.y);
  const cprov = cities.map((c) => c.province);
  for (let j = 0; j < ph; j++) {
    const my = ((j + 0.5) / ph) * MAP_HEIGHT;
    for (let i = 0; i < pw; i++) {
      const mx = ((i + 0.5) / pw) * MAP_WIDTH;
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < cx.length; k++) {
        const d = (mx - cx[k]) ** 2 + (my - cy[k]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      // Distance to the bisector with every other city; the smallest is the nearest border.
      // The nearest bisector with a city of another province is the nearest province border.
      let nb = best;
      let nbDist = Infinity;
      let provDist = Infinity;
      for (let k = 0; k < cx.length; k++) {
        if (k === best) continue;
        const dk = (mx - cx[k]) ** 2 + (my - cy[k]) ** 2;
        const sep = Math.hypot(cx[k] - cx[best], cy[k] - cy[best]) || 1;
        const dist = (dk - bestD) / (2 * sep);
        if (dist < nbDist) {
          nbDist = dist;
          nb = k;
        }
        if (cprov[k] !== cprov[best] && dist < provDist) provDist = dist;
      }
      const o = j * pw + i;
      province[o * 2] = best;
      province[o * 2 + 1] = nb;
      border[o * 2] = Math.round(Math.min(1, nbDist / 48) * 255);
      border[o * 2 + 1] = Math.round(Math.min(1, provDist / 48) * 255);
    }
  }
  const provinceTex = bag.add(new THREE.DataTexture(province, pw, ph, THREE.RGFormat));
  provinceTex.magFilter = THREE.NearestFilter;
  provinceTex.minFilter = THREE.NearestFilter;
  provinceTex.needsUpdate = true;
  const borderTex = bag.add(new THREE.DataTexture(border, pw, ph, THREE.RGFormat));
  borderTex.magFilter = THREE.LinearFilter;
  borderTex.minFilter = THREE.LinearFilter;
  borderTex.needsUpdate = true;

  const bilinear = (field: Float32Array, mapX: number, mapY: number): number => {
    const fx = Math.max(0, Math.min(texW - 1.001, (mapX / MAP_WIDTH) * texW - 0.5));
    const fy = Math.max(0, Math.min(texH - 1.001, (mapY / MAP_HEIGHT) * texH - 0.5));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const ax = fx - ix;
    const ay = fy - iy;
    const i = iy * texW + ix;
    return (
      field[i] * (1 - ax) * (1 - ay) +
      field[i + 1] * ax * (1 - ay) +
      field[i + texW] * (1 - ax) * ay +
      field[i + texW + 1] * ax * ay
    );
  };

  return {
    heightTex,
    maskTex,
    provinceTex,
    borderTex,
    texW,
    texH,
    cityIds,
    cityIndexAt: (x, y) => {
      const i = Math.max(0, Math.min(pw - 1, Math.floor((x / MAP_WIDTH) * pw)));
      const j = Math.max(0, Math.min(ph - 1, Math.floor((y / MAP_HEIGHT) * ph)));
      return province[(j * pw + i) * 2];
    },
    heightAt: (x, y) => bilinear(worldY, x, y),
    metresAt: (x, y) => bilinear(metres, x, y),
    isLand: (x, y) => bilinear(landSoft, x, y) > 0.5,
  };
}
