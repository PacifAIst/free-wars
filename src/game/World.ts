import { cellSpec } from '../parsers/tokens';
import type { MapData, SimState } from '../types';
import {
  BASE_HP,
  COLS,
  MARCH_SPEED,
  POOL_BULLETS,
  POOL_ENEMIES,
  POOL_PARTICLES,
  PRE_ADVANCE_ROWS,
  RANDOM_MINION_TYPES,
  SIM_DT,
} from './constants';
import { makeEnemy, spawnEnemy } from './Enemy';
import { makeFx } from './Fx';
import { createShooter } from './Player';
import { createPool } from './Pool';
import { makeBullet } from './Projectile';
import { cellHash } from './rng';

export interface PoolCapacities {
  enemies: number;
  bullets: number;
  fx: number;
}

export const DEFAULT_CAPACITIES: Readonly<PoolCapacities> = {
  enemies: POOL_ENEMIES,
  bullets: POOL_BULLETS,
  fx: POOL_PARTICLES,
};

/** A map with no rows: the backdrop behind the menu before a level is loaded. */
export const EMPTY_MAP: MapData = {
  id: '',
  title: '',
  name: '',
  difficulty: 1,
  author: '',
  description: '',
  columns: COLS,
  rows: 0,
  cells: new Uint16Array(0),
  overrides: [],
};

/**
 * Enemy type (1..8) that grid cell (`row`, `col`) spawns, or 0 for an empty
 * cell or a gate. `ER` is resolved from the seed, so the answer is the same
 * whenever and wherever it is asked.
 */
export function enemyTypeAt(map: MapData, seed: number, row: number, col: number): number {
  const spec = cellSpec(map, map.cells[row * COLS + col]);
  if (spec.kind === 'enemy') return spec.type;
  if (spec.kind === 'random') return 1 + (cellHash(seed, row, col) % RANDOM_MINION_TYPES);
  return 0;
}

/** Spawns one grid row. Returns false, spawning nothing, if the enemy pool cannot hold it. */
function spawnRow(sim: SimState, map: MapData, row: number): boolean {
  const base = row * COLS;
  let needed = 0;
  for (let c = 0; c < COLS; c++) {
    const kind = cellSpec(map, map.cells[base + c]).kind;
    if (kind === 'enemy' || kind === 'random') needed++;
  }
  if (needed > sim.enemies.freeCount) {
    if (!sim.poolFullLogged) {
      sim.poolFullLogged = true;
      console.warn(`[free-wars] enemy pool full at row ${row + 1}; row spawning is waiting`);
    }
    return false;
  }

  // Where this row's front edge is now: row r entered when scroll reached r.
  const frontY = sim.scroll - row;
  for (let c = 0; c < COLS; c++) {
    const type = enemyTypeAt(map, sim.seed, row, c);
    if (type === 0) continue;
    const spec = cellSpec(map, map.cells[base + c]);
    spawnEnemy(sim, type, c, row, frontY, spec.hp, spec.drop);
  }
  return true;
}

/** Spawns every row whose front edge has reached the top of the window (D4). */
function spawnDueRows(sim: SimState, map: MapData): void {
  while (sim.nextRow < sim.totalRows && sim.scroll >= sim.nextRow) {
    if (!spawnRow(sim, map, sim.nextRow)) return;
    sim.nextRow++;
  }
}

/**
 * Advances the march by one tick and streams in new rows. The map file is a
 * timeline: row 0 leads, each later row follows one cell behind. Rows are
 * created as they reach the top edge of the window, never all at once, so cost
 * depends on what is on screen and not on the length of the map.
 */
export function streamRows(sim: SimState, map: MapData): void {
  sim.scroll += MARCH_SPEED * SIM_DT;
  spawnDueRows(sim, map);
}

/** Creates the state for a fresh run of `map`. */
export function createWorld(
  map: MapData,
  seed: number,
  capacities: Readonly<PoolCapacities> = DEFAULT_CAPACITIES,
): SimState {
  const sim: SimState = {
    version: 1,
    mapId: map.id,
    seed: seed >>> 0,
    rng: seed >>> 0,
    tick: 0,
    phase: 'playing',
    lossReason: '',
    // D4: play starts with the front line already inside the window.
    scroll: PRE_ADVANCE_ROWS,
    nextRow: 0,
    totalRows: map.rows,
    baseHp: BASE_HP,
    kills: 0,
    shots: 0,
    poolFullLogged: false,
    shooter: createShooter(),
    enemies: createPool(capacities.enemies, makeEnemy),
    bullets: createPool(capacities.bullets, makeBullet),
    fx: createPool(capacities.fx, makeFx),
  };
  spawnDueRows(sim, map);
  return sim;
}
