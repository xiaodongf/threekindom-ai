import * as THREE from 'three';
import { fxOn } from './toggles.js';

/**
 * A soft dark patch laid on the ground under something that stands on it.
 *
 * A shadow map draws the long shadow a low sun throws, but leaves nothing directly beneath a
 * horse or a miniature, and without that patch of shade the figure seems to hover. This is the
 * cheapest cure: one flat quad with a radial falloff, moved with the figure. It costs one draw
 * call and no extra scene render.
 */
export interface ContactShadow {
  mesh: THREE.Mesh;
  dispose(): void;
}

let sharedTexture: THREE.CanvasTexture | null = null;
let sharedUsers = 0;

function falloffTexture(): THREE.CanvasTexture {
  if (!sharedTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.72)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.2)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    sharedTexture = new THREE.CanvasTexture(canvas);
  }
  sharedUsers += 1;
  return sharedTexture;
}

/** `width` runs along the figure's X axis and `depth` along its Z; `opacity` is the darkest point. */
export function createContactShadow(width: number, depth: number, opacity: number): ContactShadow {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: falloffTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = fxOn('contact');
  mesh.scale.set(width, 1, depth);
  mesh.renderOrder = 1;
  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      sharedUsers -= 1;
      if (sharedUsers <= 0 && sharedTexture) {
        sharedTexture.dispose();
        sharedTexture = null;
        sharedUsers = 0;
      }
    },
  };
}
