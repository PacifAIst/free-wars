import { cellSpec } from '../parsers/tokens';
import type { MapData, SimState } from '../types';
import { addClones } from './Clone';
import {
  BASE_HP,
  CLONE_CAP,
  COLS,
  MARCH_SPEED,
  POOL_BULLETS,
  POOL_ENEMIES,
  POOL_PARTICLES,
  POOL_POWERUPS,
  POOL_ROCKETS,
  PRE_ADVANCE_ROWS,
  SIM_DT,
  START_CLONES,
} from './constants';
import { makeEnemy, spawnEnemy, spawnGate } from './Enemy';
import { makeFx } from './Fx';
import { getLayout } from './layout';
import { createShooter } from './Player';
import { createPool } from './Pool';
import { makePowerup } from './Powerup';
import { makeBullet, makeRocket } from './Projectile';
import { makeWall } from './Wall';

export interface PoolCapacities {
  enemies: number;
  bullets: number;
  rockets: number;
  fx: number;
  powerups: number;
}

export interface SimOptions {
  capacities: Partial<PoolCapacities>;
  /** B2: clones at level start. */
  startClones: number;
}

export const DEFAULT_CAPACITIES: Readonly<PoolCapacities> = {
  enemies: POOL_ENEMIES,
  bullets: POOL_BULLETS,
  rockets: POOL_ROCKETS,
  fx: POOL_PARTICLES,
  powerups: POOL_POWERUPS,
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
  dark: false,
  walls: [0, 0],
};

/** Spawns one grid row. Returns false, spawning nothing, if the enemy pool cannot hold it. */
function spawnRow(sim: SimState, map: MapData, row: number): boolean {
  const layout = getLayout(map, sim.seed);
  const base = row * COLS;
  let needed = (layout.gateLeft[row] > 0 ? 1 : 0) + (layout.gateRight[row] > 0 ? 1 : 0);
  for (let c = 0; c < COLS; c++) if (layout.type[base + c] !== 0) needed++;
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
    const type = layout.type[base + c];
    if (type === 0) continue;
    // HP override and drop come from the token, which may sit in another column (A21).
    const spec = cellSpec(map, map.cells[base + layout.source[base + c]]);
    spawnEnemy(sim, type, c, row, frontY, spec.hp, spec.drop);
  }
  // Gates travel on the rails beside the lane (A29). The value is the token's column plus one.
  if (layout.gateLeft[row] > 0) {
    const spec = cellSpec(map, map.cells[base + layout.gateLeft[row] - 1]);
    spawnGate(sim, -1, row, frontY, spec.hp, spec.drop);
  }
  if (layout.gateRight[row] > 0) {
    const spec = cellSpec(map, map.cells[base + layout.gateRight[row] - 1]);
    spawnGate(sim, 1, row, frontY, spec.hp, spec.drop);
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
export function createWorld(map: MapData, seed: number, options: Partial<SimOptions> = {}): SimState {
  const capacities = { ...DEFAULT_CAPACITIES, ...options.capacities };
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
    fxCount: 0,
    shots: 0,
    rocketsFired: 0,
    enemyRocketsFired: 0,
    minigun: 0,
    rocketMode: 0,
    laser: 0,
    laserClock: 0,
    laserCasts: 0,
    tank: 0,
    tankCooldown: 0,
    poolFullLogged: false,
    shooter: createShooter(),
    clones: 0,
    cloneCooldowns: Array.from({ length: CLONE_CAP }, () => 0),
    enemies: createPool(capacities.enemies, makeEnemy),
    powerups: createPool(capacities.powerups, makePowerup),
    bullets: createPool(capacities.bullets, makeBullet),
    rockets: createPool(capacities.rockets, makeRocket),
    walls: [makeWall(map.walls[0]), makeWall(map.walls[1])],
    fx: createPool(capacities.fx, makeFx),
  };
  addClones(sim, options.startClones ?? START_CLONES);
  spawnDueRows(sim, map);
  return sim;
}
