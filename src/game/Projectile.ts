import type { Bullet, Rocket, SimState } from '../types';
import type { SpatialHash } from './Collision';
import { formationRadius, killInSquare } from './Clone';
import {
  BULLET_DAMAGE,
  BULLET_SPEED,
  CAT_RADIUS,
  DROP_TANK,
  ENEMY_ROCKET_HALF_WIDTH,
  ENEMY_ROCKETS_SHOOTABLE,
  type EnemyRocketStats,
  FIRE_RATE,
  GATE_TYPE,
  MINIGUN_RATE_FACTOR,
  MUZZLE_OFFSET,
  ROCKET_AOE,
  ROCKET_DAMAGE,
  ROCKET_FIRE_RATE,
  ROCKET_SPEED,
  SHOOTER_FIRE_JITTER,
  SHOOTER_Y,
  SIM_DT,
  TANK_BUBBLE_SIZE,
  TANK_DAMAGE,
  TANK_ROCKET_AOE,
  WINDOW_ROWS,
} from './constants';
import { damageEnemy } from './Enemy';
import { FX_BLAST, spawnFx } from './Fx';
import { poolAlloc, poolFree } from './Pool';
import { damageBubble, inBubble } from './Powerup';
import { nextRandom } from './rng';
import { blastWalls, damageWall, wallAt } from './Wall';

export const BULLET_REGULAR = 0;
export const BULLET_MINIGUN = 1;

export const ROCKET_PLAYER = 0;
export const ROCKET_TANK = 1;
export const ROCKET_ENEMY = 2;

export function makeBullet(): Bullet {
  return { active: false, x: 0, y: 0, prevY: 0, kind: 0 };
}

export function makeRocket(): Rocket {
  return { active: false, x: 0, y: 0, prevY: 0, kind: 0, hp: 0, aoe: 0, speed: 0 };
}

/** Fires one bullet straight up from (x, y). Does nothing when the pool is full. */
export function spawnBullet(sim: SimState, x: number, y: number, kind: number): void {
  const index = poolAlloc(sim.bullets);
  if (index < 0) return;
  const b = sim.bullets.items[index];
  b.x = x;
  b.y = y;
  b.prevY = y;
  b.kind = kind;
  sim.shots++;
}

/** Fires one rocket straight up from (x, y). Does nothing when the pool is full. */
export function spawnRocket(sim: SimState, x: number, y: number, kind: number): void {
  const index = poolAlloc(sim.rockets);
  if (index < 0) return;
  const r = sim.rockets.items[index];
  r.x = x;
  r.y = y;
  r.prevY = y;
  r.kind = kind;
  r.hp = 0;
  r.aoe = 0;
  r.speed = ROCKET_SPEED;
  sim.rocketsFired++;
}

/** An enemy fires a rocket straight down the lane from (x, y) (SPEC 7.2). */
export function spawnEnemyRocket(sim: SimState, x: number, y: number, stats: EnemyRocketStats): void {
  const index = poolAlloc(sim.rockets);
  if (index < 0) return;
  const r = sim.rockets.items[index];
  r.x = x;
  r.y = y;
  r.prevY = y;
  r.kind = ROCKET_ENEMY;
  r.hp = stats.hp;
  r.aoe = stats.aoe;
  r.speed = stats.speed;
  sim.enemyRocketsFired++;
}

/** Index of the enemy rocket a shot at (x, y) would hit, or -1. */
function enemyRocketAt(sim: SimState, x: number, y: number): number {
  if (!ENEMY_ROCKETS_SHOOTABLE) return -1;
  const { items, high } = sim.rockets;
  for (let i = 0; i < high; i++) {
    const r = items[i];
    if (!r.active || r.kind !== ROCKET_ENEMY) continue;
    if (Math.abs(x - r.x) < ENEMY_ROCKET_HALF_WIDTH && Math.abs(y - r.y) < ENEMY_ROCKET_HALF_WIDTH) return i;
  }
  return -1;
}

/** A shot hits an enemy rocket. At 0 HP it bursts and hurts nobody. */
function damageEnemyRocket(sim: SimState, index: number, amount: number): void {
  const r = sim.rockets.items[index];
  r.hp -= amount;
  if (r.hp > 0) return;
  spawnFx(sim, FX_BLAST, r.x, r.y, r.aoe, 3);
  poolFree(sim.rockets, index);
}

/**
 * One shot from a cat at (x, y), with whatever the swarm is armed with (SPEC 8.1).
 * `rocketeer` marks the cats that fire rockets in rocket mode (B6). Returns the
 * seconds until that cat's next shot, before its random variation.
 */
export function fireWeapon(sim: SimState, x: number, y: number, rocketeer: boolean, baseRate: number): number {
  if (rocketeer && sim.rocketMode > 0) {
    spawnRocket(sim, x, y, ROCKET_PLAYER);
    return 1 / ROCKET_FIRE_RATE;
  }
  if (sim.minigun > 0) {
    spawnBullet(sim, x, y, BULLET_MINIGUN);
    return 1 / (baseRate * MINIGUN_RATE_FACTOR);
  }
  spawnBullet(sim, x, y, BULLET_REGULAR);
  return 1 / baseRate;
}

/**
 * The shooter fires straight up at the base rate (SPEC 8.1), with a little
 * random variation between shots (A31). Inside the tank nobody fires: the tank does.
 */
export function fireShooter(sim: SimState): void {
  if (sim.tank > 0) return;
  const s = sim.shooter;
  s.fireCooldown -= SIM_DT;
  while (s.fireCooldown <= 0) {
    const wait = fireWeapon(sim, s.x, SHOOTER_Y - MUZZLE_OFFSET, true, FIRE_RATE);
    s.fireCooldown += wait * (1 + (nextRandom(sim) * 2 - 1) * SHOOTER_FIRE_JITTER);
  }
}

/** Index of the tank bubble that contains the point, or -1. */
function bubbleAt(sim: SimState, x: number, y: number): number {
  const { items, high } = sim.powerups;
  for (let i = 0; i < high; i++) if (inBubble(items[i], x, y)) return i;
  return -1;
}

/** True when a tank bubble is falling: only then do shots need to look for one. */
function anyBubble(sim: SimState): boolean {
  const { items, high } = sim.powerups;
  for (let i = 0; i < high; i++) if (items[i].active && items[i].kind === DROP_TANK) return true;
  return false;
}

/**
 * Moves bullets up the lane and resolves hits against the spatial hash.
 *
 * B3: a bullet expires at the top of the window, so enemies can only be hit
 * once they are on screen. A bullet moves less than the smallest enemy per
 * tick, so testing its new position cannot skip over a target.
 */
export function stepBullets(sim: SimState, hash: SpatialHash): void {
  const { items } = sim.bullets;
  const step = BULLET_SPEED * SIM_DT;
  const bubbles = anyBubble(sim);
  const threats = ENEMY_ROCKETS_SHOOTABLE && sim.rockets.items.some((r) => r.active && r.kind === ROCKET_ENEMY);
  for (let i = sim.bullets.high - 1; i >= 0; i--) {
    const b = items[i];
    if (!b.active) continue;
    b.prevY = b.y;
    b.y -= step;
    if (b.y < 0) {
      poolFree(sim.bullets, i);
      continue;
    }
    const hit = hash.queryPoint(b.x, b.y, sim.enemies);
    if (hit >= 0) {
      damageEnemy(sim, hit, BULLET_DAMAGE, b.x, b.y);
      poolFree(sim.bullets, i);
      continue;
    }
    const wall = wallAt(sim, b.x, b.y);
    if (wall >= 0) {
      damageWall(sim, wall, BULLET_DAMAGE, b.x);
      poolFree(sim.bullets, i);
      continue;
    }
    if (threats) {
      const rocket = enemyRocketAt(sim, b.x, b.y);
      if (rocket >= 0) {
        damageEnemyRocket(sim, rocket, BULLET_DAMAGE);
        poolFree(sim.bullets, i);
        continue;
      }
    }
    if (!bubbles) continue;
    const bubble = bubbleAt(sim, b.x, b.y);
    if (bubble >= 0) {
      damageBubble(sim, bubble, BULLET_DAMAGE);
      poolFree(sim.bullets, i);
    }
  }
}

/** Scratch list of enemies caught in an explosion. Not part of the sim state. */
const caught = new Int32Array(512);

/**
 * An explosion: every enemy whose footprint overlaps a square of side `aoe`
 * centred on (x, y) takes `damage` (SPEC 8). Tank bubbles in it are hit too.
 */
export function explode(
  sim: SimState,
  hash: SpatialHash,
  x: number,
  y: number,
  aoe: number,
  damage: number,
  tag: number,
): void {
  const half = aoe / 2;
  const found = hash.queryRect(x - half, y - half, x + half, y + half, sim.enemies, caught);
  const enemies = sim.enemies.items;
  for (let n = 0; n < found; n++) {
    const e = enemies[caught[n]];
    if (!e.active || e.type === GATE_TYPE) continue;
    damageEnemy(sim, caught[n], damage, e.x, e.y);
  }
  const reach = half + TANK_BUBBLE_SIZE / 2;
  const { items, high } = sim.powerups;
  for (let i = 0; i < high; i++) {
    const p = items[i];
    if (!p.active || p.kind !== DROP_TANK) continue;
    if (Math.abs(p.x - x) < reach && Math.abs(p.y - y) < reach) damageBubble(sim, i, damage);
  }
  blastWalls(sim, x, y, half, damage);
  const rockets = sim.rockets;
  for (let i = 0; i < rockets.high; i++) {
    const r = rockets.items[i];
    if (!ENEMY_ROCKETS_SHOOTABLE || !r.active || r.kind !== ROCKET_ENEMY) continue;
    if (Math.abs(r.x - x) < half + ENEMY_ROCKET_HALF_WIDTH && Math.abs(r.y - y) < half + ENEMY_ROCKET_HALF_WIDTH) {
      damageEnemyRocket(sim, i, damage);
    }
  }
  spawnFx(sim, FX_BLAST, x, y, aoe, tag);
}

/**
 * Moves the swarm's rockets up the lane. A rocket explodes on the first enemy,
 * enemy rocket or tank bubble it meets; one that reaches the top of the window
 * is gone (B3).
 *
 * Enemy rockets fly down the lane. One that reaches the swarm clears a square
 * of cats round it; inside the tank the swarm is safe. One that misses is gone
 * at the goal line.
 */
export function stepRockets(sim: SimState, hash: SpatialHash): void {
  const { items } = sim.rockets;
  const step = ROCKET_SPEED * SIM_DT;
  for (let i = sim.rockets.high - 1; i >= 0; i--) {
    const r = items[i];
    if (!r.active) continue;
    r.prevY = r.y;
    if (r.kind === ROCKET_ENEMY) {
      r.y += r.speed * SIM_DT;
      const reach = formationRadius(sim.clones) + CAT_RADIUS + 1;
      const dx = r.x - sim.shooter.x;
      const dy = r.y - SHOOTER_Y;
      if (dx * dx + dy * dy < reach * reach) {
        const { x, y, aoe } = r;
        poolFree(sim.rockets, i);
        spawnFx(sim, FX_BLAST, x, y, aoe, 2);
        if (sim.tank <= 0 && !killInSquare(sim, x, y, aoe / 2)) return;
      } else if (r.y >= WINDOW_ROWS) {
        poolFree(sim.rockets, i);
      }
      continue;
    }
    r.y -= step;
    if (r.y < 0) {
      poolFree(sim.rockets, i);
      continue;
    }
    if (hash.queryPoint(r.x, r.y, sim.enemies) < 0 && bubbleAt(sim, r.x, r.y) < 0 && enemyRocketAt(sim, r.x, r.y) < 0 && wallAt(sim, r.x, r.y) < 0) continue;
    const tank = r.kind === ROCKET_TANK;
    const { x, y } = r;
    poolFree(sim.rockets, i);
    explode(sim, hash, x, y, tank ? TANK_ROCKET_AOE : ROCKET_AOE, tank ? TANK_DAMAGE : ROCKET_DAMAGE, tank ? 1 : 0);
  }
}
