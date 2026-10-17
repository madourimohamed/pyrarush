import * as THREE from 'three';

/**
 * Écran de chargement (défini en ligne dans index.html pour s'afficher avant le JS) : le jeu signale son avancement
 * puis le ferme quand l'accueil est prêt, une fois les premières images rendues (compilation des shaders comprise).
 */
interface SplashApi {
  progress(p: number): void;
  done(): void;
}
const api = (window as unknown as { __splash?: SplashApi }).__splash;

export const splash = {
  progress: (p: number) => api?.progress(p),
  /** Suit le chargement des modèles et des textures (gestionnaire par défaut de Three.js) entre `from` et `to`. */
  trackAssets(from: number, to: number): void {
    THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => api?.progress(from + ((to - from) * loaded) / Math.max(1, total));
  },
  /** Ferme l'écran après `frames` images rendues. */
  done(frames = 3): void {
    const step = () => (frames-- > 0 ? requestAnimationFrame(step) : (THREE.DefaultLoadingManager.onProgress = () => {}, api?.done()));
    step();
  },
};
