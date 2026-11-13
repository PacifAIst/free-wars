import type { Powerup, SimState } from '../types';
import { addClones, formationRadius, killNear } from './Clone';
import {
  CLONE_BOX_AMOUNTS,
  BIG_ENEMY_MIN_TYPE,
  BOMB_HITS_CATS,
  BOMB_KILLS,
  CLONE_BOX_WEIGHTS,
  DROP_BOMB,
  DROP_CLONE_1,
  DROP_CLONE_50,
  DROP_LASER,
  DROP_MINIGUN,
  DROP_ROCKET,
  DROP_TANK,
  DROP_WEIGHTS,
  GATE_TYPE,
  HIT_FLASH_SECONDS,
  LASER_TOTAL_SECONDS,
  MINIGUN_CAP_SECONDS,
  MINIGUN_PICKUP_SECONDS,
  PICKUP_MARGIN,
  POWERUP_SPEED,
  POWERUP_WIDTH,
  ROCKET_CAP_SECONDS,
  ROCKET_MODE_SECONDS,
  SHOOTER_Y,
  SIM_DT,
  TANK_BUBBLE_HP,
  TANK_BUBBLE_SIZE,
  TANK_BUBBLE_SPEED,
  TANK_CAP_SECONDS,
  TANK_SECONDS,
  WINDOW_ROWS,
} from './constants';
import { damageEnemy } from './Enemy';
import { FX_BOMB, FX_HIT, FX_PICKUP, FX_TANK, spawnFx } from './Fx';
import { poolAlloc, poolFree } from './Pool';
import { nextRandom } from './rng';

export function makePowerup(): Powerup {
  return { active: false, kind: 0, x: 0, y: 0, prevY: 0, hp: 0, flash: 0 };
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

/** The tank rolls out: the swarm rides in it for TANK_SECONDS (SPEC 8.1). */
export function startTank(sim: SimState): void {
  if (sim.tank <= 0) {
    sim.tankCooldown = 0;
    spawnFx(sim, FX_TANK, sim.shooter.x, SHOOTER_Y, 1, 1);
  }
  sim.tank = Math.min(TANK_CAP_SECONDS, sim.tank + TANK_SECONDS);
}

/**
 * A bomb goes off at (x, y) because the swarm touched it (A34). It kills
 * BOMB_KILLS units: the cats nearest it, or, with BOMB_HITS_CATS off, the
 * minions nearest the goal line. A swarm inside the tank is not hurt.
 */
function explodeBomb(sim: SimState, x: number, y: number): void {
  let kills = 0;
  if (BOMB_HITS_CATS) {
    if (sim.tank <= 0) {
      kills = Math.min(BOMB_KILLS, sim.clones + 1);
      spawnFx(sim, FX_BOMB, x, y, kills);
      killNear(sim, x, y, BOMB_KILLS);
      return;
    }
  } else {
    const { items } = sim.enemies;
    while (kills < BOMB_KILLS) {
      let best = -1;
      for (let i = 0; i < sim.enemies.high; i++) {
        const e = items[i];
        if (!e.active || e.type === GATE_TYPE || e.type >= BIG_ENEMY_MIN_TYPE || e.y + e.h / 2 <= 0) continue;
        if (best < 0 || e.y > items[best].y) best = i;
      }
      if (best < 0) break;
      damageEnemy(sim, best, items[best].hp, items[best].x, items[best].y);
      kills++;
    }
  }
  spawnFx(sim, FX_BOMB, x, y, kills);
}

/**
 * Gives the swarm what a drop code stands for: clones, or one of the weapons
 * (SPEC 9). `fxKind` says how it arrived: caught as a box or collected from a
 * panel. The effect carries the clones gained as its size and the code as its tag.
 */
export function grantDrop(sim: SimState, kind: number, x: number, y: number, fxKind: number): void {
  if (kind === DROP_BOMB) {
    explodeBomb(sim, x, y);
    return;
  }
  let amount = 0;
  if (isCloneBox(kind)) {
    amount = CLONE_BOX_AMOUNTS[kind - DROP_CLONE_1];
    addClones(sim, amount);
  } else if (kind === DROP_MINIGUN) {
    sim.minigun = Math.min(MINIGUN_CAP_SECONDS, sim.minigun + MINIGUN_PICKUP_SECONDS);
  } else if (kind === DROP_ROCKET) {
    sim.rocketMode = Math.min(ROCKET_CAP_SECONDS, sim.rocketMode + ROCKET_MODE_SECONDS);
  } else if (kind === DROP_LASER) {
    // A fresh laser starts charging; one already running is topped up and keeps its rhythm.
    if (sim.laser <= 0) sim.laserClock = 0;
    sim.laser = LASER_TOTAL_SECONDS;
  } else if (kind === DROP_TANK) {
    startTank(sim);
  }
  spawnFx(sim, fxKind, x, y, amount, kind);
}

/**
 * Drops a falling powerup where an enemy died. Clone boxes and the minigun,
 * laser and rocket boxes are caught by touch. The tank comes in a bubble that
 * only shots can open (SPEC 9).
 */
export function spawnDrop(sim: SimState, kind: number, x: number, y: number): void {
  const index = poolAlloc(sim.powerups);
  if (index < 0) return;
  const p = sim.powerups.items[index];
  p.kind = kind;
  p.x = x;
  p.y = y;
  p.prevY = y;
  p.hp = kind === DROP_TANK ? TANK_BUBBLE_HP : 0;
  p.flash = 0;
}

/** True when the point is inside tank bubble `p`. */
export function inBubble(p: Powerup, x: number, y: number): boolean {
  const half = TANK_BUBBLE_SIZE / 2;
  return p.active && p.kind === DROP_TANK && Math.abs(x - p.x) < half && Math.abs(y - p.y) < half;
}

/** A shot hits a tank bubble. At 0 HP it pops and the tank rolls out. */
export function damageBubble(sim: SimState, index: number, amount: number): void {
  const p = sim.powerups.items[index];
  p.hp -= amount;
  if (p.hp > 0) {
    p.flash = HIT_FLASH_SECONDS;
    spawnFx(sim, FX_HIT, p.x, p.y + TANK_BUBBLE_SIZE / 2, 1);
    return;
  }
  spawnFx(sim, FX_PICKUP, p.x, p.y, 0, DROP_TANK);
  poolFree(sim.powerups, index);
  startTank(sim);
}

/**
 * Boxes fall towards the goal line (B8). B9: a box is picked up when it
 * overlaps the formation. Boxes are wide, so the test is the formation's
 * circle against the box's width. A box that reaches the goal line is lost.
 * A tank bubble is never picked up by touch.
 */
export function stepPowerups(sim: SimState): void {
  const { items } = sim.powerups;
  for (let i = sim.powerups.high - 1; i >= 0; i--) {
    const p = items[i];
    if (!p.active) continue;
    p.prevY = p.y;
    if (p.flash > 0) p.flash -= SIM_DT;

    if (p.kind === DROP_TANK) {
      p.y += TANK_BUBBLE_SPEED * SIM_DT;
      if (p.y >= WINDOW_ROWS) poolFree(sim.powerups, i);
      continue;
    }

    p.y += POWERUP_SPEED * SIM_DT;
    const radius = formationRadius(sim.clones);
    const dx = Math.abs(p.x - sim.shooter.x);
    const dy = Math.abs(p.y - SHOOTER_Y);
    if (dx <= radius + POWERUP_WIDTH / 2 && dy <= radius + PICKUP_MARGIN) {
      const { kind, x, y } = p;
      poolFree(sim.powerups, i);
      grantDrop(sim, kind, x, y, FX_PICKUP);
    } else if (p.y >= WINDOW_ROWS) {
      poolFree(sim.powerups, i);
    }
  }
}
