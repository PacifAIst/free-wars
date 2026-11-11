import type { Bullet, SimState } from '../types';
import type { SpatialHash } from './Collision';
import { BULLET_DAMAGE, BULLET_SPEED, FIRE_RATE, MUZZLE_OFFSET, SHOOTER_Y, SIM_DT } from './constants';
import { damageEnemy } from './Enemy';
import { poolAlloc, poolFree } from './Pool';

export const BULLET_REGULAR = 0;
export const BULLET_MINIGUN = 1;

export function makeBullet(): Bullet {
  return { active: false, x: 0, y: 0, prevY: 0, kind: 0 };
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

/** The shooter fires straight up at the base rate (SPEC 8.1). */
export function fireShooter(sim: SimState): void {
  const s = sim.shooter;
  s.fireCooldown -= SIM_DT;
  while (s.fireCooldown <= 0) {
    spawnBullet(sim, s.x, SHOOTER_Y - MUZZLE_OFFSET, BULLET_REGULAR);
    s.fireCooldown += 1 / FIRE_RATE;
  }
}

/**
 * Moves bullets up the lane and resolves hits against the spatial hash.
 *
 * B3: a bullet expires at the top of the window, so enemies can only be hit
 * once they are on screen. A bullet moves 0.5 gu per tick, less than the
 * smallest enemy, so testing its new position cannot skip over a target.
 */
export function stepBullets(sim: SimState, hash: SpatialHash): void {
  const { items } = sim.bullets;
  const step = BULLET_SPEED * SIM_DT;
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
    }
  }
}
