import type { Enemy, SimState } from '../types';
import { formationRadius } from './Clone';
import {
  BIG_CHASE_SPEED,
  BIG_ENEMY_MIN_TYPE,
  COLS,
  E6_CHARGE_RANGE,
  E6_CHARGE_SPEED_SPEC,
  ENEMY_STATS,
  FUNNEL_END_ROWS,
  FUNNEL_START_ROW,
  GATE_TYPE,
  HIT_FLASH_SECONDS,
  MINION_CHASE_SPEED,
  RAIL_LEFT_X,
  RAIL_RIGHT_X,
  SHOOTER_Y,
  SIM_DT,
  SPEED_SCALE,
  WINDOW_ROWS,
} from './constants';
import { FX_BASE, FX_GATE, FX_HIT, FX_KILL, spawnFx } from './Fx';
import { poolAlloc, poolFree } from './Pool';
import { grantDrop, rollDrop, spawnDrop } from './Powerup';

/** A minion aims at a point at least this far down the lane, so it never turns fully sideways. */
const MIN_AIM_AHEAD = 0.5;

export function makeEnemy(): Enemy {
  return {
    active: false,
    type: 0,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    w: 0,
    h: 0,
    hp: 0,
    maxHp: 0,
    speed: 0,
    drop: 0,
    flash: 0,
    row: 0,
    contact: 0,
    winding: false,
    punches: 0,
    swing: 0,
    cast: 0,
    swept: -1,
    quota: 0,
  };
}

function place(sim: SimState, type: number, x: number, row: number, frontY: number, hp: number, drop: number): boolean {
  const index = poolAlloc(sim.enemies);
  if (index < 0) return false;
  const stats = ENEMY_STATS[type];
  const e = sim.enemies.items[index];
  e.type = type;
  e.w = stats.w;
  e.h = stats.h;
  e.x = x;
  e.prevX = x;
  e.y = frontY - stats.h / 2;
  e.speed = stats.speedSpec * SPEED_SCALE;
  // One tick behind, so the first interpolated frame is already in motion.
  e.prevY = e.y - e.speed * SIM_DT;
  e.hp = hp > 0 ? hp : stats.hp;
  e.maxHp = e.hp;
  e.drop = drop;
  e.flash = 0;
  e.row = row;
  e.contact = 0;
  e.winding = false;
  e.punches = 0;
  e.swing = 9;
  e.cast = 0;
  e.swept = -1;
  e.quota = 0;
  return true;
}

/**
 * Places an enemy whose footprint has its front-left corner in grid cell
 * (`row`, `left`). The body extends behind it, up the lane (D11). `frontY` is
 * where the front edge is now.
 *
 * Returns false if the pool is full.
 */
export function spawnEnemy(
  sim: SimState,
  type: number,
  left: number,
  row: number,
  frontY: number,
  hpOverride: number,
  drop: number,
): boolean {
  const { w } = ENEMY_STATS[type];
  return place(sim, type, Math.min(left, COLS - w) + w / 2, row, frontY, hpOverride, drop);
}

/** Places a gate on the left rail (`side` < 0) or the right rail. `resistance` is its HP. */
export function spawnGate(
  sim: SimState,
  side: number,
  row: number,
  frontY: number,
  resistance: number,
  drop: number,
): boolean {
  return place(sim, GATE_TYPE, side < 0 ? RAIL_LEFT_X : RAIL_RIGHT_X, row, frontY, resistance, drop);
}

/**
 * Applies damage. Returns true if the enemy died or the gate broke.
 *
 * A27, A29: a broken gate rewards the swarm on the spot. SPEC 7.4: a dying
 * enemy drops its authored powerup as a falling box; E4 and E8 without one
 * roll a random drop.
 */
export function damageEnemy(sim: SimState, index: number, amount: number, hitX: number, hitY: number): boolean {
  const e = sim.enemies.items[index];
  e.hp -= amount;
  if (e.hp > 0) {
    e.flash = HIT_FLASH_SECONDS;
    spawnFx(sim, FX_HIT, hitX, hitY, 1);
    return false;
  }
  if (e.type === GATE_TYPE) {
    const { x, y } = e;
    const drop = e.drop > 0 ? e.drop : rollDrop(sim);
    poolFree(sim.enemies, index);
    grantDrop(sim, drop, x, y, FX_GATE);
    return true;
  }
  const drop = e.drop > 0 ? e.drop : e.type === 4 || e.type === 8 ? rollDrop(sim) : 0;
  if (drop > 0) spawnDrop(sim, drop, e.x, Math.max(0, e.y));
  spawnFx(sim, FX_KILL, e.x, e.y, e.w, e.type);
  poolFree(sim.enemies, index);
  sim.kills++;
  return true;
}

/**
 * Moves every enemy one tick and resolves arrivals at the goal line.
 *
 * A28: every rat marches straight for the goal line. The pursuit of decision
 * A19 is still here, switched off by its two chase-speed constants: with a
 * speed above zero a big enemy steers sideways at the shooter, and a minion
 * runs along the line towards the swarm. Enemies do not overlap:
 * `SpatialHash.separate` pushes them apart after this step.
 *
 * B1: an enemy that reaches the goal line takes its remaining HP out of the
 * base and is destroyed. With BASE_HP at 1 the goal has no lives, so the first
 * enemy to cross loses the level. A boss (E5-E8) always loses it at once. A
 * gate that reaches the line is only a missed reward.
 */
export function stepEnemies(sim: SimState): void {
  const { items } = sim.enemies;
  const targetX = sim.shooter.x;
  // Minions inside this band are already heading into the swarm. It is kept
  // inside the outer ring, so a rat that reaches it is sure to meet a cat.
  const swarmHalf = Math.max(0, formationRadius(sim.clones) - 0.5);
  const funnelLength = SHOOTER_Y - FUNNEL_END_ROWS - FUNNEL_START_ROW;
  const maxSide = MINION_CHASE_SPEED * SIM_DT;

  for (let i = sim.enemies.high - 1; i >= 0; i--) {
    const e = items[i];
    if (!e.active) continue;
    e.prevX = e.x;
    e.prevY = e.y;
    if (e.flash > 0) e.flash -= SIM_DT;

    if (e.type === GATE_TYPE) {
      e.y += e.speed * SIM_DT;
      if (e.y + e.h / 2 >= WINDOW_ROWS) poolFree(sim.enemies, i);
      continue;
    }

    if (e.type >= BIG_ENEMY_MIN_TYPE) {
      let speed = e.speed;
      if (e.type === 6) {
        // SPEC 7.3: the charger runs at the swarm once it is close, until it touches it.
        const gap = SHOOTER_Y - formationRadius(sim.clones) - (e.y + e.h / 2);
        if (gap > 0 && gap < E6_CHARGE_RANGE) speed = E6_CHARGE_SPEED_SPEC * SPEED_SCALE;
      }
      e.y += speed * SIM_DT;
      const step = BIG_CHASE_SPEED * SIM_DT;
      const dx = targetX - e.x;
      e.x += dx > step ? step : dx < -step ? -step : dx;
    } else {
      let dx = targetX - e.x;
      dx = dx > swarmHalf ? dx - swarmHalf : dx < -swarmHalf ? dx + swarmHalf : 0;
      // Level with the swarm it keeps closing sideways; once clearly past, it runs for the goal line.
      const ahead = SHOOTER_Y - e.y;
      const dy = ahead > MIN_AIM_AHEAD ? ahead : MIN_AIM_AHEAD;
      if (dx === 0 || ahead < -MIN_AIM_AHEAD || maxSide === 0) {
        e.y += e.speed * SIM_DT;
      } else {
        // How strongly the line of march swings towards the swarm: 0 high up the lane, 1 close in.
        let pull = (e.y - FUNNEL_START_ROW) / funnelLength;
        pull = pull < 0 ? 0 : pull > 1 ? 1 : pull;
        const sx = dx * pull;
        const length = Math.sqrt(sx * sx + dy * dy);
        let side = (sx / length) * e.speed * SIM_DT;
        side = side > maxSide ? maxSide : side < -maxSide ? -maxSide : side;
        e.x += side;
        e.y += (dy / length) * e.speed * SIM_DT;
      }
    }

    const half = e.w / 2;
    if (e.x < half) e.x = half;
    else if (e.x > COLS - half) e.x = COLS - half;

    if (e.contact > 0) e.contact -= SIM_DT;
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
