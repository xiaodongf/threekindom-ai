import { useEffect, useRef } from 'react';
import type { City, MarchEvent, Season } from '../game/types.js';

interface MapAtmosphereCanvasProps {
  season: Season;
  cities: City[];
  recentMarches: MarchEvent[];
}

interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  alpha: number;
  phase: number;
}

interface CloudBank {
  x: number;
  y: number;
  rx: number;
  ry: number;
  speed: number;
  alpha: number;
}

interface SmokePuff {
  x: number;
  y: number;
  vy: number;
  vx: number;
  life: number;
  maxLife: number;
  size: number;
}

export function MapAtmosphereCanvas({
  season,
  cities,
  recentMarches,
}: MapAtmosphereCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const citiesRef = useRef(cities);
  const marchesRef = useRef(recentMarches);
  citiesRef.current = cities;
  marchesRef.current = recentMarches;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1000;
    const H = 660;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Initialize drifting volumetric cloud banks with soft ground shadows
    const clouds: CloudBank[] = Array.from({ length: 7 }, (_, i) => ({
      x: (i * 175 + 40) % (W + 240) - 120,
      y: 65 + (i % 4) * 145 + (i * 19) % 40,
      rx: 85 + (i % 3) * 34,
      ry: 28 + (i % 2) * 12,
      speed: 7 + (i % 3) * 4.5,
      alpha: 0.1,
    }));

    // Initialize seasonal particles (Spring blossoms, Summer fireflies, Autumn leaves, Winter snow)
    const count = season === 'winter' ? 68 : season === 'spring' ? 42 : season === 'autumn' ? 38 : 34;
    const particles: WeatherParticle[] = Array.from({ length: count }, (_, i) => ({
      x: (i * 97 + 13) % W,
      y: (i * 61 + 27) % H,
      vx:
        season === 'winter'
          ? 12 + (i % 4) * 5
          : season === 'summer'
            ? (i % 2 === 0 ? 1 : -1) * (6 + (i % 5) * 3)
            : 20 + (i % 5) * 7,
      vy:
        season === 'winter'
          ? 24 + (i % 4) * 9
          : season === 'summer'
            ? -6 - (i % 3) * 4
            : 14 + (i % 4) * 6,
      size:
        season === 'winter'
          ? 1.5 + (i % 3) * 1.0
          : season === 'summer'
            ? 1.8 + (i % 3) * 0.8
            : 3.2 + (i % 3) * 1.3,
      rot: (i * 0.9) % (Math.PI * 2),
      vrot: (i % 2 === 0 ? 1 : -1) * (1.2 + (i % 4) * 0.5),
      alpha: 0.45 + (i % 5) * 0.1,
      phase: i * 0.8,
    }));

    const smokePuffs: SmokePuff[] = [];
    let lastTs = performance.now();
    let elapsed = 0;
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      elapsed += dt;

      ctx.clearRect(0, 0, W, H);

      // 1. Subtle Seasonal Atmospheric Lighting Wash
      if (season === 'winter') {
        const frost = ctx.createLinearGradient(0, 0, 0, H * 0.55);
        frost.addColorStop(0, 'rgba(186, 230, 253, 0.09)');
        frost.addColorStop(1, 'rgba(186, 230, 253, 0)');
        ctx.fillStyle = frost;
        ctx.fillRect(0, 0, W, H * 0.55);
      } else if (season === 'autumn') {
        const warm = ctx.createRadialGradient(W * 0.35, H * 0.25, 40, W * 0.35, H * 0.25, 520);
        warm.addColorStop(0, 'rgba(251, 146, 60, 0.08)');
        warm.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = warm;
        ctx.fillRect(0, 0, W, H);
      } else if (season === 'summer') {
        const sun = ctx.createRadialGradient(W * 0.65, H * 0.2, 30, W * 0.65, H * 0.2, 460);
        sun.addColorStop(0, 'rgba(253, 224, 71, 0.08)');
        sun.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, W, H);
      }

      // 2. Drifting Volumetric Clouds with Soft Cast Ground Shadows
      for (const cl of clouds) {
        cl.x += cl.speed * dt;
        if (cl.x - cl.rx > W + 40) cl.x = -cl.rx - 40;

        // Soft dark ground shadow offset SE
        ctx.save();
        const shGrad = ctx.createRadialGradient(
          cl.x + 18,
          cl.y + 22,
          cl.ry * 0.2,
          cl.x + 18,
          cl.y + 22,
          cl.rx
        );
        shGrad.addColorStop(0, 'rgba(2, 6, 23, 0.16)');
        shGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
        ctx.fillStyle = shGrad;
        ctx.beginPath();
        ctx.ellipse(cl.x + 18, cl.y + 22, cl.rx, cl.ry * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Sunlit Mist Cloud Bank
        const cGrad = ctx.createRadialGradient(cl.x, cl.y, cl.ry * 0.15, cl.x, cl.y, cl.rx);
        const cloudRgb = '245, 232, 200';
        cGrad.addColorStop(0, `rgba(${cloudRgb}, ${cl.alpha})`);
        cGrad.addColorStop(0.6, `rgba(${cloudRgb}, ${cl.alpha * 0.45})`);
        cGrad.addColorStop(1, `rgba(${cloudRgb}, 0)`);
        ctx.fillStyle = cGrad;
        ctx.beginPath();
        ctx.ellipse(cl.x, cl.y, cl.rx, cl.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 3. Flickering Warm Lantern Glow on Capitals & Frontline Battle Smoke on Attacked Cities
      const attackedIds = new Set(
        marchesRef.current
          .filter((m) => m.type !== 'reinforce')
          .slice(0, 3)
          .map((m) => m.toCityId)
      );

      for (const city of citiesRef.current) {
        if (city.isCapital) {
          const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3.8 + city.x);
          const lg = ctx.createRadialGradient(city.x, city.y - 6, 1, city.x, city.y - 6, 22 + pulse * 6);
          lg.addColorStop(0, `rgba(253, 224, 71, ${0.22 + pulse * 0.14})`);
          lg.addColorStop(1, 'rgba(253, 224, 71, 0)');
          ctx.fillStyle = lg;
          ctx.beginPath();
          ctx.arc(city.x, city.y - 6, 28, 0, Math.PI * 2);
          ctx.fill();
        }
        if (attackedIds.has(city.id) && Math.random() < dt * 7) {
          smokePuffs.push({
            x: city.x + (Math.random() - 0.5) * 14,
            y: city.y - 8,
            vx: 6 + Math.random() * 8,
            vy: -(16 + Math.random() * 14),
            life: 0,
            maxLife: 1.4 + Math.random() * 0.8,
            size: 4 + Math.random() * 5,
          });
        }
      }

      // Update & Draw Rising Battle Smoke / Ember Plumes
      for (let i = smokePuffs.length - 1; i >= 0; i--) {
        const sp = smokePuffs[i];
        sp.life += dt;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        if (sp.life >= sp.maxLife) {
          smokePuffs.splice(i, 1);
          continue;
        }
        const pct = sp.life / sp.maxLife;
        ctx.fillStyle =
          pct < 0.28
            ? `rgba(251, 146, 60, ${(1 - pct) * 0.45})`
            : `rgba(148, 163, 184, ${(1 - pct) * 0.25})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size + pct * 9, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Seasonal Weather Particles (Blossoms / Fireflies / Autumn Leaves / Winter Snow)
      for (const p of particles) {
        p.x += (p.vx + Math.sin(elapsed * 1.6 + p.phase) * 8) * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;

        if (p.x > W + 15) p.x = -12;
        if (p.x < -15) p.x = W + 12;
        if (p.y > H + 15) p.y = -12;
        if (p.y < -15) p.y = H + 12;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);

        if (season === 'winter') {
          ctx.fillStyle = `rgba(241, 245, 249, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (season === 'spring') {
          // Peach / Cherry Blossom Petals
          ctx.fillStyle = `rgba(251, 207, 232, ${p.alpha * 0.85})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (season === 'autumn') {
          // Swirling Crimson & Gold Maple Leaves
          ctx.fillStyle =
            p.phase % 2 > 1
              ? `rgba(249, 115, 22, ${p.alpha * 0.85})`
              : `rgba(250, 204, 21, ${p.alpha * 0.78})`;
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.8, 0);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.8, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          // Summer Golden Fireflies / Sun Motes
          const glow = 0.45 + 0.55 * Math.sin(elapsed * 4.5 + p.phase);
          ctx.fillStyle = `rgba(253, 224, 71, ${p.alpha * glow})`;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (0.8 + glow * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [season]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 w-full h-full z-10"
    />
  );
}
