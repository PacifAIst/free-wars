import type { MapData, SimInput, SimState } from '../types';
import { SpatialHash } from './Collision';
import { POOL_ENEMIES } from './constants';
import { stepEnemies } from './Enemy';
import { stepFx } from './Fx';
import { stepShooter } from './Player';
import { fireShooter, stepBullets } from './Projectile';
import { createWorld, type PoolCapacities, streamRows } from './World';

/** Working data that is rebuilt from the sim state and never serialised. */
export interface SimScratch {
  hash: SpatialHash;
}

export function createScratch(enemyCapacity: number = POOL_ENEMIES): SimScratch {
  return { hash: new SpatialHash(enemyCapacity) };
}

/** Creates the state for a fresh run of `map`. The same seed gives the same run. */
export function createSim(map: MapData, seed: number, capacities?: Readonly<PoolCapacities>): SimState {
  return createWorld(map, seed, capacities);
}

/**
 * Advances the simulation by exactly one fixed tick (SIM_DT seconds).
 * Deterministic: the result depends only on `sim`, `map` and `input`.
 */
export function stepSim(sim: SimState, map: MapData, input: SimInput, scratch: SimScratch): void {
  if (sim.phase !== 'playing') return;
  sim.tick++;

  stepShooter(sim.shooter, input);
  stepEnemies(sim);
  streamRows(sim, map);
  fireShooter(sim);
  scratch.hash.build(sim.enemies);
  stepBullets(sim, scratch.hash);
  stepFx(sim);

  // D5: the level is won when the file has ended and no enemy is left.
  if (sim.phase === 'playing' && sim.nextRow >= sim.totalRows && sim.enemies.live === 0) {
    sim.phase = 'won';
  }
}
