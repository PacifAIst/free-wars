import type { Enemy, SimState } from '../types';
import { COLS, ENEMY_STATS, HIT_FLASH_SECONDS, SIM_DT, SPEED_SCALE, WINDOW_ROWS } from './constants';
import { FX_BASE, FX_HIT, FX_KILL, spawnFx } from './Fx';
import { poolAlloc, poolFree } from './Pool';

export function makeEnemy(): Enemy {
  return {
    active: false,
    type: 0,
    x: 0,
    y: 0,
    prevY: 0,
    w: 0,
    h: 0,
    hp: 0,
    maxHp: 0,
    speed: 0,
    drop: 0,
    flash: 0,
    row: 0,
  };
}

/**
 * Places an enemy whose token sits in grid cell (`row`, `col`).
 *
 * D11: the cell is the front-left corner of the footprint. The body extends
 * behind it (up the screen), and a footprint that would leave the lane is
 * shifted inward. `frontY` is where the front edge is now.
 *
 * Returns false if the pool is full.
 */
export function spawnEnemy(
  sim: SimState,
  type: number,
  col: number,
  row: number,
  frontY: number,
  hpOverride: number,
  drop: number,
): boolean {
  const index = poolAlloc(sim.enemies);
  if (index < 0) return false;
  const stats = ENEMY_STATS[type];
  const e = sim.enemies.items[index];
  const left = Math.min(col, COLS - stats.w);
  e.type = type;
  e.w = stats.w;
  e.h = stats.h;
  e.x = left + stats.w / 2;
  e.y = frontY - stats.h / 2;
  e.speed = stats.speedSpec * SPEED_SCALE;
  // One tick behind, so the first interpolated frame is already in motion.
  e.prevY = e.y - e.speed * SIM_DT;
  e.hp = hpOverride > 0 ? hpOverride : stats.hp;
  e.maxHp = e.hp;
  e.drop = drop;
  e.flash = 0;
  e.row = row;
  return true;
}

/** Applies damage. Returns true if the enemy died. */
export function damageEnemy(sim: SimState, index: number, amount: number, hitX: number, hitY: number): boolean {
  const e = sim.enemies.items[index];
  e.hp -= amount;
  if (e.hp > 0) {
    e.flash = HIT_FLASH_SECONDS;
    spawnFx(sim, FX_HIT, hitX, hitY, 1);
    return false;
  }
  spawnFx(sim, FX_KILL, e.x, e.y, e.w);
  poolFree(sim.enemies, index);
  sim.kills++;
  return true;
}

/**
 * Marches every enemy one tick and resolves arrivals at the base line.
 *
 * B1: an enemy that reaches the base line takes its remaining HP out of the
 * base and is destroyed. A boss (E5-E8) reaching it loses the level at once.
 */
export function stepEnemies(sim: SimState): void {
  const { items } = sim.enemies;
  for (let i = sim.enemies.high - 1; i >= 0; i--) {
    const e = items[i];
    if (!e.active) continue;
    e.prevY = e.y;
    e.y += e.speed * SIM_DT;
    if (e.flash > 0) e.flash -= SIM_DT;
    if (e.y + e.h / 2 < WINDOW_ROWS) continue;

    if (ENEMY_STATS[e.type].boss) {
      sim.phase = 'lost';
      sim.lossReason = 'boss';
      spawnFx(sim, FX_BASE, e.x, WINDOW_ROWS - 1, e.w);
      continue;
    }
    sim.baseHp -= e.hp;
    spawnFx(sim, FX_BASE, e.x, WINDOW_ROWS - 0.5, Math.max(2, e.w));
    poolFree(sim.enemies, i);
    if (sim.baseHp <= 0) {
      sim.baseHp = 0;
      sim.phase = 'lost';
      sim.lossReason = 'base';
    }
  }
}
