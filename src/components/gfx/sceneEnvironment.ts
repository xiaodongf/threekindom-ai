import * as THREE from 'three';
import { fxOn } from './toggles.js';

/**
 * Image-based ambient light built from a scene's own sky.
 *
 * Every 3D scene lights its metals, lacquer and cloth from the same small generated sky: a
 * vertical gradient with a bright patch where the sun stands. Without it a metallic surface has
 * nothing to reflect and renders near-black, and shadowed faces have no sky colour in them.
 * The result is pre-filtered once and costs nothing more per frame than the lookups the
 * standard material already does.
 */
export interface EnvironmentSpec {
  /** Sky colours from the zenith down to the ground under the horizon */
  skyStops: THREE.ColorRepresentation[];
  /** Direction toward the sun (need not be normalised) */
  sunDir: THREE.Vector3;
  sunColor: THREE.ColorRepresentation;
  /** How much brighter than the sky the sun patch is; 0 leaves the sun out */
  sunStrength?: number;
}

export interface SceneEnvironment {
  /** Null when the effect is switched off for a comparison (`?fxOff=env`) */
  texture: THREE.Texture | null;
  dispose(): void;
}

export function createSceneEnvironment(renderer: THREE.WebGLRenderer, spec: EnvironmentSpec): SceneEnvironment {
  if (!fxOn('env')) return { texture: null, dispose: () => {} };
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  const last = Math.max(1, spec.skyStops.length - 1);
  spec.skyStops.forEach((stop, i) => gradient.addColorStop(i / last, `#${new THREE.Color(stop).getHexString()}`));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 256);
  const skyTex = new THREE.CanvasTexture(canvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;

  const skyGeo = new THREE.SphereGeometry(20, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  const sunGeo = new THREE.SphereGeometry(2.4, 12, 10);
  const strength = spec.sunStrength ?? 5;
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.sunColor).multiplyScalar(strength) });
  if (strength > 0) {
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.copy(spec.sunDir).normalize().multiplyScalar(17);
    envScene.add(sun);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.03);
  pmrem.dispose();
  skyGeo.dispose();
  skyMat.dispose();
  skyTex.dispose();
  sunGeo.dispose();
  sunMat.dispose();

  return { texture: target.texture, dispose: () => target.dispose() };
}
