import type { SimState, Wall } from '../types';
import {
  COLS,
  GATE_TYPE,
  HIT_FLASH_SECONDS,
  RAIL_LEFT_X,
  RAIL_RIGHT_X,
  RAIL_WIDTH,
  WALL_DEPTH,
  WALL_GAP,
  WALL_Y,
} from './constants';
import { FX_HIT, FX_WALL, spawnFx } from './Fx';

// Brick walls (decision A37). A map may put a wall across either rail. It
// stands still, a little up the lane from the swarm, from the first moment of
// the level. The panels that come down its rail stop behind it and queue up.
// Shots wear it down; when it breaks, everything it held comes down together.

export function makeWall(hp: number): Wall {
  return { hp, maxHp: hp, flash: 0, cast: 0 };
}

/** Lane x of the middle of the rail on `side` (0 left, 1 right). */
export const wallX = (side: number): number => (side === 0 ? RAIL_LEFT_X : RAIL_RIGHT_X);

/** The side whose standing wall contains the point, or -1. */
export function wallAt(sim: SimState, x: number, y: number): number {
  if (Math.abs(y - WALL_Y) >= WALL_DEPTH / 2) return -1;
  const side = x < 0 && x >= -RAIL_WIDTH ? 0 : x > COLS && x <= COLS + RAIL_WIDTH ? 1 : -1;
  return side >= 0 && sim.walls[side].hp > 0 ? side : -1;
}

/** A shot hits the wall on `side` at lane x `x`. Returns true if the wall broke. */
export function damageWall(sim: SimState, side: number, amount: number, x: number): boolean {
  const wall = sim.walls[side];
  if (wall.hp <= 0) return false;
  wall.hp -= amount;
  if (wall.hp > 0) {
    wall.flash = HIT_FLASH_SECONDS;
    spawnFx(sim, FX_HIT, x, WALL_Y + WALL_DEPTH / 2, 1);
    return false;
  }
  wall.hp = 0;
  spawnFx(sim, FX_WALL, wallX(side), WALL_Y, 1, side);
  return true;
}

/** Damages every standing wall that a square of half-side `half` round (x, y) reaches. */
export function blastWalls(sim: SimState, x: number, y: number, half: number, amount: number): void {
  if (Math.abs(y - WALL_Y) >= half + WALL_DEPTH / 2) return;
  for (let side = 0; side < 2; side++) {
    if (Math.abs(x - wallX(side)) < half + RAIL_WIDTH / 2) damageWall(sim, side, amount, wallX(side));
  }
}

/** Scratch list of the panels queued on one rail. Not part of the sim state. */
const queue = new Int32Array(128);

/**
 * Stops the panels behind each standing wall. The first one stops at the
 * wall; each later one stops behind the one before it. Call after the panels
 * have moved.
 */
export function holdGates(sim: SimState): void {
  const { items, high } = sim.enemies;
  for (let side = 0; side < 2; side++) {
    const wall = sim.walls[side];
    if (wall.flash > 0) wall.flash -= 1 / 60;
    if (wall.hp <= 0) continue;
    // The panels of this rail that are still up the lane from the wall, nearest the wall first.
    let count = 0;
    for (let i = 0; i < high && count < queue.length; i++) {
      const e = items[i];
      if (!e.active || e.type !== GATE_TYPE || e.y >= WALL_Y || e.x < 0 !== (side === 0)) continue;
      let at = count++;
      while (at > 0 && items[queue[at - 1]].y < e.y) {
        queue[at] = queue[at - 1];
        at--;
      }
      queue[at] = i;
    }
    let limit = WALL_Y - WALL_DEPTH / 2 - WALL_GAP;
    for (let n = 0; n < count; n++) {
      const e = items[queue[n]];
      if (e.y + e.h / 2 > limit) e.y = limit - e.h / 2;
      limit = e.y - e.h / 2 - WALL_GAP;
    }
  }
}

/** True when a panel is waiting behind a standing wall: it will never arrive on its own. */
export function isHeld(sim: SimState, x: number, y: number): boolean {
  return y < WALL_Y && sim.walls[x < 0 ? 0 : 1].hp > 0;
}
