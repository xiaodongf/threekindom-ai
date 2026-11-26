import { useEffect, useRef } from 'react';
import type { TacticalTile, TacticalTileType } from '../../game/tacticalTypes.js';
import { bestArt } from '../../utils/art.js';
import { isMythLook, useArtLook } from '../../utils/artLook.js';

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
  wash('ford', ['ford'], 1.6, 0.41);

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

  const paintFordDetails = (r: number, c: number, riverRunsLR: boolean) => {
    const cx = (c + 0.5) * CELL;
    const cy = (r + 0.5) * CELL;
    ctx.save();
    ctx.translate(cx, cy);
    if (riverRunsLR) ctx.rotate(Math.PI / 2);
    // Soft sunlit gravel shoal glow
    const shoal = ctx.createRadialGradient(0, 0, 4, 0, 0, CELL * 0.48);
    shoal.addColorStop(0, 'rgba(218, 196, 146, 0.42)');
    shoal.addColorStop(0.65, 'rgba(176, 158, 118, 0.22)');
    shoal.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shoal;
    ctx.beginPath();
    ctx.ellipse(0, 0, CELL * 0.48, CELL * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stepping stones & white-water current ripples across the shallow crossing
    const stones = [
      [-36, -6, 9, 6.5],
      [-19, 5, 10, 7],
      [-2, -4, 10.5, 7.5],
      [16, 4, 9.5, 6.8],
      [34, -3, 8.5, 6],
    ];
    for (const [sx, sy, rx, ry] of stones) {
      ctx.strokeStyle = 'rgba(226, 242, 238, 0.42)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(sx + 2, sy, rx + 4, ry + 3, 0.1, -0.9, 0.9);
      ctx.stroke();

      ctx.fillStyle = '#6f6758';
      ctx.strokeStyle = 'rgba(24, 20, 15, 0.65)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(sx, sy, rx, ry, (rnd() - 0.5) * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(216, 205, 182, 0.35)';
      ctx.beginPath();
      ctx.ellipse(sx - 2, sy - 1.5, rx * 0.55, ry * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const paintContinuousWall = (r: number, c: number, isGate: boolean, gateIntact: boolean) => {
    const img = images.get('wall');
    if (!img) return;
    const joinL = isType(grid, r, c - 1, ['wall', 'gate']);
    const joinR = isType(grid, r, c + 1, ['wall', 'gate']);
    const joinU = isType(grid, r - 1, c, ['wall', 'gate']);
    const joinD = isType(grid, r + 1, c, ['wall', 'gate']);
    const runsLR = (joinL || joinR) && !(joinU || joinD);
    const padL = joinL ? 0 : 5;
    const padR = joinR ? 0 : 5;
    const padU = joinU ? 0 : 5;
    const padD = joinD ? 0 : 5;
    const x = c * CELL + padL;
    const y = r * CELL + padU;
    const w = CELL - padL - padR;
    const h = CELL - padU - padD;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [
      joinL || joinU ? 0 : 7,
      joinR || joinU ? 0 : 7,
      joinR || joinD ? 0 : 7,
      joinL || joinD ? 0 : 7,
    ]);
    ctx.fillStyle = '#1b1815';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();

    ctx.save();
    ctx.translate(c * CELL + CELL / 2, r * CELL + CELL / 2);
    if (runsLR) ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -CELL / 2, -CELL / 2, CELL, CELL);
    ctx.restore();

    // Parapet merlon highlights so contiguous walls read as one fortified rampart
    ctx.strokeStyle = 'rgba(22, 18, 14, 0.72)';
    ctx.lineWidth = 2;
    if (!joinU) {
      ctx.beginPath();
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x + w, y + 1);
      ctx.stroke();
    }
    if (!joinD) {
      ctx.beginPath();
      ctx.moveTo(x, y + h - 1);
      ctx.lineTo(x + w, y + h - 1);
      ctx.stroke();
    }
    ctx.restore();

    if (!isGate) return;

    // Distinct Han Gatehouse (城门楼) over the rampart
    const cx = (c + 0.5) * CELL;
    const cy = (r + 0.5) * CELL;
    ctx.save();
    ctx.translate(cx, cy);
    if (runsLR) ctx.rotate(Math.PI / 2);

    if (gateIntact) {
      // Gateway passage & iron-studded double doors
      ctx.fillStyle = '#18120e';
      ctx.beginPath();
      ctx.roundRect(-28, -26, 56, 52, 6);
      ctx.fill();

      // Vermilion Han gatehouse corner pillars flanking even garrisoned units
      ctx.fillStyle = '#9b2418';
      ctx.strokeStyle = '#dfb55c';
      ctx.lineWidth = 1.4;
      for (const [px, py] of [
        [-38, -28],
        [28, -28],
        [-38, 18],
        [28, 18],
      ]) {
        ctx.beginPath();
        ctx.roundRect(px, py, 10, 10, 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle = '#7c2419';
      ctx.strokeStyle = '#d0a74f';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-22, -20, 21, 40, 2);
      ctx.roundRect(1, -20, 21, 40, 2);
      ctx.fill();
      ctx.stroke();

      // Gilded bronze door studs
      ctx.fillStyle = '#e4be68';
      for (const dx of [-15, -8, 8, 15]) {
        for (const dy of [-11, 0, 11]) {
          ctx.beginPath();
          ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Wide double-eave gatehouse roof with crimson trim & upturned golden finials
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 9;
      ctx.fillStyle = '#7e1e15';
      ctx.strokeStyle = '#dfb860';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-42, -20);
      ctx.quadraticCurveTo(0, -30, 42, -20);
      ctx.lineTo(39, 20);
      ctx.quadraticCurveTo(0, 28, -39, 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#2b3036';
      ctx.strokeStyle = '#c89e4c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-38, -14);
      ctx.quadraticCurveTo(0, -23, 38, -14);
      ctx.lineTo(34, 14);
      ctx.quadraticCurveTo(0, 21, -34, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowColor = 'transparent';

      // Central golden roof ridge & corner lantern glows
      ctx.strokeStyle = '#ebd07c';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-30, -1);
      ctx.lineTo(30, -1);
      ctx.stroke();

      for (const [lx, ly] of [
        [-38, -22],
        [38, -22],
        [-36, 22],
        [36, 22],
      ]) {
        ctx.fillStyle = 'rgba(255, 115, 45, 0.45)';
        ctx.beginPath();
        ctx.arc(lx, ly, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff6b35';
        ctx.beginPath();
        ctx.arc(lx, ly, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Breached gateway: scorched open passage + shattered timber/stone debris
      ctx.fillStyle = 'rgba(20, 15, 11, 0.86)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6f5c46';
      for (const [rx, ry, rw, rh, rot] of [
        [-22, -16, 12, 5, 0.4],
        [14, -18, 11, 5, -0.5],
        [-20, 14, 13, 5, -0.3],
        [12, 15, 12, 5, 0.35],
      ]) {
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(rot);
        ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
        ctx.restore();
      }
    }
    ctx.restore();
  };

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const tile = grid[r][c];
      const type = tile.type;
      const waterLR =
        isType(grid, r, c - 1, ['water', 'ford', 'bridge']) || isType(grid, r, c + 1, ['water', 'ford', 'bridge']);
      const waterUD =
        isType(grid, r - 1, c, ['water', 'ford', 'bridge']) || isType(grid, r + 1, c, ['water', 'ford', 'bridge']);
      if (type === 'bridge') {
        // The painting shows a west-east bridge over a north-south river
        piece('bridge', r, c, waterLR && !waterUD, 7);
      } else if (type === 'ford') {
        paintFordDetails(r, c, waterLR && !waterUD);
      } else if (type === 'wall' || type === 'gate') {
        paintContinuousWall(r, c, type === 'gate', type === 'gate' && (tile.gateHp ?? 0) > 0);
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

  // Dark look: the field under a heavy sky. Colour drains, shadows turn cold, and mist gathers
  // over the water and in a few hollows; the frame closes in further than it does by day.
  const myth = isMythLook();
  if (myth) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'rgba(128, 128, 128, 0.34)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgb(190, 200, 204)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = 'screen';
    const mistAt = (x: number, y: number, radius: number, strength: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(150, 172, 170, ${strength})`);
      g.addColorStop(1, 'rgba(150, 172, 170, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!isType(grid, r, c, ['water', 'ford'])) continue;
        mistAt(
          (c + 0.2 + rnd() * 0.6) * CELL,
          (r + 0.2 + rnd() * 0.6) * CELL,
          CELL * (0.9 + rnd() * 0.5),
          0.1 + rnd() * 0.06
        );
      }
    }
    for (let i = 0; i < 6; i++) {
      mistAt(rnd() * SIZE, rnd() * SIZE, CELL * (1.3 + rnd() * 1.2), 0.07 + rnd() * 0.05);
    }
    // One low, warm light from the south-west, as from a fire outside the frame
    ctx.globalCompositeOperation = 'soft-light';
    const glow = ctx.createRadialGradient(SIZE * 0.12, SIZE * 0.95, 0, SIZE * 0.12, SIZE * 0.95, SIZE * 0.85);
    glow.addColorStop(0, 'rgba(255, 176, 96, 0.42)');
    glow.addColorStop(1, 'rgba(255, 176, 96, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.restore();
  }

  const vignette = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.36, SIZE / 2, SIZE / 2, SIZE * 0.78);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, myth ? 'rgba(4, 5, 6, 0.56)' : 'rgba(8, 6, 4, 0.5)');
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
  const signature = grid
    .map((row) => row.map((t) => `${t.type}:${t.type === 'gate' && (t.gateHp ?? 0) > 0 ? 1 : 0}`).join(','))
    .join('|');
  const gridRef = useRef(grid);
  gridRef.current = grid;
  // The board is painted for the art look in force, so a change of look repaints it
  const look = useArtLook();

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
  }, [signature, look]);

  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      className="pointer-events-none absolute inset-0 w-full h-full theme-art-grade"
    />
  );
}
