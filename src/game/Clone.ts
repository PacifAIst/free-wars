import type { SimState } from '../types';
import type { SpatialHash } from './Collision';
import {
  BIG_CONTACT_MIN_SIZE,
  BIG_CONTACT_RATE,
  CAT_RADIUS,
  CLONE_CAP,
  CLONE_FIRE_RATE_FACTOR,
  CONTACT_DAMAGE,
  FIRE_RATE,
  GATE_TYPE,
  MUZZLE_OFFSET,
  RING_SLOTS_PER_RING,
  RING_SPACING,
  SHOOTER_Y,
  SIM_DT,
} from './constants';
import { damageEnemy } from './Enemy';
import { FX_CAT, spawnFx } from './Fx';
import { SHOOTER_MAX_X, SHOOTER_MIN_X } from './Player';
import { BULLET_REGULAR, spawnBullet } from './Projectile';

// The swarm. Clones are identical, so the state is just their number: clone i
// stands in formation slot i. When one dies the formation re-packs, which
// simply means the outermost slot empties (SPEC 6.2).

const CLONE_FIRE_PERIOD = 1 / (FIRE_RATE * CLONE_FIRE_RATE_FACTOR);
/** Spreads the clones' shots over the fire period, so they do not fire as one volley. */
const STAGGER = 0.618;

/** Number of slots in rings 1..k. */
const slotsThroughRing = (k: number): number => (RING_SLOTS_PER_RING * k * (k + 1)) / 2;

/**
 * Offsets of every formation slot from the shooter, in gu.
 * D8: ring k holds 6k slots at radius k. Slots fill clockwise from 12 o'clock,
 * then move out to the next ring (SPEC 6.2). y grows down the screen, so a
 * growing angle is clockwise as the player sees it.
 */
export const SLOT_X: readonly number[] = [];
export const SLOT_Y: readonly number[] = [];
{
  const xs = SLOT_X as number[];
  const ys = SLOT_Y as number[];
  for (let ring = 1; xs.length < CLONE_CAP; ring++) {
    const capacity = RING_SLOTS_PER_RING * ring;
    for (let j = 0; j < capacity && xs.length < CLONE_CAP; j++) {
      const angle = -Math.PI / 2 + (j / capacity) * Math.PI * 2;
      xs.push(Math.cos(angle) * ring * RING_SPACING);
      ys.push(Math.sin(angle) * ring * RING_SPACING);
    }
  }
}

/** Rings needed to hold `count` clones. */
export function ringsFor(count: number): number {
  let rings = 0;
  while (slotsThroughRing(rings) < count) rings++;
  return rings;
}

/** Radius of the formation's bounding circle around the shooter. */
export function formationRadius(count: number): number {
  return ringsFor(count) * RING_SPACING;
}

/** Lane position of clone `slot`. D2: slots that would leave the lane are squeezed inward. */
export function cloneX(sim: SimState, slot: number): number {
  const x = sim.shooter.x + SLOT_X[slot];
  return x < SHOOTER_MIN_X ? SHOOTER_MIN_X : x > SHOOTER_MAX_X ? SHOOTER_MAX_X : x;
}

export function cloneY(slot: number): number {
  return SHOOTER_Y + SLOT_Y[slot];
}

/** Adds up to `amount` clones; anything over the cap is discarded. Returns how many were added. */
export function addClones(sim: SimState, amount: number): number {
  const added = Math.max(0, Math.min(amount, CLONE_CAP - sim.clones));
  for (let i = 0; i < added; i++) {
    const slot = sim.clones++;
    sim.cloneCooldowns[slot] = ((slot * STAGGER) % 1) * CLONE_FIRE_PERIOD;
  }
  return added;
}

/** Each clone fires straight up at half the shooter's rate (SPEC 6.2). */
export function fireClones(sim: SimState): void {
  const cooldowns = sim.cloneCooldowns;
  for (let slot = 0; slot < sim.clones; slot++) {
    cooldowns[slot] -= SIM_DT;
    if (cooldowns[slot] <= 0) {
      spawnBullet(sim, cloneX(sim, slot), cloneY(slot) - MUZZLE_OFFSET, BULLET_REGULAR);
      cooldowns[slot] += CLONE_FIRE_PERIOD;
    }
  }
}

/**
 * Contact trades (D12, as changed by the owner in decisions A18 and A28): an
 * enemy that touches any cat, clone or shooter, kills it and takes
 * CONTACT_DAMAGE. The black shooter is not immune. When it dies the oldest clone is promoted, which leaves one clone
 * fewer; with no clone left the level is lost.
 *
 * B7: an enemy 8x8 or larger kills at most BIG_CONTACT_RATE cats per second.
 */
export function stepContact(sim: SimState, hash: SpatialHash): void {
  const enemies = sim.enemies.items;
  // Outermost slot first, down to -1, which stands for the shooter itself.
  for (let slot = sim.clones - 1; slot >= -1; slot--) {
    const x = slot < 0 ? sim.shooter.x : cloneX(sim, slot);
    const y = slot < 0 ? SHOOTER_Y : cloneY(slot);
    // Every cat has a body: an enemy touches it when their outlines meet,
    // not only when it steps on the cat's exact centre.
    const found = hash.queryRect(x - CAT_RADIUS, y - CAT_RADIUS, x + CAT_RADIUS, y + CAT_RADIUS, sim.enemies, touching);
    let hit = -1;
    for (let n = 0; n < found && hit < 0; n++) {
      const enemy = enemies[touching[n]];
      // Gates do not hurt, and a big enemy can only kill so many cats per second (B7).
      if (enemy.type === GATE_TYPE) continue;
      if (enemy.w >= BIG_CONTACT_MIN_SIZE && enemy.contact > 0) continue;
      hit = touching[n];
    }
    if (hit < 0) continue;

    const enemy = enemies[hit];
    if (enemy.w >= BIG_CONTACT_MIN_SIZE) enemy.contact = 1 / BIG_CONTACT_RATE;

    spawnFx(sim, FX_CAT, x, y, 1);
    damageEnemy(sim, hit, CONTACT_DAMAGE, x, y);
    if (sim.clones === 0) {
      sim.phase = 'lost';
      sim.lossReason = 'swarm';
      return;
    }
    sim.clones--;
  }
}

/** Scratch list of enemies touching one cat. Not part of the sim state. */
const touching = new Int32Array(8);
