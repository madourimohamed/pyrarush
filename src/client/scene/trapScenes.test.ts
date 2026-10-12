import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { doorFront, floorY, generateLayout } from '../../core';
import { levels } from '../../levels';
import type { FollowCamera } from '../camera';
import { Tweens } from './fx';
import type { TrapGuardian } from './guardians';
import { createTrapScene, trapLanding, type TrapSceneContext } from './trapScenes';

// Les textures (étoiles, bandelettes, onomatopées) sont dessinées dans des canvas : un faux canvas suffit ici.
beforeAll(() => {
  const ctx2d = new Proxy({}, { get: (_t, key) => (key === 'measureText' ? () => ({ width: 0 }) : () => {}) });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) });
});

const config = levels[0].config;
const layout = generateLayout(config, 3);
const door = layout.doorsByFloor[3][0];

async function makeContext(style: 'glove' | 'mummy', duration: number) {
  const { Character } = await import('./character');
  const character = new Character();
  const front = doorFront(config, door);
  character.root.position.set(front.x, front.y, front.z);
  const doorObject = new THREE.Object3D();
  doorObject.position.set(front.x, front.y + 1.1, front.z);
  const guardian = { style, cue: 'spring', root: new THREE.Group(), strike: vi.fn(), lunge: vi.fn() } as unknown as TrapGuardian;
  const camera = { closeUp: 0, shake: vi.fn() } as unknown as FollowCamera;
  const ctx: TrapSceneContext = {
    scene: new THREE.Scene(),
    tweens: new Tweens(),
    character,
    guardian,
    door: doorObject,
    shakeDoor: vi.fn(),
    openDoor: vi.fn(),
    start: character.root.position.clone(),
    target: trapLanding(config, door, 3, 2),
    big: false,
    duration,
    camera,
    sound: vi.fn(),
  };
  return { ctx, character, camera, guardian };
}

describe('scènes de piège', () => {
  it('le joueur atterrit à l’étage inférieur devant une porte, ou est repoussé au même étage', () => {
    expect(trapLanding(config, door, 3, 2).y).toBeCloseTo(floorY(2));
    const same = trapLanding(config, door, 1, 1);
    expect(same.y).toBeCloseTo(doorFront(config, door).y);
  });

  /** Joue une scène image par image jusqu'à sa fin ; renvoie ce qu'on a observé en route. */
  function run(scene: ReturnType<typeof createTrapScene>, character: { root: THREE.Object3D }, limit: number) {
    let t = 0;
    let hidden = false;
    let maxHeight = -Infinity;
    while (!scene.update(1 / 60) && t < limit) {
      t += 1 / 60;
      hidden ||= !character.root.visible;
      maxHeight = Math.max(maxHeight, character.root.position.y);
    }
    return { t: t + 1 / 60, hidden, maxHeight };
  }

  for (const style of ['glove', 'mummy'] as const) {
    for (const duration of [3, 2]) {
      it(`${style} en ${duration} s : gros plan puis caméra rendue, joueur posé à l'arrivée`, async () => {
        const { ctx, character, camera } = await makeContext(style, duration);
        const seen = run(createTrapScene(ctx), character, duration + 1);
        expect(seen.t).toBeCloseTo(duration, 1);
        expect(character.root.position.distanceTo(new THREE.Vector3(ctx.target.x, ctx.target.y, ctx.target.z))).toBeLessThan(1e-6);
        expect(character.root.visible).toBe(true);
        expect(character.panic).toBe(false);
        expect(camera.closeUp).toBe(0);
        expect(camera.shake).toHaveBeenCalled();
        if (style === 'glove') expect(seen.maxHeight).toBeGreaterThan(ctx.start.y + 7); // propulsé très haut
        if (style === 'mummy') expect(seen.hidden).toBe(true); // tiré dans la porte
      });
    }

    it(`${style} : interrompue en pleine action (fin de partie, déconnexion), la scène finit proprement`, async () => {
      const { ctx, character, camera } = await makeContext(style, 3);
      const scene = createTrapScene(ctx);
      for (let i = 0; i < 70; i++) scene.update(1 / 60); // en plein vol, ou dans la porte
      expect(camera.closeUp).toBe(1);
      scene.finish();
      scene.finish(); // sans danger deux fois
      expect(scene.update(1 / 60)).toBe(true);
      expect(character.root.visible).toBe(true);
      expect(character.root.scale.x).toBe(1);
      expect(character.root.position.y).toBeCloseTo(ctx.target.y);
      expect(camera.closeUp).toBe(0);
    });
  }
});

