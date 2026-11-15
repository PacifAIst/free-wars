import type { SimState } from '../types';
import type { SpatialHash } from './Collision';
import {
  BIG_ENEMY_MIN_TYPE,
  DROP_TANK,
  ENEMY_ROCKETS_SHOOTABLE,
  GATE_TYPE,
  LASER_BEAM_SECONDS,
  LASER_BIG_DMG,
  LASER_CHARGE_SECONDS,
  LASER_COOLDOWN_SECONDS,
  LASER_WIDTH,
  RAIL_WIDTH,
  SHOOTER_Y,
  SIM_DT,
  TANK_BUBBLE_HP,
  TANK_BUBBLE_SIZE,
  TANK_CONTACT_INTERVAL,
  TANK_DAMAGE,
  TANK_ROCKETS_PER_SEC,
  TANK_SIZE,
} from './constants';
import { damageEnemy } from './Enemy';
import { FX_BLAST, FX_LASER, FX_TANK, spawnFx } from './Fx';
import { damageBubble } from './Powerup';
import { ROCKET_ENEMY, ROCKET_TANK, spawnRocket } from './Projectile';
import { damageWall, wallX } from './Wall';
import { poolFree } from './Pool';

// The timed weapons of SPEC 8.1. The minigun and rocket mode only change what
// the cats fire (see `fireWeapon`); the laser and the tank act on their own.

const LASER_CYCLE = LASER_CHARGE_SECONDS + LASER_BEAM_SECONDS + LASER_COOLDOWN_SECONDS;

/** Where the laser is in its cycle. */
export const LASER_OFF = 0;
export const LASER_CHARGING = 1;
export const LASER_FIRING = 2;
export const LASER_COOLING = 3;

export function laserPhase(sim: SimState): number {
  if (sim.laser <= 0) return LASER_OFF;
  if (sim.laserClock < LASER_CHARGE_SECONDS) return LASER_CHARGING;
  return sim.laserClock < LASER_CHARGE_SECONDS + LASER_BEAM_SECONDS ? LASER_FIRING : LASER_COOLING;
}

/** How far the laser has charged, 0 to 1. */
export function laserCharge(sim: SimState): number {
  return laserPhase(sim) === LASER_CHARGING ? sim.laserClock / LASER_CHARGE_SECONDS : 0;
}

/**
 * The laser (SPEC 8, B5): 2 s of charge, a 0.5 s beam straight up the lane
 * from the shooter, 3 s of cooling, again and again while the mode lasts. The
 * beam moves with the shooter. It kills every minion it touches. A big enemy
 * takes LASER_BIG_DMG once per cast, however long it stays in the beam.
 */
function stepLaser(sim: SimState): void {
  if (sim.laser <= 0) return;
  const before = sim.laserClock;
  sim.laserClock += SIM_DT;
  sim.laser -= SIM_DT;

  if (sim.laserClock >= LASER_CHARGE_SECONDS && sim.laserClock < LASER_CHARGE_SECONDS + LASER_BEAM_SECONDS) {
    if (before < LASER_CHARGE_SECONDS) {
      sim.laserCasts++;
      spawnFx(sim, FX_LASER, sim.shooter.x, SHOOTER_Y, LASER_WIDTH);
    }
    const x = sim.shooter.x;
    const half = LASER_WIDTH / 2;
    const { items, high } = sim.enemies;
    for (let i = 0; i < high; i++) {
      const e = items[i];
      if (!e.active || e.type === GATE_TYPE) continue;
      // B3: only what is inside the window and up the lane from the shooter.
      if (e.y + e.h / 2 <= 0 || e.y - e.h / 2 >= SHOOTER_Y) continue;
      if (Math.abs(e.x - x) >= half + e.w / 2) continue;
      if (e.type < BIG_ENEMY_MIN_TYPE) {
        damageEnemy(sim, i, e.hp, e.x, e.y);
      } else if (e.cast !== sim.laserCasts) {
        e.cast = sim.laserCasts;
        damageEnemy(sim, i, LASER_BIG_DMG, e.x, e.y + e.h / 2);
      }
    }
    // A wall in the beam is hurt once per cast, like a big rat.
    for (let side = 0; side < 2; side++) {
      const wall = sim.walls[side];
      if (wall.hp > 0 && wall.cast !== sim.laserCasts && Math.abs(x - wallX(side)) < half + RAIL_WIDTH / 2) {
        wall.cast = sim.laserCasts;
        damageWall(sim, side, LASER_BIG_DMG, wallX(side));
      }
    }
    // B5: the beam also burns up the enemy rockets in it.
    const rockets = sim.rockets;
    for (let i = 0; i < rockets.high; i++) {
      const r = rockets.items[i];
      if (!ENEMY_ROCKETS_SHOOTABLE || !r.active || r.kind !== ROCKET_ENEMY || r.y >= SHOOTER_Y || Math.abs(r.x - x) >= half) continue;
      spawnFx(sim, FX_BLAST, r.x, r.y, r.aoe, 3);
      poolFree(sim.rockets, i);
    }
    const reach = half + TANK_BUBBLE_SIZE / 2;
    const boxes = sim.powerups;
    for (let i = 0; i < boxes.high; i++) {
      const p = boxes.items[i];
      if (p.active && p.kind === DROP_TANK && p.y < SHOOTER_Y && Math.abs(p.x - x) < reach) {
        damageBubble(sim, i, TANK_BUBBLE_HP);
      }
    }
  }

  if (sim.laserClock >= LASER_CYCLE) sim.laserClock -= LASER_CYCLE;
  if (sim.laser <= 0) {
    sim.laser = 0;
    sim.laserClock = 0;
  }
}

/** Scratch list of enemies under the tank. Not part of the sim state. */
const under = new Int32Array(256);

/**
 * The tank (SPEC 8, 8.1): for TANK_SECONDS the swarm rides inside it and
 * cannot be hurt. It fires tank rockets from one muzzle and crushes what it
 * touches: minions die, a big enemy takes TANK_DAMAGE every TANK_CONTACT_INTERVAL.
 */
function stepTank(sim: SimState, hash: SpatialHash): void {
  if (sim.tank <= 0) return;
  sim.tank -= SIM_DT;
  const x = sim.shooter.x;
  const half = TANK_SIZE / 2;

  sim.tankCooldown -= SIM_DT;
  while (sim.tankCooldown <= 0) {
    spawnRocket(sim, x, SHOOTER_Y - half, ROCKET_TANK);
    sim.tankCooldown += 1 / TANK_ROCKETS_PER_SEC;
  }

  const found = hash.queryRect(x - half, SHOOTER_Y - half, x + half, SHOOTER_Y + half, sim.enemies, under);
  const enemies = sim.enemies.items;
  for (let n = 0; n < found; n++) {
    const e = enemies[under[n]];
    if (!e.active || e.type === GATE_TYPE) continue;
    if (e.type >= BIG_ENEMY_MIN_TYPE) {
      // A big rat cannot punch a tank; `contact` paces the crushing instead.
      if (e.winding) {
        e.winding = false;
        e.contact = 0;
      }
      if (e.contact > 0) continue;
      e.contact = TANK_CONTACT_INTERVAL;
    }
    damageEnemy(sim, under[n], TANK_DAMAGE, e.x, e.y + e.h / 2);
  }

  if (sim.tank <= 0) {
    sim.tank = 0;
    spawnFx(sim, FX_TANK, x, SHOOTER_Y, 1, 0);
  }
}

/** Runs the weapon timers, the laser and the tank for one tick. */
export function stepWeapons(sim: SimState, hash: SpatialHash): void {
  if (sim.minigun > 0) sim.minigun = Math.max(0, sim.minigun - SIM_DT);
  if (sim.rocketMode > 0) sim.rocketMode = Math.max(0, sim.rocketMode - SIM_DT);
  stepLaser(sim);
  stepTank(sim, hash);
}
