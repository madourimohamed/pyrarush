import * as THREE from 'three';
import { Rng } from '../../core';

/** Textures générées dans des canvas : aucun fichier à télécharger, rendu net et léger. */

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amount))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/** Assises de pierres taillées. Une tuile = 2 m × 1 m (2 rangées de blocs décalés). */
export function stoneTexture(base: string, seed: number): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const rng = new Rng(seed);
  ctx.fillStyle = shade(base, -0.28);
  ctx.fillRect(0, 0, size, size);
  const rows = 2;
  const rowH = size / rows;
  const mortar = 7;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : size / 4;
    for (let col = -1; col < 2; col++) {
      const x = col * (size / 2) + offset;
      const y = row * rowH;
      const w = size / 2;
      const tint = (rng.next() - 0.5) * 0.14;
      const grad = ctx.createLinearGradient(0, y, 0, y + rowH);
      grad.addColorStop(0, shade(base, tint + 0.07));
      grad.addColorStop(1, shade(base, tint - 0.06));
      ctx.fillStyle = grad;
      ctx.fillRect(x + mortar / 2, y + mortar / 2, w - mortar, rowH - mortar);
      // Arête éclairée en haut, ombrée en bas : effet de pierre taillée.
      ctx.fillStyle = 'rgba(255,240,210,0.35)';
      ctx.fillRect(x + mortar / 2, y + mortar / 2, w - mortar, 4);
      ctx.fillStyle = 'rgba(90,45,10,0.25)';
      ctx.fillRect(x + mortar / 2, y + rowH - mortar / 2 - 5, w - mortar, 5);
    }
  }
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rng.next() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(80,40,10,0.08)';
    ctx.fillRect(rng.next() * size, rng.next() * size, 2 + rng.next() * 3, 2 + rng.next() * 3);
  }
  return toTexture(c);
}

/** Dalles des terrasses. Une tuile = 3 m × 3 m (2 × 2 dalles). */
export function tileTexture(base: string, seed: number): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const rng = new Rng(seed);
  ctx.fillStyle = shade(base, -0.18);
  ctx.fillRect(0, 0, size, size);
  const n = 2;
  const cell = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = shade(base, (rng.next() - 0.5) * 0.08);
      ctx.fillRect(i * cell + 4, j * cell + 4, cell - 8, cell - 8);
    }
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = rng.next() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(80,40,10,0.06)';
    ctx.fillRect(rng.next() * size, rng.next() * size, 2, 2);
  }
  return toTexture(c);
}

/** Hiéroglyphes lumineux gravés sur les portes. */
export function glyphTextures(): THREE.CanvasTexture[] {
  const draws: ((ctx: CanvasRenderingContext2D) => void)[] = [
    // Ankh
    (ctx) => {
      ctx.beginPath();
      ctx.ellipse(64, 38, 16, 22, 0, 0, Math.PI * 2);
      ctx.moveTo(64, 60);
      ctx.lineTo(64, 116);
      ctx.moveTo(36, 72);
      ctx.lineTo(92, 72);
      ctx.stroke();
    },
    // Œil
    (ctx) => {
      ctx.beginPath();
      ctx.moveTo(18, 60);
      ctx.quadraticCurveTo(64, 20, 110, 60);
      ctx.quadraticCurveTo(64, 92, 18, 60);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(64, 60, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(52, 80);
      ctx.lineTo(44, 108);
      ctx.moveTo(70, 80);
      ctx.quadraticCurveTo(84, 104, 100, 96);
      ctx.stroke();
    },
    // Soleil
    (ctx) => {
      ctx.beginPath();
      ctx.arc(64, 64, 18, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(64 + Math.cos(a) * 28, 64 + Math.sin(a) * 28);
        ctx.lineTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
      }
      ctx.stroke();
    },
    // Scarabée
    (ctx) => {
      ctx.beginPath();
      ctx.ellipse(64, 72, 20, 28, 0, 0, Math.PI * 2);
      ctx.moveTo(64, 46);
      ctx.lineTo(64, 100);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(64, 36, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(64 + s * 20, 60);
        ctx.lineTo(64 + s * 40, 48);
        ctx.moveTo(64 + s * 20, 84);
        ctx.lineTo(64 + s * 40, 100);
      }
      ctx.stroke();
    },
  ];
  return draws.map((draw) => {
    const [c, ctx] = canvas(128);
    ctx.strokeStyle = ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6;
    draw(ctx);
    return toTexture(c, false);
  });
}

/** Point lumineux doux (poussière, étincelles). */
export function glowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

/**
 * Coordonnées de texture calculées depuis la position dans le monde :
 * les pierres gardent la même taille sur tous les blocs, quelle que soit leur dimension.
 */
export function applyWorldUVs(geometry: THREE.BufferGeometry, offset: THREE.Vector3, wallTile: [number, number], topTile: number): void {
  const pos = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x;
    const y = pos.getY(i) + offset.y;
    const z = pos.getZ(i) + offset.z;
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    if (ny > 0.5) uv.setXY(i, x / topTile, z / topTile);
    else if (nx > 0.5) uv.setXY(i, z / wallTile[0], y / wallTile[1]);
    else uv.setXY(i, x / wallTile[0], y / wallTile[1]);
  }
  uv.needsUpdate = true;
}
