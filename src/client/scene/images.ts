import * as THREE from 'three';

/**
 * Images du décor (public/textures/<nom>.jpg) : panoramas d'horizon, textures de détail du sol…
 * Chaque image existe en deux tailles : <nom>.jpg (ordinateur) et <nom>-mobile.jpg (téléphone, plus légère).
 * Comme les modèles, elles sont chargées une fois avant la construction du niveau (Component.textures), puis réutilisées.
 * Sources et préparation : art/panoramas/, art/textures/ ; licences dans public/textures/<dossier>/LICENSE.txt.
 */

let mobile = false;
/** Choisit la version mobile des images (profil basse qualité), avant le premier chargement. */
export function useMobileTextures(on: boolean): void {
  mobile = on;
}

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<void>>();
const ready = new Map<string, THREE.Texture>();

const textureUrl = (name: string) => `${import.meta.env.BASE_URL}textures/${name}${mobile ? '-mobile' : ''}.jpg`;

/** Charge les images nécessaires (une seule fois chacune). Une image introuvable est signalée puis ignorée. */
export function preloadTextures(names: Iterable<string>): Promise<void> {
  return Promise.all(
    [...new Set(names)].map((name) => {
      if (!cache.has(name)) {
        cache.set(
          name,
          loader.loadAsync(textureUrl(name)).then(
            (texture) => void ready.set(name, texture),
            (error) => {
              cache.delete(name);
              console.warn(`Image « ${name} » introuvable :`, error);
            },
          ),
        );
      }
      return cache.get(name)!;
    }),
  ).then(() => undefined);
}

/** Image préchargée, ou null (absente : le composant garde son rendu sans image). */
export function texture(name: string): THREE.Texture | null {
  return ready.get(name) ?? null;
}
