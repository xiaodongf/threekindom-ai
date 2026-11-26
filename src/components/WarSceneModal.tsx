import { useEffect, useRef, useState } from 'react';
import { FastForward, Flame, SkipForward, Swords, Volume2, VolumeX } from 'lucide-react';
import { TACTICS } from '../game/data.js';
import type {
  FactionId,
  GameState,
  General,
  Language,
  LocalizedText,
  PlayableFactionId,
  TacticId,
  TerrainType,
} from '../game/types.js';
import { TERRAIN_TEXT, tLoc } from '../i18n/translations.js';
import { battleAudio } from '../utils/battleAudio.js';
import { HeroAvatar } from './HeroAvatar.js';
import { Art } from './ui/Art.js';
import { CountUp } from './ui/CountUp.js';
import { Seal } from './ui/Seal.js';
import { WarStage3D } from './WarStage3D.js';
import { getComfort } from '../utils/comfort.js';

export interface WarSceneConfig {
  id: string;
  mode: 'assault' | 'pincer' | 'river_strike' | 'raid' | 'bombard' | 'discord';
  attackerFaction: PlayableFactionId;
  defenderFaction: FactionId;
  fromCityId: string;
  toCityId: string;
  pincerFromCityId?: string;
  terrain: TerrainType;
  tactic?: TacticId;
  attackerHero?: General;
  deputyHero?: General;
  defenderHero?: General;
  skillTriggered?: LocalizedText;
  attackerStartTroops: number;
  defenderStartTroops: number;
  attackerLosses: number;
  defenderLosses: number;
  attackerWon: boolean;
  isPlayerDefending: boolean;
  hasGunpowder: boolean;
  hasStirrups: boolean;
  hasSteamship: boolean;
  hasBalloon: boolean;
  summaryText: LocalizedText;
}

interface WarSceneModalProps {
  scene: WarSceneConfig;
  state: GameState;
  lang: Language;
  queueBadge?: string;
  initialElapsed?: number;
  onFinish: () => void;
}

const FACTION_COLOR: Record<FactionId, { main: string; light: string; dark: string }> = {
  wei: { main: '#4c78a8', light: '#b9d0e6', dark: '#1d4ed8' },
  shu: { main: '#438554', light: '#add4b6', dark: '#047857' },
  wu: { main: '#c2432f', light: '#edb3a5', dark: '#84281c' },
  neutral: { main: '#a8a29e', light: '#e7e5e4', dark: '#57534e' },
};

interface UnitDot {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  side: 'atk' | 'def';
  isFlank?: boolean;
  isCav?: boolean;
  alive: boolean;
  phase: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: 'arrow' | 'firebomb' | 'discord';
  life: number;
  maxLife: number;
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

const TOTAL_DURATION = 5.4; // seconds at 1x speed

export function WarSceneModal({
  scene,
  state,
  lang,
  queueBadge,
  initialElapsed = 0,
  onFinish,
}: WarSceneModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const elapsedRef = useRef<number>(initialElapsed);
  const [webglFailed, setWebglFailed] = useState<boolean>(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [muted, setMuted] = useState<boolean>(battleAudio.muted);
  const [progress, setProgress] = useState<number>(Math.min(1, initialElapsed / TOTAL_DURATION));
  const [showSkillCutIn, setShowSkillCutIn] = useState<boolean>(
    initialElapsed >= 1.35 && initialElapsed < 2.7
  );
  const [completed, setCompleted] = useState<boolean>(initialElapsed >= 4.4);

  const speedRef = useRef<1 | 2>(1);
  speedRef.current = speed;

  const cutInHero = scene.isPlayerDefending
    ? scene.defenderHero || scene.attackerHero
    : scene.attackerHero || scene.defenderHero;

  const atkFaction = state.factions[scene.attackerFaction];
  const defName =
    scene.defenderFaction === 'neutral'
      ? lang === 'zh'
        ? '无主守军'
        : 'Garrison'
      : tLoc(state.factions[scene.defenderFaction].name, lang);
  const targetCity = state.cities[scene.toCityId];
  const fromCity =
    scene.fromCityId && scene.fromCityId !== scene.toCityId
      ? state.cities[scene.fromCityId]
      : undefined;

  const liveAtkTroops = Math.max(
    0,
    Math.round(scene.attackerStartTroops - scene.attackerLosses * Math.min(1, Math.max(0, (progress - 0.18) / 0.65)))
  );
  const liveDefTroops = Math.max(
    0,
    Math.round(scene.defenderStartTroops - scene.defenderLosses * Math.min(1, Math.max(0, (progress - 0.18) / 0.65)))
  );

  const toggleMute = () => {
    const next = !muted;
    battleAudio.muted = next;
    setMuted(next);
  };

  // Master timeline & Web Audio battle SFX driver when 3D WebGL stage is active
  useEffect(() => {
    if (webglFailed) return;
    elapsedRef.current = initialElapsed;
    let lastTs = performance.now();
    let rafId = 0;

    let firedDrum1 = initialElapsed >= 0.05;
    let firedVolley = initialElapsed >= 0.65;
    let firedSkill = initialElapsed >= 1.35;
    let firedBlast = initialElapsed >= 1.95;
    let firedClash = initialElapsed >= 2.65;
    let firedOutcome = initialElapsed >= 4.4;

    const step = (now: number) => {
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      const dt = rawDt * speedRef.current;
      elapsedRef.current += dt;
      const elapsed = elapsedRef.current;
      setProgress(Math.min(1, elapsed / TOTAL_DURATION));

      if (!firedDrum1 && elapsed >= 0.05) {
        firedDrum1 = true;
        battleAudio.playWarDrum(0.32);
      }
      if (!firedVolley && elapsed >= 0.65) {
        firedVolley = true;
        battleAudio.playArrowVolley(0.16);
      }
      if (!firedSkill && elapsed >= 1.35) {
        firedSkill = true;
        if (cutInHero || scene.skillTriggered) {
          setShowSkillCutIn(true);
          battleAudio.playSkillSurge(0.24);
        }
      }
      if (elapsed >= 2.75) {
        setShowSkillCutIn(false);
      }
      if (!firedBlast && elapsed >= 1.95) {
        firedBlast = true;
        if (
          scene.hasGunpowder ||
          scene.tactic === 'fire' ||
          scene.mode === 'bombard' ||
          scene.mode === 'raid'
        ) {
          battleAudio.playExplosion(0.3);
        } else {
          battleAudio.playWarDrum(0.26);
        }
      }
      if (!firedClash && elapsed >= 2.65) {
        firedClash = true;
        battleAudio.playSteelClash(0.18);
        if (scene.hasGunpowder || scene.mode === 'bombard') {
          battleAudio.playExplosion(0.26);
        }
      }
      if (!firedOutcome && elapsed >= 4.4) {
        firedOutcome = true;
        const playerVictory = scene.isPlayerDefending ? !scene.attackerWon : scene.attackerWon;
        battleAudio.playOutcomeHorn(playerVictory, 0.2);
        setCompleted(true);
      }

      if (elapsed < TOTAL_DURATION) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [scene, webglFailed, initialElapsed, cutInHero]);

  useEffect(() => {
    if (!webglFailed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 880;
    const H = 400;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const atkPal = FACTION_COLOR[scene.attackerFaction];
    const defPal = FACTION_COLOR[scene.defenderFaction];
    const isNight = scene.mode === 'raid' || scene.mode === 'discord';
    const isRiver = scene.terrain === 'river' || scene.mode === 'river_strike';
    const isFortress = scene.terrain === 'fortress' || scene.mode === 'bombard';

    // Initialize miniature army / Lou-Chuan warship formations strictly below horizon (y >= 188)
    const units: UnitDot[] = [];
    const atkCount = isRiver
      ? scene.mode === 'discord'
        ? 6
        : 14
      : scene.mode === 'discord'
        ? 14
        : scene.mode === 'raid'
          ? 24
          : 36;
    const defCount = isRiver ? 11 : 30;

    for (let i = 0; i < atkCount; i++) {
      const isFlank = scene.mode === 'pincer' && i >= Math.floor(atkCount * 0.62);
      const jitterX = Math.sin(i * 19.7) * 14;
      const jitterY = Math.cos(i * 13.3) * 8;

      let startX: number;
      let startY: number;
      let targetX: number;
      let targetY: number;

      if (isRiver) {
        if (isFlank) {
          const fi = i - Math.floor(atkCount * 0.62);
          startX = 115 + fi * 44 + jitterX * 0.5;
          startY = 196 + (fi % 2) * 20 + jitterY * 0.4;
          targetX = 360 + fi * 38;
          targetY = 205 + (fi % 3) * 22;
        } else {
          const row = i % 3;
          const col = Math.floor(i / 3);
          startX = 68 + col * 58 + row * 16 + jitterX * 0.6;
          startY = 258 + row * 38 + jitterY * 0.5;
          targetX = 325 + col * 48 + row * 14;
          targetY = 255 + row * 36;
        }
      } else if (isFlank) {
        const fi = i - Math.floor(atkCount * 0.62);
        const row = fi % 3;
        const col = Math.floor(fi / 3);
        startX = 135 + col * 32 + row * 12 + jitterX * 0.6;
        startY = 190 + row * 18 + jitterY * 0.4;
        targetX = (isFortress ? 475 : 405) + col * 24;
        targetY = 206 + row * 22;
      } else {
        const row = i % 5;
        const col = Math.floor(i / 5);
        startX = 56 + col * 30 + (row % 2) * 12 + jitterX * 0.6;
        startY = 242 + row * 26 + jitterY * 0.5;
        targetX = (isFortress ? 490 : 395) + col * 24 + (row % 2) * 10;
        targetY = 238 + row * 26;
      }

      units.push({
        x: startX,
        y: startY,
        targetX,
        targetY,
        speed: (isFlank ? 1.18 : 1.0) * (scene.hasStirrups || scene.mode === 'raid' ? 1.25 : 1.0),
        side: 'atk',
        isFlank,
        isCav: !isRiver && (scene.hasStirrups || scene.mode === 'raid' || isFlank || i % 3 === 0),
        alive: true,
        phase: (i * 1.37) % (Math.PI * 2),
      });
    }

    for (let i = 0; i < defCount; i++) {
      const jitterX = Math.sin(i * 23.1) * 12;
      const jitterY = Math.cos(i * 17.9) * 7;
      let startX: number;
      let startY: number;
      let targetX: number;
      let targetY: number;

      if (isRiver) {
        const row = i % 4;
        const col = Math.floor(i / 4);
        startX = 500 + col * 52 - row * 12 + jitterX * 0.5;
        startY = 216 + row * 38 + jitterY * 0.5;
        targetX = 455 + col * 48 - row * 10;
        targetY = startY;
      } else {
        const row = i % 5;
        const col = Math.floor(i / 5);
        startX = (isFortress ? 565 : 520) + col * 26 + jitterX * 0.5;
        startY = 224 + row * 28 + jitterY * 0.5;
        targetX = (isFortress ? 550 : 475) + col * 22;
        targetY = startY;
      }

      units.push({
        x: startX,
        y: startY,
        targetX,
        targetY,
        speed: 0.72,
        side: 'def',
        isCav: !isRiver && i % 4 === 0,
        alive: true,
        phase: (i * 1.91) % (Math.PI * 2),
      });
    }

    // The smaller army fields fewer figures, and ranks thin as the casualties in the report mount.
    const biggest = Math.max(1, scene.attackerStartTroops, scene.defenderStartTroops);
    const sides = {
      atk: units.filter((u) => u.side === 'atk'),
      def: units.filter((u) => u.side === 'def'),
    };
    const fielded = {
      atk: Math.max(4, Math.round(sides.atk.length * Math.max(0.35, scene.attackerStartTroops / biggest))),
      def: Math.max(4, Math.round(sides.def.length * Math.max(0.35, scene.defenderStartTroops / biggest))),
    };
    for (const key of ['atk', 'def'] as const) {
      sides[key].forEach((u, i) => {
        if (i >= fielded[key]) u.alive = false;
      });
    }
    const lossShare = {
      atk: Math.min(0.94, scene.attackerLosses / Math.max(1, scene.attackerStartTroops)),
      def: Math.min(0.94, scene.defenderLosses / Math.max(1, scene.defenderStartTroops)),
    };
    const fallen: Array<{ x: number; y: number; side: 'atk' | 'def'; life: number }> = [];

    const projectiles: Projectile[] = [];
    const particles: Particle[] = [];

    let elapsed = initialElapsed;
    let lastTs = performance.now();
    let rafId = 0;
    let shake = 0;

    // Audio & event triggers
    let firedDrum1 = initialElapsed >= 0.05;
    let firedVolley = initialElapsed >= 0.65;
    let firedSkill = initialElapsed >= 1.35;
    let firedBlast = initialElapsed >= 1.95;
    let firedClash = initialElapsed >= 2.65;
    let firedOutcome = initialElapsed >= 4.4;

    const spawnBurst = (x: number, y: number, color: string, count: number, power = 1) => {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (35 + Math.random() * 145) * power;
        particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 35,
          size: 2 + Math.random() * 4.5,
          color,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.55,
        });
      }
    };

    const spawnVolley = (fromLeft: boolean, kind: Projectile['kind'], count: number) => {
      for (let i = 0; i < count; i++) {
        const sx = fromLeft ? 150 + Math.random() * 180 : 580 + Math.random() * 120;
        const sy = 205 + Math.random() * 135;
        const dx = fromLeft ? 320 + Math.random() * 200 : -(240 + Math.random() * 190);
        projectiles.push({
          x: sx,
          y: sy,
          vx: dx / 0.85,
          vy: -(135 + Math.random() * 85),
          kind,
          life: 0,
          maxLife: 0.85 + Math.random() * 0.25,
        });
      }
    };

    // If started at a non-zero timestamp (e.g. visual preview), fast-forward formations & battle VFX
    if (initialElapsed > 0) {
      const moveProgress = Math.min(1, initialElapsed / 2.2);
      for (const u of units) {
        u.x = u.x + (u.targetX - u.x) * moveProgress;
        u.y = u.y + (u.targetY - u.y) * moveProgress;
        if (initialElapsed > 2.65) {
          const pushDir = scene.attackerWon ? 1 : -1;
          u.x += pushDir * Math.min(1.8, initialElapsed - 2.65) * 26;
        }
      }
      if (initialElapsed >= 1.4 && initialElapsed < 4.4) {
        spawnVolley(true, scene.hasGunpowder || scene.tactic === 'fire' ? 'firebomb' : 'arrow', 10);
        spawnVolley(true, 'arrow', 18);
        spawnVolley(false, 'arrow', 12);
        for (const p of projectiles) {
          const dt = 0.28 + Math.random() * 0.35;
          p.life = dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt + 0.5 * 310 * dt * dt;
          p.vy += 310 * dt;
        }
        spawnBurst(560, 245, '#f97316', 28, 1.1);
        spawnBurst(660, 215, '#fde047', 24, 1.0);
      }
    }

    const drawBackground = (t: number) => {
      // Transparent clear so studio-painted HD panoramic backdrop shines underneath!
      ctx.clearRect(0, 0, W, H);

      // Subtle cinematic atmospheric shading & battle dust gradient
      const atm = ctx.createLinearGradient(0, 0, 0, H);
      if (scene.tactic === 'fire' || scene.mode === 'bombard') {
        atm.addColorStop(0, 'rgba(24, 10, 12, 0.16)');
        atm.addColorStop(0.55, 'rgba(154, 52, 18, 0.12)');
        atm.addColorStop(1, 'rgba(2, 6, 23, 0.42)');
      } else if (isNight) {
        atm.addColorStop(0, 'rgba(3, 7, 18, 0.2)');
        atm.addColorStop(1, 'rgba(2, 6, 23, 0.45)');
      } else {
        atm.addColorStop(0, 'rgba(2, 6, 23, 0.12)');
        atm.addColorStop(1, 'rgba(2, 6, 23, 0.38)');
      }
      ctx.fillStyle = atm;
      ctx.fillRect(0, 0, W, H);

      // Modern Tech: Striped Manned Recon Hot-Air Balloon floating in the painted sky!
      if (scene.hasBalloon) {
        const bx = 220 + Math.sin(t * 0.85) * 26;
        const by = 66 + Math.cos(t * 1.35) * 6;
        ctx.save();
        const bGlow = ctx.createRadialGradient(bx, by + 18, 2, bx, by + 18, 26);
        bGlow.addColorStop(0, 'rgba(251, 191, 36, 0.65)');
        bGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bGlow;
        ctx.beginPath();
        ctx.arc(bx, by + 18, 26, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.ellipse(bx, by, 19, 23, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.ellipse(bx, by, 12, 22.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.ellipse(bx, by, 5, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(254, 243, 199, 0.85)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.ellipse(bx, by, 19, 23, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.arc(bx, by + 24, 3 + Math.sin(t * 22) * 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(254,243,199,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx - 8, by + 20);
        ctx.lineTo(bx - 5, by + 30);
        ctx.moveTo(bx + 8, by + 20);
        ctx.lineTo(bx + 5, by + 30);
        ctx.stroke();
        ctx.fillStyle = '#92400e';
        ctx.fillRect(bx - 6, by + 30, 12, 7);
        ctx.strokeStyle = '#fde68a';
        ctx.strokeRect(bx - 6, by + 30, 12, 7);
        ctx.restore();
      }

      // Animated Water Shimmer Ripples over Painted Yangtze Backdrop
      if (isRiver) {
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.28)';
        ctx.lineWidth = 1.4;
        for (let r = 0; r < 14; r++) {
          const wy = 200 + r * 14;
          const offset = (t * 44 + r * 63) % W;
          ctx.beginPath();
          ctx.moveTo((offset - 68 + W) % W, wy);
          ctx.lineTo((offset + 34) % W, wy);
          ctx.stroke();
        }
      }

      // Dynamic Faction Flag & Blazing Breach Glow anchored onto the Right-Side Painted Fortress!
      const wallX = 738;
      const wallCrumbled = (scene.attackerWon && t > 3.5) || (scene.mode === 'bombard' && t > 2.2);
      const roofPal = scene.attackerWon && t > 4.2 ? atkPal : defPal;
      ctx.save();

      // Tall Fluttering Faction Standard Flag (flips from defender to attacker upon capture!)
      const flagX = wallX + 26;
      const wave = Math.sin(t * 9) * 4;
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(flagX, 118);
      ctx.lineTo(flagX, 68);
      ctx.stroke();
      ctx.fillStyle = roofPal.main;
      ctx.beginPath();
      ctx.moveTo(flagX, 70);
      ctx.lineTo(flagX + 38, 76 + wave);
      ctx.lineTo(flagX + 30, 86 + wave * 0.5);
      ctx.lineTo(flagX + 38, 94 + wave);
      ctx.lineTo(flagX, 98);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Blazing Breach Fire Bloom if bombarded or captured
      if (wallCrumbled) {
        const fireGrad = ctx.createRadialGradient(wallX - 18, 224, 6, wallX - 18, 224, 68);
        fireGrad.addColorStop(0, 'rgba(254, 240, 138, 0.78)');
        fireGrad.addColorStop(0.42, 'rgba(249, 115, 22, 0.52)');
        fireGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = fireGrad;
        ctx.beginPath();
        ctx.arc(wallX - 18, 224, 68 + Math.sin(t * 14) * 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Atmospheric Drifting Fire Embers across battlefield
      if (scene.tactic === 'fire' || scene.mode === 'bombard' || scene.hasGunpowder) {
        ctx.save();
        for (let e = 0; e < 26; e++) {
          const ex = (e * 67 + t * (30 + (e % 5) * 8)) % W;
          const ey = H - ((e * 41 + t * (36 + (e % 4) * 9)) % (H - 35));
          ctx.fillStyle = e % 2 === 0 ? 'rgba(251, 146, 60, 0.8)' : 'rgba(254, 240, 138, 0.72)';
          ctx.beginPath();
          ctx.arc(ex, ey, 1.5 + (e % 3) * 0.65, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    const drawUnit = (u: UnitDot, t: number) => {
      const pal = u.side === 'atk' ? atkPal : defPal;
      const bob = Math.sin(t * (isRiver ? 5.5 : 13) + u.phase) * (isRiver ? 1.8 : 2.1);
      ctx.save();
      ctx.translate(u.x, u.y + bob);
      // Figures are drawn large enough to read as ranks on a full-screen field
      const figureScale = isRiver ? 1.3 : 1.6;
      ctx.scale(figureScale, figureScale);

      if (isRiver) {
        // Detailed Chinese Lou-Chuan Tower Warship / Steam Ironclad Warship!
        const dir = u.side === 'atk' ? 1 : -1;

        // Water Wake V-Trail
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.45)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(22 * dir, 12);
        ctx.lineTo(-24 * dir, 16);
        ctx.moveTo(16 * dir, 10);
        ctx.lineTo(-28 * dir, 9);
        ctx.stroke();

        // Dark Curved Wooden / Ironclad Hull
        ctx.fillStyle = '#3b1706';
        ctx.beginPath();
        ctx.moveTo(-22 * dir, 3);
        ctx.lineTo(25 * dir, 2);
        ctx.lineTo(17 * dir, 12);
        ctx.lineTo(-16 * dir, 12);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Crimson & Gold Upper Combat Deck Cabin
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-11, -3, 22, 6);
        ctx.fillStyle = pal.dark;
        ctx.fillRect(-13, 2, 26, 2.5);

        // Twin Ribbed Chinese Junk Battened Sails
        ctx.fillStyle = pal.main;
        ctx.beginPath();
        ctx.moveTo(-2 * dir, 1);
        ctx.lineTo(-2 * dir, -22);
        ctx.quadraticCurveTo(14 * dir, -15, 13 * dir, -3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fef3c7';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        // Horizontal sail battens
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.beginPath();
        ctx.moveTo(-2 * dir, -14);
        ctx.lineTo(9 * dir, -12);
        ctx.moveTo(-2 * dir, -8);
        ctx.lineTo(11 * dir, -7);
        ctx.stroke();

        // Mast Flag Pennant
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.moveTo(-2 * dir, -22);
        ctx.lineTo(-10 * dir, -20 + Math.sin(t * 10 + u.phase) * 1.5);
        ctx.lineTo(-2 * dir, -18);
        ctx.closePath();
        ctx.fill();

        // Modern Tech: Steam Smokestack + Churning Paddlewheel + Steam Plume!
        if (u.side === 'atk' && scene.hasSteamship) {
          // Iron smokestack
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(-12, -16, 4.5, 16);
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(-12.5, -16, 5.5, 2.2);
          // Red paddlewheel at midship
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.arc(-4, 9, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 1;
          ctx.stroke();
          // Curling steam puffs
          for (let sp = 0; sp < 2; sp++) {
            const pAge = (t * 1.4 + u.phase + sp * 0.5) % 1;
            ctx.fillStyle = `rgba(226, 232, 240, ${(1 - pAge) * 0.55})`;
            ctx.beginPath();
            ctx.arc(-11 - pAge * 16, -18 - pAge * 12, 2.5 + pAge * 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        const dir = u.side === 'atk' ? 1 : -1;
        // Ground Shadow
        ctx.fillStyle = 'rgba(6,4,2,0.58)';
        ctx.beginPath();
        ctx.ellipse(0, 9, u.isCav ? 10 : 6.5, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Warhorse silhouette (if cavalry)
        if (u.isCav) {
          ctx.fillStyle = '#5c2d16';
          ctx.beginPath();
          ctx.roundRect(-8, -1, 16, 7.5, 3);
          ctx.fill();
          // Horse neck & head
          ctx.beginPath();
          ctx.moveTo(6 * dir, 1);
          ctx.lineTo(11 * dir, -6);
          ctx.lineTo(13 * dir, -3);
          ctx.lineTo(8 * dir, 4);
          ctx.closePath();
          ctx.fill();
        }

        // Armored Torso + Cape + Helmet
        ctx.fillStyle = pal.dark;
        ctx.fillRect(-4, -9, 8, 10);
        ctx.fillStyle = pal.main;
        ctx.fillRect(-3.5, -9, 7, 7);
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(0, -12, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Shield
        ctx.fillStyle = pal.light;
        ctx.beginPath();
        ctx.ellipse(4.5 * dir, -4, 2.6, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Gleaming Spear / Halberd
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-2 * dir, -4);
        ctx.lineTo(15 * dir, -14);
        ctx.stroke();

        // Unit Standard Banner on Vanguard Leaders
        if (u.phase < 1.6) {
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(-4 * dir, 0);
          ctx.lineTo(-4 * dir, -24);
          ctx.stroke();
          ctx.fillStyle = pal.main;
          ctx.beginPath();
          ctx.moveTo(-4 * dir, -24);
          ctx.lineTo(-16 * dir, -21 + Math.sin(t * 11 + u.phase) * 2);
          ctx.lineTo(-4 * dir, -15);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    };

    const tick = (now: number) => {
      const rawDt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      const dt = rawDt * speedRef.current;
      elapsed = Math.min(TOTAL_DURATION, elapsed + dt);
      const pct = elapsed / TOTAL_DURATION;
      setProgress(pct);

      // Choreographed Audio + VFX Triggers
      if (!firedDrum1 && elapsed >= 0.05) {
        firedDrum1 = true;
        battleAudio.playWarDrum(0.32);
      }
      if (!firedVolley && elapsed >= 0.65) {
        firedVolley = true;
        battleAudio.playArrowVolley(0.16);
        spawnVolley(true, scene.mode === 'discord' ? 'discord' : 'arrow', 22);
        spawnVolley(false, 'arrow', 14);
      }
      if (!firedSkill && elapsed >= 1.35) {
        firedSkill = true;
        if (cutInHero || scene.skillTriggered) {
          setShowSkillCutIn(true);
          battleAudio.playSkillSurge(0.24);
        }
      }
      if (elapsed >= 2.7) {
        setShowSkillCutIn(false);
      }
      if (!firedBlast && elapsed >= 1.95) {
        firedBlast = true;
        if (
          scene.hasGunpowder ||
          scene.tactic === 'fire' ||
          scene.mode === 'bombard' ||
          scene.mode === 'raid'
        ) {
          battleAudio.playExplosion(0.3);
          spawnVolley(true, 'firebomb', 9);
          shake = 10;
        } else {
          battleAudio.playWarDrum(0.26);
          spawnVolley(true, 'arrow', 18);
        }
      }
      if (!firedClash && elapsed >= 2.65) {
        firedClash = true;
        battleAudio.playSteelClash(0.18);
        shake = Math.max(shake, 8);
        spawnBurst(500, 260, '#f97316', 32, 1.2);
        spawnBurst(660, 235, '#fbbf24', 24, 1.0);
        if (scene.hasGunpowder || scene.mode === 'bombard') {
          battleAudio.playExplosion(0.26);
          spawnBurst(680, 220, '#c2432f', 44, 1.5);
        }
      }
      if (!firedOutcome && elapsed >= 4.4) {
        firedOutcome = true;
        const playerVictory = scene.isPlayerDefending ? !scene.attackerWon : scene.attackerWon;
        battleAudio.playOutcomeHorn(playerVictory, 0.2);
        spawnBurst(
          scene.attackerWon ? 710 : 320,
          170,
          scene.attackerWon ? atkPal.light : defPal.light,
          42,
          1.3
        );
        setCompleted(true);
      }

      // Advance units
      const chargeT = Math.min(1, elapsed / 2.6);
      for (const u of units) {
        if (!u.alive) continue;
        if (elapsed < 2.65) {
          u.x += (u.targetX - u.x) * Math.min(1, dt * 1.35 * u.speed);
          u.y += (u.targetY - u.y) * Math.min(1, dt * 1.15 * u.speed);
        } else if (elapsed < 4.4) {
          // Climax push!
          const pushDir = scene.attackerWon ? 1 : -1;
          u.x += pushDir * dt * 26 * (u.side === 'atk' ? 1.1 : 0.85);
          if (Math.random() < dt * 0.9) {
            spawnBurst(u.x, u.y - 4, '#fde047', 2, 0.45);
          }
        }
      }

      // Thin the ranks: losses begin when the lines meet and are complete at the verdict
      const lossT = Math.min(1, Math.max(0, (elapsed - 1.7) / 2.7));
      for (const key of ['atk', 'def'] as const) {
        const standing = sides[key].filter((u) => u.alive);
        const shouldStand = Math.max(1, Math.round(fielded[key] * (1 - lossShare[key] * lossT)));
        for (let n = standing.length; n > shouldStand; n--) {
          // The front of the line falls first
          let pick = 0;
          let best = -Infinity;
          for (let i = 0; i < standing.length; i++) {
            if (!standing[i].alive) continue;
            const front = (key === 'atk' ? standing[i].x : -standing[i].x) + Math.random() * 60;
            if (front > best) {
              best = front;
              pick = i;
            }
          }
          const u = standing[pick];
          u.alive = false;
          fallen.push({ x: u.x, y: u.y, side: key, life: 0 });
          spawnBurst(u.x, u.y - 4, isRiver ? '#bae6fd' : '#c9bda2', 5, 0.4);
        }
      }
      for (let i = fallen.length - 1; i >= 0; i--) {
        fallen[i].life += dt;
        if (fallen[i].life > 3.2) fallen.splice(i, 1);
      }

      // Update projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 310 * dt;
        if (p.life >= p.maxLife) {
          if (p.kind === 'firebomb') {
            spawnBurst(p.x, p.y, '#f97316', 20, 1.1);
            spawnBurst(p.x, p.y, '#fde047', 12, 0.7);
            shake = Math.max(shake, 7);
          } else if (p.kind === 'discord') {
            spawnBurst(p.x, p.y, '#e879f9', 14, 0.8);
          } else {
            spawnBurst(p.x, p.y, '#e2e8f0', 4, 0.35);
          }
          projectiles.splice(i, 1);
        }
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life += dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 190 * dt;
        if (pt.life >= pt.maxLife) {
          particles.splice(i, 1);
        }
      }

      shake = Math.max(0, shake - dt * 24);

      // Render Frame
      ctx.save();
      if (shake > 0.2 && getComfort().shake) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      }
      drawBackground(elapsed);

      // Where a rank fell: a dropped banner on land, a ring on the water, fading
      for (const f of fallen) {
        const fade = 1 - f.life / 3.2;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade) * 0.75;
        ctx.translate(f.x, f.y + 6);
        if (isRiver) {
          ctx.strokeStyle = 'rgba(224, 242, 254, 0.8)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 8 + f.life * 9, 2.5 + f.life * 2.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.rotate(f.side === 'atk' ? -1.25 : 1.25);
          ctx.fillStyle = '#1c1712';
          ctx.fillRect(-0.8, -11, 1.6, 13);
          ctx.fillStyle = (f.side === 'atk' ? atkPal : defPal).main;
          ctx.fillRect(0.8, -11, 6, 4.5);
        }
        ctx.restore();
      }

      // Draw sorted units back-to-front by Y for crisp 2.5D depth
      units.sort((a, b) => a.y - b.y);
      for (const u of units) {
        if (u.alive) drawUnit(u, elapsed);
      }

      // Draw Projectiles
      for (const p of projectiles) {
        ctx.save();
        if (p.kind === 'firebomb') {
          ctx.fillStyle = '#fb923c';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'discord') {
          ctx.fillStyle = '#e879f9';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const ang = Math.atan2(p.vy, p.vx);
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(-9, 0);
          ctx.lineTo(5, 0);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw Particles
      for (const pt of particles) {
        const alpha = Math.max(0, 1 - pt.life / pt.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * alpha + 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Subtle atmospheric battle dust/vignette
      if (chargeT > 0.4) {
        const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.65);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(6,4,2,0.45)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.restore();

      if (elapsed < TOTAL_DURATION) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [scene, webglFailed, initialElapsed, cutInHero]);

  const modeLabel: Record<WarSceneConfig['mode'], LocalizedText> = {
    assault: { en: 'City Siege Battle', zh: '攻城决战' },
    pincer: { en: 'Joint Pincer Encirclement', zh: '多路合围夹击' },
    river_strike: { en: 'Yangtze Amphibious Assault', zh: '长江水师奔袭' },
    raid: { en: 'Night Camp Raid', zh: '夜袭劫营' },
    bombard: { en: 'Fire & Gunpowder Bombardment', zh: '雷火轰城' },
    discord: { en: 'Covert Infiltration & Discord', zh: '离间策反' },
  };

  const playerWon = scene.isPlayerDefending ? !scene.attackerWon : scene.attackerWon;
  const atkName = tLoc(atkFaction.shortName, lang);
  const atkCss = FACTION_COLOR[scene.attackerFaction].main;
  const defCss = FACTION_COLOR[scene.defenderFaction].main;

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0806] flex flex-col">
      <div className="ink-panel border-x-0 border-t-0 w-full flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Top Live Battlefield HUD */}
        <div className="px-4 py-3 bg-slate-950/85 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {scene.attackerHero && <HeroAvatar hero={scene.attackerHero} size="sm" showLevel />}
            <div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                {scene.isPlayerDefending && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-600/90 text-white animate-pulse">
                    {lang === 'zh' ? '敌军来袭！' : 'UNDER ATTACK!'}
                  </span>
                )}
                <span>
                  {tLoc(modeLabel[scene.mode], lang)} · {tLoc(TERRAIN_TEXT[scene.terrain], lang)}
                  {scene.tactic ? ` · ${tLoc(TACTICS[scene.tactic].name, lang)}` : ''}
                </span>
                {queueBadge && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200">
                    {queueBadge}
                  </span>
                )}
              </div>
              <div className="font-display text-sm sm:text-base font-bold text-white flex items-center gap-2 mt-0.5">
                <span>
                  {fromCity ? tLoc(fromCity.name, lang) : tLoc(atkFaction.shortName, lang)}
                </span>
                <Swords className="w-3.5 h-3.5 text-rose-400" />
                <span>{targetCity ? tLoc(targetCity.name, lang) : ''}</span>
              </div>
            </div>
          </div>

          {/* Live Ticking Army Counters */}
          <div className="flex items-center gap-3.5 text-xs">
            <div className="text-right">
              <div className="text-[10px] text-slate-400">{tLoc(atkFaction.shortName, lang)}</div>
              <div className="font-mono font-extrabold text-sm text-cyan-300">
                {liveAtkTroops.toLocaleString()}
              </div>
            </div>
            <div className="text-rose-400 font-black">VS</div>
            <div>
              <div className="text-[10px] text-slate-400">{defName}</div>
              <div className="font-mono font-extrabold text-sm text-rose-300">
                {liveDefTroops.toLocaleString()}
              </div>
            </div>
            {scene.defenderHero && <HeroAvatar hero={scene.defenderHero} size="sm" showLevel />}
          </div>

          {/* Playback Controls: Mute, 1x/2x Speed, Skip */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              title={muted ? 'Unmute SFX' : 'Mute SFX'}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-cyan-300" />}
            </button>
            <button
              type="button"
              onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
              className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer ${
                speed === 2
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>{speed}x</span>
            </button>
            <button
              type="button"
              onClick={onFinish}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? '跳过' : 'Skip'}</span>
            </button>
          </div>
        </div>

        {/* Real-Time 3D WebGL Instanced Battle Diorama (with 2D Canvas fallback) */}
        <div className="flex-1 relative min-h-0 flex items-center justify-center bg-[#0a0806] overflow-hidden">
          {!webglFailed ? (
            <WarStage3D
              scene={scene}
              state={state}
              elapsedRef={elapsedRef}
              onFallback={() => setWebglFailed(true)}
            />
          ) : (
            <div
              className="relative bg-slate-950 overflow-hidden"
              style={{ width: 'min(100%, calc((100vh - 6.5rem) * 2.2))' }}
            >
              <Art
                src={
                  scene.mode === 'raid' || scene.mode === 'discord'
                    ? '/art/bg_night_raid.jpg'
                    : scene.terrain === 'river' || scene.mode === 'river_strike'
                      ? '/art/bg_yangtze_river.jpg'
                      : scene.terrain === 'mountain'
                        ? '/art/bg_mountain_pass.jpg'
                        : '/art/bg_plains_siege.jpg'
                }
                alt="Battlefield Panorama"
                style={{ transform: `scale(${(1 + progress * 0.065).toFixed(4)})` }}
                className="pointer-events-none absolute inset-0 w-full h-full object-cover object-center theme-art-grade transition-transform duration-150"
              />
              <canvas
                ref={canvasRef}
                className="relative z-10 w-full aspect-[880/400] block"
              />
            </div>
          )}

          {/* Subtle Widescreen Cinema Vignette Bars */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-black/75 to-transparent z-10" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/85 to-transparent z-10" />

          {/* Lower-Third Hero Signature Skill Cut-In (leaves center 3D melee unobstructed) */}
          {showSkillCutIn && cutInHero && (
            <div className="anim-rise pointer-events-none absolute bottom-11 inset-x-4 max-w-2xl mx-auto z-20 ink-panel gold-border-glow rounded-lg py-2.5 px-5 flex items-center gap-4">
              <HeroAvatar hero={cutInHero} size="lg" showLevel />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-amber-300">
                  <Flame className="w-4 h-4 text-orange-400 shrink-0" />
                  <span className="truncate">
                    {scene.skillTriggered
                      ? tLoc(scene.skillTriggered, lang)
                      : tLoc(cutInHero.signatureSkill.name, lang)}
                  </span>
                </div>
                <div className="font-brush text-2xl font-bold text-slate-50 leading-tight mt-0.5">
                  {tLoc(cutInHero.name, lang)}
                </div>
                <p className="text-xs sm:text-sm text-amber-100/90 italic mt-0.5 line-clamp-1">
                  “{tLoc(cutInHero.signatureSkill.battleCry, lang)}”
                </p>
              </div>
            </div>
          )}

          {/* Modern Tech Active Badges (Bottom-Left of Stage) */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex flex-wrap gap-1.5">
            {scene.hasGunpowder && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-600/80 text-white border border-amber-300/60 shadow">
                {lang === 'zh' ? '黑火药震天雷' : 'Black Powder'}
              </span>
            )}
            {scene.hasSteamship && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-600/80 text-white border border-cyan-300/60 shadow">
                {lang === 'zh' ? '蒸汽战船' : 'Steam Warships'}
              </span>
            )}
            {scene.hasBalloon && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-600/80 text-white border border-amber-200/60 shadow">
                {lang === 'zh' ? '热气球侦察' : 'Recon Balloon'}
              </span>
            )}
            {scene.mode === 'pincer' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600/85 text-white border border-indigo-300/60 shadow">
                {lang === 'zh' ? '多路合围 +20%' : 'Joint Pincer +20%'}
              </span>
            )}
          </div>

          {/* Verdict: a seal comes down, then the ledger counts the cost */}
          {completed && (
            <div className="absolute inset-0 z-30 bg-[#0a0806]/72 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
              <div className="anim-rise flex items-center gap-5">
                <Seal
                  char={playerWon ? '勝' : '敗'}
                  size={92}
                  stamped
                  color={playerWon ? undefined : '#3a342c'}
                />
                <div className="text-left">
                  <div className="brush-heading font-brush text-4xl font-bold text-slate-50 leading-none">
                    {scene.isPlayerDefending
                      ? scene.attackerWon
                        ? lang === 'zh'
                          ? '城池失守'
                          : 'The city has fallen'
                        : lang === 'zh'
                          ? '守城大捷'
                          : 'The walls held'
                      : scene.attackerWon
                        ? lang === 'zh'
                          ? '大获全胜'
                          : 'Victory'
                        : lang === 'zh'
                          ? '攻势受挫'
                          : 'The assault was thrown back'}
                  </div>
                  <p className="mt-4 text-sm text-slate-200 max-w-xl leading-relaxed">
                    {tLoc(scene.summaryText, lang)}
                  </p>
                </div>
              </div>

              <div className="anim-rise [animation-delay:180ms] mt-6 grid grid-cols-2 gap-px bg-amber-400/25 border border-amber-400/25 w-full max-w-2xl text-left">
                {(
                  [
                    {
                      name: atkName,
                      color: atkCss,
                      start: scene.attackerStartTroops,
                      lost: scene.attackerLosses,
                      won: scene.attackerWon,
                    },
                    {
                      name: defName,
                      color: defCss,
                      start: scene.defenderStartTroops,
                      lost: scene.defenderLosses,
                      won: !scene.attackerWon,
                    },
                  ] as const
                ).map((side, idx) => (
                  <div key={idx} className="bg-[#14110d] px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-display text-base font-bold text-slate-50">
                        <span className="w-2.5 h-2.5 rotate-45" style={{ background: side.color }} />
                        {side.name}
                      </span>
                      <span className={`text-[11px] font-bold ${side.won ? 'text-amber-200' : 'text-slate-400'}`}>
                        {side.won ? (lang === 'zh' ? '胜' : 'Held the field') : lang === 'zh' ? '负' : 'Driven off'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between text-xs text-slate-400">
                      <span>{lang === 'zh' ? '折损' : 'Lost'}</span>
                      <span className="text-2xl font-bold text-rose-300">
                        −<CountUp value={side.lost} from={0} />
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-black/70 overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.max(2, Math.round((1 - side.lost / Math.max(1, side.start)) * 100))}%`,
                          background: side.color,
                          transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between text-xs text-slate-400">
                      <span>
                        {lang === 'zh' ? '出阵' : 'Fielded'} {side.start.toLocaleString()}
                      </span>
                      <span className="text-slate-200 font-semibold">
                        {lang === 'zh' ? '余部' : 'Standing'}{' '}
                        <CountUp value={Math.max(0, side.start - side.lost)} from={side.start} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={onFinish}
                className="anim-rise [animation-delay:320ms] mt-6 px-7 py-2.5 rounded-md btn-gold text-sm cursor-pointer"
              >
                {lang === 'zh' ? '查看详细战报' : 'Continue to report'}
              </button>
            </div>
          )}
        </div>

        {/* Bottom Timeline Progress Bar */}
        <div className="h-1.5 bg-slate-900 w-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-amber-400 to-rose-500 transition-all duration-100"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
