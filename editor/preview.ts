import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FLOOR_HEIGHT, generateLayout, type PyramidConfig, type Theme } from '../src/core';
import { Renderer } from '../src/client/render';
import { preloadComponents } from '../src/client/scene/components';
import { Tweens } from '../src/client/scene/fx';
import { World } from '../src/client/scene/world';

/**
 * Aperçu du décor avec le vrai rendu du jeu (mêmes Renderer, World et composants) : ce que l'on voit ici est ce que
 * verra le joueur. La caméra se tourne à la souris (clic gauche), se déplace (clic droit) et zoome (molette).
 */
export class Preview {
  private readonly renderer: Renderer;
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);
  private readonly controls: OrbitControls;
  private world: World | null = null;
  private framedFloors = 0;
  /** Numéro de la dernière demande : une construction dépassée par une plus récente est abandonnée. */
  private request = 0;
  private last = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas, false);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.controls.update();
      if (this.world) {
        this.world.update(dt);
        this.renderer.render(this.world.scene, this.camera);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Construit le décor (modèles et images chargés au besoin) ; renvoie une erreur lisible si la construction échoue. */
  async show(theme: Theme, config: PyramidConfig, seed: number): Promise<string | null> {
    const request = ++this.request;
    try {
      await preloadComponents(theme.components);
      if (request !== this.request) return null;
      const world = new World(generateLayout(config, seed), theme, new Tweens(), false);
      this.world?.dispose();
      this.world = world;
      this.renderer.renderer.toneMappingExposure = theme.exposure;
      if (this.framedFloors !== config.floors) this.frame(world, config);
      return null;
    } catch (error) {
      console.error(error);
      return (error as Error).message;
    }
  }

  /** Vue d'ensemble, comme les miniatures du menu (seulement quand la taille de la pyramide change). */
  private frame(world: World, config: PyramidConfig): void {
    this.framedFloors = config.floors;
    const height = config.floors * FLOOR_HEIGHT;
    const d = world.groundHalf * 1.85;
    this.camera.position.set(d * 0.62, height * 0.75 + 6, d * 0.78);
    this.controls.target.set(0, height * 0.42, 0);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
