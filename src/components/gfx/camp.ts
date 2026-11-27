import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DisposeBag } from '../duel/duelGeometry3D.js';
import { createFire } from './fire.js';
import type { Wind } from './wind.js';

/**
 * The camp behind the armies: the ground between the fighting and the painted horizon.
 *
 * Without it that ground is an empty fogged plane, and the eye reads a stage with a backcloth.
 * With rows of tents, racked spears, stake fences, a few fires and standards on tall poles
 * standing in the haze, the scene has a foreground (the fight), a middle distance (the camp)
 * and a background (the painting), and the fog has shapes to fade.
 *
 * Everything is instanced: the whole camp costs a handful of draw calls and casts no shadows.
 */
export interface CampOptions {
  /** `ring`: wrapped round the far side of a duel ground. `field`: rows behind a battle line. */
  layout: 'ring' | 'field';
  /** Cloth colours of the army camped on the left (x < 0) and on the right */
  left: THREE.ColorRepresentation;
  right: THREE.ColorRepresentation;
  /** Nothing is placed farther from the camera's side than this depth (a fortress wall, the backdrop) */
  maxDepth: number;
  /** Nothing is placed right of this x (a fortress stands there) */
  maxX?: number;
  /** Fires burn after dark and under the dark look */
  fires: boolean;
  wind: Wind;
  seed?: number;
}

export interface Camp {
  group: THREE.Group;
  /** Flickers the fires */
  update(elapsed: number): void;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Darkens a tent toward the ground through its vertex colours: cloth near the earth is damp,
 * dirty and in the shade of the tent beside it, and the gradient gives a flat-sided shape form
 * even when the sun is behind it.
 */
function shadeByHeight(geometry: THREE.BufferGeometry, height: number): THREE.BufferGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const colour = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = 0.58 + 0.42 * Math.min(1, Math.max(0, pos.getY(i) / height));
    colour[i * 3] = colour[i * 3 + 1] = colour[i * 3 + 2] = v;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  return geometry;
}

/** A ridge tent: a long prism of cloth over a ridge pole, lying along X. */
function ridgeTent(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1.15, 0);
  shape.lineTo(0, 1.75);
  shape.lineTo(1.15, 0);
  shape.closePath();
  const body = new THREE.ExtrudeGeometry(shape, { depth: 3.3, bevelEnabled: false });
  body.translate(0, 0, -1.65);
  body.rotateY(Math.PI / 2);
  return shadeByHeight(body, 1.75);
}

/** A commander's round tent: a low wall under a conical roof with a finial. */
function roundTent(): THREE.BufferGeometry {
  const wall = new THREE.CylinderGeometry(1.9, 2.0, 1.25, 12, 1, true);
  wall.translate(0, 0.625, 0);
  const roof = new THREE.ConeGeometry(2.25, 1.55, 12, 1, true);
  roof.translate(0, 2.0, 0);
  const finial = new THREE.ConeGeometry(0.12, 0.6, 5);
  finial.translate(0, 3.05, 0);
  const parts = [wall, roof, finial].map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  return shadeByHeight(merged, 2.8);
}

/** A spear rack: two trestles, a rail, and spears leaning on it. */
function spearRack(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stick = (x: number, y: number, z: number, len: number, rz: number, rx = 0, r = 0.028) => {
    const g = new THREE.CylinderGeometry(r, r, len, 4);
    g.rotateZ(rz);
    g.rotateX(rx);
    g.translate(x, y, z);
    parts.push(g);
  };
  for (const x of [-0.95, 0.95]) {
    stick(x, 0.55, 0.22, 1.2, 0, 0.36);
    stick(x, 0.55, -0.22, 1.2, 0, -0.36);
  }
  stick(0, 1.08, 0, 2.2, Math.PI / 2);
  for (let i = 0; i < 6; i++) stick(-0.8 + i * 0.32, 1.12, 0.22, 2.5, 0, 0.17, 0.018);
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

/** A length of stake fence: sharpened stakes crossed over a rail, pointing outward. */
function stakeFence(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rail = new THREE.CylinderGeometry(0.05, 0.05, 3.6, 4);
  rail.rotateZ(Math.PI / 2);
  rail.translate(0, 0.55, 0);
  parts.push(rail);
  for (let i = 0; i < 7; i++) {
    for (const lean of [0.75, -0.75]) {
      const stake = new THREE.ConeGeometry(0.055, 1.7, 4);
      stake.rotateX(lean);
      stake.translate(-1.5 + i * 0.5, 0.6, 0);
      parts.push(stake);
    }
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

export function buildCamp(options: CampOptions, bag: DisposeBag): Camp {
  const rnd = seeded(options.seed ?? 20214);
  const group = new THREE.Group();
  const maxX = options.maxX ?? Infinity;
  const taken: Array<{ x: number; z: number; r: number }> = [];

  /** Finds a free spot for something of radius `r`, in the band `near`..`far` of the layout's depth. */
  const spot = (r: number, near: number, far: number): { x: number; z: number; face: number } | null => {
    for (let tries = 0; tries < 40; tries++) {
      let x: number;
      let z: number;
      let face: number;
      if (options.layout === 'ring') {
        const angle = Math.PI * (0.06 + rnd() * 0.88);
        const radius = near + rnd() * (far - near);
        x = Math.cos(angle) * radius * 1.18;
        z = -Math.sin(angle) * radius * 0.9 + 0.8;
        // Tents stand side on to the ring, their doors along the camp lanes
        face = -angle + Math.PI / 2 + (rnd() - 0.5) * 0.5;
      } else {
        x = (rnd() * 2 - 1) * 36;
        z = -(near + rnd() * (far - near));
        face = (rnd() - 0.5) * 0.4;
      }
      if (-z > options.maxDepth || x > maxX) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r)) continue;
      taken.push({ x, z, r });
      return { x, z, face };
    }
    return null;
  };

  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  const canvasCloth = new THREE.Color(0x8f8268);
  const sideColour = (x: number) => new THREE.Color(x < 0 ? options.left : options.right);
  const instanced = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    places: Array<{ x: number; z: number; face: number; scale: number; tint: THREE.Color }>
  ) => {
    if (places.length === 0) return;
    const mesh = new THREE.InstancedMesh(bag.add(geometry), material, places.length);
    places.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.face, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, p.tint);
    });
    mesh.frustumCulled = false;
    bag.add(mesh);
    group.add(mesh);
  };
  type Place = { x: number; z: number; face: number; scale: number; tint: THREE.Color };
  const gather = (count: number, r: number, near: number, far: number, tint: (x: number) => THREE.Color, scale = () => 1): Place[] => {
    const out: Place[] = [];
    for (let i = 0; i < count; i++) {
      const s = spot(r, near, far);
      if (s) out.push({ ...s, scale: scale(), tint: tint(s.x) });
    }
    return out;
  };

  const ring = options.layout === 'ring';
  const near = ring ? 17.5 : 12;
  const far = Math.min(options.maxDepth, ring ? 37 : 34);
  const cloth = bag.add(new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide, vertexColors: true }));
  const timber = bag.add(new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 }));

  // Commanders' tents first, so the rows of ridge tents fall in around them
  instanced(
    roundTent(),
    cloth,
    gather(3, 4.2, near + 3, far, (x) => colour.copy(canvasCloth).lerp(sideColour(x), 0.3).clone(), () => 1 + rnd() * 0.25)
  );
  instanced(
    ridgeTent(),
    cloth,
    gather(ring ? 22 : 26, 2.6, near, far, () => colour.copy(canvasCloth).multiplyScalar(0.8 + rnd() * 0.35).clone(), () => 0.9 + rnd() * 0.3)
  );
  instanced(spearRack(), timber, gather(7, 1.7, near - 1.5, near + 9, () => new THREE.Color(0xffffff)));
  // The stake fence faces outward from the camp
  instanced(stakeFence(), timber, gather(ring ? 6 : 8, 2.4, near - 2, near + 3, () => new THREE.Color(0xffffff)));

  // Standards: a tall pole with a small flag in the army's colour, flying in the scene's wind
  const poleGeo = new THREE.CylinderGeometry(0.045, 0.06, 6.2, 5);
  poleGeo.translate(0, 3.1, 0);
  const standards = gather(8, 1.2, near, far - 3, (x) => sideColour(x), () => 0.9 + rnd() * 0.35);
  instanced(poleGeo, timber, standards.map((s) => ({ ...s, tint: new THREE.Color(0xffffff) })));
  const flagGeo = bag.add(new THREE.PlaneGeometry(1.5, 0.95, 8, 2));
  flagGeo.translate(0.75, 0, 0);
  const flagMats = new Map<string, THREE.MeshStandardMaterial>();
  for (const s of standards) {
    const key = s.tint.getHexString();
    let mat = flagMats.get(key);
    if (!mat) {
      mat = bag.add(new THREE.MeshStandardMaterial({ color: s.tint, roughness: 0.85, side: THREE.DoubleSide }));
      flagMats.set(key, mat);
    }
    const flag = new THREE.Mesh(flagGeo, mat);
    flag.position.set(s.x, 5.55 * s.scale, s.z);
    flag.scale.setScalar(s.scale);
    // Streaming down the wind from the pole
    flag.rotation.y = Math.atan2(-options.wind.direction.y, options.wind.direction.x);
    options.wind.cloth(flag, { axis: 'x', pin: 0, length: 1.5, amplitude: 0.2, ripples: 5 });
    group.add(flag);
  }

  // Cooking fires between the tents: the same living flames as the braziers, on their own clock
  const fire = options.fires ? createFire(bag, 0.75) : null;
  const flames: THREE.Object3D[] = [];
  if (fire) {
    const sources: THREE.Vector3[] = [];
    for (let i = 0; i < 5; i++) {
      const s = spot(1.6, near + 1, far - 4);
      if (!s) continue;
      const flame = fire.flame(1.0, 1.5, i * 0.37 + 0.2);
      flame.position.set(s.x, 0.05, s.z);
      group.add(flame);
      flames.push(flame);
      sources.push(new THREE.Vector3(s.x, 0.4, s.z));
    }
    if (sources.length) group.add(fire.embers(sources, 10, 2.4));
  }

  return {
    group,
    update(elapsed) {
      fire?.update(elapsed);
      flames.forEach((flame, i) => {
        flame.scale.y = 1 + Math.sin(elapsed * 11 + i * 2.3) * 0.05;
      });
    },
  };
}
