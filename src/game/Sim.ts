import type { SimInput, SimState } from '../types';
import { createShooter, stepShooter } from './Player';

/** Creates the state for a fresh level. */
export function createSim(): SimState {
  return { version: 1, tick: 0, shooter: createShooter() };
}

/** Advances the simulation by exactly one fixed tick (SIM_DT seconds). */
export function stepSim(sim: SimState, input: SimInput): void {
  sim.tick++;
  stepShooter(sim.shooter, input);
}
