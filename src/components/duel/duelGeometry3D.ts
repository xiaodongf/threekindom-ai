import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Collects GPU resources built for one duel scene so they can all be released together. */
export class DisposeBag {
  private items: Array<{ dispose(): void }> = [];

  add<T extends { dispose(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  dispose(): void {
    for (const item of this.items) item.dispose();
    this.items = [];
  }
}

/** One elliptical cross-section of a lofted body, centred on a spine that lies in the XY plane. */
export interface LoftRing {
  x: number;
  y: number;
  /** Half-extent perpendicular to the spine, inside the XY plane */
  ry: number;
  /** Half-extent along Z */
  rz: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function smoothRings(rings: LoftRing[], steps: number): LoftRing[] {
  if (steps <= 1 || rings.length < 3) return rings;
  const out: LoftRing[] = [];
  const at = (i: number) => rings[Math.max(0, Math.min(rings.length - 1, i))];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = at(i - 1);
    const b = at(i);
    const c = at(i + 1);
    const d = at(i + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({
        x: catmull(a.x, b.x, c.x, d.x, t),
        y: catmull(a.y, b.y, c.y, d.y, t),
        ry: Math.max(0, catmull(a.ry, b.ry, c.ry, d.ry, t)),
        rz: Math.max(0, catmull(a.rz, b.rz, c.rz, d.rz, t)),
      });
    }
  }
  out.push(rings[rings.length - 1]);
  return out;
}

/**
 * Skins a smooth organic surface over a chain of elliptical rings (horse barrel, neck, limbs,
 * cuirass…). Rings are interpolated with a Catmull-Rom spline so a handful of control sections
 * produce a continuous silhouette instead of visibly stacked primitives.
 */
export function buildLoft(
  input: LoftRing[],
  opts: { radial?: number; smooth?: number; arc?: [number, number] } = {}
): THREE.BufferGeometry {
  const radial = opts.radial ?? 14;
  const rings = smoothRings(input, opts.smooth ?? 3);
  const closed = !opts.arc;
  const [a0, a1] = opts.arc ?? [0, Math.PI * 2];
  const n = rings.length;
  const cols = radial + 1;
  const pos = new Float32Array(n * cols * 3);
  const uv = new Float32Array(n * cols * 2);

  const lens: number[] = [0];
  for (let i = 1; i < n; i++) {
    lens.push(lens[i - 1] + Math.hypot(rings[i].x - rings[i - 1].x, rings[i].y - rings[i - 1].y));
  }
  const total = lens[n - 1] || 1;

  for (let i = 0; i < n; i++) {
    const r = rings[i];
    const prev = rings[Math.max(0, i - 1)];
    const next = rings[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const nx = -ty;
    const ny = tx;
    for (let j = 0; j < cols; j++) {
      const th = a0 + ((a1 - a0) * j) / radial;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const k = (i * cols + j) * 3;
      pos[k] = r.x + nx * r.ry * c;
      pos[k + 1] = r.y + ny * r.ry * c;
      pos[k + 2] = r.rz * s;
      const u = (i * cols + j) * 2;
      uv[u] = j / radial;
      uv[u + 1] = lens[i] / total;
    }
  }

  const index: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j;
      const b = a + cols;
      const c = a + 1;
      const d = b + 1;
      index.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();

  if (closed) {
    // The first and last column of every ring coincide; average their normals so no seam shows.
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const a = i * cols;
      const b = a + radial;
      const x = nrm.getX(a) + nrm.getX(b);
      const y = nrm.getY(a) + nrm.getY(b);
      const z = nrm.getZ(a) + nrm.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      nrm.setXYZ(a, x / l, y / l, z / l);
      nrm.setXYZ(b, x / l, y / l, z / l);
    }
  }
  return geo;
}

const UP = new THREE.Vector3(0, 1, 0);

/** A tapered limb segment with rounded joints, placed between two points of its parent space. */
export function limbBetween(
  bag: DisposeBag,
  from: THREE.Vector3,
  to: THREE.Vector3,
  rFrom: number,
  rTo: number,
  mat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  g.userData.static = true;
  const dir = to.clone().sub(from);
  const len = dir.length() || 0.001;
  const shaft = new THREE.Mesh(bag.add(new THREE.CylinderGeometry(rTo, rFrom, len, 10)), mat);
  shaft.castShadow = true;
  shaft.position.y = len * 0.5;
  const j1 = new THREE.Mesh(bag.add(new THREE.SphereGeometry(rFrom, 10, 8)), mat);
  j1.castShadow = true;
  const j2 = new THREE.Mesh(bag.add(new THREE.SphereGeometry(rTo, 10, 8)), mat);
  j2.castShadow = true;
  j2.position.y = len;
  g.add(shaft, j1, j2);
  g.position.copy(from);
  g.quaternion.setFromUnitVectors(UP, dir.normalize());
  return g;
}

export function shadowMesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  cast = true,
  receive = false
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Shared vertex-coloured materials that stand in for every plain (untextured) material of a rig. */
export interface PaletteMaterials {
  matte: THREE.Material;
  metal: THREE.Material;
}

function flipWinding(geo: THREE.BufferGeometry): void {
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.attributes[name] as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const k = attr.itemSize;
    for (let i = 0; i + 2 < attr.count; i += 3) {
      for (let c = 0; c < k; c++) {
        const a = (i + 1) * k + c;
        const b = (i + 2) * k + c;
        const t = arr[a];
        arr[a] = arr[b];
        arr[b] = t;
      }
    }
  }
}

/**
 * Collapses every rigid cluster of meshes into one mesh per material. A Group is treated as a
 * joint (it may be animated) unless flagged `userData.static`; meshes flagged `userData.keep`
 * are left alone. Materials flagged `userData.palette` are folded into the shared palette
 * material by baking their colour into the vertices, so a horse-and-rider draws in a few dozen
 * calls instead of well over a hundred.
 */
export function mergeRigid(node: THREE.Object3D, palettes: PaletteMaterials, bag: DisposeBag): void {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();

  const collect = (obj: THREE.Object3D, matrix: THREE.Matrix4) => {
    for (const child of [...obj.children]) {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        if (mesh.userData.keep) continue;
        mesh.updateMatrix();
        const m = matrix.clone().multiply(mesh.matrix);
        let g = mesh.geometry.clone();
        if (g.index) {
          const flat = g.toNonIndexed();
          g.dispose();
          g = flat;
        }
        g.applyMatrix4(m);
        if (m.determinant() < 0) flipWinding(g);
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        }
        const count = g.attributes.position.count;
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();

        const src = mesh.material as THREE.MeshStandardMaterial;
        const kind = src.userData.palette as keyof PaletteMaterials | undefined;
        let target: THREE.Material = src;
        if (kind) {
          target = palettes[kind];
          const col = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            col[i * 3] = src.color.r;
            col[i * 3 + 1] = src.color.g;
            col[i * 3 + 2] = src.color.b;
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        }
        const list = buckets.get(target);
        if (list) list.push(g);
        else buckets.set(target, [g]);
        obj.remove(mesh);
      } else if (child.userData.static) {
        child.updateMatrix();
        collect(child, matrix.clone().multiply(child.matrix));
        obj.remove(child);
      } else {
        mergeRigid(child, palettes, bag);
      }
    }
  };
  collect(node, new THREE.Matrix4());

  for (const [mat, list] of buckets) {
    let merged: THREE.BufferGeometry | null = list[0];
    if (list.length > 1) {
      merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
    }
    if (!merged) continue;
    const out = new THREE.Mesh(bag.add(merged), mat);
    out.castShadow = true;
    node.add(out);
  }
}
