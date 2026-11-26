import * as THREE from 'three';
import { fxOn } from './toggles.js';

/**
 * Height fog shared by every material in a scene.
 *
 * The scene keeps its ordinary distance fog; on top of it lies a layer that is densest at the
 * ground and thins with height, so figures and walls stand out of the haze from the waist up
 * while their feet and the far ground sink into it. The layer is the closed-form integral of an
 * exponential density along the view ray (three exps and one division per pixel), tinted toward
 * a second colour when looking into the sun.
 *
 * The fog colour may also vary round the horizon: `setBackdropStrip` hands the fog a strip of
 * colour read from the painted backdrop, so the far ground fades into the painting it meets
 * instead of into one flat colour that shows as a seam.
 *
 * Built-in materials are patched through `onBeforeCompile`; anything left unpatched simply
 * keeps the scene's plain distance fog.
 */
export interface HeightFogParams {
  /** World height of the bottom of the layer */
  base?: number;
  /** How quickly the layer thins with height: density falls by e every 1 / falloff units */
  falloff: number;
  /** Density of the layer at its base, per world unit */
  density: number;
  /** Direction toward the sun, for the glow in the fog when looking that way */
  sunDir?: THREE.Vector3;
  sunColor?: THREE.ColorRepresentation;
  /** 0 to 1: how far the fog turns to the sun colour when looking straight at the sun */
  sunAmount?: number;
}

export interface BackdropStrip {
  /** Colours round the horizon, in painting space (u = 0 left edge, 1 right edge) */
  texture: THREE.Texture;
  /** 1 / the fraction of the full circle the painting covers */
  repeat: number;
  /** 0 to 1: how far the fog colour follows the strip instead of the scene's fog colour */
  amount: number;
  /** The strip takes over between these two distances from the camera; nearer fog keeps the scene's own colour */
  near: number;
  far: number;
}

export interface HeightFog {
  /** Patches every fogged built-in material under `root`. Safe to call again after a rebuild. */
  apply(root: THREE.Object3D): void;
  patch(material: THREE.Material): void;
  setBackdropStrip(strip: BackdropStrip | null): void;
  set(params: Partial<HeightFogParams>): void;
}

const PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vHfWorld;
  varying vec3 vHfStrip;
  uniform sampler2D uHfStrip;
  uniform vec4 uHfStripMap;
#endif
`;

// The view matrix is rigid, so the world position comes back from the view-space one without
// needing the model matrix; that keeps one patch valid for meshes, instances, sprites and points.
const VERTEX = /* glsl */ `
#ifdef USE_FOG
  vHfWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
  vHfStrip = vec3(0.0);
  if (uHfStripMap.y > 0.0) {
    // Angle round the scene's centre, mapped the way the painted backdrop is wrapped
    float hfTurn = atan(-vHfWorld.x, vHfWorld.z) / 6.2831853;
    float hfU = (fract(hfTurn + 1.0) - 0.5) * uHfStripMap.x + 0.5;
    vHfStrip = texture2D(uHfStrip, vec2(hfU, 0.5)).rgb;
  }
#endif
`;

const PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vHfWorld;
  varying vec3 vHfStrip;
  uniform vec4 uHfStripMap;
  uniform vec3 uHfLayer;
  uniform vec3 uHfSunDir;
  uniform vec4 uHfSun;
#endif
`;

const FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 hfRay = vHfWorld - cameraPosition;
  float hfDist = length(hfRay);
  vec3 hfDir = hfRay / max(hfDist, 0.0001);
  // uHfLayer = (base height, falloff, density at the base). The fog between the eye and the
  // surface is the integral of exp(-falloff * height) along the ray, which has this closed form.
  float hfEye = cameraPosition.y - uHfLayer.x;
  float hfEnd = vHfWorld.y - uHfLayer.x;
  float hfFloor = -1.0 / uHfLayer.y;
  float hfE0 = exp(-uHfLayer.y * max(hfEye, hfFloor));
  float hfE1 = exp(-uHfLayer.y * max(hfEnd, hfFloor));
  float hfDrop = hfEnd - hfEye;
  float hfMean = abs(hfDrop) > 0.001 ? (hfE0 - hfE1) / (uHfLayer.y * hfDrop) : hfE0;
  float hfFog = 1.0 - exp(-uHfLayer.z * hfDist * max(hfMean, 0.0));
  fogFactor = 1.0 - (1.0 - fogFactor) * (1.0 - clamp(hfFog, 0.0, 1.0));
  // uHfStripMap = (repeat, amount, near, far)
  vec3 hfColor = mix(fogColor, vHfStrip, uHfStripMap.y * smoothstep(uHfStripMap.z, uHfStripMap.w, hfDist));
  float hfGlow = pow(max(dot(hfDir, uHfSunDir), 0.0), 6.0) * uHfSun.a;
  hfColor = mix(hfColor, uHfSun.rgb, hfGlow);
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hfColor, fogFactor );
#endif
`;

type Patchable = THREE.Material & { fog?: boolean; isShaderMaterial?: boolean };

const BUILT_IN = [
  'isMeshStandardMaterial',
  'isMeshBasicMaterial',
  'isMeshLambertMaterial',
  'isMeshPhongMaterial',
  'isSpriteMaterial',
  'isPointsMaterial',
  'isLineBasicMaterial',
] as const;

export function createHeightFog(params: HeightFogParams): HeightFog {
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  // One set of uniform holders shared by every patched material: changing a value here changes
  // it everywhere without touching the materials again.
  const uniforms = {
    uHfLayer: { value: new THREE.Vector3(params.base ?? 0, params.falloff, params.density) },
    uHfSunDir: { value: (params.sunDir ?? new THREE.Vector3(0, 1, 0)).clone().normalize() },
    uHfSun: { value: new THREE.Vector4(1, 1, 1, 0) },
    uHfStrip: { value: blank as THREE.Texture },
    uHfStripMap: { value: new THREE.Vector4(1, 0, 0, 1) },
  };
  const setSun = (color: THREE.ColorRepresentation | undefined, amount: number | undefined) => {
    const c = new THREE.Color(color ?? 0xffffff);
    uniforms.uHfSun.value.set(c.r, c.g, c.b, amount ?? uniforms.uHfSun.value.w);
  };
  setSun(params.sunColor, params.sunAmount ?? 0);

  const patch = (material: THREE.Material) => {
    const mat = material as Patchable;
    if (!fxOn('fog')) return;
    if (mat.userData.heightFog || mat.fog === false || mat.isShaderMaterial) return;
    if (!BUILT_IN.some((flag) => (mat as unknown as Record<string, unknown>)[flag])) return;
    mat.userData.heightFog = true;
    const earlier = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      earlier.call(mat, shader, renderer);
      if (!shader.vertexShader.includes('#include <fog_vertex>')) return;
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <fog_pars_vertex>', `#include <fog_pars_vertex>\n${PARS_VERTEX}`)
        .replace('#include <fog_vertex>', `#include <fog_vertex>\n${VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>\n${PARS_FRAGMENT}`)
        .replace('#include <fog_fragment>', FRAGMENT);
    };
    const earlierKey = mat.customProgramCacheKey;
    mat.customProgramCacheKey = () => `${earlierKey.call(mat)}|heightFog1`;
    mat.needsUpdate = true;
  };

  return {
    patch,
    apply(root) {
      root.traverse((obj) => {
        const m = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        if (Array.isArray(m)) m.forEach(patch);
        else patch(m);
      });
    },
    setBackdropStrip(strip) {
      uniforms.uHfStrip.value = strip ? strip.texture : blank;
      if (strip) uniforms.uHfStripMap.value.set(strip.repeat, strip.amount, strip.near, strip.far);
      else uniforms.uHfStripMap.value.set(1, 0, 0, 1);
    },
    set(next) {
      if (next.base !== undefined) uniforms.uHfLayer.value.x = next.base;
      if (next.falloff !== undefined) uniforms.uHfLayer.value.y = next.falloff;
      if (next.density !== undefined) uniforms.uHfLayer.value.z = next.density;
      if (next.sunDir) uniforms.uHfSunDir.value.copy(next.sunDir).normalize();
      if (next.sunColor !== undefined || next.sunAmount !== undefined) {
        const cur = uniforms.uHfSun.value;
        setSun(next.sunColor ?? new THREE.Color(cur.x, cur.y, cur.z), next.sunAmount);
      }
    },
  };
}

/**
 * Distance haze for lit models in a scene that has no fog of its own.
 *
 * The campaign map's terrain shader hazes far ground itself; the miniatures standing on it are
 * ordinary lit materials and stayed crisp, so distant cities looked cut out and pasted on. This
 * gives those materials the same falloff. `amount` scales the whole effect (the map turns it
 * down to nothing in its paper view).
 */
export interface DistanceHaze {
  patch(material: THREE.Material): void;
  apply(root: THREE.Object3D): void;
  uniforms: { uDhColor: { value: THREE.Color }; uDhShape: { value: THREE.Vector3 } };
}

/** `density` is per squared world unit, `ceiling` the most haze ever applied (0 to 1). */
export function createDistanceHaze(color: THREE.Color, density: number, ceiling: number): DistanceHaze {
  // uDhShape = (density, ceiling, amount)
  const uniforms = { uDhColor: { value: color }, uDhShape: { value: new THREE.Vector3(density, ceiling, 1) } };
  const patch = (material: THREE.Material) => {
    const mat = material as THREE.MeshStandardMaterial;
    if (mat.userData.distanceHaze || !fxOn('fog')) return;
    // These are the built-in materials whose fragment shader carries the view-space position
    const lit = mat.isMeshStandardMaterial || (mat as unknown as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial;
    if (!lit) return;
    mat.userData.distanceHaze = true;
    const earlier = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      earlier.call(mat, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec3 uDhColor;\nuniform vec3 uDhShape;')
        .replace(
          '#include <fog_fragment>',
          `#include <fog_fragment>
  float dhAmount = (1.0 - exp(-dot(vViewPosition, vViewPosition) * uDhShape.x)) * uDhShape.y * uDhShape.z;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uDhColor, dhAmount);`
        );
    };
    const earlierKey = mat.customProgramCacheKey;
    mat.customProgramCacheKey = () => `${earlierKey.call(mat)}|distanceHaze1`;
    mat.needsUpdate = true;
  };
  return {
    uniforms,
    patch,
    apply(root) {
      root.traverse((obj) => {
        const m = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        if (Array.isArray(m)) m.forEach(patch);
        else patch(m);
      });
    },
  };
}

/**
 * Reads the colours a painted backdrop shows along its horizon line, one per column, as a
 * small strip texture for the fog. `tint` is the colour the backdrop material multiplies the
 * painting by, so the strip matches what is on screen. Returns null until the image has loaded.
 */
export function readBackdropStrip(
  painting: THREE.Texture,
  horizonV: number,
  tint: THREE.Color,
  columns = 48
): THREE.DataTexture | null {
  const image = painting.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!image || !image.width || !image.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = columns;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  // A thin band straddling the horizon line: the haze the far ground should dissolve into
  const bandTop = Math.max(0, (1 - horizonV - 0.04) * image.height);
  const bandHeight = Math.max(1, 0.07 * image.height);
  try {
    ctx.drawImage(image, 0, bandTop, image.width, bandHeight, 0, 0, columns, 1);
    const px = ctx.getImageData(0, 0, columns, 1).data;
    const data = new Uint8Array(columns * 4);
    const c = new THREE.Color();
    for (let i = 0; i < columns; i++) {
      c.setRGB(px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255, THREE.SRGBColorSpace).multiply(tint);
      // Stored linear: the shader mixes it straight into the lit colour
      data[i * 4] = Math.round(Math.min(1, c.r) * 255);
      data[i * 4 + 1] = Math.round(Math.min(1, c.g) * 255);
      data[i * 4 + 2] = Math.round(Math.min(1, c.b) * 255);
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, columns, 1);
    tex.wrapS = THREE.MirroredRepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  } catch {
    // A tainted canvas (cross-origin art) cannot be read: keep the flat fog colour
    return null;
  }
}
