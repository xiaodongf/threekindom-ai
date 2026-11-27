import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The figure kit: the people of every 3D scene, built in code.
 *
 * One low-polygon body is assembled from tapered tubes, each vertex tagged with the body part it
 * belongs to. A whole crowd is drawn in one call; every soldier in it has a place, a pose and a
 * look of their own (three small per-instance attributes), and the vertex shader does the rest:
 * legs that swing from the hip and bend at the knee, a counter-swinging shield arm, a spear that
 * comes down to the charge, a head that turns while standing, a hop and a raised weapon when the
 * ranks cheer, and a fall when a man is cut down. Nothing is animated on the CPU.
 *
 * The kit follows what Eastern Han soldiers carried, not later imagery: a knee-length robe in the
 * realm's colour under a black-lacquered lamellar cuirass laced in red, an iron helmet or a cloth
 * cap over a topknot, a long shield, and a spear, a ji (the Han halberd, a spear with a side
 * blade) or a ring-pommel sabre. Surface detail (the rows of plates, the lacing, the shield's rim,
 * boss and painted device, eyes and hair) is drawn by the fragment shader and fades out with
 * distance, so far ranks do not shimmer.
 */
export type FigureHeadgear = 'helmet' | 'cap' | 'bare';
export type FigureWeapon = 'spear' | 'ji' | 'sabre' | 'none';

export interface FigureKit {
  headgear: FigureHeadgear;
  weapon: FigureWeapon;
  shield: boolean;
  /** A lamellar cuirass over the robe; without it the figure wears the robe alone */
  armour: boolean;
  /** A robe to the ankle (townsfolk) instead of the soldier's knee-length one */
  longRobe?: boolean;
  /** Fewer sides and no small parts, for crowds that are only ever seen small (the city) */
  lite?: boolean;
}

export interface FigureCrowd {
  mesh: THREE.Mesh;
  count: number;
  /** Where instance `i` stands and which way it faces (yaw 0 faces +X) */
  place(i: number, x: number, y: number, z: number, yaw: number): void;
  /**
   * What instance `i` is doing: `gait` 0 standing, 1 marching, up to 2 running; `action` 0 weapon
   * at rest, 1 levelled to strike; `fall` 0 on his feet, 1 down; `size` is his height scale.
   */
  pose(i: number, gait: number, action: number, fall: number, size?: number): void;
  /** Cloth colour and a random number in 0..1 that sets him apart from his neighbours */
  look(i: number, tint: THREE.Color, seed: number): void;
  /** Sends changed instance data to the GPU */
  commit(): void;
  uniforms: FigureUniforms;
  dispose(): void;
}

export interface FigureUniforms {
  uFigTime: { value: number };
  /** 0 to 1: the whole crowd cheers (weapons pumped, men hopping) */
  uFigCheer: { value: number };
  /** Multiplies every colour: below 1 it quietens a crowd that should not outshine the heroes */
  uFigValue: { value: number };
  /** 0 to 1: how far armour is pulled toward blackened iron (the dark look) */
  uFigIron: { value: number };
  /**
   * 0 to 1: how much each standing man differs from his neighbours (the lean of his spear, the
   * angle of his shield, his feet, his weight, the plume and finish of his helmet), with the
   * shading that settles a watching crowd behind the heroes. 0 keeps the drilled, uniform look.
   */
  uFigVariety: { value: number };
}

// --- body parts (which joint a vertex moves with)
const TORSO = 0;
const HEAD = 1;
const THIGH_L = 2;
const SHIN_L = 3;
const THIGH_R = 4;
const SHIN_R = 5;
const ARM_L = 6;
const ARM_R = 7;

// --- surfaces (how a vertex is coloured and lit)
const CLOTH = 0;
const LACQUER = 1;
const SKIN = 2;
const IRON = 3;
const WOOD = 4;
const TASSEL = 5;
const LEATHER = 6;
const SHIELD = 7;
const DARK_CLOTH = 8;

const BASE_COLOUR: Record<number, number> = {
  [CLOTH]: 0xf2eee6,
  [LACQUER]: 0x231c1a,
  [SKIN]: 0xb98a66,
  [IRON]: 0x6e747c,
  [WOOD]: 0x5b3d26,
  [TASSEL]: 0xa02318,
  [LEATHER]: 0x2c211a,
  [SHIELD]: 0xe9e2d4,
  [DARK_CLOTH]: 0x241d1c,
};

// --- proportions, in metres for a figure of scale 1
const HIP_Y = 0.86;
const HIP_Z = 0.095;
const KNEE_Y = 0.48;
const SHOULDER_Y = 1.4;
const SHOULDER_Z = 0.225;
const NECK_Y = 1.5;
const HEAD_Y = 1.615;
// A figure faces +X with +Y up, so his right hand is at +Z and his left at -Z: the shield
// goes on the left arm and the weapon in the right hand.
const SHIELD_X = 0.33;
const SHIELD_Y = 1.07;
const SHIELD_Z = -0.27;
const SHIELD_H = 0.92;
const SHIELD_W = 0.46;

/** A tapered tube standing on the Y axis, squashed to an oval, centred at `y`. */
function tube(
  rTop: number,
  rBottom: number,
  height: number,
  sides: number,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sz = 1,
  open = true
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, height, sides, 1, open);
  g.scale(sx, 1, sz);
  g.translate(x, y, z);
  return g;
}

/** Tags every vertex of a piece with its joint, its surface and that surface's base colour. */
function piece(geo: THREE.BufferGeometry, part: number, surface: number): THREE.BufferGeometry {
  const count = geo.attributes.position.count;
  const fig = new Float32Array(count * 2);
  const colour = new Float32Array(count * 3);
  const c = new THREE.Color(BASE_COLOUR[surface]);
  for (let i = 0; i < count; i++) {
    fig[i * 2] = part;
    fig[i * 2 + 1] = surface;
    colour[i * 3] = c.r;
    colour[i * 3 + 1] = c.g;
    colour[i * 3 + 2] = c.b;
  }
  geo.setAttribute('aFig', new THREE.BufferAttribute(fig, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geo.deleteAttribute('uv');
  return geo;
}

/** A limb segment hanging from `from` toward `to`. */
function limb(
  from: THREE.Vector3,
  to: THREE.Vector3,
  rFrom: number,
  rTo: number,
  sides: number
): THREE.BufferGeometry {
  const dir = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(rFrom, rTo, dir.length(), sides, 1, true);
  // The cylinder's +Y end is `from`
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize()));
  g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return g;
}

function buildFigureGeometry(kit: FigureKit): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, part: number, surface: number) => parts.push(piece(geo, part, surface));
  const lite = kit.lite === true;
  const round = lite ? 6 : 8;
  const slim = lite ? 4 : 6;

  // Robe: a soldier's ends above the knee, a townsman's near the ankle
  const hem = kit.longRobe ? 0.16 : 0.54;
  add(tube(0.165, kit.longRobe ? 0.2 : 0.245, 0.98 - hem, round, 0, (0.98 + hem) / 2, 0, 0.94, 1.06), TORSO, CLOTH);
  // Trunk: waist, chest, shoulders
  const trunk = kit.armour ? LACQUER : CLOTH;
  add(tube(0.19, 0.165, 0.3, round, 0, 1.13, 0, 0.84, 1.08), TORSO, trunk);
  add(tube(0.165, 0.19, 0.16, round, 0, 1.36, 0, 0.84, 1.14), TORSO, trunk);
  add(tube(0.07, 0.165, 0.06, round, 0, 1.47, 0, 0.84, 1.14), TORSO, kit.armour ? CLOTH : trunk);
  if (!lite) add(tube(0.05, 0.055, 0.1, 6, 0, 1.53, 0), TORSO, SKIN);
  // A sash: over the cuirass's lower edge, or tying a plain robe at the waist
  if (!lite) add(tube(0.172, 0.172, 0.05, 8, 0, 1.0, 0, 0.86, 1.08), TORSO, kit.armour ? TASSEL : DARK_CLOTH);

  // Head
  const head = new THREE.SphereGeometry(0.105, lite ? 6 : 7, lite ? 4 : 5);
  head.scale(0.96, 1.1, 0.92);
  head.translate(0.005, HEAD_Y, 0);
  add(head, HEAD, SKIN);
  if (kit.headgear === 'helmet') {
    // An iron helmet: a dome, a neck guard flaring out behind, a tuft on the crown
    const dome = new THREE.SphereGeometry(0.118, round, lite ? 3 : 4, 0, Math.PI * 2, 0, Math.PI * 0.52);
    dome.translate(0, HEAD_Y + 0.012, 0);
    add(dome, HEAD, IRON);
    // Open in front: the arc runs from one cheek round the back of the head to the other
    const guard = new THREE.CylinderGeometry(0.118, 0.15, 0.1, round, 1, true, Math.PI * 0.82, Math.PI * 1.36);
    guard.translate(-0.005, HEAD_Y - 0.035, 0);
    add(guard, HEAD, IRON);
    // An iron finial on the crown, with a tassel of dyed horsehair falling round its foot
    const finial = new THREE.ConeGeometry(0.011, 0.075, 4);
    finial.translate(0, HEAD_Y + 0.165, 0);
    add(finial, HEAD, IRON);
    const tassel = new THREE.ConeGeometry(0.064, 0.085, lite ? 5 : 7, 1, true);
    tassel.translate(0, HEAD_Y + 0.132, 0);
    add(tassel, HEAD, TASSEL);
  } else if (kit.headgear === 'cap') {
    // A cloth cap tied over the topknot
    add(tube(0.092, 0.108, 0.07, round, 0, HEAD_Y + 0.085, 0, 1, 0.95, false), HEAD, DARK_CLOTH);
    const knot = new THREE.SphereGeometry(0.042, 5, 4);
    knot.translate(-0.03, HEAD_Y + 0.14, 0);
    add(knot, HEAD, DARK_CLOTH);
  } else {
    const knot = new THREE.SphereGeometry(0.04, 5, 4);
    knot.translate(-0.02, HEAD_Y + 0.125, 0);
    add(knot, HEAD, DARK_CLOTH);
  }

  // Legs: thigh, shin and foot each side
  for (const side of [-1, 1]) {
    const z = side * HIP_Z;
    const thigh = side < 0 ? THIGH_L : THIGH_R;
    const shin = side < 0 ? SHIN_L : SHIN_R;
    add(tube(0.082, 0.066, HIP_Y - KNEE_Y, slim, 0, (HIP_Y + KNEE_Y) / 2, z), thigh, CLOTH);
    add(tube(0.064, 0.048, KNEE_Y - 0.07, slim, 0, (KNEE_Y + 0.07) / 2, z), shin, LEATHER);
    const foot = new THREE.BoxGeometry(0.2, 0.075, 0.09);
    foot.translate(0.045, 0.038, z);
    add(foot, shin, LEATHER);
  }

  // Arms: each hangs from the shoulder and is bent forward at the elbow
  const arm = (side: number, part: number, bend: number): THREE.Vector3 => {
    const shoulder = new THREE.Vector3(0, SHOULDER_Y, side * SHOULDER_Z);
    const elbow = new THREE.Vector3(0.02, SHOULDER_Y - 0.27, side * (SHOULDER_Z + 0.015));
    const hand = elbow.clone().add(new THREE.Vector3(Math.sin(bend) * 0.25, -Math.cos(bend) * 0.25, 0));
    add(limb(shoulder, elbow, 0.062, 0.05, slim), part, CLOTH);
    add(limb(elbow, hand, 0.048, 0.04, slim), part, kit.armour ? LEATHER : CLOTH);
    if (!lite) {
      const fist = new THREE.BoxGeometry(0.075, 0.075, 0.065);
      fist.translate(hand.x + 0.02, hand.y - 0.01, hand.z);
      add(fist, part, SKIN);
    }
    return hand;
  };
  // Unarmed hands hang nearly straight; a hand with something in it is carried forward
  arm(-1, ARM_L, kit.shield ? 0.95 : 0.2);
  const grip = arm(1, ARM_R, kit.weapon === 'none' ? 0.25 : 1.2);

  if (kit.shield) {
    // A long shield, arched at top and bottom and curved round the arm
    const plate = new THREE.BoxGeometry(0.03, SHIELD_H, SHIELD_W, 1, 2, 3);
    const p = plate.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const across = p.getZ(i) / (SHIELD_W / 2);
      p.setX(i, p.getX(i) - across * across * 0.05);
      p.setY(i, p.getY(i) * (1 + 0.07 * (1 - across * across)));
    }
    plate.computeVertexNormals();
    plate.translate(SHIELD_X, SHIELD_Y, SHIELD_Z);
    add(plate, ARM_L, SHIELD);
  }

  if (kit.weapon === 'spear' || kit.weapon === 'ji') {
    const x = grip.x + 0.03;
    const z = grip.z + 0.02;
    const top = 2.42;
    add(tube(0.013, 0.015, top, 5, x, top / 2, z), ARM_R, WOOD);
    const blade = new THREE.ConeGeometry(0.03, 0.3, 4);
    blade.scale(1, 1, 0.45);
    blade.translate(x, top + 0.15, z);
    add(blade, ARM_R, IRON);
    const tassel = new THREE.ConeGeometry(0.042, 0.11, 5);
    tassel.rotateX(Math.PI);
    tassel.translate(x, top - 0.07, z);
    add(tassel, ARM_R, TASSEL);
    if (kit.weapon === 'ji') {
      // The ji's side blade, set at right angles below the point
      const sideBlade = new THREE.BoxGeometry(0.24, 0.045, 0.012);
      sideBlade.translate(x + 0.12, top - 0.02, z);
      add(sideBlade, ARM_R, IRON);
      const tip = new THREE.ConeGeometry(0.024, 0.11, 4);
      tip.scale(1, 1, 0.4);
      tip.translate(x + 0.235, top + 0.05, z);
      add(tip, ARM_R, IRON);
    }
  } else if (kit.weapon === 'sabre') {
    // A straight single-edged sabre with a ring at the pommel, carried point up
    const blade = new THREE.BoxGeometry(0.036, 0.82, 0.008);
    blade.translate(0, 0.47, 0);
    const hilt = new THREE.CylinderGeometry(0.014, 0.014, 0.16, 5);
    const ring = new THREE.TorusGeometry(0.026, 0.007, 4, 8);
    ring.rotateY(Math.PI / 2);
    ring.translate(0, -0.105, 0);
    for (const [geo, surface] of [
      [blade, IRON],
      [hilt, LEATHER],
      [ring, IRON],
    ] as const) {
      geo.rotateZ(-0.3);
      geo.translate(grip.x + 0.03, grip.y + 0.02, grip.z + 0.01);
      add(geo, ARM_R, surface);
    }
  }

  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

const kitKey = (kit: FigureKit): string =>
  [kit.headgear, kit.weapon, kit.shield, kit.armour, kit.longRobe === true, kit.lite === true].join('|');
const geometryCache = new Map<string, { geometry: THREE.BufferGeometry; users: number }>();

const f = (n: number): string => n.toFixed(4);

// ------------------------------------------------------------------------------------ shaders
const VERTEX_PARS = /* glsl */ `
attribute vec2 aFig;
attribute vec4 aPlace;
attribute vec4 aPose;
attribute vec4 aLook;
uniform float uFigTime;
uniform float uFigCheer;
uniform float uFigValue;
uniform float uFigIron;
uniform float uFigVariety;
varying vec3 vFigLocal;
varying vec2 vFigSurface;
varying vec2 vFigGloss;

// A second, third... random number for the same man, from his seed
float figHash(float seed, float k) {
  return fract(sin(seed * 91.7 + k * 13.37) * 43758.5453);
}
vec2 figTurn(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}
// Swing about the side-to-side axis: a positive angle carries a hanging limb forward
void figSwing(inout vec3 p, inout vec3 n, vec3 pivot, float a) {
  p.xy = pivot.xy + figTurn(p.xy - pivot.xy, a);
  n.xy = figTurn(n.xy, a);
}
// Turn about the upright axis, the way an object's rotation.y does
void figYaw(inout vec3 p, inout vec3 n, vec3 pivot, float a) {
  float c = cos(a);
  float s = sin(a);
  vec2 d = p.xz - pivot.xz;
  p.xz = pivot.xz + vec2(d.x * c + d.y * s, -d.x * s + d.y * c);
  n.xz = vec2(n.x * c + n.z * s, -n.x * s + n.z * c);
}
// Roll about the front-to-back axis: a positive angle carries a hanging limb toward -Z
void figRoll(inout vec3 p, inout vec3 n, vec3 pivot, float a) {
  p.yz = pivot.yz + figTurn(p.yz - pivot.yz, a);
  n.yz = figTurn(n.yz, a);
}

void figurePose(inout vec3 p, inout vec3 n) {
  float part = aFig.x;
  float seed = aLook.w;
  float fall = clamp(aPose.z, 0.0, 1.0);
  float alive = 1.0 - fall;
  float gait = aPose.x * alive;
  float march = min(gait, 1.0);
  float action = aPose.y * alive;
  // Every man keeps his own time: a slightly different pace, a different place in the stride
  float t = uFigTime * (0.94 + seed * 0.12) + seed * 40.0;
  float stride = t * (5.6 + 3.4 * max(gait - 1.0, 0.0));
  float s = sin(stride);
  float c = cos(stride);
  float cheer = uFigCheer * alive;
  // How far this man stands his own way: only while he stands, and only in a crowd that asks for it
  float own = uFigVariety * (1.0 - march) * alive;

  // A plain helmet for some: the horsehair tassel is folded away inside the crown
  if (part > 0.5 && part < 1.5 && aFig.y > 4.5 && aFig.y < 5.5) {
    float plumed = 1.0 - step(figHash(seed, 8.0), 0.3) * uFigVariety;
    p = mix(vec3(0.0, ${f(HEAD_Y + 0.1)}, 0.0), p, plumed);
  }

  if (part > 1.5 && part < 5.5) {
    // Legs: the thigh swings from the hip, and the knee folds while that leg comes forward
    float side = part < 3.5 ? -1.0 : 1.0;
    vec3 hip = vec3(0.0, ${f(HIP_Y)}, side * ${f(HIP_Z)});
    bool lower = (part > 2.5 && part < 3.5) || part > 4.5;
    if (lower) figSwing(p, n, vec3(0.0, ${f(KNEE_Y)}, hip.z), -(max(side * c, 0.0) * 0.9 * march + fall * (0.25 + seed * 0.5)));
    figSwing(p, n, hip, side * s * 0.44 * march + fall * (seed - 0.4) * 0.5);
    // Feet set apart, one a little forward of the other
    figRoll(p, n, hip, -side * (0.02 + figHash(seed, 4.0) * 0.09) * own);
    figSwing(p, n, hip, side * (figHash(seed, 9.0) - 0.5) * 0.16 * own);
  } else {
    // Trunk, head and arms lean into the march, and sway a little when standing
    float lean = 0.07 * march + 0.05 * max(gait - 1.0, 0.0) + sin(t * 0.9) * 0.014 * (1.0 - march);
    if (part > 5.5 && part < 6.5) {
      vec3 shoulder = vec3(0.0, ${f(SHOULDER_Y)}, ${f(-SHOULDER_Z)});
      figSwing(p, n, shoulder, s * 0.2 * march + fall * 0.6);
      // The shield turned a little out or in, carried higher or lower, tipped back or forward
      figYaw(p, n, shoulder, (figHash(seed, 2.0) - 0.5) * 0.55 * own);
      figSwing(p, n, shoulder, (figHash(seed, 3.0) - 0.55) * 0.22 * own);
      p.y += (figHash(seed, 5.0) - 0.5) * 0.1 * own;
    } else if (part > 6.5) {
      // The weapon arm: levelled to strike, or pumped overhead when the ranks cheer
      vec3 shoulder = vec3(0.0, ${f(SHOULDER_Y)}, ${f(SHOULDER_Z)});
      figSwing(p, n, shoulder, -action * 1.26 - s * 0.05 * march - fall * 0.9);
      // Each man's spear leans its own way; a few rest it back against the shoulder
      float h = figHash(seed, 1.0);
      figSwing(p, n, shoulder, ((h - 0.5) * 0.3 + step(0.86, h) * 0.22) * own);
      figRoll(p, n, shoulder, (figHash(seed, 6.0) - 0.5) * 0.14 * own);
      p.y += cheer * (0.55 + 0.45 * sin(t * 9.0 + seed * 9.0)) * 0.24;
    } else if (part > 0.5) {
      figYaw(p, n, vec3(0.0, ${f(NECK_Y)}, 0.0), sin(t * 0.6 + seed * 31.0) * 0.34 * (1.0 - march) * alive);
      figSwing(p, n, vec3(0.0, ${f(NECK_Y)}, 0.0), (figHash(seed, 7.0) - 0.6) * 0.24 * own);
    }
    // Weight on one leg: the body above the hips tips and turns a little
    vec3 hips = vec3(0.0, ${f(HIP_Y)}, 0.0);
    figRoll(p, n, hips, (figHash(seed, 10.0) - 0.5) * 0.07 * own);
    figYaw(p, n, hips, (figHash(seed, 11.0) - 0.5) * 0.3 * own);
    figSwing(p, n, hips, -lean);
  }

  // The body dips at each footfall, and hops when cheering
  p.y -= abs(s) * 0.03 * march;
  p.y += cheer * abs(sin(t * 8.5 + seed * 6.2832)) * 0.1;

  // Cut down: he goes over backward about his heels, a little askew, and settles on the ground
  if (fall > 0.0) {
    figYaw(p, n, vec3(0.0), (seed - 0.5) * 1.3 * fall);
    figSwing(p, n, vec3(-0.05, 0.0, 0.0), fall * 1.5);
    p.y = max(p.y, 0.02) + 0.06 * fall;
  }

  p *= aPose.w;
  figYaw(p, n, vec3(0.0), aPlace.w);
  p += aPlace.xyz;
}
`;

const VERTEX_NORMAL = /* glsl */ `
  vec3 figPosition = vec3(position);
  vFigLocal = figPosition;
  figurePose(figPosition, objectNormal);
`;

const VERTEX_COLOUR = /* glsl */ `
  {
    float surface = aFig.y;
    // Cloth and the shield's face take the realm's colour; everything else keeps its own
    if (surface < 0.5) vColor.rgb *= aLook.rgb;
    else if (surface > 6.5 && surface < 7.5) vColor.rgb *= aLook.rgb * 1.25;
    // Each man's helmet has its own finish, from blackened to bright iron, and a few wear a
    // black plume instead of a red one
    bool onHead = aFig.x > 0.5 && aFig.x < 1.5;
    float finish = figHash(aLook.w, 12.0);
    if (onHead && surface > 2.5 && surface < 3.5) vColor.rgb *= mix(1.0, 0.55 + finish * 0.6, uFigVariety);
    if (onHead && surface > 4.5 && surface < 5.5) vColor.rgb *= mix(1.0, step(figHash(aLook.w, 8.0), 0.5) * 0.8 + 0.2, uFigVariety);
    // Weathered faces and hands, some darker than others, so no pale face pulls the eye from the heroes
    if (surface > 1.5 && surface < 2.5) vColor.rgb *= mix(1.0, 0.66 + figHash(aLook.w, 13.0) * 0.2, uFigVariety);
    vColor.rgb *= uFigValue;
    vFigSurface = vec2(surface, aLook.w);
    // (roughness, metalness) per surface
    vec2 gloss = vec2(0.9, 0.0);
    if (surface > 0.5 && surface < 1.5) gloss = vec2(0.46 - uFigIron * 0.1, 0.18 + uFigIron * 0.5);
    else if (surface < 2.5 && surface > 1.5) gloss = vec2(0.72, 0.0);
    else if (surface < 3.5 && surface > 2.5) gloss = vec2(0.42 + (0.18 + finish * 0.2) * uFigVariety, 0.86);
    else if (surface < 4.5 && surface > 3.5) gloss = vec2(0.8, 0.0);
    else if (surface < 6.5 && surface > 5.5) gloss = vec2(0.7, 0.0);
    else if (surface < 7.5 && surface > 6.5) gloss = vec2(0.52, 0.06);
    vFigGloss = gloss;
  }
`;

const FRAGMENT_PARS = /* glsl */ `
uniform float uFigValue;
uniform float uFigVariety;
varying vec3 vFigLocal;
varying vec2 vFigSurface;
varying vec2 vFigGloss;

// A soft-edged line of half-width w at distance d, antialiased by the pixel footprint aa
float figLine(float d, float w, float aa) {
  return 1.0 - smoothstep(w - aa, w + aa, abs(d));
}

// Returns a multiplier for the surface colour; 'paint' is laid over it (rgb, and how much)
float figSurfaceDetail(vec3 q, float surface, out vec4 paint) {
  paint = vec4(0.0);
  if (surface > 0.5 && surface < 1.5) {
    // Lamellar: rows of small plates, each row lapping the one below, tied with cord
    float rows = q.y * 16.0;
    float row = fract(rows);
    float around = atan(q.z, q.x) * 3.82 + floor(rows) * 0.5;
    float col = fract(around);
    float fade = clamp((fwidth(rows) + fwidth(around)) * 1.5, 0.0, 1.0);
    float gap = min(smoothstep(0.0, 0.18, row), smoothstep(0.0, 0.14, col));
    float lip = smoothstep(0.72, 1.0, row) * 0.3;
    float lace = step(0.8, row) * step(abs(col - 0.5), 0.13) * (1.0 - fade);
    paint = vec4(0.32, 0.035, 0.025, lace);
    return mix(mix(0.5, 1.0, gap) + lip, 0.92, fade);
  }
  if (surface > 6.5 && surface < 7.5) {
    // Shield: lacquered hide on a wooden frame, with a black rim, a bronze boss at the grip and
    // one of three painted devices in black and cinnabar. The inside is left plain and darker.
    float up = (q.y - ${f(SHIELD_Y)}) / ${f(SHIELD_H * 0.54)};
    float across = (q.z - (${f(SHIELD_Z)})) / ${f(SHIELD_W * 0.5)};
    float face = step(${f(SHIELD_X)} - across * across * 0.05, q.x);
    float aa = clamp(fwidth(up) + fwidth(across), 0.002, 0.2);
    float rim = smoothstep(0.84 - aa, 0.84 + aa, max(abs(up), abs(across)));
    float r = length(vec2(up * 1.9, across));
    float boss = 1.0 - smoothstep(0.17 - aa, 0.17 + aa, r);
    float black = rim;
    float red = 0.0;
    float device = fract(vFigSurface.y * 7.31);
    if (device < 0.25) {
      // Plain: only the rim and the boss
    } else if (device < 0.5) {
      // A roundel: a cinnabar ring round the boss inside a black one, black bars above and below
      red = figLine(r - 0.42, 0.07, aa);
      black = max(black, figLine(r - 0.56, 0.035, aa));
      black = max(black, figLine(abs(up) - 0.66, 0.045, aa) * step(abs(across), 0.84));
    } else if (device < 0.75) {
      // Cloud scrolls: a cinnabar wave across the top and the foot, a black spine between
      float wave = sin(across * 7.0 + up * 2.0) * 0.06;
      red = max(figLine(up - 0.58 - wave, 0.06, aa), figLine(up + 0.58 + wave, 0.06, aa));
      black = max(black, figLine(across, 0.05, aa) * step(abs(up), 0.46));
    } else {
      // Chevrons pointing up, black over cinnabar
      float v = up - abs(across) * 0.55;
      black = max(black, figLine(v - 0.35, 0.06, aa));
      red = figLine(v - 0.12, 0.06, aa) + figLine(v + 0.55, 0.05, aa);
    }
    red *= face * (1.0 - boss);
    black *= mix(1.0, face, 1.0 - rim);
    // Old cinnabar, dulled by weather: it reads up close and stays quiet across the field
    paint = boss > 0.0 ? vec4(0.36, 0.26, 0.14, boss * face) : vec4(0.25, 0.055, 0.04, min(red, 1.0) * (1.0 - black) * 0.8);
    return mix(mix(0.62, 1.0, face), 0.22, black) * (1.0 - boss * face * 0.2);
  }
  if (surface > 1.5 && surface < 2.5 && q.y > ${f(NECK_Y + 0.02)}) {
    // A face: eyes and brow in front, hair behind and above
    vec3 h = q - vec3(0.0, ${f(HEAD_Y)}, 0.0);
    float eyes = 1.0 - smoothstep(0.012, 0.022, length(vec2(h.y - 0.012, abs(h.z) - 0.04)));
    float brow = (1.0 - smoothstep(0.004, 0.012, abs(h.y - 0.04))) * step(0.012, abs(h.z)) * step(abs(h.z), 0.07);
    float front = step(0.045, h.x);
    float hair = max(step(h.x, -0.035), step(0.07, h.y));
    float beard = step(0.5, vFigSurface.y) * step(h.y, -0.045) * step(0.02, h.x);
    // In a crowd the eyes sit in the shade of the helmet's brim or the cap
    float brim = smoothstep(0.0, 0.05, h.y) * front * uFigVariety * 0.45;
    return (1.0 - max(max(eyes, brow * 0.7) * front * 0.8, max(hair * 0.78, beard * 0.6))) * (1.0 - brim);
  }
  return 1.0;
}
`;

const FRAGMENT_COLOUR = /* glsl */ `
  {
    vec4 figPaint;
    diffuseColor.rgb *= figSurfaceDetail(vFigLocal, vFigSurface.x, figPaint);
    diffuseColor.rgb = mix(diffuseColor.rgb, figPaint.rgb * uFigValue, figPaint.a * 0.85);
    // A crowd stands on the ground: the light falls off toward the feet
    diffuseColor.rgb *= mix(1.0, 0.5 + 0.5 * smoothstep(0.0, 0.95, vFigLocal.y), uFigVariety);
  }
`;

function createMaterials(uniforms: FigureUniforms): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${VERTEX_NORMAL}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = figPosition;')
      .replace('#include <color_vertex>', `#include <color_vertex>\n${VERTEX_COLOUR}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOUR}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = vFigGloss.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = vFigGloss.y;');
  };
  material.customProgramCacheKey = () => 'figure1';

  // The shadow pass must pose the figures the same way, or their shadows would stand still
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed = vec3(position);\n  vec3 figNormal = vec3(0.0, 1.0, 0.0);\n  figurePose(transformed, figNormal);'
      );
  };
  depth.customProgramCacheKey = () => 'figureDepth1';
  return { material, depth };
}

/** A crowd of `count` figures wearing one kit, drawn in a single call. */
export function createFigureCrowd(kit: FigureKit, count: number): FigureCrowd {
  const key = kitKey(kit);
  let shared = geometryCache.get(key);
  if (!shared) {
    shared = { geometry: buildFigureGeometry(kit), users: 0 };
    geometryCache.set(key, shared);
  }
  shared.users += 1;

  const geometry = new THREE.InstancedBufferGeometry();
  for (const name of ['position', 'normal', 'color', 'aFig']) {
    geometry.setAttribute(name, shared.geometry.attributes[name]);
  }
  geometry.instanceCount = count;
  const placeData = new Float32Array(count * 4);
  const poseData = new Float32Array(count * 4);
  const lookData = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    poseData[i * 4 + 3] = 1;
    lookData[i * 4] = lookData[i * 4 + 1] = lookData[i * 4 + 2] = 1;
    lookData[i * 4 + 3] = (i * 0.61803398875) % 1;
  }
  const placeAttr = new THREE.InstancedBufferAttribute(placeData, 4);
  const poseAttr = new THREE.InstancedBufferAttribute(poseData, 4);
  const lookAttr = new THREE.InstancedBufferAttribute(lookData, 4);
  placeAttr.setUsage(THREE.DynamicDrawUsage);
  poseAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPlace', placeAttr);
  geometry.setAttribute('aPose', poseAttr);
  geometry.setAttribute('aLook', lookAttr);

  const uniforms: FigureUniforms = {
    uFigTime: { value: 0 },
    uFigCheer: { value: 0 },
    uFigValue: { value: 1 },
    uFigIron: { value: 0 },
    uFigVariety: { value: 0 },
  };
  const { material, depth } = createMaterials(uniforms);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // The shader moves every figure away from the origin, so the mesh's own bounds mean nothing
  mesh.frustumCulled = false;

  let placeDirty = true;
  let poseDirty = true;
  let lookDirty = true;
  return {
    mesh,
    count,
    uniforms,
    place(i, x, y, z, yaw) {
      placeData[i * 4] = x;
      placeData[i * 4 + 1] = y;
      placeData[i * 4 + 2] = z;
      placeData[i * 4 + 3] = yaw;
      placeDirty = true;
    },
    pose(i, gait, action, fall, size) {
      poseData[i * 4] = gait;
      poseData[i * 4 + 1] = action;
      poseData[i * 4 + 2] = fall;
      if (size !== undefined) poseData[i * 4 + 3] = size;
      poseDirty = true;
    },
    look(i, tint, seed) {
      lookData[i * 4] = tint.r;
      lookData[i * 4 + 1] = tint.g;
      lookData[i * 4 + 2] = tint.b;
      lookData[i * 4 + 3] = seed;
      lookDirty = true;
    },
    commit() {
      if (placeDirty) placeAttr.needsUpdate = true;
      if (poseDirty) poseAttr.needsUpdate = true;
      if (lookDirty) lookAttr.needsUpdate = true;
      placeDirty = poseDirty = lookDirty = false;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      depth.dispose();
      shared!.users -= 1;
      if (shared!.users <= 0) {
        shared!.geometry.dispose();
        geometryCache.delete(key);
      }
    },
  };
}

const scratchHsl = { h: 0, s: 0, l: 0 };

/**
 * One man's cloth colour: his realm's, pulled toward dark iron by `iron`, then shifted a little
 * in hue and value by his own `seed` so no two coats in a rank are quite alike. `uniformity`
 * (0 to 1) narrows that spread: a well-drilled, well-supplied unit is dressed alike.
 */
export function figureTint(
  out: THREE.Color,
  realm: THREE.Color,
  dark: THREE.Color,
  iron: number,
  seed: number,
  uniformity = 0.5
): THREE.Color {
  const spread = 1 - uniformity;
  const a = (seed * 12.9898) % 1;
  const b = (seed * 78.233) % 1;
  out.copy(realm).lerp(dark, iron);
  out.getHSL(scratchHsl);
  out.setHSL(
    (scratchHsl.h + (a - 0.5) * 0.045 * spread + 1) % 1,
    Math.min(1, scratchHsl.s * (1 - b * 0.35 * spread)),
    Math.min(1, scratchHsl.l * (0.82 + a * 0.36 * (0.4 + spread)))
  );
  return out;
}

/** The kits of a rank and file, mixed by index: mostly spearmen, with ji and sabre men among them. */
export const SOLDIER_KITS: FigureKit[] = [
  { headgear: 'helmet', weapon: 'spear', shield: true, armour: true },
  { headgear: 'cap', weapon: 'ji', shield: false, armour: true },
  { headgear: 'helmet', weapon: 'sabre', shield: true, armour: true },
];
