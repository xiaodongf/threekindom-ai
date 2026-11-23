import * as THREE from 'three';
import type { General } from '../../game/types.js';
import type { HeroDuelProfile } from '../../game/heroDuelProfiles.js';
import { HORSE_COAT_PALETTES } from '../../game/heroDuelProfiles.js';
import type { RiderActionPose, RiderFrameState } from './duelTypes.js';
import type { DisposeBag, LoftRing } from './duelGeometry3D.js';
import { buildLoft, limbBetween, mergeRigid, shadowMesh } from './duelGeometry3D.js';
import {
  createCaparisonTexture,
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
const ARM_UPPER = 0.35;
const ARM_FORE = 0.34;
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
  cape: { geo: THREE.BufferGeometry; cols: number; rows: number } | null;
  armR: { upper: THREE.Group; fore: THREE.Group };
  armL: { upper: THREE.Group; fore: THREE.Group };
  weapon: THREE.Group;
  offWeapon: THREE.Group | null;
  trailBase: THREE.Object3D;
  trailTip: THREE.Object3D;
  /** Rider's chest, used to aim impact effects */
  chest: THREE.Object3D;
  style: WeaponStyle;
  profile: HeroDuelProfile;
  flashMats: Array<{ mat: THREE.MeshStandardMaterial; base: THREE.Color; baseIntensity: number }>;
  flashLevel: number;
  sim: {
    ready: boolean;
    px: number;
    pz: number;
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

function ring(x: number, y: number, ry: number, rz: number): LoftRing {
  return { x, y, ry, rz };
}

function buildHorseLeg(
  bag: DisposeBag,
  front: boolean,
  coatMat: THREE.Material,
  pointsMat: THREE.Material,
  hoofMat: THREE.Material
): Pick<HorseLeg, 'upper' | 'lower' | 'pastern' | 'hoofAnchor'> {
  const l1 = front ? FRONT_L1 : HIND_L1;
  const l2 = front ? FRONT_L2 : HIND_L2;
  const cannon = l2 - 0.16;

  const upper = new THREE.Group();
  const upperRings = front
    ? [
        ring(0.02, 0.16, 0.19, 0.11),
        ring(0.0, -0.06, 0.16, 0.105),
        ring(0.0, -0.3, 0.105, 0.082),
        ring(0.0, -l1 + 0.06, 0.076, 0.066),
        ring(0.0, -l1, 0.086, 0.074),
      ]
    : [
        ring(-0.02, 0.18, 0.24, 0.13),
        ring(0.0, -0.04, 0.2, 0.12),
        ring(0.0, -0.3, 0.12, 0.088),
        ring(0.0, -l1 + 0.08, 0.08, 0.068),
        ring(0.0, -l1, 0.09, 0.074),
      ];
  upper.add(shadowMesh(bag.add(buildLoft(upperRings, { radial: 10 })), coatMat));

  const lower = new THREE.Group();
  lower.position.y = -l1;
  upper.add(lower);
  const lowerRings = [
    ring(0, 0.03, 0.082, 0.07),
    ring(0, -0.08, 0.062, 0.054),
    ring(0, -cannon + 0.1, 0.054, 0.048),
    ring(0, -cannon, 0.072, 0.062),
  ];
  lower.add(shadowMesh(bag.add(buildLoft(lowerRings, { radial: 8 })), pointsMat));

  const pastern = new THREE.Group();
  pastern.position.y = -cannon;
  lower.add(pastern);
  const pasternMesh = shadowMesh(bag.add(new THREE.CylinderGeometry(0.06, 0.056, 0.08, 8)), pointsMat);
  pasternMesh.position.y = -0.03;
  pastern.add(pasternMesh);
  const hoof = shadowMesh(bag.add(new THREE.CylinderGeometry(0.07, 0.1, 0.11, 10)), hoofMat);
  hoof.position.set(0.02, -0.105, 0);
  pastern.add(hoof);
  const hoofAnchor = new THREE.Object3D();
  hoofAnchor.position.set(0.02, -0.16, 0);
  pastern.add(hoofAnchor);

  return { upper, lower, pastern, hoofAnchor };
}

function buildHeadgear(
  bag: DisposeBag,
  hero: General,
  profile: HeroDuelProfile,
  head: THREE.Group,
  mats: {
    armor: THREE.Material;
    trim: THREE.Material;
    cape: THREE.Material;
    robe: THREE.Material;
    hair: THREE.Material;
  }
): THREE.Group[][] {
  const plumes: THREE.Group[][] = [];
  const put = (mesh: THREE.Mesh, x: number, y: number, z = 0) => {
    mesh.position.set(x, y, z);
    head.add(mesh);
    return mesh;
  };
  const dome = (r: number, mat: THREE.Material, y: number, phi = 0.56) =>
    put(shadowMesh(bag.add(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * phi)), mat), 0, y);

  const tasselMat = bag.add(new THREE.MeshStandardMaterial({ color: profile.tasselColor }));
  tasselMat.userData.palette = 'matte';

  // A chain of segments that trails behind the head and whips with the rider's motion.
  const chain = (
    x: number,
    y: number,
    z: number,
    count: number,
    segLen: number,
    radius: number,
    mat: THREE.Material,
    baseRot: number,
    curl: number
  ) => {
    const segs: THREE.Group[] = [];
    let parent: THREE.Object3D = head;
    for (let i = 0; i < count; i++) {
      const seg = new THREE.Group();
      if (i === 0) seg.position.set(x, y, z);
      else seg.position.set(0, segLen, 0);
      seg.rotation.z = i === 0 ? baseRot : curl;
      seg.userData.rest = seg.rotation.z;
      const r0 = radius * (1 - (i / count) * 0.75);
      const r1 = radius * (1 - ((i + 1) / count) * 0.75);
      const m = shadowMesh(bag.add(new THREE.CylinderGeometry(r1, r0, segLen, 6)), mat);
      m.position.y = segLen * 0.5;
      m.scale.z = 0.55;
      seg.add(m);
      parent.add(seg);
      parent = seg;
      segs.push(seg);
    }
    plumes.push(segs);
  };

  switch (profile.headgear) {
    case 'pheasant_crown': {
      put(shadowMesh(bag.add(new THREE.CylinderGeometry(0.12, 0.15, 0.16, 12)), mats.trim), 0, 0.15);
      put(shadowMesh(bag.add(new THREE.SphereGeometry(0.06, 10, 8)), tasselMat), 0, 0.27);
      const feather = bag.add(new THREE.MeshStandardMaterial({ color: '#f43f5e' }));
      feather.userData.palette = 'matte';
      chain(-0.02, 0.24, 0.07, 5, 0.31, 0.028, feather, 0.35, 0.28);
      chain(-0.02, 0.24, -0.07, 5, 0.31, 0.028, feather, 0.45, 0.26);
      break;
    }
    case 'green_hood': {
      dome(0.158, mats.cape, 0.02, 0.6);
      const band = put(shadowMesh(bag.add(new THREE.TorusGeometry(0.15, 0.022, 6, 16)), mats.trim), 0, 0.06);
      band.rotation.x = Math.PI * 0.5;
      const peak = put(shadowMesh(bag.add(new THREE.ConeGeometry(0.1, 0.2, 8)), mats.cape), -0.04, 0.2);
      peak.rotation.z = 0.5;
      chain(-0.13, 0.04, 0, 3, 0.16, 0.07, mats.cape, 2.3, 0.2);
      break;
    }
    case 'scholar_crown': {
      put(shadowMesh(bag.add(new THREE.CylinderGeometry(0.1, 0.13, 0.2, 10)), mats.robe), -0.01, 0.2);
      put(shadowMesh(bag.add(new THREE.BoxGeometry(0.26, 0.02, 0.07)), mats.trim), -0.01, 0.31);
      const pin = put(shadowMesh(bag.add(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6)), mats.trim), -0.01, 0.2);
      pin.rotation.x = Math.PI * 0.5;
      dome(0.15, mats.hair, 0.02, 0.5);
      break;
    }
    case 'phoenix_hairpin': {
      dome(0.152, mats.hair, 0.02, 0.62);
      put(shadowMesh(bag.add(new THREE.SphereGeometry(0.075, 10, 8)), mats.hair), -0.06, 0.2);
      const tiara = put(
        shadowMesh(bag.add(new THREE.TorusGeometry(0.13, 0.02, 6, 14, Math.PI)), mats.trim),
        0.03,
        0.1
      );
      tiara.rotation.y = Math.PI * 0.5;
      put(shadowMesh(bag.add(new THREE.OctahedronGeometry(0.04)), tasselMat), 0.14, 0.14);
      chain(-0.12, 0.1, 0, 5, 0.17, 0.06, mats.hair, 2.6, 0.12);
      break;
    }
    case 'imperial_crown': {
      put(shadowMesh(bag.add(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 12)), mats.trim), 0, 0.15);
      put(shadowMesh(bag.add(new THREE.BoxGeometry(0.42, 0.02, 0.24)), mats.trim), 0, 0.25);
      put(shadowMesh(bag.add(new THREE.OctahedronGeometry(0.045)), tasselMat), 0.14, 0.16);
      dome(0.15, mats.hair, 0.02, 0.5);
      break;
    }
    case 'bandana_crest': {
      dome(0.15, mats.hair, 0.02, 0.55);
      const band = put(shadowMesh(bag.add(new THREE.TorusGeometry(0.148, 0.03, 6, 16)), mats.cape), 0, 0.06);
      band.rotation.x = Math.PI * 0.5;
      put(shadowMesh(bag.add(new THREE.OctahedronGeometry(0.045)), mats.trim), 0.15, 0.07);
      chain(-0.14, 0.06, 0.03, 4, 0.15, 0.035, mats.cape, 2.2, 0.15);
      chain(-0.14, 0.06, -0.03, 4, 0.13, 0.035, mats.cape, 2.5, 0.12);
      break;
    }
    default: {
      // Crested war helm with cheek guards, neck guard and a horsehair plume
      dome(0.168, mats.armor, 0.02, 0.56);
      const brim = put(shadowMesh(bag.add(new THREE.TorusGeometry(0.165, 0.02, 6, 18)), mats.trim), 0, 0.045);
      brim.rotation.x = Math.PI * 0.5;
      const visor = put(shadowMesh(bag.add(new THREE.BoxGeometry(0.1, 0.03, 0.2)), mats.trim), 0.15, 0.07);
      visor.rotation.z = -0.25;
      for (const side of [-1, 1]) {
        const cheek = put(
          shadowMesh(bag.add(new THREE.BoxGeometry(0.11, 0.17, 0.02)), mats.armor),
          0.03,
          -0.05,
          side * 0.15
        );
        cheek.rotation.x = side * -0.12;
      }
      const neckGuard = put(
        shadowMesh(
          bag.add(new THREE.CylinderGeometry(0.17, 0.22, 0.17, 12, 1, true, Math.PI * 1.1, Math.PI * 0.8)),
          mats.armor
        ),
        0,
        -0.07
      );
      (neckGuard.material as THREE.Material).side = THREE.DoubleSide;
      put(shadowMesh(bag.add(new THREE.ConeGeometry(0.04, 0.16, 6)), mats.trim), 0, 0.24);
      chain(0, 0.3, 0, 4, 0.13, 0.06, tasselMat, 1.25, 0.32);
      break;
    }
  }

  if (profile.hasLongBeard) {
    const beardMat = bag.add(
      new THREE.MeshStandardMaterial({
        color: hero.id === 'huangzhong' || hero.id === 'huatuo' ? '#e2e8f0' : '#15131a',
      })
    );
    beardMat.userData.palette = 'matte';
    const beard = put(shadowMesh(bag.add(new THREE.ConeGeometry(0.1, 0.52, 8)), beardMat), 0.1, -0.3);
    beard.rotation.z = Math.PI - 0.12;
    beard.scale.z = 0.8;
    for (const side of [-1, 1]) {
      const whisk = put(shadowMesh(bag.add(new THREE.ConeGeometry(0.03, 0.3, 6)), beardMat), 0.12, -0.16, side * 0.07);
      whisk.rotation.z = Math.PI - 0.2;
      whisk.rotation.x = side * 0.2;
    }
  }

  return plumes;
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

  const coatMat = std({ map: horseTex.map, bumpMap: horseTex.bumpMap, bumpScale: 0.6, roughness: 0.46, metalness: 0.05 });
  const pointsMat = std({ color: coatPal.mane, roughness: 0.55 });
  const maneMat = std({ color: coatPal.mane, roughness: 0.82 });
  const hoofMat = std({ color: coatPal.hoof, roughness: 0.35, metalness: 0.2 });
  const bardingMat = std({ map: caparisonTex, roughness: 0.62, metalness: 0.12, side: THREE.DoubleSide });
  const leatherMat = std({ color: '#3b1f14', roughness: 0.55, metalness: 0.1 });
  const armorMat = std({ map: armorTex.map, bumpMap: armorTex.bumpMap, bumpScale: 1.4, roughness: 0.34, metalness: 0.78 });
  const trimMat = std({ color: profile.armorTrim, roughness: 0.26, metalness: 1 });
  const capeMat = std({ color: profile.capeColor, roughness: 0.72, side: THREE.DoubleSide });
  const robeMat = std({ color: profile.isScholarRobe ? profile.armorPrimary : profile.capeColor, roughness: 0.78 });
  const skinMat = std({ color: '#d9a47e', roughness: 0.62 });
  const hairMat = std({ color: '#15131a', roughness: 0.85 });
  const darkMat = std({ color: '#0b0b0e', roughness: 0.25, metalness: 0.3 });
  const tasselMat = std({ color: profile.tasselColor, roughness: 0.7, emissive: profile.tasselColor, emissiveIntensity: 0.3 });

  // Plain materials are baked into two shared vertex-coloured palettes when the rig is merged
  const matte = std({ vertexColors: true, roughness: 0.68, metalness: 0.02 });
  const metal = std({ vertexColors: true, roughness: 0.27, metalness: 1, envMapIntensity: 1.2 });
  const clothMat = std({ color: profile.capeColor });
  for (const m of [pointsMat, maneMat, hoofMat, leatherMat, robeMat, skinMat, hairMat, darkMat, tasselMat, clothMat]) {
    m.userData.palette = 'matte';
  }
  trimMat.userData.palette = 'metal';

  const flashMats = [coatMat, armorMat, bardingMat, capeMat, matte, metal].map((mat) => ({
    mat,
    base: mat.emissive.clone(),
    baseIntensity: mat.emissiveIntensity,
  }));

  // ---------------------------------------------------------------- horse body
  const pitchPivot = new THREE.Group();
  pitchPivot.position.set(HIP.x, HIP.y, 0);
  root.add(pitchPivot);
  const body = new THREE.Group();
  body.position.set(-HIP.x, -HIP.y, 0);
  pitchPivot.add(body);

  const barrelRings = [
    ring(-1.03, 1.44, 0.02, 0.02),
    ring(-0.98, 1.43, 0.2, 0.17),
    ring(-0.82, 1.41, 0.38, 0.33),
    ring(-0.58, 1.38, 0.43, 0.37),
    ring(-0.3, 1.35, 0.41, 0.36),
    ring(0.0, 1.32, 0.42, 0.37),
    ring(0.3, 1.3, 0.45, 0.375),
    ring(0.56, 1.31, 0.47, 0.36),
    ring(0.78, 1.35, 0.45, 0.32),
    ring(0.95, 1.38, 0.36, 0.26),
    ring(1.04, 1.41, 0.17, 0.14),
    ring(1.07, 1.41, 0.02, 0.02),
  ];
  body.add(shadowMesh(bag.add(buildLoft(barrelRings, { radial: 18 })), coatMat));

  const muscleGeo = bag.add(new THREE.SphereGeometry(1, 14, 12));
  for (const side of [-1, 1]) {
    const haunch = shadowMesh(muscleGeo, coatMat);
    haunch.position.set(-0.58, 1.36, side * 0.19);
    haunch.scale.set(0.38, 0.42, 0.22);
    body.add(haunch);
    const shoulder = shadowMesh(muscleGeo, coatMat);
    shoulder.position.set(0.7, 1.32, side * 0.17);
    shoulder.scale.set(0.27, 0.42, 0.19);
    body.add(shoulder);
  }

  // Saddle cloth draped over the barrel, breast band, crupper band and their tassels
  const clothRings = [
    ring(-0.4, 1.365, 0.445, 0.39),
    ring(-0.2, 1.345, 0.44, 0.39),
    ring(0.08, 1.315, 0.45, 0.4),
    ring(0.3, 1.3, 0.475, 0.405),
    ring(0.44, 1.305, 0.485, 0.4),
  ];
  body.add(
    shadowMesh(
      bag.add(buildLoft(clothRings, { radial: 16, arc: [-Math.PI * 0.56, Math.PI * 0.56] })),
      bardingMat
    )
  );
  const breastBand = [ring(0.82, 1.36, 0.455, 0.325), ring(0.88, 1.37, 0.43, 0.305), ring(0.94, 1.38, 0.385, 0.28)];
  body.add(shadowMesh(bag.add(buildLoft(breastBand, { radial: 16, smooth: 1 })), trimMat));
  const crupperBand = [ring(-0.78, 1.405, 0.41, 0.355), ring(-0.72, 1.395, 0.425, 0.365)];
  body.add(shadowMesh(bag.add(buildLoft(crupperBand, { radial: 16, smooth: 1 })), leatherMat));
  const bigTasselGeo = bag.add(new THREE.ConeGeometry(0.055, 0.26, 8));
  const tasselSpots: Array<[number, number, number]> = [
    [1.07, 1.3, 0],
    [-0.75, 1.52, 0.35],
    [-0.75, 1.52, -0.35],
  ];
  for (const [x, y, z] of tasselSpots) {
    const t = shadowMesh(bigTasselGeo, tasselMat);
    t.position.set(x, y - 0.12, z);
    t.rotation.z = Math.PI;
    body.add(t);
    const knob = shadowMesh(bag.add(new THREE.SphereGeometry(0.05, 8, 8)), trimMat);
    knob.position.set(x, y + 0.04, z);
    body.add(knob);
  }

  const saddleRings = [
    ring(-0.44, 1.9, 0.03, 0.18),
    ring(-0.37, 1.87, 0.09, 0.24),
    ring(-0.24, 1.8, 0.06, 0.25),
    ring(-0.02, 1.765, 0.05, 0.25),
    ring(0.2, 1.79, 0.055, 0.21),
    ring(0.3, 1.86, 0.085, 0.14),
    ring(0.34, 1.91, 0.03, 0.08),
  ];
  body.add(shadowMesh(bag.add(buildLoft(saddleRings, { radial: 12 })), leatherMat));

  // ---------------------------------------------------------------- neck & head
  const neck = new THREE.Group();
  neck.position.set(NECK_BASE.x, NECK_BASE.y, 0);
  body.add(neck);
  const neckRings = [
    ring(-0.14, -0.22, 0.4, 0.26),
    ring(0.04, 0.06, 0.35, 0.23),
    ring(0.2, 0.34, 0.28, 0.185),
    ring(0.34, 0.6, 0.22, 0.15),
    ring(0.44, 0.8, 0.175, 0.125),
    ring(0.5, 0.94, 0.12, 0.1),
  ];
  neck.add(shadowMesh(bag.add(buildLoft(neckRings, { radial: 14 })), coatMat));

  const crestRings = [
    ring(-0.3, 0.16, 0.05, 0.05),
    ring(-0.2, 0.34, 0.075, 0.06),
    ring(-0.03, 0.56, 0.075, 0.055),
    ring(0.14, 0.76, 0.07, 0.05),
    ring(0.28, 0.92, 0.06, 0.045),
    ring(0.4, 1.02, 0.03, 0.03),
  ];
  neck.add(shadowMesh(bag.add(buildLoft(crestRings, { radial: 8 })), maneMat));

  const mane: THREE.Group[] = [];
  const lockGeo = bag.add(new THREE.ConeGeometry(0.075, 0.44, 6));
  for (let i = 0; i < 6; i++) {
    const f = i / 5;
    const lock = new THREE.Group();
    lock.position.set(-0.24 + f * 0.58, 0.3 + f * 0.66, 0.06 + (1 - f) * 0.05);
    const m = shadowMesh(lockGeo, maneMat);
    m.rotation.z = Math.PI;
    m.position.set(0, -0.2, 0.05 + (1 - f) * 0.04);
    m.scale.set(1.7, 1 - f * 0.25, 0.32);
    lock.add(m);
    lock.rotation.x = -0.32;
    neck.add(lock);
    mane.push(lock);
  }

  const headGroup = new THREE.Group();
  headGroup.position.set(0.47, 0.9, 0);
  headGroup.rotation.z = HEAD_REST;
  headGroup.scale.setScalar(1.1);
  neck.add(headGroup);
  const skullRings = [
    ring(-0.08, 0.0, 0.07, 0.07),
    ring(0.03, 0.0, 0.155, 0.125),
    ring(0.16, -0.012, 0.165, 0.12),
    ring(0.3, -0.02, 0.13, 0.098),
    ring(0.44, -0.03, 0.1, 0.08),
    ring(0.56, -0.04, 0.094, 0.082),
    ring(0.635, -0.046, 0.05, 0.05),
  ];
  headGroup.add(shadowMesh(bag.add(buildLoft(skullRings, { radial: 12 })), coatMat));
  const cheek = shadowMesh(muscleGeo, coatMat);
  cheek.position.set(0.12, -0.09, 0);
  cheek.scale.set(0.15, 0.13, 0.105);
  headGroup.add(cheek);
  const muzzle = shadowMesh(muscleGeo, pointsMat);
  muzzle.position.set(0.59, -0.045, 0);
  muzzle.scale.set(0.07, 0.085, 0.078);
  headGroup.add(muzzle);
  const earGeo = bag.add(new THREE.ConeGeometry(0.04, 0.17, 6));
  for (const side of [-1, 1]) {
    const ear = shadowMesh(earGeo, coatMat);
    ear.position.set(-0.03, 0.2, side * 0.075);
    ear.rotation.z = 0.35;
    ear.rotation.x = side * 0.18;
    headGroup.add(ear);
    const eye = new THREE.Mesh(bag.add(new THREE.SphereGeometry(0.026, 8, 8)), darkMat);
    eye.position.set(0.15, 0.055, side * 0.108);
    headGroup.add(eye);
    const nostril = new THREE.Mesh(bag.add(new THREE.SphereGeometry(0.016, 6, 6)), darkMat);
    nostril.position.set(0.63, -0.01, side * 0.04);
    headGroup.add(nostril);
  }
  const forelock = shadowMesh(lockGeo, maneMat);
  forelock.position.set(0.1, 0.13, 0);
  forelock.rotation.z = -1.9;
  forelock.scale.set(0.8, 0.6, 0.6);
  headGroup.add(forelock);
  // Gilded chanfron and bridle
  const chanfron = shadowMesh(bag.add(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8)), trimMat);
  chanfron.position.set(0.24, 0.115, 0);
  chanfron.rotation.z = -Math.PI * 0.5 - 0.06;
  chanfron.scale.set(0.4, 1, 1.5);
  headGroup.add(chanfron);
  for (const x of [0.4, 0.07]) {
    const band = shadowMesh(bag.add(new THREE.TorusGeometry(x > 0.2 ? 0.108 : 0.15, 0.012, 6, 14)), leatherMat);
    band.position.set(x, x > 0.2 ? -0.025 : -0.02, 0);
    band.rotation.y = Math.PI * 0.5;
    band.scale.set(0.8, 1, 1);
    headGroup.add(band);
  }
  const headTassel = shadowMesh(bag.add(new THREE.ConeGeometry(0.045, 0.2, 6)), tasselMat);
  headTassel.position.set(0.02, -0.22, 0);
  headTassel.rotation.z = Math.PI - HEAD_REST * 0.5;
  headGroup.add(headTassel);

  // ---------------------------------------------------------------- tail
  const tail: THREE.Group[] = [];
  let tailParent: THREE.Object3D = body;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    if (i === 0) seg.position.set(-1.0, 1.6, 0);
    else seg.position.set(0, -0.22, 0);
    const r0 = 0.085 - i * 0.008;
    const hair = shadowMesh(bag.add(new THREE.CylinderGeometry(r0, Math.max(0.012, r0 - 0.014), 0.24, 7)), maneMat);
    hair.position.y = -0.11;
    hair.scale.z = 0.7;
    seg.add(hair);
    tailParent.add(seg);
    tailParent = seg;
    tail.push(seg);
  }

  // ---------------------------------------------------------------- legs
  const legs: HorseLeg[] = [];
  const legSpecs: Array<{ front: boolean; side: number; gallop: number; trot: number }> = [
    { front: true, side: -1, gallop: 0.5, trot: 0 },
    { front: true, side: 1, gallop: 0.4, trot: 0.5 },
    { front: false, side: -1, gallop: 0.09, trot: 0.5 },
    { front: false, side: 1, gallop: 0, trot: 0 },
  ];
  for (const spec of legSpecs) {
    const built = buildHorseLeg(bag, spec.front, coatMat, pointsMat, hoofMat);
    const joint = spec.front ? FRONT_JOINT : HIND_JOINT;
    built.upper.position.set(joint.x, joint.y, spec.side * (spec.front ? 0.2 : 0.22));
    body.add(built.upper);
    const restX = spec.front ? FRONT_REST_X : HIND_REST_X;
    legs.push({
      ...built,
      front: spec.front,
      jx: joint.x,
      jy: joint.y,
      l1: spec.front ? FRONT_L1 : HIND_L1,
      l2: spec.front ? FRONT_L2 : HIND_L2,
      restX,
      gallopOffset: spec.gallop,
      trotOffset: spec.trot,
      tx: restX,
      ty: 0,
      wasStance: true,
    });
  }

  // ---------------------------------------------------------------- rider
  const riderRoot = new THREE.Group();
  riderRoot.position.set(SEAT.x, SEAT.y, 0);
  riderRoot.scale.setScalar(RIDER_SCALE);
  body.add(riderRoot);

  const slim = profile.isHeroine ? 0.86 : 1;
  const legMat = profile.isScholarRobe ? robeMat : armorMat;
  for (const side of [-1, 1]) {
    const hip = new THREE.Vector3(0, 0.03, side * 0.14);
    const knee = new THREE.Vector3(0.34, -0.1, side * 0.39);
    const ankle = new THREE.Vector3(0.24, -0.58, side * 0.43);
    const toe = new THREE.Vector3(0.42, -0.66, side * 0.44);
    riderRoot.add(limbBetween(bag, hip, knee, 0.115, 0.09, legMat));
    riderRoot.add(limbBetween(bag, knee, ankle, 0.085, 0.066, trimMat));
    riderRoot.add(limbBetween(bag, ankle, toe, 0.062, 0.05, leatherMat));
    const kneeCap = shadowMesh(bag.add(new THREE.SphereGeometry(0.1, 10, 8)), trimMat);
    kneeCap.position.copy(knee);
    kneeCap.scale.set(1, 0.9, 0.9);
    riderRoot.add(kneeCap);
    // Layered armour skirt over the thigh
    for (let i = 0; i < 2; i++) {
      const plate = shadowMesh(bag.add(new THREE.BoxGeometry(0.4, 0.26, 0.03)), profile.isScholarRobe ? robeMat : armorMat);
      plate.position.set(0.14, 0.0 - i * 0.14, side * (0.3 + i * 0.05));
      plate.rotation.set(side * -(0.35 + i * 0.12), 0, 0.28);
      riderRoot.add(plate);
      const hem = shadowMesh(bag.add(new THREE.BoxGeometry(0.41, 0.03, 0.036)), trimMat);
      hem.position.set(0.175, -0.125 - i * 0.14, side * (0.345 + i * 0.065));
      hem.rotation.copy(plate.rotation);
      riderRoot.add(hem);
    }
    // Stirrup
    const stirrup = shadowMesh(bag.add(new THREE.TorusGeometry(0.075, 0.014, 6, 12)), trimMat);
    stirrup.position.set(0.3, -0.66, side * 0.44);
    stirrup.rotation.y = Math.PI * 0.5;
    riderRoot.add(stirrup);
  }

  const torso = new THREE.Group();
  torso.position.set(0, 0.06, 0);
  torso.rotation.order = 'ZYX';
  riderRoot.add(torso);

  const torsoRings = [
    ring(0, -0.04, 0.15, 0.2 * slim),
    ring(0, 0.1, 0.155, 0.205 * slim),
    ring(0.012, 0.28, 0.19, 0.25 * slim),
    ring(0.016, 0.44, 0.205, 0.28 * slim),
    ring(0, 0.56, 0.17, 0.27 * slim),
    ring(-0.005, 0.63, 0.105, 0.16),
    ring(0, 0.69, 0.066, 0.078),
    ring(0, 0.76, 0.06, 0.066),
  ];
  torso.add(
    shadowMesh(bag.add(buildLoft(torsoRings, { radial: 14 })), profile.isScholarRobe ? robeMat : armorMat)
  );
  const belt = shadowMesh(bag.add(new THREE.TorusGeometry(0.18, 0.035, 6, 16)), trimMat);
  belt.rotation.x = Math.PI * 0.5;
  belt.position.y = 0.09;
  belt.scale.set(0.86, 1.14 * slim, 1);
  torso.add(belt);
  const sashKnot = shadowMesh(bag.add(new THREE.SphereGeometry(0.055, 8, 8)), tasselMat);
  sashKnot.position.set(0.17, 0.09, 0);
  torso.add(sashKnot);
  if (!profile.isScholarRobe) {
    const mirror = shadowMesh(bag.add(new THREE.SphereGeometry(0.1, 14, 10)), trimMat);
    mirror.position.set(0.19, 0.42, 0);
    mirror.scale.set(0.3, 1, 1);
    torso.add(mirror);
  }
  const collar = shadowMesh(bag.add(new THREE.TorusGeometry(0.11, 0.03, 6, 14)), trimMat);
  collar.rotation.x = Math.PI * 0.5;
  collar.position.y = 0.66;
  torso.add(collar);

  // Tiered shoulder guards
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const pauldron = shadowMesh(
        bag.add(new THREE.SphereGeometry(0.17 - i * 0.025, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)),
        profile.isScholarRobe ? robeMat : armorMat
      );
      pauldron.position.set(0, 0.56 - i * 0.1, side * (0.31 + i * 0.045));
      pauldron.rotation.x = side * (0.5 + i * 0.3);
      pauldron.scale.set(1.1, 1, 1);
      torso.add(pauldron);
    }
    const stud = shadowMesh(bag.add(new THREE.SphereGeometry(0.045, 8, 8)), trimMat);
    stud.position.set(0.02, 0.7, side * 0.3);
    torso.add(stud);
  }

  const chest = new THREE.Object3D();
  chest.position.set(0.1, 0.42, 0);
  torso.add(chest);

  // Cloak: a cloth sheet re-shaped every frame from the rider's motion
  const capeCols = 6;
  const capeRows = 9;
  const capeGeo = bag.add(new THREE.PlaneGeometry(1, 1, capeCols, capeRows));
  const capeMesh = shadowMesh(capeGeo, capeMat);
  capeMesh.frustumCulled = false;
  capeMesh.userData.keep = true;
  torso.add(capeMesh);

  // Head
  const head = new THREE.Group();
  head.position.set(0.02, 0.88, 0);
  torso.add(head);
  const face = shadowMesh(bag.add(new THREE.SphereGeometry(0.135, 16, 14)), skinMat);
  face.scale.set(0.98, 1.1, 0.92);
  head.add(face);
  const nose = shadowMesh(bag.add(new THREE.ConeGeometry(0.022, 0.06, 6)), skinMat);
  nose.position.set(0.135, -0.01, 0);
  nose.rotation.z = -Math.PI * 0.5 - 0.3;
  head.add(nose);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(bag.add(new THREE.SphereGeometry(0.017, 6, 6)), darkMat);
    eye.position.set(0.118, 0.02, side * 0.05);
    head.add(eye);
    const brow = new THREE.Mesh(bag.add(new THREE.BoxGeometry(0.02, 0.014, 0.06)), hairMat);
    brow.position.set(0.122, 0.052, side * 0.05);
    brow.rotation.x = side * 0.35;
    head.add(brow);
  }
  const plumes = buildHeadgear(bag, hero, profile, head, {
    armor: armorMat,
    trim: trimMat,
    cape: clothMat,
    robe: robeMat,
    hair: hairMat,
  });

  // Arms are posed by inverse kinematics every frame, so they hang off the rider root
  const buildArm = () => {
    const upper = new THREE.Group();
    const upperMesh = shadowMesh(
      bag.add(new THREE.CylinderGeometry(0.078, 0.064, ARM_UPPER, 10)),
      profile.isScholarRobe ? robeMat : armorMat
    );
    upperMesh.position.y = -ARM_UPPER * 0.5;
    upper.add(upperMesh);
    const shoulderBall = shadowMesh(bag.add(new THREE.SphereGeometry(0.082, 10, 8)), profile.isScholarRobe ? robeMat : armorMat);
    upper.add(shoulderBall);

    const fore = new THREE.Group();
    const elbow = shadowMesh(bag.add(new THREE.SphereGeometry(0.07, 10, 8)), trimMat);
    fore.add(elbow);
    const foreMesh = shadowMesh(bag.add(new THREE.CylinderGeometry(0.066, 0.05, ARM_FORE, 10)), trimMat);
    foreMesh.position.y = -ARM_FORE * 0.5;
    fore.add(foreMesh);
    if (profile.isScholarRobe) {
      const sleeve = shadowMesh(bag.add(new THREE.ConeGeometry(0.15, ARM_FORE * 1.1, 10, 1, true)), robeMat);
      (sleeve.material as THREE.Material).side = THREE.DoubleSide;
      sleeve.position.y = -ARM_FORE * 0.5;
      fore.add(sleeve);
    }
    const hand = shadowMesh(bag.add(new THREE.SphereGeometry(0.058, 8, 8)), leatherMat);
    hand.position.y = -ARM_FORE;
    fore.add(hand);
    riderRoot.add(upper, fore);
    return { upper, fore };
  };
  const armR = buildArm();
  const armL = buildArm();

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
    cape: { geo: capeGeo, cols: capeCols, rows: capeRows },
    armR,
    armL,
    weapon,
    offWeapon,
    trailBase: built.trailBase,
    trailTip: built.trailTip,
    chest,
    style: weaponStyleOf(profile),
    profile,
    flashMats,
    flashLevel: 0,
    sim: {
      ready: false,
      px: 0,
      pz: 0,
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
const vX = new THREE.Vector3();
const vZ = new THREE.Vector3();
const mBasis = new THREE.Matrix4();

function solveArm(
  arm: { upper: THREE.Group; fore: THREE.Group },
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
  }

  rig.root.position.set(frame.x, 0, frame.z);
  rig.root.rotation.y = frame.yaw;

  // Signed ground speed along the horse's own heading
  const fwdX = Math.cos(frame.yaw);
  const fwdZ = -Math.sin(frame.yaw);
  if (dt > 0.002) {
    const v = ((frame.x - s.px) * fwdX + (frame.z - s.pz) * fwdZ) / dt;
    s.speed = damp(s.speed, Math.max(-12, Math.min(12, v)), 14, dt);
    s.px = frame.x;
    s.pz = frame.z;
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
  rig.weapon.visible = !frame.disarmed;

  // Off hand: second grip on a polearm, a mirrored blade for twin weapons, otherwise the reins
  vS.copy(SHOULDER);
  vS.z = -vS.z;
  vS.applyEuler(rig.torso.rotation).add(rig.torso.position);
  if (rig.offWeapon) {
    vH.set(s.hand.x * 0.92, s.hand.y * 0.94, -s.hand.z);
    solveArm(rig.armL, vS, vH, -0.35, -0.75, -0.6);
    vDir.set(s.dir.x, s.dir.y, -s.dir.z);
    orientWeapon(rig.offWeapon, vH, vDir, s.horiz);
    rig.offWeapon.visible = !frame.disarmed;
  } else {
    const rein = vTmp.set(0.3, 0.26 + s.bounce * 0.4, -0.05);
    vH.copy(s.hand).addScaledVector(s.dir, s.grip);
    vH.lerpVectors(rein, vH, frame.disarmed ? 0 : s.gripOn);
    solveArm(rig.armL, vS, vH, -0.35, -0.75, -0.6);
  }

  // ------------------------------------------------------------ cloak, plumes
  const lift = Math.min(1, wind * 0.9 + (gait === 'rear' ? 0.3 : 0) + Math.max(0, -s.lean) * 0.5 + 0.08);
  s.capeLift = damp(s.capeLift, lift, 5 * quick, dt);
  if (rig.cape) {
    const { geo, cols, rows } = rig.cape;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const segLen = 1.02 / rows;
    for (let c = 0; c <= cols; c++) {
      const across = c / cols - 0.5;
      let x = -0.19;
      let y = 0.63;
      for (let r = 0; r <= rows; r++) {
        const fr = r / rows;
        if (r > 0) {
          const drape = 0.3 + 0.95 * ease((fr - 0.12) / 0.5);
          const angle =
            drape +
            s.capeLift * (0.55 - fr * 0.25) +
            Math.sin(elapsedSec * (4.5 + s.capeLift * 7) - fr * 5.2 + across * 2.4) *
              (0.05 + s.capeLift * 0.2) *
              fr;
          x -= Math.sin(angle) * segLen;
          y -= Math.cos(angle) * segLen;
        }
        const width = 0.5 + fr * 0.42;
        const idx = r * (cols + 1) + c;
        pos.setXYZ(idx, x - Math.abs(across) * 0.1 * (1 - fr), y, across * width);
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
      entry.mat.emissive.setRGB(entry.base.r + f * 0.8, entry.base.g + f * 0.28, entry.base.b + f * 0.14);
      entry.mat.emissiveIntensity = Math.max(entry.baseIntensity, f > 0.001 ? 1 : entry.baseIntensity);
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
