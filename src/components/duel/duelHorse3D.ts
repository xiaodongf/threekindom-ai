import * as THREE from 'three';
import type { DisposeBag, LoftRing } from './duelGeometry3D.js';
import { buildLoft, buildSheet, shadowMesh } from './duelGeometry3D.js';

// ----------------------------------------------------------------------------------------------
// The warhorse. Horse space: +X forward, +Y up, +Z the rider's right; the ground is Y = 0.
// ----------------------------------------------------------------------------------------------

export interface HorseMaterials {
  /** Groomed coat: a hair texture, shaded per vertex (see `bakeCoatShading`) */
  coat: THREE.Material;
  /** Hair cards: a strand texture cut out by alpha test, in the mane colour */
  hair: THREE.Material;
  /** Solid hair in the mane colour: the crest of the mane, the dock of the tail, inside the ears */
  crest: THREE.Material;
  hoof: THREE.Material;
  barding: THREE.Material;
  leather: THREE.Material;
  trim: THREE.Material;
  tassel: THREE.Material;
  dark: THREE.Material;
  eye: THREE.Material;
}

export interface HorseLegParts {
  upper: THREE.Group;
  lower: THREE.Group;
  pastern: THREE.Group;
  hoofAnchor: THREE.Object3D;
}

const ss = THREE.MathUtils.smoothstep;
const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma));

function ring(x: number, y: number, ry: number, rz: number): LoftRing {
  return { x, y, ry, rz };
}

/** Linear interpolation of a ring chain at `x` (the chain runs along +X). */
function ringsAt(rings: LoftRing[], x: number): { c: number; ry: number; rz: number } {
  let i = 0;
  while (i < rings.length - 2 && rings[i + 1].x < x) i++;
  const a = rings[i];
  const b = rings[i + 1];
  const k = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
  return { c: a.y + (b.y - a.y) * k, ry: a.ry + (b.ry - a.ry) * k, rz: a.rz + (b.rz - a.rz) * k };
}

function place(
  bag: DisposeBag,
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0
): THREE.Mesh {
  const mesh = shadowMesh(bag.add(geo), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** A cord or strap laid through a list of points. */
function strap(
  bag: DisposeBag,
  parent: THREE.Object3D,
  pts: THREE.Vector3[],
  radius: number,
  mat: THREE.Material,
  closed = false
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  return place(bag, parent, new THREE.TubeGeometry(curve, pts.length * 3, radius, 5, closed), mat);
}

const tP = new THREE.Vector3();
const tN = new THREE.Vector3();
const tC = new THREE.Color();
const tMix = new THREE.Color();
const tNormalMatrix = new THREE.Matrix3();

/**
 * Multiplies a geometry's vertex colours (created white when missing) by `fn` of each vertex's
 * position and normal. With `matrix`, both are first carried into that space.
 */
export function tintGeometry(
  geo: THREE.BufferGeometry,
  fn: (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => void,
  matrix?: THREE.Matrix4
): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  let col = geo.attributes.color as THREE.BufferAttribute | undefined;
  if (!col) {
    col = new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3);
    geo.setAttribute('color', col);
  }
  if (matrix) tNormalMatrix.getNormalMatrix(matrix);
  for (let i = 0; i < pos.count; i++) {
    tP.fromBufferAttribute(pos, i);
    tN.fromBufferAttribute(nrm, i);
    if (matrix) {
      tP.applyMatrix4(matrix);
      tN.applyMatrix3(tNormalMatrix).normalize();
    }
    tC.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    fn(tP, tN, tC);
    col.setXYZ(i, tC.r, tC.g, tC.b);
  }
}

/**
 * Paints light and shade into the coat as a groom and a painter would: the top line catches the
 * light, the belly and the insides of the legs fall dark, and below knee and hock the coat
 * shades into the darker points. Runs once on the rest pose, before the rig is merged.
 */
export function bakeCoatShading(root: THREE.Object3D, coat: THREE.Material, points: THREE.Color): void {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.material !== coat) return;
    m.multiplyMatrices(toRoot, mesh.matrixWorld);
    tintGeometry(
      mesh.geometry,
      (p, n, c) => {
        let k = 0.8 + 0.24 * ss(n.y, -0.8, 0.6);
        const inward = -Math.sign(p.z) * n.z;
        k *= 1 - 0.2 * ss(inward, 0.15, 0.85) * (1 - ss(p.y, 0.9, 1.2));
        c.multiplyScalar(k);
        const pts = 1 - ss(p.y, 0.28, 0.62);
        if (pts > 0) c.lerp(tMix.copy(c).multiply(points), pts);
      },
      m
    );
  });
}

/**
 * A card of hair hanging down -Y: `w0` wide at the root, `w1` at the tip. `curl` bends the tip
 * along +X, `bulge` bows the card out along +Z, and `shear` slopes the root edge (dy/dx) so a
 * row of cards can follow a sloping crest while each still hangs straight down.
 */
function hairCard(
  w0: number,
  w1: number,
  len: number,
  curl = 0,
  bulge = 0,
  shear = 0,
  strands: [number, number] = [0, 1]
): THREE.BufferGeometry {
  const geo = buildSheet(2, 4, (u, v, p) => {
    const across = (u - 0.5) * (w0 + (w1 - w0) * v);
    p.set(across + curl * v * v, -len * v + across * shear, bulge * Math.sin(v * Math.PI * 0.6));
  });
  // `strands` picks the stretch of the strand texture the card shows, from the roots (0) to the
  // ragged ends (1): a card in the middle of a tail shows only the dense upper part
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const [s0, s1] = strands;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (s0 + (1 - uv.getY(i)) * (s1 - s0)));
  return geo;
}

/** Cards fanned round a common axis, so a lock of hair has body from any side. */
function fannedCards(
  bag: DisposeBag,
  parent: THREE.Object3D,
  mat: THREE.Material,
  count: number,
  w0: number,
  w1: number,
  len: number,
  curl = 0,
  strands: [number, number] = [0, 1]
): void {
  for (let k = 0; k < count; k++) {
    place(bag, parent, hairCard(w0, w1, len, curl, 0, 0, strands), mat).rotation.y = (k / count) * Math.PI;
  }
}

// ---------------------------------------------------------------------------------------- legs

function hoofGeometry(): THREE.BufferGeometry {
  const H = 0.085;
  const geo = new THREE.CylinderGeometry(0.056, 0.08, H, 14, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const down = 0.5 - y / H;
    // The toe runs forward down the wall; the heels stand lower and more upright
    const heel = x < 0 && y > 0 ? (-x / 0.056) * 0.022 : 0;
    pos.setXYZ(i, x + down * 0.03, y - heel, z * 0.88);
  }
  return geo;
}

/**
 * One leg in three jointed parts: forearm or gaskin (`upper`), cannon (`lower`) and pastern
 * with the hoof. Knee and hock, the tendons behind the cannon and the fetlock are shaped into
 * the lofts, and a tuft of feathering hangs behind the fetlock.
 */
export function buildHorseLeg3D(
  bag: DisposeBag,
  front: boolean,
  l1: number,
  l2: number,
  m: HorseMaterials
): HorseLegParts {
  const cannon = l2 - 0.16;
  const upper = new THREE.Group();
  const upperRings = front
    ? [
        ring(0.02, 0.16, 0.19, 0.12),
        ring(0.0, -0.06, 0.17, 0.115),
        ring(-0.01, -0.22, 0.14, 0.095),
        ring(0.0, -0.33, 0.1, 0.078),
        ring(0.0, -0.44, 0.066, 0.058),
        ring(0.006, -0.52, 0.074, 0.066),
        ring(0.004, -l1 - 0.03, 0.068, 0.06),
      ]
    : [
        ring(-0.02, 0.18, 0.24, 0.135),
        ring(0.0, -0.04, 0.21, 0.13),
        ring(-0.01, -0.2, 0.16, 0.105),
        ring(-0.025, -0.34, 0.11, 0.078),
        ring(-0.025, -0.46, 0.07, 0.058),
        ring(-0.02, -0.55, 0.08, 0.064),
        ring(-0.01, -l1 - 0.03, 0.07, 0.06),
      ];
  place(bag, upper, buildLoft(upperRings, { radial: 12 }), m.coat);
  if (!front) {
    // The point of the hock stands out behind the joint
    place(bag, upper, new THREE.SphereGeometry(1, 10, 8), m.coat, -0.075, -l1 + 0.05, 0).scale.set(0.035, 0.06, 0.04);
  }

  const lower = new THREE.Group();
  lower.position.y = -l1;
  upper.add(lower);
  place(
    bag,
    lower,
    buildLoft(
      [
        ring(0, 0.03, 0.07, 0.062),
        ring(-0.004, -0.05, 0.058, 0.05),
        ring(-0.01, -0.14, 0.05, 0.038),
        ring(-0.01, -cannon + 0.1, 0.05, 0.038),
        ring(-0.008, -cannon + 0.03, 0.066, 0.054),
        ring(-0.012, -cannon - 0.015, 0.064, 0.054),
      ],
      { radial: 10 }
    ),
    m.coat
  );
  const tuft = new THREE.Group();
  tuft.position.set(-0.04, -cannon + 0.03, 0);
  tuft.userData.static = true;
  lower.add(tuft);
  fannedCards(bag, tuft, m.hair, 2, 0.07, 0.1, 0.13, -0.05);

  const pastern = new THREE.Group();
  pastern.position.y = -cannon;
  lower.add(pastern);
  place(
    bag,
    pastern,
    buildLoft(
      [ring(-0.01, 0.02, 0.06, 0.052), ring(0.005, -0.03, 0.05, 0.046), ring(0.03, -0.07, 0.05, 0.047), ring(0.042, -0.09, 0.056, 0.05)],
      { radial: 10 }
    ),
    m.coat
  );
  place(bag, pastern, hoofGeometry(), m.hoof, 0.035, -0.1225, 0);
  const hoofAnchor = new THREE.Object3D();
  hoofAnchor.position.set(0.05, -0.16, 0);
  pastern.add(hoofAnchor);

  return { upper, lower, pastern, hoofAnchor };
}

// ---------------------------------------------------------------------------------------- body

// The belly tucks up into the flank in front of the quarters, under a deep chest
const BARREL: LoftRing[] = [
  ring(-1.03, 1.45, 0.02, 0.02),
  ring(-0.98, 1.44, 0.2, 0.17),
  ring(-0.82, 1.43, 0.36, 0.33),
  ring(-0.58, 1.42, 0.4, 0.37),
  ring(-0.3, 1.37, 0.42, 0.36),
  ring(0.0, 1.32, 0.43, 0.37),
  ring(0.3, 1.3, 0.45, 0.375),
  ring(0.56, 1.31, 0.47, 0.36),
  ring(0.78, 1.35, 0.45, 0.32),
  ring(0.95, 1.38, 0.36, 0.26),
  ring(1.04, 1.41, 0.17, 0.14),
  ring(1.07, 1.41, 0.02, 0.02),
];

const CLOTH: LoftRing[] = [
  ring(-0.4, 1.365, 0.445, 0.39),
  ring(-0.2, 1.345, 0.44, 0.39),
  ring(0.08, 1.315, 0.45, 0.4),
  ring(0.3, 1.3, 0.475, 0.405),
  ring(0.44, 1.305, 0.485, 0.4),
];

/** A point on the saddle cloth at `x`, `a` radians round from the top, `lift` above it. */
function onCloth(x: number, a: number, lift: number, out: THREE.Vector3): THREE.Vector3 {
  const s = ringsAt(CLOTH, x);
  return out.set(x, s.c + (s.ry + lift) * Math.cos(a), (s.rz + lift) * Math.sin(a));
}

/**
 * Barrel, the muscle masses of shoulder, breast and quarters, the saddle cloth with its bands
 * and tassels, and a saddle built on a tree with a tall front arch and a lower back arch.
 */
export function buildHorseBody3D(bag: DisposeBag, body: THREE.Group, m: HorseMaterials): void {
  place(bag, body, buildLoft(BARREL, { radial: 18 }), m.coat);

  const muscle = (x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt = 0, seam = 0.2) => {
    const geo = new THREE.SphereGeometry(1, 16, 12);
    // The seam where the muscle meets the barrel falls into shadow, so the mass reads
    tintGeometry(geo, (p, _n, c) => c.multiplyScalar(1 - seam + seam * ss(Math.abs(p.z), 0.2, 0.8)));
    const mesh = place(bag, body, geo, m.coat, x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.z = tilt;
  };
  for (const side of [-1, 1]) {
    // The quarters: broad, but blended softly into the barrel so they do not read as a ball
    muscle(-0.6, 1.44, side * 0.2, 0.37, 0.37, 0.2, 0.15, 0.1);
    muscle(-0.8, 1.2, side * 0.17, 0.14, 0.32, 0.15, 0.67);
    muscle(0.7, 1.33, side * 0.17, 0.25, 0.44, 0.19, 0.55);
    muscle(0.94, 1.1, side * 0.1, 0.12, 0.2, 0.1);
  }

  // Saddle cloth draped over the barrel; a breast collar round the front of the chest and a
  // crupper strap round the quarters, both studded with gilt, and their tassels
  place(bag, body, buildLoft(CLOTH, { radial: 16, arc: [-Math.PI * 0.56, Math.PI * 0.56] }), m.barding);
  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Away from the barrel's long axis, i.e. off the skin
  const outward = (p: THREE.Vector3, out: THREE.Vector3) =>
    out.set(0, p.y - ringsAt(BARREL, p.x).c, p.z).normalize();
  const studded = (pts: THREE.Vector3[], studs: number[]) => {
    // A flat leather band laid along the curve, its face turned off the skin
    const curve = new THREE.CatmullRomCurve3(pts);
    const at = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const off = new THREE.Vector3();
    const across = new THREE.Vector3();
    place(
      bag,
      body,
      buildSheet(1, 28, (u, v, p) => {
        curve.getPoint(v, at);
        curve.getTangent(v, tangent);
        outward(at, off);
        across.crossVectors(tangent, off).normalize();
        p.copy(at).addScaledVector(across, (u - 0.5) * 0.06).addScaledVector(off, 0.006);
      }),
      m.leather
    );
    for (const t of studs) {
      curve.getPoint(t, at);
      outward(at, off);
      at.addScaledVector(off, 0.012);
      place(bag, body, new THREE.SphereGeometry(0.026, 10, 8), m.trim, at.x, at.y, at.z);
    }
  };
  studded(
    [v3(0.24, 1.6, -0.33), v3(0.6, 1.45, -0.37), v3(0.9, 1.31, -0.315), v3(1.06, 1.27, 0), v3(0.9, 1.31, 0.315), v3(0.6, 1.45, 0.37), v3(0.24, 1.6, 0.33)],
    [0.2, 0.35, 0.65, 0.8]
  );
  studded(
    [v3(-0.3, 1.66, -0.3), v3(-0.62, 1.58, -0.39), v3(-0.9, 1.5, -0.29), v3(-1.03, 1.45, 0), v3(-0.9, 1.5, 0.29), v3(-0.62, 1.58, 0.39), v3(-0.3, 1.66, 0.3)],
    [0.24, 0.5, 0.76]
  );
  for (const [x, y, z] of [
    [1.07, 1.3, 0],
    [-0.75, 1.52, 0.37],
    [-0.75, 1.52, -0.37],
  ]) {
    place(bag, body, new THREE.ConeGeometry(0.055, 0.26, 8), m.tassel, x, y - 0.12, z).rotation.z = Math.PI;
    place(bag, body, new THREE.SphereGeometry(0.05, 8, 8), m.trim, x, y + 0.04, z);
  }

  // Padded seat and side flaps, sitting on the cloth
  const seat = (u: number, v: number, p: THREE.Vector3) => {
    const a = (v - 0.5) * 2.6;
    const edge = ss(Math.abs(a), 0.85, 1.3);
    const x = -0.05 + (u - 0.5) * 0.6 * (1 - 0.3 * edge);
    onCloth(x, a, 0.016 + 0.022 * (1 - edge) * Math.sin(u * Math.PI), p);
  };
  place(bag, body, buildSheet(10, 12, seat), m.leather);
  for (const v of [0, 1]) {
    const hem: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const p = new THREE.Vector3();
      seat(i / 8, v, p);
      hem.push(p.addScaledVector(p.clone().setX(0).sub(new THREE.Vector3(0, ringsAt(CLOTH, p.x).c, 0)).normalize(), 0.006));
    }
    strap(bag, body, hem, 0.01, m.trim);
  }

  // The front and back arches of the saddle tree: boards that stand up off the seat and wrap down
  // either side of the spine, capped by a gilt rim
  const arch = (x0: number, lean: number, height: number, spread: number) => {
    const at = (u: number, v: number, p: THREE.Vector3) => {
      const a = (u - 0.5) * 2 * spread;
      const k = Math.cos((a / spread) * Math.PI * 0.5);
      const h = (0.045 + height * Math.pow(Math.max(0, k), 0.6)) * v;
      const s = ringsAt(CLOTH, x0);
      p.set(x0 + lean * v, s.c + (s.ry + 0.03 + h) * Math.cos(a), (s.rz + 0.03 + h * 0.6) * Math.sin(a));
    };
    for (const dx of [0.014, -0.014]) {
      place(
        bag,
        body,
        buildSheet(12, 2, (u, v, p) => {
          at(u, v, p);
          p.x += dx;
        }),
        m.leather
      );
    }
    const rim: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const p = new THREE.Vector3();
      at(i / 12, 1, p);
      rim.push(p);
    }
    strap(bag, body, rim, 0.018, m.trim);
    const boss = new THREE.Vector3();
    at(0.5, 0.62, boss);
    // A gilt boss on the outer face of each arch
    place(bag, body, new THREE.SphereGeometry(0.026, 10, 8), m.trim, boss.x + Math.sign(lean) * 0.016, boss.y, 0).scale.set(
      0.5,
      1,
      1
    );
  };
  arch(0.25, 0.03, 0.17, 0.8);
  arch(-0.28, -0.03, 0.1, 0.8);
}

// ---------------------------------------------------------------------------------------- neck

/** Neck, the crest of the mane and the mane itself as rows of hair cards; returns the locks. */
export function buildHorseNeck3D(bag: DisposeBag, neck: THREE.Group, m: HorseMaterials): THREE.Group[] {
  place(
    bag,
    neck,
    buildLoft(
      [
        ring(-0.14, -0.22, 0.4, 0.26),
        ring(0.04, 0.06, 0.35, 0.23),
        ring(0.2, 0.34, 0.28, 0.185),
        ring(0.34, 0.6, 0.22, 0.15),
        ring(0.44, 0.8, 0.175, 0.125),
        ring(0.5, 0.94, 0.12, 0.1),
      ],
      { radial: 14 }
    ),
    m.coat
  );
  place(
    bag,
    neck,
    buildLoft(
      [
        ring(-0.3, 0.16, 0.05, 0.05),
        ring(-0.2, 0.34, 0.075, 0.06),
        ring(-0.03, 0.56, 0.075, 0.055),
        ring(0.14, 0.76, 0.07, 0.05),
        ring(0.28, 0.92, 0.06, 0.045),
        ring(0.4, 1.02, 0.03, 0.03),
      ],
      { radial: 8 }
    ),
    m.crest
  );

  // The mane falls to one side in overlapping locks; each lock is three cards of loose hair that
  // sway together
  const mane: THREE.Group[] = [];
  const LOCKS = 11;
  for (let i = 0; i < LOCKS; i++) {
    const f = i / (LOCKS - 1);
    const lock = new THREE.Group();
    lock.position.set(-0.27 + f * 0.62, 0.27 + f * 0.69, 0.03 + (1 - f) * 0.03);
    lock.rotation.x = -0.36;
    for (let j = 0; j < 3; j++) {
      const len = (0.44 - f * 0.16) * [1, 0.85, 0.7][j] * (0.92 + ((i * 7 + j * 3) % 5) * 0.04);
      const card = place(bag, lock, hairCard(0.17, 0.1, len, -0.03, 0.03 + j * 0.012, 1.1), m.hair);
      card.position.set(j * 0.02 - 0.02, 0.02, 0.01 + j * 0.014);
      card.rotation.z = (((i * 5 + j) % 4) - 1.5) * 0.04;
    }
    neck.add(lock);
    mane.push(lock);
  }
  return mane;
}

// ---------------------------------------------------------------------------------------- head

const HEAD: LoftRing[] = [
  ring(-0.1, -0.03, 0.07, 0.07),
  ring(-0.03, -0.06, 0.165, 0.11),
  ring(0.07, -0.1, 0.21, 0.125),
  ring(0.18, -0.075, 0.185, 0.118),
  ring(0.3, -0.035, 0.135, 0.094),
  ring(0.42, -0.028, 0.108, 0.08),
  ring(0.53, -0.036, 0.1, 0.084),
  ring(0.6, -0.044, 0.088, 0.08),
  ring(0.645, -0.05, 0.055, 0.056),
  ring(0.665, -0.05, 0.012, 0.012),
];

/**
 * Sculpts a point of the head loft: a broad flat forehead between the eyes, the round plate of
 * the jaw, the channel between the jaw bones, the ridge running forward under the eye and the
 * flare of the nostrils. Shared by the skull and everything laid on it (bridle, face plate).
 */
function sculptHead(p: THREE.Vector3): THREE.Vector3 {
  const { x, y, z } = p;
  const s = ringsAt(HEAD, x);
  const h = (y - s.c) / s.ry;
  const sz = Math.sign(z);
  const az = Math.abs(z);
  const brow = ss(h, 0.2, 0.8) * (1 - ss(x, 0.22, 0.46)) * ss(x, -0.06, 0.04);
  let Z = z * (1 + 0.16 * brow);
  let Y = y;
  Z += sz * 0.014 * gauss(x - 0.06, 0.08) * gauss(h + 0.45, 0.3);
  Y += 0.022 * gauss(x - 0.05, 0.1) * ss(-h, 0.8, 1) * (1 - ss(az, 0.02, 0.07));
  const ridge = gauss(h + 0.05 + (x - 0.18) * 1.2, 0.12) * ss(x, 0.14, 0.2) * (1 - ss(x, 0.3, 0.38));
  Z += sz * 0.008 * ridge;
  Z += sz * 0.01 * gauss(x - 0.6, 0.03) * gauss(h - 0.15, 0.35);
  return p.set(x, Y, Z);
}

/** A point on the head `th` radians round from the top of the face, `lift` above the skin. */
function onHead(x: number, th: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  const s = ringsAt(HEAD, x);
  out.set(x, s.c + (s.ry + lift) * Math.cos(th), (s.rz + lift) * Math.sin(th));
  return sculptHead(out);
}

function buildSkullGeometry(points: THREE.Color): THREE.BufferGeometry {
  const radial = 16;
  const geo = buildLoft(HEAD, { radial });
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    sculptHead(p.fromBufferAttribute(pos, i));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const cols = radial + 1;
  for (let r = 0; r < pos.count / cols; r++) {
    const a = r * cols;
    const b = a + radial;
    const nx = nrm.getX(a) + nrm.getX(b);
    const ny = nrm.getY(a) + nrm.getY(b);
    const nz = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l);
    nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  // A dark muzzle, and the hollow of the temple above the eye
  const mix = new THREE.Color();
  tintGeometry(geo, (q, _n, c) => {
    const k = ss(q.x, 0.46, 0.6);
    if (k > 0) c.lerp(mix.copy(c).multiply(points), k * 0.85);
    c.multiplyScalar(1 - 0.2 * gauss(q.x - 0.09, 0.05) * gauss(q.y - 0.09, 0.035) * ss(Math.abs(q.z), 0.05, 0.1));
  });
  return geo;
}

/**
 * The head, built into `head` (head space: +X down the face to the nose, +Y the forehead):
 * sculpted skull, ears, eyes under a bony brow, nostrils and lips, forelock, a bridle laid on
 * the face with a gilt face plate, and the bit rings. Returns the two rein anchors.
 */
export function buildHorseHead3D(
  bag: DisposeBag,
  head: THREE.Group,
  m: HorseMaterials,
  points: THREE.Color,
  restTilt: number
): [THREE.Object3D, THREE.Object3D] {
  place(bag, head, buildSkullGeometry(points), m.coat);

  for (const side of [-1, 1]) {
    // Ears: a cupped leaf, tipped forward and out, with the dark hollow facing forward
    const ear = new THREE.Group();
    ear.position.set(-0.015, 0.092, side * 0.062);
    ear.rotation.set(side * 0.28, 0, -0.18);
    ear.userData.static = true;
    head.add(ear);
    place(
      bag,
      ear,
      buildLoft(
        [
          ring(0, 0, 0.045, 0.03),
          ring(0.004, 0.05, 0.05, 0.032),
          ring(0.012, 0.11, 0.034, 0.022),
          ring(0.016, 0.16, 0.012, 0.009),
          ring(0.017, 0.178, 0.002, 0.002),
        ],
        { radial: 10 }
      ),
      m.coat
    );
    place(bag, ear, new THREE.SphereGeometry(1, 10, 8), m.crest, 0.028, 0.075, 0).scale.set(0.012, 0.055, 0.02);

    // Eye under a bony brow
    place(bag, head, new THREE.SphereGeometry(0.027, 12, 10), m.eye, 0.15, 0.048, side * 0.088).scale.set(1.1, 0.85, 0.8);
    const brow = place(bag, head, new THREE.SphereGeometry(1, 10, 8), m.coat, 0.135, 0.08, side * 0.084);
    brow.scale.set(0.045, 0.018, 0.028);
    brow.rotation.z = 0.15;

    // Nostril and the line of the lips
    const nostril = place(bag, head, new THREE.SphereGeometry(1, 8, 6), m.dark, 0.615, -0.022, side * 0.05);
    nostril.scale.set(0.022, 0.011, 0.012);
    nostril.rotation.z = 0.6;
    strap(
      bag,
      head,
      [new THREE.Vector3(0.47, -0.105, side * 0.068), new THREE.Vector3(0.56, -0.11, side * 0.06), new THREE.Vector3(0.645, -0.1, side * 0.03)],
      0.005,
      m.dark
    );
  }
  place(bag, head, new THREE.SphereGeometry(1, 10, 8), m.coat, 0.56, -0.13, 0).scale.set(0.05, 0.03, 0.045);

  // Forelock, lying forward over the forehead from between the ears
  place(
    bag,
    head,
    buildSheet(2, 4, (u, v, p) => {
      p.set(-0.01 + v * 0.18, 0.124 - v * 0.012, (u - 0.5) * (0.11 - v * 0.04));
    }),
    m.hair
  );

  // Bridle: noseband, headpiece and cheek pieces down to the bit, browband, throatlatch
  const lay = (pts: Array<[number, number, number]>, r: number, mat: THREE.Material, closed = false) =>
    strap(
      bag,
      head,
      pts.map(([x, th, lift]) => onHead(x, th, lift)),
      r,
      mat,
      closed
    );
  lay(
    Array.from({ length: 12 }, (_, i): [number, number, number] => [0.43, (i / 12) * Math.PI * 2, 0.012]),
    0.011,
    m.leather,
    true
  );
  for (const side of [-1, 1]) {
    lay(
      [
        [-0.035, 0, 0.012],
        [-0.035, side * 0.7, 0.012],
        [-0.005, side * 1.25, 0.012],
        [0.12, side * 1.55, 0.012],
        [0.3, side * 1.72, 0.012],
        [0.45, side * 1.9, 0.016],
      ],
      0.011,
      m.leather
    );
    lay(
      [
        [-0.03, side * 0.9, 0.012],
        [-0.05, side * 1.6, 0.014],
        [-0.03, side * 2.4, 0.014],
        [-0.02, side * 3.1, 0.014],
      ],
      0.009,
      m.leather
    );
  }
  lay(
    [
      [0.02, -1.1, 0.014],
      [0.03, -0.5, 0.014],
      [0.035, 0, 0.014],
      [0.03, 0.5, 0.014],
      [0.02, 1.1, 0.014],
    ],
    0.012,
    m.trim
  );
  // Gilt face plate down the front of the face
  place(
    bag,
    head,
    buildSheet(4, 6, (u, v, p) => {
      onHead(0.05 + v * 0.33, (u - 0.5) * 2 * (0.5 - v * 0.22), 0.01, p);
    }),
    m.trim
  );
  const plume = place(bag, head, new THREE.ConeGeometry(0.045, 0.2, 6), m.tassel, -0.02, -0.33, 0);
  plume.rotation.z = Math.PI - restTilt * 0.5;

  // Bit rings at the corners of the mouth, and the anchors the reins run from
  const anchors: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  [-1, 1].forEach((side, si) => {
    const at = onHead(0.45, side * 1.9, 0.02);
    place(bag, head, new THREE.TorusGeometry(0.028, 0.007, 6, 10), m.trim, at.x, at.y, at.z);
    anchors[si].position.copy(onHead(0.45, side * 1.9, 0.026));
    head.add(anchors[si]);
  });
  return anchors;
}

// ---------------------------------------------------------------------------------------- tail

/** The tail: a short solid dock and a fall of crossed hair cards, in a chain that swings. */
export function buildHorseTail3D(bag: DisposeBag, body: THREE.Group, m: HorseMaterials): THREE.Group[] {
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = body;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    if (i === 0) seg.position.set(-1.0, 1.6, 0);
    else seg.position.set(0, -0.22, 0);
    if (i === 0) {
      place(bag, seg, buildLoft([ring(0, 0.03, 0.07, 0.06), ring(0, -0.12, 0.06, 0.05), ring(0, -0.24, 0.045, 0.04)], { radial: 8 }), m.crest);
    } else if (i === 1) {
      place(bag, seg, buildLoft([ring(0, 0.02, 0.045, 0.04), ring(0, -0.1, 0.028, 0.024), ring(0, -0.15, 0.004, 0.004)], { radial: 8 }), m.crest);
    }
    // Every segment but the last shows only the dense roots of the strands and overlaps the next,
    // so the tail falls as one mass and frays only at its end
    const w0 = 0.1 + i * 0.03;
    const last = i === 5;
    fannedCards(bag, seg, m.hair, 3, w0, w0 + 0.03, last ? 0.34 : 0.3, 0, last ? [0.05, 1] : [0.02, 0.3]);
    parent.add(seg);
    parent = seg;
    tail.push(seg);
  }
  return tail;
}
