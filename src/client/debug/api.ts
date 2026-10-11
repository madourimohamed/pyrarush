import * as THREE from 'three';
import { doorTangent } from '../../core';
import type { GameSession } from '../session';
import type { PerfStats, StatsSnapshot } from './stats';

/** Vues de référence (bible graphique § 12.2), toujours cadrées de la même façon pour comparer avant/après. */
export const REFERENCE_VIEWS = ['play', 'door', 'terrace', 'aerial'] as const;
export type ReferenceView = (typeof REFERENCE_VIEWS)[number];

interface Deps {
  session(): GameSession | null;
  startLevel(levelNumber: number, seed: number): Promise<void>;
  setFrozen(frozen: boolean): void;
  stats: PerfStats;
}

export interface DebugApi {
  session(): GameSession | null;
  startLevel(levelNumber: number, seed: number): Promise<void>;
  /** Fige la simulation (le rendu continue) pour des captures stables. */
  freeze(): void;
  unfreeze(): void;
  /** Avance la simulation d'un nombre d'images (pendant le gel). */
  step(frames: number): void;
  view(name: ReferenceView): void;
  stats(): StatsSnapshot;
  timings(): Record<string, number>;
}

/**
 * Outils de mesure, exposés dans window.__debug (en développement ou avec ?debug=1).
 * Utilisés par tools/capture-reference.mjs.
 */
export function installDebugApi(deps: Deps): DebugApi {
  const current = () => {
    const s = deps.session();
    if (!s) throw new Error('Aucune partie en cours');
    return s;
  };
  const step = (frames: number) => {
    const s = current();
    for (let i = 0; i < frames; i++) s.frame(1 / 30);
  };
  const api: DebugApi = {
    session: deps.session,
    startLevel: deps.startLevel,
    freeze: () => deps.setFrozen(true),
    unfreeze: () => deps.setFrozen(false),
    step,
    view(name) {
      const s = current();
      s.camera.zoom = name === 'aerial' ? 2 : 0;
      s.debugPlace(name === 'terrace' ? 3 : 1, 0);
      step(name === 'aerial' ? 150 : 90);
      if (name === 'door') frameDoor(s);
    },
    stats: () => deps.stats.snapshot(),
    timings: () =>
      Object.fromEntries(performance.getEntriesByType('measure').filter((m) => m.name.startsWith('pyrarush:')).map((m) => [m.name, Math.round(m.duration)])),
  };
  (window as unknown as { __debug: DebugApi }).__debug = api;
  return api;
}

/** Gros plan de la porte la plus proche du centre de la façade sud, au premier étage. */
function frameDoor(s: GameSession): void {
  const { layout, config } = s.game;
  const door = layout.doorsByFloor[1]
    .filter((d) => d.side === 0)
    .reduce((best, d) => (Math.abs(doorTangent(config, 1, d.slot)) < Math.abs(doorTangent(config, 1, best.slot)) ? d : best));
  const t = s.world.doors.transform(door.id)!;
  const out = new THREE.Vector3(Math.sin(t.rotation.y), 0, Math.cos(t.rotation.y));
  const right = new THREE.Vector3(out.z, 0, -out.x);
  const camera = s.camera.camera;
  camera.position.copy(t.position).addScaledVector(out, 3.6).addScaledVector(right, 1.3).add(new THREE.Vector3(0, 0.5, 0));
  camera.lookAt(t.position.clone().add(new THREE.Vector3(0, 0.1, 0)));
}
