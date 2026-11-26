import { isMythLook } from '../../utils/artLook.js';
import * as THREE from 'three';
import { MAP_HEIGHT, MAP_WIDTH } from '../../game/mapGeo.js';
import type { FactionId } from '../../game/types.js';
import type { DisposeBag } from '../duel/duelGeometry3D.js';
import { WORLD_H, WORLD_W, type MapWorld } from './mapWorld.js';

/** How much relief survives when the map is shown as a paper sheet. */
export const PAPER_RELIEF = 0.16;

/** Realm colours as mineral pigments; index 0 is unclaimed ground. */
export const FACTION_INDEX: Record<FactionId, number> = { neutral: 0, wei: 1, shu: 2, wu: 3 };
export const FACTION_PIGMENT: Record<FactionId, number> = {
  neutral: 0x9a8f78,
  wei: 0x4c78a8,
  shu: 0x438554,
  wu: 0xc2432f,
};

const VERT = /* glsl */ `
uniform sampler2D uHeight;
uniform float uPaper;
varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vUv = vec2(position.x / ${WORLD_W.toFixed(1)} + 0.5, position.z / ${WORLD_H.toFixed(1)} + 0.5);
  vec3 p = position;
  p.y = texture2D(uHeight, vUv).r * mix(1.0, ${PAPER_RELIEF.toFixed(2)}, uPaper);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uHeight;
uniform sampler2D uMask;
uniform sampler2D uLake;
uniform sampler2D uProvince;
uniform sampler2D uBorder;
uniform vec2 uTexel;
uniform float uTime;
uniform float uPaper;
uniform float uRealms;
uniform float uSelected;
// One column per city. Row 0: map x, map y, owner, previous owner. Row 1: time the owner
// changed, province index. A table instead of uniform arrays, so the map can hold any number.
uniform sampler2D uCities;
// 0 = looking at cities, 1 = pulled back to the provinces
uniform float uLevel;
uniform float uMyth;
uniform float uFocusProvince;
uniform vec3 uFaction[4];

varying vec2 vUv;
varying vec3 vWorld;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}

vec3 factionColor(float idx) {
  return uFaction[int(clamp(idx, 0.0, 3.0) + 0.5)];
}

void main() {
  vec2 uv = vUv;
  vec2 mapXY = uv * vec2(${MAP_WIDTH.toFixed(1)}, ${MAP_HEIGHT.toFixed(1)});

  // --- relief
  vec2 hm = texture2D(uHeight, uv).rg;
  float hL = texture2D(uHeight, uv - vec2(uTexel.x, 0.0)).r;
  float hR = texture2D(uHeight, uv + vec2(uTexel.x, 0.0)).r;
  float hU = texture2D(uHeight, uv - vec2(0.0, uTexel.y)).r;
  float hD = texture2D(uHeight, uv + vec2(0.0, uTexel.y)).r;
  float cell = ${WORLD_W.toFixed(1)} * uTexel.x;
  vec3 n = normalize(vec3(hL - hR, 2.0 * cell, hU - hD));
  float metres = hm.g * 6500.0;
  float slope = 1.0 - n.y;
  float curve = (hL + hR + hU + hD) * 0.25 - hm.r;

  vec4 mask = texture2D(uMask, uv);
  vec2 lk = texture2D(uLake, uv).rg;
  float land = smoothstep(0.4, 0.6, mask.r);
  float coastField = mask.g;
  float water = smoothstep(0.22, 0.62, mask.b) * land;
  float lake = smoothstep(0.34, 0.66, lk.r) * land;
  float lakeShelf = lk.g * land;
  float lakeShore = (1.0 - smoothstep(0.0, 0.11, abs(lk.r - 0.46))) * land;
  float road = mask.a * land;

  float grain = fbm(uv * vec2(260.0, 172.0));
  float mottle = fbm(uv * vec2(34.0, 22.0));

  // Late-afternoon light from the north-west, as on a hand-shaded relief map
  vec3 L = normalize(vec3(-0.58, 0.6, -0.55));
  float diffuse = clamp(dot(n, L), 0.0, 1.0);
  float shade = mix(0.64, 1.14, smoothstep(0.2, 0.95, diffuse));
  shade *= 1.0 - clamp(curve * 1.6, -0.12, 0.3);

  // --- terrain view: blue-and-green landscape pigments by height
  vec3 plain = vec3(0.60, 0.56, 0.37);
  vec3 lowHill = vec3(0.46, 0.53, 0.33);
  vec3 malachite = vec3(0.29, 0.46, 0.35);
  vec3 azurite = vec3(0.25, 0.39, 0.48);
  vec3 highRock = vec3(0.45, 0.52, 0.56);
  vec3 snow = vec3(0.84, 0.85, 0.82);
  vec3 ground = mix(plain, lowHill, smoothstep(60.0, 420.0, metres));
  ground = mix(ground, malachite, smoothstep(380.0, 1300.0, metres));
  ground = mix(ground, azurite, smoothstep(1300.0, 2800.0, metres));
  ground = mix(ground, highRock, smoothstep(2900.0, 4300.0, metres));
  ground = mix(ground, snow, smoothstep(4500.0, 5400.0, metres) * 0.8);
  ground = mix(ground, ground * vec3(0.82, 0.86, 0.92), smoothstep(0.08, 0.45, slope));
  ground *= 0.9 + mottle * 0.2;
  ground *= shade;

  vec3 riverCol = vec3(0.50, 0.70, 0.68);
  ground = mix(ground, riverCol * (0.8 + 0.2 * shade), water * 0.92);
  ground = mix(ground, ground * 0.62, smoothstep(0.1, 0.3, mask.b) * (1.0 - water) * land * 0.5);
  float lakeRipple = sin((0.82 - lk.g) * 62.0 - uTime * 0.55 + mottle * 3.8);
  vec3 lakeWater = mix(vec3(0.42, 0.64, 0.62), vec3(0.22, 0.44, 0.47), clamp(lakeShelf * 1.15, 0.0, 1.0));
  lakeWater += smoothstep(0.88, 1.0, lakeRipple) * 0.055;
  ground = mix(ground, ground * 0.76, smoothstep(0.05, 0.36, lk.r) * (1.0 - lake) * land * 0.45);
  ground = mix(ground, lakeWater * (0.86 + 0.14 * shade), lake * 0.94);
  ground = mix(ground, vec3(0.80, 0.72, 0.50), road * 0.4 * (1.0 - lake));

  // Sea: deep ink-teal, paler on the shelf, with shore-parallel ripple lines
  float shelf = smoothstep(0.1, 0.5, coastField);
  vec3 sea = mix(vec3(0.085, 0.19, 0.22), vec3(0.22, 0.40, 0.40), shelf * shelf);
  float ripple = sin((0.5 - coastField) * 110.0 - uTime * 0.7 + mottle * 5.0);
  sea += smoothstep(0.9, 1.0, ripple) * shelf * 0.07;
  sea *= 0.92 + grain * 0.14;

  vec3 terrain = mix(sea, ground, land);

  // Drifting cloud shadows carry most of the mood for almost no cost
  float cloud = fbm(uv * vec2(4.6, 3.1) + vec2(uTime * 0.011, uTime * 0.004));
  terrain *= 1.0 - smoothstep(0.5, 0.72, cloud) * 0.16;

  // --- paper view: ink on xuan paper
  vec3 paper = vec3(0.905, 0.855, 0.725) * (0.95 + grain * 0.08) * (0.97 + mottle * 0.06);
  float inkRelief = smoothstep(0.1, 0.5, slope) * 0.42
    + (1.0 - diffuse) * 0.3 * smoothstep(250.0, 1400.0, metres);
  vec3 inkLand = mix(paper, vec3(0.17, 0.16, 0.15), clamp(inkRelief, 0.0, 0.72));
  inkLand = mix(inkLand, vec3(0.42, 0.57, 0.52), smoothstep(700.0, 2600.0, metres) * 0.22);
  inkLand = mix(inkLand, vec3(0.38, 0.50, 0.62), smoothstep(2600.0, 4200.0, metres) * 0.25);
  inkLand = mix(inkLand, vec3(0.22, 0.35, 0.44), water * 0.85);
  vec3 inkLake = mix(vec3(0.81, 0.81, 0.73), vec3(0.68, 0.75, 0.71), clamp(lakeShelf * 1.2, 0.0, 1.0))
    * (0.96 + grain * 0.07);
  inkLake -= smoothstep(0.86, 1.0, lakeRipple) * 0.075;
  inkLand = mix(inkLand, inkLake, lake * 0.92);
  inkLand = mix(inkLand, vec3(0.13, 0.12, 0.11), lakeShore * 0.48);
  inkLand = mix(inkLand, vec3(0.42, 0.30, 0.20), road * 0.45 * (1.0 - lake));
  vec3 inkSea = mix(vec3(0.66, 0.72, 0.69), vec3(0.80, 0.80, 0.72), shelf) * (0.96 + grain * 0.07);
  inkSea -= smoothstep(0.88, 1.0, ripple) * shelf * 0.1;
  vec3 paperCol = mix(inkSea, inkLand, land);

  vec3 col = mix(terrain, paperCol, uPaper);

  // Shoreline drawn as one ink stroke
  float shore = 1.0 - smoothstep(0.0, 0.07, abs(mask.r - 0.5));
  col = mix(col, vec3(0.10, 0.10, 0.10), shore * mix(0.35, 0.6, uPaper));

  // --- realms: borders and washes straight from the province map
  vec2 warp = (vec2(fbm(uv * 15.0), fbm(uv * 15.0 + 7.3)) - 0.5) * 0.02;
  vec2 pr = texture2D(uProvince, uv + warp).rg * 255.0;
  int me = int(pr.r + 0.5);
  int nb = int(pr.g + 0.5);
  vec2 bdv = texture2D(uBorder, uv + warp).rg;
  float bd = bdv.r;
  float pbd = bdv.g;
  vec4 meA = texelFetch(uCities, ivec2(me, 0), 0);
  vec4 meB = texelFetch(uCities, ivec2(me, 1), 0);
  vec4 nbA = texelFetch(uCities, ivec2(nb, 0), 0);
  float dCity = distance(mapXY, meA.xy);

  // A captured city's ground takes its new colour as ink soaking outward from the city
  float since = uTime - meB.x;
  float front = since * 62.0;
  float soak = smoothstep(front - 22.0, front, dCity + (mottle - 0.5) * 36.0);
  float ownMe = meA.z;
  float prevMe = meA.w;
  vec3 realmCol = mix(factionColor(ownMe), factionColor(prevMe), soak);
  float held = mix(step(0.5, ownMe), step(0.5, prevMe), soak);
  float ownNb = nbA.z;
  float frontier = step(0.5, abs(ownMe - ownNb));

  // Seen from afar the washes run together into whole provinces
  float reachLand = (1.0 - smoothstep(mix(105.0, 150.0, uLevel), mix(185.0, 250.0, uLevel), dCity)) * land;
  float reach = reachLand * uRealms;
  float rimCity = 1.0 - smoothstep(0.0, 0.34, bd);
  float rimProvince = 1.0 - smoothstep(0.0, 0.34, pbd);
  float rim = mix(rimCity, max(rimProvince, rimCity * frontier), uLevel);
  float fill = (mix(0.1, 0.3, uPaper) + rim * mix(0.34, 0.4, uPaper)) * (1.0 - lake * mix(0.45, 0.72, uPaper));
  col = mix(col, mix(col, realmCol, 0.85) * (0.85 + 0.3 * shade * (1.0 - uPaper) + 0.15 * uPaper),
    fill * reach * mix(0.35, 1.0, held));

  // City borders are fine lines that fade when the view pulls back, unless two realms meet there
  float line = 1.0 - smoothstep(0.012, 0.05, bd);
  vec3 lineCol = mix(vec3(0.12, 0.11, 0.10), realmCol * 0.55, 0.5);
  col = mix(col, lineCol, line * reach * mix(0.22, 0.85, frontier) * mix(1.0, mix(0.2, 1.0, frontier), uLevel));

  // Province borders: one heavy brush line with a pale edge, strongest on the province map
  float pline = 1.0 - smoothstep(0.022, 0.07, pbd);
  float pedge = (1.0 - smoothstep(0.07, 0.15, pbd)) * (1.0 - pline);
  float pstrength = mix(0.3, 0.92, uLevel) * reachLand * (0.86 + grain * 0.28);
  col = mix(col, vec3(0.93, 0.88, 0.74), pedge * 0.2 * uLevel * reachLand);
  col = mix(col, vec3(0.10, 0.085, 0.07), clamp(pline * pstrength, 0.0, 1.0));

  if (abs(float(me) - uSelected) < 0.5) {
    col += vec3(0.10, 0.08, 0.02) * reach * (0.6 + 0.4 * rimCity) * (1.0 - 0.6 * uLevel);
  }
  if (abs(meB.y - uFocusProvince) < 0.5) {
    col += vec3(0.085, 0.066, 0.02) * reachLand * uLevel * (0.55 + 0.45 * rimProvince);
  }

  // Distance haze quietens the far edge in the terrain view
  float dist = length(cameraPosition - vWorld);
  float haze = (1.0 - exp(-dist * dist * 0.00004)) * (1.0 - uPaper) * 0.45;
  col = mix(col, vec3(0.50, 0.47, 0.40), haze);

  // Dark look. Terrain view: the land drained toward ink and jade, bronze light on the lit
  // slopes, mist lying in the lowlands. Paper view: the sheet becomes old tea-stained silk read
  // by lamplight, bright where the lamp stands and falling into shadow toward its edges.
  // Realm washes and borders keep their place underneath both.
  if (uMyth > 0.0) {
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 g = mix(vec3(l), col, 0.58);
    g = pow(g, vec3(1.32)) * 0.82;
    g *= mix(vec3(0.76, 0.93, 0.97), vec3(1.14, 1.02, 0.80), smoothstep(0.18, 0.62, l));
    float mistField = fbm(uv * vec2(6.5, 4.6) + vec2(uTime * 0.007, -uTime * 0.004));
    float lowland = 1.0 - smoothstep(150.0, 1500.0, metres);
    float mist = smoothstep(0.42, 0.78, mistField) * lowland * land;
    g = mix(g, vec3(0.50, 0.56, 0.55), mist * 0.3);

    vec3 silk = mix(vec3(l), col, 0.62) * vec3(0.85, 0.79, 0.655);
    silk = pow(silk, vec3(1.2));
    silk *= 0.84 + 0.27 * fbm(uv * vec2(3.4, 2.6) + 4.7);
    silk *= mix(vec3(0.86, 0.95, 0.99), vec3(1.06, 1.0, 0.9), smoothstep(0.12, 0.55, l));

    g = mix(g, silk, uPaper);
    float centre = length((uv - 0.5) * vec2(1.0, 0.85));
    g *= 1.0 - smoothstep(0.26, 0.74, centre) * mix(0.38, 0.52, uPaper);
    col = mix(col, g, uMyth);
  }

  // The sheet darkens a little toward its edge, like a mounted painting
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  col *= mix(0.7, 1.0, smoothstep(0.0, 0.035, edge));

  gl_FragColor = vec4(col, 1.0);
}
`;

export interface MapTerrain {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** Applies current ownership; a changed owner starts the ink-soak from that city. */
  setOwners(owners: FactionId[], time: number, animate: boolean): void;
}

/**
 * `cities` are in the order of `world.cityIds`; `provinceIndex` is the number the shader knows
 * each city's province by.
 */
export function buildMapTerrain(
  world: MapWorld,
  cities: Array<{ x: number; y: number; provinceIndex: number }>,
  bag: DisposeBag
): MapTerrain {
  const geo = bag.add(new THREE.PlaneGeometry(WORLD_W, WORLD_H, 320, 211));
  geo.rotateX(-Math.PI / 2);
  // The shader displaces vertices, so give culling a box that already includes the relief.
  geo.boundingBox = new THREE.Box3(
    new THREE.Vector3(-WORLD_W / 2, 0, -WORLD_H / 2),
    new THREE.Vector3(WORLD_W / 2, 8, WORLD_H / 2)
  );
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 62);

  const count = Math.max(1, cities.length);
  const table = new Float32Array(count * 2 * 4);
  for (let i = 0; i < cities.length; i++) {
    table[i * 4] = cities[i].x;
    table[i * 4 + 1] = cities[i].y;
    table[(count + i) * 4] = -1000;
    table[(count + i) * 4 + 1] = cities[i].provinceIndex;
  }
  const cityTex = bag.add(
    new THREE.DataTexture(table, count, 2, THREE.RGBAFormat, THREE.FloatType)
  );
  cityTex.magFilter = THREE.NearestFilter;
  cityTex.minFilter = THREE.NearestFilter;
  cityTex.needsUpdate = true;

  const material = bag.add(
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uHeight: { value: world.heightTex },
        uMask: { value: world.maskTex },
        uLake: { value: world.lakeTex },
        uProvince: { value: world.provinceTex },
        uBorder: { value: world.borderTex },
        uTexel: { value: new THREE.Vector2(1 / world.texW, 1 / world.texH) },
        uTime: { value: 0 },
        uPaper: { value: 0 },
        uRealms: { value: 1 },
        uSelected: { value: -1 },
        uCities: { value: cityTex },
        uLevel: { value: 0 },
        uMyth: { value: isMythLook() ? 1 : 0 },
        uFocusProvince: { value: -1 },
        uFaction: {
          value: (['neutral', 'wei', 'shu', 'wu'] as FactionId[]).map((f) =>
            new THREE.Color(FACTION_PIGMENT[f]).convertLinearToSRGB()
          ),
        },
      },
    })
  );

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  let first = true;
  const setOwners = (owners: FactionId[], time: number, animate: boolean) => {
    let changed = false;
    for (let i = 0; i < count && i < owners.length; i++) {
      const next = FACTION_INDEX[owners[i]];
      if (!first && table[i * 4 + 2] === next) continue;
      const soak = animate && !first;
      table[i * 4 + 3] = soak ? table[i * 4 + 2] : next;
      table[i * 4 + 2] = next;
      table[(count + i) * 4] = soak ? time : -1000;
      changed = true;
    }
    first = false;
    if (changed) cityTex.needsUpdate = true;
  };

  return { mesh, material, setOwners };
}
