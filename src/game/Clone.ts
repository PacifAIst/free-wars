import type { Enemy, SimState } from '../types';
import type { SpatialHash } from './Collision';
import {
  BIG_ENEMY_MIN_TYPE,
  BUBBLE_TYPE,
  CAT_RADIUS,
  CLONE_CAP,
  CLONE_FIRE_JITTER,
  CLONE_FIRE_RATE_FACTOR,
  CONTACT_DAMAGE,
  FIRE_RATE,
  GATE_TYPE,
  GATES_ARE_SHOT,
  MUZZLE_OFFSET,
  PUNCH_KILLS,
  RING_SLOTS_PER_RING,
  ROCKET_SHOOTERS,
  RING_SPACING,
  SHOOTER_Y,
  SIM_DT,
  SMASH_INTERVAL,
} from './constants';
import { damageEnemy } from './Enemy';
import { FX_CAT, FX_GATE, FX_PUNCH, spawnFx } from './Fx';
import { SHOOTER_MAX_X, SHOOTER_MIN_X } from './Player';
import { poolFree } from './Pool';
import { grantDrop, rollDrop } from './Powerup';
import { fireWeapon } from './Projectile';
import { nextRandom } from './rng';

// The swarm. Clones are identical, so the state is just their number: clone i
// stands in formation slot i. When one dies the formation re-packs, which
// simply means the outermost slot empties (SPEC 6.2).

const CLONE_FIRE_RATE = FIRE_RATE * CLONE_FIRE_RATE_FACTOR;
const CLONE_FIRE_PERIOD = 1 / CLONE_FIRE_RATE;

/** Number of slots in rings 1..k. */
const slotsThroughRing = (k: number): number => (RING_SLOTS_PER_RING * k * (k + 1)) / 2;

/**
 * Offsets of every formation slot from the shooter, in gu.
 * D8: ring k holds 6k slots at radius k times RING_SPACING. Slots fill
 * clockwise from 12 o'clock, then move out to the next ring (SPEC 6.2). y
 * grows down the screen, so a growing angle is clockwise as the player sees it.
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
    // A new clone starts somewhere in its fire interval, not on the beat of the others.
    sim.cloneCooldowns[sim.clones++] = nextRandom(sim) * CLONE_FIRE_PERIOD;
  }
  return added;
}

/**
 * Each clone fires straight up at half the shooter's rate (SPEC 6.2), with
 * whatever the swarm is armed with. The wait after a shot varies at random, so
 * no two clones keep the same beat (A31). B6: in rocket mode only the shooter
 * and the first clones fire rockets. Inside the tank nobody fires.
 */
export function fireClones(sim: SimState): void {
  if (sim.tank > 0) return;
  const cooldowns = sim.cloneCooldowns;
  for (let slot = 0; slot < sim.clones; slot++) {
    cooldowns[slot] -= SIM_DT;
    if (cooldowns[slot] <= 0) {
      const rocketeer = slot < ROCKET_SHOOTERS - 1;
      const wait = fireWeapon(sim, cloneX(sim, slot), cloneY(slot) - MUZZLE_OFFSET, rocketeer, CLONE_FIRE_RATE);
      cooldowns[slot] += wait * (1 + (nextRandom(sim) * 2 - 1) * CLONE_FIRE_JITTER);
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

/** Number of cats, the shooter included, standing within the width of `gate`. */
function catsInWay(sim: SimState, gate: Enemy): number {
  const reach = gate.w / 2 + CAT_RADIUS;
  let count = Math.abs(sim.shooter.x - gate.x) < reach ? 1 : 0;
  for (let slot = 0; slot < sim.clones; slot++) {
    if (Math.abs(cloneX(sim, slot) - gate.x) < reach) count++;
  }
  return count;
}

/** True when some cat's body touches the gate. */
function touchesSwarm(sim: SimState, gate: Enemy): boolean {
  const reachX = gate.w / 2 + CAT_RADIUS;
  const reachY = gate.h / 2 + CAT_RADIUS;
  if (Math.abs(sim.shooter.x - gate.x) < reachX && Math.abs(SHOOTER_Y - gate.y) < reachY) return true;
  for (let slot = 0; slot < sim.clones; slot++) {
    if (Math.abs(cloneX(sim, slot) - gate.x) < reachX && Math.abs(cloneY(slot) - gate.y) < reachY) return true;
  }
  return false;
}

/**
 * Gates and the swarm.
 *
 * A31, the rule in force: the swarm collects a gate by touching it. The gate
 * is used up and the swarm grows on the spot. It hurts nobody.
 *
 * A29, kept behind GATES_ARE_SHOT for the item the owner will name later: a
 * gate that reaches the swarm unbroken kills every cat standing in its way,
 * one by one as it ploughs through, and carries on. The cats beside it are
 * untouched, and closing ranks behind it saves nobody.
 */
function stepGates(sim: SimState): void {
  const enemies = sim.enemies.items;
  for (let i = 0; i < sim.enemies.high; i++) {
    const gate = enemies[i];
    if (!gate.active || gate.type !== GATE_TYPE) continue;
    const front = gate.y + gate.h / 2;
    const radius = formationRadius(sim.clones);
    if (front < SHOOTER_Y - radius - CAT_RADIUS) continue;

    if (!GATES_ARE_SHOT) {
      if (!touchesSwarm(sim, gate)) continue;
      const { x, y } = gate;
      const drop = gate.drop > 0 ? gate.drop : rollDrop(sim);
      poolFree(sim.enemies, i);
      grantDrop(sim, drop, x, y, FX_GATE);
      continue;
    }

    if (gate.swept < 0) {
      // It has arrived: the cats in its way are its victims.
      const victims = catsInWay(sim, gate);
      gate.quota = victims;
      // `contact` holds how far the gate advances between two kills.
      gate.contact = victims > 0 ? (2 * radius + 1) / victims : 0;
      gate.swept = front - gate.contact;
    }
    const reach = gate.w / 2 + CAT_RADIUS;
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

/** Scratch for `killNear`: squared distance of each slot from the fist, and whether its cat dies. */
const slotDistance = new Float32Array(CLONE_CAP);
const slotDies = new Uint8Array(CLONE_CAP);

/**
 * Kills the `kills` clones nearest the point (px, py): SPEC 7.3, "selected from
 * the nearest-to-boss side".
 *
 * Clones are identical, so the swarm state is still only their number and the
 * formation closes ranks by emptying its outermost slots. A cat that dies in an
 * inner slot is therefore replaced by a survivor from an outer slot, and each
 * FX_CAT effect says so: `tag` is the dead cat's slot plus one, `size` the
 * slot its replacement comes from. The renderer uses that to make the right
 * cats vanish and the others run in.
 *
 * Returns false when the punch also reached the shooter, which loses the level.
 */
export function killNear(sim: SimState, px: number, py: number, kills: number): boolean {
  const n = sim.clones;
  const count = Math.min(kills, n);
  for (let s = 0; s < n; s++) {
    const dx = cloneX(sim, s) - px;
    const dy = cloneY(s) - py;
    slotDistance[s] = dx * dx + dy * dy;
    slotDies[s] = 0;
  }
  for (let k = 0; k < count; k++) {
    let best = -1;
    for (let s = 0; s < n; s++) {
      if (slotDies[s] === 0 && (best < 0 || slotDistance[s] < slotDistance[best])) best = s;
    }
    slotDies[best] = 1;
  }
  removeMarked(sim, n, count);
  if (kills <= n) return true;
  spawnFx(sim, FX_CAT, sim.shooter.x, SHOOTER_Y, 1);
  sim.phase = 'lost';
  sim.lossReason = 'swarm';
  return false;
}

/** Removes the `count` clones marked in `slotDies`, out of `n`, and closes ranks (see `killNear`). */
function removeMarked(sim: SimState, n: number, count: number): void {
  const left = n - count;
  // Next slot beyond the new formation whose cat lives: it moves into a dead cat's place.
  let spare = left;
  for (let s = 0; s < n; s++) {
    if (slotDies[s] === 0) continue;
    let from = s;
    if (s < left) {
      while (slotDies[spare] !== 0) spare++;
      from = spare++;
      sim.cloneCooldowns[s] = sim.cloneCooldowns[from];
    }
    spawnFx(sim, FX_CAT, cloneX(sim, s), cloneY(s), from, s + 1);
  }
  sim.clones = left;
}

/**
 * An enemy rocket's blast (SPEC 7.2): every cat inside the square of half-side
 * `half` round (x, y) dies, the shooter included; a clone then takes its place.
 * Returns false when no cat is left, which loses the level.
 */
export function killInSquare(sim: SimState, x: number, y: number, half: number): boolean {
  const n = sim.clones;
  let count = 0;
  for (let s = 0; s < n; s++) {
    const inside = Math.abs(cloneX(sim, s) - x) <= half && Math.abs(cloneY(s) - y) <= half;
    slotDies[s] = inside ? 1 : 0;
    if (inside) count++;
  }
  removeMarked(sim, n, count);
  if (Math.abs(sim.shooter.x - x) > half || Math.abs(SHOOTER_Y - y) > half) return true;
  return loseCat(sim, sim.shooter.x, SHOOTER_Y);
}

/**
 * A tank bubble that reaches the swarm unopened runs over the cats in its way
 * (A38): the ones standing within its width when it arrives, the shooter
 * included. It does so once, then passes. The cats beside it are untouched.
 *
 * Returns false when the level was lost.
 */
function runOver(sim: SimState, e: Enemy): boolean {
  if (e.swept >= 0) return true;
  const reach = formationRadius(sim.clones) + CAT_RADIUS;
  const dx = Math.max(Math.abs(e.x - sim.shooter.x) - e.w / 2, 0);
  const dy = Math.max(Math.abs(e.y - SHOOTER_Y) - e.h / 2, 0);
  if (dx * dx + dy * dy >= reach * reach) return true;
  e.swept = 1;
  const victims = catsInWay(sim, e);
  if (victims === 0) return true;
  const px = Math.min(Math.max(sim.shooter.x, e.x - e.w / 2), e.x + e.w / 2);
  spawnFx(sim, FX_PUNCH, px, e.y + e.h / 2, victims, e.type);
  const shooterHit = Math.abs(sim.shooter.x - e.x) < e.w / 2 + CAT_RADIUS;
  // The clones in its way die first; the shooter too if it stands there, and a clone takes its place.
  killNear(sim, px, e.y + e.h / 2, Math.min(sim.clones, victims - (shooterHit ? 1 : 0)));
  return shooterHit ? loseCat(sim, sim.shooter.x, SHOOTER_Y) : true;
}

/**
 * Punches (SPEC 7.3, decision A33). A big rat whose body reaches the swarm
 * winds up for SMASH_INTERVAL seconds, then punches: PUNCH_KILLS cats die at
 * once. It keeps punching at that pace while the swarm is in reach. A swarm
 * that gets clear during the wind-up is not hit.
 *
 * The cats lost are the ones nearest the fist (see `killNear`). A punch that
 * finds fewer clones than it can kill takes the shooter too, and the level is
 * lost.
 *
 * Returns false when the level was lost.
 */
function stepPunches(sim: SimState): boolean {
  const reach = formationRadius(sim.clones) + CAT_RADIUS;
  const sx = sim.shooter.x;
  const enemies = sim.enemies.items;
  for (let i = 0; i < sim.enemies.high; i++) {
    const e = enemies[i];
    if (!e.active || e.type < BIG_ENEMY_MIN_TYPE || e.type === GATE_TYPE) continue;
    if (e.type === BUBBLE_TYPE) {
      if (!runOver(sim, e)) return false;
      continue;
    }
    e.swing += SIM_DT;
    // Distance from the swarm's centre to the nearest point of the rat's footprint.
    const dx = Math.max(Math.abs(e.x - sx) - e.w / 2, 0);
    const dy = Math.max(Math.abs(e.y - SHOOTER_Y) - e.h / 2, 0);
    const inReach = dx * dx + dy * dy < reach * reach;
    if (!e.winding) {
      if (inReach && e.contact <= 0) {
        e.winding = true;
        e.contact = SMASH_INTERVAL;
      }
      continue;
    }
    if (e.contact > 0) continue;
    if (!inReach) {
      e.winding = false;
      continue;
    }

    e.punches++;
    e.swing = 0;
    e.contact = SMASH_INTERVAL;
    const kills = PUNCH_KILLS[e.type];
    const px = Math.min(Math.max(sx, e.x - e.w / 2), e.x + e.w / 2);
    const py = Math.min(Math.max(SHOOTER_Y, e.y - e.h / 2), e.y + e.h / 2);
    spawnFx(sim, FX_PUNCH, px, py, Math.min(kills, sim.clones + 1), e.type);
    if (!killNear(sim, px, py, kills)) return false;
  }
  return true;
}

/**
 * Contact (D12, as changed by the owner in decisions A18, A28 and A33).
 *
 * A minion that touches any cat, clone or shooter, kills it and takes
 * CONTACT_DAMAGE. Every cat has a body: the rat only has to touch its outline.
 * The black shooter is not immune; when it dies the oldest clone is promoted,
 * and with no clone left the level is lost. Big rats do not trade one for one:
 * they punch (see `stepPunches`).
 *
 * Inside the tank the swarm cannot be hurt; it still collects gates.
 */
export function stepContact(sim: SimState, hash: SpatialHash): void {
  stepGates(sim);
  if (sim.phase !== 'playing' || sim.tank > 0) return;
  if (!stepPunches(sim)) return;

  const enemies = sim.enemies.items;
  // Outermost slot first, down to -1, which stands for the shooter itself.
  for (let slot = sim.clones - 1; slot >= -1; slot--) {
    const x = slot < 0 ? sim.shooter.x : cloneX(sim, slot);
    const y = slot < 0 ? SHOOTER_Y : cloneY(slot);
    const found = hash.queryRect(x - CAT_RADIUS, y - CAT_RADIUS, x + CAT_RADIUS, y + CAT_RADIUS, sim.enemies, touching);
    let hit = -1;
    for (let n = 0; n < found && hit < 0; n++) {
      const type = enemies[touching[n]].type;
      if (type < BIG_ENEMY_MIN_TYPE) hit = touching[n];
    }
    if (hit < 0) continue;

    damageEnemy(sim, hit, CONTACT_DAMAGE, x, y);
    if (!loseCat(sim, x, y)) return;
  }
}

/** Scratch list of enemies touching one cat. Not part of the sim state. */
const touching = new Int32Array(8);
