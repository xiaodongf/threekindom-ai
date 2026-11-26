import * as THREE from 'three';
import type { FactionId } from '../../game/types.js';
import { FACTION_CLOTH } from '../../utils/factionPalette.js';
import type { DisposeBag } from '../duel/duelGeometry3D.js';
import type { Wind } from '../gfx/wind.js';

/**
 * The owner's flags over the city: cloth in the realm's colour carrying its character, flying
 * from the pole edge in the scene's wind.
 */
export interface CityFlags {
  update(elapsed: number): void;
}

export function buildCityFlags(
  flags: Array<{ p: THREE.Vector3; size: number }>,
  owner: FactionId,
  pigment: number,
  wind: Wind,
  bag: DisposeBag,
  group: THREE.Group
): CityFlags {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const field = new THREE.Color(pigment);
  ctx.fillStyle = `#${field.getHexString()}`;
  ctx.fillRect(0, 0, 160, 96);
  // A darker hem, a pale inner line, and the realm's character in pale ink
  ctx.strokeStyle = `#${field.clone().multiplyScalar(0.5).getHexString()}`;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 150, 86);
  ctx.strokeStyle = 'rgba(244,232,200,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, 136, 72);
  ctx.fillStyle = 'rgba(248,238,214,0.92)';
  ctx.font = "900 56px 'Ma Shan Zheng', 'Noto Serif SC', serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((FACTION_CLOTH[owner] ?? FACTION_CLOTH.neutral).glyph, 80, 51);
  const texture = bag.add(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  // Segmented along its length so the wave has something to bend
  const geometry = bag.add(new THREE.PlaneGeometry(2.3, 1.35, 10, 3));
  geometry.translate(1.15, 0, 0);
  const material = bag.add(
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      side: THREE.DoubleSide,
      emissive: pigment,
      emissiveIntensity: 0.08,
    })
  );
  const meshes = flags.map((flag, i) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(flag.p);
    mesh.scale.setScalar(flag.size);
    mesh.rotation.y = 0.5 + (i % 3) * 0.2;
    wind.cloth(mesh, { axis: 'x', pin: 0, length: 2.3, amplitude: 0.24, ripples: 5.5 });
    // Set after the wind is attached: the city's shadows are drawn once, so the flag's shadow stays still
    mesh.castShadow = true;
    group.add(mesh);
    return { mesh, base: mesh.rotation.y, phase: i * 1.7 };
  });

  return {
    update(elapsed) {
      // The whole flag swings a little round its pole as the wind shifts
      for (const f of meshes) f.mesh.rotation.y = f.base + Math.sin(elapsed * 0.9 + f.phase) * 0.1;
    },
  };
}
