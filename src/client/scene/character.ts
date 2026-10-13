import * as THREE from 'three';
import { bandageTexture } from './guardians';
import { characterModel } from './models';

/** Couleurs de l'explorateur ; l'écharpe varie d'un joueur à l'autre (multijoueur). */
const PALETTE = {
  cloth: 0xf3ece0,
  clothShade: 0xe0d6c4,
  face: 0x17131f,
  leather: 0x6a4428,
  boots: 0x4a2e1a,
  gold: 0xe0b040,
};

/** Mouvement transmis à la silhouette à chaque image. */
interface Motion {
  dt: number;
  time: number;
  speed: number;
  velY: number;
  grounded: boolean;
  /** Phase de la foulée (radians), avance avec la vitesse. */
  runPhase: number;
  /** Réaction « bump » en cours : intensité 0 → 1 → 0, ou null. */
  bump: number | null;
  panic: boolean;
}

/** Corps visible du personnage : le modèle animé (Blender) ou, à défaut, la version en formes simples. */
interface Figure {
  readonly object: THREE.Object3D;
  /** true : la silhouette joue elle-même la réaction « bump » (animation `hit`) ; sinon le corps bascule. */
  readonly playsReactions: boolean;
  update(m: Motion): void;
  react(): void;
  celebrate(): void;
}

/**
 * L'explorateur encapuchonné : capuche blanche, visage sombre aux yeux lumineux, écharpe, tunique, cape.
 * Modèle animé public/models/explorer/explorer.glb (source : art/explorer/) une fois chargé (preloadCharacter),
 * sinon formes simples animées de façon procédurale (tests, échec du chargement).
 */
export class Character {
  readonly root = new THREE.Group();
  /** Partie animée (écrasement, rotation) ; root porte la position. */
  readonly body = new THREE.Group();
  private readonly figure: Figure;
  /** true : modèle animé (Blender) ; false : version en formes simples. */
  readonly animated: boolean;
  private readonly marker: THREE.Mesh;
  private facing = 0;
  private runPhase = 0;
  private squash = 0;
  private time = 0;
  /** Réaction en cours (se cogner contre un mur…), jouée par-dessus l'animation de course. */
  private pose: { kind: 'bump'; t: number; duration: number } | null = null;
  /** Scènes de piège : panique (bras qui moulinent), cocon de bandelettes, étoiles autour de la tête. */
  panic = false;
  private cocoon: THREE.Group | null = null;
  private stars: THREE.Group | null = null;
  private dazed = 0;

  constructor(scarfColor = 0x2f5fb0) {
    const model = characterModel();
    this.figure = model ? new ModelFigure(model, scarfColor) : new ProceduralFigure(scarfColor);
    this.animated = model !== null;
    this.body.add(this.figure.object);
    this.root.add(this.body);

    // Flèche de repérage (zoom moyen et large).
    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.7, 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(scarfColor).multiplyScalar(1.4) }),
    );
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    this.root.add(this.marker);
  }

  /** Animation selon la vitesse et l'état au sol. */
  animate(dt: number, velX: number, velZ: number, velY: number, grounded: boolean): void {
    this.time += dt;
    const speed = Math.hypot(velX, velZ);
    if (speed > 0.5) {
      const target = Math.atan2(velX, velZ);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-14 * dt));
    }
    this.root.rotation.y = this.facing;
    if (grounded && speed > 0.5) this.runPhase += dt * speed * 2.3;

    let bump: number | null = null;
    if (this.pose) {
      this.pose.t += dt;
      const p = this.pose.t / this.pose.duration;
      if (p >= 1) {
        this.pose = null;
        if (!this.figure.playsReactions) this.body.rotation.set(0, 0, 0);
      } else {
        bump = Math.sin(p * Math.PI);
        if (!this.figure.playsReactions) {
          this.body.rotation.x = -0.35 * bump;
          this.body.rotation.z = Math.sin(p * Math.PI * 6) * 0.12 * (1 - p);
        }
      }
    }
    this.figure.update({ dt, time: this.time, speed, velY, grounded, runPhase: this.runPhase, bump, panic: this.panic });

    if (this.stars) {
      this.dazed = Math.max(0, this.dazed - dt);
      this.stars.visible = this.dazed > 0;
      this.stars.rotation.y += dt * 6;
    }

    this.squash *= Math.exp(-10 * dt);
    const stretch = grounded ? 0 : THREE.MathUtils.clamp(velY * 0.015, -0.12, 0.15);
    const s = 1 - this.squash + stretch;
    this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
  }

  /** Petite réaction expressive : « bump » = se cogne contre un mur et recule, tête qui secoue. */
  react(kind: 'bump'): void {
    this.pose = { kind, t: 0, duration: 0.55 };
    this.figure.react();
  }

  /** Victoire : bras levés et petits sauts (modèle animé), jusqu'au prochain déplacement. */
  celebrate(): void {
    this.figure.celebrate();
  }

  /**
   * Enveloppé de bandelettes par la momie : un cocon remplace le corps, seuls les yeux dépassent.
   * Le cocon fait partie du corps : il suit ses rotations (il tourne quand la momie le lance).
   */
  wrap(on: boolean): void {
    if (!on && !this.cocoon) return;
    if (!this.cocoon) {
      this.cocoon = buildCocoon();
      this.body.add(this.cocoon);
    }
    for (const child of this.body.children) child.visible = child === this.cocoon ? on : !on;
  }

  /** Étourdi : petites étoiles qui tournent autour de la tête pendant `seconds`. */
  daze(seconds: number): void {
    if (!this.stars) {
      this.stars = buildStars();
      this.root.add(this.stars);
    }
    this.dazed = seconds;
  }

  land(impact: number): void {
    this.squash = THREE.MathUtils.clamp(impact * 0.02, 0.05, 0.35);
  }

  faceTowards(x: number, z: number): void {
    this.facing = Math.atan2(x, z);
  }

  /** Flèche de repérage : invisible de près, de plus en plus grande quand la caméra s'éloigne (zoom 0 → 2). */
  setMarker(zoom: number): void {
    this.marker.visible = zoom > 0.4;
    const s = 1 + zoom * 1.2;
    this.marker.scale.setScalar(s);
    this.marker.position.y = 2.2 + s * 0.4 + Math.sin(this.time * 5) * 0.15;
    this.marker.rotation.y += 0.04;
  }
}

/** Yeux lumineux (couleur HDR > 1 : déclenche la lueur), partagés par tous les personnages. */
const EYES = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.3, 0.3) });

/** Modèle animé : une animation nommée (§ 5.3 de la bible) par état, avec fondus enchaînés. */
class ModelFigure implements Figure {
  readonly object: THREE.Object3D;
  readonly playsReactions = true;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  /** Animation ponctuelle prioritaire (coup, victoire) et son temps restant. */
  private oneShot = 0;
  private celebrating = false;

  constructor(model: { scene: THREE.Object3D; clips: THREE.AnimationClip[] }, scarfColor: number) {
    this.object = model.scene;
    let scarf: THREE.MeshStandardMaterial | null = null;
    let skeleton: THREE.Skeleton | null = null;
    this.object.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      // Une partie par matériau, mêmes os : un seul squelette (une texture d'os, un calcul par image).
      if (obj instanceof THREE.SkinnedMesh) {
        skeleton ??= obj.skeleton;
        if (obj.skeleton !== skeleton) obj.bind(skeleton, obj.bindMatrix);
      }
      obj.castShadow = true;
      // Le squelette déplace les sommets : la boîte de repos ne suffit pas pour l'élimination hors champ.
      obj.frustumCulled = false;
      const material = obj.material as THREE.MeshStandardMaterial;
      if (material.name === 'eyes') {
        obj.material = EYES;
        obj.castShadow = false;
      } else if (material.name === 'scarf') {
        // Couleur du joueur : seul matériau propre à chaque personnage.
        scarf ??= Object.assign(material.clone(), { name: 'scarf' });
        scarf.color.set(scarfColor);
        obj.material = scarf;
      }
    });
    this.mixer = new THREE.AnimationMixer(this.object);
    for (const clip of model.clips) {
      const action = this.mixer.clipAction(clip);
      if (clip.name === 'jump' || clip.name === 'hit') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(clip.name, action);
    }
    this.play('idle', 0);
  }

  private play(name: string, fade: number, from = 0): void {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.reset();
    next.time = from;
    next.fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next;
  }

  update(m: Motion): void {
    const fall = this.actions.get('fall');
    if (fall) fall.timeScale = m.panic ? 2.5 : 1;
    this.oneShot = Math.max(0, this.oneShot - m.dt);
    if (m.panic) {
      this.play('fall', 0.1);
    } else if (this.oneShot > 0) {
      // Le coup ou la victoire se jouent jusqu'au bout.
    } else if (!m.grounded) {
      this.celebrating = false;
      // Saut : on saute l'accroupissement (avant l'impulsion), puis chute dès la descente.
      if (m.velY > 0.5) this.play('jump', 0.08, 0.13);
      else this.play('fall', 0.25);
    } else if (m.speed > 0.5) {
      this.celebrating = false;
      this.play('run', 0.12);
      const run = this.actions.get('run');
      if (run) run.timeScale = THREE.MathUtils.clamp(m.speed * 0.195, 0.6, 1.8);
    } else {
      this.play(this.celebrating ? 'celebrate' : 'idle', 0.25);
    }
    this.mixer.update(m.dt);
  }

  react(): void {
    this.play('hit', 0.05);
    this.oneShot = 0.6;
  }

  celebrate(): void {
    this.celebrating = true;
    this.play('celebrate', 0.15);
    this.oneShot = 1.6;
  }
}

/** Version en formes simples (sans fichier) : repli quand le modèle animé n'est pas chargé. */
class ProceduralFigure implements Figure {
  readonly object = new THREE.Group();
  readonly playsReactions = false;
  private readonly legs: THREE.Group[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly scarfTail: THREE.Group;
  private readonly cape: THREE.Mesh;

  constructor(scarfColor: number) {
    const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });
    const cloth = mat(PALETTE.cloth);
    const clothShade = mat(PALETTE.clothShade, { side: THREE.DoubleSide });
    const leather = mat(PALETTE.leather, { roughness: 0.6 });
    const boots = mat(PALETTE.boots, { roughness: 0.6 });
    const gold = mat(PALETTE.gold, { metalness: 0.6, roughness: 0.3, emissive: 0x3a2500 });
    const scarf = mat(scarfColor, { roughness: 0.55 });
    const face = new THREE.MeshStandardMaterial({ color: PALETTE.face, roughness: 0.4 });
    const add = (mesh: THREE.Mesh, parent: THREE.Object3D = this.object, shadow = true) => {
      mesh.castShadow = shadow;
      parent.add(mesh);
      return mesh;
    };
    // Jambes et bottes (pivot à la hanche).
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, 0.36, 0);
      add(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 4, 8), cloth), hip).position.y = -0.14;
      const boot = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), boots), hip);
      boot.scale.set(1, 0.75, 1.35);
      boot.position.set(0, -0.3, 0.03);
      this.legs.push(hip);
      this.object.add(hip);
    }

    // Tunique évasée, ceinture et boucle dorée.
    const tunic = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.5, 14), cloth));
    tunic.position.y = 0.58;
    const belt = add(new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.035, 6, 18), leather));
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.5;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.03), gold)).position.set(0, 0.5, 0.25);
    const panel = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.02), scarf));
    panel.position.set(0, 0.38, 0.27);
    panel.rotation.x = -0.25;

    // Bras (pivot à l'épaule) et gants.
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.24, 0.78, 0);
      add(new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.2, 4, 8), cloth), shoulder).position.y = -0.14;
      add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), leather), shoulder).position.y = -0.3;
      shoulder.rotation.z = side * 0.12;
      this.arms.push(shoulder);
      this.object.add(shoulder);
    }

    // Cape à l'arrière.
    this.cape = add(new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.62, 1, 4), clothShade));
    this.cape.geometry.translate(0, -0.31, 0);
    this.cape.position.set(0, 0.84, -0.2);

    // Écharpe : col + pan qui flotte au vent.
    const collar = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.075, 8, 18), scarf));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.86;
    this.scarfTail = new THREE.Group();
    this.scarfTail.position.set(0.1, 0.86, -0.17);
    const tail = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.025), scarf), this.scarfTail);
    tail.position.y = -0.15;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), gold), this.scarfTail, false).position.y = -0.28;
    this.object.add(this.scarfTail);

    // Tête : capuche reculée, visage sombre en façade bordé par l'ouverture, yeux lumineux.
    const hood = add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), cloth));
    hood.position.set(0, 1.12, -0.06);
    const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 10), cloth));
    tip.position.set(0, 1.4, -0.15);
    tip.rotation.x = -0.75;
    const faceMesh = add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), face), this.object, false);
    faceMesh.scale.set(1, 0.95, 0.45);
    faceMesh.position.set(0, 1.1, 0.17);
    const rim = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 24), cloth), this.object, false);
    rim.position.set(0, 1.1, 0.2);
    for (const side of [-1, 1]) {
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), EYES), this.object, false);
      eye.scale.set(0.8, 1.3, 0.5);
      eye.position.set(side * 0.08, 1.13, 0.255);
    }
  }

  update(m: Motion): void {
    const run = m.grounded && m.speed > 0.5;
    const swing = run ? Math.sin(m.runPhase) * Math.min(1, m.speed / 5) : 0;
    const airborne = !m.grounded;
    this.legs[0].rotation.x = airborne ? -0.5 : swing * 0.9;
    this.legs[1].rotation.x = airborne ? 0.3 : -swing * 0.9;
    this.arms[0].rotation.x = airborne ? -2.4 : -swing * 0.8;
    this.arms[1].rotation.x = airborne ? -2.4 : swing * 0.8;
    this.object.position.y = run ? Math.abs(Math.sin(m.runPhase)) * 0.06 : Math.sin(m.time * 2) * 0.012;

    // Cape et écharpe se soulèvent avec la vitesse, et ondulent.
    const wind = Math.min(1, m.speed / 6) + (airborne ? 0.4 : 0);
    this.cape.rotation.x = 0.1 + wind * 0.9 + Math.sin(m.time * 9) * 0.06 * wind;
    this.scarfTail.rotation.x = 0.2 + wind * 1.2 + Math.sin(m.time * 12) * 0.15 * (0.3 + wind);
    this.scarfTail.rotation.z = Math.sin(m.time * 7) * 0.2 * wind;

    if (m.bump !== null) this.arms[0].rotation.x = this.arms[1].rotation.x = -0.9 * m.bump;
    if (m.panic) {
      // Panique cartoon : bras qui moulinent au-dessus de la tête, jambes qui pédalent dans le vide.
      const f = m.time * 28;
      this.arms[0].rotation.x = -2.5 + Math.sin(f) * 0.7;
      this.arms[1].rotation.x = -2.5 + Math.sin(f + Math.PI) * 0.7;
      this.legs[0].rotation.x = Math.sin(f * 0.9) * 1.1;
      this.legs[1].rotation.x = Math.sin(f * 0.9 + Math.PI) * 1.1;
    }
  }

  react(): void {}

  celebrate(): void {}
}

/** Cocon de bandelettes (momie) : capsule enveloppée, deux yeux lumineux qui dépassent. Créé à la première capture. */
function buildCocoon(): THREE.Group {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ map: bandageTexture(), roughness: 0.95 });
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 6, 14), cloth);
  shell.position.y = 0.72;
  shell.castShadow = true;
  group.add(shell);
  const eyes = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.3, 0.3) });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), eyes);
    eye.scale.set(0.8, 1.3, 0.5);
    eye.position.set(side * 0.09, 1.12, 0.32);
    group.add(eye);
  }
  return group;
}

/** Trois étoiles dorées en orbite au-dessus de la tête (étourdi). */
function buildStars(): THREE.Group {
  const group = new THREE.Group();
  group.position.y = 1.55;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffe04a';
  g.strokeStyle = '#a86a00';
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 28 : 12;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.stroke();
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const star = new THREE.Sprite(material);
    const a = (i / 3) * Math.PI * 2;
    star.position.set(Math.cos(a) * 0.38, Math.sin(a * 2) * 0.06, Math.sin(a) * 0.38);
    star.scale.setScalar(0.24);
    group.add(star);
  }
  group.visible = false;
  return group;
}

