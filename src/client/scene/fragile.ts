import * as THREE from 'three';
import type { Box, Vec3 } from '../../core';
import type { SfxName } from '../audio/sfx';
import { burst, type Tweens } from './fx';
import { crackedTileTexture } from './textures';
import { BODY_RADIUS } from '../physics';

/** Délai entre le premier pas sur une dalle fragile et son effondrement : trop court pour la traverser en courant. */
const CRUMBLE_DELAY = 0.25;
const FALL_TIME = 0.5;
/** Temps avant que la dalle se reforme. */
const RESPAWN_TIME = 4;

interface Tile {
  box: Box;
  center: THREE.Vector3;
  size: THREE.Vector3;
  state: 'idle' | 'shaking' | 'falling' | 'gone' | 'rising';
  timer: number;
}

/**
 * Dalles fragiles : fissurées (lisibles), elles tremblent quand on marche dessus puis s'effondrent,
 * ouvrant un trou pendant quelques secondes. Un seul InstancedMesh pour toutes les dalles.
 */
export class FragileTiles {
  private readonly tiles: Tile[];
  private readonly mesh: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();

  constructor(
    colliders: Box[],
    color: string,
    private readonly scene: THREE.Scene,
    private readonly tweens: Tweens,
  ) {
    this.tiles = colliders
      .filter((box) => box.kind === 'fragile')
      .map((box) => ({
        box,
        center: new THREE.Vector3(...box.min.map((v, i) => (v + box.max[i]) / 2)),
        size: new THREE.Vector3(...box.max.map((v, i) => v - box.min[i])),
        state: 'idle' as const,
        timer: 0,
      }));
    const material = new THREE.MeshStandardMaterial({ map: crackedTileTexture(color, 5), roughness: 0.95 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, Math.max(1, this.tiles.length));
    this.mesh.count = this.tiles.length;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.tiles.forEach((tile, i) => this.place(i, tile.center, 1));
    scene.add(this.mesh);
  }

  /** À appeler à chaque image de jeu, avec la position du joueur. */
  update(dt: number, body: { pos: Vec3; grounded: boolean }, play: (name: SfxName) => void): void {
    this.tiles.forEach((tile, i) => {
      tile.timer -= dt;
      switch (tile.state) {
        case 'idle':
          if (body.grounded && this.touches(tile, body.pos, 0.05)) {
            tile.state = 'shaking';
            tile.timer = CRUMBLE_DELAY;
            play('crack');
          }
          break;
        case 'shaking': {
          const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.08, -0.03, (Math.random() - 0.5) * 0.08);
          this.place(i, tile.center.clone().add(jitter), 1);
          if (tile.timer <= 0) {
            tile.box.off = true;
            tile.state = 'falling';
            tile.timer = FALL_TIME;
            play('crumble');
            burst(this.scene, this.tweens, tile.center.clone(), 0xc9a774, 14, 2.5, 1.5);
          }
          break;
        }
        case 'falling': {
          const t = 1 - Math.max(0, tile.timer) / FALL_TIME;
          this.place(i, tile.center.clone().add(new THREE.Vector3(0, -t * t * 3, 0)), 1 - t);
          if (tile.timer <= 0) {
            tile.state = 'gone';
            tile.timer = RESPAWN_TIME;
          }
          break;
        }
        case 'gone':
          // Ne se reforme jamais sur le joueur.
          if (tile.timer <= 0 && !this.touches(tile, body.pos, 2.5)) {
            tile.state = 'rising';
            tile.timer = 0.3;
          }
          break;
        case 'rising': {
          const t = 1 - Math.max(0, tile.timer) / 0.3;
          this.place(i, tile.center, t);
          if (tile.timer <= 0) {
            tile.box.off = false;
            tile.state = 'idle';
          }
          break;
        }
      }
    });
  }

  /** Le joueur est-il au-dessus de la dalle (à `height` près sous ses pieds) ? */
  private touches(tile: Tile, p: Vec3, height: number): boolean {
    const { min, max } = tile.box;
    return (
      p.x + BODY_RADIUS > min[0] && p.x - BODY_RADIUS < max[0] && p.z + BODY_RADIUS > min[2] && p.z - BODY_RADIUS < max[2] && Math.abs(p.y - max[1]) < height
    );
  }

  private place(i: number, position: THREE.Vector3, scale: number): void {
    const s = this.tiles[i].size;
    this.matrix.compose(position, this.quaternion, new THREE.Vector3(s.x * scale, s.y * scale, s.z * scale));
    this.mesh.setMatrixAt(i, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
