import * as THREE from 'three';
import type { General } from '../../game/types.js';
import type { HeroDuelProfile } from '../../game/heroDuelProfiles.js';
import { HORSE_COAT_PALETTES } from '../../game/heroDuelProfiles.js';
import type { RiderActionPose, RiderFrameState } from './duelTypes.js';
import type { DisposeBag } from './duelGeometry3D.js';
import { mergeRigid } from './duelGeometry3D.js';
import type { RiderArm, RiderParts } from './duelRider3D.js';
import { ARM_FORE, ARM_UPPER, buildRider3D } from './duelRider3D.js';
import type { HorseMaterials } from './duelHorse3D.js';
import {
  bakeCoatShading,
  buildHorseBody3D,
  buildHorseHead3D,
  buildHorseLeg3D,
  buildHorseNeck3D,
  buildHorseTail3D,
} from './duelHorse3D.js';
import {
  createCaparisonTexture,
  createCloakTexture,
  createHairCardTexture,
  createHeroFaceTexture,
  createHorseCoatTextures,
  createLamellarArmorTextures,
} from './duelTextures3D.js';
import type { WeaponStyle } from './duelWeapons3D.js';
import { buildSignatureWeapon3D, weaponStyleOf } from './duelWeapons3D.js';

// ----------------------------------------------------------------------------------------------
// Skeleton constants. Horse space: +X forward, +Y up, +Z the rider's right. Ground is Y = 0.
// ----------------------------------------------------------------------------------------------
const HIP = { x: -0.62, y: 1.25 };
const FRONT_JOINT = { x: 0.66, y: 1.14 };
const HIND_JOINT = { x: -0.5, y: 1.15 };
const FRONT_L1 = 0.56;
const FRONT_L2 = 0.6;
const HIND_L1 = 0.6;
const HIND_L2 = 0.62;
const FRONT_REST_X = 0.66;
const HIND_REST_X = -0.76;
const NECK_BASE = { x: 0.78, y: 1.5 };
const HEAD_REST = -0.88;
const SEAT = { x: -0.02, y: 1.79 };
export const RIDER_SCALE = 1.1;
const SHOULDER = new THREE.Vector3(0, 0.6, 0.29);

interface HorseLeg {
  upper: THREE.Group;
  lower: THREE.Group;
  pastern: THREE.Group;
  hoofAnchor: THREE.Object3D;
  front: boolean;
  jx: number;
  jy: number;
  l1: number;
  l2: number;
  restX: number;
  gallopOffset: number;
  trotOffset: number;
  tx: number;
  ty: number;
  wasStance: boolean;
}

interface PoseTarget {
  h: [number, number, number];
  d: [number, number, number];
  lean: number;
  twist: number;
  /** Second-hand position along the shaft, or null when the off hand keeps the reins */
  grip: number | null;
  /** 0 = edge turns in the vertical plane (chops), 1 = in the horizontal plane (sweeps) */
  horiz: number;
  nod: number;
}

export interface MountedGeneralRig3D {
  root: THREE.Group;
  pitchPivot: THREE.Group;
  body: THREE.Group;
  neck: THREE.Group;
  headGroup: THREE.Group;
  legs: HorseLeg[];
  tail: THREE.Group[];
  mane: THREE.Group[];
  riderRoot: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  plumes: THREE.Group[][];
  cape: RiderParts['cape'] | null;
  armR: RiderArm;
  armL: RiderArm;
  weapon: THREE.Group;
  offWeapon: THREE.Group | null;
  trailBase: THREE.Object3D;
  trailTip: THREE.Object3D;
  /** Rider's chest, used to aim impact effects */
  chest: THREE.Object3D;
  /** Bridle bit anchors on left/right of the horse's mouth + dynamic 3D leather reins */
  bitAnchors: [THREE.Object3D, THREE.Object3D];
  reins: [THREE.BufferGeometry, THREE.BufferGeometry];
  style: WeaponStyle;
  profile: HeroDuelProfile;
  flashMats: Array<{ mat: THREE.MeshStandardMaterial; base: THREE.Color; baseIntensity: number }>;
  flashLevel: number;
  sim: {
    ready: boolean;
    px: number;
    pz: number;
    prevYaw: number;
    speed: number;
    phase: number;
    bounce: number;
    pitch: number;
    roll: number;
    neckRot: number;
    headRot: number;
    hand: THREE.Vector3;
    dir: THREE.Vector3;
    lean: number;
    twist: number;
    nod: number;
    grip: number;
    gripOn: number;
    horiz: number;
    capeLift: number;
  };
}


/** Builds a warhorse and its general as one articulated rig. */
export function buildMountedGeneralRig3D(
  hero: General,
  profile: HeroDuelProfile,
  bag: DisposeBag
): MountedGeneralRig3D {
  const root = new THREE.Group();
  const coatPal = HORSE_COAT_PALETTES[profile.horseCoat];
  const horseTex = createHorseCoatTextures(profile.horseCoat, bag);
  const armorTex = createLamellarArmorTextures(profile.armorPrimary, profile.armorTrim, bag);
  const caparisonTex = createCaparisonTexture(profile.bardingColor, profile.armorTrim, bag);

  const std = (params: THREE.MeshStandardMaterialParameters) =>
    bag.add(new THREE.MeshStandardMaterial(params));

  // The coat is groomed hair, not lacquer: a broad soft sheen instead of a mirror highlight
  // The coat is groomed hair, matte with a broad soft sheen; its light and shade are painted into
  // the vertex colours (bakeCoatShading)
  const coatMat = std({
    map: horseTex.map,
    bumpMap: horseTex.bumpMap,
    bumpScale: 0.35,
    roughness: 0.78,
    metalness: 0,
    envMapIntensity: 0.45,
    vertexColors: true,
  });
  const maneMat = std({ color: coatPal.mane, roughness: 0.82 });
  // Mane, tail and feathering: strand cards cut out by an alpha test, so shadows follow the strands
  const horseHairMat = std({ color: coatPal.mane, map: createHairCardTexture(bag), alphaTest: 0.45, roughness: 0.8 });
  const hoofMat = std({ color: coatPal.hoof, roughness: 0.35, metalness: 0.2 });
  const eyeMat = std({ color: '#0d0907', roughness: 0.1, metalness: 0, envMapIntensity: 1.4 });
  const bardingMat = std({ map: caparisonTex, roughness: 0.62, metalness: 0.12, side: THREE.DoubleSide });
  const leatherMat = std({ color: '#3b1f14', roughness: 0.55, metalness: 0.1 });
  // Lacquered lamellar: coloured plates with a soft gloss, so the rows read instead of glittering
  const armorMat = std({ map: armorTex.map, bumpMap: armorTex.bumpMap, bumpScale: 1.1, roughness: 0.44, metalness: 0.42, envMapIntensity: 0.9 });
  const trimMat = std({ color: profile.armorTrim, roughness: 0.26, metalness: 1 });
  const capeMat = std({ map: createCloakTexture(profile.capeColor, profile.armorTrim, bag), roughness: 0.74, side: THREE.DoubleSide });
  const robeColor = new THREE.Color(profile.isScholarRobe ? profile.armorPrimary : profile.capeColor);
  if (!profile.isScholarRobe) robeColor.multiplyScalar(0.78);
  const robeMat = std({ color: robeColor, roughness: 0.78 });
  const skinColor =
    hero.id === 'guanyu'
      ? '#b84c3e'
      : profile.isHeroine
        ? '#ecc3a8'
        : hero.id === 'zhangfei' || hero.id === 'menghuo' || hero.id === 'yanbaihu'
          ? '#be825c'
          : profile.isScholarRobe
            ? '#e2b290'
            : '#d69e78';
  const skinMat = std({ color: skinColor, roughness: 0.62 });
  const faceMat = std({ map: createHeroFaceTexture(hero, profile, bag), roughness: 0.6, metalness: 0 });
  const reinMat = std({ color: '#381d12', roughness: 0.58, side: THREE.DoubleSide });
  const hairMat = std({
    color:
      hero.id === 'huangzhong' || hero.id === 'yanyan' || hero.id === 'huatuo'
        ? '#d8dee6'
        : hero.id === 'caozhang'
          ? '#c78824'
          : '#15131a',
    roughness: 0.85,
  });
  const darkMat = std({ color: '#0b0b0e', roughness: 0.25, metalness: 0.3 });
  const tasselMat = std({ color: profile.tasselColor, roughness: 0.7, emissive: profile.tasselColor, emissiveIntensity: 0.22 });

  // Plain materials are baked into two shared vertex-coloured palettes when the rig is merged.
  // The metal palette is gilt bronze, burnished but not a mirror.
  const matte = std({ vertexColors: true, roughness: 0.7, metalness: 0 });
  const metal = std({ vertexColors: true, roughness: 0.36, metalness: 0.92, envMapIntensity: 1.05 });
  const clothMat = std({ color: profile.capeColor });
  for (const m of [maneMat, hoofMat, leatherMat, robeMat, skinMat, hairMat, darkMat, tasselMat, clothMat]) {
    m.userData.palette = 'matte';
  }
  trimMat.userData.palette = 'metal';

  // Restrict impact hit-flash to armour & metallic trim so horse coats never wash out pink
  const flashMats = [armorMat, metal].map((mat) => ({
    mat,
    base: mat.emissive.clone(),
    baseIntensity: mat.emissiveIntensity,
  }));

  // ---------------------------------------------------------------- horse
  const pitchPivot = new THREE.Group();
  pitchPivot.position.set(HIP.x, HIP.y, 0);
  root.add(pitchPivot);
  const body = new THREE.Group();
  body.position.set(-HIP.x, -HIP.y, 0);
  pitchPivot.add(body);
  const horse: HorseMaterials = {
    coat: coatMat,
    hair: horseHairMat,
    crest: maneMat,
    hoof: hoofMat,
    barding: bardingMat,
    leather: leatherMat,
    trim: trimMat,
    tassel: tasselMat,
    dark: darkMat,
    eye: eyeMat,
  };
  buildHorseBody3D(bag, body, horse);

  const neck = new THREE.Group();
  neck.position.set(NECK_BASE.x, NECK_BASE.y, 0);
  body.add(neck);
  const mane = buildHorseNeck3D(bag, neck, horse);

  const headGroup = new THREE.Group();
  headGroup.position.set(0.47, 0.9, 0);
  headGroup.rotation.z = HEAD_REST;
  headGroup.scale.setScalar(1.1);
  neck.add(headGroup);
  // The muzzle and lower legs shade toward the darker points colour
  const pointsTint = new THREE.Color(coatPal.mane);
  const bodyTint = new THREE.Color(coatPal.body);
  pointsTint.setRGB(
    Math.min(1, pointsTint.r / Math.max(0.01, bodyTint.r)),
    Math.min(1, pointsTint.g / Math.max(0.01, bodyTint.g)),
    Math.min(1, pointsTint.b / Math.max(0.01, bodyTint.b))
  );
  const bitAnchors = buildHorseHead3D(bag, headGroup, horse, pointsTint, HEAD_REST);
  const tail = buildHorseTail3D(bag, body, horse);

  const legs: HorseLeg[] = [];
  const legSpecs: Array<{ front: boolean; side: number; gallop: number; trot: number }> = [
    { front: true, side: -1, gallop: 0.5, trot: 0 },
    { front: true, side: 1, gallop: 0.4, trot: 0.5 },
    { front: false, side: -1, gallop: 0.09, trot: 0.5 },
    { front: false, side: 1, gallop: 0, trot: 0 },
  ];
  for (const spec of legSpecs) {
    const l1 = spec.front ? FRONT_L1 : HIND_L1;
    const l2 = spec.front ? FRONT_L2 : HIND_L2;
    const built = buildHorseLeg3D(bag, spec.front, l1, l2, horse);
    const joint = spec.front ? FRONT_JOINT : HIND_JOINT;
    built.upper.position.set(joint.x, joint.y, spec.side * (spec.front ? 0.2 : 0.22));
    body.add(built.upper);
    const restX = spec.front ? FRONT_REST_X : HIND_REST_X;
    legs.push({
      ...built,
      front: spec.front,
      jx: joint.x,
      jy: joint.y,
      l1,
      l2,
      restX,
      gallopOffset: spec.gallop,
      trotOffset: spec.trot,
      tx: restX,
      ty: 0,
      wasStance: true,
    });
  }
  bakeCoatShading(root, coatMat, pointsTint);

  // ---------------------------------------------------------------- rider
  const rider = buildRider3D(hero, profile, bag, {
    armor: armorMat,
    trim: trimMat,
    leather: leatherMat,
    robe: robeMat,
    cloth: clothMat,
    cape: capeMat,
    skin: skinMat,
    face: faceMat,
    hair: hairMat,
    dark: darkMat,
    tassel: tasselMat,
    rein: reinMat,
  });
  const { riderRoot, torso, head, plumes, armR, armL, chest, reins } = rider;
  riderRoot.position.set(SEAT.x, SEAT.y, 0);
  riderRoot.scale.setScalar(RIDER_SCALE);
  body.add(riderRoot);

  const built = buildSignatureWeapon3D(profile, bag);
  const weapon = new THREE.Group();
  weapon.add(built.group);
  riderRoot.add(weapon);

  let offWeapon: THREE.Group | null = null;
  if (profile.weaponVariant === 'twin_swords' || profile.weaponVariant === 'twin_ji') {
    const off = buildSignatureWeapon3D(
      profile,
      bag,
      profile.weaponVariant === 'twin_ji' ? 'tiger_saber' : 'imperial_jian'
    );
    offWeapon = new THREE.Group();
    off.group.scale.multiplyScalar(0.9);
    offWeapon.add(off.group);
    riderRoot.add(offWeapon);
  }

  mergeRigid(root, { matte, metal }, bag);

  return {
    root,
    pitchPivot,
    body,
    neck,
    headGroup,
    legs,
    tail,
    mane,
    riderRoot,
    torso,
    head,
    plumes,
    cape: rider.cape,
    armR,
    armL,
    weapon,
    offWeapon,
    trailBase: built.trailBase,
    trailTip: built.trailTip,
    chest,
    bitAnchors,
    reins,
    style: weaponStyleOf(profile),
    profile,
    flashMats,
    flashLevel: 0,
    sim: {
      ready: false,
      px: 0,
      pz: 0,
      prevYaw: 0,
      speed: 0,
      phase: 0,
      bounce: 0,
      pitch: 0,
      roll: 0,
      neckRot: 0,
      headRot: HEAD_REST,
      hand: new THREE.Vector3(0.2, 0.35, 0.3),
      dir: new THREE.Vector3(0.5, 0.85, 0),
      lean: 0,
      twist: 0,
      nod: 0,
      grip: 0.45,
      gripOn: 0,
      horiz: 0,
      capeLift: 0.1,
    },
  };
}

// ----------------------------------------------------------------------------------------------
// Rider pose library. Positions are in rider space (seat = origin, +X forward, +Z weapon side).
// ----------------------------------------------------------------------------------------------
const P = (
  h: [number, number, number],
  d: [number, number, number],
  lean: number,
  twist: number,
  grip: number | null = null,
  horiz = 0,
  nod = 0
): PoseTarget => ({ h, d, lean, twist, grip, horiz, nod });

const READY: Record<WeaponStyle, PoseTarget> = {
  pole: P([0.16, 0.3, 0.3], [0.6, 0.76, -0.22], -0.04, -0.3, 0.48),
  spear: P([0.08, 0.34, 0.31], [0.92, 0.38, -0.1], -0.06, -0.3, 0.42),
  short: P([0.3, 0.4, 0.34], [0.42, 0.9, 0.08], -0.03, -0.1),
};

const WINDUP: Record<WeaponStyle, PoseTarget> = {
  pole: P([-0.02, 0.56, 0.38], [-0.55, 0.78, 0.3], -0.3, 0.25),
  spear: P([-0.12, 0.42, 0.34], [0.97, 0.2, -0.06], -0.32, 0.22, 0.4),
  short: P([-0.04, 0.72, 0.4], [-0.42, 0.86, 0.28], -0.28, 0.2),
};

const GUARD: Record<WeaponStyle, PoseTarget> = {
  pole: P([0.38, 0.42, 0.22], [0.25, 0.9, -0.36], 0.08, -0.22, 0.5),
  spear: P([0.38, 0.42, 0.22], [0.3, 0.88, -0.36], 0.08, -0.22, 0.5),
  short: P([0.44, 0.62, 0.26], [0.12, 0.94, -0.32], 0.06, -0.15),
};

const OVERHEAD: PoseTarget[] = [
  P([0.0, 0.64, 0.36], [-0.4, 0.88, 0.25], -0.1, 0.2),
  P([-0.14, 1.0, 0.3], [-0.78, 0.55, 0.3], 0.16, 0.42),
  P([0.54, 0.62, 0.27], [0.985, -0.06, -0.14], -0.38, -0.45),
  P([0.46, 0.3, 0.3], [0.8, -0.56, -0.22], -0.5, -0.56),
];

const SWEEP: PoseTarget[] = [
  P([0.0, 0.6, 0.42], [-0.2, 0.6, 0.77], -0.08, 0.3, null, 1),
  P([-0.2, 0.64, 0.5], [-0.72, 0.26, 0.64], 0.06, 0.58, null, 1),
  P([0.52, 0.62, 0.22], [0.99, 0.04, 0.1], -0.32, -0.42, null, 1),
  P([0.36, 0.56, -0.1], [0.56, -0.1, -0.82], -0.38, -0.78, null, 1),
];

const THRUST: PoseTarget[] = [
  P([0.0, 0.42, 0.33], [0.95, 0.3, -0.06], -0.1, 0.1, 0.4),
  P([-0.22, 0.5, 0.36], [0.985, 0.16, -0.05], -0.08, 0.46, 0.4),
  P([0.6, 0.58, 0.26], [0.997, -0.03, -0.07], -0.44, -0.5),
  P([0.5, 0.52, 0.28], [0.99, 0.0, -0.08], -0.34, -0.4),
];

const SALUTE = P([0.16, 0.92, 0.3], [0.16, 0.98, -0.04], 0.08, -0.05);
const DUCK = P([0.2, 0.16, 0.42], [-0.72, 0.22, 0.66], -0.8, -0.3, null, 1, 0.3);
const STAGGER = P([-0.18, 0.74, 0.5], [-0.5, 0.78, 0.38], 0.52, 0.48, null, 0, -0.3);
const VICTORY = P([0.08, 1.02, 0.3], [0.06, 1, 0.02], 0.1, -0.12);
const SLUMP = P([0.28, 0.12, 0.36], [0.5, -0.85, 0.15], -0.55, 0.1, null, 0, 0.5);

function ease(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function mixPose(a: PoseTarget, b: PoseTarget, t: number): PoseTarget {
  const k = Math.max(0, Math.min(1, t));
  const l = (x: number, y: number) => x + (y - x) * k;
  return {
    h: [l(a.h[0], b.h[0]), l(a.h[1], b.h[1]), l(a.h[2], b.h[2])],
    d: [l(a.d[0], b.d[0]), l(a.d[1], b.d[1]), l(a.d[2], b.d[2])],
    lean: l(a.lean, b.lean),
    twist: l(a.twist, b.twist),
    grip: k < 0.5 ? a.grip : b.grip,
    horiz: l(a.horiz, b.horiz),
    nod: l(a.nod, b.nod),
  };
}

/** Strike blend convention: 0 → 0.38 wind-up, 0.38 → 0.7 the cut, 0.7 = contact, then follow-through. */
export const STRIKE_CONTACT = 0.7;

function sampleStrike(keys: PoseTarget[], t: number): PoseTarget {
  if (t <= 0.38) return mixPose(keys[0], keys[1], ease(t / 0.38));
  if (t <= STRIKE_CONTACT) return mixPose(keys[1], keys[2], (t - 0.38) / (STRIKE_CONTACT - 0.38));
  return mixPose(keys[2], keys[3], ease((t - STRIKE_CONTACT) / (1 - STRIKE_CONTACT)));
}

function resolvePose(
  style: WeaponStyle,
  pose: RiderActionPose,
  t: number,
  time: number,
  fatigue: number
): PoseTarget {
  const ready = READY[style];
  switch (pose) {
    case 'salute':
      return mixPose(ready, SALUTE, ease(t));
    case 'charge_windup':
      return mixPose(ready, WINDUP[style], ease(t));
    case 'slash_overhead':
      return sampleStrike(OVERHEAD, t);
    case 'slash_sweep':
      return sampleStrike(SWEEP, t);
    case 'thrust':
      return sampleStrike(THRUST, t);
    case 'guard_parry':
      return mixPose(ready, GUARD[style], ease(t * 2.2));
    case 'evade_duck':
      return mixPose(ready, DUCK, Math.sin(Math.min(1, t) * Math.PI));
    case 'stagger_hit': {
      const env = t < 0.22 ? ease(t / 0.22) : 1 - 0.5 * ease((t - 0.22) / 0.78);
      return mixPose(ready, STAGGER, env);
    }
    case 'victory_raise': {
      const p = mixPose(ready, VICTORY, ease(t * 1.6));
      p.h[1] += Math.sin(time * 6.5) * 0.05;
      return p;
    }
    case 'defeat_slump':
      return mixPose(ready, SLUMP, ease(t * 1.4));
    default: {
      const breathe = Math.sin(time * (2.4 + fatigue * 2.4));
      const p = mixPose(ready, ready, 0);
      p.h[1] += breathe * 0.012 - fatigue * 0.1;
      p.lean += breathe * 0.02 - fatigue * 0.2;
      p.nod = fatigue * 0.25;
      return p;
    }
  }
}

// ----------------------------------------------------------------------------------------------
// Per-frame rig evaluation
// ----------------------------------------------------------------------------------------------
function solveLeg(dx: number, dy: number, l1: number, l2: number, kneeForward: boolean): [number, number] {
  const maxD = (l1 + l2) * 0.998;
  const minD = Math.abs(l1 - l2) + 0.06;
  const d = Math.max(minD, Math.min(maxD, Math.hypot(dx, dy)));
  const phi = Math.atan2(dx, -dy);
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const b = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
  return kneeForward ? [phi + a, -(Math.PI - b)] : [phi - a, Math.PI - b];
}

function frac(v: number): number {
  return v - Math.floor(v);
}

const DOWN = new THREE.Vector3(0, -1, 0);
const vS = new THREE.Vector3();
const vH = new THREE.Vector3();
const vE = new THREE.Vector3();
const vDir = new THREE.Vector3();
const vPole = new THREE.Vector3();
const vTmp = new THREE.Vector3();
const vRein = new THREE.Vector3();
const vX = new THREE.Vector3();
const vZ = new THREE.Vector3();
const mBasis = new THREE.Matrix4();

const qHand = new THREE.Quaternion();
const vGrip = new THREE.Vector3();
const vWrist = new THREE.Vector3();
const vBack = new THREE.Vector3();
const vAxis = new THREE.Vector3();
const REIN_AXIS = new THREE.Vector3(0.35, 0.94, 0).normalize();

/** Turns the fist so the shaft (or rein) direction `axis`, given in rider space, runs through it. */
function orientHand(arm: RiderArm, axis: THREE.Vector3): void {
  qHand.copy(arm.fore.quaternion).invert();
  vGrip.copy(axis.lengthSq() > 1e-6 ? axis : REIN_AXIS).applyQuaternion(qHand).normalize();
  // The wrist sits toward the elbow, square to the shaft
  vWrist.set(0, 1, 0).addScaledVector(vGrip, -vGrip.y);
  if (vWrist.lengthSq() < 1e-4) vWrist.set(1, 0, 0).addScaledVector(vGrip, -vGrip.x);
  vWrist.normalize();
  vBack.crossVectors(vWrist, vGrip);
  mBasis.makeBasis(vBack, vWrist, vGrip);
  arm.hand.quaternion.setFromRotationMatrix(mBasis);
}

function solveArm(
  arm: RiderArm,
  shoulder: THREE.Vector3,
  hand: THREE.Vector3,
  poleX: number,
  poleY: number,
  poleZ: number
): void {
  vDir.subVectors(hand, shoulder);
  let d = vDir.length();
  const maxD = (ARM_UPPER + ARM_FORE) * 0.985;
  if (d > maxD) {
    vDir.multiplyScalar(maxD / d);
    d = maxD;
    hand.copy(shoulder).add(vDir);
  }
  d = Math.max(0.12, d);
  vDir.normalize();
  const cosA = Math.max(-1, Math.min(1, (ARM_UPPER * ARM_UPPER + d * d - ARM_FORE * ARM_FORE) / (2 * ARM_UPPER * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  vPole.set(poleX, poleY, poleZ);
  vPole.addScaledVector(vDir, -vPole.dot(vDir));
  if (vPole.lengthSq() < 1e-5) vPole.set(0, -1, 0);
  vPole.normalize();
  vE.copy(shoulder).addScaledVector(vDir, ARM_UPPER * cosA).addScaledVector(vPole, ARM_UPPER * sinA);

  arm.upper.position.copy(shoulder);
  arm.upper.quaternion.setFromUnitVectors(DOWN, vTmp.subVectors(vE, shoulder).normalize());
  arm.fore.position.copy(vE);
  arm.fore.quaternion.setFromUnitVectors(DOWN, vTmp.subVectors(hand, vE).normalize());
}

function orientWeapon(group: THREE.Group, pos: THREE.Vector3, dir: THREE.Vector3, horiz: number): void {
  // Edge leads the cut: in the vertical plane for chops, in the horizontal plane for sweeps.
  vX.set(
    dir.y * (1 - horiz) + dir.z * horiz,
    -dir.x * (1 - horiz),
    -dir.x * horiz
  );
  vX.addScaledVector(dir, -vX.dot(dir));
  if (vX.lengthSq() < 1e-5) vX.set(0, 0, 1).addScaledVector(dir, -dir.z);
  vX.normalize();
  vZ.crossVectors(vX, dir);
  mBasis.makeBasis(vX, dir, vZ);
  group.quaternion.setFromRotationMatrix(mBasis);
  group.position.copy(pos);
}

function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Poses the whole rig for one frame. Returns the world positions where hooves struck the ground. */
export function applyRigPose3D(
  rig: MountedGeneralRig3D,
  frame: RiderFrameState,
  dt: number,
  elapsedSec: number
): THREE.Vector3[] {
  const hoofContacts: THREE.Vector3[] = [];
  const s = rig.sim;
  const first = !s.ready;
  if (first) {
    s.ready = true;
    s.px = frame.x;
    s.pz = frame.z;
    s.prevYaw = frame.yaw;
  }

  rig.root.position.set(frame.x, 0, frame.z);
  rig.root.rotation.y = frame.yaw;

  // Signed ground speed along the horse's own heading + yaw-rate banking into turns
  const fwdX = Math.cos(frame.yaw);
  const fwdZ = -Math.sin(frame.yaw);
  let yawRate = 0;
  if (dt > 0.002) {
    const v = ((frame.x - s.px) * fwdX + (frame.z - s.pz) * fwdZ) / dt;
    s.speed = damp(s.speed, Math.max(-12, Math.min(12, v)), 14, dt);
    let dyaw = frame.yaw - s.prevYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    yawRate = dyaw / dt;
    s.px = frame.x;
    s.pz = frame.z;
    s.prevYaw = frame.yaw;
  }
  const absSpeed = Math.abs(s.speed);

  // ------------------------------------------------------------ gait
  const gait = frame.gait;
  let freq = 0;
  let duty = 0.5;
  let travel = 0;
  let liftFront = 0;
  let liftHind = 0;
  let bounceT = Math.sin(elapsedSec * 1.8) * 0.006;
  let pitchT = 0;
  let rollT = 0;
  let neckT = Math.sin(elapsedSec * 1.1) * 0.03;
  let headT = HEAD_REST + Math.sin(elapsedSec * 1.5 + 1) * 0.04;
  let frontBias = 0;
  let hindBias = 0;

  if (gait === 'gallop') {
    freq = Math.max(1.75, absSpeed / 2.6) * frame.gaitSpeed;
    duty = 0.32;
    travel = Math.max(0.95, (absSpeed * duty) / freq);
    liftFront = 0.44;
    liftHind = 0.34;
    const w = s.phase * Math.PI * 2;
    bounceT = Math.sin(w + 1.2) * 0.075;
    pitchT = Math.sin(w + 2.9) * 0.07 - 0.02;
    neckT = -0.34 + Math.sin(w + 3.6) * 0.1;
    headT = -0.5 + Math.sin(w + 3.2) * 0.07;
    frontBias = 0.14;
    hindBias = 0.18;
  } else if (gait === 'trot') {
    freq = Math.max(1.5, absSpeed / 1.1) * frame.gaitSpeed;
    duty = 0.5;
    travel = Math.max(0.34, (absSpeed * duty) / freq);
    liftFront = 0.24;
    liftHind = 0.16;
    const w = s.phase * Math.PI * 4;
    bounceT = Math.sin(w) * 0.035;
    neckT = -0.08 + Math.sin(w + 1) * 0.035;
    headT = HEAD_REST + 0.06;
  } else if (gait === 'stagger') {
    freq = 2.6;
    duty = 0.5;
    travel = 0.24;
    liftFront = 0.16;
    liftHind = 0.1;
    bounceT = Math.sin(elapsedSec * 15) * 0.025;
    rollT = Math.sin(elapsedSec * 9.5) * 0.07;
    neckT = 0.16 + Math.sin(elapsedSec * 11) * 0.1;
    headT = HEAD_REST + 0.3 + Math.sin(elapsedSec * 13) * 0.12;
  } else if (gait === 'skid') {
    bounceT = -0.09;
    pitchT = 0.1;
    neckT = 0.3;
    headT = HEAD_REST + 0.28;
    frontBias = 0.34;
    hindBias = 0.3;
  } else if (gait === 'rear') {
    neckT = 0.22 + Math.sin(elapsedSec * 7) * 0.05;
    headT = HEAD_REST - 0.28;
    hindBias = 0.12;
  }

  const direction = s.speed < -0.2 ? -1 : 1;
  s.phase += dt * freq * direction;
  rollT += Math.max(-0.22, Math.min(0.22, -yawRate * 0.065 * Math.min(1, absSpeed / 2.2)));

  const pitchTarget = frame.rearAngle + frame.bodyPitch + pitchT;
  const quick = first ? 1e6 : 1;
  s.bounce = damp(s.bounce, bounceT, 22 * quick, dt);
  s.pitch = damp(s.pitch, pitchTarget, 20 * quick, dt);
  s.roll = damp(s.roll, rollT, 12 * quick, dt);
  s.neckRot = damp(s.neckRot, neckT, 12 * quick, dt);
  s.headRot = damp(s.headRot, headT, 12 * quick, dt);

  rig.pitchPivot.position.y = HIP.y + s.bounce;
  rig.pitchPivot.rotation.z = s.pitch;
  rig.pitchPivot.rotation.x = s.roll;
  rig.neck.rotation.z = s.neckRot - s.pitch * 0.35;
  rig.headGroup.rotation.z = s.headRot;

  // ------------------------------------------------------------ legs (two-bone IK onto the ground)
  const cosP = Math.cos(s.pitch);
  const sinP = Math.sin(s.pitch);
  const airborne = ease((s.pitch - 0.1) / 0.22);
  const moving = freq > 0;
  const legRate = (moving ? 46 : 13) * quick;

  for (const leg of rig.legs) {
    let tx = leg.restX + (leg.front ? frontBias : hindBias);
    let ty = 0;
    let swing = -1;

    if (moving) {
      const u = frac(s.phase + (gait === 'gallop' ? leg.gallopOffset : leg.trotOffset));
      if (u < duty) {
        tx += travel * (0.5 - u / duty);
        if (!leg.wasStance && gait !== 'stagger') {
          rig.body.updateWorldMatrix(true, false);
          hoofContacts.push(leg.hoofAnchor.getWorldPosition(new THREE.Vector3()).setY(0.05));
        }
        leg.wasStance = true;
      } else {
        swing = (u - duty) / (1 - duty);
        tx += travel * (-0.5 + ease(swing));
        ty = (leg.front ? liftFront : liftHind) * Math.sin(swing * Math.PI);
        leg.wasStance = false;
      }
    } else if (gait === 'idle' && leg.front && leg.gallopOffset > 0.45) {
      // The near foreleg paws the ground now and then
      const paw = Math.max(0, Math.sin(elapsedSec * 1.3) - 0.72) * 3.4;
      tx += paw * 0.16;
      ty = paw * 0.2;
      swing = paw > 0.02 ? 0.5 : -1;
    }

    leg.tx = damp(leg.tx, tx, legRate, dt);
    leg.ty = damp(leg.ty, ty, legRate, dt);

    // Root-space target → body-local (the body pitches and bounces about the hip pivot)
    const dx = leg.tx - HIP.x;
    const dy = leg.ty - (HIP.y + s.bounce);
    let lx = dx * cosP + dy * sinP + HIP.x;
    let ly = -dx * sinP + dy * cosP + HIP.y;

    if (leg.front && airborne > 0) {
      // Rearing: forelegs tuck and strike at the air
      const w = elapsedSec * 11 + leg.gallopOffset * 14;
      const ax = leg.jx + 0.44 + Math.sin(w) * 0.12;
      const ay = leg.jy - 0.5 + Math.cos(w) * 0.12;
      lx += (ax - lx) * airborne;
      ly += (ay - ly) * airborne;
      swing = 0.5;
    }

    const [upperRot, lowerRot] = solveLeg(lx - leg.jx, ly - leg.jy, leg.l1, leg.l2, leg.front);
    leg.upper.rotation.z = upperRot;
    leg.lower.rotation.z = lowerRot;
    const flat = -(upperRot + lowerRot + s.pitch);
    leg.pastern.rotation.z = swing >= 0 ? flat * 0.4 - Math.sin(swing * Math.PI) * 0.9 : flat;
  }

  if (gait === 'skid' && absSpeed > 0.6 && Math.random() < dt * 26) {
    rig.body.updateWorldMatrix(true, false);
    const leg = rig.legs[Math.random() < 0.5 ? 0 : 1];
    hoofContacts.push(leg.hoofAnchor.getWorldPosition(new THREE.Vector3()).setY(0.05));
  }

  // ------------------------------------------------------------ mane & tail
  const wind = Math.min(1, absSpeed / 6);
  rig.tail.forEach((seg, i) => {
    const base = i === 0 ? -0.72 - wind * 0.75 : 0.2 - wind * 0.16;
    seg.rotation.z = base + Math.sin(elapsedSec * (4 + wind * 5) - i * 0.9) * (0.05 + wind * 0.09);
    seg.rotation.x = Math.sin(elapsedSec * 2.3 - i * 0.7) * 0.06 * (i + 1) * 0.4;
  });
  rig.mane.forEach((lock, i) => {
    lock.rotation.z = -wind * 0.75 + Math.sin(elapsedSec * (5 + wind * 6) - i * 0.7) * (0.04 + wind * 0.12);
  });

  // ------------------------------------------------------------ rider
  rig.riderRoot.position.y = SEAT.y - s.bounce * 0.25 + Math.abs(s.bounce) * 0.2;
  rig.riderRoot.rotation.z = -s.pitch * 0.62;

  const target = resolvePose(rig.style, frame.pose, frame.poseBlend, elapsedSec, frame.fatigue);
  const striking =
    (frame.pose === 'slash_overhead' || frame.pose === 'slash_sweep' || frame.pose === 'thrust') &&
    frame.poseBlend > 0.36 &&
    frame.poseBlend < 0.78;
  const handRate = (striking ? 85 : 20) * quick;
  const bodyRate = (striking ? 40 : 12) * quick;
  const k = 1 - Math.exp(-handRate * dt);
  s.hand.x += (target.h[0] - s.hand.x) * k;
  s.hand.y += (target.h[1] - s.hand.y) * k;
  s.hand.z += (target.h[2] - s.hand.z) * k;
  vTmp.set(target.d[0], target.d[1], target.d[2]).normalize();
  s.dir.lerp(vTmp, k);
  if (s.dir.lengthSq() < 1e-4) s.dir.copy(vTmp);
  s.dir.normalize();
  s.lean = damp(s.lean, target.lean - Math.min(0.14, absSpeed * 0.02), bodyRate, dt);
  s.twist = damp(s.twist, target.twist, bodyRate, dt);
  s.nod = damp(s.nod, target.nod, bodyRate, dt);
  s.horiz = damp(s.horiz, target.horiz, handRate, dt);
  s.gripOn = damp(s.gripOn, target.grip !== null ? 1 : 0, 14 * quick, dt);
  if (target.grip !== null) s.grip = target.grip;

  rig.torso.rotation.set(Math.sin(elapsedSec * 1.3) * 0.015, s.twist, s.lean);
  rig.head.rotation.set(0, -s.twist * 0.6, -s.lean * 0.5 - s.nod);

  // Weapon arm
  vS.copy(SHOULDER).applyEuler(rig.torso.rotation).add(rig.torso.position);
  vH.copy(s.hand);
  solveArm(rig.armR, vS, vH, -0.35, -0.75, 0.6);
  orientWeapon(rig.weapon, vH, s.dir, s.horiz);
  orientHand(rig.armR, s.dir);
  rig.weapon.visible = !frame.disarmed;

  // Off hand: second grip on a polearm, a mirrored blade for twin weapons, otherwise the reins
  vS.copy(SHOULDER);
  vS.z = -vS.z;
  vS.applyEuler(rig.torso.rotation).add(rig.torso.position);
  const reinPommel = vRein.set(0.3, 0.24 + s.bounce * 0.35, -0.03);
  if (rig.offWeapon) {
    vH.set(s.hand.x * 0.92, s.hand.y * 0.94, -s.hand.z);
    solveArm(rig.armL, vS, vH, -0.35, -0.75, -0.6);
    vDir.set(s.dir.x, s.dir.y, -s.dir.z);
    orientWeapon(rig.offWeapon, vH, vDir, s.horiz);
    orientHand(rig.armL, vDir);
    rig.offWeapon.visible = !frame.disarmed;
  } else {
    const rein = vTmp.set(0.3, 0.26 + s.bounce * 0.4, -0.05);
    const onShaft = frame.disarmed ? 0 : s.gripOn;
    vH.copy(s.hand).addScaledVector(s.dir, s.grip);
    vH.lerpVectors(rein, vH, onShaft);
    solveArm(rig.armL, vS, vH, -0.35, -0.75, -0.6);
    reinPommel.lerpVectors(vH, reinPommel, frame.disarmed ? 1 : s.gripOn);
    orientHand(rig.armL, vAxis.lerpVectors(REIN_AXIS, s.dir, onShaft));
  }

  // Update 3D leather reins from the horse's bit rings to the rein hand / saddle pommel
  rig.headGroup.updateWorldMatrix(true, false);
  rig.riderRoot.updateWorldMatrix(true, false);
  for (let ri = 0; ri < 2; ri++) {
    const rGeo = rig.reins[ri];
    const pos = rGeo.attributes.position as THREE.BufferAttribute;
    rig.bitAnchors[ri].getWorldPosition(vTmp);
    rig.riderRoot.worldToLocal(vTmp);
    const sideOff = ri === 0 ? -0.035 : 0.035;
    const sag = 0.09 + Math.max(0, 0.12 - absSpeed * 0.015);
    for (let c = 0; c <= 6; c++) {
      const u = c / 6;
      const rx = vTmp.x + (reinPommel.x - vTmp.x) * u;
      const ry = vTmp.y + (reinPommel.y - vTmp.y) * u - Math.sin(u * Math.PI) * sag;
      const rz = vTmp.z + (reinPommel.z + sideOff - vTmp.z) * u;
      pos.setXYZ(c, rx, ry + 0.012, rz);
      pos.setXYZ(c + 7, rx, ry - 0.012, rz);
    }
    pos.needsUpdate = true;
    rGeo.computeVertexNormals();
  }

  // ------------------------------------------------------------ cloak, plumes
  const lift = Math.min(1, wind * 0.9 + (gait === 'rear' ? 0.3 : 0) + Math.max(0, -s.lean) * 0.5 + 0.08);
  s.capeLift = damp(s.capeLift, lift, 5 * quick, dt);
  if (rig.cape) {
    const { geo, cols, rows, shoulder } = rig.cape;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const segLen = 1.02 / rows;
    for (let c = 0; c <= cols; c++) {
      const across = c / cols - 0.5;
      // 0 down the spine, 1 at the corners fastened on top of the shoulders
      const edge = across * across * 4;
      let x = -0.17 + 0.16 * edge;
      let y = 0.69 + 0.015 * edge;
      for (let r = 0; r <= rows; r++) {
        const fr = r / rows;
        if (r > 0) {
          // Hangs down the back to the saddle, then lies back over the horse's croup
          const drape = 0.1 + 0.95 * ease((fr - 0.5) / 0.25);
          // The corners first run back over the shoulder before the cloth falls
          const over = edge * (1 - ease(fr / 0.22)) * 1.2;
          const angle =
            drape +
            over +
            s.capeLift * (0.55 - fr * 0.25) +
            Math.sin(elapsedSec * (4.5 + s.capeLift * 7) - fr * 5.2 + across * 2.4) *
              (0.05 + s.capeLift * 0.2) *
              fr;
          x -= Math.sin(angle) * segLen;
          y -= Math.cos(angle) * segLen;
        }
        const width = shoulder * 2 + fr * 0.42;
        // The sides fall away round the rider and over the horse's flanks, so the cloak is curved
        const fall = edge * ease(fr / 0.6);
        const idx = r * (cols + 1) + c;
        pos.setXYZ(idx, x + fall * 0.05, y - fall * 0.13, across * width);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  rig.plumes.forEach((segs, pi) => {
    segs.forEach((seg, i) => {
      const rest = seg.userData.rest as number;
      seg.rotation.z =
        rest +
        (i === 0 ? wind * 0.35 : wind * 0.08) +
        Math.sin(elapsedSec * (5.2 + wind * 5) - i * 0.8 + pi * 1.7) * (0.03 + wind * 0.07 + i * 0.012);
    });
  });

  // ------------------------------------------------------------ hit flash
  if (rig.flashLevel > 0.001) {
    rig.flashLevel = Math.max(0, rig.flashLevel - dt * 7);
    const f = rig.flashLevel;
    for (const entry of rig.flashMats) {
      entry.mat.emissive.setRGB(entry.base.r + f * 0.48, entry.base.g + f * 0.22, entry.base.b + f * 0.08);
      entry.mat.emissiveIntensity = Math.max(entry.baseIntensity, f > 0.001 ? 0.72 : entry.baseIntensity);
    }
    if (rig.flashLevel <= 0.001) {
      for (const entry of rig.flashMats) {
        entry.mat.emissive.copy(entry.base);
        entry.mat.emissiveIntensity = entry.baseIntensity;
      }
    }
  }

  return hoofContacts;
}

/** Whites out the fighter for an instant when a blow lands. */
export function flashRig(rig: MountedGeneralRig3D, amount: number): void {
  rig.flashLevel = Math.max(rig.flashLevel, amount);
}
