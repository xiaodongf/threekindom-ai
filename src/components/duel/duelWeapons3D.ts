import * as THREE from 'three';
import type { DuelWeaponVariant, HeroDuelProfile } from '../../game/heroDuelProfiles.js';
import type { DisposeBag } from './duelGeometry3D.js';
import { shadowMesh } from './duelGeometry3D.js';

export type WeaponStyle = 'pole' | 'spear' | 'short';

const POLEARMS: DuelWeaponVariant[] = [
  'crescent_blade',
  'great_axe',
  'fangtian_halberd',
  'dragon_lance',
  'serpent_spear',
];

export function isPolearmVariant(variant: DuelWeaponVariant): boolean {
  return POLEARMS.includes(variant);
}

/** How a hero handles their weapon in the saddle: two-handed polearm, couched spear or one-handed arm. */
export function weaponStyleOf(profile: HeroDuelProfile): WeaponStyle {
  if (!isPolearmVariant(profile.weaponVariant)) return 'short';
  return profile.weaponVariant === 'dragon_lance' || profile.weaponVariant === 'serpent_spear'
    ? 'spear'
    : 'pole';
}

/** Distance from the grip to the tip, in rider units (before the rider scale is applied). */
export function weaponLengthOf(profile: HeroDuelProfile): number {
  return isPolearmVariant(profile.weaponVariant) ? 3.0 : 2.2;
}

export interface BuiltWeapon3D {
  /** Local +Y runs from the grip to the tip; local +X is the cutting edge */
  group: THREE.Group;
  trailBase: THREE.Object3D;
  trailTip: THREE.Object3D;
}

const EXTRUDE = {
  depth: 0.03,
  bevelEnabled: true,
  bevelThickness: 0.012,
  bevelSize: 0.012,
  bevelSegments: 2,
};

function extruded(bag: DisposeBag, shape: THREE.Shape, mat: THREE.Material): THREE.Mesh {
  const geo = bag.add(new THREE.ExtrudeGeometry(shape, EXTRUDE));
  geo.translate(0, 0, -EXTRUDE.depth * 0.5);
  return shadowMesh(geo, mat);
}

/** Builds one of the Three Kingdoms signature weapons, held at the origin. */
export function buildSignatureWeapon3D(
  profile: HeroDuelProfile,
  bag: DisposeBag,
  variantOverride?: DuelWeaponVariant
): BuiltWeapon3D {
  const variant = variantOverride ?? profile.weaponVariant;
  const group = new THREE.Group();

  const steelMat = bag.add(
    new THREE.MeshStandardMaterial({
      color: profile.weaponColor,
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 1.6,
    })
  );
  const goldMat = bag.add(
    new THREE.MeshStandardMaterial({ color: profile.armorTrim, metalness: 1, roughness: 0.28 })
  );
  const shaftMat = bag.add(
    new THREE.MeshStandardMaterial({ color: '#3a1d12', metalness: 0.1, roughness: 0.6 })
  );
  const tasselMat = bag.add(
    new THREE.MeshStandardMaterial({
      color: profile.tasselColor,
      roughness: 0.7,
      emissive: profile.tasselColor,
      emissiveIntensity: 0.25,
    })
  );

  steelMat.userData.palette = 'metal';
  goldMat.userData.palette = 'metal';
  shaftMat.userData.palette = 'matte';
  tasselMat.userData.palette = 'matte';

  const trailBase = new THREE.Object3D();
  const trailTip = new THREE.Object3D();
  const add = (mesh: THREE.Mesh, x: number, y: number, z = 0) => {
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  if (isPolearmVariant(variant)) {
    // Shaft runs from the butt spike (-0.85) up to the head socket (1.9); the hand sits at 0.
    add(shadowMesh(bag.add(new THREE.CylinderGeometry(0.03, 0.034, 2.7, 10)), shaftMat), 0, 0.55);
    const butt = add(shadowMesh(bag.add(new THREE.ConeGeometry(0.045, 0.16, 8)), goldMat), 0, -0.86);
    butt.rotation.z = Math.PI;
    for (const y of [-0.5, 0.6, 1.5]) {
      add(shadowMesh(bag.add(new THREE.CylinderGeometry(0.039, 0.039, 0.05, 10)), goldMat), 0, y);
    }
    add(shadowMesh(bag.add(new THREE.CylinderGeometry(0.07, 0.048, 0.2, 10)), goldMat), 0, 1.86);

    const tassel = add(shadowMesh(bag.add(new THREE.ConeGeometry(0.1, 0.42, 8)), tasselMat), -0.02, 1.62);
    tassel.rotation.z = Math.PI;

    if (variant === 'crescent_blade') {
      const s = new THREE.Shape();
      s.moveTo(-0.035, 0);
      s.lineTo(0.06, 0);
      s.quadraticCurveTo(0.36, 0.24, 0.31, 0.7);
      s.quadraticCurveTo(0.24, 1.02, -0.07, 1.2);
      s.quadraticCurveTo(0.05, 0.9, -0.03, 0.62);
      s.lineTo(-0.19, 0.56);
      s.lineTo(-0.035, 0.4);
      s.closePath();
      add(extruded(bag, s, steelMat), 0, 1.94);
      trailBase.position.set(0.08, 1.96, 0);
      trailTip.position.set(0.1, 3.12, 0);
    } else if (variant === 'great_axe') {
      const s = new THREE.Shape();
      s.moveTo(0.02, -0.08);
      s.quadraticCurveTo(0.52, -0.24, 0.56, 0.3);
      s.quadraticCurveTo(0.52, 0.84, 0.02, 0.66);
      s.closePath();
      add(extruded(bag, s, steelMat), 0, 1.94);
      const back = new THREE.Shape();
      back.moveTo(-0.02, 0.12);
      back.lineTo(-0.26, 0.3);
      back.lineTo(-0.02, 0.48);
      back.closePath();
      add(extruded(bag, back, steelMat), 0, 1.94);
      add(shadowMesh(bag.add(new THREE.ConeGeometry(0.05, 0.4, 4)), steelMat), 0, 2.84);
      trailBase.position.set(0.06, 1.96, 0);
      trailTip.position.set(0.5, 2.78, 0);
    } else if (variant === 'fangtian_halberd') {
      add(shadowMesh(bag.add(new THREE.ConeGeometry(0.075, 0.95, 4)), steelMat), 0, 2.5);
      const s = new THREE.Shape();
      s.moveTo(0.05, -0.32);
      s.quadraticCurveTo(0.42, -0.14, 0.36, 0.3);
      s.quadraticCurveTo(0.22, 0.06, 0.05, 0.14);
      s.closePath();
      add(extruded(bag, s, steelMat), 0, 2.24);
      const right = add(extruded(bag, s, steelMat), 0, 2.24);
      right.scale.x = -1;
      for (const y of [2.1, 2.38]) {
        const bar = add(shadowMesh(bag.add(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 6)), goldMat), 0, y);
        bar.rotation.z = Math.PI * 0.5;
      }
      trailBase.position.set(0, 1.98, 0);
      trailTip.position.set(0, 2.98, 0);
    } else if (variant === 'serpent_spear') {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 1.96, 0),
        new THREE.Vector3(0.09, 2.18, 0),
        new THREE.Vector3(-0.09, 2.42, 0),
        new THREE.Vector3(0.07, 2.66, 0),
        new THREE.Vector3(0, 2.98, 0),
      ]);
      const blade = shadowMesh(bag.add(new THREE.TubeGeometry(curve, 24, 0.045, 6, false)), steelMat);
      blade.scale.z = 0.45;
      group.add(blade);
      trailBase.position.set(0, 1.98, 0);
      trailTip.position.set(0, 2.98, 0);
    } else {
      const tip = add(shadowMesh(bag.add(new THREE.ConeGeometry(0.075, 1.0, 4)), steelMat), 0, 2.46);
      tip.scale.z = 0.5;
      trailBase.position.set(0, 1.98, 0);
      trailTip.position.set(0, 2.96, 0);
    }
  } else if (variant === 'war_bow' || variant === 'chakram_bow') {
    const bowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, -0.2, 0),
      new THREE.Vector3(0.2, 0.2, 0),
      new THREE.Vector3(0.12, 0.62, 0),
      new THREE.Vector3(0.24, 1.0, 0),
      new THREE.Vector3(-0.1, 1.5, 0),
    ]);
    group.add(shadowMesh(bag.add(new THREE.TubeGeometry(bowCurve, 24, 0.036, 8, false)), goldMat));
    add(shadowMesh(bag.add(new THREE.CylinderGeometry(0.006, 0.006, 1.7, 4)), tasselMat), -0.1, 0.65);
    const blade = add(shadowMesh(bag.add(new THREE.ConeGeometry(0.05, 0.36, 4)), steelMat), -0.1, 1.68);
    blade.scale.z = 0.5;
    trailBase.position.set(0.1, 0.5, 0);
    trailTip.position.set(-0.1, 1.86, 0);
  } else if (variant === 'feather_fan') {
    add(shadowMesh(bag.add(new THREE.CylinderGeometry(0.024, 0.03, 0.44, 8)), goldMat), 0, 0.1);
    const fanMat = bag.add(
      new THREE.MeshStandardMaterial({
        color: profile.weaponColor,
        emissive: profile.auraColor,
        emissiveIntensity: 0.4,
        roughness: 0.5,
        side: THREE.DoubleSide,
      })
    );
    const featherGeo = bag.add(new THREE.CapsuleGeometry(0.06, 0.56, 4, 6));
    for (let i = -3; i <= 3; i++) {
      const feather = shadowMesh(featherGeo, fanMat);
      feather.scale.set(1.15, 1, 0.2);
      const ang = i * 0.22;
      feather.position.set(Math.sin(ang) * 0.36, 0.5 + Math.cos(ang) * 0.32, i * 0.008);
      feather.rotation.z = -ang;
      group.add(feather);
    }
    trailBase.position.set(0, 0.36, 0);
    trailTip.position.set(0, 1.3, 0);
    group.scale.setScalar(1.1);
  } else {
    // One-handed arms: grip centred on the hand, guard just above it.
    add(shadowMesh(bag.add(new THREE.CylinderGeometry(0.03, 0.034, 0.48, 8)), shaftMat), 0, 0.04);
    const pommel = add(shadowMesh(bag.add(new THREE.SphereGeometry(0.05, 8, 8)), goldMat), 0, -0.22);
    pommel.scale.y = 0.8;
    const tassel = add(shadowMesh(bag.add(new THREE.ConeGeometry(0.045, 0.3, 6)), tasselMat), 0, -0.42);
    tassel.rotation.z = Math.PI;

    if (variant === 'iron_whip') {
      add(shadowMesh(bag.add(new THREE.CylinderGeometry(0.075, 0.05, 0.08, 8)), goldMat), 0, 0.32);
      add(shadowMesh(bag.add(new THREE.CylinderGeometry(0.042, 0.056, 1.5, 6)), steelMat), 0, 1.1);
      const ringGeo = bag.add(new THREE.TorusGeometry(0.066, 0.02, 6, 10));
      for (let i = 0; i < 5; i++) {
        const ring = add(shadowMesh(ringGeo, goldMat), 0, 0.56 + i * 0.28);
        ring.rotation.x = Math.PI * 0.5;
      }
      trailBase.position.set(0, 0.4, 0);
      trailTip.position.set(0, 1.86, 0);
    } else if (variant === 'imperial_jian' || variant === 'twin_swords') {
      add(shadowMesh(bag.add(new THREE.BoxGeometry(0.3, 0.06, 0.09)), goldMat), 0, 0.32);
      const s = new THREE.Shape();
      s.moveTo(-0.048, 0);
      s.lineTo(0.048, 0);
      s.lineTo(0.04, 1.34);
      s.lineTo(0, 1.56);
      s.lineTo(-0.04, 1.34);
      s.closePath();
      add(extruded(bag, s, steelMat), 0, 0.36);
      trailBase.position.set(0, 0.4, 0);
      trailTip.position.set(0, 1.92, 0);
    } else {
      // tiger_saber, twin_ji, curved_dao
      add(shadowMesh(bag.add(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12)), goldMat), 0, 0.32);
      const s = new THREE.Shape();
      s.moveTo(-0.05, 0);
      s.lineTo(0.07, 0);
      s.quadraticCurveTo(0.22, 0.72, 0.16, 1.22);
      s.quadraticCurveTo(0.12, 1.44, -0.04, 1.56);
      s.quadraticCurveTo(0.0, 1.0, -0.05, 0);
      s.closePath();
      add(extruded(bag, s, steelMat), 0, 0.36);
      trailBase.position.set(0.02, 0.4, 0);
      trailTip.position.set(0.02, 1.92, 0);
    }
    group.scale.setScalar(1.15);
  }

  group.add(trailBase, trailTip);
  return { group, trailBase, trailTip };
}
