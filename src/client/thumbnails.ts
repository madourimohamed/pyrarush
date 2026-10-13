import * as THREE from 'three';
import { generateLayout, FLOOR_HEIGHT, type Level } from '../core';
import { Character } from './scene/character';
import { Tweens } from './scene/fx';
import { World } from './scene/world';
import { preloadComponents } from './scene/components';
import { preloadCharacter } from './scene/models';
import { storage } from './storage';

/**
 * Miniatures des niveaux (cartes du menu) et portrait du joueur, rendues avec le vrai moteur 3D.
 * Rendu hors écran, un niveau à la fois, puis mis en cache dans le navigateur : le coût n'est payé qu'une fois.
 *
 * Cache dans IndexedDB (images binaires, quota large), pas dans localStorage (~5 Mo partagés avec la sauvegarde :
 * avec des dizaines de niveaux, les miniatures l'auraient rempli). Une entrée par niveau, remplacée quand le niveau
 * change : la taille du cache reste proportionnelle au nombre de niveaux débloqués.
 */
/** Incrémenter seulement si le rendu des miniatures change (le contenu des niveaux est déjà pris en compte). */
const CACHE_VERSION = 'v3';
const WIDTH = 400;
const HEIGHT = 250;
/** Empreinte du portrait : à changer quand le personnage change. */
const PORTRAIT = 'explorer-1';

const DB_NAME = 'pyrarush-miniatures';
const STORE = 'images';
interface CacheEntry {
  fingerprint: string;
  image: Blob;
}

/** Base des miniatures, ou null si IndexedDB est indisponible (navigation privée…) : tout est alors recalculé. */
let database: Promise<IDBDatabase | null> | null = null;
function openCache(): Promise<IDBDatabase | null> {
  database ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return database;
}

/** Image en cache pour `key`, si elle correspond encore à `fingerprint`. */
async function cacheGet(key: string, fingerprint: string): Promise<Blob | null> {
  const db = await openCache();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        resolve(entry?.fingerprint === fingerprint ? entry.image : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function cacheSet(key: string, fingerprint: string, image: Blob): Promise<void> {
  const db = await openCache();
  try {
    db?.transaction(STORE, 'readwrite').objectStore(STORE).put({ fingerprint, image } satisfies CacheEntry, key);
  } catch {
    /* quota dépassé : la miniature sera simplement recalculée */
  }
}

/** Ancien cache (localStorage, images en base64) : effacé pour rendre la place à la sauvegarde. */
for (const key of storage.keys()) if (key.startsWith('thumb:')) storage.remove(key);

/** Image du canvas du renderer (copiée tout de suite : le renderer peut resservir aussitôt). */
function snapshot(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

let renderer: THREE.WebGLRenderer | null = null;
function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(WIDTH, HEIGHT, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
  }
  return renderer;
}

/** Empreinte du niveau : si son thème ou ses règles changent, la miniature est recalculée automatiquement. */
function fingerprint(level: Level): string {
  const text = JSON.stringify([level.theme, level.config.floors, level.config.doorsPerSideAtTop, level.number]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${CACHE_VERSION}:${(h >>> 0).toString(36)}`;
}

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

function renderLevel(level: Level): Promise<Blob | null> {
  const r = getRenderer();
  r.setSize(WIDTH, HEIGHT, false);
  r.toneMappingExposure = level.theme.exposure;
  const world = new World(generateLayout(level.config, 1234 + level.number), level.theme, new Tweens(), true);
  world.update(0.016);
  const height = level.config.floors * FLOOR_HEIGHT;
  const camera = new THREE.PerspectiveCamera(42, WIDTH / HEIGHT, 0.5, 800);
  const d = world.groundHalf * 1.85;
  camera.position.set(d * 0.62, height * 0.75 + 6, d * 0.78);
  camera.lookAt(0, height * 0.42, 0);
  r.render(world.scene, camera);
  const image = snapshot(r.domElement, 0.82);
  world.dispose();
  return image;
}

/** Portrait de l'explorateur (avatar du profil), avec le modèle animé une fois chargé. */
export async function renderPortrait(): Promise<string> {
  const cached = await cacheGet('#portrait', PORTRAIT);
  if (cached) return URL.createObjectURL(cached);
  await preloadCharacter();
  const r = getRenderer();
  r.setSize(160, 160, false);
  r.toneMappingExposure = 1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2b066);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb07040, 2.2));
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.5);
  sun.position.set(2, 3, 4);
  scene.add(sun);
  const character = new Character();
  character.animate(0.016, 0, 0, 0, true);
  const modelLoaded = character.animated;
  scene.add(character.root);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0.9, 1.35, 2.4);
  camera.lookAt(0, 1.0, 0);
  r.render(scene, camera);
  const image = await snapshot(r.domElement, 0.85);
  if (!image) return r.domElement.toDataURL('image/jpeg', 0.85);
  if (modelLoaded) void cacheSet('#portrait', PORTRAIT, image);
  return URL.createObjectURL(image);
}

/**
 * Fournit la miniature de chaque niveau à `onReady`, d'abord depuis le cache, puis en calculant
 * les manquantes une par une (en laissant respirer l'interface entre deux rendus).
 */
export async function loadLevelThumbnails(levels: Level[], onReady: (level: Level, url: string) => void): Promise<void> {
  const missing: Level[] = [];
  for (const level of levels) {
    const cached = await cacheGet(level.id, fingerprint(level));
    if (cached) onReady(level, URL.createObjectURL(cached));
    else missing.push(level);
  }
  for (const level of missing) {
    await preloadComponents(level.theme.components);
    await nextFrame();
    const image = await renderLevel(level);
    if (!image) continue;
    void cacheSet(level.id, fingerprint(level), image);
    onReady(level, URL.createObjectURL(image));
  }
}
