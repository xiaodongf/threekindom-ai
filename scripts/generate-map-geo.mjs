import fs from 'node:fs';
import path from 'node:path';
import * as topojson from 'topojson-client';

const W = 1000;
const H = 660;
const LON_MIN = 100.8;
const LON_MAX = 124.2;
const LAT_MIN = 25.4;
const LAT_MAX = 39.0;

function proj(lon, lat) {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H;
  return [x, y];
}

// Sutherland-Hodgman polygon clipping to rectangle [xmin, ymin, xmax, ymax]
function clipPolygon(points, xmin, ymin, xmax, ymax) {
  function clipEdge(pts, isInside, intersect) {
    if (pts.length === 0) return [];
    const out = [];
    let prev = pts[pts.length - 1];
    let prevIn = isInside(prev);
    for (const curr of pts) {
      const currIn = isInside(curr);
      if (currIn) {
        if (!prevIn) out.push(intersect(prev, curr));
        out.push(curr);
      } else if (prevIn) {
        out.push(intersect(prev, curr));
      }
      prev = curr;
      prevIn = currIn;
    }
    return out;
  }

  let poly = points;
  poly = clipEdge(
    poly,
    (p) => p[0] >= xmin,
    (a, b) => {
      const t = (xmin - a[0]) / (b[0] - a[0] || 1e-9);
      return [xmin, a[1] + t * (b[1] - a[1])];
    }
  );
  poly = clipEdge(
    poly,
    (p) => p[0] <= xmax,
    (a, b) => {
      const t = (xmax - a[0]) / (b[0] - a[0] || 1e-9);
      return [xmax, a[1] + t * (b[1] - a[1])];
    }
  );
  poly = clipEdge(
    poly,
    (p) => p[1] >= ymin,
    (a, b) => {
      const t = (ymin - a[1]) / (b[1] - a[1] || 1e-9);
      return [a[0] + t * (b[0] - a[0]), ymin];
    }
  );
  poly = clipEdge(
    poly,
    (p) => p[1] <= ymax,
    (a, b) => {
      const t = (ymax - a[1]) / (b[1] - a[1] || 1e-9);
      return [a[0] + t * (b[0] - a[0]), ymax];
    }
  );
  return poly;
}

function simplifyPts(pts, minDist = 1.4) {
  if (pts.length <= 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    if (Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]) >= minDist) {
      out.push(pts[i]);
    }
  }
  return out;
}

function ptsToPath(pts, closed = true) {
  if (pts.length < (closed ? 3 : 2)) return '';
  const body = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L');
  return closed ? `M${body}Z` : `M${body}`;
}

function smoothOpenPath(coords) {
  const pts = coords.map(([lon, lat]) => proj(lon, lat));
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`;
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  d += `L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
  return d;
}

function smoothClosedBlob(coords) {
  const pts = coords.map(([lon, lat]) => proj(lon, lat));
  if (pts.length < 3) return '';
  const n = pts.length;
  const startX = (pts[n - 1][0] + pts[0][0]) / 2;
  const startY = (pts[n - 1][1] + pts[0][1]) / 2;
  let d = `M${startX.toFixed(1)},${startY.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const mx = (curr[0] + next[0]) / 2;
    const my = (curr[1] + next[1]) / 2;
    d += `Q${curr[0].toFixed(1)},${curr[1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  return `${d}Z`;
}

// Build realistic connected mountain ridge massif (lit NW slope, dark SE slope, jagged crest & branching spurs)
function buildMountainRidge(id, coords, widthPx, alpine = false) {
  const spine = coords.map(([lon, lat]) => proj(lon, lat));
  const litEdge = [];
  const darkEdge = [];
  const spurs = [];

  for (let i = 0; i < spine.length; i++) {
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(spine.length - 1, i + 1)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    // Perpendicular unit vector
    let nx = -ty / len;
    let ny = tx / len;
    // Orient normal consistently toward NW (sunlit side: nx + ny < 0)
    if (nx + ny > 0) {
      nx = -nx;
      ny = -ny;
    }

    // Taper width smoothly at ends with slight natural jagged undulation
    const t = i / Math.max(1, spine.length - 1);
    const taper = Math.sin(t * Math.PI) * 0.78 + 0.22;
    const jag = 0.78 + ((i * 37) % 10) * 0.045;
    const w = widthPx * taper * jag;

    litEdge.push([spine[i][0] + nx * w * 0.92, spine[i][1] + ny * w * 0.92]);
    darkEdge.push([spine[i][0] - nx * w * 1.15, spine[i][1] - ny * w * 1.15]);

    // Add organic rib/spur lines radiating from internal crest points
    if (i > 0 && i < spine.length - 1) {
      const sLit = [
        spine[i][0] + nx * w * 0.75 - (tx / len) * w * 0.22,
        spine[i][1] + ny * w * 0.75 - (ty / len) * w * 0.22,
      ];
      const sDark = [
        spine[i][0] - nx * w * 0.95 + (tx / len) * w * 0.28,
        spine[i][1] - ny * w * 0.95 + (ty / len) * w * 0.28,
      ];
      spurs.push({
        side: 'lit',
        d: `M${spine[i][0].toFixed(1)},${spine[i][1].toFixed(1)}L${sLit[0].toFixed(1)},${sLit[1].toFixed(1)}`,
      });
      spurs.push({
        side: 'dark',
        d: `M${spine[i][0].toFixed(1)},${spine[i][1].toFixed(1)}L${sDark[0].toFixed(1)},${sDark[1].toFixed(1)}`,
      });
    }
  }

  const litPoly = [...spine, ...litEdge.reverse()];
  const darkPoly = [...spine, ...darkEdge.reverse()];

  return {
    id,
    alpine,
    crestPath: ptsToPath(spine, false),
    litPath: ptsToPath(litPoly, true),
    darkPath: ptsToPath(darkPoly, true),
    spurs,
  };
}

// 1. Load Natural Earth 1:50m Land
const landTopo = JSON.parse(
  fs.readFileSync(path.resolve('node_modules/world-atlas/land-50m.json'), 'utf8')
);
const land = topojson.feature(landTopo, landTopo.objects.land);

const landPaths = [];
const geoms =
  land.type === 'FeatureCollection' ? land.features.map((f) => f.geometry) : [land.geometry];

for (const geom of geoms) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    const projected = poly[0].map(([lon, lat]) => proj(lon, lat));
    const clipped = clipPolygon(projected, -25, -25, W + 25, H + 25);
    const simplified = simplifyPts(clipped, 1.4);
    if (simplified.length >= 3) {
      landPaths.push(ptsToPath(simplified, true));
    }
  }
}

// 2. Real Geographic Major Rivers (split into upper/lower for realistic natural widening!)
const rivers = [
  {
    id: 'yellow-upper',
    name: { en: 'Yellow River', zh: '黄河' },
    width: 3.1,
    d: smoothOpenPath([
      [101.2, 36.1], [103.0, 36.0], [104.2, 36.7], [105.6, 37.5], [106.5, 38.6],
      [107.0, 39.4], [110.8, 39.4], [111.1, 38.2], [110.6, 37.0], [110.5, 35.8],
      [110.3, 34.65],
    ]),
  },
  {
    id: 'yellow-lower',
    name: { en: 'Yellow River', zh: '黄河' },
    width: 4.5,
    d: smoothOpenPath([
      [110.3, 34.65], [111.3, 34.78], [112.4, 34.92], [113.6, 34.95], [114.6, 35.25],
      [115.2, 36.0], [115.9, 36.7], [116.8, 37.35], [117.7, 37.95], [118.4, 38.25],
    ]),
  },
  {
    id: 'wei-river',
    name: { en: 'Wei River', zh: '渭水' },
    width: 2.3,
    d: smoothOpenPath([
      [104.8, 34.8], [106.0, 34.5], [107.2, 34.35], [108.4, 34.32], [109.2, 34.45], [110.3, 34.62],
    ]),
  },
  {
    id: 'fen-river',
    name: { en: 'Fen River', zh: '汾水' },
    width: 1.8,
    d: smoothOpenPath([
      [112.4, 38.4], [112.5, 37.6], [111.8, 36.7], [111.4, 35.8], [110.5, 35.4],
    ]),
  },
  {
    id: 'huai-river',
    name: { en: 'Huai River', zh: '淮河' },
    width: 2.6,
    d: smoothOpenPath([
      [113.4, 32.4], [114.6, 32.2], [115.6, 32.45], [116.6, 32.65], [117.5, 32.95],
      [118.5, 33.25], [119.4, 33.85], [120.3, 34.25],
    ]),
  },
  {
    id: 'yangtze-upper',
    name: { en: 'Yangtze River', zh: '长江' },
    width: 3.3,
    d: smoothOpenPath([
      [101.6, 26.6], [103.0, 27.3], [104.5, 28.75], [105.6, 28.9], [106.6, 29.55],
      [107.8, 30.2], [109.2, 30.9], [110.5, 30.95], [111.4, 30.55],
    ]),
  },
  {
    id: 'yangtze-mid',
    name: { en: 'Yangtze River', zh: '长江' },
    width: 4.8,
    d: smoothOpenPath([
      [111.4, 30.55], [112.1, 30.25], [112.9, 29.55], [113.5, 29.65], [114.25, 30.55],
      [115.2, 30.15], [116.0, 29.75], [116.9, 30.45], [117.8, 31.05],
    ]),
  },
  {
    id: 'yangtze-estuary',
    name: { en: 'Yangtze River', zh: '长江' },
    width: 6.2,
    d: smoothOpenPath([
      [117.8, 31.05], [118.4, 31.6], [118.95, 32.1], [119.8, 32.2],
      [120.7, 31.95], [121.45, 31.55], [122.1, 31.35],
    ]),
  },
  {
    id: 'min-river',
    name: { en: 'Min River', zh: '岷江' },
    width: 2.1,
    d: smoothOpenPath([
      [103.5, 32.6], [103.65, 31.5], [103.95, 30.65], [103.85, 29.6], [104.5, 28.75],
    ]),
  },
  {
    id: 'jialing-river',
    name: { en: 'Jialing River', zh: '嘉陵江' },
    width: 1.9,
    d: smoothOpenPath([
      [106.0, 33.6], [105.85, 32.4], [106.05, 31.2], [106.25, 30.2], [106.55, 29.58],
    ]),
  },
  {
    id: 'han-river',
    name: { en: 'Han River', zh: '汉水' },
    width: 2.8,
    d: smoothOpenPath([
      [106.4, 33.2], [107.1, 33.05], [108.5, 32.85], [109.9, 32.7], [111.2, 32.5],
      [112.15, 32.05], [112.6, 31.2], [113.4, 30.7], [114.25, 30.55],
    ]),
  },
  {
    id: 'xiang-river',
    name: { en: 'Xiang River', zh: '湘江' },
    width: 2.2,
    d: smoothOpenPath([
      [111.2, 25.8], [112.1, 26.6], [112.6, 27.4], [112.95, 28.25], [112.9, 29.15],
    ]),
  },
  {
    id: 'gan-river',
    name: { en: 'Gan River', zh: '赣江' },
    width: 2.0,
    d: smoothOpenPath([
      [114.9, 25.9], [115.0, 26.9], [115.4, 27.9], [115.9, 28.7], [116.25, 29.15],
    ]),
  },
  {
    id: 'qiantang-river',
    name: { en: 'Qiantang River', zh: '钱塘江' },
    width: 2.1,
    d: smoothOpenPath([
      [118.6, 29.1], [119.5, 29.6], [120.1, 30.15], [120.7, 30.32], [121.3, 30.45],
    ]),
  },
];

// 3. Major Natural Lakes
const lakes = [
  {
    id: 'dongting',
    name: { en: 'Dongting Lake', zh: '洞庭湖' },
    d: smoothClosedBlob([
      [112.35, 29.35], [112.85, 29.55], [113.25, 29.45], [113.15, 29.0], [112.65, 28.9], [112.25, 29.1],
    ]),
  },
  {
    id: 'poyang',
    name: { en: 'Poyang Lake', zh: '鄱阳湖' },
    d: smoothClosedBlob([
      [116.05, 29.65], [116.45, 29.55], [116.65, 29.1], [116.4, 28.72], [116.0, 28.95], [115.95, 29.35],
    ]),
  },
  {
    id: 'taihu',
    name: { en: 'Lake Tai', zh: '太湖' },
    d: smoothClosedBlob([
      [119.95, 31.42], [120.42, 31.38], [120.5, 31.02], [120.08, 30.92], [119.88, 31.18],
    ]),
  },
  {
    id: 'chaohu',
    name: { en: 'Lake Chao', zh: '巢湖' },
    d: smoothClosedBlob([
      [117.32, 31.68], [117.72, 31.64], [117.68, 31.42], [117.3, 31.46],
    ]),
  },
];

// 4. Physical Hypsometric Elevation Zones
const elevationZones = [
  {
    id: 'tibetan-edge',
    kind: 'alpine',
    d: smoothClosedBlob([
      [100.2, 38.8], [103.3, 37.8], [103.8, 35.0], [103.1, 32.5], [102.6, 29.8],
      [102.1, 26.8], [100.2, 25.0],
    ]),
  },
  {
    id: 'loess-plateau',
    kind: 'plateau',
    d: smoothClosedBlob([
      [104.2, 38.6], [111.5, 39.2], [113.0, 37.4], [112.0, 35.4], [109.6, 35.0],
      [106.8, 35.2], [104.5, 36.2],
    ]),
  },
  {
    id: 'qinling-daba-belt',
    kind: 'mountain',
    d: smoothClosedBlob([
      [104.2, 34.4], [108.5, 33.9], [111.2, 33.6], [111.5, 31.6], [109.4, 30.8],
      [106.8, 31.9], [104.5, 32.5],
    ]),
  },
  {
    id: 'taihang-shanxi',
    kind: 'mountain',
    d: smoothClosedBlob([
      [112.2, 39.0], [114.2, 38.5], [113.8, 35.8], [112.2, 35.1], [111.2, 36.8],
    ]),
  },
  {
    id: 'sichuan-basin',
    kind: 'basin',
    d: smoothClosedBlob([
      [103.2, 31.4], [105.6, 31.9], [107.6, 30.9], [107.2, 28.9], [104.4, 28.7], [103.1, 29.8],
    ]),
  },
  {
    id: 'north-china-plain',
    kind: 'plain',
    d: smoothClosedBlob([
      [114.4, 38.8], [118.4, 38.4], [120.2, 36.2], [119.8, 33.5], [118.2, 32.3],
      [114.5, 32.5], [112.8, 34.2], [113.7, 36.2],
    ]),
  },
  {
    id: 'yangtze-lowlands',
    kind: 'plain',
    d: smoothClosedBlob([
      [111.5, 31.4], [114.6, 31.2], [117.5, 31.8], [121.4, 32.0], [121.6, 30.3],
      [118.2, 30.1], [115.6, 29.2], [112.0, 29.0],
    ]),
  },
  {
    id: 'dabie-hills',
    kind: 'mountain',
    d: smoothClosedBlob([
      [114.2, 32.1], [116.5, 31.6], [116.3, 30.4], [114.5, 30.8],
    ]),
  },
  {
    id: 'southern-highlands',
    kind: 'hills',
    d: smoothClosedBlob([
      [106.0, 28.4], [110.8, 29.2], [111.8, 27.2], [114.2, 27.6], [117.6, 28.6],
      [120.4, 29.3], [120.6, 26.2], [116.0, 25.0], [108.0, 25.0],
    ]),
  },
];

// 5. Topographic Elevation Contour Rings (subtle cartographic isolines)
const contourPaths = [
  smoothClosedBlob([[100.3, 37.8], [102.6, 36.5], [103.0, 33.5], [102.4, 30.2], [101.8, 27.0], [100.3, 25.6]]),
  smoothClosedBlob([[100.3, 36.4], [101.9, 34.8], [102.1, 31.8], [101.6, 28.8], [100.3, 27.2]]),
  smoothClosedBlob([[105.0, 38.2], [110.5, 38.5], [111.2, 36.5], [109.2, 35.5], [106.2, 35.8]]),
  smoothClosedBlob([[105.6, 34.1], [108.4, 33.9], [110.6, 33.5], [110.4, 32.8], [107.6, 33.3]]),
  smoothClosedBlob([[112.4, 38.4], [113.8, 37.8], [113.4, 35.8], [112.0, 35.5], [111.7, 37.0]]),
  smoothClosedBlob([[116.8, 28.5], [119.5, 29.0], [119.8, 26.8], [117.2, 26.2]]),
];

// 6. Connected 3D Shaded Mountain Ridgelines (Realistic Physical Atlas Style!)
const mountainRidges = [
  // Hengduan / Minshan High Alpine Spine (West Sichuan)
  buildMountainRidge(
    'minshan-north',
    [[101.2, 35.4], [102.1, 34.5], [102.8, 33.4], [103.1, 32.3], [102.8, 31.2]],
    20,
    true
  ),
  buildMountainRidge(
    'hengduan-south',
    [[102.5, 31.0], [102.0, 29.8], [102.3, 28.6], [101.7, 27.3], [101.4, 26.0]],
    21,
    true
  ),
  buildMountainRidge(
    'qionglai-spur',
    [[101.1, 32.8], [101.8, 31.7], [101.5, 30.4], [101.1, 29.0]],
    16,
    true
  ),
  // Qinling Mountain Spine (Separating Chang'an & Hanzhong)
  buildMountainRidge(
    'qinling-main',
    [[104.8, 34.25], [106.0, 34.05], [107.2, 33.92], [108.4, 33.82], [109.6, 33.75], [110.8, 33.88]],
    17,
    false
  ),
  // Daba & Wu Shan / Three Gorges Mountain Arc (Ring around Sichuan Basin)
  buildMountainRidge(
    'daba-wushan',
    [[106.0, 32.45], [107.3, 32.25], [108.5, 31.95], [109.6, 31.45], [110.5, 31.0], [110.8, 30.3]],
    16,
    false
  ),
  // Taihang Mountain Range (West of Ye / Hebei)
  buildMountainRidge(
    'taihang-main',
    [[114.1, 38.8], [113.8, 37.8], [113.5, 36.8], [113.2, 35.9], [112.5, 35.2]],
    15,
    false
  ),
  // Luliang Range (Shanxi interior)
  buildMountainRidge(
    'luliang-range',
    [[111.9, 38.6], [111.5, 37.4], [111.2, 36.2], [110.8, 35.3]],
    13,
    false
  ),
  // Dabie Mountains (Between Xiangyang, Hefei & Chaisang)
  buildMountainRidge(
    'dabie-range',
    [[114.2, 31.8], [115.1, 31.45], [115.9, 31.05], [116.5, 30.75]],
    13,
    false
  ),
  // Mount Tai & Shandong Highlands
  buildMountainRidge(
    'shandong-tai',
    [[116.9, 36.3], [117.8, 36.15], [118.8, 36.05], [120.2, 36.9], [121.3, 37.2]],
    11,
    false
  ),
  // Wuling & Xuefeng Mountains (West of Changsha)
  buildMountainRidge(
    'wuling-xuefeng',
    [[109.2, 29.6], [109.8, 28.6], [110.5, 27.6], [110.8, 26.5]],
    14,
    false
  ),
  // Luoxiao Mountains (Between Changsha & Poyang)
  buildMountainRidge(
    'luoxiao-range',
    [[114.2, 28.6], [114.0, 27.5], [114.3, 26.4], [114.1, 25.6]],
    12,
    false
  ),
  // Wuyi & Huangshan / Tianmu Ranges (Southeast Jiangnan)
  buildMountainRidge(
    'wuyi-main',
    [[119.5, 29.8], [118.6, 28.9], [117.9, 27.9], [117.1, 26.8], [116.5, 25.8]],
    15,
    false
  ),
  buildMountainRidge(
    'huangshan-range',
    [[117.4, 30.35], [118.3, 30.1], [119.2, 30.2]],
    11,
    false
  ),
];

// 7. Geographic Place Labels (tuned for zero overlap with cities or UI)
const geoLabels = [
  { text: { en: 'BOHAI SEA', zh: '渤 海' }, kind: 'sea', ...(() => { const [x, y] = proj(119.1, 38.3); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'YELLOW SEA', zh: '黄 海' }, kind: 'sea', ...(() => { const [x, y] = proj(122.3, 34.4); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'EAST CHINA SEA', zh: '东 海' }, kind: 'sea', ...(() => { const [x, y] = proj(122.7, 29.2); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'North China Plain', zh: '中原 · 华北平原' }, kind: 'region', ...(() => { const [x, y] = proj(116.6, 35.1); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'Sichuan Basin', zh: '巴蜀 · 四川盆地' }, kind: 'region', ...(() => { const [x, y] = proj(105.7, 30.1); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'Loess Plateau', zh: '黄土高原' }, kind: 'region', ...(() => { const [x, y] = proj(108.1, 36.8); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'Qinling Mts', zh: '秦岭' }, kind: 'mountain', ...(() => { const [x, y] = proj(107.6, 33.48); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'Taihang Mts', zh: '太行山' }, kind: 'mountain', ...(() => { const [x, y] = proj(112.7, 37.0); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'Wuyi Mts', zh: '武夷山' }, kind: 'mountain', ...(() => { const [x, y] = proj(117.7, 27.0); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'Yellow River', zh: '黄河' }, kind: 'river', ...(() => { const [x, y] = proj(111.5, 35.25); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'Yangtze River', zh: '长江' }, kind: 'river', ...(() => { const [x, y] = proj(114.5, 30.0); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
  { text: { en: 'Han River', zh: '汉水' }, kind: 'river', ...(() => { const [x, y] = proj(110.2, 32.85); return { x: +x.toFixed(1), y: +y.toFixed(1) }; })() },
];

const graticuleLons = [105, 110, 115, 120].map((lon) => ({
  label: `${lon}°E`,
  x: Number(proj(lon, LAT_MIN)[0].toFixed(1)),
}));
const graticuleLats = [28, 32, 36].map((lat) => ({
  label: `${lat}°N`,
  y: Number(proj(LON_MIN, lat)[1].toFixed(1)),
}));

const out = `// Auto-generated from Natural Earth 1:50m (world-atlas) + historical China hydrography & relief
// Projection: Equirectangular [100.8°E..124.2°E, 25.4°N..39.0°N] -> 1000x660

import type { LocalizedText } from './types.js';

export const MAP_WIDTH = ${W};
export const MAP_HEIGHT = ${H};

export const LAND_PATHS: string[] = ${JSON.stringify(landPaths)};

export interface RiverFeature {
  id: string;
  name: LocalizedText;
  width: number;
  d: string;
}

export const RIVER_FEATURES: RiverFeature[] = ${JSON.stringify(rivers)};

export interface LakeFeature {
  id: string;
  name: LocalizedText;
  d: string;
}

export const LAKE_FEATURES: LakeFeature[] = ${JSON.stringify(lakes)};

export interface ElevationZone {
  id: string;
  kind: 'alpine' | 'plateau' | 'mountain' | 'basin' | 'plain' | 'hills';
  d: string;
}

export const ELEVATION_ZONES: ElevationZone[] = ${JSON.stringify(elevationZones)};

export const CONTOUR_PATHS: string[] = ${JSON.stringify(contourPaths)};

export interface MountainRidge {
  id: string;
  alpine: boolean;
  crestPath: string;
  litPath: string;
  darkPath: string;
  spurs: Array<{ side: 'lit' | 'dark'; d: string }>;
}

export const MOUNTAIN_RIDGES: MountainRidge[] = ${JSON.stringify(mountainRidges)};

export interface GeoLabel {
  text: LocalizedText;
  kind: 'sea' | 'region' | 'mountain' | 'river';
  x: number;
  y: number;
}

export const GEO_LABELS: GeoLabel[] = ${JSON.stringify(geoLabels)};

export const GRATICULE_LONS = ${JSON.stringify(graticuleLons)};
export const GRATICULE_LATS = ${JSON.stringify(graticuleLats)};
`;

fs.writeFileSync(path.resolve('src/game/mapGeo.ts'), out, 'utf8');
console.log(
  `Generated src/game/mapGeo.ts (${(out.length / 1024).toFixed(1)} KB, ${mountainRidges.length} connected mountain chains)`
);
