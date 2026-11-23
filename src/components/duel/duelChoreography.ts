import type { HeroDuelProfile } from '../../game/heroDuelProfiles.js';
import type { DuelRoundLog, DuelStance } from '../../game/types.js';
import type {
  CameraFrameState,
  ClashBurstEvent,
  DuelExchangeEvent,
  DuelMatchupOutcome,
  ExchangePlan,
  ExchangeScript,
  RiderActionPose,
  RiderFrameState,
  SampledDuelFrame,
  SideScript,
} from './duelTypes.js';
import { isPolearmVariant, weaponStyleOf } from './duelWeapons3D.js';

export const INTRO_DURATION = 2.1;
export const FINALE_DURATION = 2.8;
/** Where each general waits between exchanges (distance from the centre line) */
export const IDLE_X = 3.5;
/** Strike blend at which the blade arrives — must match the rig's pose library */
const STRIKE_CONTACT = 0.7;
const RESET = 0.7;

const IDLE_CAM = { y: 3.0, z: 10.6, lookY: 2.2, fov: 34 };

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function ease(t: number): number {
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
  if (weaponStyleOf(profile) === 'spear') return 'thrust';
  if (profile.weaponClass === 'guandao' || profile.weaponClass === 'heavy') {
    return 'slash_overhead';
  }
  return 'slash_sweep';
}

/** How close a general must ride for their weapon to land */
function strikingDistance(profile: HeroDuelProfile): number {
  return isPolearmVariant(profile.weaponVariant) ? 1.8 : 1.42;
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

  const left: SideScript = { strikes: [], knock: 0 };
  const right: SideScript = { strikes: [], knock: 0 };
  let focus: ExchangeScript['focus'] = 'left';
  let closeUp: ExchangeScript['closeUp'];
  let rear: ExchangeScript['rear'];
  let letterbox = 0;

  if (matchup === 'skill_burst') {
    duration = 3.0;
    cutIn = { start: 0.12, end: 1.04, side: 'left', kind: 'skill' };
    closeUp = { side: 'left', start: 0.12, end: 0.74 };
    letterbox = 0.85;
    slowMoWindows.push({ start: 0.14, end: 0.68, scale: 0.48 });
    swingCues.push({ key: 'sw-1', time: 1.05, weight: atkProfile.weaponWeight });
    left.strikes.push(1.22);
    right.guard = [0.5, 1.22];
    right.staggerAt = 1.22;
    right.knock = 2.1;
    if (log.enemyDamage > 0) {
      // The enemy lands a glancing blow first; the signature strike answers it.
      right.guard = undefined;
      right.strikes.push(0.96);
      swingCues.push({ key: 'sw-0', time: 0.82, weight: defProfile.weaponWeight });
      bursts.push({
        key: 'b-skill-0',
        time: 0.96,
        x: -0.3,
        y: 2.6,
        z: 0.3,
        kind: 'parry',
        striker: 'right',
        hitStopSec: 0.035,
        shake: 0.26,
        dmgLeft: log.enemyDamage,
      });
    }
    bursts.push({
      key: 'b-skill-1',
      time: 1.22,
      x: 0.45,
      y: 2.6,
      z: 0.3,
      kind: 'skill',
      striker: 'left',
      hitStopSec: 0.1,
      shake: 0.85,
      dmgRight: log.playerDamage,
      callout: {
        id: `c-${event.id}-1`,
        side: 'left',
        text: { en: `UNLEASHED! -${log.playerDamage}`, zh: `绝技破阵！-${log.playerDamage}` },
        tone: 'gold',
      },
    });
    hpApplyTime = 1.24;
  } else if (matchup === 'chrono_counter') {
    duration = 2.95;
    cutIn = { start: 0.1, end: 0.94, side: 'left', kind: 'chrono' };
    letterbox = 0.75;
    chronoScanWindow = { start: 0.55, end: 1.18 };
    slowMoWindows.push({ start: 0.58, end: 1.06, scale: 0.42 });
    swingCues.push({ key: 'sw-e', time: 0.96, weight: defProfile.weaponWeight });
    swingCues.push({ key: 'sw-p', time: 1.22, weight: atkProfile.weaponWeight });
    right.strikes.push(1.05);
    left.duckAt = 1.05;
    left.strikes.push(1.36);
    right.staggerAt = 1.36;
    right.knock = 1.7;
    bursts.push({
      key: 'b-chrono-whiff',
      time: 1.05,
      x: -0.2,
      y: 2.6,
      z: 0.3,
      kind: 'whiff',
      striker: 'right',
      hitStopSec: 0,
      shake: 0.12,
    });
    bursts.push({
      key: 'b-chrono-hit',
      time: 1.36,
      x: 0.45,
      y: 2.6,
      z: 0.3,
      kind: 'chrono',
      striker: 'left',
      hitStopSec: 0.09,
      shake: 0.7,
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
    hpApplyTime = 1.38;
  } else if (matchup === 'guard_break') {
    duration = 2.6;
    swingCues.push({ key: 'sw-1', time: 0.85, weight: 'heavy' });
    left.strikes.push(1.02);
    right.guard = [0.4, 1.02];
    right.staggerAt = 1.02;
    right.knock = 1.6;
    bursts.push({
      key: 'b-gb',
      time: 1.02,
      x: 0.35,
      y: 2.6,
      z: 0.3,
      kind: 'heavy',
      striker: 'left',
      hitStopSec: 0.085,
      shake: 0.72,
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
    duration = 2.7;
    swingCues.push({ key: 'sw-e', time: 0.78, weight: defProfile.weaponWeight });
    swingCues.push({ key: 'sw-p', time: 1.12, weight: atkProfile.weaponWeight });
    right.strikes.push(0.88);
    left.duckAt = 0.88;
    left.strikes.push(1.26);
    right.staggerAt = 1.26;
    right.knock = 1.5;
    bursts.push({
      key: 'b-evade',
      time: 0.88,
      x: -0.25,
      y: 2.6,
      z: 0.3,
      kind: 'whiff',
      striker: 'right',
      hitStopSec: 0,
      shake: 0.1,
    });
    bursts.push({
      key: 'b-riposte',
      time: 1.26,
      x: 0.35,
      y: 2.6,
      z: 0.3,
      kind: 'heavy',
      striker: 'left',
      hitStopSec: 0.08,
      shake: 0.6,
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
    hpApplyTime = 1.28;
  } else if (matchup === 'parry_punish') {
    duration = 2.7;
    swingCues.push({ key: 'sw-1', time: 0.78, weight: defProfile.weaponWeight });
    swingCues.push({ key: 'sw-2', time: 1.16, weight: atkProfile.weaponWeight });
    right.strikes.push(0.88);
    left.guard = [0.36, 0.98];
    left.strikes.push(1.32);
    right.staggerAt = 1.32;
    right.knock = 1.4;
    bursts.push({
      key: 'b-parry',
      time: 0.88,
      x: -0.1,
      y: 2.6,
      z: 0.3,
      kind: 'parry',
      striker: 'right',
      hitStopSec: 0.06,
      shake: 0.34,
      callout: {
        id: `c-${event.id}-pr`,
        side: 'left',
        text: { en: 'IRON PARRY!', zh: '铁壁卸力！' },
        tone: 'emerald',
      },
    });
    bursts.push({
      key: 'b-punish',
      time: 1.32,
      x: 0.38,
      y: 2.6,
      z: 0.3,
      kind: 'heavy',
      striker: 'left',
      hitStopSec: 0.075,
      shake: 0.56,
      dmgRight: log.playerDamage,
      dmgLeft: log.enemyDamage,
    });
    hpApplyTime = 1.34;
  } else if (matchup === 'enemy_dominates') {
    const isSkill = log.enemyStance === 'skill';
    const tc = isSkill ? 1.26 : 1.04;
    duration = isSkill ? 2.95 : 2.6;
    focus = 'right';
    if (isSkill) {
      cutIn = { start: 0.14, end: 0.82, side: 'right', kind: 'skill' };
      closeUp = { side: 'right', start: 0.14, end: 0.72 };
      letterbox = 0.8;
      slowMoWindows.push({ start: 0.16, end: 0.58, scale: 0.5 });
    }
    swingCues.push({ key: 'sw-e', time: tc - 0.18, weight: defProfile.weaponWeight });
    right.strikes.push(tc);
    if (log.playerStance === 'guard') left.guard = [0.4, tc];
    else left.strikes.push(tc + 0.14);
    left.staggerAt = tc;
    left.knock = isSkill ? 2.0 : 1.5;
    bursts.push({
      key: 'b-enemy-hit',
      time: tc,
      x: -0.35,
      y: 2.6,
      z: 0.3,
      kind: isSkill ? 'skill' : 'heavy',
      striker: 'right',
      hitStopSec: isSkill ? 0.1 : 0.08,
      shake: isSkill ? 0.82 : 0.68,
      dmgLeft: log.enemyDamage,
      dmgRight: log.playerDamage,
      callout: {
        id: `c-${event.id}-ed`,
        side: 'right',
        text: isSkill
          ? { en: `ENEMY SKILL! -${log.enemyDamage}`, zh: `敌将绝技！-${log.enemyDamage}` }
          : { en: `COUNTERED! -${log.enemyDamage}`, zh: `受敌反制！-${log.enemyDamage}` },
        tone: 'crimson',
      },
    });
    hpApplyTime = tc + 0.02;
  } else {
    // Mirror clash: three exchanges of steel, the last with both horses rearing ("大战数合!")
    duration = 2.9;
    focus = 'both';
    swingCues.push({ key: 'sw-m1', time: 0.7, weight: atkProfile.weaponWeight });
    swingCues.push({ key: 'sw-m2', time: 1.04, weight: defProfile.weaponWeight });
    swingCues.push({ key: 'sw-m3', time: 1.42, weight: atkProfile.weaponWeight });
    left.strikes.push(0.84, 1.58);
    right.strikes.push(0.84, 1.2, 1.58);
    left.guard = [1.0, 1.32];
    left.knock = 0.9;
    right.knock = 0.9;
    rear = [1.3, 1.9];
    bursts.push({
      key: 'b-m1',
      time: 0.84,
      x: 0,
      y: 2.7,
      z: 0.3,
      kind: 'parry',
      striker: 'both',
      hitStopSec: 0.045,
      shake: 0.32,
    });
    bursts.push({
      key: 'b-m2',
      time: 1.2,
      x: 0,
      y: 2.7,
      z: 0.3,
      kind: 'parry',
      striker: 'right',
      hitStopSec: 0.05,
      shake: 0.38,
      callout: {
        id: `c-${event.id}-mc`,
        side: 'center',
        text: { en: 'FIERCE CLASH!', zh: '大战数合！' },
        tone: 'gold',
      },
    });
    bursts.push({
      key: 'b-m3',
      time: 1.58,
      x: 0,
      y: 3.0,
      z: 0.3,
      kind: 'heavy',
      striker: 'both',
      hitStopSec: 0.075,
      shake: 0.6,
      dmgLeft: log.enemyDamage,
      dmgRight: log.playerDamage,
    });
    hpApplyTime = 1.6;
  }

  // A beat of slow motion right after every decisive blow gives it weight
  for (const b of bursts) {
    if (b.kind === 'heavy' || b.kind === 'skill' || b.kind === 'chrono') {
      slowMoWindows.push({ start: b.time, end: b.time + 0.12, scale: b.kind === 'heavy' ? 0.3 : 0.22 });
    }
  }

  const contacts = [...left.strikes, ...right.strikes].sort((a, b) => a - b);
  const reach =
    focus === 'left'
      ? strikingDistance(atkProfile)
      : focus === 'right'
        ? strikingDistance(defProfile)
        : Math.min(strikingDistance(atkProfile), strikingDistance(defProfile)) + 0.12;

  const script: ExchangeScript = {
    left,
    right,
    firstContact: contacts[0],
    lastContact: contacts[contacts.length - 1],
    rear,
    focus,
    closeUp,
    letterbox,
    contactHalf: reach,
    contactZ: reach < 1.7 ? 0.5 : 0,
  };

  return {
    duration,
    script,
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

function baseRider(side: 'left' | 'right', trailColor: string, fatigue: number): RiderFrameState {
  return {
    x: side === 'left' ? -IDLE_X : IDLE_X,
    z: 0,
    yaw: side === 'left' ? 0 : Math.PI,
    gait: 'idle',
    gaitSpeed: 1,
    rearAngle: 0,
    bodyPitch: 0,
    pose: 'ready',
    poseBlend: 0,
    trailIntensity: 0,
    trailColor,
    disarmed: false,
    fatigue,
  };
}

function fatigueOf(hp: number): number {
  return hp < 40 ? (40 - hp) / 40 : 0;
}

/** Intro: both warhorses gallop in from the wings, rear in challenge, then settle */
export function sampleIntroFrame(
  t: number,
  atkProfile: HeroDuelProfile,
  defProfile: HeroDuelProfile
): SampledDuelFrame {
  const n = clamp01(t / INTRO_DURATION);
  const left = baseRider('left', atkProfile.auraColor, 0);
  const right = baseRider('right', defProfile.auraColor, 0);

  let dist = IDLE_X;
  for (const r of [left, right]) {
    if (n < 0.56) {
      const p = n / 0.56;
      dist = lerp(11.5, IDLE_X, 1 - Math.pow(1 - p, 2.2));
      r.gait = p < 0.86 ? 'gallop' : 'skid';
      r.gaitSpeed = 1.15;
      r.pose = 'charge_windup';
      r.poseBlend = 0.35 * (1 - ease((p - 0.7) / 0.3));
    } else if (n < 0.88) {
      const p = (n - 0.56) / 0.32;
      r.gait = 'rear';
      r.rearAngle = Math.sin(p * Math.PI) * 0.5;
      r.pose = 'salute';
      r.poseBlend = Math.sin(p * Math.PI);
    }
  }
  left.x = -dist;
  right.x = dist;

  const camP = ease(n);
  const camera: CameraFrameState = {
    posX: lerp(-1.6, 0, camP),
    posY: lerp(1.9, IDLE_CAM.y, camP),
    posZ: lerp(13.4, IDLE_CAM.z, camP),
    lookX: 0,
    lookY: lerp(2.5, IDLE_CAM.lookY, camP),
    lookZ: 0,
    fov: lerp(40, IDLE_CAM.fov, camP),
    shake: 0,
    cutId: 0,
  };

  return {
    left,
    right,
    camera,
    timeScale: 1,
    letterbox: n < 0.85 ? 0.55 : lerp(0.55, 0, (n - 0.85) / 0.15),
    chronoScanAlpha: 0,
    bannerCheer: n > 0.55 && n < 0.9 ? 0.7 : 0.15,
    radialBlur: n < 0.45 ? 0.012 : 0,
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
  const left = baseRider('left', atkProfile.auraColor, fatigueOf(atkHp));
  const right = baseRider('right', defProfile.auraColor, fatigueOf(defHp));
  left.yaw = 0.04 * Math.sin(elapsedSec * 0.6);
  right.yaw = Math.PI - 0.04 * Math.sin(elapsedSec * 0.6 + 0.5);

  return {
    left,
    right,
    camera: {
      posX: Math.sin(elapsedSec * 0.5) * 0.7,
      posY: IDLE_CAM.y + Math.cos(elapsedSec * 0.4) * 0.12,
      posZ: IDLE_CAM.z + Math.sin(elapsedSec * 0.35) * 0.25,
      lookX: 0,
      lookY: IDLE_CAM.lookY,
      lookZ: 0,
      fov: IDLE_CAM.fov,
      shake: 0,
      cutId: 0,
    },
    timeScale: 1,
    letterbox: 0,
    chronoScanAlpha: 0,
    bannerCheer: 0,
    radialBlur: 0,
  };
}

/** Maps exchange time to the strike pose's blend so the blade arrives exactly at `contact`. */
function strikeBlend(t: number, contact: number): number | null {
  const start = contact - 0.5;
  const cut = contact - 0.13;
  if (t < start || t > contact + 0.5) return null;
  if (t < cut) return 0.38 * ease((t - start) / (cut - start));
  if (t < contact) return 0.38 + (STRIKE_CONTACT - 0.38) * Math.pow((t - cut) / (contact - cut), 1.6);
  return STRIKE_CONTACT + (1 - STRIKE_CONTACT) * (1 - Math.pow(1 - clamp01((t - contact) / 0.24), 2));
}

function sampleSide(
  t: number,
  plan: ExchangePlan,
  me: 'left' | 'right',
  profile: HeroDuelProfile,
  rider: RiderFrameState
): void {
  const sc = plan.script;
  const mine = sc[me];
  const theirs = sc[me === 'left' ? 'right' : 'left'];
  const resetStart = plan.duration - RESET;
  const start = 0.12;
  const arrive = sc.firstContact - 0.06;
  const cz = sc.contactZ * (me === 'left' ? 1 : -1);

  const knockAt = mine.knock > 0 ? (mine.staggerAt ?? sc.lastContact + 0.1) : undefined;
  const pushAt = theirs.staggerAt;
  const endDist = sc.contactHalf + (mine.knock > 0 ? mine.knock : pushAt !== undefined ? -0.28 : 0);

  let dist = IDLE_X;
  let z = 0;

  if (t < start) {
    // Gather: the horse sinks onto its haunches before it springs
    const p = ease(t / start);
    dist = IDLE_X + 0.1 * p;
    rider.bodyPitch = 0.07 * p;
  } else if (t < arrive) {
    const a = (t - start) / (arrive - start);
    const e = ease(a);
    dist = lerp(IDLE_X + 0.1, sc.contactHalf, e);
    z = cz * e;
    rider.gait = a < 0.88 ? 'gallop' : 'skid';
    rider.gaitSpeed = 1.2;
    rider.bodyPitch = -0.05 * Math.sin(a * Math.PI);
  } else if (t < resetStart) {
    dist = sc.contactHalf;
    z = cz;
    rider.gait = 'trot';
    if (knockAt !== undefined && t >= knockAt) {
      const k = clamp01((t - knockAt) / 0.62);
      dist = sc.contactHalf + mine.knock * (1 - Math.pow(1 - k, 2.6));
      rider.gait = k < 0.75 ? 'skid' : 'stagger';
      rider.rearAngle = Math.sin(k * Math.PI) * 0.2;
    } else if (pushAt !== undefined && t >= pushAt) {
      dist = sc.contactHalf - 0.28 * ease((t - pushAt) / 0.5);
    }
    if (sc.rear && t >= sc.rear[0] && t <= sc.rear[1]) {
      const p = (t - sc.rear[0]) / (sc.rear[1] - sc.rear[0]);
      rider.gait = 'rear';
      rider.rearAngle = Math.sin(p * Math.PI) * 0.46;
    }
  } else {
    const p = ease((t - resetStart) / RESET);
    dist = lerp(endDist, IDLE_X, p);
    z = cz * (1 - p);
    rider.gait = 'trot';
  }

  rider.x = me === 'left' ? -dist : dist;
  rider.z = z;

  if (t >= resetStart + 0.2) return;

  if (t < arrive) {
    rider.pose = 'charge_windup';
    rider.poseBlend = clamp01(t / arrive);
  }
  if (mine.guard && t >= mine.guard[0] && t <= mine.guard[1] + 0.25) {
    rider.pose = 'guard_parry';
    rider.poseBlend = (t - mine.guard[0]) / 0.3;
  }
  if (mine.duckAt !== undefined && t >= mine.duckAt - 0.24 && t <= mine.duckAt + 0.3) {
    rider.pose = 'evade_duck';
    rider.poseBlend = (t - (mine.duckAt - 0.24)) / 0.54;
  }
  const strikePose = attackPoseForWeapon(profile);
  for (const contact of mine.strikes) {
    const b = strikeBlend(t, contact);
    if (b === null) continue;
    rider.pose = strikePose;
    rider.poseBlend = b;
    rider.trailIntensity = t > contact - 0.2 && t < contact + 0.16 ? 1 : 0;
  }
  if (mine.staggerAt !== undefined && t >= mine.staggerAt) {
    rider.pose = 'stagger_hit';
    rider.poseBlend = (t - mine.staggerAt) / 0.95;
    rider.trailIntensity = 0;
  }
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
  const sc = plan.script;
  const resetStart = plan.duration - RESET;

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

  const left = baseRider(
    'left',
    plan.matchup === 'chrono_counter' ? '#38bdf8' : atkProfile.auraColor,
    fatigueOf(atkHp)
  );
  const right = baseRider('right', defProfile.auraColor, fatigueOf(defHp));
  sampleSide(t, plan, 'left', atkProfile, left);
  sampleSide(t, plan, 'right', defProfile, right);

  // ---------------------------------------------------------------- camera
  const pushIn = ease((t - 0.08) / (sc.firstContact - 0.08));
  const out = ease((t - resetStart) / RESET);
  const k = pushIn * (1 - out);
  const mid = (left.x + right.x) * 0.5;
  const bias = sc.focus === 'left' ? 1 : sc.focus === 'right' ? -1 : 0;

  const camera: CameraFrameState = {
    posX: lerp(0, mid + bias * 1.4, k),
    posY: lerp(IDLE_CAM.y, 2.4, k),
    posZ: lerp(IDLE_CAM.z, 7.5, k),
    lookX: lerp(0, mid, k),
    lookY: lerp(IDLE_CAM.lookY, 2.55, k),
    lookZ: 0.1 * k,
    fov: lerp(IDLE_CAM.fov, 37, k),
    shake: 0,
    cutId: 0,
  };

  if (sc.rear && t >= sc.rear[0] - 0.1) {
    // Drop low under the rearing horses
    const p = ease((t - (sc.rear[0] - 0.1)) / 0.35) * (1 - out);
    camera.posY -= 0.75 * p;
    camera.lookY += 0.45 * p;
    camera.posZ -= 0.5 * p;
  }

  const decisive = sc.left.staggerAt ?? sc.right.staggerAt;
  if (decisive !== undefined && t > decisive) {
    // Follow the general who was driven back
    const loser = sc.left.staggerAt !== undefined ? left : right;
    const f = ease((t - decisive) / 0.55) * (1 - out);
    camera.lookX += (loser.x * 0.5 - camera.lookX) * f * 0.7;
    camera.posX += (loser.x * 0.25 - camera.posX) * f * 0.5;
    camera.posZ += 1.0 * f;
  }

  if (sc.closeUp) {
    if (t >= sc.closeUp.start && t < sc.closeUp.end) {
      const hero = sc.closeUp.side === 'left' ? left : right;
      const toward = sc.closeUp.side === 'left' ? 1 : -1;
      const p = (t - sc.closeUp.start) / (sc.closeUp.end - sc.closeUp.start);
      camera.posX = hero.x + toward * (3.3 - p * 0.35);
      camera.posY = 1.75;
      camera.posZ = 4.3 - p * 0.35;
      camera.lookX = hero.x + toward * 0.45;
      camera.lookY = 2.2;
      camera.lookZ = 0.1;
      camera.fov = 36;
      camera.cutId = 1;
    } else if (t >= sc.closeUp.end) {
      camera.cutId = 2;
    }
  }

  const approach = clamp01((t - 0.12) / (sc.firstContact - 0.18));
  const decided = decisive !== undefined ? t >= decisive : t >= sc.lastContact;

  return {
    left,
    right,
    camera,
    timeScale,
    letterbox: sc.letterbox * (1 - out),
    chronoScanAlpha,
    bannerCheer: decided ? 0.9 : 0.3,
    radialBlur: t < sc.firstContact ? 0.02 * Math.sin(approach * Math.PI) : 0,
  };
}

/** Slow-motion finish: the victor rides forward, rears and raises the weapon; the loser reels away */
export function sampleFinaleFrame(
  t: number,
  winner: 'attacker' | 'defender' | 'draw',
  atkProfile: HeroDuelProfile,
  defProfile: HeroDuelProfile
): SampledDuelFrame {
  const n = clamp01(t / FINALE_DURATION);
  const left = baseRider('left', atkProfile.auraColor, 0.2);
  const right = baseRider('right', defProfile.auraColor, 0.2);

  const pose = (r: RiderFrameState, won: boolean, lost: boolean) => {
    const sign = r.x < 0 ? -1 : 1;
    if (won) {
      const advance = ease(n / 0.3);
      r.x = sign * lerp(IDLE_X, 1.4, advance);
      r.pose = 'victory_raise';
      r.poseBlend = clamp01((n - 0.08) / 0.3);
      if (n < 0.3) {
        r.gait = 'trot';
      } else if (n < 0.74) {
        const p = (n - 0.3) / 0.44;
        r.gait = 'rear';
        r.rearAngle = Math.sin(p * Math.PI) * 0.52;
        r.trailIntensity = p > 0.1 && p < 0.7 ? 0.55 : 0;
      }
      r.fatigue = 0;
    } else if (lost) {
      const retreat = 1 - Math.pow(1 - clamp01(n / 0.55), 2);
      r.x = sign * lerp(IDLE_X, 5.7, retreat);
      r.gait = n < 0.5 ? 'stagger' : 'idle';
      r.pose = 'defeat_slump';
      r.poseBlend = clamp01(n / 0.3);
      r.disarmed = n > 0.06;
      r.fatigue = 1;
    } else {
      r.pose = 'salute';
      r.poseBlend = Math.sin(clamp01(n / 0.8) * Math.PI) * 0.9;
    }
  };
  pose(left, winner === 'attacker', winner === 'defender');
  pose(right, winner === 'defender', winner === 'attacker');

  const p = ease(n);
  const focusX = winner === 'attacker' ? left.x : winner === 'defender' ? right.x : 0;
  const orbit = winner === 'draw' ? lerp(-0.3, 0.3, p) : lerp(-0.2, 0.85, p) * (winner === 'defender' ? -1 : 1);
  const radius = winner === 'draw' ? lerp(10.4, 9.4, p) : lerp(9.0, 6.3, p);

  const camera: CameraFrameState = {
    posX: focusX + Math.sin(orbit) * radius,
    posY: lerp(3.0, winner === 'draw' ? 2.8 : 1.85, p),
    posZ: Math.cos(orbit) * radius,
    lookX: focusX,
    lookY: lerp(2.3, 2.85, p),
    lookZ: 0,
    fov: lerp(34, 32, p),
    shake: 0,
    cutId: 0,
  };

  return {
    left,
    right,
    camera,
    timeScale: n < 0.22 ? 0.45 : 1,
    letterbox: 0.9,
    chronoScanAlpha: 0,
    bannerCheer: 1.0,
    radialBlur: 0,
  };
}
