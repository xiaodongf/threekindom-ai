import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Season } from '../../game/types.js';
import type { DisposeBag } from '../duel/duelGeometry3D.js';
import { createDustPuffTexture } from '../duel/duelTextures3D.js';
import { inRect, type CityLayout, type CitySpec } from './cityLayout.js';
import { hashString, seeded } from './cityParts.js';

/**
 * The country a city stands in: the ground and its hills, river and moat, woods, sky, light and
 * mist. The ground is one height field that is dead flat under the city and its farmland and
 * rises into whatever the terrain calls for beyond them.
 */
export interface CityEnvironment {
  group: THREE.Group;
  fog: THREE.FogExp2;
  exposure: number;
  heightAt(x: number, z: number): number;
  update(dt: number, elapsed: number, still: boolean): void;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    sum += valueNoise(x, z, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    z *= 2.03;
  }
  return sum / norm;
}

const GRASS: Record<Season, number> = {
  spring: 0x66803f,
  summer: 0x4f6e36,
  autumn: 0x7d7440,
  winter: 0x7f7d6c,
};
const LEAF: Record<Season, number[]> = {
  spring: [0x6f9448, 0x86a556, 0xc9a9b0],
  summer: [0x3f6a34, 0x4d7a3a, 0x356030],
  autumn: [0xb5722e, 0xc4923a, 0x8f4a26, 0x6c7a38],
  winter: [0x6b6257, 0x7a7166, 0x5c554c],
};
const PINE: Record<Season, number[]> = {
  spring: [0x3a5a38, 0x44663c],
  summer: [0x2f4f30, 0x3a5a36],
  autumn: [0x35513a, 0x3f5a38],
  winter: [0x3a4a40, 0x4a5a50],
};

const SUN_DIR = new THREE.Vector3(-170, 150, 120).normalize();

function buildTreeGeometry(pine: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tint = (geo: THREE.BufferGeometry, r: number, g: number, b: number) => {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (flat !== geo) geo.dispose();
    const n = flat.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([r, g, b], i * 3);
    flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
    flat.deleteAttribute('uv');
    return flat;
  };
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, pine ? 1.6 : 2.0, 6);
  trunk.translate(0, pine ? 0.8 : 1.0, 0);
  parts.push(tint(trunk, 0.34, 0.26, 0.18));
  if (pine) {
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.ConeGeometry(1.5 - i * 0.36, 2.2 - i * 0.2, 7);
      cone.translate(0, 2.1 + i * 1.25, 0);
      parts.push(tint(cone, 1, 1, 1));
    }
  } else {
    const blobs: Array<[number, number, number, number]> = [
      [0, 3.0, 0, 1.7],
      [0.9, 2.5, 0.3, 1.2],
      [-0.8, 2.6, -0.4, 1.25],
      [0.1, 3.9, -0.2, 1.1],
    ];
    for (const [x, y, z, r] of blobs) {
      const blob = new THREE.IcosahedronGeometry(r, 1);
      blob.scale(1, 0.82, 1);
      blob.translate(x, y, z);
      parts.push(tint(blob, 1, 1, 1));
    }
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
}

export function buildEnvironment(
  spec: CitySpec,
  L: CityLayout,
  bag: DisposeBag,
  cityTrees: Array<{ x: number; z: number; s: number }>
): CityEnvironment {
  const group = new THREE.Group();
  const seed = hashString(spec.id) & 0xffff;
  const rnd = seeded(hashString(`${spec.id}:env`));
  const terrain = spec.terrain;
  const riverMid = (z: number) => (L.river ? L.river.x + 12 * Math.sin(z * 0.011 + 1.3) : 0);

  const heightAt = (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    const box = Math.max(Math.abs(x), Math.abs(z));
    const n = fbm(x * 0.0065 + 3, z * 0.0065 + 9, seed);
    let ridged = 1 - Math.abs(2 * fbm(x * 0.0046 + 31, z * 0.0046 + 17, seed + 7) - 1);
    ridged *= ridged;
    // A skyline all the way round, far enough out to stay a backdrop
    let h = smooth(360, 580, r) * (16 + 84 * ridged);
    if (terrain === 'mountain') {
      const open = smooth(0.3, 0.85, z / (r || 1));
      // The foot of the hills wanders in and out instead of drawing a circle round the city
      const foot = r + (fbm(x * 0.011 + 70, z * 0.011 + 20, seed + 13) - 0.5) * 110;
      h += smooth(L.outer + 62, L.outer + 190, foot) * (1 - open) * (22 + 170 * ridged);
      h += smooth(L.outer + 130, L.outer + 300, box) * open * 22 * n;
    } else if (terrain === 'fortress') {
      h += smooth(L.outer + 9, L.outer + 46, Math.abs(x)) * (34 + 124 * ridged) * (0.8 + 0.4 * n);
    } else {
      h += smooth(L.outer + 125, L.outer + 310, box) * 30 * n;
    }
    // Broken ground on anything that has risen: crags, not smooth domes
    if (h > 4) h += (fbm(x * 0.034 + 60, z * 0.034 + 40, seed + 5) - 0.5) * Math.min(26, h * 0.42);
    if (L.river) {
      const off = Math.abs(x - riverMid(z));
      h = h * smooth(L.river.half, L.river.half + 34, off) - 2.8 * (1 - smooth(L.river.half - 8, L.river.half + 3, off));
    }
    return h;
  };

  // --- the ground
  const SIZE = 1400;
  const SEGS = 230;
  const ground = bag.add(new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS));
  ground.rotateX(-Math.PI / 2);
  const gp = ground.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(gp.getX(i), gp.getZ(i)));
  ground.computeVertexNormals();
  const gn = ground.attributes.normal as THREE.BufferAttribute;
  const guv = ground.attributes.uv as THREE.BufferAttribute;
  const gcol = new Float32Array(gp.count * 3);
  const grass = new THREE.Color(GRASS[spec.season]);
  const earth = new THREE.Color(0x7a6a4c);
  const rock = new THREE.Color(0x6f6a62);
  const rockDark = new THREE.Color(0x4a4744);
  const rockPale = new THREE.Color(0x9a9284);
  const rockTmp = new THREE.Color();
  const snow = new THREE.Color(0xcfd4d6);
  const mud = new THREE.Color(0x4a4636);
  const tmp = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const y = gp.getY(i);
    const z = gp.getZ(i);
    const patchy = fbm(x * 0.021 + 5, z * 0.021 + 2, seed + 3);
    tmp.copy(grass).lerp(earth, smooth(0.42, 0.7, patchy) * 0.75);
    const steep = smooth(0.9, 0.66, gn.getY(i));
    if (steep > 0) {
      // Bedded rock: bands that follow the height, broken by darker seams
      const band = Math.sin(y * 0.42 + patchy * 9) * 0.5 + 0.5;
      const seam = fbm(x * 0.06 + 12, z * 0.06 + 33, seed + 9);
      tmp.lerp(rockTmp.copy(rock).lerp(rockPale, band * 0.55).lerp(rockDark, smooth(0.5, 0.78, seam) * 0.8), steep);
    }
    tmp.lerp(rockDark, smooth(80, 170, y) * 0.5);
    if (spec.season === 'winter') tmp.lerp(snow, smooth(40, 110, y) * 0.8 + 0.12 * patchy);
    else tmp.lerp(snow, smooth(150, 200, y) * 0.7);
    if (y < -0.2) tmp.lerp(mud, smooth(-0.2, -1.6, y));
    gcol.set([tmp.r, tmp.g, tmp.b], i * 3);
    guv.setXY(i, x / 16, z / 16);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(gcol, 3));

  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = 256;
  groundCanvas.height = 256;
  {
    const ctx = groundCanvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(214,214,214)';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = rnd() < 0.5 ? 90 : 255;
      ctx.fillStyle = `rgba(${v},${v},${v},${0.08 + rnd() * 0.14})`;
      ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
    }
  }
  const groundTex = bag.add(new THREE.CanvasTexture(groundCanvas));
  groundTex.wrapS = THREE.RepeatWrapping;
  groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 8;
  const groundMesh = new THREE.Mesh(
    ground,
    bag.add(new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTex, roughness: 0.97 }))
  );
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // --- water: the river, and the moat it feeds
  const rippleCanvas = document.createElement('canvas');
  rippleCanvas.width = 128;
  rippleCanvas.height = 128;
  {
    const ctx = rippleCanvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(206,206,206)';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 150; i++) {
      const v = rnd() < 0.5 ? 150 : 255;
      ctx.fillStyle = `rgba(${v},${v},${v},${0.14 + rnd() * 0.2})`;
      const y = rnd() * 128;
      const x = rnd() * 128;
      const w = 10 + rnd() * 34;
      ctx.fillRect(x, y, w, 1.5);
      ctx.fillRect(x - 128, y, w, 1.5);
    }
  }
  const rippleTex = bag.add(new THREE.CanvasTexture(rippleCanvas));
  rippleTex.wrapS = THREE.RepeatWrapping;
  rippleTex.wrapT = THREE.RepeatWrapping;
  rippleTex.colorSpace = THREE.SRGBColorSpace;
  const waterMat = bag.add(
    new THREE.MeshStandardMaterial({
      color: spec.myth ? 0x5d7d82 : 0x6a9aa6,
      map: rippleTex,
      roughness: 0.2,
      metalness: 0.1,
      emissive: spec.myth ? 0x0e1c20 : 0x122830,
    })
  );
  const water = (x: number, y: number, z: number, w: number, d: number) => {
    const geo = bag.add(new THREE.PlaneGeometry(w, d));
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 14, (uv.getY(i) * d) / 14);
    const m = new THREE.Mesh(geo, waterMat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    group.add(m);
  };
  if (L.river) water(L.river.x, -0.9, 0, L.river.half * 2 + 70, SIZE);
  if (L.moat) {
    const mid = L.moat.inner + L.moat.width / 2;
    const span = (L.moat.inner + L.moat.width) * 2;
    water(0, 0.06, mid, span, L.moat.width);
    water(0, 0.06, -mid, span, L.moat.width);
    water(mid, 0.06, 0, L.moat.width, span);
    water(-mid, 0.06, 0, L.moat.width, span);
  }

  // --- woods
  const clear = L.outer + (L.moat ? 17 : 8);
  const onRoad = (x: number, z: number) =>
    (Math.abs(x) < 6 && (z > 0 || L.gates.n)) || (Math.abs(z) < 6 && (L.gates.e || L.gates.w));
  const pines: THREE.Matrix4[] = [];
  const leafy: THREE.Matrix4[] = [];
  const pineTint: THREE.Color[] = [];
  const leafTint: THREE.Color[] = [];
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const plant = (x: number, y: number, z: number, s: number, pine: boolean) => {
    quat.setFromAxisAngle(up, rnd() * Math.PI * 2);
    mat4.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(s, s * (0.9 + rnd() * 0.3), s));
    const palette = pine ? PINE[spec.season] : LEAF[spec.season];
    const tintColor = new THREE.Color(palette[Math.floor(rnd() * palette.length)]);
    tintColor.multiplyScalar(0.82 + rnd() * 0.3);
    if (pine) {
      pines.push(mat4.clone());
      pineTint.push(tintColor);
    } else {
      leafy.push(mat4.clone());
      leafTint.push(tintColor);
    }
  };
  const highland = terrain === 'mountain' || terrain === 'fortress';
  const wanted = highland ? 900 : 620;
  for (let tries = 0, placed = 0; tries < 16000 && placed < wanted; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = clear + Math.pow(rnd(), 0.8) * 520;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.max(Math.abs(x), Math.abs(z)) < clear) continue;
    if (onRoad(x, z)) continue;
    if (L.fieldZones.some((zone) => inRect(zone, x, z, 3))) continue;
    if (L.river && Math.abs(x - riverMid(z)) < L.river.half + 5) continue;
    const y = heightAt(x, z);
    if (y > 105) continue;
    const slope = Math.abs(heightAt(x + 4, z) - y) + Math.abs(heightAt(x, z + 4) - y);
    if (slope > (highland ? 15 : 7.5)) continue;
    const grove = fbm(x * 0.012 + 50, z * 0.012 + 80, seed + 11);
    const flat = y < 1.5;
    if (grove < (flat ? 0.54 : highland ? 0.36 : 0.46)) continue;
    const pine = highland ? rnd() < 0.72 : y > 12 ? rnd() < 0.5 : rnd() < 0.12;
    plant(x, y - 0.1, z, 0.95 + rnd() * 0.85, pine);
    placed += 1;
  }
  for (const t of cityTrees) plant(t.x, 0, t.z, t.s, false);

  const treeMat = bag.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  const grow = (pine: boolean, list: THREE.Matrix4[], tints: THREE.Color[]) => {
    if (list.length === 0) return;
    const geo = bag.add(buildTreeGeometry(pine));
    const inst = new THREE.InstancedMesh(geo, treeMat, list.length);
    list.forEach((m, i) => {
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, tints[i]);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    bag.add(inst);
    group.add(inst);
  };
  grow(true, pines, pineTint);
  grow(false, leafy, leafTint);

  // --- sky and light
  const sky = spec.myth
    ? { top: 0x10161a, horizon: 0x4a524e, glow: 0xb06c30, hemiSky: 0x9fb2bd, hemiGround: 0x2a2520, hemi: 1.5, sun: 0xffb877, sunPower: 5.6, fill: 0x8aa3b3, fillPower: 1.9 }
    : { top: 0x3b5878, horizon: 0xe2b98a, glow: 0xff9a4a, hemiSky: 0xd6e4ff, hemiGround: 0x64533c, hemi: 2.1, sun: 0xffdcae, sunPower: 6.0, fill: 0xbfd2ee, fillPower: 1.5 };
  const dome = new THREE.Mesh(
    bag.add(new THREE.SphereGeometry(1700, 32, 16)),
    bag.add(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color(sky.top) },
          uHorizon: { value: new THREE.Color(sky.horizon) },
          uGlow: { value: new THREE.Color(sky.glow) },
          uSun: { value: SUN_DIR.clone() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          uniform vec3 uGlow;
          uniform vec3 uSun;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = clamp(d.y, -0.2, 1.0);
            vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.5, h));
            float toward = max(0.0, dot(normalize(vec3(d.x, 0.001, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))));
            col += uGlow * pow(toward, 3.0) * (1.0 - smoothstep(0.0, 0.32, h));
            // Long bars of cloud lying above the horizon
            float bars = sin(d.y * 46.0 + sin(d.x * 5.0 + d.z * 3.0) * 1.6) * 0.5 + 0.5;
            col *= 1.0 - 0.16 * smoothstep(0.55, 0.95, bars) * smoothstep(0.02, 0.16, h) * (1.0 - smoothstep(0.2, 0.5, h));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    )
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  group.add(new THREE.HemisphereLight(sky.hemiSky, sky.hemiGround, sky.hemi));
  const sun = new THREE.DirectionalLight(sky.sun, sky.sunPower);
  sun.position.copy(SUN_DIR).multiplyScalar(320);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const reach = L.outer + 96;
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  sun.shadow.camera.near = 60;
  sun.shadow.camera.far = 640;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.35;
  bag.add(sun.shadow);
  group.add(sun, sun.target);
  // A cool light from the far side, so faces turned from the sun keep their form
  const fill = new THREE.DirectionalLight(sky.fill, sky.fillPower);
  fill.position.set(160, 120, -140);
  group.add(fill);

  // --- mist lying in the low ground
  const mistTex = createDustPuffTexture(bag);
  const mistMat = bag.add(
    new THREE.SpriteMaterial({
      map: mistTex,
      color: spec.myth ? 0x9aa9a8 : 0xf2dfc4,
      transparent: true,
      opacity: spec.myth ? 0.17 : 0.09,
      depthWrite: false,
    })
  );
  const mists: Array<{ sprite: THREE.Sprite; x: number; speed: number; span: number }> = [];
  const mistCount = spec.myth ? 30 : 14;
  for (let i = 0; i < mistCount; i++) {
    const overRiver = L.river && i % 3 === 0;
    const a = rnd() * Math.PI * 2;
    const r = L.outer + 24 + rnd() * 300;
    const x = overRiver ? L.river!.x + (rnd() - 0.5) * 50 : Math.cos(a) * r;
    const z = overRiver ? (rnd() - 0.5) * 520 : Math.sin(a) * r;
    const sprite = new THREE.Sprite(mistMat);
    const size = 90 + rnd() * 130;
    sprite.scale.set(size, size * 0.34, 1);
    sprite.position.set(x, Math.max(0, heightAt(x, z)) + 5 + rnd() * 9, z);
    group.add(sprite);
    mists.push({ sprite, x, speed: 1.2 + rnd() * 2.2, span: 26 + rnd() * 30 });
  }

  return {
    group,
    fog: new THREE.FogExp2(sky.horizon, spec.myth ? 0.0021 : 0.0013),
    exposure: spec.myth ? 1.0 : 0.86,
    heightAt,
    update: (dt, elapsed, still) => {
      if (still) return;
      rippleTex.offset.y = (elapsed * 0.035) % 1;
      rippleTex.offset.x = Math.sin(elapsed * 0.11) * 0.02;
      for (const m of mists) {
        m.sprite.position.x = m.x + Math.sin(elapsed * 0.02 * m.speed + m.span) * m.span;
      }
      void dt;
    },
  };
}
