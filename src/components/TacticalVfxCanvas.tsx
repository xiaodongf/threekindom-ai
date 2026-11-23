import { useEffect, useRef } from 'react';
import { WIND_DELTA } from '../game/tacticalEngine.js';
import type { TacticalTile, WindDirection } from '../game/tacticalTypes.js';

export interface TacticalVfxEvent {
  id: string;
  kind: 'slash' | 'arrow' | 'fire_blast' | 'bomb_blast' | 'stratagem_ring' | 'seen_through';
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

interface TacticalVfxCanvasProps {
  grid: TacticalTile[][];
  wind: WindDirection;
  vfxEvent: TacticalVfxEvent | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

interface ShockRing {
  x: number;
  y: number;
  maxR: number;
  color: string;
  life: number;
  maxLife: number;
}

interface SlashArc {
  x: number;
  y: number;
  angle: number;
  color: string;
  life: number;
  maxLife: number;
}

interface ArrowBolt {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  life: number;
  maxLife: number;
  color: string;
  isFire: boolean;
}

export function TacticalVfxCanvas({ grid, wind, vfxEvent }: TacticalVfxCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef(grid);
  const windRef = useRef(wind);
  gridRef.current = grid;
  windRef.current = wind;

  const particlesRef = useRef<Particle[]>([]);
  const ringsRef = useRef<ShockRing[]>([]);
  const slashesRef = useRef<SlashArc[]>([]);
  const boltsRef = useRef<ArrowBolt[]>([]);

  const SIZE = 580;
  const CELL = SIZE / 8;

  // Trigger burst VFX whenever a new tactical event occurs!
  useEffect(() => {
    if (!vfxEvent) return;
    const fx = (vfxEvent.fromCol + 0.5) * CELL;
    const fy = (vfxEvent.fromRow + 0.5) * CELL;
    const tx = (vfxEvent.toCol + 0.5) * CELL;
    const ty = (vfxEvent.toRow + 0.5) * CELL;

    const addBurst = (x: number, y: number, color: string, count: number, spdScale = 1) => {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (35 + Math.random() * 140) * spdScale;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          size: 2 + Math.random() * 4,
          color,
          life: 0,
          maxLife: 0.4 + Math.random() * 0.45,
        });
      }
    };

    if (vfxEvent.kind === 'slash') {
      slashesRef.current.push({
        x: tx,
        y: ty,
        angle: Math.atan2(ty - fy, tx - fx),
        color: '#fef08a',
        life: 0,
        maxLife: 0.36,
      });
      addBurst(tx, ty, '#fbbf24', 18, 0.9);
      addBurst(tx, ty, '#f43f5e', 10, 0.7);
    } else if (vfxEvent.kind === 'arrow') {
      for (let i = 0; i < 7; i++) {
        boltsRef.current.push({
          sx: fx + (Math.random() - 0.5) * 18,
          sy: fy + (Math.random() - 0.5) * 18,
          ex: tx + (Math.random() - 0.5) * 20,
          ey: ty + (Math.random() - 0.5) * 20,
          life: -i * 0.03,
          maxLife: 0.34,
          color: '#fef08a',
          isFire: false,
        });
      }
      addBurst(tx, ty, '#fde047', 14, 0.7);
    } else if (vfxEvent.kind === 'fire_blast') {
      boltsRef.current.push({
        sx: fx,
        sy: fy,
        ex: tx,
        ey: ty,
        life: 0,
        maxLife: 0.28,
        color: '#fb923c',
        isFire: true,
      });
      ringsRef.current.push({
        x: tx,
        y: ty,
        maxR: CELL * 0.95,
        color: '#f97316',
        life: 0,
        maxLife: 0.55,
      });
      addBurst(tx, ty, '#f97316', 32, 1.15);
      addBurst(tx, ty, '#fef08a', 18, 0.8);
    } else if (vfxEvent.kind === 'bomb_blast') {
      const cx = (vfxEvent.toCol + 1.0) * CELL;
      const cy = (vfxEvent.toRow + 1.0) * CELL;
      ringsRef.current.push(
        { x: cx, y: cy, maxR: CELL * 1.65, color: '#fbbf24', life: 0, maxLife: 0.65 },
        { x: cx, y: cy, maxR: CELL * 1.15, color: '#ef4444', life: 0, maxLife: 0.5 }
      );
      addBurst(cx, cy, '#f97316', 54, 1.55);
      addBurst(cx, cy, '#fef08a', 26, 1.1);
    } else if (vfxEvent.kind === 'stratagem_ring') {
      ringsRef.current.push({
        x: tx,
        y: ty,
        maxR: CELL * 1.1,
        color: '#38bdf8',
        life: 0,
        maxLife: 0.62,
      });
      addBurst(tx, ty, '#38bdf8', 22, 0.95);
      addBurst(tx, ty, '#fbbf24', 12, 0.65);
    } else if (vfxEvent.kind === 'seen_through') {
      ringsRef.current.push({
        x: tx,
        y: ty,
        maxR: CELL * 0.9,
        color: '#fb7185',
        life: 0,
        maxLife: 0.55,
      });
      addBurst(tx, ty, '#fb7185', 16, 0.8);
    }
  }, [vfxEvent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    // Subtle wind ribbon streamers
    const ribbons = Array.from({ length: 10 }, (_, i) => ({
      x: (i * 73 + 20) % SIZE,
      y: (i * 59 + 30) % SIZE,
      len: 42 + (i % 4) * 18,
      speed: 52 + (i % 3) * 24,
      alpha: 0.14 + (i % 3) * 0.05,
    }));

    let lastTs = performance.now();
    let elapsed = 0;
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      elapsed += dt;

      ctx.clearRect(0, 0, SIZE, SIZE);

      const wd = WIND_DELTA[windRef.current];
      const windVx = wd.dc;
      const windVy = wd.dr;

      // 1. Animated Wind Ribbons sweeping across the 8x8 Battlefield!
      ctx.save();
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (const rb of ribbons) {
        rb.x = (rb.x + windVx * rb.speed * dt + SIZE) % SIZE;
        rb.y = (rb.y + windVy * rb.speed * dt + SIZE) % SIZE;

        const ex = rb.x + windVx * rb.len;
        const ey = rb.y + windVy * rb.len;
        const grad = ctx.createLinearGradient(rb.x, rb.y, ex, ey);
        grad.addColorStop(0, 'rgba(186, 230, 253, 0)');
        grad.addColorStop(0.5, `rgba(186, 230, 253, ${rb.alpha})`);
        grad.addColorStop(1, 'rgba(186, 230, 253, 0)');
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(rb.x, rb.y);
        ctx.quadraticCurveTo(
          (rb.x + ex) / 2 + windVy * 6 * Math.sin(elapsed * 3 + rb.x * 0.05),
          (rb.y + ey) / 2 + windVx * 6 * Math.sin(elapsed * 3 + rb.y * 0.05),
          ex,
          ey
        );
        ctx.stroke();
      }
      ctx.restore();

      // 2. Volumetric Animated Fire & Downwind Sparks on Blazing Tiles!
      const g = gridRef.current;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const tile = g[r]?.[c];
          if (!tile || tile.fireTurns <= 0) continue;

          const cx = (c + 0.5) * CELL;
          const cy = (r + 0.58) * CELL;
          const flicker = Math.sin(elapsed * 16 + r * 3 + c * 5) * 4;

          // Warm fire ground bloom
          const fGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, CELL * 0.55 + flicker * 0.4);
          fGrad.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
          fGrad.addColorStop(0.45, 'rgba(249, 115, 22, 0.36)');
          fGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
          ctx.fillStyle = fGrad;
          ctx.beginPath();
          ctx.arc(cx, cy, CELL * 0.58, 0, Math.PI * 2);
          ctx.fill();

          // 3 Animated Leaning Flame Tongues leaning in the Wind Direction!
          for (let f = -1; f <= 1; f++) {
            const fx = cx + f * 14;
            const fy = cy + Math.abs(f) * 5;
            const fh = 18 + Math.sin(elapsed * 19 + f * 2 + r) * 5;
            ctx.fillStyle = f === 0 ? 'rgba(254, 240, 138, 0.78)' : 'rgba(249, 115, 22, 0.72)';
            ctx.beginPath();
            ctx.moveTo(fx - 6, fy);
            ctx.quadraticCurveTo(
              fx + windVx * 10,
              fy - fh * 0.6,
              fx + windVx * 14,
              fy - fh + windVy * 6
            );
            ctx.quadraticCurveTo(fx + 6, fy - fh * 0.4, fx + 6, fy);
            ctx.closePath();
            ctx.fill();
          }

          // Spawn rising downwind sparks continuously
          if (Math.random() < dt * 11) {
            particlesRef.current.push({
              x: cx + (Math.random() - 0.5) * CELL * 0.55,
              y: cy + (Math.random() - 0.5) * 14,
              vx: windVx * (32 + Math.random() * 38) + (Math.random() - 0.5) * 16,
              vy: windVy * (26 + Math.random() * 28) - (22 + Math.random() * 24),
              size: 1.5 + Math.random() * 2.2,
              color: Math.random() > 0.4 ? '#fb923c' : '#fef08a',
              life: 0,
              maxLife: 0.55 + Math.random() * 0.45,
            });
          }
        }
      }

      // 3. Expanding Shockwave Rings
      for (let i = ringsRef.current.length - 1; i >= 0; i--) {
        const rg = ringsRef.current[i];
        rg.life += dt;
        if (rg.life >= rg.maxLife) {
          ringsRef.current.splice(i, 1);
          continue;
        }
        const pct = rg.life / rg.maxLife;
        ctx.save();
        ctx.globalAlpha = 1 - pct;
        ctx.strokeStyle = rg.color;
        ctx.lineWidth = 4 * (1 - pct) + 1;
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, 8 + rg.maxR * pct, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 4. Sweeping Sword Slash Arcs
      for (let i = slashesRef.current.length - 1; i >= 0; i--) {
        const sl = slashesRef.current[i];
        sl.life += dt;
        if (sl.life >= sl.maxLife) {
          slashesRef.current.splice(i, 1);
          continue;
        }
        const pct = sl.life / sl.maxLife;
        ctx.save();
        ctx.translate(sl.x, sl.y);
        ctx.rotate(sl.angle);
        ctx.globalAlpha = 1 - pct;
        ctx.strokeStyle = sl.color;
        ctx.lineWidth = 5 * (1 - pct) + 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 26 + pct * 10, -1.1, 1.1);
        ctx.stroke();
        ctx.restore();
      }

      // 5. Flying Arrows & Fireballs
      for (let i = boltsRef.current.length - 1; i >= 0; i--) {
        const b = boltsRef.current[i];
        b.life += dt;
        if (b.life < 0) continue;
        if (b.life >= b.maxLife) {
          boltsRef.current.splice(i, 1);
          continue;
        }
        const pct = b.life / b.maxLife;
        const arcHeight = b.isFire ? 42 : 28;
        const px = b.sx + (b.ex - b.sx) * pct;
        const py = b.sy + (b.ey - b.sy) * pct - Math.sin(pct * Math.PI) * arcHeight;
        ctx.save();
        if (b.isFire) {
          ctx.fillStyle = '#fb923c';
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const ang = Math.atan2(b.ey - b.sy, b.ex - b.sx);
          ctx.translate(px, py);
          ctx.rotate(ang);
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(6, 0);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 6. Spark & Blast Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.life += dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        if (pt.life >= pt.maxLife) {
          particlesRef.current.splice(i, 1);
          continue;
        }
        const alpha = 1 - pt.life / pt.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * alpha + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 w-full h-full z-20"
    />
  );
}
