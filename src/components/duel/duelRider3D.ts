import * as THREE from 'three';
import type { General } from '../../game/types.js';
import type { HeroDuelProfile } from '../../game/heroDuelProfiles.js';
import type { DisposeBag, LoftRing } from './duelGeometry3D.js';
import { buildLoft, buildSheet, limbBetween, scaleUv, shadowMesh } from './duelGeometry3D.js';

// ----------------------------------------------------------------------------------------------
// The general in the saddle. Rider space: seat = origin, +X forward, +Y up, +Z the weapon side.
// ----------------------------------------------------------------------------------------------
export const ARM_UPPER = 0.35;
export const ARM_FORE = 0.34;

export interface RiderMaterials {
  /** Lacquered lamellar plates (tiling texture, one plate = 1/4 of a UV unit) */
  armor: THREE.Material;
  /** Gilt bronze fittings */
  trim: THREE.Material;
  leather: THREE.Material;
  /** Robe worn under the armour: sleeves, collar, trousers */
  robe: THREE.Material;
  /** Cloth in the cloak's colour: hood, ribbons, headband */
  cloth: THREE.Material;
  /** The cloak itself (double-sided, re-shaped every frame) */
  cape: THREE.Material;
  skin: THREE.Material;
  face: THREE.Material;
  hair: THREE.Material;
  dark: THREE.Material;
  tassel: THREE.Material;
  rein: THREE.Material;
}

/** An arm posed by two-bone IK; the hand turns separately to follow what it grips. */
export interface RiderArm {
  upper: THREE.Group;
  fore: THREE.Group;
  hand: THREE.Group;
}

export interface RiderParts {
  riderRoot: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  plumes: THREE.Group[][];
  /** `shoulder`: half the cloak's width where it lies over the shoulders */
  cape: { geo: THREE.BufferGeometry; cols: number; rows: number; shoulder: number };
  armR: RiderArm;
  armL: RiderArm;
  chest: THREE.Object3D;
  reins: [THREE.BufferGeometry, THREE.BufferGeometry];
}

function ring(x: number, y: number, ry: number, rz: number): LoftRing {
  return { x, y, ry, rz };
}

const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma));

/**
 * A head sculpted out of a sphere, so the painted face keeps its place: latitude 0 is the eye
 * line and longitude 0 the nose. The lower half narrows into a jaw and chin, the brow overhangs
 * the eye sockets and the cheekbones stand out, which is what lets side light model the face.
 */
function buildHeadGeometry(heroine: boolean): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 32, 22);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const tanhK = Math.tanh(1.6);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const lat = Math.asin(Math.max(-1, Math.min(1, y)));
    const lon = Math.atan2(z, x);
    const alon = Math.abs(lon);
    const down = THREE.MathUtils.smoothstep(-y, 0.05, 0.95);

    let X = x * (x < 0 ? 0.138 : 0.128);
    // The underside flattens out instead of hanging below the chin like a ball
    let Y = y > 0 ? y * 0.152 : (-0.128 * Math.tanh(1.6 * -y)) / tanhK;
    let Z = z * 0.12;

    Z *= 1 - (heroine ? 0.5 : 0.38) * down;
    X *= 1 - 0.26 * down * (x > 0 ? 0.5 : 1);

    const chin = gauss(lat + 0.8, 0.22) * gauss(lon, 0.5);
    X += chin * (heroine ? 0.018 : 0.03);
    Y -= chin * 0.014;
    const jawCorner = gauss(lat + 0.62, 0.2) * gauss(alon - 1.25, 0.3);
    Z += Math.sign(z) * jawCorner * (heroine ? 0.002 : 0.012);

    const brow = gauss(lat - 0.17, 0.1) * gauss(lon, 0.8);
    X += brow * (heroine ? 0.003 : 0.009);
    const socket = gauss(lat - 0.01, 0.12) * gauss(alon - 0.5, 0.2);
    X -= socket * 0.012;
    const cheek = gauss(lat + 0.2, 0.2) * gauss(alon - 0.82, 0.26);
    X += cheek * 0.004;
    Z += Math.sign(z) * cheek * 0.007;
    const mouth = gauss(lat + 0.42, 0.16) * gauss(lon, 0.34);
    X += mouth * 0.006;

    pos.setXYZ(i, X, Y, Z);
  }
  geo.computeVertexNormals();
  // The sphere's seam runs down the back of the skull; weld its normals so no crease shows
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const cols = 33;
  for (let r = 0; r <= 22; r++) {
    const a = r * cols;
    const b = a + cols - 1;
    const nx = nrm.getX(a) + nrm.getX(b);
    const ny = nrm.getY(a) + nrm.getY(b);
    const nz = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l);
    nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return geo;
}

/** A thin cord or edge binding laid through a list of points. */
function tube(
  bag: DisposeBag,
  parent: THREE.Object3D,
  pts: THREE.Vector3[],
  radius: number,
  mat: THREE.Material
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts);
  const mesh = shadowMesh(bag.add(new THREE.TubeGeometry(curve, (pts.length - 1) * 2, radius, 5, false)), mat);
  parent.add(mesh);
  return mesh;
}

/** A level elliptical hoop: half-widths `rx` fore and aft, `rz` to the side; `tall` stretches the tube upward. */
function hoop(
  bag: DisposeBag,
  parent: THREE.Object3D,
  mat: THREE.Material,
  rx: number,
  rz: number,
  tube: number,
  x: number,
  y: number,
  tall = 1
): THREE.Mesh {
  const avg = (rx + rz) * 0.5;
  const mesh = shadowMesh(bag.add(new THREE.TorusGeometry(1, tube / avg, 6, 28)), mat);
  mesh.position.set(x, y, 0);
  mesh.rotation.x = Math.PI * 0.5;
  mesh.scale.set(rx, rz, avg * tall);
  parent.add(mesh);
  return mesh;
}

/**
 * A fist closed round a shaft. Hand space: the shaft runs along +Z (the thumb's end), the wrist is
 * at +Y and the back of the hand faces `back` × X. The pose code turns the hand every frame so its
 * Z axis follows the weapon (or the reins), which wraps the fingers round whatever it holds.
 */
function buildHand(bag: DisposeBag, back: number, skin: THREE.Material): THREE.Group {
  const hand = new THREE.Group();
  // Angles are measured for a hand whose back faces +X; the other hand mirrors them
  const ang = (a: number) => (back > 0 ? a : Math.PI - a);
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const mesh = shadowMesh(bag.add(geo), skin);
    mesh.position.set(x * back, y, z);
    hand.add(mesh);
    return mesh;
  };
  const curl = (radius: number, tube: number, from: number, arc: number, z: number) => {
    const start = back > 0 ? from : Math.PI - from - arc;
    const mesh = add(new THREE.TorusGeometry(radius, tube, 5, 8, arc), 0, 0, z);
    mesh.rotation.z = start;
    return mesh;
  };
  const KNUCKLE = 5.98;
  // Four fingers, from the knuckles round the far side of the shaft and back into the palm
  for (const [z, tube] of [
    [0.033, 0.0125],
    [0.011, 0.013],
    [-0.011, 0.0125],
    [-0.031, 0.0105],
  ]) {
    const radius = 0.034 + tube;
    curl(radius, tube, 1.88, KNUCKLE - 1.88, z);
    const k = ang(KNUCKLE);
    const knuckle = add(new THREE.SphereGeometry(tube * 1.12, 6, 5), 0, Math.sin(k) * radius, z);
    knuckle.position.x = Math.cos(k) * radius;
  }
  // The thumb lies over the first two fingers from the side of the palm
  curl(0.059, 0.0128, 1.3, 2.2, 0.047);
  const tip = ang(3.5);
  const thumbTip = add(new THREE.SphereGeometry(0.0135, 6, 5), 0, Math.sin(tip) * 0.059, 0.047);
  thumbTip.position.x = Math.cos(tip) * 0.059;
  // Back of the hand from wrist to knuckles, the heel of the palm, and a core that fills an empty fist
  add(new THREE.SphereGeometry(1, 10, 8), 0.04, 0.03, 0).scale.set(0.018, 0.046, 0.049);
  add(new THREE.SphereGeometry(1, 10, 8), 0.004, 0.042, 0.004).scale.set(0.04, 0.024, 0.05);
  add(new THREE.CylinderGeometry(0.027, 0.027, 0.085, 8), 0, 0, 0).rotation.x = Math.PI * 0.5;
  return hand;
}

/** Builds the general: legs astride the saddle, armoured torso, head and headgear, cloak, both arms. */
export function buildRider3D(
  hero: General,
  profile: HeroDuelProfile,
  bag: DisposeBag,
  m: RiderMaterials
): RiderParts {
  const riderRoot = new THREE.Group();
  const robed = !!profile.isScholarRobe;
  const slim = profile.isHeroine ? 0.86 : 1;
  const plate = robed ? m.robe : m.armor;

  const flat = (hex: string): THREE.Material => {
    const mat = bag.add(new THREE.MeshStandardMaterial({ color: hex }));
    mat.userData.palette = 'matte';
    return mat;
  };
  const linen = flat('#e4dccb');
  const bootMat = flat('#1d1512');

  const put = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0
  ): THREE.Mesh => {
    const mesh = shadowMesh(bag.add(geo), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  /** A thin cord laid through a list of points */
  const cord = (parent: THREE.Object3D, pts: THREE.Vector3[], radius: number, mat: THREE.Material) => {
    tube(bag, parent, pts, radius, mat);
  };

  // ---------------------------------------------------------------- legs, skirt, stirrups
  for (const side of [-1, 1]) {
    const hip = new THREE.Vector3(0, 0.03, side * 0.14);
    const knee = new THREE.Vector3(0.34, -0.1, side * 0.39);
    const ankle = new THREE.Vector3(0.24, -0.58, side * 0.43);
    const toe = new THREE.Vector3(0.43, -0.65, side * 0.44);
    riderRoot.add(limbBetween(bag, hip, knee, 0.115, 0.092, m.robe));
    // Tall riding boot with a turned-down cuff and an upturned toe
    riderRoot.add(limbBetween(bag, knee, ankle, 0.088, 0.064, bootMat));
    riderRoot.add(limbBetween(bag, ankle, toe, 0.064, 0.05, bootMat));
    const cuffAt = knee.clone().lerp(ankle, 0.16);
    const cuff = put(riderRoot, new THREE.TorusGeometry(0.086, 0.02, 6, 14), m.cloth, cuffAt.x, cuffAt.y, cuffAt.z);
    cuff.rotation.x = Math.PI * 0.5;
    cuff.rotation.y = 0.2;
    const tip = put(riderRoot, new THREE.ConeGeometry(0.046, 0.11, 8), bootMat, toe.x + 0.03, toe.y + 0.03, toe.z);
    tip.rotation.z = -0.9;
    const kneeCap = put(riderRoot, new THREE.SphereGeometry(0.082, 12, 8), m.trim, knee.x + 0.02, knee.y + 0.01, knee.z);
    kneeCap.scale.set(0.9, 1, 0.9);

    // Armour skirt: three lamellar tiers wrapped close round the thigh, each lapping over the one
    // below. A scholar's robe falls instead as one long panel of cloth.
    const hipP = new THREE.Vector3(-0.08, 0.04, side * 0.17);
    // Armour stops short of the knee so the knee guard and boot cuff show; a robe runs past it
    const kneeP = robed ? new THREE.Vector3(0.43, -0.09, side * 0.4) : new THREE.Vector3(0.3, -0.058, side * 0.34);
    const along = kneeP.clone().sub(hipP);
    const t = along.clone().normalize();
    const out = new THREE.Vector3(-Math.abs(t.z), 0, side * t.x).normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(t, -t.y).normalize();
    const r = 0.128;
    const drop = robed ? 0.22 : 0.05;
    const skirtAt = (u: number, s: number, lift: number, p: THREE.Vector3) => {
      const g = -0.4 + s * 2.2;
      const fall = THREE.MathUtils.smoothstep(s, 0.45, 1);
      const rr = r + lift + fall * 0.03 + Math.sin(u * Math.PI) * 0.01;
      p.copy(hipP)
        .addScaledVector(along, u)
        .addScaledVector(up, Math.cos(g) * rr)
        .addScaledVector(out, Math.sin(g) * rr + fall * 0.02);
      p.y -= fall * (drop + u * drop * 0.4);
    };
    const tiers: [number, number][] = robed
      ? [[0, 1]]
      : [
          [0, 0.4],
          [0.33, 0.7],
          [0.63, 1],
        ];
    tiers.forEach(([s0, s1], k) => {
      const lift = (tiers.length - 1 - k) * 0.008;
      const tier = (u: number, v: number, p: THREE.Vector3) => skirtAt(u, s0 + (s1 - s0) * v, lift, p);
      put(riderRoot, buildSheet(8, robed ? 5 : 2, tier, [1.75, 0.5]), plate);
      const last = k === tiers.length - 1;
      const hem: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const p = new THREE.Vector3();
        skirtAt(i / 6, s1, lift + 0.004, p);
        hem.push(p);
      }
      cord(riderRoot, hem, last ? (robed ? 0.008 : 0.011) : 0.006, last ? m.trim : m.leather);
      if (robed) return;
      const front: THREE.Vector3[] = [];
      for (let i = 0; i <= 2; i++) {
        const p = new THREE.Vector3();
        skirtAt(1, s0 + ((s1 - s0) * i) / 2, lift + 0.004, p);
        front.push(p);
      }
      cord(riderRoot, front, 0.008, m.trim);
    });

    // Stirrup and its leather strap, hung from the saddle tree
    riderRoot.add(
      limbBetween(
        bag,
        new THREE.Vector3(0.22, -0.06, side * 0.37),
        new THREE.Vector3(0.3, -0.59, side * 0.44),
        0.015,
        0.013,
        m.leather
      )
    );
    const stirrup = put(riderRoot, new THREE.TorusGeometry(0.075, 0.014, 6, 12), m.trim, 0.3, -0.66, side * 0.44);
    stirrup.rotation.y = Math.PI * 0.5;
  }

  // Leather reins from both bit rings to the rein hand, re-shaped every frame
  const makeReinStrap = () => {
    const geo = bag.add(new THREE.PlaneGeometry(1, 0.026, 6, 1));
    const mesh = shadowMesh(geo, m.rein, true, false);
    mesh.frustumCulled = false;
    mesh.userData.keep = true;
    riderRoot.add(mesh);
    return geo;
  };
  const reins: [THREE.BufferGeometry, THREE.BufferGeometry] = [makeReinStrap(), makeReinStrap()];

  // ---------------------------------------------------------------- torso
  const torso = new THREE.Group();
  torso.position.set(0, 0.06, 0);
  torso.rotation.order = 'ZYX';
  riderRoot.add(torso);

  const cuirass = [
    ring(0, -0.07, 0.172, 0.222 * slim),
    ring(0, 0.03, 0.15, 0.196 * slim),
    ring(0.008, 0.2, 0.172, 0.226 * slim),
    ring(0.018, 0.38, 0.202, 0.264 * slim),
    ring(0.014, 0.5, 0.196, 0.274 * slim),
    ring(0, 0.585, 0.15, 0.236 * slim),
    ring(-0.004, 0.64, 0.096, 0.13),
    ring(0, 0.68, 0.07, 0.082),
  ];
  put(torso, scaleUv(buildLoft(cuirass, { radial: 18 }), 4, 2.5), plate);

  /** Radii of the cuirass at a height, and a point on its surface (angle 0 = breastbone) */
  const torsoAt = (y: number) => {
    let i = 0;
    while (i < cuirass.length - 2 && cuirass[i + 1].y < y) i++;
    const a = cuirass[i];
    const b = cuirass[i + 1];
    const k = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
    return { x: a.x + (b.x - a.x) * k, ry: a.ry + (b.ry - a.ry) * k, rz: a.rz + (b.rz - a.rz) * k };
  };
  const onTorso = (y: number, angle: number, lift = 0.012) => {
    const s = torsoAt(y);
    return new THREE.Vector3(s.x + (s.ry + lift) * Math.cos(angle), y, (s.rz + lift) * Math.sin(angle));
  };

  // Neck, with the robe's crossed collar and a linen under-collar showing above the armour
  put(
    torso,
    buildLoft([ring(-0.004, 0.62, 0.062, 0.066), ring(0.004, 0.72, 0.056, 0.058), ring(0.012, 0.81, 0.055, 0.056)], {
      radial: 10,
    }),
    m.skin
  );
  const collar = put(torso, new THREE.TorusGeometry(0.094, 0.03, 8, 18), m.robe, -0.002, 0.662, 0);
  collar.rotation.x = Math.PI * 0.5;
  collar.scale.set(1, 1.08, 1.25);
  const underCollar = put(torso, new THREE.TorusGeometry(0.073, 0.016, 6, 16), linen, 0.002, 0.702, 0);
  underCollar.rotation.x = Math.PI * 0.5;
  underCollar.scale.set(1, 1.02, 1.3);

  // War belt with a beast-mask buckle, studs and a knotted sash on the weapon side
  const beltRings = [-0.012, 0.045, 0.102].map((y) => {
    const s = torsoAt(y);
    return ring(s.x, y, s.ry + 0.016, s.rz + 0.016);
  });
  put(torso, buildLoft(beltRings, { radial: 18, smooth: 1 }), m.leather);
  for (const y of [-0.012, 0.102]) {
    const s = torsoAt(y);
    hoop(bag, torso, m.trim, s.ry + 0.02, s.rz + 0.02, 0.011, s.x, y);
  }
  const buckleAt = onTorso(0.045, 0, 0.022);
  const buckle = put(torso, new THREE.SphereGeometry(0.058, 12, 10), m.trim, buckleAt.x, buckleAt.y, 0);
  buckle.scale.set(0.34, 0.95, 1.2);
  for (const a of [-1.2, -0.62, 0.62, 1.2, 2.1, -2.1, Math.PI]) {
    const at = onTorso(0.045, a, 0.02);
    put(torso, new THREE.SphereGeometry(0.02, 6, 5), m.trim, at.x, at.y, at.z);
  }
  const knotAt = onTorso(0.04, 0.95, 0.03);
  put(torso, new THREE.SphereGeometry(0.042, 8, 8), m.tassel, knotAt.x, knotAt.y, knotAt.z);
  for (const [dx, len] of [
    [0.03, 0.25],
    [-0.03, 0.2],
  ]) {
    torso.add(
      limbBetween(
        bag,
        knotAt,
        new THREE.Vector3(knotAt.x + dx + 0.03, knotAt.y - len, knotAt.z + 0.05),
        0.022,
        0.011,
        m.tassel
      )
    );
  }

  if (!robed) {
    // Heart mirror held by a cord harness that crosses the breast
    const mirrorAt = onTorso(0.4, 0, 0.004);
    const mirror = put(torso, new THREE.SphereGeometry(0.086, 16, 12), m.trim, mirrorAt.x, mirrorAt.y, 0);
    mirror.scale.set(0.24, 1, 1);
    const rim = put(torso, new THREE.TorusGeometry(0.09, 0.012, 6, 20), m.trim, mirrorAt.x + 0.004, mirrorAt.y, 0);
    rim.rotation.y = Math.PI * 0.5;
    for (const side of [-1, 1]) {
      cord(
        torso,
        [onTorso(0.6, side * 0.95), onTorso(0.54, side * 0.72), onTorso(0.47, side * 0.48), onTorso(0.43, side * 0.3)],
        0.012,
        m.tassel
      );
      cord(
        torso,
        [onTorso(0.37, side * 0.3), onTorso(0.28, side * 0.46), onTorso(0.18, side * 0.56), onTorso(0.1, side * 0.6)],
        0.012,
        m.tassel
      );
    }
    // A lamellar gorget standing up round the neck
    put(
      torso,
      buildSheet(
        16,
        2,
        (u, v, p) => {
          const a = u * Math.PI * 2;
          const rr = 1 - v * 0.34;
          p.set(-0.004 + Math.cos(a) * 0.152 * rr, 0.6 + v * 0.1, Math.sin(a) * 0.2 * rr);
        },
        [3, 0.5]
      ),
      plate
    );
  }

  // Shoulder guards: three overlapping lamellar tiers flaring down over the upper arm. A robe
  // keeps only the rounded shoulder.
  for (const side of [-1, 1]) {
    const top = new THREE.Vector3(0, 0.665, side * 0.25 * slim);
    const axis = new THREE.Vector3(0, -1, side * 0.28).normalize();
    const outward = new THREE.Vector3(0, 0.28, side).normalize();
    const fore = new THREE.Vector3(1, 0, 0);
    for (let k = 0; k < (robed ? 0 : 3); k++) {
      const s0 = 0.03 + k * 0.08;
      const s1 = s0 + 0.115;
      const r0 = 0.1 + k * 0.01;
      const r1 = 0.125 + k * 0.012;
      const tier = (u: number, v: number, p: THREE.Vector3, grow = 0) => {
        const a = (u - 0.5) * 2.9;
        const rr = r0 + (r1 - r0) * v + grow;
        p.copy(top)
          .addScaledVector(axis, s0 + (s1 - s0) * v)
          .addScaledVector(outward, Math.cos(a) * rr)
          .addScaledVector(fore, Math.sin(a) * rr * 1.08);
      };
      put(torso, buildSheet(10, 2, tier, [1.5, 0.25]), plate);
      const hem: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const p = new THREE.Vector3();
        tier(i / 8, 1, p, 0.004);
        hem.push(p);
      }
      cord(torso, hem, 0.006, m.leather);
    }
    const cap = put(torso, new THREE.SphereGeometry(0.112, 14, 8), plate, 0, 0.622, side * 0.268 * slim);
    cap.scale.set(1.1, 0.5, 0.98);
    cap.rotation.x = side * 0.3;
    scaleUv(cap.geometry, 2, 0.75);
    if (robed) continue;
    const boss = put(torso, new THREE.SphereGeometry(0.024, 8, 6), m.trim, 0.005, 0.676, side * 0.285 * slim);
    boss.scale.set(1, 0.6, 1);
  }

  const chest = new THREE.Object3D();
  chest.position.set(0.1, 0.42, 0);
  torso.add(chest);

  // Cloak: a cloth sheet re-shaped every frame from the rider's motion
  const capeCols = 8;
  const capeRows = 12;
  const capeGeo = bag.add(new THREE.PlaneGeometry(1, 1, capeCols, capeRows));
  const capeMesh = shadowMesh(capeGeo, m.cape);
  capeMesh.frustumCulled = false;
  capeMesh.userData.keep = true;
  torso.add(capeMesh);

  // ---------------------------------------------------------------- head
  const head = new THREE.Group();
  head.position.set(0.02, 0.878, 0);
  head.scale.setScalar(1.06);
  torso.add(head);
  put(head, buildHeadGeometry(!!profile.isHeroine), m.face);
  // The nose: bridge, tip and the wings of the nostrils; finer and shorter on a heroine
  const nose = profile.isHeroine ? 0.72 : 1;
  const nr = (x: number, y: number, ry: number, rz: number) =>
    ring(0.122 + (x - 0.122) * nose, y * (0.6 + 0.4 * nose), ry * nose, rz * nose);
  put(
    head,
    buildLoft(
      [
        nr(0.122, 0.022, 0.005, 0.009),
        nr(0.136, -0.008, 0.009, 0.011),
        nr(0.151, -0.04, 0.013, 0.016),
        nr(0.141, -0.055, 0.009, 0.018),
        nr(0.122, -0.059, 0.003, 0.012),
      ],
      { radial: 8, smooth: 2 }
    ),
    m.skin
  );
  for (const side of [-1, 1]) {
    const ear = put(head, new THREE.SphereGeometry(1, 8, 8), m.skin, -0.01, -0.014, side * 0.112);
    ear.scale.set(0.02, 0.034, 0.012);
  }
  if (hero.id === 'xiahoudun') {
    const patch = put(head, new THREE.SphereGeometry(0.032, 8, 6), m.dark, 0.118, 0.004, -0.056);
    patch.scale.set(0.45, 0.85, 1.1);
  }

  const plumes = buildHeadgear(bag, hero, profile, head, m, put);

  // ---------------------------------------------------------------- arms (posed by IK each frame)
  const buildArm = (back: number) => {
    const upper = new THREE.Group();
    // Robe sleeve, full at the elbow
    put(
      upper,
      buildLoft(
        [
          ring(0, 0.03, 0.08, 0.08),
          ring(0, -0.1, 0.088, 0.088),
          ring(0, -0.24, 0.086, 0.086),
          ring(0, -ARM_UPPER - 0.02, 0.07, 0.07),
        ],
        { radial: 10 }
      ),
      m.robe
    );

    const fore = new THREE.Group();
    if (robed) {
      const sleeve = put(fore, new THREE.ConeGeometry(0.15, ARM_FORE * 1.1, 10, 1, true), m.robe, 0, -ARM_FORE * 0.5, 0);
      (sleeve.material as THREE.Material).side = THREE.DoubleSide;
      put(fore, new THREE.CylinderGeometry(0.05, 0.044, ARM_FORE, 8), m.skin, 0, -ARM_FORE * 0.5, 0);
    } else {
      // Leather bracer bound with gilt bands, and an elbow cop
      put(
        fore,
        buildLoft(
          [
            ring(0, 0.02, 0.066, 0.066),
            ring(0, -0.08, 0.07, 0.07),
            ring(0, -0.24, 0.054, 0.054),
            ring(0, -ARM_FORE + 0.02, 0.047, 0.047),
          ],
          { radial: 10 }
        ),
        m.leather
      );
      for (const [y, rr] of [
        [-0.06, 0.072],
        [-0.17, 0.064],
        [-0.28, 0.053],
      ]) {
        const band = put(fore, new THREE.TorusGeometry(rr, 0.01, 5, 14), m.trim, 0, y, 0);
        band.rotation.x = Math.PI * 0.5;
      }
      const cop = put(fore, new THREE.SphereGeometry(0.068, 10, 8), m.trim);
      cop.scale.set(1, 0.8, 1);
    }
    const wrist = put(fore, new THREE.TorusGeometry(0.047, 0.012, 5, 12), m.cloth, 0, -ARM_FORE + 0.035, 0);
    wrist.rotation.x = Math.PI * 0.5;
    const hand = buildHand(bag, back, m.skin);
    hand.position.set(0, -ARM_FORE, 0);
    fore.add(hand);
    riderRoot.add(upper, fore);
    return { upper, fore, hand };
  };
  // The back of the right hand faces out to the right, the left hand's out to the left
  const armR = buildArm(-1);
  const armL = buildArm(1);

  return {
    riderRoot,
    torso,
    head,
    plumes,
    cape: { geo: capeGeo, cols: capeCols, rows: capeRows, shoulder: 0.26 * slim },
    armR,
    armL,
    chest,
    reins,
  };
}

type Put = (
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x?: number,
  y?: number,
  z?: number
) => THREE.Mesh;

/** Helmet, hood or crown, the beard, and the chains (plumes, ribbons, feathers) that trail behind. */
function buildHeadgear(
  bag: DisposeBag,
  hero: General,
  profile: HeroDuelProfile,
  head: THREE.Group,
  m: RiderMaterials,
  put: Put
): THREE.Group[][] {
  const plumes: THREE.Group[][] = [];
  const robed = !!profile.isScholarRobe;

  // A chain of segments that trails behind the head and whips with the rider's motion
  const chain = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    count: number,
    segLen: number,
    radius: number,
    mat: THREE.Material,
    baseRot: number,
    curl: number,
    flatten = 0.55
  ) => {
    const segs: THREE.Group[] = [];
    let node: THREE.Object3D = parent;
    for (let i = 0; i < count; i++) {
      const seg = new THREE.Group();
      if (i === 0) seg.position.set(x, y, z);
      else seg.position.set(0, segLen, 0);
      seg.rotation.z = i === 0 ? baseRot : curl;
      seg.userData.rest = seg.rotation.z;
      const r0 = radius * (1 - (i / count) * 0.75);
      const r1 = radius * (1 - ((i + 1) / count) * 0.75);
      const mesh = shadowMesh(bag.add(new THREE.CylinderGeometry(r1, r0, segLen, 6)), mat);
      mesh.position.y = segLen * 0.5;
      mesh.scale.z = flatten;
      seg.add(mesh);
      node.add(seg);
      node = seg;
      segs.push(seg);
    }
    plumes.push(segs);
  };

  /** Hair drawn close over the skull, with a topknot */
  const hairCap = (topknot = true) => {
    put(
      head,
      buildLoft(
        [
          ring(-0.014, 0.03, 0.146, 0.128),
          ring(-0.016, 0.085, 0.142, 0.124),
          ring(-0.016, 0.13, 0.116, 0.102),
          ring(-0.016, 0.158, 0.07, 0.062),
          ring(-0.016, 0.168, 0.02, 0.02),
        ],
        { radial: 14 }
      ),
      m.hair
    ).rotation.z = 0.2;
    put(
      head,
      buildSheet(14, 3, (u, v, p) => {
        const a = 1.5 + u * (Math.PI * 2 - 3);
        const k = Math.pow(v, 0.8);
        p.set(-0.008 + Math.cos(a) * (0.147 - 0.022 * k), 0.05 - 0.15 * v, Math.sin(a) * (0.129 - 0.03 * k));
      }),
      m.hair
    );
    if (topknot) {
      const knot = put(head, new THREE.SphereGeometry(0.05, 10, 8), m.hair, -0.03, 0.185, 0);
      knot.scale.set(1, 0.85, 1);
    }
  };

  /** A band that circles the brow, tilted so it rides high on the forehead */
  const browBand = (rx: number, rz: number, y: number, tube: number, mat: THREE.Material, tall = 1.6) => {
    const band = hoop(bag, head, mat, rx, rz, tube, -0.012, y, tall);
    band.rotation.y = -0.1;
    return band;
  };

  /** A curtain hung from the rim of a helmet or hood, open over the face */
  const curtain = (
    open: number,
    y0: number,
    y1: number,
    r0: [number, number],
    r1: [number, number],
    mat: THREE.Material,
    uv: [number, number]
  ) => {
    const fn = (u: number, v: number, p: THREE.Vector3) => {
      const a = open + u * (Math.PI * 2 - open * 2);
      const k = Math.pow(v, 0.8);
      p.set(
        -0.012 + Math.cos(a) * (r0[0] + (r1[0] - r0[0]) * k),
        y0 + (y1 - y0) * v,
        Math.sin(a) * (r0[1] + (r1[1] - r0[1]) * k)
      );
    };
    put(head, buildSheet(18, 3, fn, uv), mat);
    return fn;
  };

  switch (profile.headgear) {
    case 'pheasant_crown': {
      // Bound hair under a small gilt crown with three flame points and two long pheasant feathers
      hairCap(false);
      browBand(0.146, 0.13, 0.06, 0.009, m.trim, 1.5);
      const jewel = put(head, new THREE.OctahedronGeometry(0.03), m.tassel, 0.132, 0.085, 0);
      jewel.scale.set(0.5, 1.1, 0.9);
      put(
        head,
        buildLoft(
          [
            ring(-0.02, 0.13, 0.062, 0.058),
            ring(-0.02, 0.17, 0.056, 0.052),
            ring(-0.02, 0.215, 0.07, 0.066),
            ring(-0.02, 0.235, 0.082, 0.078),
          ],
          { radial: 12, smooth: 2 }
        ),
        m.trim
      );
      for (const [dx, dz, h] of [
        [0.06, 0, 0.12],
        [0.02, 0.06, 0.09],
        [0.02, -0.06, 0.09],
      ]) {
        const flame = put(head, new THREE.ConeGeometry(0.022, h, 6), m.trim, -0.02 + dx, 0.235 + h * 0.5, dz);
        flame.scale.z = 0.6;
      }
      put(head, new THREE.SphereGeometry(0.036, 10, 8), m.tassel, -0.025, 0.275, 0);
      const feather = bag.add(new THREE.MeshStandardMaterial({ color: '#c2410c' }));
      feather.userData.palette = 'matte';
      chain(head, -0.035, 0.24, 0.06, 6, 0.3, 0.03, feather, 0.42, 0.24, 0.3);
      chain(head, -0.035, 0.24, -0.06, 6, 0.3, 0.03, feather, 0.54, 0.22, 0.3);
      break;
    }
    case 'green_hood': {
      // A soft cloth cap drawn over the hair, its crown folded back, with a nape cloth and two ribbons
      const cap = put(
        head,
        buildLoft(
          [
            ring(-0.012, 0.03, 0.152, 0.134),
            ring(-0.014, 0.08, 0.148, 0.13),
            ring(-0.032, 0.118, 0.124, 0.108),
            ring(-0.066, 0.142, 0.092, 0.082),
            ring(-0.104, 0.152, 0.052, 0.048),
            ring(-0.134, 0.144, 0.014, 0.014),
          ],
          { radial: 14 }
        ),
        m.cloth
      );
      cap.rotation.z = 0.12;
      // The nape cloth falls soft and gathers in toward the neck
      curtain(1.75, 0.045, -0.11, [0.149, 0.131], [0.128, 0.122], m.cloth, [1, 1]);
      browBand(0.155, 0.137, 0.056, 0.009, m.trim, 1.6);
      const jewel = put(head, new THREE.OctahedronGeometry(0.034), m.tassel, 0.146, 0.082, 0);
      jewel.scale.set(0.5, 1.1, 0.9);
      chain(head, -0.15, 0.03, 0.045, 4, 0.16, 0.04, m.cloth, 2.5, 0.16, 0.3);
      chain(head, -0.15, 0.03, -0.045, 4, 0.14, 0.04, m.cloth, 2.7, 0.14, 0.3);
      break;
    }
    case 'scholar_crown': {
      hairCap(false);
      put(head, new THREE.CylinderGeometry(0.085, 0.105, 0.17, 12), m.robe, -0.02, 0.235, 0);
      put(head, new THREE.BoxGeometry(0.24, 0.02, 0.07), m.trim, -0.02, 0.33, 0);
      const pin = put(head, new THREE.CylinderGeometry(0.01, 0.01, 0.32, 6), m.trim, -0.02, 0.23, 0);
      pin.rotation.x = Math.PI * 0.5;
      chain(head, -0.1, 0.16, 0.03, 4, 0.14, 0.03, m.robe, 2.6, 0.12, 0.3);
      chain(head, -0.1, 0.16, -0.03, 4, 0.13, 0.03, m.robe, 2.75, 0.1, 0.3);
      break;
    }
    case 'phoenix_hairpin': {
      // A gilt band round the knot, a pin through it, a small phoenix with spread wings on the
      // crown and a jewel on the brow; the hair falls behind in a tail
      hairCap(true);
      hoop(bag, head, m.trim, 0.05, 0.05, 0.008, -0.03, 0.158);
      const pin = put(head, new THREE.CylinderGeometry(0.006, 0.006, 0.19, 6), m.trim, -0.03, 0.19, 0);
      pin.rotation.x = Math.PI * 0.5;
      const bird = new THREE.Group();
      bird.position.set(0.035, 0.2, 0);
      bird.rotation.z = 0.25;
      head.add(bird);
      put(bird, new THREE.OctahedronGeometry(0.026), m.trim).scale.set(1.5, 0.55, 0.6);
      put(bird, new THREE.SphereGeometry(0.011, 6, 5), m.tassel, 0.04, 0.008, 0);
      for (const side of [-1, 1]) {
        const wing = put(bird, new THREE.ConeGeometry(0.016, 0.075, 4), m.trim, -0.008, 0.026, side * 0.026);
        wing.rotation.set(side * 0.9, 0, 0.5);
        wing.scale.z = 0.35;
      }
      const tailFeather = put(bird, new THREE.ConeGeometry(0.014, 0.09, 4), m.trim, -0.06, 0.02, 0);
      tailFeather.rotation.z = 1.9;
      tailFeather.scale.z = 0.4;
      const jewel = put(head, new THREE.OctahedronGeometry(0.024), m.tassel, 0.13, 0.1, 0);
      jewel.scale.set(0.5, 1.1, 0.9);
      chain(head, -0.12, 0.08, 0, 5, 0.17, 0.046, m.hair, 2.6, 0.12, 0.45);
      break;
    }
    case 'imperial_crown': {
      hairCap(false);
      put(head, new THREE.CylinderGeometry(0.115, 0.135, 0.15, 12), m.trim, -0.015, 0.215, 0);
      put(head, new THREE.BoxGeometry(0.42, 0.02, 0.24), m.trim, -0.015, 0.3, 0);
      put(head, new THREE.OctahedronGeometry(0.04), m.tassel, 0.125, 0.2, 0);
      break;
    }
    case 'bandana_crest': {
      hairCap(true);
      browBand(0.15, 0.134, 0.065, 0.014, m.cloth, 1.8);
      put(head, new THREE.OctahedronGeometry(0.04), m.trim, 0.14, 0.085, 0);
      chain(head, -0.15, 0.06, 0.03, 4, 0.15, 0.035, m.cloth, 2.2, 0.15);
      chain(head, -0.15, 0.06, -0.03, 4, 0.13, 0.035, m.cloth, 2.5, 0.12);
      break;
    }
    default: {
      // War helm: a ribbed bowl, brow band and peak, a lamellar neck curtain and a horsehair crest
      const helmPlate = robed ? m.robe : m.armor;
      const bowl = put(
        head,
        scaleUv(
          buildLoft(
            [
              ring(-0.012, 0.035, 0.152, 0.137),
              ring(-0.012, 0.09, 0.152, 0.137),
              ring(-0.014, 0.145, 0.133, 0.12),
              ring(-0.016, 0.19, 0.094, 0.086),
              ring(-0.018, 0.22, 0.05, 0.046),
              ring(-0.018, 0.236, 0.018, 0.018),
            ],
            { radial: 16 }
          ),
          3,
          0.75
        ),
        helmPlate
      );
      bowl.rotation.z = 0.1;
      browBand(0.158, 0.143, 0.06, 0.01, m.trim, 1.8);
      // Four gilt ribs up the bowl
      for (const a of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
        const rib: THREE.Vector3[] = [];
        for (const [y, rx, rz] of [
          [0.08, 0.156, 0.141],
          [0.145, 0.137, 0.124],
          [0.19, 0.098, 0.09],
          [0.225, 0.05, 0.046],
        ]) {
          rib.push(new THREE.Vector3(-0.014 + Math.cos(a) * rx, y, Math.sin(a) * rz));
        }
        tube(bag, head, rib, 0.008, m.trim).rotation.z = 0.1;
      }
      const peak = put(
        head,
        buildSheet(8, 1, (u, v, p) => {
          const a = (u - 0.5) * 1.9;
          const rr = 1 + v * 0.26;
          p.set(-0.012 + Math.cos(a) * 0.156 * rr, 0.06 - v * 0.02 + Math.cos(a) * 0.014, Math.sin(a) * 0.141 * rr);
        }),
        m.trim
      );
      peak.rotation.z = 0.02;
      const crest = put(head, new THREE.OctahedronGeometry(0.036), m.trim, 0.148, 0.105, 0);
      crest.scale.set(0.45, 1.25, 0.95);
      const hemFn = curtain(1.08, 0.05, -0.2, [0.154, 0.139], [0.225, 0.215], helmPlate, [4, 0.75]);
      const hem: THREE.Vector3[] = [];
      for (let i = 0; i <= 14; i++) {
        const p = new THREE.Vector3();
        hemFn(i / 14, 1, p);
        hem.push(p);
      }
      tube(bag, head, hem, 0.008, m.trim);
      put(head, new THREE.CylinderGeometry(0.012, 0.024, 0.06, 8), m.trim, -0.04, 0.262, 0);
      put(
        head,
        buildLoft(
          [
            ring(-0.042, 0.285, 0.012, 0.012),
            ring(-0.046, 0.315, 0.042, 0.04),
            ring(-0.062, 0.352, 0.044, 0.04),
            ring(-0.09, 0.378, 0.016, 0.016),
          ],
          { radial: 8 }
        ),
        m.tassel
      );
      chain(head, -0.05, 0.31, 0, 4, 0.13, 0.055, m.tassel, 1.25, 0.32);
      break;
    }
  }

  if (profile.hasLongBeard) {
    // The long beard: a full mass under the jaw that parts into five locks lying over the breast,
    // with a moustache trained down either side
    const white = hero.id === 'huangzhong' || hero.id === 'huatuo' || hero.id === 'yanyan';
    const beardMat = bag.add(new THREE.MeshStandardMaterial({ color: white ? '#dfe4ea' : '#17141a' }));
    beardMat.userData.palette = 'matte';
    put(
      head,
      buildLoft(
        [
          ring(0.092, -0.08, 0.03, 0.086),
          ring(0.128, -0.15, 0.046, 0.104),
          ring(0.162, -0.23, 0.04, 0.092),
          ring(0.18, -0.27, 0.012, 0.05),
        ],
        { radial: 12 }
      ),
      beardMat
    );
    for (const [z, len, thick, spread] of [
      [0, 0.52, 0.032, 0],
      [0.036, 0.47, 0.028, 0.05],
      [-0.036, 0.45, 0.028, -0.05],
      [0.068, 0.37, 0.024, 0.11],
      [-0.068, 0.39, 0.024, -0.11],
    ]) {
      const lock = put(
        head,
        buildLoft(
          [
            ring(0.13, -0.15, thick, thick * 1.1),
            ring(0.176, -0.26, thick * 1.05, thick * 1.05),
            ring(0.2, -0.15 - (len - 0.15) * 0.68, thick * 0.75, thick * 0.8),
            ring(0.212, -len + 0.03, thick * 0.35, thick * 0.4),
            ring(0.21, -len, 0.003, 0.003),
          ],
          { radial: 8 }
        ),
        beardMat,
        0,
        0,
        z
      );
      lock.rotation.x = -spread;
    }
    for (const side of [-1, 1]) {
      // Whiskers along the jaw, from the ear down to the chin
      tube(
        bag,
        head,
        [
          new THREE.Vector3(-0.002, -0.035, side * 0.11),
          new THREE.Vector3(0.028, -0.092, side * 0.088),
          new THREE.Vector3(0.072, -0.118, side * 0.054),
          new THREE.Vector3(0.098, -0.128, side * 0.014),
        ],
        0.016,
        beardMat
      );
      // The moustache, trained down past the corners of the mouth
      tube(
        bag,
        head,
        [
          new THREE.Vector3(0.126, -0.07, side * 0.012),
          new THREE.Vector3(0.122, -0.088, side * 0.042),
          new THREE.Vector3(0.118, -0.15, side * 0.058),
          new THREE.Vector3(0.14, -0.24, side * 0.064),
        ],
        0.009,
        beardMat
      );
    }
  }

  return plumes;
}
