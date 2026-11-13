import type { Powerup, SimState } from '../types';
import { addClones, formationRadius } from './Clone';
import {
  CLONE_BOX_AMOUNTS,
  CLONE_BOX_WEIGHTS,
  DROP_CLONE_1,
  DROP_CLONE_50,
  DROP_LASER,
  DROP_MINIGUN,
  DROP_ROCKET,
  DROP_TANK,
  DROP_WEIGHTS,
  PICKUP_MARGIN,
  POWERUP_SPEED,
  POWERUP_WIDTH,
  SHOOTER_Y,
  SIM_DT,
  WINDOW_ROWS,
} from './constants';
import { FX_PICKUP, spawnFx } from './Fx';
import { poolAlloc, poolFree } from './Pool';
import { nextRandom } from './rng';

export function makePowerup(): Powerup {
  return { active: false, kind: 0, x: 0, y: 0, prevY: 0 };
}

/** True for the four clone boxes (+1, +3, +10, +50). */
export const isCloneBox = (kind: number): boolean => kind >= DROP_CLONE_1 && kind <= DROP_CLONE_50;

/** Picks an index from a weight table with the seeded PRNG. */
function pickWeighted(sim: SimState, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let roll = nextRandom(sim) * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

const DROP_TABLE: readonly number[] = [
  DROP_WEIGHTS.cloneBox,
  DROP_WEIGHTS.minigun,
  DROP_WEIGHTS.rocket,
  DROP_WEIGHTS.laser,
  DROP_WEIGHTS.tank,
];
const DROP_TABLE_CODES: readonly number[] = [0, DROP_MINIGUN, DROP_ROCKET, DROP_LASER, DROP_TANK];

/** B4: rolls a random drop code. A clone box is then rolled on its own weighted table. */
export function rollDrop(sim: SimState): number {
  const pick = pickWeighted(sim, DROP_TABLE);
  if (pick > 0) return DROP_TABLE_CODES[pick];
  return DROP_CLONE_1 + pickWeighted(sim, CLONE_BOX_WEIGHTS);
}

/**
 * The clone box a drop code stands for.
 *
 * Only clone boxes exist so far. The weapon powerups (codes P5-P8) arrive with
 * milestone M5; until then a weapon code counts as a clone box, rolled on the
 * clone-box weights, so a broken gate is never empty-handed.
 */
function asCloneBox(sim: SimState, kind: number): number {
  return isCloneBox(kind) ? kind : DROP_CLONE_1 + pickWeighted(sim, CLONE_BOX_WEIGHTS);
}

/** Number of clones a drop code is worth. */
export function rewardAmount(sim: SimState, kind: number): number {
  return CLONE_BOX_AMOUNTS[asCloneBox(sim, kind) - DROP_CLONE_1];
}

/** Drops a falling box where a fat rat died. */
export function spawnDrop(sim: SimState, kind: number, x: number, y: number): void {
  const index = poolAlloc(sim.powerups);
  if (index < 0) return;
  const p = sim.powerups.items[index];
  p.kind = asCloneBox(sim, kind);
  p.x = x;
  p.y = y;
  p.prevY = y;
}

/**
 * Boxes fall towards the goal line (B8). B9: a box is picked up when it
 * overlaps the formation. Boxes are wide, so the test is the formation's
 * circle against the box's width. A box that
 * reaches the goal line is lost.
 */
export function stepPowerups(sim: SimState): void {
  const { items } = sim.powerups;
  for (let i = sim.powerups.high - 1; i >= 0; i--) {
    const p = items[i];
    if (!p.active) continue;
    p.prevY = p.y;
    p.y += POWERUP_SPEED * SIM_DT;

    const radius = formationRadius(sim.clones);
    const dx = Math.abs(p.x - sim.shooter.x);
    const dy = Math.abs(p.y - SHOOTER_Y);
    if (dx <= radius + POWERUP_WIDTH / 2 && dy <= radius + PICKUP_MARGIN) {
      const amount = CLONE_BOX_AMOUNTS[p.kind - DROP_CLONE_1];
      addClones(sim, amount);
      spawnFx(sim, FX_PICKUP, p.x, p.y, amount);
      poolFree(sim.powerups, i);
    } else if (p.y >= WINDOW_ROWS) {
      poolFree(sim.powerups, i);
    }
  }
}
