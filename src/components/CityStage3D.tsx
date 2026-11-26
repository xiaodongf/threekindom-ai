import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { prefersReducedMotion } from '../utils/motion.js';
import { createFrameGovernor, getQuality, useQualityTier } from '../utils/quality.js';
import { cityAmbient } from './city/cityEnvironment.js';
import { DISTRICT_ORDER, citySpecKey, type CitySpec, type DistrictId } from './city/cityLayout.js';
import { buildCityWorld, type CityWorld } from './city/cityScene.js';
import { createDuelPostFx } from './duel/duelVfx3D.js';
import { createHeightFog } from './gfx/heightFog.js';
import { createSceneEnvironment, type SceneEnvironment } from './gfx/sceneEnvironment.js';
import { applyToneMapping, toneExposure } from './gfx/toneMapping.js';
import { Seal } from './ui/Seal.js';

export interface DistrictLabel {
  /** One character for the seal */
  seal: string;
  title: string;
  value: string;
}

interface CityStage3DProps {
  spec: CitySpec;
  selected: DistrictId | null;
  /** Width of the panel open on the right, so the chosen district stays clear of it. */
  insetRight: number;
  labels: Record<DistrictId, DistrictLabel>;
  onSelect: (id: DistrictId | null) => void;
  /** The player has pulled back past the widest view: return to the map. */
  onLeave: () => void;
  onFailed?: () => void;
}

interface Goal {
  target: THREE.Vector3;
  radius: number;
  phi?: number;
  theta?: number;
  rate: number;
}

const OVERVIEW_PHI = 0.98;
const OVERVIEW_THETA = 0.36;

/**
 * The close-up of one city: the third level of the map. The scene is rebuilt whenever the city's
 * numbers change, so a raised wall or a fuller drill ground shows the moment the order is given;
 * the camera and the renderer stay.
 */
export function CityStage3D({
  spec,
  selected,
  insetRight,
  labels,
  onSelect,
  onLeave,
  onFailed,
}: CityStage3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelEls = useRef(new Map<DistrictId, HTMLButtonElement>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<DistrictId | null>(null);

  const qualityTier = useQualityTier();
  const live = useRef({ spec, selected, insetRight, onSelect, onLeave });
  live.current = { spec, selected, insetRight, onSelect, onLeave };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      onFailed?.();
      return;
    }

    let disposed = false;
    let rafId = 0;
    const quality = getQuality();
    let pixelRatio = Math.min(1.5, quality.pixelRatioCap, window.devicePixelRatio || 1);
    let width = container.clientWidth || 960;
    let height = container.clientHeight || 600;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    applyToneMapping(renderer);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // Nothing that casts a shadow moves, so the shadow map is drawn once per build
    renderer.shadowMap.autoUpdate = false;
    renderer.domElement.style.opacity = '0';
    renderer.domElement.style.transition = 'opacity 520ms ease';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 2, 4200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.screenSpacePanning = false;
    controls.minPolarAngle = 0.32;
    controls.maxPolarAngle = 1.34;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.55;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    const post = createDuelPostFx(renderer, scene, camera, width, height, {
      samples: quality.msaaSamples,
      bloomScale: quality.bloomScale,
      myth: live.current.spec.myth,
    });
    post.grade.uniforms.uVignette.value = 0.34;
    post.grade.uniforms.uSaturation.value = 1.04;
    post.bloom.strength = 0.34;

    // Ambient light from the sky, and haze that lies in the low ground and thickens toward the
    // horizon; both follow the look the city is built under
    let environment: SceneEnvironment | null = null;
    let environmentMyth: boolean | null = null;
    const heightFog = createHeightFog({ falloff: 0.05, density: 0.001 });
    /** True while the shaders of a freshly built city are still compiling */
    let compiling = false;

    let world: CityWorld | null = null;
    let buildMs = 0;
    let builtKey = '';
    let builtCity = '';
    let overview = 140;
    let goal: Goal | null = null;
    let lastSelected: DistrictId | null = null;
    let hovered: DistrictId | null = null;
    let viewShift = 0;
    const still = prefersReducedMotion();
    const sph = new THREE.Spherical();
    const offset = new THREE.Vector3();
    const proj = new THREE.Vector3();

    const overviewGoal = (rate = 3.6, theta?: number): Goal => ({
      target: new THREE.Vector3(0, 2, (world?.layout.half ?? 40) * 0.34),
      radius: overview,
      phi: OVERVIEW_PHI,
      theta,
      rate,
    });
    const districtGoal = (id: DistrictId): Goal => ({
      target: world!.districts[id].focus.clone(),
      radius: world!.districts[id].dist,
      phi: 0.94,
      rate: 3.6,
    });

    const rebuild = () => {
      const cur = live.current;
      const cityChanged = cur.spec.id !== builtCity;
      if (world) {
        scene.remove(world.group);
        world.dispose();
      }
      const startedAt = performance.now();
      world = buildCityWorld(cur.spec);
      buildMs = performance.now() - startedAt;
      builtKey = citySpecKey(cur.spec);
      builtCity = cur.spec.id;
      scene.add(world.group);
      scene.fog = world.fog;
      scene.background = world.fog.color;
      renderer.toneMappingExposure = toneExposure(world.exposure);
      renderer.shadowMap.needsUpdate = true;

      const myth = cur.spec.myth;
      post.setMyth(myth);
      if (environmentMyth !== myth) {
        environment?.dispose();
        const ambient = cityAmbient(myth);
        environment = createSceneEnvironment(renderer, ambient);
        environmentMyth = myth;
        scene.environment = environment.texture;
        scene.environmentIntensity = myth ? 0.4 : 0.32;
        heightFog.set({
          density: myth ? 0.0022 : 0.0009,
          sunDir: ambient.sunDir,
          sunColor: new THREE.Color(ambient.horizon).lerp(new THREE.Color(ambient.glow), 0.6),
          sunAmount: myth ? 0.5 : 0.35,
        });
      }
      heightFog.apply(world.group);
      // Compile the new city's shaders off the main thread; the last frame stays up meanwhile
      compiling = true;
      const done = () => {
        compiling = false;
      };
      renderer.compileAsync(scene, camera).then(done, done);

      const outer = world.layout.outer;
      overview = outer * 3.7 + 34;
      controls.minDistance = 24;
      controls.maxDistance = overview * 1.42;
      if (cityChanged) {
        // Arrive from high above, as if the map's own descent simply carried on
        const start = overviewGoal();
        controls.target.copy(start.target);
        sph.set(still ? overview : overview * 2.2, still ? OVERVIEW_PHI : 0.5, OVERVIEW_THETA + (still ? 0 : 0.5));
        camera.position.setFromSpherical(sph).add(controls.target);
        goal = cur.selected ? districtGoal(cur.selected) : overviewGoal(2.3, OVERVIEW_THETA);
        if (cur.selected) goal.theta = OVERVIEW_THETA;
        lastSelected = cur.selected;
      }
    };

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pointerDown = { x: 0, y: 0 };
    const pick = (e: PointerEvent): DistrictId | null => {
      if (!world) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(world.hitMeshes, false);
      return hits.length > 0 ? (hits[0].object.userData.district as DistrictId) : null;
    };
    const onPointerDown = (e: PointerEvent) => {
      pointerDown.x = e.clientX;
      pointerDown.y = e.clientY;
      goal = null;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 6) return;
      live.current.onSelect(pick(e));
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return;
      const id = pick(e);
      if (id !== hovered) {
        hovered = id;
        setHover(id);
        renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
      }
    };
    const onPointerLeave = () => {
      hovered = null;
      setHover(null);
    };
    // Pulling back past the widest view, three notches in a row, leaves the city
    let pulls = 0;
    let lastPull = 0;
    const onWheel = (e: WheelEvent) => {
      goal = null;
      if (e.deltaY <= 0) {
        pulls = 0;
        return;
      }
      const dist = camera.position.distanceTo(controls.target);
      if (dist < controls.maxDistance * 0.985) return;
      const now = performance.now();
      pulls = now - lastPull < 1100 ? pulls + 1 : 1;
      lastPull = now;
      if (pulls >= 3) {
        pulls = 0;
        live.current.onLeave();
      }
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const el = renderer.domElement;
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('contextmenu', onContextMenu);

    const resize = () => {
      width = container.clientWidth || 960;
      height = container.clientHeight || 600;
      camera.aspect = width / height;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height);
      post.setPixelRatio(pixelRatio);
      post.setSize(width, height);
      viewShift = -1;
    };
    const resizeObserver = new ResizeObserver(() => {
      if ((container.clientWidth || 0) !== width || (container.clientHeight || 0) !== height) resize();
    });
    resizeObserver.observe(container);

    if (window.location.search.includes('cityDebug')) {
      (window as unknown as { __city?: unknown }).__city = {
        camera,
        controls,
        renderer,
        scene,
        getWorld: () => world,
        getBuildMs: () => buildMs,
        setGoal: (g: Goal | null) => {
          goal = g;
        },
      };
    }

    let lastTs = performance.now();
    let elapsed = 0;
    const governor = createFrameGovernor(() => {
      if (pixelRatio <= 1) return;
      pixelRatio = 1;
      resize();
    });
    let shownShift = 0;
    let firstFrame = true;

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const rawDt = (now - lastTs) / 1000;
      lastTs = now;
      if (document.hidden) return;
      const dt = Math.min(0.05, rawDt);
      elapsed += dt;
      const cur = live.current;

      if (citySpecKey(cur.spec) !== builtKey) {
        rebuild();
        // A rebuild is one long frame; leave it out of the frame-rate measure
        return;
      }
      if (!world || compiling) return;

      // Settle on a cheaper resolution if this machine cannot hold the frame rate
      governor(rawDt * 1000);

      if (cur.selected !== lastSelected) {
        lastSelected = cur.selected;
        goal = cur.selected ? districtGoal(cur.selected) : overviewGoal();
      }

      controls.update();
      const reach = world.layout.outer + 70;
      controls.target.x = Math.max(-reach, Math.min(reach, controls.target.x));
      controls.target.z = Math.max(-reach, Math.min(reach, controls.target.z));
      controls.target.y = Math.max(0, Math.min(14, controls.target.y));

      if (goal) {
        const k = still ? 1 : 1 - Math.exp(-dt * goal.rate);
        offset.copy(camera.position).sub(controls.target);
        sph.setFromVector3(offset);
        controls.target.lerp(goal.target, k);
        sph.radius += (goal.radius - sph.radius) * k;
        if (goal.phi !== undefined) sph.phi += (goal.phi - sph.phi) * k;
        let turn = 0;
        if (goal.theta !== undefined) {
          turn = Math.atan2(Math.sin(goal.theta - sph.theta), Math.cos(goal.theta - sph.theta));
          sph.theta += turn * k;
        }
        camera.position.setFromSpherical(sph).add(controls.target);
        camera.lookAt(controls.target);
        if (
          controls.target.distanceTo(goal.target) < 0.15 &&
          Math.abs(goal.radius - sph.radius) < 0.25 &&
          Math.abs(turn) < 0.01
        ) {
          goal = null;
        }
      }
      // Keep the eye above the ground it is flying over
      if (camera.position.y < 3) camera.position.y = 3;

      // Slide the picture left while a panel is open, so the district is not behind it
      const wantShift = cur.selected ? cur.insetRight / 2 : 0;
      shownShift += (wantShift - shownShift) * (still ? 1 : 1 - Math.exp(-dt * 7));
      if (Math.abs(shownShift - viewShift) > 0.5) {
        viewShift = shownShift;
        if (viewShift < 1) camera.clearViewOffset();
        else camera.setViewOffset(width, height, viewShift, 0, width, height);
      }
      camera.updateProjectionMatrix();

      for (const id of DISTRICT_ORDER) {
        world.setGlow(id, cur.selected === id ? 1 : hovered === id ? 0.6 : 0);
      }
      world.update(dt, elapsed, still);
      post.render();

      // Labels ride above their districts
      for (const id of DISTRICT_ORDER) {
        const label = labelEls.current.get(id);
        if (!label) continue;
        proj.copy(world.districts[id].anchor).project(camera);
        const x = (proj.x * 0.5 + 0.5) * width;
        const y = (-proj.y * 0.5 + 0.5) * height;
        if (proj.z > 1 || x < -80 || x > width + 80 || y < 0 || y > height + 60) {
          label.style.display = 'none';
        } else {
          label.style.display = '';
          label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
        }
      }

      if (firstFrame) {
        firstFrame = false;
        renderer.domElement.style.opacity = '1';
        setReady(true);
      }
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      void disposed;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
      controls.dispose();
      world?.dispose();
      post.dispose();
      environment?.dispose();
      renderer.dispose();
    };
    // Built once per quality setting: the city's numbers, the chosen district and the panel
    // width are read each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualityTier]);

  if (failed) return null;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      <div
        className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-500 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {DISTRICT_ORDER.map((id) => {
          const label = labels[id];
          const chosen = selected === id;
          const lit = chosen || hover === id;
          return (
            <button
              key={id}
              type="button"
              ref={(node) => {
                if (node) labelEls.current.set(id, node);
                else labelEls.current.delete(id);
              }}
              onClick={() => onSelect(chosen ? null : id)}
              aria-pressed={chosen}
              style={{ display: 'none' }}
              className="absolute top-0 left-0 flex flex-col items-center pointer-events-auto cursor-pointer will-change-transform group"
            >
              <span
                className={`flex items-center gap-2 rounded-sm border pl-1 pr-2.5 py-1 shadow-[0_3px_12px_rgba(0,0,0,0.7)] transition-colors ${
                  chosen
                    ? 'bg-slate-950/95 border-amber-300'
                    : lit
                      ? 'bg-slate-950/90 border-amber-300/80'
                      : 'bg-slate-950/78 border-amber-400/30 group-hover:border-amber-300/80'
                }`}
              >
                <Seal char={label.seal} size={26} />
                <span className="flex flex-col items-start leading-tight">
                  <span className="font-display font-bold text-[13px] text-slate-50 whitespace-nowrap">
                    {label.title}
                  </span>
                  <span className="text-[11px] font-semibold text-amber-200 whitespace-nowrap">
                    {label.value}
                  </span>
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`block w-px h-5 ${chosen || lit ? 'bg-amber-300' : 'bg-amber-200/50'}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
