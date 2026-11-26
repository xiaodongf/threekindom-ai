import * as THREE from 'three';
import { fxOn } from './toggles.js';

/**
 * Ambient occlusion baked into vertex colours when a scene is built.
 *
 * The meshes of a rigid cluster (a district of the city, a miniature on the map) are dropped
 * into a coarse grid of occupied cells. Each vertex then looks out along its normal: the more of
 * the space in front of it is filled by other geometry or by the ground, the darker its colour
 * becomes. Corners, the foot of a wall, the underside of an eave and the gap between two houses
 * pick up shade that no light in the scene would otherwise give them, and it costs nothing at
 * run time because the result lives in the colour the vertices already carry.
 *
 * It is coarse by design: shade is interpolated between vertices, so a wall built from a
 * single box gets a gradient, not a crisp contact line.
 */
export interface OcclusionOptions {
  /** Edge of one grid cell in the meshes' own units */
  cell: number;
  /** Height of the ground, which counts as solid; null when the cluster does not stand on any */
  ground?: number | null;
  /** 0 to 1: how dark a fully enclosed vertex becomes */
  strength?: number;
  /** Upper limit on grid cells; the cell grows to stay under it */
  maxCells?: number;
}

/** Directions inside a cone round +Y (the vertex normal), with the cone's axis first. */
const CONE: Array<[number, number, number]> = (() => {
  const out: Array<[number, number, number]> = [[0, 1, 0]];
  for (const [tilt, count, turn] of [
    [0.55, 4, 0],
    [1.0, 4, Math.PI / 4],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const a = turn + (i / count) * Math.PI * 2;
      out.push([Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a)]);
    }
  }
  return out;
})();
/** How far out each ring of samples is taken, in cells, and how much it counts */
const REACH: Array<[number, number]> = [
  [1.7, 1],
  [3.4, 0.6],
];

/** A floor this many cells across is too broad to shade from its corners, and occludes nothing above it. */
const BROAD_FLOOR = 8;

/** Bakes occlusion into the `color` attribute of every mesh given; meshes without one are only occluders. */
export function bakeVertexOcclusion(meshes: THREE.Mesh[], options: OcclusionOptions): void {
  if (meshes.length === 0 || !fxOn('ao')) return;
  const strength = options.strength ?? 0.5;
  const ground = options.ground === undefined ? null : options.ground;

  const bounds = new THREE.Box3();
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox);
  }
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  let cell = options.cell;
  const maxCells = options.maxCells ?? 2_500_000;
  const cellsAt = (c: number) => (Math.ceil(size.x / c) + 9) * (Math.ceil(size.y / c) + 9) * (Math.ceil(size.z / c) + 9);
  while (cellsAt(cell) > maxCells) cell *= 1.2;

  // A margin of four cells all round, so no sample ever falls outside the grid
  const ox = bounds.min.x - cell * 4.5;
  const oy = bounds.min.y - cell * 4.5;
  const oz = bounds.min.z - cell * 4.5;
  const nx = Math.ceil(size.x / cell) + 9;
  const ny = Math.ceil(size.y / cell) + 9;
  const nz = Math.ceil(size.z / cell) + 9;
  const grid = new Uint8Array(nx * ny * nz);
  const inv = 1 / cell;
  const floorSpan = cell * BROAD_FLOOR;

  // --- fill the grid: every triangle marks the cells it passes through
  const step = cell * 0.9;
  for (const mesh of meshes) {
    const pos = (mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const index = mesh.geometry.index;
    const tri = index ? index.count / 3 : pos.length / 9;
    for (let t = 0; t < tri; t++) {
      const a = (index ? index.getX(t * 3) : t * 3) * 3;
      const b = (index ? index.getX(t * 3 + 1) : t * 3 + 1) * 3;
      const c = (index ? index.getX(t * 3 + 2) : t * 3 + 2) * 3;
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
      const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
      const longest = Math.max(
        Math.hypot(bx - ax, by - ay, bz - az),
        Math.hypot(cx - ax, cy - ay, cz - az),
        Math.hypot(cx - bx, cy - by, cz - bz)
      );
      // A broad level floor shades nothing that stands on it; the ground rule covers that
      if (longest > floorSpan && Math.abs(ay - by) < 0.01 && Math.abs(ay - cy) < 0.01) continue;
      const n = Math.min(120, Math.max(1, Math.ceil(longest / step)));
      const invN = 1 / n;
      for (let i = 0; i <= n; i++) {
        const u = i * invN;
        for (let j = 0; j <= n - i; j++) {
          const v = j * invN;
          const w = 1 - u - v;
          const ix = ((ax * w + bx * u + cx * v - ox) * inv) | 0;
          const iy = ((ay * w + by * u + cy * v - oy) * inv) | 0;
          const iz = ((az * w + bz * u + cz * v - oz) * inv) | 0;
          grid[ix + nx * (iy + ny * iz)] = 1;
        }
      }
    }
  }

  // --- shade each vertex by how much of the cone in front of it is filled
  let total = 0;
  for (const [, weight] of REACH) total += weight * CONE.length;
  // Sample offsets in the cone's own frame, scaled to world units once
  const samples = new Float32Array(REACH.length * CONE.length * 4);
  let sCount = 0;
  for (const [reach, weight] of REACH) {
    for (const [dx, dy, dz] of CONE) {
      samples[sCount * 4] = dx * reach * cell;
      samples[sCount * 4 + 1] = dy * reach * cell;
      samples[sCount * 4 + 2] = dz * reach * cell;
      samples[sCount * 4 + 3] = weight;
      sCount++;
    }
  }

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const colorAttr = geo.attributes.color as THREE.BufferAttribute | undefined;
    const norAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
    if (!colorAttr || !norAttr) continue;
    const pos = (geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const nor = norAttr.array as Float32Array;
    const col = colorAttr.array as Float32Array;
    const count = pos.length / 3;
    const flat = !geo.index;

    // Merged geometry repeats each corner once per triangle: shade every distinct
    // position-and-normal once and hand the result to its copies.
    let tableSize = 1024;
    while (tableSize < count * 2) tableSize *= 2;
    const table = new Int32Array(tableSize).fill(-1);
    const shadeOf = new Float32Array(count);
    const mask = tableSize - 1;

    for (let i = 0; i < count; i++) {
      const p = i * 3;
      const px = pos[p], py = pos[p + 1], pz = pos[p + 2];
      let nxn = nor[p], nyn = nor[p + 1], nzn = nor[p + 2];
      const len = Math.hypot(nxn, nyn, nzn);
      if (len < 1e-4) {
        shadeOf[i] = 1;
        continue;
      }
      nxn /= len;
      nyn /= len;
      nzn /= len;
      // A broad floor has vertices only at its far corners; shade found at a corner would be
      // smeared across the whole of it, so such floors are left as they are
      if (flat && nyn > 0.9) {
        const t = (i - (i % 3)) * 3;
        const span = Math.max(
          Math.hypot(pos[t + 3] - pos[t], pos[t + 5] - pos[t + 2]),
          Math.hypot(pos[t + 6] - pos[t], pos[t + 8] - pos[t + 2]),
          Math.hypot(pos[t + 6] - pos[t + 3], pos[t + 8] - pos[t + 5])
        );
        if (span > floorSpan) {
          shadeOf[i] = 1;
          continue;
        }
      }

      let h =
        (Math.imul((px * 64) | 0, 73856093) ^
          Math.imul((py * 64) | 0, 19349663) ^
          Math.imul((pz * 64) | 0, 83492791) ^
          Math.imul(((nxn * 15) | 0) + ((nyn * 15) | 0) * 31 + ((nzn * 15) | 0) * 961, 2654435761)) &
        mask;
      let twin = -1;
      for (;;) {
        const other = table[h];
        if (other < 0) {
          table[h] = i;
          break;
        }
        const o = other * 3;
        if (
          pos[o] === px && pos[o + 1] === py && pos[o + 2] === pz &&
          nor[o] === nor[p] && nor[o + 1] === nor[p + 1] && nor[o + 2] === nor[p + 2]
        ) {
          twin = other;
          break;
        }
        h = (h + 1) & mask;
      }
      if (twin >= 0) {
        shadeOf[i] = shadeOf[twin];
        continue;
      }

      // Two axes at right angles to the normal
      let tx: number, ty: number, tz: number;
      if (Math.abs(nyn) > 0.92) {
        // tangent = X x normal
        tx = 0;
        ty = -nzn;
        tz = nyn;
      } else {
        // tangent = Y x normal
        tx = nzn;
        ty = 0;
        tz = -nxn;
      }
      const tl = 1 / Math.hypot(tx, ty, tz);
      tx *= tl;
      ty *= tl;
      tz *= tl;
      const bx = nyn * tz - nzn * ty;
      const by = nzn * tx - nxn * tz;
      const bz = nxn * ty - nyn * tx;
      const own = (((px - ox) * inv) | 0) + nx * ((((py - oy) * inv) | 0) + ny * (((pz - oz) * inv) | 0));
      let hit = 0;
      for (let k = 0; k < sCount; k++) {
        const dx = samples[k * 4], dy = samples[k * 4 + 1], dz = samples[k * 4 + 2];
        const sy = py + ty * dx + nyn * dy + by * dz;
        if (ground !== null && sy < ground) {
          hit += samples[k * 4 + 3];
          continue;
        }
        const ix = ((px + tx * dx + nxn * dy + bx * dz - ox) * inv) | 0;
        const iy = ((sy - oy) * inv) | 0;
        const iz = ((pz + tz * dx + nzn * dy + bz * dz - oz) * inv) | 0;
        const g = ix + nx * (iy + ny * iz);
        if (g !== own && grid[g] === 1) hit += samples[k * 4 + 3];
      }
      // A flat open surface still catches a few of its own cells at the cone's edge: ignore that floor
      const occ = Math.min(1, Math.max(0, (hit / total - 0.12) / 0.6));
      shadeOf[i] = 1 - strength * occ * occ * (3 - 2 * occ);
    }

    for (let i = 0; i < count; i++) {
      const shade = shadeOf[i];
      if (shade === 1) continue;
      col[i * 3] *= shade;
      col[i * 3 + 1] *= shade;
      col[i * 3 + 2] *= shade;
    }
    colorAttr.needsUpdate = true;
  }
}
