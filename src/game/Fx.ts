import type { Fx, SimState } from '../types';
import { FX_BURST_SECONDS, FX_PICKUP_SECONDS, FX_PUFF_SECONDS, HIT_FLASH_SECONDS, SIM_DT } from './constants';
import { poolAlloc, poolFree } from './Pool';

// Effect kinds. Effects are cosmetic: nothing in the simulation reads them back.
/** A bullet hit that did not kill. */
export const FX_HIT = 0;
/** An enemy died. `tag` is its type. */
export const FX_KILL = 1;
/** An enemy reached the goal line. */
export const FX_BASE = 2;
/** A cat was killed. */
export const FX_CAT = 3;
/** A falling box was caught, or a tank bubble popped. `size` is the clones gained, `tag` the drop code. */
export const FX_PICKUP = 4;
/** A panel on a rail was collected. `size` is the clones gained, `tag` the drop code. */
export const FX_GATE = 5;
/** A big rat's punch landed. `size` is the number of cats it killed, `tag` the rat's type. */
export const FX_PUNCH = 6;
/**
 * A rocket exploded. `size` is the side of the square it covers. `tag`: 0 a cat's rocket, 1 a tank
 * rocket, 2 an enemy rocket that reached the swarm, 3 an enemy rocket shot down.
 */
export const FX_BLAST = 7;
/** The laser fires. */
export const FX_LASER = 8;
/** The tank rolls out (`tag` 1) or is used up (`tag` 0). */
export const FX_TANK = 9;
/** A bomb went off. `size` is the number of units it killed. */
export const FX_BOMB = 10;

const LIFE: readonly number[] = [
  HIT_FLASH_SECONDS * 2,
  FX_PUFF_SECONDS,
  FX_BURST_SECONDS,
  FX_PUFF_SECONDS,
  FX_PICKUP_SECONDS,
  FX_PICKUP_SECONDS,
  FX_PUFF_SECONDS,
  FX_PUFF_SECONDS,
  FX_PUFF_SECONDS,
  FX_PUFF_SECONDS,
  FX_PUFF_SECONDS,
];

export function makeFx(): Fx {
  return { active: false, id: 0, kind: 0, x: 0, y: 0, age: 0, life: 0, size: 0, tag: 0 };
}

/** Starts an effect. Silently does nothing when the pool is full. */
export function spawnFx(sim: SimState, kind: number, x: number, y: number, size: number, tag = 0): void {
  const index = poolAlloc(sim.fx);
  if (index < 0) return;
  const fx = sim.fx.items[index];
  fx.id = ++sim.fxCount;
  fx.kind = kind;
  fx.x = x;
  fx.y = y;
  fx.age = 0;
  fx.life = LIFE[kind];
  fx.size = size;
  fx.tag = tag;
}

export function stepFx(sim: SimState): void {
  const { items } = sim.fx;
  for (let i = sim.fx.high - 1; i >= 0; i--) {
    const fx = items[i];
    if (!fx.active) continue;
    fx.age += SIM_DT;
    if (fx.age >= fx.life) poolFree(sim.fx, i);
  }
}
