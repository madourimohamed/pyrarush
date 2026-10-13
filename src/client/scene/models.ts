import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Bibliothèque de modèles 3D (fichiers GLB dans public/models/<pack>/<nom>.glb).
 * Les modèles sont chargés une fois, avant la construction d'un niveau (preloadModels), puis réutilisés :
 * chaque composant les pose en InstancedMesh (un appel de dessin par matériau, quel que soit le nombre d'exemplaires).
 *
 * Packs disponibles :
 * - nature : Kenney « Nature Kit » (CC0, https://kenney.nl) — palmiers, buissons, rochers, statues, pots…
 * - explorer : le personnage animé, créé pour le jeu (script Blender art/explorer/build_explorer.py) — voir preloadCharacter.
 */
export const DEFAULT_PACK = 'nature';

interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  /** Nom du matériau d'origine (ex. « leafsGreen ») : sert à recolorer selon le thème. */
  materialName: string;
}

interface ModelData {
  parts: ModelPart[];
  /** Hauteur du modèle (sa base est à y = 0). */
  height: number;
}

const cache = new Map<string, Promise<ModelData>>();
const ready = new Map<string, ModelData>();
const loader = new GLTFLoader();

const modelUrl = (name: string) => {
  const [pack, file] = name.includes('/') ? name.split('/') : [DEFAULT_PACK, name];
  return `${import.meta.env.BASE_URL}models/${pack}/${file}.glb`;
};

function load(name: string): Promise<ModelData> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader.loadAsync(modelUrl(name)).then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const parts: ModelPart[] = [];
        gltf.scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          // Une partie par matériau, avec la transformation du nœud appliquée à la géométrie.
          materials.forEach((material, index) => {
            const geometry = obj.geometry.clone();
            if (Array.isArray(obj.material)) {
              const group = (obj.geometry as THREE.BufferGeometry).groups.find((g) => g.materialIndex === index);
              if (group) geometry.setDrawRange(group.start, group.count);
            }
            geometry.applyMatrix4(obj.matrixWorld);
            parts.push({ geometry, material: material as THREE.MeshStandardMaterial, materialName: material.name });
          });
        });
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const data = { parts, height: Math.max(0.001, box.max.y - box.min.y) };
        ready.set(name, data);
        return data;
      }),
    );
  }
  return cache.get(name)!;
}

/** Charge les modèles nécessaires (une seule fois chacun). Un modèle introuvable est signalé puis ignoré. */
export async function preloadModels(names: Iterable<string>): Promise<void> {
  await Promise.all(
    [...new Set(names)].map((name) =>
      load(name).catch((error) => {
        cache.delete(name);
        console.warn(`Modèle « ${name} » introuvable :`, error);
      }),
    ),
  );
}

export const isModelReady = (name: string) => ready.has(name);

/** Personnage animé (squelette + animations nommées) : public/models/explorer/explorer.glb, source dans art/explorer/. */
const CHARACTER_MODEL = 'explorer/explorer';
let characterSource: { scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null = null;
let characterLoading: Promise<void> | null = null;

/** Charge le personnage une seule fois ; en cas d'échec, les personnages gardent leur version en formes simples. */
export function preloadCharacter(): Promise<void> {
  characterLoading ??= loader
    .loadAsync(modelUrl(CHARACTER_MODEL))
    .then((gltf) => {
      gltf.scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        // Or : moins métallique (pas de carte d'environnement dans les scènes du jeu) et légèrement lumineux.
        const material = obj.material as THREE.MeshStandardMaterial;
        if (material.name === 'gold') {
          material.metalness = 0.6;
          material.roughness = 0.3;
          material.emissive.set(0x3a2500);
        }
      });
      characterSource = { scene: gltf.scene, clips: gltf.animations };
    })
    .catch((error) => {
      characterLoading = null;
      console.warn('Personnage animé introuvable :', error);
    });
  return characterLoading;
}

/** Un exemplaire indépendant du personnage (squelette propre, matériaux partagés), ou null s'il n'est pas chargé. */
export function characterModel(): { scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null {
  if (!characterSource) return null;
  return { scene: cloneSkinned(characterSource.scene), clips: characterSource.clips };
}

/** Hauteur d'origine d'un modèle préchargé. */
export function modelHeight(name: string): number {
  return model(name).height;
}

function model(name: string): ModelData {
  const data = ready.get(name);
  if (!data) throw new Error(`Modèle « ${name} » non préchargé (voir Component.models)`);
  return data;
}

/**
 * Pose un modèle préchargé à plusieurs endroits : une InstancedMesh par matériau.
 * `colors` recolore les matériaux dont le nom contient la clé (ex. { leafs: 0x3f9e4d, stone: 0xd8a868 }).
 */
export function instancedModel(name: string, matrices: THREE.Matrix4[], colors: Record<string, number> = {}, shadow = true): THREE.Group {
  const group = new THREE.Group();
  if (!matrices.length) return group;
  for (const part of model(name).parts) {
    const material = part.material.clone();
    const key = Object.keys(colors).find((k) => part.materialName.toLowerCase().includes(k.toLowerCase()));
    if (key) material.color.set(colors[key]);
    material.metalness = 0;
    material.roughness = Math.max(material.roughness, 0.7);
    const mesh = new THREE.InstancedMesh(part.geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
