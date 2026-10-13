import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { EnvironmentRequest, GradeRequest } from './scene/components/ambience';

/** Étalonnage en une passe (espace d'affichage, après le tone mapping) : réglé par le thème (composant `grade`). */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1 },
    contrast: { value: 1 },
    shadows: { value: new THREE.Vector3() },
    highlights: { value: new THREE.Vector3() },
    vignette: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation, contrast, vignette, aspect;
    uniform vec3 shadows, highlights;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c += shadows * (1.0 - smoothstep(0.0, 0.55, l)) + highlights * smoothstep(0.45, 1.0, l);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      c *= 1.0 - vignette * smoothstep(0.45, 1.05, length(d));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
    }`,
};

/**
 * Rendu : tone mapping cinéma + lueur (bloom) sur les éléments lumineux (hiéroglyphes, braseros, pierre de faîte…)
 * + étalonnage. La lueur et l'étalonnage se désactivent dans le menu pour les téléphones modestes.
 * Les demandes d'ambiance d'une scène (scene.userData.environment / grade, voir scene/components/ambience.ts)
 * sont appliquées ici : carte d'environnement calculée une fois par scène, réglages d'étalonnage.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private gradePass: ShaderPass;
  private pmrem: THREE.PMREMGenerator | null = null;
  /** Scène dont l'ambiance est appliquée, et sa carte d'environnement (libérée au changement de scène). */
  private ambienceOf: THREE.Scene | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envScene: THREE.Scene | null = null;
  effects = true;

  constructor(canvas: HTMLCanvasElement, lowQuality: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowQuality, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowQuality ? 1.6 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.55, 1.0);
    this.gradePass = new ShaderPass(GradeShader);
    this.gradePass.enabled = false;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.gradePass);
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.gradePass.uniforms.aspect.value = width / Math.max(1, height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (scene !== this.ambienceOf) this.applyAmbience(scene);
    if (!this.effects) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }

  private applyAmbience(scene: THREE.Scene): void {
    this.ambienceOf = scene;
    const env = scene.userData.environment as EnvironmentRequest | undefined;
    if (env && !scene.environment) {
      this.pmrem ??= new THREE.PMREMGenerator(this.renderer);
      // Une seule carte en mémoire : la scène précédente la recalculera si elle revient.
      if (this.envScene) this.envScene.environment = null;
      this.envTarget?.dispose();
      this.envScene = scene;
      this.envTarget = env.texture ? this.pmrem.fromEquirectangular(env.texture) : this.pmrem.fromScene(env.scene!, 0.02);
      scene.environment = this.envTarget.texture;
      scene.environmentIntensity = env.intensity;
      scene.environmentRotation.y = env.rotation ?? 0;
    }
    const grade = scene.userData.grade as GradeRequest | undefined;
    this.gradePass.enabled = !!grade;
    if (grade) {
      const u = this.gradePass.uniforms;
      u.saturation.value = grade.saturation;
      u.contrast.value = grade.contrast;
      u.shadows.value.set(...grade.shadows);
      u.highlights.value.set(...grade.highlights);
      u.vignette.value = grade.vignette;
    }
  }
}
