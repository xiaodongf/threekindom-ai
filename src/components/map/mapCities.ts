import { cityTier } from '../../game/cityAspects.js';
import * as THREE from 'three';
import { bakeVertexOcclusion } from '../gfx/bakedOcclusion.js';
import type { City } from '../../game/types.js';
import { mergeRigid, type DisposeBag, type PaletteMaterials } from '../duel/duelGeometry3D.js';
import { FACTION_PIGMENT } from './mapTerrain.js';

/**
 * Cities are oversized miniatures on the campaign table. A city grows through five tiers with its
 * prosperity, the average of farming and trade (village, town, walled city, great city, metropolis); walls rise with its
 * defence; roof tiles and banners carry the owner's pigment. Footprints stay tight so a growing
 * city never buries the geography around it.
 */
export interface CityKit {
  build(city: City): THREE.Group;
  /** Soft contact shadow that grounds a model on the painted terrain. */
  blob(radius: number): THREE.Mesh;
  ring(): THREE.Mesh;
  hit(radius: number): THREE.Mesh;
}

const TIER_SIZE = [2.0, 2.4, 2.9, 3.4, 4.0];
const TIER_HOUSES = [3, 5, 7, 9, 12];

export { cityTier };

/** Changes whenever the model has to be rebuilt. */
export function citySignature(city: City): string {
  return `${city.owner}:${cityTier(city)}:${Math.round(city.defense)}`;
}

export function cityLabelHeight(city: City): number {
  const tier = cityTier(city);
  return 2.1 + tier * 0.56 + (city.isCapital ? 0.6 : 0);
}

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function createCityKit(bag: DisposeBag): CityKit {
  const palettes: PaletteMaterials = {
    matte: bag.add(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 })
    ),
    metal: bag.add(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.85 })
    ),
  };

  // Source materials only lend their colour; mergeRigid bakes it into vertices.
  const paints = new Map<string, THREE.MeshStandardMaterial>();
  const paint = (hex: number, kind: keyof PaletteMaterials = 'matte') => {
    const key = `${kind}:${hex}`;
    let m = paints.get(key);
    if (!m) {
      m = bag.add(new THREE.MeshStandardMaterial({ color: hex }));
      m.userData.palette = kind;
      paints.set(key, m);
    }
    return m;
  };

  const box = bag.add(new THREE.BoxGeometry(1, 1, 1));
  const pyramid = bag.add(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1));
  pyramid.rotateY(Math.PI / 4);
  const sphere = bag.add(new THREE.SphereGeometry(0.5, 10, 8));

  const addBox = (
    g: THREE.Group,
    mat: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rotY = 0
  ) => {
    const m = new THREE.Mesh(box, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    g.add(m);
    return m;
  };

  /** Hip roof with a slight overhang; a square-based pyramid stretched to the footprint. */
  const addRoof = (
    g: THREE.Group,
    mat: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rotY = 0
  ) => {
    const m = new THREE.Mesh(pyramid, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    g.add(m);
    return m;
  };

  const EARTH = 0x8a7c5b;
  const WALL = 0xb9ad92;
  const WALL_TOP = 0x8f8572;
  const PLASTER = 0xe9dfc9;
  const TILE = 0x3b3f44;
  const TIMBER = 0x7a2c1f;
  const GOLD = 0xd0a74f;

  const mixHex = (a: number, b: number, t: number) =>
    new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

  const build = (city: City): THREE.Group => {
    const tier = cityTier(city);
    const defense = Math.max(1, Math.min(5, Math.round(city.defense)));
    const pigment = FACTION_PIGMENT[city.owner];
    const rnd = seeded(hashString(city.id));
    const g = new THREE.Group();

    const size = TIER_SIZE[tier - 1] * (city.isCapital ? 1.08 : 1);
    const half = size / 2;
    const wallH = 0.3 + defense * 0.075;
    const wallT = 0.15 + defense * 0.012;
    const roofTile = paint(mixHex(TILE, pigment, 0.5));
    const banner = paint(pigment);

    addBox(g, paint(EARTH), size + 0.5, 0.1, size + 0.5, 0, 0, 0);

    // Curtain wall with a darker walkway on top
    const wallMat = paint(WALL);
    const topMat = paint(WALL_TOP);
    for (const [x, z, w, d] of [
      [0, -half, size, wallT],
      [0, half, size, wallT],
      [-half, 0, wallT, size],
      [half, 0, wallT, size],
    ] as const) {
      addBox(g, wallMat, w, wallH, d, x, 0.1, z);
      addBox(g, topMat, w + 0.04, 0.05, d + 0.04, x, 0.1 + wallH, z);
    }

    // South gate tower with banners
    const gateH = wallH + 0.34;
    addBox(g, wallMat, 0.74, gateH, wallT + 0.2, 0, 0.1, half);
    addBox(g, paint(0x2a2623), 0.26, wallH * 0.72, wallT + 0.22, 0, 0.1, half);
    addBox(g, paint(PLASTER), 0.62, 0.2, wallT + 0.14, 0, 0.1 + gateH, half);
    addRoof(g, roofTile, 0.98, 0.3, wallT + 0.5, 0, 0.3 + gateH, half);
    for (const sx of [-0.56, 0.56]) {
      addBox(g, paint(0x3a2c20), 0.035, 1.25 + tier * 0.1, 0.035, sx, 0.1 + wallH, half);
      addBox(g, banner, 0.03, 0.5, 0.3, sx, 0.72 + wallH + tier * 0.1, half + 0.17);
    }

    if (tier >= 3) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const th = wallH + 0.26;
          addBox(g, wallMat, 0.34, th, 0.34, sx * half, 0.1, sz * half);
          addRoof(g, roofTile, 0.52, 0.24, 0.52, sx * half, 0.1 + th, sz * half);
        }
      }
    }

    // Houses fill the wards around the hall
    const inner = half - wallT - 0.3;
    const keepOut = tier >= 2 ? 0.55 + tier * 0.07 : 0.2;
    let placed = 0;
    for (let tries = 0; tries < 80 && placed < TIER_HOUSES[tier - 1]; tries++) {
      const x = (rnd() * 2 - 1) * inner;
      const z = (rnd() * 2 - 1) * inner;
      if (Math.abs(x) < keepOut && Math.abs(z) < keepOut * 0.8) continue;
      if (Math.abs(x) < 0.3 && z > 0) continue;
      const w = 0.3 + rnd() * 0.16;
      const d = 0.22 + rnd() * 0.1;
      const rot = rnd() < 0.5 ? 0 : Math.PI / 2;
      addBox(g, paint(PLASTER), w, 0.17, d, x, 0.1, z, rot);
      addRoof(g, paint(TILE), w + 0.1, 0.15, d + 0.1, x, 0.27, z, rot);
      placed += 1;
    }

    // The hall: one storey per two tiers, crowned in gold for a capital
    if (tier >= 2) {
      const storeys = tier >= 5 ? 3 : tier >= 4 ? 2 : 1;
      let w = 0.82 + tier * 0.12;
      let d = w * 0.68;
      let y = 0.1;
      addBox(g, paint(0xa39679), w + 0.28, 0.1, d + 0.28, 0, y, -0.05);
      y += 0.1;
      for (let s = 0; s < storeys; s++) {
        const h = 0.3 - s * 0.03;
        addBox(g, paint(s === 0 ? TIMBER : PLASTER), w, h, d, 0, y, -0.05);
        addBox(g, paint(PLASTER), w * 0.82, h * 0.5, d + 0.01, 0, y + h * 0.3, -0.05);
        y += h;
        addRoof(g, roofTile, w + 0.42, 0.3, d + 0.42, 0, y, -0.05);
        y += 0.16;
        w *= 0.74;
        d *= 0.74;
      }
      if (city.isCapital) {
        const finial = new THREE.Mesh(sphere, paint(GOLD, 'metal'));
        finial.scale.setScalar(0.2);
        finial.position.set(0, y + 0.24, -0.05);
        g.add(finial);
        addBox(g, paint(GOLD, 'metal'), 0.03, 0.2, 0.03, 0, y + 0.04, -0.05);
      }
    } else {
      addBox(g, paint(TIMBER), 0.5, 0.22, 0.36, 0, 0.1, -0.05);
      addRoof(g, roofTile, 0.72, 0.22, 0.56, 0, 0.32, -0.05);
    }

    for (const child of g.children) (child as THREE.Mesh).castShadow = false;
    mergeRigid(g, palettes, bag);
    // No light on the map casts a shadow, so the miniature gets its shade here: under the
    // eaves, between the houses and where the walls meet the ground
    bakeVertexOcclusion(
      g.children.filter((child): child is THREE.Mesh => (child as THREE.Mesh).isMesh),
      { cell: 0.06, ground: 0.1, strength: 0.55 }
    );
    return g;
  };

  // --- shared helpers for markers under and around a city
  const blobCanvas = document.createElement('canvas');
  blobCanvas.width = 64;
  blobCanvas.height = 64;
  const bctx = blobCanvas.getContext('2d')!;
  const grad = bctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, 64, 64);
  const blobTex = bag.add(new THREE.CanvasTexture(blobCanvas));
  const blobMat = bag.add(
    new THREE.MeshBasicMaterial({
      map: blobTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const unitPlane = bag.add(new THREE.PlaneGeometry(1, 1));
  unitPlane.rotateX(-Math.PI / 2);

  const blob = (radius: number) => {
    const m = new THREE.Mesh(unitPlane, blobMat);
    m.scale.set(radius * 2, 1, radius * 2);
    m.renderOrder = 1;
    return m;
  };

  const ringGeo = bag.add(new THREE.RingGeometry(0.82, 1, 48));
  ringGeo.rotateX(-Math.PI / 2);
  const ring = () => {
    const mat = bag.add(
      new THREE.MeshBasicMaterial({
        color: 0xdcbb6e,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      })
    );
    const m = new THREE.Mesh(ringGeo, mat);
    m.renderOrder = 5;
    return m;
  };

  const hitGeo = bag.add(new THREE.CylinderGeometry(1, 1, 3.4, 10));
  const hitMat = bag.add(new THREE.MeshBasicMaterial({ visible: false }));
  const hit = (radius: number) => {
    const m = new THREE.Mesh(hitGeo, hitMat);
    m.scale.set(radius, 1, radius);
    return m;
  };

  return { build, blob, ring, hit };
}
