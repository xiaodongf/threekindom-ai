import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DisposeBag } from '../duel/duelGeometry3D.js';

/**
 * Open fire: braziers, torches and camp fires.
 *
 * A flame is three cards crossed about its axis and drawn additively. Nothing is a picture: the
 * fragment shader grows the flame from rising turbulence, so it bends, its top breaks into
 * tongues that lick up and vanish, and each card burns to its own rhythm, which keeps the three
 * from lining up into one shape. The colour runs from a yellow core low down, through orange, to
 * deep red at the tips; only the core is bright enough to bloom. Embers rise from each fire and
 * fade as they cool. Everything moves on the GPU from a single clock.
 */
export interface Fire {
  /** One flame standing on its origin, `width` across and `height` tall */
  flame(width: number, height: number, seed: number): THREE.Mesh;
  /** A drift of embers above each of `sources`, drawn in one call */
  embers(sources: THREE.Vector3[], perSource: number, height: number): THREE.Points;
  /** Advances every flame and ember made from this fire to `time` seconds */
  update(time: number): void;
}

const FLAME_VERTEX = /* glsl */ `
  #include <begin_vertex>
  vFlameUv = uv;
  vFlamePhase = aFlamePhase;
  // The upper flame sways; the root stays in the coals
  float flameSway = uv.y * uv.y * position.y * 0.07;
  transformed.x += sin(uFlameTime * 2.3 + aFlamePhase * 6.2832) * flameSway;
  transformed.z += cos(uFlameTime * 1.7 + aFlamePhase * 4.1) * flameSway;
`;

const FLAME_FRAGMENT_PARS = /* glsl */ `
uniform float uFlameTime;
varying vec2 vFlameUv;
varying float vFlamePhase;
float flameHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float flameNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(flameHash(i), flameHash(i + vec2(1.0, 0.0)), f.x),
    mix(flameHash(i + vec2(0.0, 1.0)), flameHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
`;

const FLAME_FRAGMENT = /* glsl */ `
  {
    vec2 uv = vFlameUv;
    float t = uFlameTime + vFlamePhase * 17.0;
    // Turbulence rising through the flame, the finer grain rising faster
    float turb = flameNoise(vec2(uv.x * 4.0 + vFlamePhase * 9.0, uv.y * 3.0 - t * 3.0)) * 0.62
      + flameNoise(vec2(uv.x * 9.0 - vFlamePhase * 5.0, uv.y * 6.5 - t * 5.6)) * 0.38;
    // The body bends with it, more toward the tip
    float x = (uv.x - 0.5) * 2.0 + (turb - 0.5) * 0.9 * uv.y;
    // A teardrop: full just above the coals, drawn to a point at the top, and pinched and
    // swollen by the turbulence so the outline never holds still
    float halfWidth = mix(0.85, 0.08, smoothstep(0.04, 0.9, uv.y)) * (0.7 + 0.3 * smoothstep(0.0, 0.2, uv.y));
    halfWidth *= 0.75 + turb * 0.5;
    float body = 1.0 - smoothstep(halfWidth * 0.2, halfWidth, abs(x));
    // Where the turbulence is weak the flame falls short: the top breaks into tongues
    float reach = uv.y + (0.55 - turb) * 0.95;
    float heat = body * (1.0 - smoothstep(0.3, 0.75, reach)) * smoothstep(0.0, 0.07, uv.y);
    // Three cards overlap down the axis; thin each one so the sum stays fire-coloured
    heat *= 0.8;
    float core = heat * (1.0 - smoothstep(0.06, 0.5, uv.y)) * (1.0 - smoothstep(0.0, 0.65, abs(x) / max(halfWidth, 0.05)));
    vec3 flameColour = mix(vec3(0.55, 0.08, 0.015), vec3(1.0, 0.42, 0.08), smoothstep(0.05, 0.6, heat));
    flameColour = mix(flameColour, vec3(1.0, 0.8, 0.48), core);
    diffuseColor.rgb *= flameColour;
    diffuseColor.a *= heat;
  }
`;

const EMBER_VERTEX = /* glsl */ `
  // Each ember rises from its fire on a loop of its own, drifting and cooling as it goes
  float emberLife = fract(uFlameTime * (0.32 + aEmber.y * 0.3) + aEmber.x);
  vEmberLife = emberLife;
  vec3 transformed = vec3(position);
  transformed.y += emberLife * uEmberHeight * (0.6 + aEmber.z * 0.6);
  float emberDrift = emberLife * (0.25 + aEmber.z * 0.35);
  transformed.x += sin(uFlameTime * 1.3 + aEmber.x * 31.0) * emberDrift + emberLife * 0.25;
  transformed.z += cos(uFlameTime * 1.1 + aEmber.y * 17.0) * emberDrift;
`;

/** A canvas-free soft dot for embers, so the module stands on its own */
function emberSprite(bag: DisposeBag): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const a = Math.max(0, 1 - d);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  return bag.add(tex);
}

/**
 * The shared clock and materials for a set of fires. `intensity` scales the flames' light: about
 * 0.8 puts the core, where all three cards overlap, just over the bloom threshold under the
 * stage's exposure, and leaves the body and tongues orange.
 */
export function createFire(bag: DisposeBag, intensity = 0.8): Fire {
  const time = { value: 0 };
  const emberHeight = { value: 2 };

  const flameMaterial = bag.add(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(intensity, intensity, intensity),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  flameMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uFlameTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uFlameTime;\nattribute float aFlamePhase;\nvarying vec2 vFlameUv;\nvarying float vFlamePhase;'
      )
      .replace('#include <begin_vertex>', FLAME_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FLAME_FRAGMENT_PARS}`)
      .replace('#include <map_fragment>', FLAME_FRAGMENT);
  };
  flameMaterial.customProgramCacheKey = () => 'flame1';

  const emberMaterial = bag.add(
    new THREE.PointsMaterial({
      color: new THREE.Color(1.6, 0.62, 0.2),
      map: emberSprite(bag),
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  emberMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uFlameTime = time;
    shader.uniforms.uEmberHeight = emberHeight;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uFlameTime;\nuniform float uEmberHeight;\nattribute vec3 aEmber;\nvarying float vEmberLife;'
      )
      .replace('#include <begin_vertex>', EMBER_VERTEX)
      // Hot and full-sized as it leaves the fire, smaller as it cools
      .replace('gl_PointSize = size;', 'gl_PointSize = size * (1.0 - emberLife * 0.6);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEmberLife;')
      .replace(
        '#include <premultiplied_alpha_fragment>',
        '#include <premultiplied_alpha_fragment>\n  gl_FragColor.a *= smoothstep(0.0, 0.08, vEmberLife) * (1.0 - smoothstep(0.45, 1.0, vEmberLife));\n  gl_FragColor.gb *= 1.0 - vEmberLife * 0.6;'
      );
  };
  emberMaterial.customProgramCacheKey = () => 'ember1';

  return {
    flame(width, height, seed) {
      const cards = [0, 1, 2].map((k) => {
        const g = new THREE.PlaneGeometry(width, height, 1, 4);
        // The root sits a little down in the coals
        g.translate(0, height * 0.45, 0);
        g.rotateY(seed * 2.4 + (k * Math.PI) / 3);
        const phase = new Float32Array(g.attributes.position.count).fill((seed * 7.13 + k * 0.371) % 1);
        g.setAttribute('aFlamePhase', new THREE.BufferAttribute(phase, 1));
        return g;
      });
      const geometry = bag.add(mergeGeometries(cards)!);
      cards.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(geometry, flameMaterial);
      mesh.renderOrder = 3;
      // The sway can carry the tip outside the cards' bounds
      mesh.frustumCulled = false;
      return mesh;
    },
    embers(sources, perSource, height) {
      emberHeight.value = height;
      const count = sources.length * perSource;
      const position = new Float32Array(count * 3);
      const ember = new Float32Array(count * 3);
      let s = 0x2f6e2b1;
      const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
      sources.forEach((src, j) => {
        for (let i = 0; i < perSource; i++) {
          const k = j * perSource + i;
          const a = rnd() * Math.PI * 2;
          const r = rnd() * 0.22;
          position.set([src.x + Math.cos(a) * r, src.y, src.z + Math.sin(a) * r], k * 3);
          ember.set([rnd(), rnd(), rnd()], k * 3);
        }
      });
      const geometry = bag.add(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
      geometry.setAttribute('aEmber', new THREE.BufferAttribute(ember, 3));
      const points = new THREE.Points(geometry, emberMaterial);
      points.frustumCulled = false;
      points.renderOrder = 4;
      return points;
    },
    update(t) {
      time.value = t;
    },
  };
}
