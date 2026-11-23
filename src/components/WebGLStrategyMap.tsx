import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  getCityGenerals,
  getCityWanderingHeroes,
  getStrikeableEnemyCityIds,
} from '../game/engine.js';
import {
  ELEVATION_ZONES,
  LAKE_FEATURES,
  LAND_PATHS,
  MAP_HEIGHT,
  MAP_WIDTH,
  MOUNTAIN_RIDGES,
  RIVER_FEATURES,
} from '../game/mapGeo.js';
import type { City, FactionId, GameState, Language } from '../game/types.js';
import { tLoc } from '../i18n/translations.js';
import { INK_LOOK } from '../utils/visualTheme.js';
import type { ActiveMapMarch } from './StrategyMap.js';
import { Art } from './ui/Art.js';

interface WebGLStrategyMapProps {
  state: GameState;
  lang: Language;
  selectedCityId: string | null;
  attackMode: boolean;
  activeMapMarch?: ActiveMapMarch | null;
  onSelectCity: (cityId: string) => void;
  onQuickTargetEnemy: (targetCityId: string) => void;
  onInspectHero?: (heroId: string) => void;
  onWebGLFallback?: () => void;
}

const FACTION_HEX: Record<FactionId, number> = {
  wei: 0x4c78a8,
  shu: 0x438554,
  wu: 0xf43f5e,
  neutral: 0x94a3b8,
};

const FACTION_CSS: Record<FactionId, string> = {
  wei: '#4c78a8',
  shu: '#438554',
  wu: '#f43f5e',
  neutral: '#94a3b8',
};

const WORLD_W = 100;
const WORLD_H = 66;
const MAX_ELEV = 8.4;

function mapToWorld(x: number, y: number): { wx: number; wz: number } {
  const wx = (x / MAP_WIDTH - 0.5) * WORLD_W;
  const wz = (y / MAP_HEIGHT - 0.5) * WORLD_H;
  return { wx, wz };
}

/** Rasterizes Natural Earth paths & ridges into a smooth heightmap + painted physical albedo texture */
function buildChinaTerrainTextures(
  cities: City[]
): { heightData: Uint8ClampedArray; hmW: number; hmH: number; albedoCanvas: HTMLCanvasElement } {
  const hmW = 256;
  const hmH = 168;
  const hmCanvas = document.createElement('canvas');
  hmCanvas.width = hmW;
  hmCanvas.height = hmH;
  const hctx = hmCanvas.getContext('2d')!;
  hctx.fillStyle = '#000000';
  hctx.fillRect(0, 0, hmW, hmH);

  const sx = hmW / MAP_WIDTH;
  const sy = hmH / MAP_HEIGHT;

  hctx.save();
  hctx.scale(sx, sy);

  // Land base elevation
  hctx.fillStyle = '#484848';
  for (const d of LAND_PATHS) {
    hctx.fill(new Path2D(d));
  }

  // Elevation biomes (blurred for smooth real mountain slopes)
  hctx.filter = 'blur(4px)';
  const elevMap: Record<(typeof ELEVATION_ZONES)[number]['kind'], string> = {
    alpine: '#dcdcdc',
    plateau: '#b4b4b4',
    mountain: '#a8a8a8',
    hills: '#747474',
    basin: '#585858',
    plain: '#525252',
  };
  for (const z of ELEVATION_ZONES) {
    hctx.fillStyle = elevMap[z.kind];
    hctx.fill(new Path2D(z.d));
  }

  // Sculpted Mountain Peaks
  hctx.filter = 'blur(2.5px)';
  for (const r of MOUNTAIN_RIDGES) {
    hctx.fillStyle = r.alpine ? '#ffffff' : '#c8c8c8';
    hctx.fill(new Path2D(r.litPath));
    hctx.fill(new Path2D(r.darkPath));
  }

  // Carve river canyons slightly below surrounding plains
  hctx.filter = 'blur(1px)';
  hctx.strokeStyle = '#363636';
  hctx.lineCap = 'round';
  for (const rv of RIVER_FEATURES) {
    hctx.lineWidth = rv.width * 1.8;
    hctx.stroke(new Path2D(rv.d));
  }
  hctx.fillStyle = '#303030';
  for (const lk of LAKE_FEATURES) {
    hctx.fill(new Path2D(lk.d));
  }
  hctx.restore();

  const heightData = hctx.getImageData(0, 0, hmW, hmH).data;

  // High-res Albedo Color Texture (1024 x 676)
  const albW = 1024;
  const albH = 676;
  const alb = document.createElement('canvas');
  alb.width = albW;
  alb.height = albH;
  const actx = alb.getContext('2d')!;

  // Ocean floor base
  actx.fillStyle = '#1a282c';
  actx.fillRect(0, 0, albW, albH);

  actx.save();
  actx.scale(albW / MAP_WIDTH, albH / MAP_HEIGHT);

  // Coastal shelf glow
  actx.strokeStyle = 'rgba(212, 168, 83, 0.25)';
  actx.lineWidth = 14;
  for (const d of LAND_PATHS) {
    actx.stroke(new Path2D(d));
  }

  // Land base fill
  const landGrad = actx.createLinearGradient(0, 0, MAP_WIDTH, MAP_HEIGHT);
  landGrad.addColorStop(0, '#5d5342');
  landGrad.addColorStop(0.5, '#3e4a3d');
  landGrad.addColorStop(1, '#2b3d34');
  actx.fillStyle = landGrad;
  for (const d of LAND_PATHS) {
    actx.fill(new Path2D(d));
  }

  // Clip detail overlays inside China landmass
  actx.save();
  const landClip = new Path2D();
  for (const d of LAND_PATHS) landClip.addPath(new Path2D(d));
  actx.clip(landClip);

  // Hypsometric Biomes
  const biomeColors: Record<(typeof ELEVATION_ZONES)[number]['kind'], string> = {
    alpine: 'rgba(203, 213, 225, 0.65)',
    plateau: 'rgba(155, 130, 92, 0.55)',
    mountain: 'rgba(100, 116, 128, 0.52)',
    basin: 'rgba(22, 118, 88, 0.52)',
    plain: 'rgba(42, 108, 80, 0.48)',
    hills: 'rgba(28, 92, 74, 0.46)',
  };
  actx.filter = 'blur(12px)';
  for (const z of ELEVATION_ZONES) {
    actx.fillStyle = biomeColors[z.kind];
    actx.fill(new Path2D(z.d));
  }

  // Kingdom territory influence wash
  actx.filter = 'blur(22px)';
  for (const city of cities) {
    if (city.owner === 'neutral') continue;
    const rad = city.isCapital ? 115 : 92;
    const cg = actx.createRadialGradient(city.x, city.y, 10, city.x, city.y, rad);
    const col =
      city.owner === 'wei'
        ? '59, 130, 246'
        : city.owner === 'shu'
          ? '16, 185, 129'
          : '244, 63, 94';
    cg.addColorStop(0, `rgba(${col}, 0.42)`);
    cg.addColorStop(1, `rgba(${col}, 0)`);
    actx.fillStyle = cg;
    actx.beginPath();
    actx.arc(city.x, city.y, rad, 0, Math.PI * 2);
    actx.fill();
  }

  // Snow-capped Mountain Crests
  actx.filter = 'none';
  for (const r of MOUNTAIN_RIDGES) {
    actx.strokeStyle = r.alpine ? 'rgba(248, 250, 252, 0.8)' : 'rgba(203, 213, 225, 0.4)';
    actx.lineWidth = r.alpine ? 2.4 : 1.5;
    actx.stroke(new Path2D(r.crestPath));
  }

  // Glowing Rivers & Natural Lakes
  actx.lineCap = 'round';
  actx.lineJoin = 'round';
  for (const rv of RIVER_FEATURES) {
    const isYellow = rv.id.includes('yellow') || rv.id === 'wei-river';
    actx.strokeStyle = isYellow ? '#5ec2b7' : '#38bdf8';
    actx.lineWidth = rv.width * 1.25;
    actx.stroke(new Path2D(rv.d));
    actx.strokeStyle = isYellow ? '#fef3c7' : '#e0f2fe';
    actx.lineWidth = Math.max(0.8, rv.width * 0.35);
    actx.stroke(new Path2D(rv.d));
  }
  for (const lk of LAKE_FEATURES) {
    actx.fillStyle = '#0ea5e9';
    actx.fill(new Path2D(lk.d));
    actx.strokeStyle = '#bae6fd';
    actx.lineWidth = 1.2;
    actx.stroke(new Path2D(lk.d));
  }

  // Strategic Supply Roads
  const seen = new Set<string>();
  actx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  actx.lineWidth = 1.6;
  actx.setLineDash([5, 5]);
  for (const c of cities) {
    for (const nid of c.neighbors) {
      const k = [c.id, nid].sort().join('--');
      if (seen.has(k)) continue;
      seen.add(k);
      const other = cities.find((x) => x.id === nid);
      if (!other) continue;
      actx.beginPath();
      actx.moveTo(c.x, c.y);
      actx.lineTo(other.x, other.y);
      actx.stroke();
    }
  }
  actx.setLineDash([]);
  actx.restore();

  // Luminous Coastline Rim
  actx.strokeStyle = 'rgba(229, 190, 106, 0.55)';
  actx.lineWidth = 1.6;
  for (const d of LAND_PATHS) {
    actx.stroke(new Path2D(d));
  }

  actx.restore();
  return { heightData, hmW, hmH, albedoCanvas: alb };
}

/** Builds a sculpted 3D Chinese Pagoda Citadel mesh group */
function create3DPagodaCitadel(city: City): THREE.Group {
  const group = new THREE.Group();
  const fColor = FACTION_HEX[city.owner];

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.78,
    metalness: 0.15,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.85,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: fColor,
    roughness: 0.4,
    metalness: 0.3,
    emissive: fColor,
    emissiveIntensity: 0.22,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.25,
    metalness: 0.8,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.35,
  });

  // Stepped Stone Plinth
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(city.isCapital ? 3.2 : 2.5, 0.65, city.isCapital ? 3.2 : 2.5),
    darkStoneMat
  );
  plinth.position.y = 0.32;
  group.add(plinth);

  // Inner Fortress Walls
  const wallBox = new THREE.Mesh(
    new THREE.BoxGeometry(city.isCapital ? 2.4 : 1.9, 1.0, city.isCapital ? 2.4 : 1.9),
    stoneMat
  );
  wallBox.position.y = 1.1;
  group.add(wallBox);

  // Corner Watchtowers for Lv.4+ Fortresses
  if (city.defense >= 4) {
    const offsets = [
      [-1.1, -1.1],
      [1.1, -1.1],
      [-1.1, 1.1],
      [1.1, 1.1],
    ];
    for (const [ox, oz] of offsets) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.4, 0.45), stoneMat);
      tower.position.set(ox, 1.25, oz);
      group.add(tower);
      const tRoof = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.45, 4), roofMat);
      tRoof.rotation.y = Math.PI / 4;
      tRoof.position.set(ox, 2.15, oz);
      group.add(tRoof);
    }
  }

  // Main Sloped Pagoda Roof (4-sided pyramid)
  const mainRoof = new THREE.Mesh(
    new THREE.ConeGeometry(city.isCapital ? 2.15 : 1.65, 1.15, 4),
    roofMat
  );
  mainRoof.rotation.y = Math.PI / 4;
  mainRoof.position.y = 2.12;
  group.add(mainRoof);

  // Capitals get a 2nd Imperial Pagoda Tier + Golden Spire!
  if (city.isCapital) {
    const upperBody = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 1.15), stoneMat);
    upperBody.position.y = 2.65;
    group.add(upperBody);

    const upperRoof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.95, 4), roofMat);
    upperRoof.rotation.y = Math.PI / 4;
    upperRoof.position.y = 3.45;
    group.add(upperRoof);

    const spire = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), goldMat);
    spire.position.y = 4.15;
    group.add(spire);
  } else {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), goldMat);
    finial.position.y = 2.82;
    group.add(finial);
  }

  // Warm Glowing City Gate Lantern
  const gateGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.55, 0.15),
    new THREE.MeshBasicMaterial({ color: 0xfde047 })
  );
  gateGlow.position.set(0, 0.9, city.isCapital ? 1.22 : 0.97);
  group.add(gateGlow);

  return group;
}

export function WebGLStrategyMap({
  state,
  lang,
  selectedCityId,
  attackMode,
  activeMapMarch,
  onSelectCity,
  onQuickTargetEnemy,
  onInspectHero,
  onWebGLFallback,
}: WebGLStrategyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [projectedLabels, setProjectedLabels] = useState<
    Array<{ id: string; sx: number; sy: number; visible: boolean }>
  >([]);
  const [webglError, setWebglError] = useState(false);

  const cities = Object.values(state.cities);
  const strikeableIds = new Set(getStrikeableEnemyCityIds(state, state.playerFaction));

  // Keep latest callbacks in refs so Three.js scene doesn't rebuild on minor UI state changes
  const propsRef = useRef({
    state,
    selectedCityId,
    attackMode,
    strikeableIds,
    onSelectCity,
    onQuickTargetEnemy,
  });
  propsRef.current = {
    state,
    selectedCityId,
    attackMode,
    strikeableIds,
    onSelectCity,
    onQuickTargetEnemy,
  };

  const marchRef = useRef(activeMapMarch);
  marchRef.current = activeMapMarch;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setWebglError(true);
      onWebGLFallback?.();
      return;
    }

    const width = container.clientWidth || 920;
    const height = container.clientHeight || 600;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(INK_LOOK.webglSkyHex);
    scene.fog = new THREE.FogExp2(INK_LOOK.webglFogHex, 0.0052);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 450);
    camera.position.set(2, 62, 62);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.43;
    controls.minPolarAngle = Math.PI * 0.14;
    controls.minDistance = 28;
    controls.maxDistance = 128;
    controls.target.set(0, 2, 2);
    controls.update();

    // Cinematic 3-Point Imperial Lighting
    const ambient = new THREE.AmbientLight(0xefe4cf, 0.85);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(INK_LOOK.webglSunHex, 1.85);
    sunLight.position.set(-48, 68, -32);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(
      0x8fc2b0,
      0.85
    );
    rimLight.position.set(55, 36, 48);
    scene.add(rimLight);

    // Build Real Displaced 3D China Heightmap Terrain!
    const { heightData, hmW, hmH, albedoCanvas } = buildChinaTerrainTextures(
      Object.values(state.cities)
    );

    const sampleHeightAt = (mapX: number, mapY: number): number => {
      const px = Math.max(0, Math.min(hmW - 1, Math.round((mapX / MAP_WIDTH) * (hmW - 1))));
      const py = Math.max(0, Math.min(hmH - 1, Math.round((mapY / MAP_HEIGHT) * (hmH - 1))));
      const v = heightData[(py * hmW + px) * 4] / 255;
      return v * MAX_ELEV;
    };

    const terrainGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_H, 168, 112);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const u = (vx / WORLD_W + 0.5) * (hmW - 1);
      const v = (vz / WORLD_H + 0.5) * (hmH - 1);
      const px = Math.max(0, Math.min(hmW - 1, Math.round(u)));
      const py = Math.max(0, Math.min(hmH - 1, Math.round(v)));
      const elev = (heightData[(py * hmW + px) * 4] / 255) * MAX_ELEV;
      posAttr.setY(i, elev);
    }
    terrainGeo.computeVertexNormals();

    const albedoTex = new THREE.CanvasTexture(albedoCanvas);
    albedoTex.colorSpace = THREE.SRGBColorSpace;
    albedoTex.anisotropy = 8;

    const terrainMesh = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshStandardMaterial({
        map: albedoTex,
        roughness: 0.74,
        metalness: 0.12,
      })
    );
    scene.add(terrainMesh);

    // Reflective Animated Ocean Surface slightly above seabed (y = 1.15)
    const oceanMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W * 2.2, WORLD_H * 2.2),
      new THREE.MeshStandardMaterial({
        color: INK_LOOK.webglOceanHex,
        roughness: 0.62,
        metalness: 0.18,
        transparent: true,
        opacity: 0.88,
      })
    );
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.y = 1.12;
    scene.add(oceanMesh);

    // Place Sculpted 3D Pagoda Citadels + Selection / Attack Target Rings
    const cityAnchors: Array<{ id: string; pos: THREE.Vector3; ring: THREE.Mesh; hitMesh: THREE.Mesh }> = [];
    const clickableMeshes: THREE.Object3D[] = [];

    for (const city of Object.values(state.cities)) {
      const { wx, wz } = mapToWorld(city.x, city.y);
      const wy = Math.max(2.1, sampleHeightAt(city.x, city.y));
      const pagoda = create3DPagodaCitadel(city);
      pagoda.position.set(wx, wy, wz);
      scene.add(pagoda);

      // Interactive invisible hit cylinder for crisp raycast clicking
      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.6, 4.5, 10),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.position.set(wx, wy + 2, wz);
      hitMesh.userData = { cityId: city.id };
      scene.add(hitMesh);
      clickableMeshes.push(hitMesh);

      // Glowing Ground Ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.1, 2.75, 28),
        new THREE.MeshBasicMaterial({
          color: FACTION_HEX[city.owner],
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.78,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(wx, wy + 0.18, wz);
      scene.add(ring);

      cityAnchors.push({
        id: city.id,
        pos: new THREE.Vector3(wx, wy + (city.isCapital ? 4.8 : 3.5), wz),
        ring,
        hitMesh,
      });
    }

    // Animated 3D March Comet Beacon (active during Stage 1 On-Map March)
    const marchBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xfde047 })
    );
    marchBeacon.visible = false;
    scene.add(marchBeacon);

    // 3D Seasonal Weather Particles (Snow / Blossoms / Autumn Leaves / Summer Fireflies)
    const pCount = 260;
    const pPositions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * WORLD_W * 1.1;
      pPositions[i * 3 + 1] = 4 + Math.random() * 24;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * WORLD_H * 1.1;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const seasonParticleColor =
      state.season === 'winter'
        ? 0xf8fafc
        : state.season === 'spring'
          ? 0xfbcfe8
          : state.season === 'autumn'
            ? 0xfb923c
            : 0xfde047;
    const pMat = new THREE.PointsMaterial({
      color: seasonParticleColor,
      size: state.season === 'winter' ? 0.55 : 0.7,
      transparent: true,
      opacity: 0.78,
    });
    const weatherPoints = new THREE.Points(pGeo, pMat);
    scene.add(weatherPoints);

    // Raycast Pointer Handling (distinguishes click vs orbit drag)
    const raycaster = new THREE.Raycaster();
    const pointerDown = { x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      pointerDown.x = e.clientX;
      pointerDown.y = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const cid = hits[0].object.userData.cityId as string;
        const cur = propsRef.current;
        if (cur.attackMode && cur.strikeableIds.has(cid)) {
          cur.onQuickTargetEnemy(cid);
        } else {
          cur.onSelectCity(cid);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const handleResize = () => {
      const w = container.clientWidth || 920;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation Loop
    let rafId = 0;
    let lastTs = performance.now();
    let elapsed = 0;
    let marchStartTs = 0;
    let lastMarchId = '';
    let frameCount = 0;

    const projVec = new THREE.Vector3();

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      elapsed += dt;
      frameCount += 1;

      controls.update();

      // Gentle ocean wave breathing
      oceanMesh.position.y = 1.12 + Math.sin(elapsed * 1.4) * 0.08;

      // Update selection & Attack Mode pulsing rings
      const cur = propsRef.current;
      for (const anchor of cityAnchors) {
        const isSel = anchor.id === cur.selectedCityId;
        const isTarget = cur.attackMode && cur.strikeableIds.has(anchor.id);
        const mat = anchor.ring.material as THREE.MeshBasicMaterial;
        if (isTarget) {
          mat.color.setHex(0xf43f5e);
          const s = 1.2 + Math.sin(elapsed * 6) * 0.22;
          anchor.ring.scale.set(s, s, 1);
          mat.opacity = 0.95;
        } else if (isSel) {
          mat.color.setHex(0x38bdf8);
          const s = 1.15 + Math.sin(elapsed * 4) * 0.14;
          anchor.ring.scale.set(s, s, 1);
          mat.opacity = 0.95;
        } else {
          mat.color.setHex(FACTION_HEX[cur.state.cities[anchor.id]?.owner ?? 'neutral']);
          anchor.ring.scale.set(1, 1, 1);
          mat.opacity = 0.55;
        }
      }

      // Animate 3D March Comet if active
      const activeM = marchRef.current;
      if (activeM) {
        if (activeM.id !== lastMarchId) {
          lastMarchId = activeM.id;
          marchStartTs = now;
        }
        const fromC = cur.state.cities[activeM.fromCityId];
        const toC = cur.state.cities[activeM.toCityId];
        if (fromC && toC) {
          const t = Math.min(1, (now - marchStartTs) / 860);
          const fw = mapToWorld(fromC.x, fromC.y);
          const tw = mapToWorld(toC.x, toC.y);
          const px = fw.wx + (tw.wx - fw.wx) * t;
          const pz = fw.wz + (tw.wz - fw.wz) * t;
          const py = 5.5 + Math.sin(t * Math.PI) * 5.2;
          marchBeacon.position.set(px, py, pz);
          marchBeacon.visible = true;
        }
      } else {
        marchBeacon.visible = false;
      }

      // Animate 3D Seasonal Weather Particles
      const arr = pGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < pCount; i++) {
        arr[i * 3] += dt * (state.season === 'summer' ? 1.2 : 2.6);
        arr[i * 3 + 1] -= dt * (state.season === 'summer' ? -0.9 : 3.2);
        if (arr[i * 3] > WORLD_W * 0.55) arr[i * 3] = -WORLD_W * 0.55;
        if (arr[i * 3 + 1] < 1.5) arr[i * 3 + 1] = 26;
        if (arr[i * 3 + 1] > 28) arr[i * 3 + 1] = 3;
      }
      pGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);

      // Update projected HTML city badges every 2nd frame for buttery 60fps smoothness
      if (frameCount % 2 === 1 || frameCount <= 3) {
        const w = renderer.domElement.clientWidth || width;
        const h = renderer.domElement.clientHeight || height;
        const nextLabels = cityAnchors.map((a) => {
          projVec.copy(a.pos).project(camera);
          const sx = (projVec.x * 0.5 + 0.5) * w;
          const sy = (-projVec.y * 0.5 + 0.5) * h;
          const visible = projVec.z < 1 && sx > -40 && sx < w + 40 && sy > -30 && sy < h + 30;
          return { id: a.id, sx, sy, visible };
        });
        setProjectedLabels(nextLabels);
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      terrainGeo.dispose();
      albedoTex.dispose();
      pGeo.dispose();
      pMat.dispose();
      renderer.dispose();
    };
    // Rebuild WebGL terrain cleanly when ownership counts or season change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.season,
    cities.map((c) => `${c.id}:${c.owner}`).join('|'),
  ]);

  if (webglError) {
    return null;
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Crisp Projected HTML City Badges & Hero Portrait Medallions over 3D Pagodas */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {projectedLabels.map((lbl) => {
          if (!lbl.visible) return null;
          const city = state.cities[lbl.id];
          if (!city) return null;
          const isSelected = city.id === selectedCityId;
          const isStrikeTarget = attackMode && strikeableIds.has(city.id);
          const generals = getCityGenerals(state, city.id);
          const wandering = getCityWanderingHeroes(state, city.id);
          const col = FACTION_CSS[city.owner];

          return (
            <div
              key={city.id}
              style={{
                transform: `translate(${lbl.sx.toFixed(1)}px, ${lbl.sy.toFixed(1)}px) translate(-50%, -100%)`,
              }}
              className="absolute top-0 left-0 flex flex-col items-center pointer-events-auto"
            >
              {/* Stationed Hero Circular Portrait Medallions */}
              {(generals.length > 0 || wandering.length > 0) && (
                <div className="flex items-center -space-x-1.5 mb-0.5">
                  {generals.slice(0, 2).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectHero?.(g.id);
                      }}
                      title={tLoc(g.name, lang)}
                      className="w-6 h-6 rounded-full overflow-hidden border border-cyan-300 shadow-md cursor-pointer hover:scale-110 transition"
                    >
                      <Art thumb
                        src={g.portrait}
                        alt={tLoc(g.name, lang)}
                        className="w-full h-full object-cover object-top"
                      />
                    </button>
                  ))}
                  {wandering.length > 0 && (
                    <button
                      key={wandering[0].id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectHero?.(wandering[0].id);
                      }}
                      className="w-6 h-6 rounded-full overflow-hidden border-2 border-amber-300 shadow-[0_0_10px_#facc15] cursor-pointer"
                    >
                      <Art thumb
                        src={wandering[0].portrait}
                        alt={tLoc(wandering[0].name, lang)}
                        className="w-full h-full object-cover object-top"
                      />
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isStrikeTarget) onQuickTargetEnemy(city.id);
                  else onSelectCity(city.id);
                }}
                className={`px-2 py-0.5 rounded-md border backdrop-blur-md text-[10px] font-bold flex items-center gap-1.5 shadow-lg transition cursor-pointer ${
                  isStrikeTarget
                    ? 'bg-rose-950/90 border-rose-400 text-rose-100 ring-2 ring-rose-500/60 animate-pulse'
                    : isSelected
                      ? 'bg-slate-950/95 border-cyan-400 text-white ring-1 ring-cyan-400/60'
                      : 'bg-slate-950/85 border-slate-600/80 text-slate-100 hover:border-cyan-400'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: col }}
                />
                <span>{tLoc(city.name, lang)}</span>
                <span className="font-mono text-[9px] text-cyan-200">
                  {(city.troops / 1000).toFixed(1)}k
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* WebGL Orbit Controls Hint Pill */}
      <div className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 text-[10px] text-cyan-100/90 bg-slate-950/80 px-3.5 py-1 rounded-full border border-cyan-400/35 backdrop-blur-md">
        {lang === 'zh'
          ? 'WebGL 实时 3D 山河 · 拖拽旋转视角 · 滚轮缩放 · 点击城池/头像指挥'
          : 'Real-Time WebGL 3D World · Drag to orbit/tilt · Scroll to zoom · Click citadels or portraits'}
      </div>
    </div>
  );
}
