// All randomness in the simulation comes from the run's seed (PLAN section 4):
// a sequential generator whose state lives in the sim state, and a stateless
// hash for values that must be the same wherever they are asked for.

/** Advances the PRNG (mulberry32) and returns a float in [0, 1). */
export function nextRandom(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Hash of (seed, row, column) as an unsigned 32-bit integer. Used for `ER`
 * cells, so the spawned enemy and its preview above the window always agree
 * and do not depend on the order in which cells are visited.
 */
export function cellHash(seed: number, row: number, col: number): number {
  let h = (seed ^ Math.imul(row + 1, 0x9e3779b1) ^ Math.imul(col + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
