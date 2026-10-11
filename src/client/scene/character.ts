import * as THREE from 'three';

/** Couleurs de l'explorateur ; l'écharpe varie d'un joueur à l'autre (multijoueur). */
const PALETTE = {
  cloth: 0xf3ece0,
  clothShade: 0xe0d6c4,
  face: 0x17131f,
  leather: 0x6a4428,
  boots: 0x4a2e1a,
  gold: 0xe0b040,
};

/**
 * L'explorateur encapuchonné : capuche blanche, visage sombre aux yeux lumineux, écharpe, tunique, cape.
 * Construit uniquement à partir de formes simples (léger sur mobile), animé de façon procédurale.
 */
export class Character {
  readonly root = new THREE.Group();
  /** Partie animée (écrasement, rotation) ; root porte la position. */
  readonly body = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly scarfTail: THREE.Group;
  private readonly cape: THREE.Mesh;
  private readonly marker: THREE.Mesh;
  private facing = 0;
  private runPhase = 0;
  private squash = 0;
  private time = 0;
  /** Réaction en cours (se cogner contre un mur…), jouée par-dessus l'animation de course. */
  private pose: { kind: 'bump'; t: number; duration: number } | null = null;

  constructor(scarfColor = 0x2f5fb0) {
    const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });
    const cloth = mat(PALETTE.cloth);
    const clothShade = mat(PALETTE.clothShade, { side: THREE.DoubleSide });
    const leather = mat(PALETTE.leather, { roughness: 0.6 });
    const boots = mat(PALETTE.boots, { roughness: 0.6 });
    const gold = mat(PALETTE.gold, { metalness: 0.6, roughness: 0.3, emissive: 0x3a2500 });
    const scarf = mat(scarfColor, { roughness: 0.55 });
    const face = new THREE.MeshStandardMaterial({ color: PALETTE.face, roughness: 0.4 });
    const eyes = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.3, 0.3) });
    const add = (mesh: THREE.Mesh, parent: THREE.Object3D = this.body, shadow = true) => {
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
      this.body.add(hip);
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
      this.body.add(shoulder);
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
    this.body.add(this.scarfTail);

    // Tête : capuche reculée, visage sombre en façade bordé par l'ouverture, yeux lumineux.
    const hood = add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), cloth));
    hood.position.set(0, 1.12, -0.06);
    const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 10), cloth));
    tip.position.set(0, 1.4, -0.15);
    tip.rotation.x = -0.75;
    const faceMesh = add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), face), this.body, false);
    faceMesh.scale.set(1, 0.95, 0.45);
    faceMesh.position.set(0, 1.1, 0.17);
    const rim = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 24), cloth), this.body, false);
    rim.position.set(0, 1.1, 0.2);
    for (const side of [-1, 1]) {
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), eyes), this.body, false);
      eye.scale.set(0.8, 1.3, 0.5);
      eye.position.set(side * 0.08, 1.13, 0.255);
    }
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

  /** Animation procédurale selon la vitesse et l'état au sol. */
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

    const run = grounded && speed > 0.5;
    if (run) this.runPhase += dt * speed * 2.3;
    const swing = run ? Math.sin(this.runPhase) * Math.min(1, speed / 5) : 0;
    const airborne = !grounded;
    this.legs[0].rotation.x = airborne ? -0.5 : swing * 0.9;
    this.legs[1].rotation.x = airborne ? 0.3 : -swing * 0.9;
    this.arms[0].rotation.x = airborne ? -2.4 : -swing * 0.8;
    this.arms[1].rotation.x = airborne ? -2.4 : swing * 0.8;
    this.body.position.y = run ? Math.abs(Math.sin(this.runPhase)) * 0.06 : Math.sin(this.time * 2) * 0.012;

    // Cape et écharpe se soulèvent avec la vitesse, et ondulent.
    const wind = Math.min(1, speed / 6) + (airborne ? 0.4 : 0);
    this.cape.rotation.x = 0.1 + wind * 0.9 + Math.sin(this.time * 9) * 0.06 * wind;
    this.scarfTail.rotation.x = 0.2 + wind * 1.2 + Math.sin(this.time * 12) * 0.15 * (0.3 + wind);
    this.scarfTail.rotation.z = Math.sin(this.time * 7) * 0.2 * wind;

    if (this.pose) {
      this.pose.t += dt;
      const p = this.pose.t / this.pose.duration;
      if (p >= 1) {
        this.pose = null;
        this.body.rotation.set(0, 0, 0);
      } else {
        const k = Math.sin(p * Math.PI);
        this.body.rotation.x = -0.35 * k;
        this.body.rotation.z = Math.sin(p * Math.PI * 6) * 0.12 * (1 - p);
        this.arms[0].rotation.x = this.arms[1].rotation.x = -0.9 * k;
      }
    }

    this.squash *= Math.exp(-10 * dt);
    const stretch = grounded ? 0 : THREE.MathUtils.clamp(velY * 0.015, -0.12, 0.15);
    const s = 1 - this.squash + stretch;
    this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
  }

  /** Petite réaction expressive : « bump » = se cogne contre un mur et recule, tête qui secoue. */
  react(kind: 'bump'): void {
    this.pose = { kind, t: 0, duration: 0.55 };
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
