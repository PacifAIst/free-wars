import { cellSpec } from '../parsers/tokens';
import type { MapData } from '../types';
import { BIG_ENEMY_MIN_TYPE, COLS, ENEMY_STATS, RANDOM_MINION_TYPES } from './constants';
import { cellHash } from './rng';

/**
 * Where everything in a map actually stands, after footprints are taken into
 * account (decision A21). Enemies never overlap: a big enemy claims every cell
 * of its footprint, and nothing else may stand there.
 *
 *  - A big enemy keeps the cell of its token as the front-left corner of its
 *    footprint (D11). If that span is taken, or would leave the lane, it moves
 *    to the nearest free span in the same row; if the row has none it is left out.
 *  - A minion whose cell is already claimed is left out.
 *  - A gate token does not stand in the lane at all. A token in one of the left
 *    edge columns puts a gate on the left rail for that row, and likewise on
 *    the right (decision A29). One gate per rail and row.
 */
export interface MapLayout {
  /** Enemy type 1..8 at the front-left cell of each placed enemy, 0 elsewhere. Row-major. */
  type: Uint8Array;
  /** For a placed enemy, the column of the token it came from (for its HP override and drop). */
  source: Uint8Array;
  /** Per row: column of the gate token for the left rail, plus one; 0 for no gate. */
  gateLeft: Uint8Array;
  /** Per row: column of the gate token for the right rail, plus one; 0 for no gate. */
  gateRight: Uint8Array;
  /** Tokens that could not be placed. */
  dropped: number;
}

/**
 * Enemy type (1..8) that the token in grid cell (`row`, `col`) stands for, or 0
 * for an empty cell or a gate. `ER` is resolved from the seed, so the answer is
 * the same whenever and wherever it is asked.
 */
export function enemyTypeAt(map: MapData, seed: number, row: number, col: number): number {
  const spec = cellSpec(map, map.cells[row * COLS + col]);
  if (spec.kind === 'enemy') return spec.type;
  if (spec.kind === 'random') return 1 + (cellHash(seed, row, col) % RANDOM_MINION_TYPES);
  return 0;
}

function resolve(map: MapData, seed: number): MapLayout {
  const type = new Uint8Array(map.rows * COLS);
  const source = new Uint8Array(map.rows * COLS);
  const gateLeft = new Uint8Array(map.rows);
  const gateRight = new Uint8Array(map.rows);
  /** For each column, the first row that is free again. */
  const freeFrom = new Int32Array(COLS);
  let dropped = 0;

  const spanFree = (left: number, width: number, row: number): boolean => {
    for (let c = left; c < left + width; c++) if (freeFrom[c] > row) return false;
    return true;
  };

  for (let r = 0; r < map.rows; r++) {
    const base = r * COLS;

    // Big enemies first: they claim their whole footprint.
    for (let c = 0; c < COLS; c++) {
      const t = enemyTypeAt(map, seed, r, c);
      if (t < BIG_ENEMY_MIN_TYPE) continue;
      const { w, h } = ENEMY_STATS[t];
      const wanted = Math.min(c, COLS - w);
      let left = -1;
      for (let shift = 0; shift <= COLS - w && left < 0; shift++) {
        if (wanted + shift <= COLS - w && spanFree(wanted + shift, w, r)) left = wanted + shift;
        else if (wanted - shift >= 0 && spanFree(wanted - shift, w, r)) left = wanted - shift;
      }
      if (left < 0) {
        dropped++;
        continue;
      }
      type[base + left] = t;
      source[base + left] = c;
      for (let k = left; k < left + w; k++) freeFrom[k] = r + h;
    }

    for (let c = 0; c < COLS; c++) {
      // Gates go to the rails.
      if (cellSpec(map, map.cells[base + c]).kind === 'gate') {
        if (c < COLS / 2) {
          if (gateLeft[r] === 0) gateLeft[r] = c + 1;
        } else if (gateRight[r] === 0) {
          gateRight[r] = c + 1;
        }
        continue;
      }
      // Minions stand wherever a cell is still free.
      const t = enemyTypeAt(map, seed, r, c);
      if (t === 0 || t >= BIG_ENEMY_MIN_TYPE) continue;
      if (freeFrom[c] > r) {
        dropped++;
        continue;
      }
      type[base + c] = t;
      source[base + c] = c;
    }
  }
  return { type, source, gateLeft, gateRight, dropped };
}

let cachedMap: MapData | null = null;
let cachedSeed = -1;
let cachedLayout: MapLayout | null = null;

/**
 * Layout of `map` for a run with `seed`. It is derived data: a pure function of
 * its arguments, so it is cached for the level being played and never serialised.
 */
export function getLayout(map: MapData, seed: number): MapLayout {
  if (cachedLayout === null || cachedMap !== map || cachedSeed !== seed) {
    cachedLayout = resolve(map, seed);
    cachedMap = map;
    cachedSeed = seed;
  }
  return cachedLayout;
}
