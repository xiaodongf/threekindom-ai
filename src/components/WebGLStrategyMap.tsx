import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  getCityGenerals,
  getCityWanderingHeroes,
  getStrikeableEnemyCityIds,
} from '../game/engine.js';
import type { City, FactionId, GameState, General, Language } from '../game/types.js';
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
  onSelectCity: (cityId: string) => void;
  onQuickTargetEnemy: (targetCityId: string) => void;
  onInspectHero?: (heroId: string) => void;
  onWebGLFallback?: () => void;
}

const FACTION_CSS: Record<FactionId, string> = {
  wei: '#4c78a8',
  shu: '#438554',
  wu: '#c2432f',
  neutral: '#9a8f78',
};

const MARCH_SECONDS = 1.4;
/** Cities are game pieces, not scale models: they must read from the far camera. */
const CITY_SCALE = 1.35;

interface CityMarker {
  id: string;
  root: THREE.Group;
  model: THREE.Group;
  ring: THREE.Mesh;
  baseY: number;
  labelLift: number;
  signature: string;
  radius: number;
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
  onSelectCity,
  onQuickTargetEnemy,
  onInspectHero,
  onWebGLFallback,
}: WebGLStrategyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paperShown, setPaperShown] = useState(false);

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
    onSelectCity,
    onQuickTargetEnemy,
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
    onSelectCity,
    onQuickTargetEnemy,
  };

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
    scene.background = new THREE.Color(0x15110d);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.5, 600);
    // Start with the whole sheet in view; the paper map takes over a little beyond that.
    const fitDistance = Math.max(84, Math.min(132, 53 / (Math.tan((18 * Math.PI) / 180) * (width / height))));
    const paperFrom = fitDistance * 1.1;
    const paperFull = fitDistance * 1.32;
    camera.position.set(0, fitDistance * 0.82, fitDistance * 0.57);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;
    controls.minPolarAngle = 0.14;
    controls.maxPolarAngle = 0.98;
    controls.minDistance = 26;
    controls.maxDistance = fitDistance * 1.45;
    controls.zoomSpeed = 0.9;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.target.set(0, 0, 2);
    controls.update();

    scene.add(new THREE.HemisphereLight(0xfff2d6, 0x4a4436, 1.25));
    const sun = new THREE.DirectionalLight(0xffe4b4, 1.9);
    sun.position.set(-58, 60, -55);
    scene.add(sun);

    // The table and the lacquer tray the map lies in
    const table = new THREE.Mesh(
      bag.add(new THREE.PlaneGeometry(900, 900)),
      bag.add(new THREE.MeshBasicMaterial({ color: 0x15110d }))
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -1.1;
    scene.add(table);
    const tray = new THREE.Mesh(
      bag.add(new THREE.BoxGeometry(WORLD_W + 2.4, 1.1, WORLD_H + 2.4)),
      bag.add(new THREE.MeshStandardMaterial({ color: 0x3b1a12, roughness: 0.42 }))
    );
    tray.position.y = -0.57;
    scene.add(tray);
    const rim = new THREE.Mesh(
      bag.add(new THREE.BoxGeometry(WORLD_W + 0.7, 0.06, WORLD_H + 0.7)),
      bag.add(new THREE.MeshStandardMaterial({ color: 0xb98d38, roughness: 0.4, metalness: 0.8 }))
    );
    rim.position.y = -0.035;
    scene.add(rim);

    const raycaster = new THREE.Raycaster();
    const pointerDown = { x: 0, y: 0 };
    const hitMeshes: THREE.Object3D[] = [];
    const markers = new Map<string, CityMarker>();
    const projVec = new THREE.Vector3();

    const onPointerDown = (e: PointerEvent) => {
      pointerDown.x = e.clientX;
      pointerDown.y = e.clientY;
    };
    const pick = (e: PointerEvent): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      return hits.length > 0 ? (hits[0].object.userData.cityId as string) : null;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 6) return;
      const cid = pick(e);
      if (!cid) return;
      const cur = live.current;
      if (cur.attackMode && cur.strikeableIds.has(cid)) cur.onQuickTargetEnemy(cid);
      else cur.onSelectCity(cid);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return;
      renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab';
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
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

      const terrain = buildMapTerrain(world, initialCities, bag);
      scene.add(terrain.mesh);
      const kit = createCityKit(bag);

      const placeCity = (city: City) => {
        const { wx, wz } = mapToWorld(city.x, city.y);
        const baseY = world.heightAt(city.x, city.y);
        const radius = (1.3 + cityTier(city) * 0.34) * CITY_SCALE * 0.9;
        const root = new THREE.Group();
        root.position.set(wx, baseY, wz);
        const model = kit.build(city);
        model.scale.setScalar(CITY_SCALE);
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
          ring,
          baseY,
          labelLift: cityLabelHeight(city),
          signature: citySignature(city),
          radius,
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
        (window as unknown as { __map?: unknown }).__map = { camera, controls, terrain, renderer, debug };
      }
      const ownerOf = (id: string): FactionId =>
        debug.owners[id] ?? live.current.state.cities[id]?.owner ?? 'neutral';

      let lastTs = performance.now();
      let elapsed = 0;
      let paper = 0;
      let lastPaperShown = false;
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
        controls.target.x = Math.max(-WORLD_W * lim, Math.min(WORLD_W * lim, controls.target.x));
        controls.target.z = Math.max(-WORLD_H * lim, Math.min(WORLD_H * lim, controls.target.z));
        controls.target.y = 0;

        // Terrain up close, paper sheet from afar (or as the player chooses)
        const dist = camera.position.distanceTo(controls.target);
        const wantPaper =
          cur.viewMode === 'paper'
            ? 1
            : cur.viewMode === 'terrain'
              ? 0
              : smooth(paperFrom, paperFull, dist);
        paper += (wantPaper - paper) * (stillMotion ? 1 : 1 - Math.exp(-dt * 5));
        const relief = 1 + (PAPER_RELIEF - 1) * paper;
        const u = terrain.material.uniforms;
        u.uTime.value = elapsed;
        u.uPaper.value = paper;
        u.uRealms.value = cur.showRealms ? 1 : 0;
        u.uSelected.value = cur.selectedCityId ? world.cityIds.indexOf(cur.selectedCityId) : -1;
        if (paper > 0.5 !== lastPaperShown) {
          lastPaperShown = paper > 0.5;
          setPaperShown(lastPaperShown);
        }

        // Ownership and growth
        terrain.setOwners(world.cityIds.map(ownerOf), elapsed, !stillMotion);
        for (const marker of markers.values()) {
          const city = cur.state.cities[marker.id];
          if (!city) continue;
          const sig = citySignature(city);
          if (sig !== marker.signature) {
            marker.root.remove(marker.model);
            marker.model = kit.build(city);
            marker.model.scale.setScalar(CITY_SCALE);
            marker.root.add(marker.model);
            marker.signature = sig;
            marker.labelLift = cityLabelHeight(city);
          }
          marker.root.position.y = marker.baseY * relief;

          const isTarget = cur.attackMode && cur.strikeableIds.has(marker.id);
          const isSelected = marker.id === cur.selectedCityId;
          const mat = marker.ring.material as THREE.MeshBasicMaterial;
          if (isTarget || isSelected) {
            const pulse = 1 + Math.sin(elapsed * (isTarget ? 6 : 3.4)) * (isTarget ? 0.1 : 0.05);
            marker.ring.scale.setScalar(marker.radius * 1.25 * pulse);
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
          projVec
            .set(marker.root.position.x, marker.root.position.y + marker.labelLift, marker.root.position.z)
            .project(camera);
          const sx = (projVec.x * 0.5 + 0.5) * w;
          const sy = (-projVec.y * 0.5 + 0.5) * h;
          const visible = projVec.z < 1 && sx > -60 && sx < w + 60 && sy > -20 && sy < h + 60;
          el.style.display = visible ? '' : 'none';
          if (visible) {
            el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
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
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      controls.dispose();
      army?.dispose();
      bag.dispose();
      renderer.dispose();
    };
    // Built once: ownership, growth, marches and selection are applied inside the frame loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return null;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Soft vignette: the table falls away into shadow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 85% 80% at 50% 48%, transparent 58%, rgba(8, 6, 4, 0.55) 100%)',
        }}
      />

      {/* City plaques */}
      <div
        className={`pointer-events-none absolute inset-0 overflow-hidden z-10 transition-opacity duration-300 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {cities.map((city) => {
          const isSelected = city.id === selectedCityId;
          const isStrikeTarget = attackMode && strikeableIds.has(city.id);
          const generals = getCityGenerals(state, city.id);
          const wandering = getCityWanderingHeroes(state, city.id);

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
                onClick={() => {
                  if (isStrikeTarget) onQuickTargetEnemy(city.id);
                  else onSelectCity(city.id);
                }}
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
                <span
                  className={`px-1.5 py-0.5 text-[11px] font-semibold leading-tight flex items-center ${
                    paperShown ? 'bg-[#dfd3b4] text-[#3a2b14]' : 'bg-slate-900/90 text-amber-200'
                  }`}
                >
                  {city.troops.toLocaleString()}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none absolute bottom-2.5 right-3 z-20 text-[10px] text-slate-200/80 bg-slate-950/75 px-3 py-1 rounded-full border border-amber-400/25">
        {lang === 'zh'
          ? '拖拽平移 · 右键拖拽旋转 · 滚轮缩放（拉远即为舆图）'
          : 'Drag to pan · Right-drag to turn · Scroll to zoom (pull back for the paper map)'}
      </div>
    </div>
  );
}
