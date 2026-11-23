// Bakes real elevation for the campaign map into public/map/china_height.png.
//
// Source: Terrain Tiles on AWS Open Data ("terrarium" PNGs, Web Mercator), zoom 6, 24 tiles.
//   https://registry.opendata.aws/terrain-tiles/
// Output: 1024x676 8-bit greyscale, resampled to the game's equirectangular projection
// [100.8E..124.2E, 25.4N..39.0N]. Height is stored as sqrt(h / MAX_M) so the lowlands, where most
// cities sit, keep their detail. Sea and anything below 0 m is 0.
//
// Run once (needs network):  npm run build:terrain
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, 'node_modules', '.cache', 'terrain-tiles');
const outFile = path.join(root, 'public', 'map', 'china_height.png');

const LON_MIN = 100.8;
const LON_MAX = 124.2;
const LAT_MIN = 25.4;
const LAT_MAX = 39.0;
const OUT_W = 1024;
const OUT_H = 676;
const ZOOM = 6;
const TILE = 256;
const MAX_M = 6500;

const n = 2 ** ZOOM;
const lonToX = (lon) => ((lon + 180) / 360) * n;
const latToY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
};

const x0 = Math.floor(lonToX(LON_MIN));
const x1 = Math.floor(lonToX(LON_MAX));
const y0 = Math.floor(latToY(LAT_MAX));
const y1 = Math.floor(latToY(LAT_MIN));
const cols = x1 - x0 + 1;
const rows = y1 - y0 + 1;

await mkdir(cacheDir, { recursive: true });
await mkdir(path.dirname(outFile), { recursive: true });

async function loadTile(x, y) {
  const file = path.join(cacheDir, `${ZOOM}-${x}-${y}.png`);
  let buf;
  try {
    buf = await readFile(file);
  } catch {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
  }
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== TILE || info.height !== TILE || info.channels !== 3) {
    throw new Error(`unexpected tile shape ${info.width}x${info.height}x${info.channels}`);
  }
  return data;
}

// Mosaic of metres
const mosaicW = cols * TILE;
const mosaicH = rows * TILE;
const metres = new Float32Array(mosaicW * mosaicH);
let bytes = 0;
for (let ty = 0; ty < rows; ty++) {
  for (let tx = 0; tx < cols; tx++) {
    const data = await loadTile(x0 + tx, y0 + ty);
    bytes += data.length;
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const i = (py * TILE + px) * 3;
        const h = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
        metres[(ty * TILE + py) * mosaicW + tx * TILE + px] = h;
      }
    }
  }
}

const sample = (fx, fy) => {
  const x = Math.max(0, Math.min(mosaicW - 1.001, fx));
  const y = Math.max(0, Math.min(mosaicH - 1.001, fy));
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const ax = x - ix;
  const ay = y - iy;
  const a = metres[iy * mosaicW + ix];
  const b = metres[iy * mosaicW + ix + 1];
  const c = metres[(iy + 1) * mosaicW + ix];
  const d = metres[(iy + 1) * mosaicW + ix + 1];
  return a * (1 - ax) * (1 - ay) + b * ax * (1 - ay) + c * (1 - ax) * ay + d * ax * ay;
};

const heightAt = (lon, lat) =>
  sample((lonToX(lon) - x0) * TILE - 0.5, (latToY(lat) - y0) * TILE - 0.5);

const out = Buffer.alloc(OUT_W * OUT_H);
let maxSeen = 0;
for (let y = 0; y < OUT_H; y++) {
  const lat = LAT_MAX - ((y + 0.5) / OUT_H) * (LAT_MAX - LAT_MIN);
  for (let x = 0; x < OUT_W; x++) {
    const lon = LON_MIN + ((x + 0.5) / OUT_W) * (LON_MAX - LON_MIN);
    const h = Math.max(0, heightAt(lon, lat));
    if (h > maxSeen) maxSeen = h;
    out[y * OUT_W + x] = Math.round(255 * Math.sqrt(Math.min(h, MAX_M) / MAX_M));
  }
}

await sharp(out, { raw: { width: OUT_W, height: OUT_H, channels: 1 } })
  .png({ compressionLevel: 9 })
  .toFile(outFile);

const spot = (name, lon, lat) => `${name} ${Math.round(heightAt(lon, lat))} m`;
console.log(`${cols * rows} tiles, highest point ${Math.round(maxSeen)} m`);
console.log(
  [
    spot('Chengdu', 104.07, 30.67),
    spot("Chang'an", 108.94, 34.34),
    spot('Luoyang', 112.45, 34.62),
    spot('Hanzhong', 107.03, 33.07),
    spot('Taibai (Qinling)', 107.77, 33.95),
    spot('Jianye', 118.8, 32.06),
  ].join(' · ')
);
console.log(`wrote ${path.relative(root, outFile)}`);
