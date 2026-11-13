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

/** Lane position of clone `slot`. D2: slots that would pass the outer walls are squeezed inward. */
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

/** One cat dies. Returns false when it was the last one, which loses the level. */
function loseCat(sim: SimState, x: number, y: number): boolean {
  spawnFx(sim, FX_CAT, x, y, 1);
  if (sim.clones === 0) {
    sim.phase = 'lost';
    sim.lossReason = 'swarm';
    return false;
  }
  // A dead shooter is replaced by the oldest clone; either way the swarm is one smaller.
  sim.clones--;
  return true;
}

/**
 * Gates crush (A29): a gate that reaches the swarm unbroken kills every cat in
 * its way and carries on.
 *
 * When its front edge reaches the formation, the gate counts the cats standing
 * within its width. Those are its victims. It then kills them one by one as
 * it ploughs through, so the losses are spread over the pass. The cats beside
 * it are untouched, and closing ranks behind it saves nobody.
 */
function stepGates(sim: SimState): void {
  const enemies = sim.enemies.items;
  for (let i = 0; i < sim.enemies.high; i++) {
    const gate = enemies[i];
    if (!gate.active || gate.type !== GATE_TYPE) continue;
    const front = gate.y + gate.h / 2;
    const reach = gate.w / 2 + CAT_RADIUS;

    if (gate.swept < 0) {
      const radius = formationRadius(sim.clones);
      if (front < SHOOTER_Y - radius - CAT_RADIUS) continue;
      // It has arrived: count the cats in its way, the shooter included.
      let victims = Math.abs(sim.shooter.x - gate.x) < reach ? 1 : 0;
      for (let slot = 0; slot < sim.clones; slot++) {
        if (Math.abs(cloneX(sim, slot) - gate.x) < reach) victims++;
      }
      gate.quota = victims;
      // `contact` holds how far the gate advances between two kills.
      gate.contact = victims > 0 ? (2 * radius + 1) / victims : 0;
      gate.swept = front - gate.contact;
    }

    while (gate.quota > 0 && front - gate.swept >= gate.contact) {
      gate.swept += gate.contact;
      gate.quota--;
      // Show the loss on a cat that is actually under the gate, if one still is.
      let x = sim.shooter.x;
      let y = SHOOTER_Y;
      for (let slot = sim.clones - 1; slot >= 0; slot--) {
        const cx = cloneX(sim, slot);
        if (Math.abs(cx - gate.x) < reach) {
          x = cx;
          y = cloneY(slot);
          break;
        }
      }
      if (!loseCat(sim, x, y)) return;
    }
  }
}

/**
 * Contact (D12, as changed by the owner in decisions A18, A28 and A29).
 *
 * A rat that touches any cat, clone or shooter, kills it and takes
 * CONTACT_DAMAGE. Every cat has a body: the rat only has to touch its outline.
 * The black shooter is not immune; when it dies the oldest clone is promoted,
 * and with no clone left the level is lost.
 *
 * B7: an enemy 8x8 or larger kills at most BIG_CONTACT_RATE cats per second.
 */
export function stepContact(sim: SimState, hash: SpatialHash): void {
  stepGates(sim);
  if (sim.phase !== 'playing') return;

  const enemies = sim.enemies.items;
  // Outermost slot first, down to -1, which stands for the shooter itself.
  for (let slot = sim.clones - 1; slot >= -1; slot--) {
    const x = slot < 0 ? sim.shooter.x : cloneX(sim, slot);
    const y = slot < 0 ? SHOOTER_Y : cloneY(slot);
    const found = hash.queryRect(x - CAT_RADIUS, y - CAT_RADIUS, x + CAT_RADIUS, y + CAT_RADIUS, sim.enemies, touching);
    let hit = -1;
    for (let n = 0; n < found && hit < 0; n++) {
      const enemy = enemies[touching[n]];
      if (enemy.type === GATE_TYPE) continue;
      if (enemy.w >= BIG_CONTACT_MIN_SIZE && enemy.contact > 0) continue;
      hit = touching[n];
    }
    if (hit < 0) continue;

    const enemy = enemies[hit];
    if (enemy.w >= BIG_CONTACT_MIN_SIZE) enemy.contact = 1 / BIG_CONTACT_RATE;
    damageEnemy(sim, hit, CONTACT_DAMAGE, x, y);
    if (!loseCat(sim, x, y)) return;
  }
}

/** Scratch list of enemies touching one cat. Not part of the sim state. */
const touching = new Int32Array(8);
