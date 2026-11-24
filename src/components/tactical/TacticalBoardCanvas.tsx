import { useEffect, useRef } from 'react';
import type { TacticalTile, TacticalTileType } from '../../game/tacticalTypes.js';
import { bestArt } from '../../utils/art.js';

const ART: Record<TacticalTileType, string> = {
  plains: '/art/tile_plains.jpg',
  forest: '/art/tile_forest.jpg',
  water: '/art/tile_water.jpg',
  bridge: '/art/tile_bridge.jpg',
  ford: '/art/tile_ford.jpg',
  hill: '/art/tile_hill.jpg',
  wall: '/art/tile_wall.jpg',
  gate: '/art/tile_wall.jpg',
  citadel: '/art/tile_citadel.jpg',
};

const SIZE = 1024;
const N = 8;
const CELL = SIZE / N;

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadArt(src: string): Promise<HTMLImageElement> {
  const url = bestArt(src);
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`could not load ${url}`));
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function scratch(size = SIZE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

const isType = (grid: TacticalTile[][], r: number, c: number, types: TacticalTileType[]) =>
  r >= 0 && r < N && c >= 0 && c < N && types.includes(grid[r][c].type);

/**
 * Paints the whole battlefield as one landscape. Natural terrain (hills, forest, water) is laid
 * down as soft-edged washes that merge with their neighbours, so the field reads as ground and not
 * as wallpaper; works of man (bridge, ford, wall, gate, citadel) sit on top as crisp pieces. The
 * grid is drawn last as thin ink lines, because a tactics board still has to be counted.
 */
async function paintBoard(canvas: HTMLCanvasElement, grid: TacticalTile[][], alive: () => boolean) {
  const types = new Set<TacticalTileType>(['plains']);
  for (const row of grid) for (const t of row) types.add(t.type);
  const images = new Map<TacticalTileType, HTMLImageElement>();
  await Promise.all(
    [...types].map(async (t) => {
      images.set(t, await loadArt(ART[t]));
    })
  );
  if (!alive()) return;

  const ctx = canvas.getContext('2d')!;
  let seed = 7;
  for (const row of grid) for (const t of row) seed = (seed * 31 + t.type.length * 17 + t.type.charCodeAt(0)) >>> 0;
  const rnd = seeded(seed);

  // One painting covers a little over two tiles, shifted per terrain, so repeats are hard to spot
  const patternOf = (type: TacticalTileType, span: number) => {
    const [pc, pctx] = scratch(Math.round(CELL * span));
    pctx.drawImage(images.get(type)!, 0, 0, pc.width, pc.height);
    const pattern = ctx.createPattern(pc, 'repeat')!;
    pattern.setTransform(new DOMMatrix().translate(rnd() * pc.width, rnd() * pc.height));
    return pattern;
  };

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = patternOf('plains', 2.6);
  ctx.fillRect(0, 0, SIZE, SIZE);

  const wash = (type: TacticalTileType, members: TacticalTileType[], span: number, spread: number) => {
    if (!images.has(type)) return;
    const [mask, mctx] = scratch();
    mctx.fillStyle = '#fff';
    let any = false;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!members.includes(grid[r][c].type)) continue;
        any = true;
        const cx = (c + 0.5) * CELL;
        const cy = (r + 0.5) * CELL;
        mctx.beginPath();
        mctx.arc(cx, cy, CELL * spread, 0, Math.PI * 2);
        mctx.fill();
        // Lobes toward same-terrain neighbours join cells into ranges, woods and rivers
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ]) {
          const joins = isType(grid, r + dr, c + dc, members);
          const reach = joins ? 0.5 : 0.16 + rnd() * 0.12;
          mctx.beginPath();
          mctx.arc(
            cx + dc * CELL * reach + (rnd() - 0.5) * 10,
            cy + dr * CELL * reach + (rnd() - 0.5) * 10,
            CELL * (joins ? spread * 0.92 : 0.3 + rnd() * 0.08),
            0,
            Math.PI * 2
          );
          mctx.fill();
        }
      }
    }
    if (!any) return;
    const [soft, sctx] = scratch();
    sctx.filter = 'blur(11px)';
    sctx.drawImage(mask, 0, 0);
    const [layer, lctx] = scratch();
    lctx.fillStyle = patternOf(type, span);
    lctx.fillRect(0, 0, SIZE, SIZE);
    lctx.globalCompositeOperation = 'destination-in';
    lctx.drawImage(soft, 0, 0);
    // A dark rim under each wash reads as a bank or a tree line
    ctx.save();
    ctx.filter = 'blur(6px)';
    ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(soft, 3, 5);
    ctx.restore();
    ctx.drawImage(layer, 0, 0);
  };

  wash('hill', ['hill'], 2.3, 0.5);
  wash('forest', ['forest'], 2.2, 0.5);
  wash('water', ['water', 'bridge', 'ford'], 2.4, 0.44);

  // Works of man: crisp pieces, turned to follow the river or the wall they belong to
  const piece = (type: TacticalTileType, r: number, c: number, quarterTurn: boolean, inset: number) => {
    const img = images.get(type);
    if (!img) return;
    const x = c * CELL + inset;
    const y = r * CELL + inset;
    const s = CELL - inset * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.translate(x + s / 2, y + s / 2);
    if (quarterTurn) ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2, s, s, 9);
    ctx.fillStyle = '#14110d';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();
  };

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const type = grid[r][c].type;
      const waterLR =
        isType(grid, r, c - 1, ['water', 'ford', 'bridge']) || isType(grid, r, c + 1, ['water', 'ford', 'bridge']);
      const waterUD =
        isType(grid, r - 1, c, ['water', 'ford', 'bridge']) || isType(grid, r + 1, c, ['water', 'ford', 'bridge']);
      if (type === 'bridge') {
        // The painting shows a west-east bridge over a north-south river
        piece('bridge', r, c, waterLR && !waterUD, 7);
      } else if (type === 'ford') {
        piece('ford', r, c, false, 12);
      } else if (type === 'wall' || type === 'gate') {
        const runsLR =
          isType(grid, r, c - 1, ['wall', 'gate']) || isType(grid, r, c + 1, ['wall', 'gate']);
        const runsUD =
          isType(grid, r - 1, c, ['wall', 'gate']) || isType(grid, r + 1, c, ['wall', 'gate']);
        piece('wall', r, c, runsLR && !runsUD, 3);
      } else if (type === 'citadel') {
        piece('citadel', r, c, false, 5);
      }
    }
  }

  // Unify: uneven light across the field, darker toward the frame
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  for (let i = 0; i < 5; i++) {
    const gx = rnd() * SIZE;
    const gy = rnd() * SIZE;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, SIZE * (0.25 + rnd() * 0.25));
    const light = i % 2 === 0;
    g.addColorStop(0, light ? 'rgba(255, 236, 190, 0.5)' : 'rgba(20, 30, 40, 0.45)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  ctx.restore();
  const vignette = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.36, SIZE / 2, SIZE / 2, SIZE * 0.78);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(8, 6, 4, 0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // The grid, as brushed ink lines with a faint light edge
  for (let i = 1; i < N; i++) {
    const p = i * CELL;
    ctx.fillStyle = 'rgba(16, 12, 8, 0.42)';
    ctx.fillRect(p - 1, 0, 2, SIZE);
    ctx.fillRect(0, p - 1, SIZE, 2);
    ctx.fillStyle = 'rgba(245, 237, 220, 0.09)';
    ctx.fillRect(p + 1, 0, 1, SIZE);
    ctx.fillRect(0, p + 1, SIZE, 1);
  }
}

export function TacticalBoardCanvas({ grid }: { grid: TacticalTile[][] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const signature = grid.map((row) => row.map((t) => t.type).join(',')).join('|');
  const gridRef = useRef(grid);
  gridRef.current = grid;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let alive = true;
    paintBoard(canvas, gridRef.current, () => alive).catch(() => {
      // Art failed to load: leave the dark board; tiles and tokens still work
    });
    return () => {
      alive = false;
    };
  }, [signature]);

  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      className="pointer-events-none absolute inset-0 w-full h-full theme-art-grade"
    />
  );
}
