import type { HeroDuelProfile } from '../../game/heroDuelProfiles.js';
import type { DuelRoundLog, DuelStance } from '../../game/types.js';
import type {
  CameraFrameState,
  ClashBurstEvent,
  DuelExchangeEvent,
  DuelMatchupOutcome,
  ExchangePlan,
  RiderActionPose,
  RiderFrameState,
  SampledDuelFrame,
} from './duelTypes.js';

export const INTRO_DURATION = 1.55;
export const FINALE_DURATION = 1.95;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function beats(a: DuelStance, b: DuelStance): boolean {
  return (
    (a === 'strike' && b === 'guard') ||
    (a === 'feint' && b === 'strike') ||
    (a === 'guard' && b === 'feint')
  );
}

/** Classifies a resolved duel round into its distinct martial-arts choreography archetype */
export function classifyDuelMatchup(log: DuelRoundLog): DuelMatchupOutcome {
  if (log.playerStance === 'chrono_counter') return 'chrono_counter';
  if (log.playerStance === 'skill') return 'skill_burst';
  if (log.enemyStance === 'skill') return 'enemy_dominates';
  if (beats(log.playerStance, log.enemyStance)) {
    if (log.playerStance === 'strike') return 'guard_break';
    if (log.playerStance === 'feint') return 'riposte';
    return 'parry_punish';
  }
  if (beats(log.enemyStance, log.playerStance)) {
    return 'enemy_dominates';
  }
  return 'mirror_clash';
}

function attackPoseForWeapon(profile: HeroDuelProfile): RiderActionPose {
  if (profile.weaponClass === 'spear') return 'thrust';
  if (profile.weaponClass === 'guandao' || profile.weaponClass === 'heavy') {
    return 'slash_overhead';
  }
  return 'slash_sweep';
}

/** Builds a deterministic multi-beat choreography plan for a duel round */
export function buildExchangePlan(
  event: DuelExchangeEvent,
  atkProfile: HeroDuelProfile,
  defProfile: HeroDuelProfile
): ExchangePlan {
  const { log, matchup } = event;
  const bursts: ClashBurstEvent[] = [];
  const slowMoWindows: ExchangePlan['slowMoWindows'] = [];
  const swingCues: ExchangePlan['swingCues'] = [];
  let cutIn: ExchangePlan['cutIn'];
  let chronoScanWindow: ExchangePlan['chronoScanWindow'];
  let duration = 2.45;
  let hpApplyTime = 1.18;

  if (matchup === 'skill_burst') {
    duration = 2.9;
    cutIn = { start: 0.12, end: 1.04, side: 'left', kind: 'skill' };
    slowMoWindows.push({ start: 0.14, end: 0.68, scale: 0.48 });
    swingCues.push({ key: 'sw-1', time: 1.05, weight: atkProfile.weaponWeight });
    swingCues.push({ key: 'sw-2', time: 1.38, weight: defProfile.weaponWeight });
    bursts.push({
      key: 'b-skill-1',
      time: 1.22,
      x: 0.45,
      y: 2.35,
      z: 0.15,
      kind: 'skill',
      hitStopSec: 0.085,
      shake: 0.72,
      dmgRight: log.playerDamage,
      callout: {
        id: `c-${event.id}-1`,
        side: 'left',
        text: { en: `UNLEASHED! -${log.playerDamage}`, zh: `绝技破阵！-${log.playerDamage}` },
        tone: 'gold',
      },
    });
    if (log.enemyDamage > 0) {
      bursts.push({
        key: 'b-skill-2',
        time: 1.56,
        x: -0.3,
        y: 2.2,
        z: -0.1,
        kind: 'parry',
        hitStopSec: 0.04,
        shake: 0.28,
        dmgLeft: log.enemyDamage,
      });
    }
    hpApplyTime = 1.24;
  } else if (matchup === 'chrono_counter') {
    duration = 2.85;
    cutIn = { start: 0.1, end: 0.94, side: 'left', kind: 'chrono' };
    chronoScanWindow = { start: 0.55, end: 1.18 };
    slowMoWindows.push({ start: 0.58, end: 1.06, scale: 0.42 });
    swingCues.push({ key: 'sw-e', time: 0.96, weight: defProfile.weaponWeight });
    swingCues.push({ key: 'sw-p', time: 1.22, weight: atkProfile.weaponWeight });
    bursts.push({
      key: 'b-chrono-whiff',
      time: 1.05,
      x: -0.2,
      y: 2.4,
      z: -0.5,
      kind: 'whiff',
      hitStopSec: 0,
      shake: 0.12,
    });
    bursts.push({
      key: 'b-chrono-hit',
      time: 1.32,
      x: 0.45,
      y: 2.25,
      z: 0.1,
      kind: 'chrono',
      hitStopSec: 0.08,
      shake: 0.62,
      dmgRight: log.playerDamage,
      dmgLeft: log.enemyDamage,
      callout: {
        id: `c-${event.id}-ch`,
        side: 'left',
        text: {
          en: `CHRONO COUNTER! -${log.playerDamage}`,
          zh: `先知破招！-${log.playerDamage}`,
        },
        tone: 'cyan',
      },
    });
    hpApplyTime = 1.34;
  } else if (matchup === 'guard_break') {
    duration = 2.55;
    swingCues.push({ key: 'sw-1', time: 0.85, weight: 'heavy' });
    bursts.push({
      key: 'b-gb',
      time: 1.02,
      x: 0.35,
      y: 2.3,
      z: 0.12,
      kind: 'heavy',
      hitStopSec: 0.075,
      shake: 0.66,
      dmgRight: log.playerDamage,
      dmgLeft: log.enemyDamage,
      callout: {
        id: `c-${event.id}-gb`,
        side: 'left',
        text: {
          en: `GUARD BREAK! -${log.playerDamage}`,
          zh: `力破固守！-${log.playerDamage}`,
        },
        tone: 'crimson',
      },
    });
    hpApplyTime = 1.04;
  } else if (matchup === 'riposte') {
    duration = 2.6;
    swingCues.push({ key: 'sw-e', time: 0.78, weight: defProfile.weaponWeight });
    swingCues.push({ key: 'sw-p', time: 1.12, weight: atkProfile.weaponWeight });
    bursts.push({
      key: 'b-evade',
      time: 0.88,
      x: -0.25,
      y: 2.55,
      z: -0.35,
      kind: 'whiff',
      hitStopSec: 0,
      shake: 0.1,
    });
    bursts.push({
      key: 'b-riposte',
      time: 1.24,
      x: 0.35,
      y: 2.2,
      z: 0.2,
      kind: 'heavy',
      hitStopSec: 0.07,
      shake: 0.56,
      dmgRight: log.playerDamage,
      dmgLeft: log.enemyDamage,
      callout: {
        id: `c-${event.id}-rp`,
        side: 'left',
        text: {
          en: `FEINT RIPOSTE! -${log.playerDamage}`,
          zh: `诱敌反击！-${log.playerDamage}`,
        },
        tone: 'gold',
      },
    });
    hpApplyTime = 1.26;
  } else if (matchup === 'parry_punish') {
    duration = 2.55;
    swingCues.push({ key: 'sw-1', time: 0.78, weight: defProfile.weaponWeight });
    swingCues.push({ key: 'sw-2', time: 1.16, weight: atkProfile.weaponWeight });
    bursts.push({
      key: 'b-parry',
      time: 0.88,
      x: -0.1,
      y: 2.4,
      z: 0.08,
      kind: 'parry',
      hitStopSec: 0.055,
      shake: 0.32,
      callout: {
        id: `c-${event.id}-pr`,
        side: 'left',
        text: { en: 'IRON PARRY!', zh: '铁壁卸力！' },
        tone: 'emerald',
      },
    });
    bursts.push({
      key: 'b-punish',
      time: 1.28,
      x: 0.38,
      y: 2.2,
      z: 0.12,
      kind: 'heavy',
      hitStopSec: 0.065,
      shake: 0.5,
      dmgRight: log.playerDamage,
      dmgLeft: log.enemyDamage,
    });
    hpApplyTime = 1.3;
  } else if (matchup === 'enemy_dominates') {
    duration = log.enemyStance === 'skill' ? 2.8 : 2.55;
    if (log.enemyStance === 'skill') {
      cutIn = { start: 0.14, end: 0.82, side: 'right', kind: 'skill' };
      slowMoWindows.push({ start: 0.16, end: 0.58, scale: 0.5 });
    }
    const offset = log.enemyStance === 'skill' ? 0.22 : 0;
    swingCues.push({ key: 'sw-e', time: 0.86 + offset, weight: defProfile.weaponWeight });
    bursts.push({
      key: 'b-enemy-hit',
      time: 1.04 + offset,
      x: -0.35,
      y: 2.28,
      z: 0.1,
      kind: log.enemyStance === 'skill' ? 'skill' : 'heavy',
      hitStopSec: 0.075,
      shake: 0.64,
      dmgLeft: log.enemyDamage,
      dmgRight: log.playerDamage,
      callout: {
        id: `c-${event.id}-ed`,
        side: 'right',
        text:
          log.enemyStance === 'skill'
            ? { en: `ENEMY SKILL! -${log.enemyDamage}`, zh: `敌将绝技！-${log.enemyDamage}` }
            : { en: `COUNTERED! -${log.enemyDamage}`, zh: `受敌反制！-${log.enemyDamage}` },
        tone: 'crimson',
      },
    });
    hpApplyTime = 1.06 + offset;
  } else {
    // Mirror Clash: 3 rapid back-and-forth mounted steel clashes ("大战数合!")
    duration = 2.65;
    swingCues.push({ key: 'sw-m1', time: 0.72, weight: atkProfile.weaponWeight });
    swingCues.push({ key: 'sw-m2', time: 1.08, weight: defProfile.weaponWeight });
    swingCues.push({ key: 'sw-m3', time: 1.42, weight: atkProfile.weaponWeight });
    bursts.push({
      key: 'b-m1',
      time: 0.84,
      x: 0.0,
      y: 2.42,
      z: 0.12,
      kind: 'parry',
      hitStopSec: 0.04,
      shake: 0.3,
    });
    bursts.push({
      key: 'b-m2',
      time: 1.18,
      x: 0.08,
      y: 2.28,
      z: -0.08,
      kind: 'parry',
      hitStopSec: 0.045,
      shake: 0.36,
      callout: {
        id: `c-${event.id}-mc`,
        side: 'center',
        text: { en: 'FIERCE CLASH!', zh: '大战数合！' },
        tone: 'gold',
      },
    });
    bursts.push({
      key: 'b-m3',
      time: 1.54,
      x: -0.06,
      y: 2.34,
      z: 0.06,
      kind: 'heavy',
      hitStopSec: 0.065,
      shake: 0.5,
      dmgLeft: log.enemyDamage,
      dmgRight: log.playerDamage,
    });
    hpApplyTime = 1.56;
  }

  return {
    duration,
    matchup,
    playerStance: log.playerStance,
    enemyStance: log.enemyStance,
    playerDamage: log.playerDamage,
    enemyDamage: log.enemyDamage,
    cutIn,
    chronoScanWindow,
    bursts,
    slowMoWindows,
    hpApplyTime,
    swingCues,
  };
}

/** Intro sequence: both warhorses gallop in from opposite wings, rear up in challenge, settle to idle */
export function sampleIntroFrame(
  t: number,
  atkProfile: HeroDuelProfile,
  defProfile: HeroDuelProfile
): SampledDuelFrame {
  const n = clamp01(t / INTRO_DURATION);
  let xDist = 4.4;
  let gait: RiderFrameState['gait'] = 'idle';
  let rear = 0;
  let pose: RiderActionPose = 'ready';
  let poseBlend = 0;

  if (n < 0.56) {
    const p = smoothstep(n / 0.56);
    xDist = lerp(9.4, 3.85, p);
    gait = 'gallop';
    pose = 'charge_windup';
    poseBlend = p * 0.45;
  } else if (n < 0.88) {
    const p = (n - 0.56) / 0.32;
    xDist = 3.85;
    gait = 'rear';
    rear = Math.sin(p * Math.PI) * 0.52;
    pose = 'salute';
    poseBlend = Math.sin(p * Math.PI);
  } else {
    xDist = 3.85;
    gait = 'idle';
    rear = 0;
    pose = 'ready';
    poseBlend = 0;
  }

  // Symmetrical sweeping intro camera keeping BOTH galloping warhorses heroically framed!
  const camP = smoothstep(n);
  const camera: CameraFrameState = {
    posX: 0,
    posY: lerp(5.1, 3.85, camP),
    posZ: lerp(15.2, 11.4, camP),
    lookX: 0,
    lookY: lerp(2.15, 2.05, camP),
    lookZ: 0,
    fov: lerp(45, 42, camP),
    shake: 0,
  };

  return {
    left: {
      x: -xDist,
      z: 0,
      yaw: 0,
      gait,
      gaitSpeed: 1.15,
      rearAngle: rear,
      bodyPitch: gait === 'gallop' ? -0.06 : 0,
      pose,
      poseBlend,
      trailIntensity: 0,
      trailColor: atkProfile.auraColor,
      disarmed: false,
      fatigue: 0,
    },
    right: {
      x: xDist,
      z: 0,
      yaw: Math.PI,
      gait,
      gaitSpeed: 1.15,
      rearAngle: rear,
      bodyPitch: gait === 'gallop' ? -0.06 : 0,
      pose,
      poseBlend,
      trailIntensity: 0,
      trailColor: defProfile.auraColor,
      disarmed: false,
      fatigue: 0,
    },
    camera,
    timeScale: 1,
    letterbox: n < 0.85 ? 0.55 : lerp(0.55, 0, (n - 0.85) / 0.15),
    chronoScanAlpha: 0,
    bannerCheer: n > 0.55 && n < 0.88 ? 0.65 : 0.1,
  };
}

/** Living combat idle while awaiting the player's next stance choice */
export function sampleIdleFrame(
  elapsedSec: number,
  atkHp: number,
  defHp: number,
  atkProfile: HeroDuelProfile,
  defProfile: HeroDuelProfile
): SampledDuelFrame {
  const sway = Math.sin(elapsedSec * 0.55);
  const atkFatigue = atkHp < 40 ? (40 - atkHp) / 40 : 0;
  const defFatigue = defHp < 40 ? (40 - defHp) / 40 : 0;

  return {
    left: {
      x: -3.85 + Math.sin(elapsedSec * 0.9) * 0.08,
      z: Math.cos(elapsedSec * 0.7) * 0.08,
      yaw: 0.06 * Math.sin(elapsedSec * 0.6),
      gait: 'idle',
      gaitSpeed: 1,
      rearAngle: 0,
      bodyPitch: 0,
      pose: 'ready',
      poseBlend: 0,
      trailIntensity: 0,
      trailColor: atkProfile.auraColor,
      disarmed: false,
      fatigue: atkFatigue,
    },
    right: {
      x: 3.85 - Math.sin(elapsedSec * 0.9 + 1.1) * 0.08,
      z: -Math.cos(elapsedSec * 0.7 + 0.8) * 0.08,
      yaw: Math.PI - 0.06 * Math.sin(elapsedSec * 0.6 + 0.5),
      gait: 'idle',
      gaitSpeed: 1,
      rearAngle: 0,
      bodyPitch: 0,
      pose: 'ready',
      poseBlend: 0,
      trailIntensity: 0,
      trailColor: defProfile.auraColor,
      disarmed: false,
      fatigue: defFatigue,
    },
    camera: {
      posX: sway * 0.75,
      posY: 3.85 + Math.cos(elapsedSec * 0.4) * 0.14,
      posZ: 11.4 + Math.sin(elapsedSec * 0.35) * 0.28,
      lookX: 0,
      lookY: 2.05,
      lookZ: 0,
      fov: 42,
      shake: 0,
    },
    timeScale: 1,
    letterbox: 0,
    chronoScanAlpha: 0,
    bannerCheer: 0,
  };
}

/** Samples any frame of a multi-beat mounted duel exchange */
export function sampleExchangeFrame(
  t: number,
  plan: ExchangePlan,
  atkHp: number,
  defHp: number,
  atkProfile: HeroDuelProfile,
  defProfile: HeroDuelProfile
): SampledDuelFrame {
  const dur = plan.duration;
  const atkFatigue = atkHp < 40 ? (40 - atkHp) / 40 : 0;
  const defFatigue = defHp < 40 ? (40 - defHp) / 40 : 0;

  let timeScale = 1;
  for (const w of plan.slowMoWindows) {
    if (t >= w.start && t <= w.end) {
      timeScale = w.scale;
      break;
    }
  }

  let chronoScanAlpha = 0;
  if (plan.chronoScanWindow && t >= plan.chronoScanWindow.start && t <= plan.chronoScanWindow.end) {
    const p =
      (t - plan.chronoScanWindow.start) / (plan.chronoScanWindow.end - plan.chronoScanWindow.start);
    chronoScanAlpha = Math.sin(clamp01(p) * Math.PI);
  }

  const left: RiderFrameState = {
    x: -3.85,
    z: 0,
    yaw: 0,
    gait: 'idle',
    gaitSpeed: 1,
    rearAngle: 0,
    bodyPitch: 0,
    pose: 'ready',
    poseBlend: 0,
    trailIntensity: 0,
    trailColor: plan.matchup === 'chrono_counter' ? '#38bdf8' : atkProfile.auraColor,
    disarmed: false,
    fatigue: atkFatigue,
  };

  const right: RiderFrameState = {
    x: 3.85,
    z: 0,
    yaw: Math.PI,
    gait: 'idle',
    gaitSpeed: 1,
    rearAngle: 0,
    bodyPitch: 0,
    pose: 'ready',
    poseBlend: 0,
    trailIntensity: 0,
    trailColor: defProfile.auraColor,
    disarmed: false,
    fatigue: defFatigue,
  };

  const camera: CameraFrameState = {
    posX: 0,
    posY: 4.15,
    posZ: 12.1,
    lookX: 0,
    lookY: 2.05,
    lookZ: 0,
    fov: 42,
    shake: 0,
  };

  let letterbox = 0;
  let bannerCheer = 0.25;

  const atkStrikePose = attackPoseForWeapon(atkProfile);
  const defStrikePose = attackPoseForWeapon(defProfile);

  // Common wheel-back tail phase (last 0.68s)
  const resetStart = dur - 0.68;

  if (plan.matchup === 'mirror_clash') {
    // 3 rapid circling mounted steel passes!
    if (t < 0.62) {
      const p = smoothstep(t / 0.62);
      left.x = lerp(-4.4, -1.35, p);
      right.x = lerp(4.4, 1.35, p);
      left.z = lerp(0, 0.42, p);
      right.z = lerp(0, -0.42, p);
      left.gait = 'gallop';
      right.gait = 'gallop';
      left.pose = 'charge_windup';
      right.pose = 'charge_windup';
      left.poseBlend = p;
      right.poseBlend = p;
      camera.posZ = lerp(12.1, 8.2, p);
      camera.posY = lerp(4.15, 3.1, p);
    } else if (t < resetStart) {
      const p = (t - 0.62) / (resetStart - 0.62);
      const orbit = p * Math.PI * 1.4;
      left.x = -Math.cos(orbit) * 1.32;
      left.z = Math.sin(orbit) * 1.05 + 0.25;
      left.yaw = Math.atan2(-(right.z - left.z), right.x - left.x);
      right.x = Math.cos(orbit) * 1.32;
      right.z = -Math.sin(orbit) * 1.05 - 0.25;
      right.yaw = Math.atan2(-(left.z - right.z), left.x - right.x);
      left.gait = 'gallop';
      right.gait = 'gallop';
      left.gaitSpeed = 1.25;
      right.gaitSpeed = 1.25;

      const beat = (p * 3) % 1;
      left.pose = beat < 0.55 ? atkStrikePose : 'guard_parry';
      right.pose = beat >= 0.45 ? defStrikePose : 'guard_parry';
      left.poseBlend = clamp01(beat * 1.6);
      right.poseBlend = clamp01(((beat + 0.5) % 1) * 1.6);
      left.trailIntensity = 0.85;
      right.trailIntensity = 0.85;

      camera.posX = Math.sin(orbit) * 3.8;
      camera.posY = 2.95;
      camera.posZ = 7.6;
      camera.lookY = 2.15;
      bannerCheer = 0.7;
    } else {
      const p = smoothstep((t - resetStart) / 0.68);
      left.x = lerp(-0.5, -4.4, p);
      right.x = lerp(0.5, 4.4, p);
      left.z = lerp(0.5, 0, p);
      right.z = lerp(-0.5, 0, p);
      left.yaw = lerp(0.4, 0, p);
      right.yaw = lerp(Math.PI + 0.4, Math.PI, p);
      left.gait = 'trot';
      right.gait = 'trot';
      camera.posX = lerp(1.5, 0, p);
      camera.posY = lerp(3.1, 4.15, p);
      camera.posZ = lerp(7.8, 12.1, p);
    }
  } else if (plan.matchup === 'riposte' || plan.matchup === 'chrono_counter') {
    const isChrono = plan.matchup === 'chrono_counter';
    const chargeEnd = isChrono ? 0.92 : 0.72;
    const riposteTime = isChrono ? 1.32 : 1.24;

    if (isChrono) {
      letterbox = t < resetStart ? 0.75 : lerp(0.75, 0, (t - resetStart) / 0.68);
    }

    if (t < chargeEnd) {
      const p = smoothstep(t / chargeEnd);
      left.x = lerp(-4.4, -1.4, p);
      right.x = lerp(4.4, 1.35, p);
      left.gait = 'gallop';
      right.gait = 'gallop';
      left.pose = 'ready';
      right.pose = 'charge_windup';
      right.poseBlend = p;
      camera.posX = lerp(0, isChrono ? -1.4 : 0.4, p);
      camera.posY = lerp(4.15, 2.8, p);
      camera.posZ = lerp(12.1, isChrono ? 7.2 : 8.1, p);
    } else if (t < riposteTime) {
      // Enemy whiffs overhead while player ducks low & weaves diagonally inside!
      const p = clamp01((t - chargeEnd) / (riposteTime - chargeEnd));
      left.x = lerp(-1.4, 0.35, smoothstep(p));
      left.z = Math.sin(p * Math.PI) * 1.15;
      left.yaw = -0.22 * Math.sin(p * Math.PI);
      left.gait = 'gallop';
      left.pose = p < 0.55 ? 'evade_duck' : atkStrikePose;
      left.poseBlend = p < 0.55 ? p / 0.55 : (p - 0.55) / 0.45;
      left.trailIntensity = p > 0.55 ? 1.0 : 0.2;

      right.x = lerp(1.35, -0.35, smoothstep(p));
      right.z = -0.45 * Math.sin(p * Math.PI);
      right.gait = 'gallop';
      right.pose = defStrikePose;
      right.poseBlend = clamp01(p * 1.35);
      right.trailIntensity = p < 0.65 ? 0.75 : 0;

      camera.posX = lerp(-0.8, 1.8, p);
      camera.posY = 2.75;
      camera.posZ = 7.4;
      camera.lookX = 0.25;
      camera.lookY = 2.2;
    } else if (t < resetStart) {
      // Enemy recoils & skids back from lethal riposte!
      const p = clamp01((t - riposteTime) / (resetStart - riposteTime));
      left.x = lerp(0.35, -1.6, smoothstep(p));
      left.z = lerp(0.3, 0, p);
      left.gait = 'trot';
      left.pose = atkStrikePose;
      left.poseBlend = 1;
      left.trailIntensity = Math.max(0, 1 - p * 2.2);

      right.x = lerp(0.95, 5.4, smoothstep(p));
      right.z = 0;
      right.gait = 'skid';
      right.rearAngle = Math.sin(p * Math.PI) * 0.24;
      right.pose = 'stagger_hit';
      right.poseBlend = p;

      camera.posX = lerp(1.8, 1.2, p);
      camera.posY = lerp(2.75, 3.4, p);
      camera.posZ = lerp(7.4, 9.5, p);
      camera.lookX = lerp(0.4, 1.4, p);
      bannerCheer = 0.85;
    } else {
      const p = smoothstep((t - resetStart) / 0.68);
      left.x = lerp(-1.6, -4.4, p);
      right.x = lerp(5.4, 4.4, p);
      left.gait = 'trot';
      right.gait = 'trot';
      camera.posX = lerp(1.2, 0, p);
      camera.posY = lerp(3.4, 4.15, p);
      camera.posZ = lerp(9.5, 12.1, p);
      camera.lookX = lerp(1.4, 0, p);
    }
  } else if (plan.matchup === 'parry_punish') {
    const parryTime = 0.88;
    const punishTime = 1.28;
    if (t < parryTime) {
      const p = smoothstep(t / parryTime);
      left.x = lerp(-4.4, -1.25, p);
      right.x = lerp(4.4, 1.25, p);
      left.gait = p < 0.72 ? 'gallop' : 'skid';
      right.gait = 'gallop';
      left.pose = 'guard_parry';
      left.poseBlend = p;
      right.pose = defStrikePose;
      right.poseBlend = clamp01((p - 0.35) / 0.65);
      right.trailIntensity = p > 0.5 ? 0.8 : 0;
      camera.posX = lerp(0, -1.2, p);
      camera.posY = lerp(4.15, 2.95, p);
      camera.posZ = lerp(12.1, 8.0, p);
    } else if (t < punishTime) {
      const p = clamp01((t - parryTime) / (punishTime - parryTime));
      left.x = lerp(-1.25, -0.35, smoothstep(p));
      right.x = lerp(1.25, 1.55, p);
      left.gait = 'gallop';
      right.gait = 'stagger';
      left.pose = atkStrikePose;
      left.poseBlend = p;
      left.trailIntensity = 0.95;
      right.pose = 'stagger_hit';
      right.poseBlend = p * 0.6;
      camera.posX = lerp(-1.2, 1.2, p);
      camera.posY = 2.85;
      camera.posZ = 7.6;
    } else if (t < resetStart) {
      const p = clamp01((t - punishTime) / (resetStart - punishTime));
      left.x = lerp(-0.35, -1.8, smoothstep(p));
      right.x = lerp(1.55, 5.3, smoothstep(p));
      left.gait = 'trot';
      right.gait = 'skid';
      right.pose = 'stagger_hit';
      right.poseBlend = p;
      camera.posX = lerp(1.2, 0.5, p);
      camera.posY = lerp(2.85, 3.6, p);
      camera.posZ = lerp(7.6, 10.2, p);
      bannerCheer = 0.75;
    } else {
      const p = smoothstep((t - resetStart) / 0.68);
      left.x = lerp(-1.8, -4.4, p);
      right.x = lerp(5.3, 4.4, p);
      left.gait = 'trot';
      right.gait = 'trot';
      camera.posX = lerp(0.5, 0, p);
      camera.posY = lerp(3.6, 4.15, p);
      camera.posZ = lerp(10.2, 12.1, p);
    }
  } else if (plan.matchup === 'enemy_dominates') {
    const isEnemySkill = plan.enemyStance === 'skill';
    const impactTime = isEnemySkill ? 1.26 : 1.04;
    if (isEnemySkill) {
      letterbox = t < resetStart ? 0.8 : lerp(0.8, 0, (t - resetStart) / 0.68);
    }

    if (t < impactTime) {
      const p = smoothstep(t / impactTime);
      left.x = lerp(-4.4, -1.25, p);
      right.x = lerp(4.4, 1.1, p);
      left.gait = 'gallop';
      right.gait = 'gallop';
      right.gaitSpeed = isEnemySkill ? 1.35 : 1.15;
      left.pose = plan.playerStance === 'guard' ? 'guard_parry' : 'charge_windup';
      left.poseBlend = p;
      right.pose = p < 0.55 ? 'charge_windup' : defStrikePose;
      right.poseBlend = p < 0.55 ? p / 0.55 : (p - 0.55) / 0.45;
      right.trailIntensity = p > 0.52 ? (isEnemySkill ? 1.0 : 0.85) : 0;

      if (isEnemySkill && t < 0.72) {
        // Dramatic close-up push-in on enemy general unleashing skill!
        camera.posX = right.x - 1.6;
        camera.posY = 2.85;
        camera.posZ = 5.6;
        camera.lookX = right.x;
        camera.lookY = 2.35;
      } else {
        camera.posX = lerp(1.0, -1.4, p);
        camera.posY = lerp(4.0, 2.85, p);
        camera.posZ = lerp(11.6, 7.6, p);
      }
    } else if (t < resetStart) {
      const p = clamp01((t - impactTime) / (resetStart - impactTime));
      left.x = lerp(-1.25, -5.8, smoothstep(p));
      right.x = lerp(1.1, 2.2, smoothstep(p));
      left.gait = 'skid';
      left.rearAngle = Math.sin(p * Math.PI) * 0.25;
      left.pose = 'stagger_hit';
      left.poseBlend = p;
      right.gait = 'trot';
      right.pose = defStrikePose;
      right.poseBlend = 1;
      right.trailIntensity = Math.max(0, 1 - p * 2.5);
      camera.posX = lerp(-1.4, -1.6, p);
      camera.posY = lerp(2.85, 3.5, p);
      camera.posZ = lerp(7.6, 9.8, p);
      camera.lookX = lerp(-0.5, -1.5, p);
    } else {
      const p = smoothstep((t - resetStart) / 0.68);
      left.x = lerp(-5.8, -4.4, p);
      right.x = lerp(2.2, 4.4, p);
      left.gait = 'trot';
      right.gait = 'trot';
      camera.posX = lerp(-1.6, 0, p);
      camera.posY = lerp(3.5, 4.15, p);
      camera.posZ = lerp(9.8, 12.1, p);
      camera.lookX = lerp(-1.5, 0, p);
    }
  } else {
    // guard_break OR skill_burst: Dominant thunderous player charge!
    const isSkill = plan.matchup === 'skill_burst';
    const impactTime = isSkill ? 1.22 : 1.02;
    if (isSkill) {
      letterbox = t < resetStart ? 0.85 : lerp(0.85, 0, (t - resetStart) / 0.68);
    }

    if (t < impactTime) {
      const p = smoothstep(t / impactTime);
      left.x = lerp(-4.4, -1.05, p);
      right.x = lerp(4.4, 1.3, p);
      left.gait = 'gallop';
      left.gaitSpeed = isSkill ? 1.4 : 1.2;
      right.gait = p < 0.72 ? 'gallop' : 'skid';
      left.pose = p < 0.56 ? 'charge_windup' : atkStrikePose;
      left.poseBlend = p < 0.56 ? p / 0.56 : (p - 0.56) / 0.44;
      left.trailIntensity = p > 0.5 ? 1.0 : isSkill ? 0.4 : 0;
      right.pose = 'guard_parry';
      right.poseBlend = p;

      if (isSkill && t < 0.72) {
        // Hero close-up push-in during KOEI Portrait Cut-In!
        camera.posX = left.x + 1.8;
        camera.posY = 2.85;
        camera.posZ = 5.4;
        camera.lookX = left.x;
        camera.lookY = 2.35;
      } else {
        camera.posX = lerp(-1.2, 1.5, p);
        camera.posY = lerp(3.9, 2.75, p);
        camera.posZ = lerp(11.4, 7.3, p);
      }
    } else if (t < resetStart) {
      const p = clamp01((t - impactTime) / (resetStart - impactTime));
      left.x = lerp(-1.05, -2.0, smoothstep(p));
      right.x = lerp(1.3, 6.0, smoothstep(p));
      left.gait = 'trot';
      left.pose = atkStrikePose;
      left.poseBlend = 1;
      left.trailIntensity = Math.max(0, 1 - p * 2.2);

      right.gait = 'skid';
      right.rearAngle = Math.sin(p * Math.PI) * 0.3;
      right.pose = 'stagger_hit';
      right.poseBlend = p;

      camera.posX = lerp(1.5, 1.8, p);
      camera.posY = lerp(2.75, 3.4, p);
      camera.posZ = lerp(7.3, 9.6, p);
      camera.lookX = lerp(0.5, 1.6, p);
      bannerCheer = 0.9;
    } else {
      const p = smoothstep((t - resetStart) / 0.68);
      left.x = lerp(-2.0, -4.4, p);
      right.x = lerp(6.0, 4.4, p);
      left.gait = 'trot';
      right.gait = 'trot';
      camera.posX = lerp(1.8, 0, p);
      camera.posY = lerp(3.4, 4.15, p);
      camera.posZ = lerp(9.6, 12.1, p);
      camera.lookX = lerp(1.6, 0, p);
    }
  }

  return {
    left,
    right,
    camera,
    timeScale,
    letterbox,
    chronoScanAlpha,
    bannerCheer,
  };
}

/** Dramatic Slow-Motion KO & Victory Orbit Finale */
export function sampleFinaleFrame(
  t: number,
  winner: 'attacker' | 'defender' | 'draw',
  atkProfile: HeroDuelProfile,
  defProfile: HeroDuelProfile
): SampledDuelFrame {
  const n = clamp01(t / FINALE_DURATION);
  const p = smoothstep(n);

  const atkWon = winner === 'attacker';
  const defWon = winner === 'defender';

  const left: RiderFrameState = {
    x: atkWon ? lerp(-4.4, -1.6, p) : defWon ? lerp(-4.4, -6.5, p) : -3.4,
    z: 0,
    yaw: 0,
    gait: atkWon ? (n < 0.35 ? 'trot' : 'rear') : defWon ? 'stagger' : 'idle',
    gaitSpeed: 1,
    rearAngle: atkWon && n >= 0.35 ? Math.sin(Math.min(1, (n - 0.35) / 0.55) * Math.PI * 0.72) * 0.56 : 0,
    bodyPitch: 0,
    pose: atkWon ? 'victory_raise' : defWon ? 'defeat_slump' : 'salute',
    poseBlend: p,
    trailIntensity: atkWon && n > 0.35 && n < 0.8 ? 0.6 : 0,
    trailColor: atkProfile.auraColor,
    disarmed: defWon && n > 0.15,
    fatigue: defWon ? 1 : 0.25,
  };

  const right: RiderFrameState = {
    x: defWon ? lerp(4.4, 1.6, p) : atkWon ? lerp(4.4, 6.5, p) : 3.4,
    z: 0,
    yaw: Math.PI,
    gait: defWon ? (n < 0.35 ? 'trot' : 'rear') : atkWon ? 'stagger' : 'idle',
    gaitSpeed: 1,
    rearAngle: defWon && n >= 0.35 ? Math.sin(Math.min(1, (n - 0.35) / 0.55) * Math.PI * 0.72) * 0.56 : 0,
    bodyPitch: 0,
    pose: defWon ? 'victory_raise' : atkWon ? 'defeat_slump' : 'salute',
    poseBlend: p,
    trailIntensity: defWon && n > 0.35 && n < 0.8 ? 0.6 : 0,
    trailColor: defProfile.auraColor,
    disarmed: atkWon && n > 0.15,
    fatigue: atkWon ? 1 : 0.25,
  };

  // Heroic 105-degree 3D cinema orbit around the triumphant general!
  const focusX = atkWon ? left.x : defWon ? right.x : 0;
  const orbitAngle = lerp(-0.35, 1.15, p) * (defWon ? -1 : 1);
  const radius = lerp(9.2, 6.8, p);

  const camera: CameraFrameState = {
    posX: focusX + Math.sin(orbitAngle) * radius,
    posY: lerp(3.4, 2.75, p),
    posZ: Math.cos(orbitAngle) * radius,
    lookX: focusX,
    lookY: 2.35,
    lookZ: 0,
    fov: lerp(42, 38, p),
    shake: 0,
  };

  return {
    left,
    right,
    camera,
    timeScale: n < 0.32 ? 0.5 : 0.85,
    letterbox: 0.9,
    chronoScanAlpha: 0,
    bannerCheer: 1.0,
  };
}
