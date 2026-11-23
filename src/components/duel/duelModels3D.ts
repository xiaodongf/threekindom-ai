import * as THREE from 'three';
import type { FactionId, General, TerrainType } from '../../game/types.js';
import type { HeroDuelProfile } from '../../game/heroDuelProfiles.js';
import { HORSE_COAT_PALETTES } from '../../game/heroDuelProfiles.js';
import type { VisualThemeId } from '../../utils/visualTheme.js';
import type { RiderFrameState } from './duelTypes.js';
import {
  createArenaGroundTextures,
  createCaparisonTexture,
  createHorseCoatTextures,
  createLamellarArmorTextures,
  createPaintedPanoramaTexture,
  createSilkBannerTexture,
  createSkyDomeTexture,
} from './duelTextures3D.js';

export interface LegJoint3D {
  upper: THREE.Group;
  lower: THREE.Group;
  hoofAnchor: THREE.Object3D;
  prevHoofY: number;
}

export interface MountedGeneralRig3D {
  root: THREE.Group;
  rearPivot: THREE.Group;
  horseBody: THREE.Group;
  horseNeck: THREE.Group;
  horseHead: THREE.Group;
  legs: {
    fl: LegJoint3D;
    fr: LegJoint3D;
    rl: LegJoint3D;
    rr: LegJoint3D;
  };
  tailSegments: THREE.Group[];
  maneSegments: THREE.Group[];
  riderRoot: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  capeSegments: THREE.Group[];
  plumeLeftSegments: THREE.Group[];
  plumeRightSegments: THREE.Group[];
  weaponGroup: THREE.Group;
  trailBase: THREE.Object3D;
  trailTip: THREE.Object3D;
  profile: HeroDuelProfile;
  gaitPhase: number;
  hoofStepAccumulator: number;
}

export interface ArenaBanner3D {
  mesh: THREE.Mesh;
  basePositions: Float32Array;
  phase: number;
  side: 'left' | 'right';
}

export interface DuelArena3D {
  group: THREE.Group;
  banners: ArenaBanner3D[];
  brazierLights: THREE.PointLight[];
  brazierFlames: THREE.Mesh[];
  waterMesh?: THREE.Mesh;
  spectatorGroups: { left: THREE.Group; right: THREE.Group };
}

const FACTION_HEX: Record<FactionId, { bg: string; trim: string }> = {
  wei: { bg: '#1d4ed8', trim: '#f0c45c' },
  shu: { bg: '#047857', trim: '#facc15' },
  wu: { bg: '#be123c', trim: '#fbbf24' },
  neutral: { bg: '#57534e', trim: '#e5c158' },
};

function addShadow(mesh: THREE.Mesh, cast = true, receive = true): THREE.Mesh {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

/** Builds a sculpted 3-segment equine leg with knee/hock joint and ground-tracking hoof anchor */
function buildHorseLeg(
  coatMat: THREE.Material,
  hoofMat: THREE.Material,
  isFront: boolean,
  geometries: THREE.BufferGeometry[]
): LegJoint3D {
  const upper = new THREE.Group();

  const upperGeo = new THREE.CylinderGeometry(isFront ? 0.125 : 0.165, 0.085, 0.62, 12);
  geometries.push(upperGeo);
  const upperMesh = addShadow(new THREE.Mesh(upperGeo, coatMat));
  upperMesh.position.y = -0.3;
  upper.add(upperMesh);

  const kneeGeo = new THREE.SphereGeometry(0.088, 10, 10);
  geometries.push(kneeGeo);
  const knee = addShadow(new THREE.Mesh(kneeGeo, coatMat));
  knee.position.y = -0.61;
  upper.add(knee);

  const lower = new THREE.Group();
  lower.position.y = -0.61;
  upper.add(lower);

  const cannonGeo = new THREE.CylinderGeometry(0.072, 0.055, 0.52, 10);
  geometries.push(cannonGeo);
  const cannon = addShadow(new THREE.Mesh(cannonGeo, coatMat));
  cannon.position.y = -0.25;
  lower.add(cannon);

  const fetlockGeo = new THREE.SphereGeometry(0.062, 8, 8);
  geometries.push(fetlockGeo);
  const fetlock = addShadow(new THREE.Mesh(fetlockGeo, coatMat));
  fetlock.position.y = -0.5;
  lower.add(fetlock);

  const hoofGeo = new THREE.CylinderGeometry(0.064, 0.084, 0.13, 10);
  geometries.push(hoofGeo);
  const hoof = addShadow(new THREE.Mesh(hoofGeo, hoofMat));
  hoof.position.set(0.025, -0.57, 0);
  lower.add(hoof);

  const hoofAnchor = new THREE.Object3D();
  hoofAnchor.position.set(0.02, -0.63, 0);
  lower.add(hoofAnchor);

  return { upper, lower, hoofAnchor, prevHoofY: 0 };
}

/** Builds one of 7 bespoke Three Kingdoms 3D signature weapons with world-space trail anchors */
function buildSignatureWeapon3D(
  profile: HeroDuelProfile,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[]
): { group: THREE.Group; trailBase: THREE.Object3D; trailTip: THREE.Object3D } {
  const group = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({
    color: profile.weaponColor,
    metalness: 0.9,
    roughness: 0.16,
    emissive: '#ffffff',
    emissiveIntensity: 0.06,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: profile.armorTrim,
    metalness: 0.85,
    roughness: 0.24,
  });
  const shaftMat = new THREE.MeshStandardMaterial({
    color: '#3a2214',
    metalness: 0.2,
    roughness: 0.72,
  });
  const tasselMat = new THREE.MeshStandardMaterial({
    color: profile.tasselColor,
    roughness: 0.65,
    emissive: profile.tasselColor,
    emissiveIntensity: 0.22,
  });
  materials.push(steelMat, goldMat, shaftMat, tasselMat);

  const trailBase = new THREE.Object3D();
  const trailTip = new THREE.Object3D();

  const variant = profile.weaponVariant;

  if (variant === 'crescent_blade' || variant === 'great_axe') {
    const shaftGeo = new THREE.CylinderGeometry(0.034, 0.038, 2.55, 10);
    geometries.push(shaftGeo);
    const shaft = addShadow(new THREE.Mesh(shaftGeo, shaftMat));
    shaft.position.y = 0.72;
    group.add(shaft);

    const collarGeo = new THREE.CylinderGeometry(0.074, 0.056, 0.22, 10);
    geometries.push(collarGeo);
    const collar = addShadow(new THREE.Mesh(collarGeo, goldMat));
    collar.position.y = 1.98;
    group.add(collar);

    const shape = new THREE.Shape();
    if (variant === 'great_axe') {
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(0.5, 0.15, 0.48, 0.56);
      shape.quadraticCurveTo(0.26, 0.72, 0, 0.6);
      shape.lineTo(-0.08, 0.32);
      shape.closePath();
    } else {
      shape.moveTo(-0.03, 0);
      shape.quadraticCurveTo(0.28, 0.2, 0.3, 0.62);
      shape.quadraticCurveTo(0.2, 1.0, -0.09, 1.15);
      shape.quadraticCurveTo(0.03, 0.78, -0.06, 0.38);
      shape.closePath();
    }
    const bladeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.026,
      bevelEnabled: true,
      bevelThickness: 0.011,
      bevelSize: 0.01,
      bevelSegments: 2,
    });
    bladeGeo.center();
    geometries.push(bladeGeo);
    const blade = addShadow(new THREE.Mesh(bladeGeo, steelMat));
    blade.position.set(0.11, 2.48, 0);
    group.add(blade);

    const tasselGeo = new THREE.ConeGeometry(0.085, 0.38, 8);
    geometries.push(tasselGeo);
    const tassel = addShadow(new THREE.Mesh(tasselGeo, tasselMat));
    tassel.position.set(-0.09, 1.82, 0);
    tassel.rotation.z = 0.35;
    group.add(tassel);

    trailBase.position.set(0.06, 2.0, 0);
    trailTip.position.set(0.16, 3.06, 0);
  } else if (variant === 'fangtian_halberd') {
    const shaftGeo = new THREE.CylinderGeometry(0.034, 0.038, 2.68, 10);
    geometries.push(shaftGeo);
    const shaft = addShadow(new THREE.Mesh(shaftGeo, shaftMat));
    shaft.position.y = 0.78;
    group.add(shaft);

    const guardGeo = new THREE.OctahedronGeometry(0.095, 0);
    geometries.push(guardGeo);
    const guard = addShadow(new THREE.Mesh(guardGeo, goldMat));
    guard.position.y = 2.12;
    group.add(guard);

    const spearTipGeo = new THREE.ConeGeometry(0.072, 0.86, 4);
    geometries.push(spearTipGeo);
    const spearTip = addShadow(new THREE.Mesh(spearTipGeo, steelMat));
    spearTip.position.y = 2.58;
    group.add(spearTip);

    const crescentShape = new THREE.Shape();
    crescentShape.moveTo(0, -0.3);
    crescentShape.quadraticCurveTo(0.38, -0.12, 0.32, 0.25);
    crescentShape.quadraticCurveTo(0.18, 0.05, 0, 0.14);
    crescentShape.closePath();
    const crescentGeo = new THREE.ExtrudeGeometry(crescentShape, {
      depth: 0.022,
      bevelEnabled: true,
      bevelThickness: 0.009,
      bevelSize: 0.009,
      bevelSegments: 2,
    });
    geometries.push(crescentGeo);

    const leftBlade = addShadow(new THREE.Mesh(crescentGeo, steelMat));
    leftBlade.position.set(0.04, 2.24, -0.01);
    group.add(leftBlade);

    const rightBlade = addShadow(new THREE.Mesh(crescentGeo, steelMat));
    rightBlade.scale.x = -1;
    rightBlade.position.set(-0.04, 2.24, -0.01);
    group.add(rightBlade);

    const tasselGeo = new THREE.ConeGeometry(0.09, 0.4, 8);
    geometries.push(tasselGeo);
    const tassel = addShadow(new THREE.Mesh(tasselGeo, tasselMat));
    tassel.position.set(0, 1.9, 0.06);
    tassel.rotation.x = 0.25;
    group.add(tassel);

    trailBase.position.set(0, 2.02, 0);
    trailTip.position.set(0, 3.08, 0);
  } else if (variant === 'dragon_lance' || variant === 'serpent_spear') {
    const shaftGeo = new THREE.CylinderGeometry(0.03, 0.034, 2.7, 10);
    geometries.push(shaftGeo);
    const shaft = addShadow(new THREE.Mesh(shaftGeo, shaftMat));
    shaft.position.y = 0.78;
    group.add(shaft);

    const collarGeo = new THREE.TorusGeometry(0.06, 0.02, 6, 12);
    geometries.push(collarGeo);
    const collar = addShadow(new THREE.Mesh(collarGeo, goldMat));
    collar.position.y = 2.1;
    collar.rotation.x = Math.PI * 0.5;
    group.add(collar);

    if (variant === 'serpent_spear') {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 2.12, 0),
        new THREE.Vector3(0.07, 2.34, 0),
        new THREE.Vector3(-0.07, 2.56, 0),
        new THREE.Vector3(0.05, 2.78, 0),
        new THREE.Vector3(0, 3.02, 0),
      ]);
      const bladeGeo = new THREE.TubeGeometry(curve, 18, 0.036, 6, false);
      geometries.push(bladeGeo);
      const blade = addShadow(new THREE.Mesh(bladeGeo, steelMat));
      group.add(blade);
    } else {
      const tipGeo = new THREE.ConeGeometry(0.068, 0.94, 4);
      geometries.push(tipGeo);
      const tip = addShadow(new THREE.Mesh(tipGeo, steelMat));
      tip.position.y = 2.58;
      group.add(tip);
    }

    const tuftGeo = new THREE.ConeGeometry(0.09, 0.36, 8);
    geometries.push(tuftGeo);
    const tuft = addShadow(new THREE.Mesh(tuftGeo, tasselMat));
    tuft.position.y = 1.96;
    tuft.rotation.z = Math.PI;
    group.add(tuft);

    trailBase.position.set(0, 2.08, 0);
    trailTip.position.set(0, 3.08, 0);
  } else if (variant === 'tiger_saber' || variant === 'twin_ji' || variant === 'iron_whip') {
    const gripGeo = new THREE.CylinderGeometry(0.034, 0.036, 0.64, 8);
    geometries.push(gripGeo);
    const grip = addShadow(new THREE.Mesh(gripGeo, shaftMat));
    grip.position.y = 0.24;
    group.add(grip);

    const guardGeo = new THREE.BoxGeometry(0.26, 0.075, 0.11);
    geometries.push(guardGeo);
    const guard = addShadow(new THREE.Mesh(guardGeo, goldMat));
    guard.position.y = 0.56;
    group.add(guard);

    if (variant === 'iron_whip') {
      const rodGeo = new THREE.CylinderGeometry(0.044, 0.056, 1.44, 6);
      geometries.push(rodGeo);
      const rod = addShadow(new THREE.Mesh(rodGeo, steelMat));
      rod.position.y = 1.3;
      group.add(rod);
      for (let i = 0; i < 4; i++) {
        const ringGeo = new THREE.TorusGeometry(0.064, 0.019, 6, 8);
        geometries.push(ringGeo);
        const ring = addShadow(new THREE.Mesh(ringGeo, goldMat));
        ring.position.y = 0.8 + i * 0.32;
        ring.rotation.x = Math.PI * 0.5;
        group.add(ring);
      }
    } else {
      const shape = new THREE.Shape();
      shape.moveTo(-0.04, 0);
      shape.lineTo(0.18, 0.15);
      shape.quadraticCurveTo(0.26, 0.78, 0.02, 1.48);
      shape.lineTo(-0.06, 1.32);
      shape.lineTo(-0.05, 0);
      shape.closePath();
      const bladeGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.028,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01,
        bevelSegments: 2,
      });
      bladeGeo.center();
      geometries.push(bladeGeo);
      const blade = addShadow(new THREE.Mesh(bladeGeo, steelMat));
      blade.position.set(0.06, 1.28, 0);
      group.add(blade);
    }

    trailBase.position.set(0, 0.65, 0);
    trailTip.position.set(0.08, 2.1, 0);
  } else if (variant === 'war_bow' || variant === 'chakram_bow') {
    const bowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, -0.74, 0),
      new THREE.Vector3(0.25, -0.35, 0),
      new THREE.Vector3(0.15, 0, 0),
      new THREE.Vector3(0.25, 0.35, 0),
      new THREE.Vector3(-0.08, 0.74, 0),
    ]);
    const bowGeo = new THREE.TubeGeometry(bowCurve, 20, 0.034, 8, false);
    geometries.push(bowGeo);
    const bow = addShadow(new THREE.Mesh(bowGeo, goldMat));
    bow.position.y = 0.3;
    group.add(bow);

    const arrowGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.4, 6);
    geometries.push(arrowGeo);
    const arrow = addShadow(new THREE.Mesh(arrowGeo, steelMat));
    arrow.rotation.z = -Math.PI * 0.5;
    arrow.position.set(0.32, 0.3, 0);
    group.add(arrow);

    const tipGeo = new THREE.ConeGeometry(0.055, 0.22, 4);
    geometries.push(tipGeo);
    const tip = addShadow(new THREE.Mesh(tipGeo, steelMat));
    tip.rotation.z = -Math.PI * 0.5;
    tip.position.set(1.06, 0.3, 0);
    group.add(tip);

    trailBase.position.set(0.08, 0.1, 0);
    trailTip.position.set(1.12, 0.45, 0);
  } else if (variant === 'feather_fan') {
    const handleGeo = new THREE.CylinderGeometry(0.024, 0.03, 0.44, 8);
    geometries.push(handleGeo);
    const handle = addShadow(new THREE.Mesh(handleGeo, goldMat));
    handle.position.y = 0.18;
    group.add(handle);

    const fanMat = new THREE.MeshStandardMaterial({
      color: profile.weaponColor,
      emissive: profile.auraColor,
      emissiveIntensity: 0.28,
      roughness: 0.42,
      side: THREE.DoubleSide,
    });
    materials.push(fanMat);

    for (let i = -3; i <= 3; i++) {
      const featherGeo = new THREE.CapsuleGeometry(0.058, 0.5, 4, 6);
      geometries.push(featherGeo);
      const feather = addShadow(new THREE.Mesh(featherGeo, fanMat));
      feather.scale.set(1.12, 1.0, 0.22);
      const ang = i * 0.22;
      feather.position.set(Math.sin(ang) * 0.34, 0.58 + Math.cos(ang) * 0.28, i * 0.008);
      feather.rotation.z = -ang;
      group.add(feather);
    }

    trailBase.position.set(0, 0.38, 0);
    trailTip.position.set(0, 1.44, 0);
  } else {
    const hiltGeo = new THREE.CylinderGeometry(0.028, 0.03, 0.34, 8);
    geometries.push(hiltGeo);
    const hilt = addShadow(new THREE.Mesh(hiltGeo, shaftMat));
    hilt.position.y = 0.08;
    group.add(hilt);

    const guardGeo = new THREE.BoxGeometry(0.26, 0.065, 0.09);
    geometries.push(guardGeo);
    const guard = addShadow(new THREE.Mesh(guardGeo, goldMat));
    guard.position.y = 0.27;
    group.add(guard);

    const bladeGeo = new THREE.BoxGeometry(0.078, 1.4, 0.024);
    geometries.push(bladeGeo);
    const blade = addShadow(new THREE.Mesh(bladeGeo, steelMat));
    blade.position.y = 0.98;
    group.add(blade);

    const pointGeo = new THREE.ConeGeometry(0.048, 0.28, 4);
    geometries.push(pointGeo);
    const point = addShadow(new THREE.Mesh(pointGeo, steelMat));
    point.position.y = 1.8;
    group.add(point);

    const pommelGeo = new THREE.ConeGeometry(0.042, 0.24, 6);
    geometries.push(pommelGeo);
    const pommelTassel = addShadow(new THREE.Mesh(pommelGeo, tasselMat));
    pommelTassel.position.y = -0.18;
    group.add(pommelTassel);

    trailBase.position.set(0, 0.36, 0);
    trailTip.position.set(0, 1.98, 0);
  }

  group.add(trailBase, trailTip);
  return { group, trailBase, trailTip };
}

/** Builds a complete sculpted organic 3D Warhorse + Articulated Three Kingdoms General Rig */
export function buildMountedGeneralRig3D(
  hero: General,
  profile: HeroDuelProfile,
  textures: THREE.Texture[],
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[]
): MountedGeneralRig3D {
  const root = new THREE.Group();
  const coatPal = HORSE_COAT_PALETTES[profile.horseCoat];
  const horseTex = createHorseCoatTextures(profile.horseCoat, textures);
  const armorTex = createLamellarArmorTextures(profile.armorPrimary, profile.armorTrim, textures);
  const caparisonTex = createCaparisonTexture(profile.bardingColor, profile.armorTrim, textures);

  const coatMat = new THREE.MeshStandardMaterial({
    map: horseTex.map,
    bumpMap: horseTex.bumpMap,
    bumpScale: 0.028,
    roughness: 0.5,
    metalness: 0.08,
  });
  const maneMat = new THREE.MeshStandardMaterial({
    color: coatPal.mane,
    roughness: 0.84,
  });
  const hoofMat = new THREE.MeshStandardMaterial({
    color: coatPal.hoof,
    roughness: 0.4,
    metalness: 0.22,
  });
  const bardingMat = new THREE.MeshStandardMaterial({
    map: caparisonTex,
    roughness: 0.58,
    metalness: 0.22,
    side: THREE.DoubleSide,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    map: armorTex.map,
    bumpMap: armorTex.bumpMap,
    bumpScale: 0.05,
    roughness: 0.3,
    metalness: 0.72,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: profile.armorTrim,
    roughness: 0.24,
    metalness: 0.88,
  });
  const capeMat = new THREE.MeshStandardMaterial({
    color: profile.capeColor,
    roughness: 0.68,
    side: THREE.DoubleSide,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: '#d9a47e',
    roughness: 0.62,
  });
  const robeMat = new THREE.MeshStandardMaterial({
    color: profile.isScholarRobe ? profile.armorPrimary : profile.capeColor,
    roughness: 0.65,
  });
  const darkEyeMat = new THREE.MeshStandardMaterial({
    color: '#111114',
    roughness: 0.2,
    metalness: 0.3,
  });

  materials.push(
    coatMat,
    maneMat,
    hoofMat,
    bardingMat,
    armorMat,
    trimMat,
    capeMat,
    skinMat,
    robeMat,
    darkEyeMat
  );

  const rearPivot = new THREE.Group();
  rearPivot.position.set(-0.74, 1.24, 0);
  root.add(rearPivot);

  const horseBody = new THREE.Group();
  horseBody.position.set(0.74, 0.24, 0);
  rearPivot.add(horseBody);

  // Smooth organic anatomical warhorse barrel, muscular chest, and sculpted hindquarters
  const barrelGeo = new THREE.CapsuleGeometry(0.41, 1.12, 12, 18);
  barrelGeo.rotateZ(Math.PI * 0.5);
  geometries.push(barrelGeo);
  const barrel = addShadow(new THREE.Mesh(barrelGeo, coatMat));
  barrel.scale.set(1.0, 0.96, 0.86);
  horseBody.add(barrel);

  const chestGeo = new THREE.SphereGeometry(0.44, 16, 14);
  geometries.push(chestGeo);
  const chest = addShadow(new THREE.Mesh(chestGeo, coatMat));
  chest.position.set(0.66, 0.05, 0);
  chest.scale.set(0.98, 1.06, 0.86);
  horseBody.add(chest);

  const croupGeo = new THREE.SphereGeometry(0.43, 16, 14);
  geometries.push(croupGeo);
  const croup = addShadow(new THREE.Mesh(croupGeo, coatMat));
  croup.position.set(-0.66, 0.06, 0);
  croup.scale.set(1.04, 1.01, 0.86);
  horseBody.add(croup);

  // Han Peytral chest barding + organic barrel-hugging draped Caparison saddlecloth!
  const peytralGeo = new THREE.SphereGeometry(0.465, 14, 10, -Math.PI * 0.42, Math.PI * 0.84, 0.35, 1.45);
  geometries.push(peytralGeo);
  const peytral = addShadow(new THREE.Mesh(peytralGeo, trimMat));
  peytral.position.set(0.7, 0.03, 0);
  peytral.scale.set(0.96, 0.98, 0.86);
  horseBody.add(peytral);

  // Curved cylindrical-arch saddlecloth hugging the horse barrel organically (no boxy corners!)
  const caparisonGeo = new THREE.CylinderGeometry(
    0.455,
    0.455,
    1.28,
    18,
    1,
    true,
    -Math.PI * 0.62,
    Math.PI * 1.24
  );
  caparisonGeo.rotateZ(Math.PI * 0.5);
  caparisonGeo.rotateX(Math.PI);
  geometries.push(caparisonGeo);
  const caparison = addShadow(new THREE.Mesh(caparisonGeo, bardingMat));
  caparison.position.set(-0.04, 0.02, 0);
  caparison.scale.set(1.0, 1.0, 0.88);
  horseBody.add(caparison);

  // Sculpted Han Lacquered Saddle
  const saddleSeatGeo = new THREE.CapsuleGeometry(0.18, 0.34, 6, 10);
  saddleSeatGeo.rotateZ(Math.PI * 0.5);
  geometries.push(saddleSeatGeo);
  const saddleSeat = addShadow(new THREE.Mesh(saddleSeatGeo, trimMat));
  saddleSeat.position.set(-0.06, 0.36, 0);
  saddleSeat.scale.set(1.1, 0.55, 1.65);
  horseBody.add(saddleSeat);

  const pommel = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.44, 10), trimMat));
  pommel.rotation.x = Math.PI * 0.5;
  pommel.position.set(0.22, 0.48, 0);
  horseBody.add(pommel);

  const cantle = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.48, 10), trimMat));
  cantle.rotation.x = Math.PI * 0.5;
  cantle.position.set(-0.34, 0.5, 0);
  horseBody.add(cantle);

  // Sculpted Arched Organic Equine Neck + Smooth Anatomical Head!
  const horseNeck = new THREE.Group();
  horseNeck.position.set(0.74, 0.2, 0);
  horseBody.add(horseNeck);

  // Tapered organic neck using 2 overlapping smooth capsules + arched crest
  const neckLowerGeo = new THREE.CapsuleGeometry(0.25, 0.48, 10, 14);
  geometries.push(neckLowerGeo);
  const neckLower = addShadow(new THREE.Mesh(neckLowerGeo, coatMat));
  neckLower.position.set(0.18, 0.26, 0);
  neckLower.rotation.z = -0.58;
  neckLower.scale.set(1.06, 1.0, 0.78);
  horseNeck.add(neckLower);

  const neckUpperGeo = new THREE.CapsuleGeometry(0.175, 0.46, 10, 14);
  geometries.push(neckUpperGeo);
  const neckUpper = addShadow(new THREE.Mesh(neckUpperGeo, coatMat));
  neckUpper.position.set(0.38, 0.58, 0);
  neckUpper.rotation.z = -0.42;
  neckUpper.scale.set(1.0, 1.0, 0.76);
  horseNeck.add(neckUpper);

  // Flowing sculpted mane ridge along crest of neck
  const maneSegments: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Group();
    seg.position.set(0.02 + i * 0.1, 0.26 + i * 0.145, 0);
    const tuftGeo = new THREE.ConeGeometry(0.075, 0.26, 7);
    geometries.push(tuftGeo);
    const tuft = addShadow(new THREE.Mesh(tuftGeo, maneMat));
    tuft.position.set(-0.08, 0.04, 0);
    tuft.rotation.z = 0.72;
    seg.add(tuft);
    horseNeck.add(seg);
    maneSegments.push(seg);
  }

  // Smooth Anatomical Equine Head (cranium + cheek jaw + smooth tapered muzzle + eyes + chanfron!)
  const horseHead = new THREE.Group();
  horseHead.position.set(0.52, 0.84, 0);
  horseNeck.add(horseHead);

  const craniumGeo = new THREE.SphereGeometry(0.185, 14, 12);
  geometries.push(craniumGeo);
  const cranium = addShadow(new THREE.Mesh(craniumGeo, coatMat));
  cranium.position.set(0.04, 0.02, 0);
  cranium.scale.set(1.15, 0.92, 0.78);
  horseHead.add(cranium);

  const jawGeo = new THREE.SphereGeometry(0.145, 12, 10);
  geometries.push(jawGeo);
  const jaw = addShadow(new THREE.Mesh(jawGeo, coatMat));
  jaw.position.set(0.06, -0.09, 0);
  jaw.scale.set(1.05, 0.95, 0.82);
  horseHead.add(jaw);

  const bridgeGeo = new THREE.CylinderGeometry(0.088, 0.145, 0.44, 12);
  geometries.push(bridgeGeo);
  const bridge = addShadow(new THREE.Mesh(bridgeGeo, coatMat));
  bridge.position.set(0.27, -0.14, 0);
  bridge.rotation.z = -1.04;
  bridge.scale.set(1.0, 1.0, 0.82);
  horseHead.add(bridge);

  const noseGeo = new THREE.SphereGeometry(0.094, 12, 10);
  geometries.push(noseGeo);
  const nose = addShadow(new THREE.Mesh(noseGeo, coatMat));
  nose.position.set(0.46, -0.25, 0);
  nose.scale.set(1.15, 0.95, 0.88);
  horseHead.add(nose);

  // Gilded Han Bronze Chanfron forehead armor + leather noseband
  const chanfronGeo = new THREE.CapsuleGeometry(0.055, 0.34, 6, 8);
  geometries.push(chanfronGeo);
  const chanfron = addShadow(new THREE.Mesh(chanfronGeo, trimMat));
  chanfron.position.set(0.24, -0.05, 0);
  chanfron.rotation.z = -1.02;
  chanfron.scale.set(0.55, 1.0, 1.15);
  horseHead.add(chanfron);

  const bridleBandGeo = new THREE.TorusGeometry(0.105, 0.015, 6, 12);
  geometries.push(bridleBandGeo);
  const bridleBand = addShadow(new THREE.Mesh(bridleBandGeo, trimMat));
  bridleBand.position.set(0.36, -0.19, 0);
  bridleBand.rotation.y = Math.PI * 0.5;
  bridleBand.rotation.x = 0.52;
  horseHead.add(bridleBand);

  // Glossy Eyes & Pointed Equine Ears
  for (const side of [-1, 1]) {
    const earGeo = new THREE.ConeGeometry(0.042, 0.19, 7);
    geometries.push(earGeo);
    const ear = addShadow(new THREE.Mesh(earGeo, coatMat));
    ear.position.set(-0.02, 0.19, side * 0.085);
    ear.rotation.z = -0.18;
    ear.rotation.x = side * 0.12;
    horseHead.add(ear);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), darkEyeMat);
    eye.position.set(0.13, 0.02, side * 0.125);
    horseHead.add(eye);
  }

  // Flowing Sculpted Multi-Segment Tail
  const tailSegments: THREE.Group[] = [];
  let tailParent: THREE.Object3D = horseBody;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    if (i === 0) {
      seg.position.set(-1.02, 0.19, 0);
    } else {
      seg.position.set(-0.15, -0.22, 0);
    }
    const hairGeo = new THREE.CapsuleGeometry(0.072 - i * 0.013, 0.22, 6, 8);
    geometries.push(hairGeo);
    const hair = addShadow(new THREE.Mesh(hairGeo, maneMat));
    hair.position.set(-0.07, -0.11, 0);
    hair.rotation.z = -0.52;
    seg.add(hair);
    tailParent.add(seg);
    tailParent = seg;
    tailSegments.push(seg);
  }

  // 4 Articulated 3-Segment Legs
  const fl = buildHorseLeg(coatMat, hoofMat, true, geometries);
  fl.upper.position.set(0.66, -0.24, -0.25);
  horseBody.add(fl.upper);

  const fr = buildHorseLeg(coatMat, hoofMat, true, geometries);
  fr.upper.position.set(0.66, -0.24, 0.25);
  horseBody.add(fr.upper);

  const rl = buildHorseLeg(coatMat, hoofMat, false, geometries);
  rl.upper.position.set(0.04, 0, -0.25);
  rearPivot.add(rl.upper);

  const rr = buildHorseLeg(coatMat, hoofMat, false, geometries);
  rr.upper.position.set(0.04, 0, 0.25);
  rearPivot.add(rr.upper);

  // ======================== ARTICULATED 3D GENERAL ========================
  const riderRoot = new THREE.Group();
  riderRoot.position.set(-0.06, 0.45, 0);
  horseBody.add(riderRoot);

  const pelvis = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.24, 12), armorMat));
  pelvis.position.y = 0.08;
  pelvis.scale.set(0.85, 1, 1.1);
  riderRoot.add(pelvis);

  for (const side of [-1, 1]) {
    const thigh = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 6, 8), armorMat));
    thigh.position.set(0.12, -0.16, side * 0.37);
    thigh.rotation.z = 0.55;
    riderRoot.add(thigh);

    const shin = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.36, 6, 8), trimMat));
    shin.position.set(0.2, -0.5, side * 0.41);
    shin.rotation.z = -0.18;
    riderRoot.add(shin);

    // Layered Han Armored Hip Tassets (战裙甲片)
    const tasset = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.055), armorMat));
    tasset.position.set(-0.02, -0.09, side * 0.31);
    tasset.rotation.x = side * -0.26;
    riderRoot.add(tasset);

    const tassetTrim = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.065), trimMat));
    tassetTrim.position.set(-0.02, -0.27, side * 0.35);
    tassetTrim.rotation.x = side * -0.26;
    riderRoot.add(tassetTrim);
  }

  // Torso
  const torso = new THREE.Group();
  torso.position.y = 0.16;
  riderRoot.add(torso);

  const cuirassGeo = new THREE.CylinderGeometry(
    profile.isHeroine ? 0.22 : 0.275,
    0.205,
    0.64,
    14
  );
  geometries.push(cuirassGeo);
  const cuirass = addShadow(new THREE.Mesh(cuirassGeo, profile.isScholarRobe ? robeMat : armorMat));
  cuirass.position.y = 0.34;
  cuirass.scale.set(0.84, 1, 1.18);
  torso.add(cuirass);

  const belt = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.11, 12), trimMat));
  belt.position.y = 0.08;
  belt.scale.set(0.88, 1, 1.2);
  torso.add(belt);

  // Ornate Bronze Breast Mirror (护心镜) & Collar Gorge
  const mirrorBoss = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 12), trimMat));
  mirrorBoss.position.set(0.22, 0.42, 0);
  mirrorBoss.scale.set(0.32, 1, 1);
  torso.add(mirrorBoss);

  const collarGorge = addShadow(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.032, 8, 14), trimMat));
  collarGorge.rotation.x = Math.PI * 0.5;
  collarGorge.position.y = 0.66;
  torso.add(collarGorge);

  // Broad Layered Han Shoulder Pauldrons
  for (const side of [-1, 1]) {
    const pauldron = addShadow(
      new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65), armorMat)
    );
    pauldron.position.set(0, 0.6, side * 0.34);
    pauldron.rotation.x = side * 0.44;
    torso.add(pauldron);

    const pauldronTrim = addShadow(
      new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.025, 6, 12), trimMat)
    );
    pauldronTrim.position.set(0, 0.56, side * 0.35);
    pauldronTrim.rotation.x = Math.PI * 0.5 + side * 0.34;
    torso.add(pauldronTrim);
  }

  // Multi-segment billowing 3D Silk Cape!
  const capeSegments: THREE.Group[] = [];
  let capeParent: THREE.Object3D = torso;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    if (i === 0) {
      seg.position.set(-0.21, 0.62, 0);
    } else {
      seg.position.set(0, -0.28, 0);
    }
    const cloth = addShadow(
      new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.56 + i * 0.09), capeMat)
    );
    cloth.position.y = -0.14;
    seg.add(cloth);
    capeParent.add(seg);
    capeParent = seg;
    capeSegments.push(seg);
  }

  // Sculpted Head + Brow + Iconic Hero Headgear / Plumes / Beard
  const head = new THREE.Group();
  head.position.set(0.03, 0.8, 0);
  torso.add(head);

  const face = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 14), skinMat));
  face.scale.set(0.96, 1.08, 0.92);
  head.add(face);

  // Subtle sculpted eyes & fierce warrior brow
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), darkEyeMat);
    eye.position.set(0.135, 0.01, side * 0.055);
    head.add(eye);
  }

  if (profile.hasLongBeard) {
    const beardMat = new THREE.MeshStandardMaterial({
      color: hero.id === 'huangzhong' || hero.id === 'huatuo' ? '#e2e8f0' : '#111114',
      roughness: 0.85,
    });
    materials.push(beardMat);
    const beard = addShadow(new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.48, 8), beardMat));
    beard.position.set(0.115, -0.26, 0);
    beard.rotation.z = Math.PI - 0.14;
    head.add(beard);
  }

  const plumeLeftSegments: THREE.Group[] = [];
  const plumeRightSegments: THREE.Group[] = [];

  if (profile.headgear === 'pheasant_crown') {
    const crown = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.17, 0.21, 10), trimMat));
    crown.position.y = 0.14;
    head.add(crown);

    const plumeMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      emissive: '#991b1b',
      emissiveIntensity: 0.35,
      roughness: 0.5,
    });
    materials.push(plumeMat);

    for (const side of [-1, 1]) {
      const targetArr = side < 0 ? plumeLeftSegments : plumeRightSegments;
      let parent: THREE.Object3D = head;
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Group();
        if (i === 0) {
          seg.position.set(-0.02, 0.24, side * 0.08);
        } else {
          seg.position.set(-0.28, 0.11 - i * 0.03, side * 0.04);
        }
        const feather = addShadow(
          new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.024, 0.36, 6), plumeMat)
        );
        feather.rotation.z = Math.PI * 0.38;
        feather.position.set(-0.14, 0.06, 0);
        seg.add(feather);
        parent.add(seg);
        parent = seg;
        targetArr.push(seg);
      }
    }
  } else if (profile.headgear === 'green_hood') {
    const cap = addShadow(
      new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), capeMat)
    );
    cap.position.y = 0.03;
    head.add(cap);
    const band = addShadow(new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.022, 6, 14), trimMat));
    band.rotation.x = Math.PI * 0.5;
    band.position.y = 0.06;
    head.add(band);
  } else if (profile.headgear === 'scholar_crown') {
    const crownBase = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.165, 0.15, 10), robeMat));
    crownBase.position.y = 0.12;
    head.add(crownBase);
    const topPin = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, 0.06), trimMat));
    topPin.position.set(-0.02, 0.24, 0);
    head.add(topPin);
  } else if (profile.headgear === 'phoenix_hairpin') {
    const hair = addShadow(
      new THREE.Mesh(new THREE.SphereGeometry(0.168, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65), maneMat)
    );
    hair.position.y = 0.02;
    head.add(hair);
    const tiara = addShadow(new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.025, 6, 12, Math.PI), trimMat));
    tiara.position.set(0.05, 0.14, 0);
    tiara.rotation.y = Math.PI * 0.5;
    head.add(tiara);
  } else if (profile.headgear === 'imperial_crown') {
    const crown = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.168, 0.18, 10), trimMat));
    crown.position.y = 0.13;
    head.add(crown);
    const gem = addShadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.055), capeMat));
    gem.position.set(0.15, 0.15, 0);
    head.add(gem);
  } else if (profile.headgear === 'bandana_crest') {
    const band = addShadow(new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.034, 6, 14), capeMat));
    band.rotation.x = Math.PI * 0.5;
    band.position.y = 0.06;
    head.add(band);
    const crest = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.1), trimMat));
    crest.position.set(0.15, 0.08, 0);
    head.add(crest);
  } else {
    const dome = addShadow(
      new THREE.Mesh(new THREE.SphereGeometry(0.176, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), armorMat)
    );
    dome.position.y = 0.02;
    head.add(dome);
    const visor = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.032, 0.24), trimMat));
    visor.position.set(0.13, 0.06, 0);
    head.add(visor);
    const finial = addShadow(new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.17, 6), trimMat));
    finial.position.y = 0.22;
    head.add(finial);
    const crestPlume = addShadow(new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.36, 8), capeMat));
    crestPlume.position.set(-0.15, 0.24, 0);
    crestPlume.rotation.z = 1.05;
    head.add(crestPlume);
  }

  // Right Arm (Primary Weapon Hand on +Z side)
  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(0.04, 0.58, 0.34);
  torso.add(rightShoulder);

  const rUpperArm = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.28, 6, 8), armorMat));
  rUpperArm.position.y = -0.16;
  rightShoulder.add(rUpperArm);

  const rightElbow = new THREE.Group();
  rightElbow.position.y = -0.32;
  rightShoulder.add(rightElbow);

  const rForeArm = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 6, 8), trimMat));
  rForeArm.position.set(0.14, 0, 0);
  rForeArm.rotation.z = -Math.PI * 0.5;
  rightElbow.add(rForeArm);

  const builtWeapon = buildSignatureWeapon3D(profile, geometries, materials);
  builtWeapon.group.position.set(0.3, 0, 0);
  rightElbow.add(builtWeapon.group);

  // Left Arm
  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(0.04, 0.58, -0.34);
  torso.add(leftShoulder);

  const lUpperArm = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.28, 6, 8), armorMat));
  lUpperArm.position.y = -0.16;
  leftShoulder.add(lUpperArm);

  const leftElbow = new THREE.Group();
  leftElbow.position.y = -0.32;
  leftShoulder.add(leftElbow);

  const lForeArm = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 6, 8), trimMat));
  lForeArm.position.set(0.14, 0, 0);
  lForeArm.rotation.z = -Math.PI * 0.5;
  leftElbow.add(lForeArm);

  if (profile.weaponVariant === 'twin_swords' || profile.weaponVariant === 'twin_ji') {
    const offSword = buildSignatureWeapon3D(
      { ...profile, weaponVariant: profile.weaponVariant === 'twin_ji' ? 'tiger_saber' : 'imperial_jian' },
      geometries,
      materials
    );
    offSword.group.scale.setScalar(0.84);
    offSword.group.position.set(0.28, 0, 0);
    leftElbow.add(offSword.group);
  }

  return {
    root,
    rearPivot,
    horseBody,
    horseNeck,
    horseHead,
    legs: { fl, fr, rl, rr },
    tailSegments,
    maneSegments,
    riderRoot,
    torso,
    head,
    rightShoulder,
    rightElbow,
    leftShoulder,
    leftElbow,
    capeSegments,
    plumeLeftSegments,
    plumeRightSegments,
    weaponGroup: builtWeapon.group,
    trailBase: builtWeapon.trailBase,
    trailTip: builtWeapon.trailTip,
    profile,
    gaitPhase: 0,
    hoofStepAccumulator: 0,
  };
}

/** Updates a MountedGeneralRig3D every frame from sampled choreography state */
export function applyRigPose3D(
  rig: MountedGeneralRig3D,
  frame: RiderFrameState,
  dt: number,
  elapsedSec: number
): THREE.Vector3[] {
  const hoofContacts: THREE.Vector3[] = [];

  rig.root.position.set(frame.x, 0, frame.z);
  rig.root.rotation.y = frame.yaw;

  const strideFreq =
    frame.gait === 'gallop'
      ? 11.5 * frame.gaitSpeed
      : frame.gait === 'trot'
        ? 6.4 * frame.gaitSpeed
        : frame.gait === 'idle'
          ? 2.1
          : 4.0;
  rig.gaitPhase += dt * strideFreq;

  const p = rig.gaitPhase;

  const gallopBounce =
    frame.gait === 'gallop'
      ? Math.sin(p * 2) * 0.13
      : frame.gait === 'trot'
        ? Math.sin(p * 2) * 0.06
        : Math.sin(elapsedSec * 2.2) * 0.015;

  rig.rearPivot.position.y = 1.24 + gallopBounce;
  rig.rearPivot.rotation.z = frame.rearAngle + frame.bodyPitch;

  rig.horseNeck.rotation.z =
    frame.gait === 'gallop'
      ? -0.16 + Math.sin(p) * 0.11
      : frame.gait === 'rear'
        ? -0.24 + Math.sin(elapsedSec * 8) * 0.07
        : frame.gait === 'skid'
          ? 0.22
          : Math.sin(elapsedSec * 2.0) * 0.05;
  rig.horseHead.rotation.z =
    frame.gait === 'gallop'
      ? Math.cos(p) * 0.11
      : frame.gait === 'rear'
        ? -0.22
        : Math.sin(elapsedSec * 2.4) * 0.05;

  const updateLeg = (leg: LegJoint3D, phaseOffset: number, isFront: boolean) => {
    let upperRot = 0;
    let lowerRot = 0;

    if (frame.gait === 'gallop' || frame.gait === 'trot') {
      const amp = frame.gait === 'gallop' ? 0.82 : 0.42;
      const s = Math.sin(p + phaseOffset);
      const c = Math.cos(p + phaseOffset);
      upperRot = s * amp + (isFront ? 0.12 : -0.12);
      lowerRot = isFront ? -Math.max(0, c) * (amp * 1.15) : Math.max(0, -c) * (amp * 0.9);
    } else if (frame.gait === 'rear') {
      if (isFront) {
        upperRot = 0.95 + Math.sin(elapsedSec * 12 + phaseOffset) * 0.26;
        lowerRot = -1.15 + Math.cos(elapsedSec * 12 + phaseOffset) * 0.25;
      } else {
        upperRot = -0.22 - frame.rearAngle * 0.65;
        lowerRot = 0.25;
      }
    } else if (frame.gait === 'skid' || frame.gait === 'stagger') {
      upperRot = isFront ? 0.56 : -0.52;
      lowerRot = isFront ? -0.18 : 0.34;
    } else {
      if (isFront && phaseOffset > 2) {
        const paw = Math.max(0, Math.sin(elapsedSec * 1.35) - 0.68) * 2.2;
        upperRot = paw * 0.45;
        lowerRot = -paw * 0.65;
      } else {
        upperRot = Math.sin(elapsedSec * 1.6 + phaseOffset) * 0.04;
        lowerRot = 0;
      }
    }

    leg.upper.rotation.z = upperRot;
    leg.lower.rotation.z = lowerRot;

    if (frame.gait === 'gallop' || frame.gait === 'trot' || frame.gait === 'skid') {
      const worldPos = new THREE.Vector3();
      leg.hoofAnchor.getWorldPosition(worldPos);
      if (leg.prevHoofY > 0.14 && worldPos.y <= 0.14) {
        hoofContacts.push(new THREE.Vector3(worldPos.x, 0.06, worldPos.z));
      }
      leg.prevHoofY = worldPos.y;
    }
  };

  updateLeg(rig.legs.rl, 0.0, false);
  updateLeg(rig.legs.rr, 0.85, false);
  updateLeg(rig.legs.fl, 2.35, true);
  updateLeg(rig.legs.fr, 3.2, true);

  const windDrag = frame.gait === 'gallop' ? 0.65 : frame.gait === 'trot' ? 0.32 : 0.1;
  rig.tailSegments.forEach((seg, i) => {
    seg.rotation.z = -windDrag * (0.55 + i * 0.25) + Math.sin(elapsedSec * 6.5 - i * 0.8) * 0.12;
  });
  rig.maneSegments.forEach((seg, i) => {
    seg.rotation.z = -windDrag * 0.45 + Math.sin(elapsedSec * 7.5 - i * 0.6) * 0.1;
  });

  rig.riderRoot.rotation.z = -frame.rearAngle * 0.58 - frame.bodyPitch * 0.4;

  const t = frame.poseBlend;
  const fatigueLean = frame.fatigue * 0.16;
  let torsoLean = -0.06 - fatigueLean;
  let torsoTwist = 0;
  let rShZ = 0.25;
  let rShY = 0.18;
  let rShX = 0.1;
  let rElbZ = 0.48;
  let lShZ = 0.55;
  let lElbZ = 0.35;

  switch (frame.pose) {
    case 'salute': {
      torsoLean = 0.08;
      rShZ = 1.95 * t + 0.35 * (1 - t);
      rShY = -0.15;
      rElbZ = 0.25;
      lShZ = 0.72;
      break;
    }
    case 'charge_windup': {
      torsoLean = -0.26;
      torsoTwist = -0.45 * t;
      rShZ = 1.65 * t + 0.4;
      rShY = -0.55 * t;
      rElbZ = 0.65;
      lShZ = 0.95;
      break;
    }
    case 'slash_overhead': {
      const swing = Math.sin(Math.min(1, t) * Math.PI * 0.85);
      torsoLean = -0.35 * swing;
      torsoTwist = -0.55 + t * 1.25;
      rShZ = 2.35 - t * 2.55;
      rShY = -0.35 + t * 0.85;
      rShX = 0.22;
      rElbZ = 0.18 + (1 - swing) * 0.45;
      lShZ = 0.7;
      break;
    }
    case 'slash_sweep': {
      torsoLean = -0.24;
      torsoTwist = -0.75 + t * 1.65;
      rShZ = 0.95;
      rShY = -1.15 + t * 2.35;
      rShX = 0.75;
      rElbZ = 0.2;
      lShZ = 0.82;
      break;
    }
    case 'thrust': {
      const lunge = Math.sin(Math.min(1, t) * Math.PI);
      torsoLean = -0.32 * lunge;
      torsoTwist = 0.38 * lunge;
      rShZ = 0.75 + 0.35 * lunge;
      rShY = 0.2;
      rShX = 0.2;
      rElbZ = 1.15 - lunge * 1.05;
      lShZ = 1.05;
      break;
    }
    case 'guard_parry': {
      torsoLean = 0.08;
      torsoTwist = 0.42;
      rShZ = 1.38;
      rShY = 0.78;
      rShX = -0.45;
      rElbZ = 0.88;
      lShZ = 0.95;
      lElbZ = 0.75;
      break;
    }
    case 'evade_duck': {
      torsoLean = -0.62 * Math.sin(Math.min(1, t) * Math.PI);
      torsoTwist = -0.45;
      rShZ = 0.15;
      rShY = -0.6;
      rElbZ = 0.55;
      break;
    }
    case 'stagger_hit': {
      const recoil = Math.sin(Math.min(1, t) * Math.PI);
      torsoLean = 0.44 * recoil;
      torsoTwist = -0.45 * recoil;
      rShZ = 1.45 * recoil;
      rShY = -0.6 * recoil;
      rElbZ = 0.3;
      break;
    }
    case 'victory_raise': {
      torsoLean = 0.12;
      torsoTwist = 0.15;
      rShZ = 2.48 + Math.sin(elapsedSec * 5) * 0.08;
      rShY = 0.1;
      rElbZ = 0.14;
      lShZ = 0.8;
      break;
    }
    case 'defeat_slump': {
      torsoLean = -0.48;
      torsoTwist = 0.2;
      rShZ = -0.25;
      rElbZ = 0.35;
      lShZ = 0.25;
      break;
    }
    default: {
      const breathe = Math.sin(elapsedSec * (2.6 + frame.fatigue * 2.2));
      torsoLean = -0.05 - fatigueLean + breathe * 0.03;
      rShZ = 0.58 + breathe * 0.06;
      rShY = 0.22;
      rElbZ = 0.62;
      lShZ = 0.68;
      break;
    }
  }

  rig.torso.rotation.z = torsoLean;
  rig.torso.rotation.y = torsoTwist;
  rig.head.rotation.y = -torsoTwist * 0.55;
  rig.head.rotation.z = -torsoLean * 0.45;

  rig.rightShoulder.rotation.set(rShX, rShY, rShZ);
  rig.rightElbow.rotation.z = rElbZ;
  rig.leftShoulder.rotation.set(-0.1, -0.2, lShZ);
  rig.leftElbow.rotation.z = lElbZ;

  rig.weaponGroup.visible = !frame.disarmed;

  const capeBillow =
    frame.gait === 'gallop' ? 0.52 : frame.gait === 'rear' ? 0.42 : frame.gait === 'trot' ? 0.24 : 0.12;
  rig.capeSegments.forEach((seg, i) => {
    const wave = Math.sin(elapsedSec * (5.8 + windDrag * 4) - i * 0.95) * (0.09 + capeBillow * 0.16);
    seg.rotation.z = -(capeBillow * (0.55 + i * 0.18)) + wave;
  });

  const animatePlumes = (segs: THREE.Group[], phaseOff: number) => {
    segs.forEach((seg, i) => {
      seg.rotation.z =
        -windDrag * 0.3 + Math.sin(elapsedSec * 6.2 - i * 0.7 + phaseOff) * (0.08 + i * 0.03);
      seg.rotation.y = Math.cos(elapsedSec * 4.1 + phaseOff + i * 0.5) * 0.08;
    });
  };
  animatePlumes(rig.plumeLeftSegments, 0);
  animatePlumes(rig.plumeRightSegments, 1.3);

  return hoofContacts;
}

/** Builds the complete 3D Duel Arena with Studio-Painted HD Panoramic Cyclorama, Armored Army Ring & Banners */
export function buildDuelArena3D(
  attacker: General,
  defender: General,
  terrain: TerrainType,
  isNight: boolean,
  theme: VisualThemeId,
  textures: THREE.Texture[],
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[]
): DuelArena3D {
  const group = new THREE.Group();
  const banners: ArenaBanner3D[] = [];
  const brazierLights: THREE.PointLight[] = [];
  const brazierFlames: THREE.Mesh[] = [];

  // 1. Atmospheric Zenith Sky Dome + Studio-Painted HD Panoramic Horizon Cyclorama!
  const skyTex = createSkyDomeTexture(terrain, isNight, theme, textures);
  const skyGeo = new THREE.SphereGeometry(76, 32, 20);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
  geometries.push(skyGeo);
  materials.push(skyMat);
  group.add(new THREE.Mesh(skyGeo, skyMat));

  const panoTex = createPaintedPanoramaTexture(terrain, isNight, textures);
  const panoGeo = new THREE.CylinderGeometry(48, 48, 28, 48, 1, true);
  const panoMat = new THREE.MeshBasicMaterial({
    map: panoTex,
    side: THREE.BackSide,
    transparent: true,
    opacity: isNight ? 0.62 : 0.88,
    fog: false,
  });
  geometries.push(panoGeo);
  materials.push(panoMat);
  const pano = new THREE.Mesh(panoGeo, panoMat);
  pano.position.y = 10.5;
  group.add(pano);

  // 2. Sculpted Circular Battleground Ground Plane
  const groundTex = createArenaGroundTextures(terrain, isNight, theme, textures);
  const groundGeo = new THREE.CircleGeometry(46, 56);
  groundGeo.rotateX(-Math.PI * 0.5);
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex.map,
    bumpMap: groundTex.bumpMap,
    bumpScale: 0.14,
    roughness: 0.92,
    metalness: 0.02,
  });
  geometries.push(groundGeo);
  materials.push(groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // 3. Terrain-Specific 3D Arena Props (River shimmer / Fortress Crenelations & Braziers / Wooden Stakes)
  let waterMesh: THREE.Mesh | undefined;
  if (terrain === 'river') {
    const waterGeo = new THREE.PlaneGeometry(92, 30);
    waterGeo.rotateX(-Math.PI * 0.5);
    const waterMat = new THREE.MeshStandardMaterial({
      color: isNight ? '#10243b' : '#264d6d',
      roughness: 0.22,
      metalness: 0.62,
    });
    geometries.push(waterGeo);
    materials.push(waterMat);
    waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.set(0, 0.04, -22);
    group.add(waterMesh);
  }

  // Always add wooden cheval-de-frise / arena perimeter stakes on plains & mountain for grounded depth
  const stakeMat = new THREE.MeshStandardMaterial({ color: '#4c321e', roughness: 0.88 });
  materials.push(stakeMat);
  if (terrain === 'plains' || terrain === 'mountain') {
    const stakeGeo = new THREE.CylinderGeometry(0.05, 0.08, 1.55, 6);
    geometries.push(stakeGeo);
    for (let i = 0; i < 16; i++) {
      const ang = Math.PI * 0.12 + (i / 15) * Math.PI * 0.76;
      const r = 13.8;
      const sx = Math.cos(ang) * r;
      const sz = -Math.sin(ang) * r * 0.85 - 1.2;
      const s1 = new THREE.Mesh(stakeGeo, stakeMat);
      s1.position.set(sx, 0.55, sz);
      s1.rotation.z = 0.42;
      const s2 = new THREE.Mesh(stakeGeo, stakeMat);
      s2.position.set(sx + 0.25, 0.55, sz);
      s2.rotation.z = -0.42;
      group.add(s1, s2);
    }
  }

  if (terrain === 'fortress' || isNight) {
    // Illuminated Han Crenelated Stone Battlement Wall + Framed Roaring 3D Fire Braziers!
    const wallMat = new THREE.MeshStandardMaterial({ color: '#463f38', roughness: 0.88 });
    const emberMat = new THREE.MeshBasicMaterial({ color: '#fb923c' });
    const coreFlameMat = new THREE.MeshBasicMaterial({ color: '#fef08a' });
    const ironMat = new THREE.MeshStandardMaterial({ color: '#272320', metalness: 0.65, roughness: 0.42 });
    materials.push(wallMat, emberMat, coreFlameMat, ironMat);

    const wallGeo = new THREE.BoxGeometry(44, 4.2, 2.0);
    geometries.push(wallGeo);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 2.1, -15.8);
    group.add(wall);

    // Battlement merlons along top of wall
    const merlonGeo = new THREE.BoxGeometry(1.5, 1.1, 2.1);
    geometries.push(merlonGeo);
    for (let mx = -19; mx <= 19; mx += 2.8) {
      const merlon = new THREE.Mesh(merlonGeo, wallMat);
      merlon.position.set(mx, 4.7, -15.8);
      group.add(merlon);
    }

    // 4 Iron Fire Braziers positioned cleanly inside camera framing!
    const brazierCoords = [
      [-6.8, -5.6],
      [6.8, -5.6],
      [-10.2, -1.2],
      [10.2, -1.2],
    ];
    for (const [bx, bz] of brazierCoords) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 1.25, 8), ironMat);
      stand.position.set(bx, 0.62, bz);
      group.add(stand);

      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.24, 0.34, 10), ironMat);
      bowl.position.set(bx, 1.38, bz);
      group.add(bowl);

      const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.92, 8), emberMat);
      flameOuter.position.set(bx, 1.92, bz);
      group.add(flameOuter);
      brazierFlames.push(flameOuter);

      const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.56, 7), coreFlameMat);
      flameCore.position.set(bx, 1.78, bz);
      group.add(flameCore);

      const pLight = new THREE.PointLight('#ff943d', 3.6, 20, 1.4);
      pLight.position.set(bx, 2.6, bz + 0.4);
      group.add(pLight);
      brazierLights.push(pLight);
    }
  }

  // 4. Sculpted Armored Han Watching Army Phalanx (Helmets, Shoulders, Kite Shields & Glinting Pikes!)
  const leftSpectators = new THREE.Group();
  const rightSpectators = new THREE.Group();
  group.add(leftSpectators, rightSpectators);

  const atkPal = FACTION_HEX[attacker.faction] || FACTION_HEX.shu;
  const defPal = FACTION_HEX[defender.faction] || FACTION_HEX.wei;

  const poleMat = new THREE.MeshStandardMaterial({ color: '#442b18', roughness: 0.85 });
  const spearMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.85, roughness: 0.2 });
  const leftArmorMat = new THREE.MeshStandardMaterial({ color: atkPal.bg, roughness: 0.55, metalness: 0.35 });
  const rightArmorMat = new THREE.MeshStandardMaterial({ color: defPal.bg, roughness: 0.55, metalness: 0.35 });
  const helmIronMat = new THREE.MeshStandardMaterial({ color: '#333842', metalness: 0.65, roughness: 0.38 });
  const shieldTrimMat = new THREE.MeshStandardMaterial({ color: '#d4a853', metalness: 0.72, roughness: 0.32 });
  materials.push(poleMat, spearMat, leftArmorMat, rightArmorMat, helmIronMat, shieldTrimMat);

  const torsoGeo = new THREE.CylinderGeometry(0.24, 0.22, 0.78, 8);
  const skirtGeo = new THREE.CylinderGeometry(0.24, 0.31, 0.58, 8);
  const helmGeo = new THREE.ConeGeometry(0.25, 0.24, 8);
  const shieldGeo = new THREE.BoxGeometry(0.42, 0.82, 0.08);
  const spearShaftGeo = new THREE.CylinderGeometry(0.022, 0.024, 3.3, 5);
  const spearBladeGeo = new THREE.ConeGeometry(0.052, 0.42, 4);
  geometries.push(torsoGeo, skirtGeo, helmGeo, shieldGeo, spearShaftGeo, spearBladeGeo);

  const populateArmyArc = (side: 'left' | 'right', targetGroup: THREE.Group, mat: THREE.Material) => {
    const count = 14;
    for (let i = 0; i < count; i++) {
      const frac = i / (count - 1);
      const angle =
        side === 'left'
          ? Math.PI * 0.68 + frac * Math.PI * 0.54
          : Math.PI * 0.32 - frac * Math.PI * 0.54;
      const radius = 14.2 + (i % 2) * 1.8;
      const sx = Math.cos(angle) * radius;
      const sz = -Math.abs(Math.sin(angle) * radius) * 0.8 - 2.6;

      const soldier = new THREE.Group();
      soldier.position.set(sx, 0, sz);
      soldier.lookAt(0, 0, 0);

      const skirt = new THREE.Mesh(skirtGeo, mat);
      skirt.position.y = 0.32;
      soldier.add(skirt);

      const torso = new THREE.Mesh(torsoGeo, mat);
      torso.position.y = 0.96;
      torso.scale.set(1.18, 1, 0.85);
      soldier.add(torso);

      const helm = new THREE.Mesh(helmGeo, helmIronMat);
      helm.position.y = 1.54;
      soldier.add(helm);

      // Han war shield resting on front arm
      const shield = new THREE.Mesh(shieldGeo, mat);
      shield.position.set(-0.24, 0.88, 0.22);
      shield.rotation.y = 0.22;
      soldier.add(shield);

      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), shieldTrimMat);
      boss.position.set(-0.24, 0.9, 0.27);
      boss.scale.set(1, 1, 0.4);
      soldier.add(boss);

      // Glinting long Han pike
      const spear = new THREE.Mesh(spearShaftGeo, poleMat);
      spear.position.set(0.26, 1.7, 0.08);
      spear.rotation.z = -0.06;
      soldier.add(spear);

      const tip = new THREE.Mesh(spearBladeGeo, spearMat);
      tip.position.set(0.36, 3.45, 0.08);
      tip.rotation.z = -0.06;
      soldier.add(tip);

      targetGroup.add(soldier);
    }
  };

  populateArmyArc('left', leftSpectators, leftArmorMat);
  populateArmyArc('right', rightSpectators, rightArmorMat);

  // 6 Large Vertex-Waving Calligraphy Silk War Banners
  const factionChar = (f: FactionId) =>
    f === 'wei' ? '魏' : f === 'shu' ? '蜀' : f === 'wu' ? '吴' : '汉';

  const bannerSpecs: Array<{
    x: number;
    z: number;
    glyph: string;
    bg: string;
    trim: string;
    side: 'left' | 'right';
  }> = [
    { x: -11.4, z: -7.2, glyph: attacker.seal, bg: atkPal.bg, trim: atkPal.trim, side: 'left' },
    { x: -7.6, z: -10.8, glyph: factionChar(attacker.faction), bg: atkPal.bg, trim: atkPal.trim, side: 'left' },
    { x: -13.6, z: -2.0, glyph: factionChar(attacker.faction), bg: atkPal.bg, trim: atkPal.trim, side: 'left' },
    { x: 11.4, z: -7.2, glyph: defender.seal, bg: defPal.bg, trim: defPal.trim, side: 'right' },
    { x: 7.6, z: -10.8, glyph: factionChar(defender.faction), bg: defPal.bg, trim: defPal.trim, side: 'right' },
    { x: 13.6, z: -2.0, glyph: factionChar(defender.faction), bg: defPal.bg, trim: defPal.trim, side: 'right' },
  ];

  bannerSpecs.forEach((b, idx) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 6.2, 8), poleMat);
    pole.position.set(b.x, 3.1, b.z);
    group.add(pole);

    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 6), poleMat);
    crossbar.rotation.z = Math.PI * 0.5;
    crossbar.position.set(b.x + (b.side === 'left' ? 0.65 : -0.65), 5.85, b.z);
    group.add(crossbar);

    const tex = createSilkBannerTexture(b.glyph, b.bg, b.trim, textures);
    const clothGeo = new THREE.PlaneGeometry(1.38, 2.75, 6, 10);
    geometries.push(clothGeo);
    const clothMat = new THREE.MeshStandardMaterial({
      map: tex,
      side: THREE.DoubleSide,
      roughness: 0.68,
    });
    materials.push(clothMat);

    const mesh = new THREE.Mesh(clothGeo, clothMat);
    mesh.position.set(b.x + (b.side === 'left' ? 0.68 : -0.68), 4.45, b.z);
    group.add(mesh);

    const posAttr = clothGeo.attributes.position as THREE.BufferAttribute;
    banners.push({
      mesh,
      basePositions: new Float32Array(posAttr.array as Float32Array),
      phase: idx * 1.15,
      side: b.side,
    });
  });

  return {
    group,
    banners,
    brazierLights,
    brazierFlames,
    waterMesh,
    spectatorGroups: { left: leftSpectators, right: rightSpectators },
  };
}
