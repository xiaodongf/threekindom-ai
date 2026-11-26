import { isMythLook } from '../utils/artLook.js';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PROVINCES, PROVINCE_ORDER } from '../game/data.js';
import {
  getCityGenerals,
  getCityWanderingHeroes,
  getStrikeableEnemyCityIds,
} from '../game/engine.js';
import { MAP_HEIGHT, MAP_WIDTH } from '../game/mapGeo.js';
import type {
  City,
  FactionId,
  GameState,
  General,
  Language,
  ProvinceId,
} from '../game/types.js';
import { tLoc } from '../i18n/translations.js';
import { prefersReducedMotion } from '../utils/motion.js';
import { DisposeBag } from './duel/duelGeometry3D.js';
import { buildMapArmy, buildMarchArrow, type MapArmy, type MarchArrow } from './map/mapArmy.js';
import {
  cityLabelHeight,
  citySignature,
  cityTier,
  createCityKit,
} from './map/mapCities.js';
import { FACTION_PIGMENT, PAPER_RELIEF, buildMapTerrain } from './map/mapTerrain.js';
import { WORLD_H, WORLD_W, buildMapWorld, mapToWorld } from './map/mapWorld.js';
import type { ActiveMapMarch } from './StrategyMap.js';
import { Art } from './ui/Art.js';

/** auto: terrain up close, paper map when the camera pulls far back. */
export type MapViewMode = 'auto' | 'terrain' | 'paper';

interface WebGLStrategyMapProps {
  state: GameState;
  lang: Language;
  selectedCityId: string | null;
  attackMode: boolean;
  activeMapMarch?: ActiveMapMarch | null;
  viewMode?: MapViewMode;
  showRealms?: boolean;
  /** Stop drawing while something else (a battle, a duel) covers the map. */
  paused?: boolean;
  /** A march being planned: drawn as a gold route before it is ordered. */
  previewRoute?: {
    fromCityId: string;
    toCityId: string;
    pincerFromCityId?: string;
    /** Width in pixels of whatever covers the right of the map while the route is planned. */
    coverRightPx?: number;
  } | null;
  onSelectCity: (cityId: string) => void;
  onQuickTargetEnemy: (targetCityId: string) => void;
  onInspectHero?: (heroId: string) => void;
  /** Goes down into a city's close-up: a double click, or pushing in past the nearest view. */
  onEnterCity?: (cityId: string) => void;
  /** The city whose close-up is open: the camera drops onto it while the close-up fades in. */
  diveCityId?: string | null;
  onWebGLFallback?: () => void;
}

const FACTION_CSS: Record<FactionId, string> = {
  wei: '#4c78a8',
  shu: '#438554',
  wu: '#c2432f',
  neutral: '#9a8f78',
};

const FACTION_BADGE: Record<FactionId, string> = { wei: '魏', shu: '蜀', wu: '吴', neutral: '群' };

const MARCH_SECONDS = 1.4;
/**
 * Cities are game pieces, not scale models. Up close every city is drawn, sized so neighbours
 * 120 km apart do not touch; pulled back to the province map only each province's chief city is
 * drawn, larger, and the rest become ink dots.
 */
const CITY_SCALE_NEAR = 0.94;
const CITY_SCALE_FAR = 1.32;

/** The city that stands for its province on the province map; capitals always do. */
function isChiefCity(city: City): boolean {
  return Boolean(city.isCapital) || PROVINCES[city.province]?.seatCityId === city.id;
}

interface CityMarker {
  id: string;
  root: THREE.Group;
  model: THREE.Group;
  shadow: THREE.Mesh;
  ring: THREE.Mesh;
  baseY: number;
  labelLift: number;
  signature: string;
  radius: number;
  chief: boolean;
  /** Current model scale, 0 when the city is only a dot. */
  scale: number;
}

/** What the camera should glide to: a point on the table and a distance from it. */
interface FlyGoal {
  x: number;
  z: number;
  dist: number;
}

interface MapApi {
  flyToRealm(): void;
  flyToProvince(id: ProvinceId): void;
  hoverProvince(id: ProvinceId | null): void;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function WebGLStrategyMap({
  state,
  lang,
  selectedCityId,
  attackMode,
  activeMapMarch,
  viewMode = 'auto',
  showRealms = true,
  paused = false,
  previewRoute = null,
  onSelectCity,
  onQuickTargetEnemy,
  onInspectHero,
  onEnterCity,
  diveCityId = null,
  onWebGLFallback,
}: WebGLStrategyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const provinceEls = useRef(new Map<ProvinceId, HTMLDivElement>());
  const provinceLayerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<MapApi | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paperShown, setPaperShown] = useState(() => viewMode !== 'terrain');
  // Two levels of map: provinces from afar, cities up close
  const [provinceLevel, setProvinceLevel] = useState(true);
  const [nearProvince, setNearProvince] = useState<ProvinceId | null>(null);

  const cities = Object.values(state.cities);
  const strikeableIds = new Set(getStrikeableEnemyCityIds(state, state.playerFaction));

  // The scene is built once; the frame loop reads whatever the latest props are.
  const live = useRef({
    state,
    selectedCityId,
    attackMode,
    strikeableIds,
    activeMapMarch,
    viewMode,
    showRealms,
    paused,
    previewRoute,
    onSelectCity,
    onQuickTargetEnemy,
    onEnterCity,
    diveCityId,
  });
  live.current = {
    state,
    selectedCityId,
    attackMode,
    strikeableIds,
    activeMapMarch,
    viewMode,
    showRealms,
    paused,
    previewRoute,
    onSelectCity,
    onQuickTargetEnemy,
    onEnterCity,
    diveCityId,
  };
  // A second click on the same city, on its model or its plaque, goes down into it
  const lastCityClick = useRef({ id: '', at: 0 });
  const clickCity = (cityId: string): boolean => {
    const now = performance.now();
    const twice = lastCityClick.current.id === cityId && now - lastCityClick.current.at < 480;
    lastCityClick.current = twice ? { id: '', at: 0 } : { id: cityId, at: now };
    if (twice && live.current.onEnterCity && !live.current.attackMode) {
      live.current.onEnterCity(cityId);
      return true;
    }
    return false;
  };
  const clickCityRef = useRef(clickCity);
  clickCityRef.current = clickCity;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      onWebGLFallback?.();
      return;
    }

    let disposed = false;
    let rafId = 0;
    const bag = new DisposeBag();
    let army: MapArmy | null = null;

    let pixelRatio = Math.min(1.5, window.devicePixelRatio || 1);
    const width = container.clientWidth || 920;
    const height = container.clientHeight || 600;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.style.opacity = '0';
    renderer.domElement.style.transition = 'opacity 420ms ease';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const myth = isMythLook();
    scene.background = new THREE.Color(myth ? 0x090a0b : 0x15110d);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.5, 600);
    // Start with the whole sheet in view; the paper map takes over a little beyond that.
    const fitDistance = Math.max(84, Math.min(132, 53 / (Math.tan((18 * Math.PI) / 180) * (width / height))));
    // With the whole sheet in view the map shows provinces; closer than this it shows cities.
    const cityLevelBelow = fitDistance * 0.7;
    const provinceLevelAbove = fitDistance * 0.88;
    // The whole realm: the sheet with a little air round it, seen from the south
    const realmView: FlyGoal = { x: 0, z: 3.5, dist: fitDistance * 1.04 };
    camera.position.set(0, realmView.dist * 0.82, realmView.z + realmView.dist * 0.572);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;
    controls.minPolarAngle = 0.14;
    controls.maxPolarAngle = 0.98;
    controls.minDistance = 26;
    controls.maxDistance = fitDistance * 1.25;
    controls.zoomSpeed = 0.9;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.target.set(realmView.x, 0, realmView.z);
    controls.update();

    scene.add(
      myth
        ? new THREE.HemisphereLight(0x9fb2bd, 0x1c1814, 0.7)
        : new THREE.HemisphereLight(0xfff2d6, 0x4a4436, 1.25)
    );
    const sun = new THREE.DirectionalLight(myth ? 0xffc27a : 0xffe4b4, myth ? 1.7 : 1.9);
    sun.position.set(-58, 60, -55);
    scene.add(sun);

    // The table and the lacquer tray the map lies in
    const table = new THREE.Mesh(
      bag.add(new THREE.PlaneGeometry(900, 900)),
      bag.add(new THREE.MeshBasicMaterial({ color: myth ? 0x090a0b : 0x15110d }))
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -1.1;
    scene.add(table);
    const tray = new THREE.Mesh(
      bag.add(new THREE.BoxGeometry(WORLD_W + 2.4, 1.1, WORLD_H + 2.4)),
      bag.add(new THREE.MeshStandardMaterial({ color: myth ? 0x1a1412 : 0x3b1a12, roughness: 0.42 }))
    );
    tray.position.y = -0.57;
    scene.add(tray);
    const rim = new THREE.Mesh(
      bag.add(new THREE.BoxGeometry(WORLD_W + 0.7, 0.06, WORLD_H + 0.7)),
      bag.add(
        new THREE.MeshStandardMaterial({ color: myth ? 0x8a6a34 : 0xb98d38, roughness: 0.4, metalness: 0.8 })
      )
    );
    rim.position.y = -0.035;
    scene.add(rim);

    const raycaster = new THREE.Raycaster();
    const pointerDown = { x: 0, y: 0 };
    const hitMeshes: THREE.Object3D[] = [];
    const markers = new Map<string, CityMarker>();
    const projVec = new THREE.Vector3();
    const ndcVec = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundPoint = new THREE.Vector3();
    const provinceIndex = (id: ProvinceId) => PROVINCE_ORDER.indexOf(id);

    // 0 = cities, 1 = provinces; follows the camera's distance in every view
    let level = 1;
    let fly: FlyGoal | null = null;
    let hoverProvince: ProvinceId | null = null;
    let groundCityAt: ((mapX: number, mapY: number) => City | null) | null = null;

    /** The view that holds a set of cities, with room around them for their plaques. */
    const frameFor = (points: Array<{ x: number; y: number }>): FlyGoal => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of points) {
        const { wx, wz } = mapToWorld(p.x, p.y);
        minX = Math.min(minX, wx);
        maxX = Math.max(maxX, wx);
        minZ = Math.min(minZ, wz);
        maxZ = Math.max(maxZ, wz);
      }
      const vTan = Math.tan((camera.fov * Math.PI) / 360);
      const hTan = vTan * camera.aspect;
      // Plaques stand above their cities and the map tools cover the top, so leave more room north
      const dist = Math.max((maxX - minX + 18) / (2 * hTan), ((maxZ - minZ + 17) / (2 * vTan)) * 0.9);
      return {
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2 - 1.5,
        dist: Math.max(40, Math.min(cityLevelBelow * 0.94, dist)),
      };
    };
    const provinceCities = (id: ProvinceId) =>
      Object.values(live.current.state.cities).filter((c) => c.province === id);
    const api: MapApi = {
      flyToRealm: () => {
        fly = { ...realmView };
      },
      flyToProvince: (id) => {
        const list = provinceCities(id);
        if (list.length > 0) fly = frameFor(list);
      },
      hoverProvince: (id) => {
        hoverProvince = id;
      },
    };
    apiRef.current = api;

    const aim = (e: { clientX: number; clientY: number }) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndcVec.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndcVec, camera);
    };
    const pick = (e: { clientX: number; clientY: number }): string | null => {
      aim(e);
      for (const hit of raycaster.intersectObjects(hitMeshes, false)) {
        const id = hit.object.userData.cityId as string;
        // On the province map only the chief cities stand on the table to be clicked
        if (level < 0.5 || markers.get(id)?.chief) return id;
      }
      return null;
    };
    /** The province whose ground lies under the pointer, if it is land a city holds. */
    const provinceUnder = (e: PointerEvent): ProvinceId | null => {
      aim(e);
      if (!groundCityAt || !raycaster.ray.intersectPlane(groundPlane, groundPoint)) return null;
      const mapX = (groundPoint.x / WORLD_W + 0.5) * MAP_WIDTH;
      const mapY = (groundPoint.z / WORLD_H + 0.5) * MAP_HEIGHT;
      return groundCityAt(mapX, mapY)?.province ?? null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDown.x = e.clientX;
      pointerDown.y = e.clientY;
      fly = null;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 6) return;
      const cid = pick(e);
      const cur = live.current;
      if (cid) {
        if (cur.attackMode && cur.strikeableIds.has(cid)) cur.onQuickTargetEnemy(cid);
        else if (!clickCityRef.current(cid)) cur.onSelectCity(cid);
        return;
      }
      // A click on a province's ground opens that province
      if (level > 0.5) {
        const province = provinceUnder(e);
        if (province) api.flyToProvince(province);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return;
      const overCity = pick(e);
      hoverProvince = !overCity && level > 0.5 ? provinceUnder(e) : null;
      renderer.domElement.style.cursor = overCity || hoverProvince ? 'pointer' : 'grab';
    };
    const onPointerLeave = () => {
      hoverProvince = null;
    };
    // Pushing in past the nearest view, three notches in a row, goes down into the city below
    let pushes = 0;
    let lastPush = 0;
    const onWheel = (e: WheelEvent) => {
      fly = null;
      const cur = live.current;
      if (e.deltaY >= 0 || !cur.onEnterCity || cur.attackMode) {
        pushes = 0;
        return;
      }
      if (camera.position.distanceTo(controls.target) > controls.minDistance * 1.03) return;
      const now = performance.now();
      pushes = now - lastPush < 1100 ? pushes + 1 : 1;
      lastPush = now;
      if (pushes < 3) return;
      pushes = 0;
      // The city under the pointer, since that is what the zoom has been closing on
      aim(e);
      const under = raycaster.ray.intersectPlane(groundPlane, groundPoint) ?? controls.target;
      let best: City | null = null;
      let bestDist = 8;
      for (const c of Object.values(cur.state.cities)) {
        const { wx, wz } = mapToWorld(c.x, c.y);
        const d = Math.hypot(wx - under.x, wz - under.z);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (best) cur.onEnterCity(best.id);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Home' && !live.current.paused) {
        e.preventDefault();
        api.flyToRealm();
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    const onContextMenu = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    // Keep the same width of map in view when the side sheet opens: the picture gains height
    // instead of losing its east and west.
    const horizontalTan = Math.tan((18 * Math.PI) / 180) * Math.max(1.2, width / height);
    const handleResize = () => {
      const w = container.clientWidth || 920;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      const fov = (2 * Math.atan(horizontalTan / camera.aspect) * 180) / Math.PI;
      camera.fov = Math.max(30, Math.min(58, fov));
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const initialCities = Object.values(live.current.state.cities);

    (async () => {
      const world = await buildMapWorld(initialCities, bag);
      if (disposed) return;

      const terrain = buildMapTerrain(
        world,
        initialCities.map((c) => ({ x: c.x, y: c.y, provinceIndex: provinceIndex(c.province) })),
        bag
      );
      scene.add(terrain.mesh);
      const kit = createCityKit(bag);

      // Ground belongs to a city only as far as its realm's wash reaches on the province map
      groundCityAt = (mapX, mapY) => {
        if (mapX < 0 || mapX > MAP_WIDTH || mapY < 0 || mapY > MAP_HEIGHT) return null;
        if (!world.isLand(mapX, mapY)) return null;
        const city = initialCities[world.cityIndexAt(mapX, mapY)];
        return city && Math.hypot(city.x - mapX, city.y - mapY) < 230 ? city : null;
      };

      const placeCity = (city: City) => {
        const { wx, wz } = mapToWorld(city.x, city.y);
        const baseY = world.heightAt(city.x, city.y);
        const radius = (1.3 + cityTier(city) * 0.34) * CITY_SCALE_NEAR * 0.9;
        const root = new THREE.Group();
        root.position.set(wx, baseY, wz);
        const model = kit.build(city);
        model.scale.setScalar(CITY_SCALE_NEAR);
        const shadow = kit.blob(radius * 1.25);
        shadow.position.y = 0.05;
        const ring = kit.ring();
        ring.position.y = 0.2;
        const hit = kit.hit(radius * 1.1);
        hit.position.y = 1.3;
        hit.userData = { cityId: city.id };
        root.add(shadow, model, ring, hit);
        scene.add(root);
        hitMeshes.push(hit);
        markers.set(city.id, {
          id: city.id,
          root,
          model,
          shadow,
          ring,
          baseY,
          labelLift: cityLabelHeight(city),
          signature: citySignature(city),
          radius,
          chief: isChiefCity(city),
          scale: CITY_SCALE_NEAR,
        });
      };
      for (const city of initialCities) placeCity(city);

      // Season drifting over the table: blossom, motes, leaves or snow
      const P = 150;
      const pPos = new Float32Array(P * 3);
      for (let i = 0; i < P; i++) {
        pPos[i * 3] = (Math.random() - 0.5) * WORLD_W * 0.92;
        pPos[i * 3 + 1] = 2 + Math.random() * 9;
        pPos[i * 3 + 2] = (Math.random() - 0.5) * WORLD_H * 0.9;
      }
      const pGeo = bag.add(new THREE.BufferGeometry());
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      const pMat = bag.add(
        new THREE.PointsMaterial({ size: 0.26, transparent: true, opacity: 0.55, depthWrite: false })
      );
      const drift = new THREE.Points(pGeo, pMat);
      drift.frustumCulled = false;
      scene.add(drift);
      const SEASON_TINT = { spring: 0xf3c9d2, summer: 0xf2dc8c, autumn: 0xd1864a, winter: 0xf5eddc };

      const arrowGroup = new THREE.Group();
      scene.add(arrowGroup);
      const routeGroup = new THREE.Group();
      scene.add(routeGroup);
      let routeArrows: MarchArrow[] = [];
      let routeKey = '';
      let routeBag = new DisposeBag();
      // How far the view has been slid aside so a planned route is not hidden under the orders sheet
      const routePan = new THREE.Vector3();
      const routePanWant = new THREE.Vector3();
      const routePanStep = new THREE.Vector3();
      let arrows: MarchArrow[] = [];
      let arrowKey = '';
      let arrowBag = new DisposeBag();

      terrain.setOwners(
        world.cityIds.map((id) => live.current.state.cities[id]?.owner ?? 'neutral'),
        0,
        false
      );

      try {
        await renderer.compileAsync(scene, camera);
      } catch {
        // compileAsync is an optimisation; the first render will compile if it is unavailable
      }
      if (disposed) return;

      // Visual QA hook (only with ?mapDebug): stage a march, hold it mid-ride, or flip an owner.
      const debug: {
        march: ActiveMapMarch | null;
        marchT: number | null;
        owners: Record<string, FactionId>;
      } = { march: null, marchT: null, owners: {} };
      if (window.location.search.includes('mapDebug')) {
        (window as unknown as { __map?: unknown }).__map = {
          camera,
          controls,
          terrain,
          renderer,
          debug,
          api,
          fitDistance,
          getLevel: () => level,
        };
      }
      const ownerOf = (id: string): FactionId =>
        debug.owners[id] ?? live.current.state.cities[id]?.owner ?? 'neutral';

      let lastTs = performance.now();
      let elapsed = 0;
      let paper = live.current.viewMode === 'terrain' ? 0 : 1;
      let lastPaperShown = paper > 0.5;
      let lastProvinceLevel = level > 0.5;
      let lastNearProvince: ProvinceId | null = null;
      let lastSelected = live.current.selectedCityId;
      let lastDive: string | null = null;
      const camOffset = new THREE.Vector3();
      /** True when a city sits well inside the picture. */
      const inView = (city: City): boolean => {
        const { wx, wz } = mapToWorld(city.x, city.y);
        projVec.set(wx, 0, wz).project(camera);
        return projVec.z < 1 && Math.abs(projVec.x) < 0.82 && Math.abs(projVec.y) < 0.78;
      };
      let marchId = '';
      let marchStart = 0;
      let frames = 0;
      let frameMsAcc = 0;
      let firstFrame = true;
      const stillMotion = prefersReducedMotion();

      const animate = (now: number) => {
        rafId = requestAnimationFrame(animate);
        const rawDt = (now - lastTs) / 1000;
        lastTs = now;
        const cur = live.current;
        if (cur.paused || document.hidden) return;
        const dt = Math.min(0.05, rawDt);
        elapsed += dt;

        // Settle on a cheaper resolution if this machine cannot hold the frame rate
        frames += 1;
        if (frames > 40 && frames <= 160) frameMsAcc += rawDt * 1000;
        if (frames === 160 && frameMsAcc / 120 > 24 && pixelRatio > 1) {
          pixelRatio = 1;
          renderer.setPixelRatio(pixelRatio);
          handleResize();
        }

        controls.update();
        const lim = 0.5;
        const reach = live.current.previewRoute ? WORLD_W * 0.6 : 0;
        controls.target.x = Math.max(-WORLD_W * lim, Math.min(WORLD_W * lim + reach, controls.target.x));
        controls.target.z = Math.max(-WORLD_H * lim, Math.min(WORLD_H * lim, controls.target.z));
        controls.target.y = 0;

        // A newly chosen city is brought into view: from the province map the camera goes down
        // into its province; up close it only moves if the city is outside the picture.
        if (cur.selectedCityId !== lastSelected) {
          lastSelected = cur.selectedCityId;
          const chosen = lastSelected ? cur.state.cities[lastSelected] : undefined;
          if (chosen && !cur.previewRoute) {
            if (level > 0.5) {
              api.flyToProvince(chosen.province);
            } else if (!inView(chosen)) {
              const { wx, wz } = mapToWorld(chosen.x, chosen.y);
              fly = { x: wx, z: wz, dist: camera.position.distanceTo(controls.target) };
            }
          }
        }

        // Going down into a city: drop onto it while its close-up fades in over the map
        if (cur.diveCityId !== lastDive) {
          lastDive = cur.diveCityId;
          const into = lastDive ? cur.state.cities[lastDive] : undefined;
          if (into) {
            const { wx, wz } = mapToWorld(into.x, into.y);
            fly = { x: wx, z: wz, dist: controls.minDistance };
          }
        }

        // Glide toward whatever the camera was asked to frame
        if (fly) {
          const k = stillMotion ? 1 : 1 - Math.exp(-dt * 4.4);
          const stepX = (fly.x - (controls.target.x - routePan.x)) * k;
          const stepZ = (fly.z - (controls.target.z - routePan.z)) * k;
          controls.target.x += stepX;
          controls.target.z += stepZ;
          camera.position.x += stepX;
          camera.position.z += stepZ;
          camOffset.copy(camera.position).sub(controls.target);
          const len = camOffset.length() || 1;
          const nextLen = len + (fly.dist - len) * k;
          camera.position.copy(controls.target).addScaledVector(camOffset, nextLen / len);
          if (
            Math.abs(fly.dist - nextLen) < 0.12 &&
            Math.hypot(fly.x - (controls.target.x - routePan.x), fly.z - (controls.target.z - routePan.z)) < 0.08
          ) {
            fly = null;
          }
        }

        // Provinces from afar, cities up close, in every view; only the paper sheet depends on the view
        const dist = camera.position.distanceTo(controls.target);
        const wantLevel = smooth(cityLevelBelow, provinceLevelAbove, dist);
        level += (wantLevel - level) * (stillMotion ? 1 : 1 - Math.exp(-dt * 8));
        const wantPaper = cur.viewMode === 'paper' ? 1 : cur.viewMode === 'terrain' ? 0 : wantLevel;
        paper += (wantPaper - paper) * (stillMotion ? 1 : 1 - Math.exp(-dt * 7));
        const relief = 1 + (PAPER_RELIEF - 1) * paper;
        const u = terrain.material.uniforms;
        u.uTime.value = elapsed;
        u.uPaper.value = paper;
        u.uLevel.value = level;
        u.uFocusProvince.value = hoverProvince ? provinceIndex(hoverProvince) : -1;
        u.uRealms.value = cur.showRealms ? 1 : 0;
        u.uSelected.value = cur.selectedCityId ? world.cityIds.indexOf(cur.selectedCityId) : -1;
        if (paper > 0.5 !== lastPaperShown) {
          lastPaperShown = paper > 0.5;
          setPaperShown(lastPaperShown);
        }
        if (level > 0.5 !== lastProvinceLevel) {
          lastProvinceLevel = level > 0.5;
          setProvinceLevel(lastProvinceLevel);
          if (!lastProvinceLevel) hoverProvince = null;
        }
        // Which province the view is over, for the heading shown at city level
        if (frames % 12 === 0) {
          const centre = groundCityAt?.(
            ((controls.target.x - routePan.x) / WORLD_W + 0.5) * MAP_WIDTH,
            ((controls.target.z - routePan.z) / WORLD_H + 0.5) * MAP_HEIGHT
          );
          const over = centre?.province ?? null;
          if (over !== lastNearProvince) {
            lastNearProvince = over;
            setNearProvince(over);
          }
        }

        // Ownership and growth
        terrain.setOwners(world.cityIds.map(ownerOf), elapsed, !stillMotion);
        const paperModelFade = 1 - smooth(0.55, 0.88, paper);
        const chiefScale = (CITY_SCALE_NEAR + (CITY_SCALE_FAR - CITY_SCALE_NEAR) * level) * paperModelFade;
        const minorScale = CITY_SCALE_NEAR * (1 - level) * paperModelFade;
        for (const marker of markers.values()) {
          const city = cur.state.cities[marker.id];
          if (!city) continue;
          const sig = citySignature(city);
          if (sig !== marker.signature) {
            marker.root.remove(marker.model);
            marker.model = kit.build(city);
            marker.root.add(marker.model);
            marker.signature = sig;
            marker.labelLift = cityLabelHeight(city);
          }
          marker.root.position.y = marker.baseY * relief;
          // Chief cities grow as the view pulls back; the others sink into ink dots
          marker.scale = marker.chief ? chiefScale : minorScale;
          const drawn = marker.scale > 0.08;
          marker.model.visible = drawn;
          marker.shadow.visible = drawn;
          if (drawn) {
            marker.model.scale.setScalar(marker.scale);
            const blob = marker.radius * 2.5 * (marker.scale / CITY_SCALE_NEAR);
            marker.shadow.scale.set(blob, 1, blob);
          }

          const route = cur.previewRoute;
          const isTarget =
            (cur.attackMode && cur.strikeableIds.has(marker.id)) || route?.toCityId === marker.id;
          const isSelected =
            marker.id === cur.selectedCityId ||
            route?.fromCityId === marker.id ||
            route?.pincerFromCityId === marker.id;
          const mat = marker.ring.material as THREE.MeshBasicMaterial;
          if (isTarget || isSelected) {
            const pulse = 1 + Math.sin(elapsed * (isTarget ? 6 : 3.4)) * (isTarget ? 0.1 : 0.05);
            const ringSize = Math.max(0.55, marker.scale / CITY_SCALE_NEAR);
            marker.ring.scale.setScalar(marker.radius * 1.25 * pulse * ringSize);
            mat.color.setHex(isTarget ? 0xd4614c : 0xdcbb6e);
            mat.opacity = 0.92;
          } else {
            mat.opacity = 0;
          }
        }

        // The army on the march
        const march = cur.activeMapMarch ?? debug.march;
        if (march && march.id !== marchId) {
          marchId = march.id;
          marchStart = elapsed;
          army?.dispose();
          if (army) scene.remove(army.group);
          army = null;
          const fromC = cur.state.cities[march.fromCityId];
          const toC = cur.state.cities[march.toCityId];
          const generals = Object.values(cur.state.generals) as General[];
          const hero =
            generals.find((g) => march.heroPortrait && g.portrait === march.heroPortrait) ??
            generals.find((g) => g.faction === march.faction && g.status === 'active');
          // Bring the march into the picture if it starts out of sight or on the province map
          if (fromC && toC && (level > 0.5 || !inView(fromC) || !inView(toC))) {
            fly = frameFor([fromC, toC]);
          }
          if (fromC && toC && hero) {
            army = buildMapArmy(
              hero,
              FACTION_PIGMENT[march.faction],
              cur.state.factions[march.faction].bannerChar,
              fromC,
              toC,
              world
            );
            scene.add(army.group);
          }
        } else if (!march && marchId) {
          marchId = '';
          army?.dispose();
          if (army) scene.remove(army.group);
          army = null;
        }
        if (army) {
          army.update(
            debug.marchT ?? (elapsed - marchStart) / MARCH_SECONDS,
            dt,
            elapsed,
            paper,
            camera
          );
        }

        // Marches already made this season stay as brushed arrows
        const recent = cur.state.recentMarches ?? [];
        const key = recent.map((m) => m.id).join('|');
        if (key !== arrowKey) {
          arrowKey = key;
          arrowGroup.clear();
          arrowBag.dispose();
          arrowBag = new DisposeBag();
          arrows = [];
          for (const m of recent) {
            const fromC = cur.state.cities[m.fromCityId];
            const toC = cur.state.cities[m.toCityId];
            if (!fromC || !toC) continue;
            const tone = new THREE.Color(FACTION_PIGMENT[m.faction]).multiplyScalar(0.72).getHex();
            const arrow = buildMarchArrow(fromC, toC, tone, world, arrowBag);
            arrows.push(arrow);
            arrowGroup.add(arrow.mesh);
          }
        }
        for (const arrow of arrows) arrow.setPaper(paper);

        // The march being planned in the orders sheet, as a gold route that breathes
        const planned = cur.previewRoute;
        const plannedKey = planned
          ? `${planned.fromCityId}|${planned.toCityId}|${planned.pincerFromCityId ?? ''}`
          : '';
        if (plannedKey !== routeKey) {
          routeKey = plannedKey;
          routeGroup.clear();
          routeBag.dispose();
          routeBag = new DisposeBag();
          routeArrows = [];
          if (planned) {
            const toC = cur.state.cities[planned.toCityId];
            const involved: City[] = toC ? [toC] : [];
            for (const fromId of [planned.fromCityId, planned.pincerFromCityId]) {
              const fromC = fromId ? cur.state.cities[fromId] : undefined;
              if (!fromC || !toC) continue;
              involved.push(fromC);
              const arrow = buildMarchArrow(fromC, toC, 0xe8d199, world, routeBag);
              arrow.mesh.renderOrder = 4;
              routeArrows.push(arrow);
              routeGroup.add(arrow.mesh);
            }
            // An order planned from the province map is shown at the level of its cities
            if (involved.length > 1 && (level > 0.5 || involved.some((c) => !inView(c)))) {
              fly = frameFor(involved);
            }
          }
        }
        // Slide the view so the route sits in the part of the map the sheet leaves open, and
        // slide it back when the sheet closes
        routePanWant.set(0, 0, 0);
        if (planned) {
          const fromC = cur.state.cities[planned.fromCityId];
          const toC = cur.state.cities[planned.toCityId];
          const w = renderer.domElement.clientWidth || width;
          const covered = Math.min(0.62, (planned.coverRightPx ?? 0) / w);
          if (fromC && toC && covered > 0.05) {
            const a = mapToWorld(fromC.x, fromC.y);
            const b = mapToWorld(toC.x, toC.y);
            const seen = 2 * dist * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
            const baseX = controls.target.x - routePan.x;
            const baseZ = controls.target.z - routePan.z;
            routePanWant.set(
              (a.wx + b.wx) / 2 + (covered / 2) * seen - baseX,
              0,
              ((a.wz + b.wz) / 2 - baseZ) * 0.5
            );
          }
        }
        routePanStep.copy(routePanWant).sub(routePan).multiplyScalar(stillMotion ? 1 : 1 - Math.exp(-dt * 4.5));
        if (routePanStep.lengthSq() > 1e-8) {
          controls.target.add(routePanStep);
          camera.position.add(routePanStep);
          routePan.add(routePanStep);
        }

        for (const arrow of routeArrows) {
          arrow.setPaper(paper);
          (arrow.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(elapsed * 3.2) * 0.22;
        }

        if (!stillMotion) {
          const season = cur.state.season;
          pMat.color.setHex(SEASON_TINT[season]);
          const fall = season === 'summer' ? -0.5 : 2.2;
          for (let i = 0; i < P; i++) {
            pPos[i * 3] += dt * 1.6;
            pPos[i * 3 + 1] -= dt * fall;
            if (pPos[i * 3] > WORLD_W * 0.46) pPos[i * 3] = -WORLD_W * 0.46;
            if (pPos[i * 3 + 1] < 0.6) pPos[i * 3 + 1] = 11;
            if (pPos[i * 3 + 1] > 12) pPos[i * 3 + 1] = 1;
          }
          pGeo.attributes.position.needsUpdate = true;
          pMat.opacity = 0.55 * (1 - paper);
        } else {
          drift.visible = false;
        }

        renderer.render(scene, camera);

        // City plaques follow their cities; positions are written straight to the DOM
        const w = renderer.domElement.clientWidth || width;
        const h = renderer.domElement.clientHeight || height;
        for (const marker of markers.values()) {
          const el = labelEls.current.get(marker.id);
          if (!el) continue;
          // A city reduced to a dot or cartographic paper seal is marked on the ground; a standing 3D city carries its plaque
          const asDot = level > 0.5 && !marker.chief;
          const unnamedSeat =
            level > 0.5 && marker.chief && !cur.state.cities[marker.id]?.isCapital &&
            marker.id !== cur.selectedCityId && !(cur.attackMode && cur.strikeableIds.has(marker.id));
          // cityLabelHeight is measured on a model drawn at 1.35
          const lift = asDot || marker.scale <= 0.08 ? 0.22 : marker.labelLift * (marker.scale / 1.35);
          projVec
            .set(marker.root.position.x, marker.root.position.y + lift, marker.root.position.z)
            .project(camera);
          const sx = (projVec.x * 0.5 + 0.5) * w;
          const sy = (-projVec.y * 0.5 + 0.5) * h;
          const visible = projVec.z < 1 && sx > -60 && sx < w + 60 && sy > -20 && sy < h + 60;
          el.style.display = visible ? '' : 'none';
          if (visible) {
            const centerAnchor = asDot || (paper > 0.5 && unnamedSeat);
            el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, ${centerAnchor ? '-50%' : '-100%'})`;
          }
        }

        // Province names lie on the map itself and fade as the view comes down to the cities
        const layer = provinceLayerRef.current;
        if (layer) {
          layer.style.opacity = level.toFixed(3);
          layer.style.visibility = level < 0.02 ? 'hidden' : 'visible';
        }
        if (level >= 0.02) {
          for (const id of PROVINCE_ORDER) {
            const el = provinceEls.current.get(id);
            if (!el) continue;
            const at = PROVINCES[id].label;
            const { wx, wz } = mapToWorld(at.x, at.y);
            projVec.set(wx, world.heightAt(at.x, at.y) * relief + 0.3, wz).project(camera);
            const sx = (projVec.x * 0.5 + 0.5) * w;
            const sy = (-projVec.y * 0.5 + 0.5) * h;
            el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
          }
        }

        if (firstFrame) {
          firstFrame = false;
          renderer.domElement.style.opacity = '1';
          setReady(true);
        }
      };
      rafId = requestAnimationFrame(animate);

      bag.add({
        dispose: () => {
          arrowBag.dispose();
          routeBag.dispose();
        },
      });
    })().catch(() => {
      if (disposed) return;
      setFailed(true);
      onWebGLFallback?.();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      apiRef.current = null;
      controls.dispose();
      army?.dispose();
      bag.dispose();
      renderer.dispose();
    };
    // Built once: ownership, growth, marches and selection are applied inside the frame loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return null;

  const zh = lang === 'zh';
  // Who holds how many cities of each province: the line under a province's name
  const holdings = PROVINCE_ORDER.map((id) => {
    const inProvince = cities.filter((c) => c.province === id);
    const counts = (['wei', 'shu', 'wu', 'neutral'] as FactionId[])
      .map((fid) => ({ fid, n: inProvince.filter((c) => c.owner === fid).length }))
      .filter((row) => row.n > 0);
    return { id, counts, total: inProvince.length };
  });
  const nearHolding = nearProvince ? holdings.find((h) => h.id === nearProvince) : undefined;

  const holdingChips = (counts: Array<{ fid: FactionId; n: number }>) =>
    counts.map(({ fid, n }) => (
      <span key={fid} className="inline-flex items-center gap-[3px]">
        <span
          className="inline-block w-2 h-2 rounded-[2px] ring-1 ring-black/40"
          style={{ backgroundColor: FACTION_CSS[fid] }}
        />
        <span>
          {zh ? FACTION_BADGE[fid] : ''}
          {n}
        </span>
      </span>
    ));

  return (
    <div className="@container relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Soft vignette: the table falls away into shadow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 85% 80% at 50% 48%, transparent 58%, rgba(8, 6, 4, 0.55) 100%)',
        }}
      />

      {/* Province names, written on the far map with who holds how many of their cities */}
      <div
        ref={provinceLayerRef}
        className={`pointer-events-none absolute inset-0 overflow-hidden z-[9] ${
          ready ? '' : 'invisible'
        }`}
        style={{ opacity: 0 }}
      >
        {holdings.map(({ id, counts }) => (
          <div
            key={id}
            ref={(el) => {
              if (el) provinceEls.current.set(id, el);
              else provinceEls.current.delete(id);
            }}
            className="absolute top-0 left-0 will-change-transform"
          >
            <button
              type="button"
              tabIndex={provinceLevel ? 0 : -1}
              onClick={() => apiRef.current?.flyToProvince(id)}
              onMouseEnter={() => apiRef.current?.hoverProvince(id)}
              onMouseLeave={() => apiRef.current?.hoverProvince(null)}
              title={
                zh
                  ? `进入${PROVINCES[id].name.zh}，查看各城`
                  : `Go down to ${PROVINCES[id].name.en} and its cities`
              }
              className={`group flex flex-col items-center cursor-pointer ${
                provinceLevel ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              <span
                className={`leading-none whitespace-nowrap transition-transform duration-200 group-hover:scale-110 ${
                  zh
                    ? 'font-brush text-[30px] tracking-[0.18em] pl-[0.18em]'
                    : 'font-display text-[15px] font-bold uppercase tracking-[0.2em] pl-[0.2em]'
                }`}
                style={
                  paperShown
                    ? { color: '#2a1d12', textShadow: '0 0 6px rgba(239,230,207,0.95), 0 0 2px rgba(239,230,207,0.9)' }
                    : { color: '#f6ead2', textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.8)' }
                }
              >
                {tLoc(PROVINCES[id].name, lang)}
              </span>
              <span
                className={`mt-1 flex items-center gap-1.5 rounded-sm px-1.5 py-px text-[11px] font-bold leading-tight whitespace-nowrap ${
                  paperShown ? 'bg-[#efe6cf]/85 text-[#2a1d12]' : 'bg-slate-950/75 text-slate-100'
                }`}
              >
                {holdingChips(counts)}
              </span>
            </button>
          </div>
        ))}
      </div>

      {/* City plaques; on the province map all but the chief cities shrink to ink dots */}
      <div
        className={`pointer-events-none absolute inset-0 overflow-hidden z-10 transition-opacity duration-300 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {cities.map((city) => {
          const isSelected = city.id === selectedCityId;
          const isStrikeTarget = attackMode && strikeableIds.has(city.id);
          const asDot = provinceLevel && !isChiefCity(city);
          // On the province map a seat's model stands under its province's name and needs no
          // plaque of its own; the three capitals, the chosen city and strike targets keep theirs.
          const unnamed =
            provinceLevel && !asDot && !city.isCapital && !isSelected && !isStrikeTarget;
          const generals = asDot || provinceLevel ? [] : getCityGenerals(state, city.id);
          const wandering = asDot || provinceLevel ? [] : getCityWanderingHeroes(state, city.id);
          const choose = () => {
            if (isStrikeTarget) onQuickTargetEnemy(city.id);
            else if (!clickCity(city.id)) onSelectCity(city.id);
          };

          return (
            <div
              key={city.id}
              ref={(el) => {
                if (el) labelEls.current.set(city.id, el);
                else labelEls.current.delete(city.id);
              }}
              style={{ display: 'none' }}
              className="absolute top-0 left-0 flex flex-col items-center pointer-events-auto will-change-transform"
            >
              {unnamed ? (
                paperShown ? (
                  <button
                    type="button"
                    onClick={choose}
                    title={`${tLoc(city.name, lang)} · ${city.troops.toLocaleString()}`}
                    aria-label={tLoc(city.name, lang)}
                    className="group relative flex items-center justify-center w-[15px] h-[15px] rounded-[2px] border-[1.5px] border-[#1c1712] bg-[#efe6cf] shadow-[0_1px_3px_rgba(0,0,0,0.35)] cursor-pointer transition-transform hover:scale-125"
                  >
                    <span
                      className="block w-[9px] h-[9px] rounded-[1px] border border-[#1c1712]/70"
                      style={{ backgroundColor: FACTION_CSS[city.owner] }}
                    />
                  </button>
                ) : null
              ) : asDot ? (
                <button
                  type="button"
                  onClick={choose}
                  title={`${tLoc(city.name, lang)} · ${city.troops.toLocaleString()}`}
                  aria-label={tLoc(city.name, lang)}
                  className={`block w-[11px] h-[11px] rounded-full border cursor-pointer transition-transform hover:scale-150 ${
                    isStrikeTarget
                      ? 'border-rose-200 ring-2 ring-rose-500/80 animate-pulse'
                      : isSelected
                        ? 'border-amber-200 ring-2 ring-amber-300/80'
                        : paperShown
                          ? 'border-[#1c1712] shadow-[0_0_0_1.5px_rgba(239,230,207,0.9)]'
                          : 'border-black/80 shadow-[0_0_0_1.5px_rgba(246,234,210,0.75)]'
                  }`}
                  style={{ backgroundColor: FACTION_CSS[city.owner] }}
                />
              ) : (
                <>
                  {(generals.length > 0 || wandering.length > 0) && (
                    <div className="flex items-center -space-x-1.5 mb-1">
                      {generals.slice(0, 3).map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectHero?.(g.id);
                          }}
                          title={tLoc(g.name, lang)}
                          className="w-7 h-7 rounded-full overflow-hidden border border-amber-200/90 shadow-[0_2px_6px_rgba(0,0,0,0.7)] cursor-pointer hover:scale-110 hover:z-10"
                        >
                          <Art
                            thumb
                            src={g.portrait}
                            alt={tLoc(g.name, lang)}
                            className="w-full h-full object-cover object-top"
                          />
                        </button>
                      ))}
                      {generals.length > 3 && (
                        <span className="w-7 h-7 rounded-full bg-slate-950/90 border border-amber-200/60 text-[10px] font-bold text-amber-100 flex items-center justify-center">
                          +{generals.length - 3}
                        </span>
                      )}
                      {wandering.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectHero?.(wandering[0].id);
                          }}
                          title={tLoc(wandering[0].name, lang)}
                          className="w-7 h-7 rounded-full overflow-hidden border-2 border-dashed border-amber-300 shadow-[0_0_10px_rgba(208,167,79,0.8)] cursor-pointer hover:scale-110"
                        >
                          <Art
                            thumb
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
                    onClick={choose}
                    className={`flex items-stretch rounded-sm overflow-hidden border shadow-[0_3px_10px_rgba(0,0,0,0.65)] cursor-pointer ${
                      isStrikeTarget
                        ? 'border-rose-400 ring-2 ring-rose-500/60 animate-pulse'
                        : isSelected
                          ? 'border-amber-300 ring-1 ring-amber-300/70'
                          : 'border-black/60 hover:border-amber-300/80'
                    }`}
                  >
                    <span className="w-1.5 shrink-0" style={{ backgroundColor: FACTION_CSS[city.owner] }} />
                    <span
                      className={`px-2 py-0.5 font-display font-bold leading-tight whitespace-nowrap ${
                        paperShown ? 'bg-[#efe6cf] text-[#1c1712]' : 'bg-slate-950/90 text-slate-50'
                      } ${city.isCapital ? 'text-[15px]' : 'text-[13px]'}`}
                    >
                      {city.isCapital && <span className="mr-1 text-amber-400">★</span>}
                      {tLoc(city.name, lang)}
                    </span>
                    {/* Garrisons are city-level detail; the province map shows who holds what */}
                    {!provinceLevel && (
                      <span
                        className={`px-1.5 py-0.5 text-[11px] font-semibold leading-tight flex items-center ${
                          paperShown ? 'bg-[#dfd3b4] text-[#3a2b14]' : 'bg-slate-900/90 text-amber-200'
                        }`}
                      >
                        {city.troops.toLocaleString()}
                      </span>
                    )}
                  </button>
                  {isSelected && !provinceLevel && !attackMode && onEnterCity && (
                    <button
                      type="button"
                      onClick={() => onEnterCity(city.id)}
                      title={zh ? '入城细看（亦可双击此城）' : 'Go down into the city (or double-click it)'}
                      className="mt-1 btn-gold rounded-sm px-2 py-0.5 text-[11px] leading-tight whitespace-nowrap cursor-pointer"
                    >
                      {zh ? '入城 ↓' : 'Enter ↓'}
                    </button>
                  )}
                  {paperShown && (
                    <span
                      aria-hidden="true"
                      className="mt-1 flex items-center justify-center w-[13px] h-[13px] rounded-[2px] border-[1.5px] border-[#1c1712] bg-[#efe6cf] shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                    >
                      <span
                        className="block w-[7px] h-[7px] rounded-[1px]"
                        style={{ backgroundColor: city.isCapital ? '#b83b2a' : FACTION_CSS[city.owner] }}
                      />
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Where the view is: the whole realm, or one province with the way back */}
      <div
        className={`absolute left-3 top-[52px] z-20 flex items-center gap-1.5 text-[11px] transition-opacity duration-300 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {provinceLevel ? (
          <span className="ink-panel rounded-md px-2.5 py-1 text-slate-300">
            {zh ? '十一州舆图 · 点选一州，细看其城' : 'The eleven provinces · click one to see its cities'}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => apiRef.current?.flyToRealm()}
              title={zh ? '回到十一州全图（Home 键）' : 'Back to the whole realm (Home key)'}
              className="ink-panel rounded-md px-2.5 py-1 font-semibold text-amber-100 hover:text-white hover:border-amber-300/60 cursor-pointer"
            >
              ← {zh ? '天下全图' : 'Whole realm'}
            </button>
            {nearHolding && nearProvince && (
              <span className="ink-panel rounded-md px-2.5 py-1 flex items-center gap-2 text-slate-200">
                <span className={zh ? 'font-brush text-[15px] leading-none' : 'font-display font-bold'}>
                  {tLoc(PROVINCES[nearProvince].name, lang)}
                </span>
                <span className="flex items-center gap-1.5 font-semibold">
                  {holdingChips(nearHolding.counts)}
                </span>
              </span>
            )}
          </>
        )}
      </div>

      <div className="hidden @[1120px]:block pointer-events-none absolute bottom-2.5 right-3 z-20 text-[10px] text-slate-200/80 bg-slate-950/75 px-3 py-1 rounded-full border border-amber-400/25">
        {zh
          ? '拖拽平移 · 右键拖拽旋转 · 滚轮缩放（拉远见州，推近见城）· 双击城池入城'
          : 'Drag to pan · Right-drag to turn · Scroll to zoom (provinces from afar, cities up close) · Double-click a city to enter it'}
      </div>
    </div>
  );
}
