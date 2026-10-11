import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Bibliothèque de modèles 3D (fichiers GLB dans public/models/<pack>/<nom>.glb).
 * Les modèles sont chargés une fois, avant la construction d'un niveau (preloadModels), puis réutilisés :
 * chaque composant les pose en InstancedMesh (un appel de dessin par matériau, quel que soit le nombre d'exemplaires).
 *
 * Packs disponibles :
 * - nature : Kenney « Nature Kit » (CC0, https://kenney.nl) — palmiers, buissons, rochers, statues, pots…
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
