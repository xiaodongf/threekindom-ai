import * as THREE from 'three';

/**
 * Water that runs and has depth.
 *
 * A water surface here is a flat sheet. What makes it read as water is done in the shader of an
 * ordinary lit material: trains of ripples that travel with the current tilt the surface normal,
 * so the sky's reflection breaks and slides the way it does on a river; the colour runs from a
 * pale shallow at the bank to a dark channel; and where the water thins at the bank it breaks
 * into foam along a line the ripples keep moving. The ripples flatten with distance, so far
 * water lies calm instead of shimmering.
 *
 * Depth comes from a per-vertex `aDepth` attribute (0 at the bank, 1 in deep water); use
 * `setWaterDepth` to fill it.
 */
export interface WaterOptions {
  shallow: THREE.ColorRepresentation;
  deep: THREE.ColorRepresentation;
  /** Which way and how fast the water runs, in world units a second on the ground plane */
  flow: THREE.Vector2;
  /** Length of the larger ripples in world units */
  rippleSize: number;
  /** How steep the ripples are: 0 is glass, 1 is a brisk chop */
  chop?: number;
  /** Foam along the bank, 0 to 1 */
  foam?: number;
  foamColor?: THREE.ColorRepresentation;
  roughness?: number;
  /** A little light of its own keeps dark water from going black in a low-key scene */
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}

export interface Water {
  material: THREE.MeshStandardMaterial;
  update(time: number): void;
}

const VERTEX_PARS = /* glsl */ `
attribute float aDepth;
varying float vWaterDepth;
varying vec3 vWaterWorld;
`;

const FRAGMENT_PARS = /* glsl */ `
varying float vWaterDepth;
varying vec3 vWaterWorld;
uniform float uWaterTime;
uniform vec2 uWaterFlow;
uniform vec4 uWaterShape;
uniform vec3 uWaterShallow;
uniform vec3 uWaterDeep;
uniform vec3 uWaterFoam;

// Slope (x, z) and height of the rippled surface at a point, in ripple lengths
vec3 waterRipples(vec2 p) {
  // A slow swell bends the fine ripples so their crests never line up in rows
  p += 0.4 * vec2(sin(p.y * 0.37 + uWaterTime * 0.23), cos(p.x * 0.31 - uWaterTime * 0.19));
  vec2 slope = vec2(0.0);
  float height = 0.0;
  vec2 k = vec2(5.9, 1.3);
  float amp = 0.5;
  float pace = 1.9;
  for (int i = 0; i < 4; i++) {
    float phase = dot(p, k) + uWaterTime * pace;
    height += amp * sin(phase);
    slope += amp * cos(phase) * k;
    // Each train is shorter, weaker and turned from the last
    k = mat2(0.8, -0.6, 0.6, 0.8) * k * 1.62;
    amp *= 0.52;
    pace *= 1.37;
  }
  return vec3(slope, height);
}
`;

const FRAGMENT_COLOUR = /* glsl */ `
  // uWaterShape = (1 / ripple size, chop, foam, unused)
  vec2 waterAt = (vWaterWorld.xz - uWaterFlow * uWaterTime) * uWaterShape.x;
  vec3 waterWave = waterRipples(waterAt);
  // Ripples smaller than a pixel would only sparkle: let them lie down with distance
  float waterCalm = 1.0 / (1.0 + length(vWaterWorld - cameraPosition) * uWaterShape.x * 0.06);
  float waterDeep = clamp(vWaterDepth, 0.0, 1.0);
  float waterFoam = (1.0 - smoothstep(0.02, 0.2, waterDeep + waterWave.z * 0.05)) * uWaterShape.z;
  vec3 waterTone = mix(uWaterShallow, uWaterDeep, smoothstep(0.0, 1.0, waterDeep));
  waterTone *= 0.94 + 0.1 * waterWave.z * waterCalm;
  diffuseColor.rgb = mix(waterTone, uWaterFoam, waterFoam);
`;

const FRAGMENT_NORMAL = /* glsl */ `
  {
    vec3 waterUp = normalize(vec3(-waterWave.x * uWaterShape.y * 0.045 * waterCalm, 1.0, -waterWave.y * uWaterShape.y * 0.045 * waterCalm));
    normal = normalize((viewMatrix * vec4(waterUp, 0.0)).xyz);
  }
`;

export function createWater(options: WaterOptions): Water {
  const uniforms = {
    uWaterTime: { value: 0 },
    uWaterFlow: { value: options.flow.clone() },
    uWaterShape: { value: new THREE.Vector4(1 / options.rippleSize, options.chop ?? 0.6, options.foam ?? 0, 0) },
    uWaterShallow: { value: new THREE.Color(options.shallow) },
    uWaterDeep: { value: new THREE.Color(options.deep) },
    uWaterFoam: { value: new THREE.Color(options.foamColor ?? 0xd9e6e2) },
  };
  const material = new THREE.MeshStandardMaterial({
    roughness: options.roughness ?? 0.16,
    metalness: 0.04,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vWaterDepth = aDepth;\n  vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOUR}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.85, waterFoam);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`);
  };
  material.customProgramCacheKey = () => 'water1';
  return {
    material,
    update(time) {
      uniforms.uWaterTime.value = time;
    },
  };
}

/**
 * Fills a water sheet's `aDepth` attribute: `depthAt` gets each vertex's position in the
 * sheet's own space and returns 0 at the bank to 1 in deep water. Without it the sheet is deep
 * all over.
 */
export function setWaterDepth(geometry: THREE.BufferGeometry, depthAt?: (x: number, y: number, z: number) => number): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const depth = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    depth[i] = depthAt ? Math.min(1, Math.max(0, depthAt(pos.getX(i), pos.getY(i), pos.getZ(i)))) : 1;
  }
  geometry.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
}
