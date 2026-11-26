import * as THREE from 'three';

/**
 * One wind per scene.
 *
 * Everything that the air moves (banners, flags, treetops, drifting mist) reads the same wind:
 * a direction, a strength, and a field of gusts that crosses the scene with it, so a gust
 * reaches one banner and then the next instead of every cloth waving to its own clock. The
 * motion is done in the vertex shader of the ordinary lit materials, with the surface normal
 * derived from the wave's slope, so cloth shades as it folds and nothing is recomputed on the
 * CPU each frame.
 */
export interface ClothOptions {
  /** The axis, in the mesh's own space, that runs from the pinned edge to the free one */
  axis: 'x' | 'y';
  /** Coordinate of the pinned edge on that axis */
  pin: number;
  /** Signed distance from the pinned edge to the free edge */
  length: number;
  /** How far the free edge swings out of the sheet's plane, in mesh units */
  amplitude: number;
  /** Phase run of the travelling wave from pin to free edge, in radians */
  ripples: number;
  /** Fraction of the swing that also shifts the cloth sideways in its own plane */
  drift?: number;
}

export interface SwayOptions {
  /** Height at which a tree sways fully, in the mesh's own units */
  height: number;
  /** How far the top moves, in the mesh's own units */
  amplitude: number;
}

export interface Wind {
  uniforms: { uWindTime: { value: number }; uWind: { value: THREE.Vector4 } };
  /** Direction the wind blows toward, on the ground plane (unit length) */
  direction: THREE.Vector2;
  /** Makes a flat sheet wave from its pinned edge; also moves its shadow */
  cloth(mesh: THREE.Mesh, options: ClothOptions): void;
  /** Makes upright things (trees) lean and sway with height */
  sway(material: THREE.Material, options: SwayOptions): void;
  /** Advances the wind; `strength` 1 is a steady breeze */
  update(time: number, strength?: number): void;
  dispose(): void;
}

const f = (n: number): string => n.toFixed(4);

const WIND_PARS = /* glsl */ `
uniform float uWindTime;
uniform vec4 uWind;
// 0 to 1: how hard it is blowing at a place just now. Bands of gust travel down the wind.
float windGust(vec2 p) {
  float along = dot(p, uWind.xy);
  float across = dot(p, vec2(-uWind.y, uWind.x));
  float slow = sin(along * 0.11 - uWindTime * 0.7 + sin(across * 0.07) * 1.3);
  float quick = sin(along * 0.31 - uWindTime * 1.9 + across * 0.05);
  return clamp(0.55 + 0.3 * slow + 0.15 * quick, 0.0, 1.0);
}
`;

function clothChunks(o: ClothOptions): { prelude: string; normal: string; position: string } {
  const a = o.axis;
  const other = a === 'x' ? 'y' : 'x';
  return {
    prelude: /* glsl */ `
  vec3 windAt = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float windBlow = (0.3 + 0.7 * windGust(windAt.xz)) * uWind.z;
  // 0 at the pinned edge, 1 at the free one
  float windFree = clamp((position.${a} - (${f(o.pin)})) / (${f(o.length)}), 0.0, 1.0);
  float windPhase = uWindTime * 6.2 - windFree * ${f(o.ripples)} + dot(windAt.xz, vec2(0.71, 1.37));
  float windReach = ${f(o.amplitude)} * windBlow;
  float windWave = sin(windPhase) + 0.45 * sin(windPhase * 0.41 + 1.7);
  float windOut = windWave * windReach * windFree;
`,
    // The sheet's height above its own plane is windOut; its slope along the sheet tilts the normal
    normal: /* glsl */ `
  float windTurn = cos(windPhase) + 0.45 * 0.41 * cos(windPhase * 0.41 + 1.7);
  float windSlope = (windWave * windReach - windTurn * ${f(o.ripples)} * windReach * windFree) / (${f(o.length)});
  objectNormal = normalize(vec3(0.0, 0.0, 1.0) - vec3(${a === 'x' ? 'windSlope, 0.0' : '0.0, windSlope'}, 0.0));
`,
    position: /* glsl */ `
  transformed.z += windOut;
  transformed.${other} += windOut * ${f(o.drift ?? 0)};
`,
  };
}

function swayChunk(o: SwayOptions): string {
  return /* glsl */ `
  {
    #ifdef USE_INSTANCING
      mat3 swayFrame = mat3(instanceMatrix);
      vec3 swayAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    #else
      mat3 swayFrame = mat3(1.0);
      vec3 swayAt = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    #endif
    float swayBlow = (0.25 + 0.75 * windGust(swayAt.xz)) * uWind.z;
    float swayHigh = clamp(position.y / ${f(o.height)}, 0.0, 1.0);
    float swayPhase = uWindTime * 1.7 + dot(swayAt.xz, vec2(0.37, 0.53));
    // A steady lean down the wind, and a rocking on top of it
    float swayPush = (0.5 + 0.55 * sin(swayPhase) + 0.3 * sin(swayPhase * 2.3 + 1.1)) * ${f(o.amplitude)} * swayHigh * swayHigh * swayBlow;
    // The wind's direction, turned into this tree's own frame
    vec3 swayDir = vec3(uWind.x, 0.0, uWind.y);
    vec3 swayLocal = vec3(dot(swayFrame[0], swayDir), dot(swayFrame[1], swayDir), dot(swayFrame[2], swayDir)) / max(dot(swayFrame[0], swayFrame[0]), 0.0001);
    transformed += swayLocal * swayPush;
  }
`;
}

export function createWind(directionX: number, directionZ: number, strength = 1): Wind {
  const direction = new THREE.Vector2(directionX, directionZ).normalize();
  const uniforms = {
    uWindTime: { value: 0 },
    uWind: { value: new THREE.Vector4(direction.x, direction.y, strength, 0) },
  };
  const owned: THREE.Material[] = [];

  /** Adds vertex-shader code to a built-in material, keeping any hook already on it. */
  const hook = (material: THREE.Material, key: string, edit: (vertex: string) => string) => {
    const earlier = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      earlier.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = edit(shader.vertexShader.replace('#include <common>', `#include <common>\n${WIND_PARS}`));
    };
    const earlierKey = material.customProgramCacheKey;
    material.customProgramCacheKey = () => `${earlierKey.call(material)}|${key}`;
    material.needsUpdate = true;
  };

  return {
    uniforms,
    direction,
    cloth(mesh, options) {
      const chunks = clothChunks(options);
      const key = `cloth:${options.axis}:${options.pin}:${options.length}:${options.amplitude}:${options.ripples}:${options.drift ?? 0}`;
      const material = mesh.material as THREE.Material;
      if (!material.userData.wind) {
        material.userData.wind = true;
        hook(material, key, (vertex) =>
          vertex
            .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${chunks.prelude}${chunks.normal}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\n${chunks.position}`)
        );
      }
      if (mesh.castShadow) {
        // The shadow pass draws with its own material, which must wave the same way
        const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        hook(depth, `depth:${key}`, (vertex) =>
          vertex.replace('#include <begin_vertex>', `#include <begin_vertex>\n${chunks.prelude}${chunks.position}`)
        );
        mesh.customDepthMaterial = depth;
        owned.push(depth);
      }
    },
    sway(material, options) {
      if (material.userData.wind) return;
      material.userData.wind = true;
      hook(material, `sway:${options.height}:${options.amplitude}`, (vertex) =>
        vertex.replace('#include <begin_vertex>', `#include <begin_vertex>\n${swayChunk(options)}`)
      );
    },
    update(time, next) {
      uniforms.uWindTime.value = time;
      if (next !== undefined) uniforms.uWind.value.z = next;
    },
    dispose() {
      owned.forEach((m) => m.dispose());
      owned.length = 0;
    },
  };
}
