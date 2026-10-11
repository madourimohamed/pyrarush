import * as THREE from 'three';

/** Petit personnage « haricot » fait de formes simples. */
export class Character {
  readonly root = new THREE.Group();
  /** Partie animée (écrasement, rotation) ; root porte la position. */
  readonly body = new THREE.Group();
  private readonly feet: THREE.Mesh[] = [];
  private facing = 0;
  private runPhase = 0;
  private squash = 0;
  private readonly marker: THREE.Mesh;
  private markerTime = 0;

  constructor(color: number) {
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23233a, roughness: 0.5 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x1a1d33, roughness: 0.15, metalness: 0.6 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3) });

    const bean = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.62, 4, 12), bodyMat);
    bean.position.y = 0.92;
    bean.castShadow = true;
    this.body.add(bean);

    const visor = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.32, 4, 10), visorMat);
    visor.rotation.z = Math.PI / 2;
    visor.position.set(0, 1.18, 0.27);
    visor.scale.set(1, 1, 0.75);
    this.body.add(visor);
    for (const x of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat);
      eye.scale.set(1, 1.3, 0.5);
      eye.position.set(x, 1.19, 0.37);
      this.body.add(eye);
    }
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.31, 0.05, 6, 20),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.6, roughness: 0.3, emissive: 0x3a2500 }),
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.42;
    this.body.add(band);
    for (const x of [-0.17, 0.17]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), dark);
      foot.scale.set(1, 0.7, 1.3);
      foot.position.set(x, 0.12, 0);
      foot.castShadow = true;
      this.feet.push(foot);
      this.body.add(foot);
    }
    this.root.add(this.body);

    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.7, 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.15) }),
    );
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    this.root.add(this.marker);
  }

  /** Flèche de repérage : invisible de près, de plus en plus grande quand la caméra s'éloigne (zoom 0 → 2). */
  setMarker(zoom: number): void {
    this.markerTime += 1 / 60;
    this.marker.visible = zoom > 0.4;
    const s = 1 + zoom * 1.2;
    this.marker.scale.setScalar(s);
    this.marker.position.y = 2.2 + s * 0.4 + Math.sin(this.markerTime * 5) * 0.15;
    this.marker.rotation.y += 0.04;
  }

  /** Animation procédurale selon la vitesse et l'état au sol. */
  animate(dt: number, velX: number, velZ: number, velY: number, grounded: boolean): void {
    const speed = Math.hypot(velX, velZ);
    if (speed > 0.5) {
      const target = Math.atan2(velX, velZ);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-14 * dt));
    }
    this.root.rotation.y = this.facing;

    if (grounded && speed > 0.5) {
      this.runPhase += dt * speed * 2.2;
      this.feet[0].position.z = Math.sin(this.runPhase) * 0.2;
      this.feet[1].position.z = -Math.sin(this.runPhase) * 0.2;
      this.body.position.y = Math.abs(Math.sin(this.runPhase)) * 0.08;
    } else {
      this.feet[0].position.z = this.feet[1].position.z = 0;
      this.body.position.y = 0;
    }

    this.squash *= Math.exp(-10 * dt);
    const stretch = grounded ? 0 : THREE.MathUtils.clamp(velY * 0.015, -0.12, 0.15);
    const s = 1 - this.squash + stretch;
    this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
  }

  land(impact: number): void {
    this.squash = THREE.MathUtils.clamp(impact * 0.02, 0.05, 0.35);
  }

  faceTowards(x: number, z: number): void {
    this.facing = Math.atan2(x, z);
  }
}
