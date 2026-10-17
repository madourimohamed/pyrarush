/**
 * Préparation des assets dans le navigateur, avant de les envoyer au serveur de développement (aucun outil à installer) :
 * redimensionnement, version téléphone, compression, raccord des bords d'un panorama 360°, position de son soleil.
 * Format envoyé : voir Import dans vitePlugin.ts.
 */

export type ImportKind = 'model' | 'image' | 'texture' | 'panorama';

export interface PreparedFile {
  suffix: string;
  ext: 'glb' | 'jpg' | 'png';
  data: string;
}

export interface Prepared {
  files: PreparedFile[];
  /** Ce qui a été fait, pour informer (tailles, avertissements). */
  report: string[];
  /** Panorama : position horizontale du soleil (0 = bord gauche, 1 = bord droit). */
  sunU?: number;
}

/** Tailles maximales (plus grand côté) : ordinateur, téléphone. Jamais d'agrandissement. */
const SIZES: Record<Exclude<ImportKind, 'model'>, [number, number]> = {
  image: [1024, 512],
  texture: [1024, 512],
  panorama: [4096, 2048],
};
/** Au-delà, un modèle risque de peser sur le chargement (bible graphique § 8) : on prévient. */
const MODEL_WARN_BYTES = 8 * 1024 * 1024;
const SEAM = 40;

const kb = (bytes: number) => `${Math.round(bytes / 1024)} Ko`;

async function base64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(',') + 1);
}

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  return [c, ctx];
}

function encode(c: HTMLCanvasElement, ext: 'jpg' | 'png'): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("impossible d'encoder l'image"))), ext === 'png' ? 'image/png' : 'image/jpeg', ext === 'png' ? undefined : 0.88),
  );
}

/** Image redimensionnée (plus grand côté ≤ max), en conservant les proportions. */
function resized(source: CanvasImageSource & { width: number; height: number }, max: number): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const [c, ctx] = canvas(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/** Deux versions (ordinateur, téléphone) d'une image, avec un suffixe de base (ex. '-normal'). */
async function twoSizes(source: HTMLCanvasElement | ImageBitmap, kind: Exclude<ImportKind, 'model'>, ext: 'jpg' | 'png', suffix = ''): Promise<{ files: PreparedFile[]; report: string }> {
  const files: PreparedFile[] = [];
  const sizes: string[] = [];
  for (const [max, extra] of [
    [SIZES[kind][0], ''],
    [SIZES[kind][1], '-mobile'],
  ] as const) {
    const c = resized(source, max);
    const blob = await encode(c, ext);
    files.push({ suffix: suffix + extra, ext, data: await base64(blob) });
    sizes.push(`${c.width}×${c.height} (${kb(blob.size)})`);
  }
  return { files, report: `${suffix || 'image'} : ordinateur ${sizes[0]}, téléphone ${sizes[1]}` };
}

/** Le raccord gauche / droite d'un panorama 360° : les deux bords fondus vers leur couleur moyenne (comme prepare_panorama.py). */
function blendSeam(c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d')!;
  const { width: w, height: h } = c;
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  for (let y = 0; y < h; y++) {
    const left = (y * w) * 4;
    const right = (y * w + w - 1) * 4;
    for (let ch = 0; ch < 3; ch++) {
      const mean = (px[left + ch] + px[right + ch]) / 2;
      const dl = mean - px[left + ch];
      const dr = mean - px[right + ch];
      for (let k = 0; k < Math.min(SEAM, w / 2); k++) {
        const weight = 1 - k / SEAM;
        px[left + k * 4 + ch] += dl * weight;
        px[right - k * 4 + ch] += dr * weight;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Soleil : point le plus lumineux de la moitié haute (sur une version réduite), en u (0 à 1). */
function findSun(source: CanvasImageSource): number {
  const [c, ctx] = canvas(512, 256);
  ctx.drawImage(source, 0, 0, 512, 256);
  const px = ctx.getImageData(0, 0, 512, 128).data;
  let best = -1;
  let bestX = 0;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    if (lum > best) {
      best = lum;
      bestX = (i / 4) % c.width;
    }
  }
  return (bestX + 0.5) / c.width;
}

/**
 * Rotation du panorama pour que son soleil soit dans la direction de la lumière du thème
 * (même convention que les composants panorama et horizon : u = 0,5 regarde vers +X).
 */
export function panoramaRotation(sunU: number, sunDir: [number, number, number]): number {
  let r = (sunU - 0.5) * Math.PI * 2 - Math.atan2(sunDir[2], sunDir[0]);
  while (r > Math.PI) r -= Math.PI * 2;
  while (r <= -Math.PI) r += Math.PI * 2;
  return Math.round(r * 100) / 100;
}

/** Prépare un import. `relief` : carte de relief facultative d'une texture de sol (normal map). */
export async function prepare(kind: ImportKind, file: File, relief?: File): Promise<Prepared> {
  if (kind === 'model') {
    const head = new TextDecoder().decode(await file.slice(0, 4).arrayBuffer());
    if (head !== 'glTF') throw new Error("ce fichier n'est pas un modèle .glb (glTF binaire)");
    const report = [`modèle : ${kb(file.size)}`];
    if (file.size > MODEL_WARN_BYTES) report.push('⚠ modèle lourd : penser à le simplifier ou à le compresser (bible § 7.3)');
    return { files: [{ suffix: '', ext: 'glb', data: await base64(file) }], report };
  }

  const bitmap = await createImageBitmap(file);
  const report: string[] = [`source : ${bitmap.width}×${bitmap.height}`];
  if (kind === 'image') {
    const { files, report: sizes } = await twoSizes(bitmap, kind, 'png');
    if (file.type !== 'image/png' && file.type !== 'image/webp') report.push('⚠ image sans transparence ? Pour un arbre, utiliser un PNG détouré.');
    return { files, report: [...report, sizes] };
  }
  if (kind === 'texture') {
    const color = await twoSizes(bitmap, kind, 'jpg');
    const files = [...color.files];
    const lines = [...report, color.report];
    if (relief) {
      const normal = await twoSizes(await createImageBitmap(relief), kind, 'jpg', '-normal');
      files.push(...normal.files);
      lines.push(normal.report);
    }
    if (bitmap.width !== bitmap.height) lines.push('⚠ texture non carrée : elle se répète mieux si elle est carrée et raccordable');
    return { files, report: lines };
  }

  // Panorama 360° : rapport 2:1, bords raccordés.
  const ratio = bitmap.width / bitmap.height;
  if (Math.abs(ratio - 2) > 0.05) report.push(`⚠ rapport ${ratio.toFixed(2)} au lieu de 2 : l'image sera étirée (un panorama 360° fait 2 fois sa hauteur)`);
  const width = Math.min(SIZES.panorama[0], bitmap.width);
  const [c, ctx] = canvas(width, Math.round(width / 2));
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  blendSeam(c);
  const sunU = findSun(c);
  const { files, report: sizes } = await twoSizes(c, kind, 'jpg');
  return { files, report: [...report, sizes, `soleil repéré à ${Math.round(sunU * 100)} % de la largeur`], sunU };
}
