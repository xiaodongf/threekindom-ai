import * as THREE from 'three';
import { getHeroDuelProfile } from '../../game/heroDuelProfiles.js';
import type { General } from '../../game/types.js';
import { applyRigPose3D, buildMountedGeneralRig3D } from '../duel/duelModels3D.js';
import type { RiderFrameState } from '../duel/duelTypes.js';
import { DisposeBag } from '../duel/duelGeometry3D.js';
import { PAPER_RELIEF } from './mapTerrain.js';
import { mapToWorld, type MapWorld } from './mapWorld.js';

/** Miniatures are deliberately oversized: a general must read at a glance from the far camera. */
const ARMY_SCALE = 1.55;

/**
 * An army on the march is its general: the same horse-and-rider built for duels, riding the road
 * between two cities under a tall banner in the realm's colour.
 */
export interface MapArmy {
  group: THREE.Group;
  /** Places the general along the march. `t` runs 0..1; returns the world position. */
  update(
    t: number,
    dt: number,
    elapsed: number,
    paper: number,
    camera: THREE.Camera
  ): THREE.Vector3;
  dispose(): void;
}

export function buildMapArmy(
  hero: General,
  bannerHex: number,
  bannerChar: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  world: MapWorld
): MapArmy {
  const bag = new DisposeBag();
  const rig = buildMountedGeneralRig3D(hero, getHeroDuelProfile(hero), bag);

  // Banner on the rider's back: the part of an army that is seen first
  const flagCanvas = document.createElement('canvas');
  flagCanvas.width = 96;
  flagCanvas.height = 160;
  const ctx = flagCanvas.getContext('2d')!;
  const col = new THREE.Color(bannerHex);
  ctx.fillStyle = `#${col.getHexString()}`;
  ctx.fillRect(0, 0, 96, 160);
  ctx.strokeStyle = '#e8d199';
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, 86, 150);
  ctx.fillStyle = '#f6ead2';
  ctx.font = "900 64px 'Ma Shan Zheng', 'Noto Serif SC', serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bannerChar, 48, 84);
  const flagTex = bag.add(new THREE.CanvasTexture(flagCanvas));
  flagTex.colorSpace = THREE.SRGBColorSpace;
  const flagGeo = bag.add(new THREE.PlaneGeometry(0.62, 1.05, 4, 6));
  const flagMat = bag.add(
    new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 })
  );
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(-0.34, 1.75, 0);
  const pole = new THREE.Mesh(
    bag.add(new THREE.CylinderGeometry(0.018, 0.022, 2.5, 6)),
    bag.add(new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.7 }))
  );
  pole.position.set(-0.02, 1.1, 0);
  const bannerRoot = new THREE.Group();
  bannerRoot.position.set(-0.28, 0.35, -0.12);
  bannerRoot.add(pole, flag);
  rig.torso.add(bannerRoot);
  const flagBase = (flagGeo.attributes.position.array as Float32Array).slice();

  const group = new THREE.Group();
  group.scale.setScalar(ARMY_SCALE);
  group.add(rig.root);

  // The army rides the middle of the road and pulls up short of the walls.
  const a = mapToWorld(from.x, from.y);
  const b = mapToWorld(to.x, to.y);
  const dx = b.wx - a.wx;
  const dz = b.wz - a.wz;
  const len = Math.hypot(dx, dz) || 1;
  const startS = Math.min(len * 0.16, 3.2);
  const endS = len - Math.min(len * 0.2, 3.6);
  group.rotation.y = Math.atan2(-dz, dx);

  const frame: RiderFrameState = {
    x: 0,
    z: 0,
    yaw: 0,
    gait: 'gallop',
    gaitSpeed: 0.55,
    rearAngle: 0,
    bodyPitch: 0,
    pose: 'ready',
    poseBlend: 0,
    trailIntensity: 0,
    trailColor: '#ffffff',
    disarmed: false,
    fatigue: 0,
  };

  const out = new THREE.Vector3();
  const update = (
    t: number,
    dt: number,
    elapsed: number,
    paper: number,
    camera: THREE.Camera
  ): THREE.Vector3 => {
    const k = Math.min(1, Math.max(0, t));
    // Ease out so the general reins in at the end instead of stopping dead
    const eased = 1 - Math.pow(1 - k, 2.2);
    const s = startS + (endS - startS) * eased;
    const arrived = k >= 0.999;
    const wx = a.wx + (dx / len) * s;
    const wz = a.wz + (dz / len) * s;
    // Far cameras get a bigger piece, so the army never shrinks to a speck
    const camDist = Math.hypot(camera.position.x - wx, camera.position.y, camera.position.z - wz);
    const scale = ARMY_SCALE * Math.min(2.1, Math.max(0.72, camDist / 54));
    group.scale.setScalar(scale);
    frame.x = (s - startS) / scale;
    frame.gait = arrived ? 'rear' : 'gallop';
    frame.rearAngle = arrived ? 0.55 : 0;
    frame.pose = arrived ? 'victory_raise' : 'ready';
    frame.poseBlend = arrived ? 1 : 0;
    // A zero-length frame would divide by zero inside the gait and cape simulation
    applyRigPose3D(rig, frame, Math.max(dt, 1 / 240), elapsed);

    const mapX = (wx / 100 + 0.5) * 1000;
    const mapY = (wz / 66 + 0.5) * 660;
    const y = world.heightAt(mapX, mapY) * (1 + (PAPER_RELIEF - 1) * paper) + 0.06;
    // rig.root already carries the distance ridden along local +x
    group.position.set(a.wx + (dx / len) * startS, y, a.wz + (dz / len) * startS);

    // The banner always shows its face to the camera, whichever way the army rides
    bannerRoot.rotation.y =
      Math.atan2(camera.position.x - wx, camera.position.z - wz) - group.rotation.y;

    const pos = flagGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const u = (0.31 - flagBase[i]) / 0.62;
      pos[i + 2] = flagBase[i + 2] + Math.sin(elapsed * 9 + u * 5 + flagBase[i + 1] * 3) * 0.07 * u;
    }
    flagGeo.attributes.position.needsUpdate = true;

    out.set(wx, y, wz);
    return out;
  };

  return { group, update, dispose: () => bag.dispose() };
}

/** A brushed arrow laid on the ground for a march that has already happened this season. */
export interface MarchArrow {
  mesh: THREE.Mesh;
  setPaper(paper: number): void;
}

export function buildMarchArrow(
  from: { x: number; y: number },
  to: { x: number; y: number },
  colorHex: number,
  world: MapWorld,
  bag: DisposeBag
): MarchArrow {
  const SEG = 28;
  const width = 0.5;
  const positions = new Float32Array((SEG + 1) * 2 * 3);
  const uvs = new Float32Array((SEG + 1) * 2 * 2);
  const baseY = new Float32Array((SEG + 1) * 2);
  const index: number[] = [];

  const bend = 0.1;
  const mid = {
    x: (from.x + to.x) / 2 - (to.y - from.y) * bend,
    y: (from.y + to.y) / 2 + (to.x - from.x) * bend,
  };
  const point = (t: number) => {
    const u = 0.14 + t * 0.7;
    const m = 1 - u;
    return {
      x: m * m * from.x + 2 * m * u * mid.x + u * u * to.x,
      y: m * m * from.y + 2 * m * u * mid.y + u * u * to.y,
    };
  };

  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const p = point(t);
    const q = point(Math.min(1, t + 0.01));
    const pw = mapToWorld(p.x, p.y);
    const qw = mapToWorld(q.x, q.y);
    let tx = qw.wx - pw.wx;
    let tz = qw.wz - pw.wz;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    // Shaft, then a broad head over the last sixth
    const head = t > 0.84 ? (1 - t) / 0.16 : -1;
    const w = head >= 0 ? width * 2.4 * head : width * (0.55 + 0.45 * t);
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1;
      const k = (i * 2 + side) * 3;
      const ox = -tz * sgn * w * 0.5;
      const oz = tx * sgn * w * 0.5;
      positions[k] = pw.wx + ox;
      positions[k + 2] = pw.wz + oz;
      const mx = ((pw.wx + ox) / 100 + 0.5) * 1000;
      const my = ((pw.wz + oz) / 66 + 0.5) * 660;
      baseY[i * 2 + side] = world.heightAt(mx, my);
      positions[k + 1] = baseY[i * 2 + side] + 0.14;
      uvs[(i * 2 + side) * 2] = t;
      uvs[(i * 2 + side) * 2 + 1] = side;
    }
    if (i < SEG) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = bag.add(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  const mat = bag.add(
    new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    })
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;

  const setPaper = (paper: number) => {
    const k = 1 + (PAPER_RELIEF - 1) * paper;
    for (let i = 0; i < baseY.length; i++) positions[i * 3 + 1] = baseY[i] * k + 0.14;
    geo.attributes.position.needsUpdate = true;
  };

  return { mesh, setPaper };
}
