import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { DisposeBag } from './duelGeometry3D.js';
import {
  createDustPuffTexture,
  createGlowTexture,
  createImpactFlareTexture,
  createShockRingTexture,
  createTrailTexture,
} from './duelTextures3D.js';

// ----------------------------------------------------------------------------------------------
// Post-processing: bloom, then a grade pass (impact zoom-blur, colour fringe, vignette, flash)
// ----------------------------------------------------------------------------------------------
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uBlur: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uAberration: { value: 0 },
    uVignette: { value: 0.55 },
    uSaturation: { value: 1.08 },
    uFlash: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBlur;
    uniform vec2 uCenter;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uFlash;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - uCenter;
      vec3 col;
      if (uBlur > 0.0008) {
        col = vec3(0.0);
        float total = 0.0;
        for (int i = 0; i < 10; i++) {
          float t = float(i) / 9.0;
          float w = 1.0 - t * 0.65;
          col += texture2D(tDiffuse, vUv - dir * uBlur * t).rgb * w;
          total += w;
        }
        col /= total;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      if (uAberration > 0.0004) {
        col.r = mix(col.r, texture2D(tDiffuse, vUv - dir * uAberration).r, 0.85);
        col.b = mix(col.b, texture2D(tDiffuse, vUv + dir * uAberration).b, 0.85);
      }
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation) * uTint;
      col += uFlash;
      float d = length(dir * vec2(1.0, 0.82));
      col *= 1.0 - uVignette * smoothstep(0.32, 0.92, d);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface DuelPostFx {
  render(): void;
  setSize(width: number, height: number): void;
  grade: ShaderPass;
  bloom: UnrealBloomPass;
  dispose(): void;
}

export function createDuelPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number
): DuelPostFx {
  const dpr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.42, 0.65, 1.0);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  return {
    grade,
    bloom,
    render: () => composer.render(),
    setSize: (w, h) => composer.setSize(w, h),
    dispose: () => {
      bloom.dispose();
      grade.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}

// ----------------------------------------------------------------------------------------------
// Weapon trail: a ribbon splined through the blade's recent positions
// ----------------------------------------------------------------------------------------------
const RIBBON_SAMPLES = 9;
const RIBBON_SUBDIV = 3;
const RIBBON_POINTS = (RIBBON_SAMPLES - 1) * RIBBON_SUBDIV + 1;

export interface WeaponRibbon {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  base: THREE.Vector3[];
  tip: THREE.Vector3[];
  active: boolean;
  level: number;
}

function spline(out: THREE.Vector3, p: THREE.Vector3[], i: number, t: number): void {
  const a = p[Math.max(0, i - 1)];
  const b = p[i];
  const c = p[Math.min(p.length - 1, i + 1)];
  const d = p[Math.min(p.length - 1, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (p0: number, p1: number, p2: number, p3: number) =>
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  out.set(f(a.x, b.x, c.x, d.x), f(a.y, b.y, c.y, d.y), f(a.z, b.z, c.z, d.z));
}

const rb = new THREE.Vector3();
const rt = new THREE.Vector3();
const rCol = new THREE.Color();

// ----------------------------------------------------------------------------------------------
// Particle systems
// ----------------------------------------------------------------------------------------------
const MAX_SPARKS = 220;
const MAX_DUST = 72;
const MAX_MOTES = 130;

interface Spark {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

interface Dust {
  sprite: THREE.Sprite;
  active: boolean;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  alpha: number;
}

export interface DuelVfx {
  createRibbon(): WeaponRibbon;
  updateRibbon(
    ribbon: WeaponRibbon,
    baseObj: THREE.Object3D,
    tipObj: THREE.Object3D,
    intensity: number,
    colorHex: string,
    dt: number
  ): void;
  spawnSparks(pos: THREE.Vector3, count: number, colorHex: string, power?: number): void;
  spawnDust(x: number, y: number, z: number, count?: number, big?: boolean): void;
  flare(pos: THREE.Vector3, colorHex: string, size: number): void;
  shock(x: number, z: number, colorHex: string, size?: number): void;
  update(rawDt: number, elapsed: number): void;
}

export function createDuelVfx(
  scene: THREE.Scene,
  bag: DisposeBag,
  dustHex: string,
  emberHex: string
): DuelVfx {
  const glowTex = createGlowTexture(bag);
  const dustTex = createDustPuffTexture(bag);
  const flareTex = createImpactFlareTexture(bag);
  const ringTex = createShockRingTexture(bag);
  const trailTex = createTrailTexture(bag);

  // ---- sparks: glowing heads plus velocity streaks
  const sparks: Spark[] = [];
  for (let i = 0; i < MAX_SPARKS; i++) {
    sparks.push({
      active: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: 0,
      maxLife: 0.5,
      color: new THREE.Color(),
    });
  }
  const headGeo = bag.add(new THREE.BufferGeometry());
  headGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
  headGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
  const heads = new THREE.Points(
    headGeo,
    bag.add(
      new THREE.PointsMaterial({
        map: glowTex,
        size: 0.17,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
  heads.frustumCulled = false;
  const streakGeo = bag.add(new THREE.BufferGeometry());
  streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 6), 3));
  streakGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 6), 3));
  const streaks = new THREE.LineSegments(
    streakGeo,
    bag.add(
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
  streaks.frustumCulled = false;
  scene.add(heads, streaks);

  // ---- dust
  const dustPool: Dust[] = [];
  for (let i = 0; i < MAX_DUST; i++) {
    const mat = bag.add(
      new THREE.SpriteMaterial({
        map: dustTex,
        color: new THREE.Color(dustHex).multiplyScalar(0.62),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    scene.add(sprite);
    dustPool.push({
      sprite,
      active: false,
      vel: new THREE.Vector3(),
      life: 0,
      maxLife: 0.8,
      startScale: 0.4,
      endScale: 1.8,
      alpha: 0.5,
    });
  }

  // ---- impact flare & ground shock ring
  const flareMat = bag.add(
    new THREE.SpriteMaterial({
      map: flareTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );
  const flareSprite = new THREE.Sprite(flareMat);
  flareSprite.visible = false;
  flareSprite.renderOrder = 10;
  scene.add(flareSprite);
  let flareLife = 0;
  let flareSize = 1;

  const ringGeo = bag.add(new THREE.PlaneGeometry(1, 1));
  ringGeo.rotateX(-Math.PI * 0.5);
  const ringMat = bag.add(
    new THREE.MeshBasicMaterial({
      map: ringTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.visible = false;
  scene.add(ringMesh);
  let ringLife = 0;
  let ringSize = 1;

  // ---- drifting motes / embers that give the air some depth
  const motePos = new Float32Array(MAX_MOTES * 3);
  const moteSeed = new Float32Array(MAX_MOTES);
  for (let i = 0; i < MAX_MOTES; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 26;
    motePos[i * 3 + 1] = Math.random() * 6.5;
    motePos[i * 3 + 2] = -9 + Math.random() * 16;
    moteSeed[i] = Math.random() * 100;
  }
  const moteGeo = bag.add(new THREE.BufferGeometry());
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteColor = new THREE.Color(emberHex).multiplyScalar(1.6);
  const motes = new THREE.Points(
    moteGeo,
    bag.add(
      new THREE.PointsMaterial({
        map: glowTex,
        size: 0.075,
        color: moteColor,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
  motes.frustumCulled = false;
  scene.add(motes);

  const white = new THREE.Color(1, 0.96, 0.85);

  return {
    createRibbon() {
      const geo = bag.add(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RIBBON_POINTS * 2 * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(RIBBON_POINTS * 2 * 3), 3));
      const uv = new Float32Array(RIBBON_POINTS * 2 * 2);
      const index: number[] = [];
      for (let i = 0; i < RIBBON_POINTS; i++) {
        uv[i * 4] = i / (RIBBON_POINTS - 1);
        uv[i * 4 + 1] = 0;
        uv[i * 4 + 2] = i / (RIBBON_POINTS - 1);
        uv[i * 4 + 3] = 1;
        if (i < RIBBON_POINTS - 1) {
          const a = i * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(index);
      const mesh = new THREE.Mesh(
        geo,
        bag.add(
          new THREE.MeshBasicMaterial({
            map: trailTex,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        )
      );
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      const base: THREE.Vector3[] = [];
      const tip: THREE.Vector3[] = [];
      for (let i = 0; i < RIBBON_SAMPLES; i++) {
        base.push(new THREE.Vector3());
        tip.push(new THREE.Vector3());
      }
      return { mesh, geo, base, tip, active: false, level: 0 };
    },

    updateRibbon(ribbon, baseObj, tipObj, intensity, colorHex, dt) {
      baseObj.getWorldPosition(rb);
      tipObj.getWorldPosition(rt);
      // The glow lingers briefly after the cut so the arc stays readable
      ribbon.level = intensity > ribbon.level ? intensity : Math.max(0, ribbon.level - dt * 4.5);
      if (ribbon.level <= 0.02) {
        ribbon.mesh.visible = false;
        ribbon.active = false;
        return;
      }
      if (!ribbon.active) {
        ribbon.active = true;
        for (let i = 0; i < RIBBON_SAMPLES; i++) {
          ribbon.base[i].copy(rb);
          ribbon.tip[i].copy(rt);
        }
      } else if (dt > 0.0015) {
        for (let i = RIBBON_SAMPLES - 1; i > 0; i--) {
          ribbon.base[i].copy(ribbon.base[i - 1]);
          ribbon.tip[i].copy(ribbon.tip[i - 1]);
        }
        ribbon.base[0].copy(rb);
        ribbon.tip[0].copy(rt);
      }
      ribbon.mesh.visible = true;

      const pos = ribbon.geo.attributes.position as THREE.BufferAttribute;
      const col = ribbon.geo.attributes.color as THREE.BufferAttribute;
      rCol.set(colorHex);
      for (let n = 0; n < RIBBON_POINTS; n++) {
        const i = Math.min(RIBBON_SAMPLES - 2, Math.floor(n / RIBBON_SUBDIV));
        const t = n / RIBBON_SUBDIV - i;
        spline(rb, ribbon.base, i, t);
        spline(rt, ribbon.tip, i, t);
        pos.setXYZ(n * 2, rb.x, rb.y, rb.z);
        pos.setXYZ(n * 2 + 1, rt.x, rt.y, rt.z);
        const fade = Math.pow(1 - n / (RIBBON_POINTS - 1), 1.5) * ribbon.level;
        col.setXYZ(n * 2, rCol.r * fade * 1.2, rCol.g * fade * 1.2, rCol.b * fade * 1.2);
        col.setXYZ(
          n * 2 + 1,
          (rCol.r * 1.6 + 1.2) * fade,
          (rCol.g * 1.6 + 1.2) * fade,
          (rCol.b * 1.6 + 1.2) * fade
        );
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    },

    spawnSparks(pos, count, colorHex, power = 1) {
      let spawned = 0;
      rCol.set(colorHex);
      for (const s of sparks) {
        if (s.active) continue;
        s.active = true;
        s.life = 0;
        s.maxLife = 0.3 + Math.random() * 0.55;
        s.pos.copy(pos);
        const theta = Math.random() * Math.PI * 2;
        const up = Math.random();
        const speed = (2.5 + Math.random() * 8.5) * power;
        s.vel.set(Math.cos(theta) * speed, 1.5 + up * 6.5 * power, Math.sin(theta) * speed * 0.8);
        s.color.copy(Math.random() > 0.45 ? rCol : white).multiplyScalar(1.6 + Math.random() * 1.5);
        if (++spawned >= count) break;
      }
    },

    spawnDust(x, y, z, count = 1, big = false) {
      let spawned = 0;
      for (const d of dustPool) {
        if (d.active) continue;
        d.active = true;
        d.life = 0;
        d.maxLife = big ? 0.9 + Math.random() * 0.6 : 0.5 + Math.random() * 0.4;
        d.startScale = big ? 0.8 : 0.35;
        d.endScale = big ? 3.2 : 1.5;
        d.alpha = big ? 0.4 : 0.32;
        d.sprite.position.set(
          x + (Math.random() - 0.5) * 0.4,
          Math.max(0.1, y + Math.random() * 0.2),
          z + (Math.random() - 0.5) * 0.4
        );
        d.vel.set(
          (Math.random() - 0.5) * (big ? 3.4 : 1.2),
          0.4 + Math.random() * (big ? 1.2 : 0.6),
          (Math.random() - 0.5) * (big ? 2.6 : 0.9)
        );
        d.sprite.material.rotation = Math.random() * Math.PI * 2;
        d.sprite.visible = true;
        if (++spawned >= count) break;
      }
    },

    flare(pos, colorHex, size) {
      flareSprite.position.copy(pos);
      flareMat.color.set(colorHex).lerp(white, 0.5).multiplyScalar(2.0);
      flareMat.rotation = Math.random() * Math.PI;
      flareSize = size;
      flareLife = 1;
      flareSprite.visible = true;
    },

    shock(x, z, colorHex, size = 9) {
      ringMesh.position.set(x, 0.06, z);
      ringMat.color.set(colorHex).multiplyScalar(1.8);
      ringSize = size;
      ringLife = 1;
      ringMesh.visible = true;
    },

    update(rawDt, elapsed) {
      // Sparks keep flying through hit-stop so the freeze frame still feels alive
      const hp = headGeo.attributes.position as THREE.BufferAttribute;
      const hc = headGeo.attributes.color as THREE.BufferAttribute;
      const sp = streakGeo.attributes.position as THREE.BufferAttribute;
      const sc = streakGeo.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < MAX_SPARKS; i++) {
        const s = sparks[i];
        if (s.active) {
          s.life += rawDt;
          if (s.life >= s.maxLife) s.active = false;
        }
        if (!s.active) {
          hp.setXYZ(i, 0, -50, 0);
          sp.setXYZ(i * 2, 0, -50, 0);
          sp.setXYZ(i * 2 + 1, 0, -50, 0);
          continue;
        }
        s.vel.y -= 16 * rawDt;
        s.vel.multiplyScalar(1 - 1.4 * rawDt);
        s.pos.addScaledVector(s.vel, rawDt);
        if (s.pos.y < 0.04) {
          s.pos.y = 0.04;
          s.vel.y = Math.abs(s.vel.y) * 0.4;
          s.vel.x *= 0.7;
          s.vel.z *= 0.7;
        }
        const fade = Math.pow(1 - s.life / s.maxLife, 1.4);
        hp.setXYZ(i, s.pos.x, s.pos.y, s.pos.z);
        hc.setXYZ(i, s.color.r * fade, s.color.g * fade, s.color.b * fade);
        sp.setXYZ(i * 2, s.pos.x - s.vel.x * 0.035, s.pos.y - s.vel.y * 0.035, s.pos.z - s.vel.z * 0.035);
        sp.setXYZ(i * 2 + 1, s.pos.x, s.pos.y, s.pos.z);
        sc.setXYZ(i * 2, 0, 0, 0);
        sc.setXYZ(i * 2 + 1, s.color.r * fade, s.color.g * fade, s.color.b * fade);
      }
      hp.needsUpdate = true;
      hc.needsUpdate = true;
      sp.needsUpdate = true;
      sc.needsUpdate = true;

      for (const d of dustPool) {
        if (!d.active) continue;
        d.life += rawDt;
        if (d.life >= d.maxLife) {
          d.active = false;
          d.sprite.visible = false;
          continue;
        }
        const p = d.life / d.maxLife;
        d.sprite.position.addScaledVector(d.vel, rawDt);
        d.vel.multiplyScalar(1 - 2.2 * rawDt);
        const scale = d.startScale + (d.endScale - d.startScale) * Math.sqrt(p);
        d.sprite.scale.set(scale, scale * 0.8, 1);
        d.sprite.material.opacity = Math.sin(Math.min(1, p * 1.15) * Math.PI) * d.alpha;
      }

      if (flareLife > 0) {
        flareLife = Math.max(0, flareLife - rawDt * 5.2);
        const grow = 1 - flareLife;
        const sz = flareSize * (0.4 + grow * 0.9);
        flareSprite.scale.set(sz, sz, 1);
        flareMat.opacity = flareLife * flareLife;
        if (flareLife === 0) flareSprite.visible = false;
      }

      if (ringLife > 0) {
        ringLife = Math.max(0, ringLife - rawDt * 2.1);
        const grow = 1 - ringLife;
        const sz = 0.8 + ringSize * (1 - Math.pow(1 - grow, 3));
        ringMesh.scale.set(sz, 1, sz);
        ringMat.opacity = ringLife * 0.75;
        if (ringLife === 0) ringMesh.visible = false;
      }

      const mp = moteGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < MAX_MOTES; i++) {
        let y = mp.getY(i) + rawDt * (0.12 + (moteSeed[i] % 1) * 0.3);
        let x = mp.getX(i) + rawDt * (0.25 + Math.sin(elapsed * 0.7 + moteSeed[i]) * 0.3);
        if (y > 6.8) y = 0.1;
        if (x > 13) x = -13;
        mp.setX(i, x);
        mp.setY(i, y);
      }
      mp.needsUpdate = true;
    },
  };
}
