import * as THREE from 'three';
import { mergeRigid, type DisposeBag, type PaletteMaterials } from '../duel/duelGeometry3D.js';

/**
 * The building kit for the city close-up: a handful of shared textures and materials, and the
 * primitives every district is put together from. Everything a district adds is a plain Mesh in a
 * Group; `finish` then collapses the group into one mesh per material, so a whole city draws in a
 * dozen calls.
 */

export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Surfaces that carry a tiling texture as well as a baked colour. */
export type PaintKind = 'matte' | 'metal' | 'roof' | 'wall' | 'pave' | 'earth' | 'field';

function makeTexture(
  bag: DisposeBag,
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void,
  seed: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size, seeded(seed));
  const tex = bag.add(new THREE.CanvasTexture(canvas));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const grey = (v: number, a = 1) => {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return `rgba(${c},${c},${c},${a})`;
};

/** Rows of half-round tiles running down the slope. */
function drawTiles(ctx: CanvasRenderingContext2D, size: number, rnd: () => number) {
  const cols = 8;
  const w = size / cols;
  for (let i = 0; i < cols; i++) {
    const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
    g.addColorStop(0, grey(96));
    g.addColorStop(0.22, grey(196));
    g.addColorStop(0.5, grey(250));
    g.addColorStop(0.78, grey(190));
    g.addColorStop(1, grey(90));
    ctx.fillStyle = g;
    ctx.fillRect(i * w, 0, w + 1, size);
  }
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = grey(0, 0.34);
    ctx.fillRect(0, (r * size) / rows, size, 3);
    ctx.fillStyle = grey(255, 0.12);
    ctx.fillRect(0, (r * size) / rows + 3, size, 2);
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = grey(rnd() < 0.5 ? 0 : 255, 0.05 + rnd() * 0.07);
    ctx.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 5, 2 + rnd() * 3);
  }
}

/** Courses of brick or rammed earth, weathered. */
function drawCourses(ctx: CanvasRenderingContext2D, size: number, rnd: () => number) {
  ctx.fillStyle = grey(214);
  ctx.fillRect(0, 0, size, size);
  const rows = 16;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const shift = (r % 2) * (size / 16);
    for (let c = -1; c < 8; c++) {
      ctx.fillStyle = grey(214 + rnd() * 26);
      ctx.fillRect(c * (size / 8) + shift, r * rh, size / 8 - 1, rh - 1);
    }
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = grey(rnd() < 0.55 ? 70 : 255, 0.07 + rnd() * 0.08);
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  // Streaks of rain and soot down the face
  for (let i = 0; i < 44; i++) {
    const x = rnd() * size;
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, grey(0, 0.2 * rnd()));
    g.addColorStop(1, grey(0, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + rnd() * 7, size);
  }
}

function drawPaving(ctx: CanvasRenderingContext2D, size: number, rnd: () => number) {
  ctx.fillStyle = grey(176);
  ctx.fillRect(0, 0, size, size);
  const n = 8;
  const s = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = grey(216 + rnd() * 28);
      ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
  }
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = grey(rnd() < 0.6 ? 40 : 255, 0.05 + rnd() * 0.07);
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 4, 1 + rnd() * 3);
  }
}

function drawEarth(ctx: CanvasRenderingContext2D, size: number, rnd: () => number) {
  ctx.fillStyle = grey(222);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 10 + rnd() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, grey(rnd() < 0.5 ? 150 : 255, 0.2));
    g.addColorStop(1, grey(200, 0));
    ctx.fillStyle = g;
    // Draw across the seams so the tile repeats cleanly
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) ctx.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = grey(rnd() < 0.55 ? 60 : 255, 0.1 + rnd() * 0.12);
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

function drawFurrows(ctx: CanvasRenderingContext2D, size: number, rnd: () => number) {
  const rows = 8;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const g = ctx.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
    g.addColorStop(0, grey(120));
    g.addColorStop(0.45, grey(250));
    g.addColorStop(1, grey(128));
    ctx.fillStyle = g;
    ctx.fillRect(0, r * rh, size, rh + 1);
  }
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = grey(rnd() < 0.5 ? 40 : 255, 0.1 + rnd() * 0.1);
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 2);
  }
}

/** World units covered by one repeat of each tiling texture. */
const TILE_SPAN: Record<'roof' | 'wall' | 'pave' | 'earth' | 'field', number> = {
  roof: 3.6,
  wall: 5.6,
  pave: 6.4,
  earth: 15,
  field: 4.4,
};

/** Lays a texture over finished geometry by world position, whichever way a face looks. */
function applyWorldUv(geo: THREE.BufferGeometry, span: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    if (ny > 0.6) uv.setXY(i, pos.getX(i) / span, pos.getZ(i) / span);
    else if (nx > nz) uv.setXY(i, pos.getZ(i) / span, pos.getY(i) / span);
    else uv.setXY(i, pos.getX(i) / span, pos.getY(i) / span);
  }
  uv.needsUpdate = true;
}

export interface RoofOptions {
  /** Length of the ridge as a share of the width; a high share reads as a gabled roof. */
  ridge?: number;
  /** How far the corners of the eaves sweep up. */
  lift?: number;
}

/** Half the length of a roof's ridge, for the beam that caps it. */
export function ridgeHalfOf(w: number, d: number, ridge?: number): number {
  return (w / 2) * Math.max(0.04, Math.min(0.95, ridge ?? (w - d) / w + 0.22));
}

/**
 * A hipped roof whose slopes sag toward the eaves and whose corners turn up: the silhouette that
 * says "Chinese hall" from any distance. Built as four separate slopes so the hips stay crisp.
 */
function roofGeometry(w: number, d: number, h: number, opts: RoofOptions = {}): THREE.BufferGeometry {
  const ridgeHalf = ridgeHalfOf(w, d, opts.ridge);
  const lift = opts.lift ?? 0.3;
  const segs = 6;
  const steps = 5;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const slopeNS = Math.hypot(d / 2, h);
  const slopeEW = Math.hypot(w / 2 - ridgeHalf, h);

  const side = (alongX: boolean, sign: number, flip: boolean) => {
    const base = pos.length / 3;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const hx = w / 2 + (ridgeHalf - w / 2) * t;
      const hz = (d / 2) * (1 - t);
      const y = h * Math.pow(t, 1.55);
      for (let i = 0; i <= segs; i++) {
        const u = (i / segs) * 2 - 1;
        const up = lift * Math.pow(1 - t, 2.5) * Math.abs(u) ** 3;
        if (alongX) {
          pos.push(u * hx, y + up, sign * hz);
          uv.push((u * hx) / TILE_SPAN.roof, (t * slopeNS) / TILE_SPAN.roof);
        } else {
          pos.push(sign * hx, y + up, u * hz);
          uv.push((u * hz) / TILE_SPAN.roof, (t * slopeEW) / TILE_SPAN.roof);
        }
      }
    }
    const row = segs + 1;
    for (let k = 0; k < steps; k++) {
      for (let i = 0; i < segs; i++) {
        const a = base + k * row + i;
        const b = a + 1;
        const c = a + row;
        const e = c + 1;
        if (flip) idx.push(a, e, b, a, c, e);
        else idx.push(a, b, e, a, e, c);
      }
    }
  };
  side(true, 1, false);
  side(true, -1, true);
  side(false, 1, true);
  side(false, -1, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export interface CityKit {
  /** A colour on one of the shared surfaces. */
  paint(hex: number, kind?: PaintKind): THREE.Material;
  /** A box standing on `y`. */
  box(
    g: THREE.Object3D,
    mat: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rotY?: number
  ): THREE.Mesh;
  /** A box that narrows toward the top across its depth: the batter of a rampart. */
  batter(
    g: THREE.Object3D,
    mat: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number
  ): THREE.Mesh;
  cyl(
    g: THREE.Object3D,
    mat: THREE.Material,
    rTop: number,
    rBottom: number,
    h: number,
    x: number,
    y: number,
    z: number
  ): THREE.Mesh;
  roof(
    g: THREE.Object3D,
    mat: THREE.Material,
    w: number,
    d: number,
    h: number,
    x: number,
    y: number,
    z: number,
    rotY?: number,
    opts?: RoofOptions
  ): THREE.Mesh;
  /** A flat patch with a texture laid along its own length, for fields. */
  patch(
    g: THREE.Object3D,
    mat: THREE.Material,
    w: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rotY?: number
  ): THREE.Mesh;
  /** A child frame that is folded into its parent when the group is finished. */
  frame(parent: THREE.Object3D, x: number, z: number, rotY?: number): THREE.Group;
  /** Collapses everything added to `group` into one mesh per material. */
  finish(group: THREE.Group): void;
}

export function createCityBuildKit(bag: DisposeBag): CityKit {
  const textured = (
    draw: Parameters<typeof makeTexture>[2],
    seed: number,
    roughness: number,
    size = 256
  ) =>
    bag.add(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: makeTexture(bag, size, draw, seed),
        roughness,
        metalness: 0.02,
      })
    );

  const surfaces: Record<PaintKind, THREE.MeshStandardMaterial> = {
    matte: bag.add(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 })
    ),
    metal: bag.add(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.85 })
    ),
    roof: textured(drawTiles, 11, 0.72, 128),
    wall: textured(drawCourses, 23, 0.92),
    pave: textured(drawPaving, 37, 0.88),
    earth: textured(drawEarth, 41, 0.96),
    field: textured(drawFurrows, 53, 0.94, 128),
  };
  // A roof is an open shell, and the camera may dip under an eave
  surfaces.roof.side = THREE.DoubleSide;
  const worldSpan = new Map<THREE.Material, number>([
    [surfaces.wall, TILE_SPAN.wall],
    [surfaces.pave, TILE_SPAN.pave],
    [surfaces.earth, TILE_SPAN.earth],
  ]);

  // Source materials only lend their colour; merging bakes it into the vertices.
  const paints = new Map<string, THREE.MeshStandardMaterial>();
  const paint = (hex: number, kind: PaintKind = 'matte') => {
    const key = `${kind}:${hex}`;
    let m = paints.get(key);
    if (!m) {
      m = bag.add(new THREE.MeshStandardMaterial({ color: hex }));
      m.userData.palette = kind;
      paints.set(key, m);
    }
    return m;
  };

  const unitBox = bag.add(new THREE.BoxGeometry(1, 1, 1));
  const unitBatter = bag.add(new THREE.BoxGeometry(1, 1, 1));
  {
    const p = unitBatter.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, p.getZ(i) * 0.8);
    unitBatter.computeVertexNormals();
  }
  const cylinders = new Map<string, THREE.BufferGeometry>();
  // Geometry made to measure for one mesh; merging copies it, so it is released straight after
  const scratch: THREE.BufferGeometry[] = [];

  const place = (
    g: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rotY: number
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    g.add(m);
    return m;
  };

  return {
    paint,
    box: (g, mat, w, h, d, x, y, z, rotY = 0) => {
      const m = place(g, unitBox, mat, x, y + h / 2, z, rotY);
      m.scale.set(w, h, d);
      return m;
    },
    batter: (g, mat, w, h, d, x, y, z) => {
      const m = place(g, unitBatter, mat, x, y + h / 2, z, 0);
      m.scale.set(w, h, d);
      return m;
    },
    cyl: (g, mat, rTop, rBottom, h, x, y, z) => {
      const key = `${(rTop / (rBottom || 1)).toFixed(2)}`;
      let geo = cylinders.get(key);
      if (!geo) {
        geo = bag.add(new THREE.CylinderGeometry(rTop / (rBottom || 1), 1, 1, 10));
        cylinders.set(key, geo);
      }
      const m = place(g, geo, mat, x, y + h / 2, z, 0);
      m.scale.set(rBottom || rTop, h, rBottom || rTop);
      return m;
    },
    roof: (g, mat, w, d, h, x, y, z, rotY = 0, opts) => {
      const geo = roofGeometry(w, d, h, opts);
      scratch.push(geo);
      return place(g, geo, mat, x, y, z, rotY);
    },
    patch: (g, mat, w, d, x, y, z, rotY = 0) => {
      const geo = new THREE.PlaneGeometry(w, d);
      geo.rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (uv.getX(i) * w) / TILE_SPAN.field, (uv.getY(i) * d) / TILE_SPAN.field);
      }
      scratch.push(geo);
      return place(g, geo, mat, x, y, z, rotY);
    },
    frame: (parent, x, z, rotY = 0) => {
      const f = new THREE.Group();
      f.userData.static = true;
      f.position.set(x, 0, z);
      f.rotation.y = rotY;
      parent.add(f);
      return f;
    },
    finish: (group) => {
      mergeRigid(group, surfaces as unknown as PaletteMaterials, bag);
      for (const child of group.children) {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) continue;
        mesh.receiveShadow = true;
        const span = worldSpan.get(mesh.material as THREE.Material);
        if (span) applyWorldUv(mesh.geometry, span);
      }
      scratch.forEach((geo) => geo.dispose());
      scratch.length = 0;
    },
  };
}

/** A point in a rotated child frame, in the frame's parent space. */
export function frameToWorld(frame: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 {
  const c = Math.cos(frame.rotation.y);
  const s = Math.sin(frame.rotation.y);
  return new THREE.Vector3(
    frame.position.x + x * c + z * s,
    y,
    frame.position.z - x * s + z * c
  );
}
