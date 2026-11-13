import { describe, expect, it } from 'vitest';
import { addClones, cloneX, cloneY, formationRadius, ringsFor, SLOT_X, SLOT_Y, stepContact } from '../src/game/Clone';
import {
  CLONE_BOX_AMOUNTS,
  CLONE_CAP,
  CLONE_FIRE_RATE_FACTOR,
  DROP_CLONE_1,
  DROP_CLONE_10,
  DROP_CLONE_50,
  DROP_MINIGUN,
  DROP_TANK,
  ENEMY_STATS,
  FIRE_RATE,
  POWERUP_SPEED,
  POWERUP_WIDTH,
  RING_SPACING,
  SHOOTER_Y,
  SIM_HZ,
  START_CLONES,
  UNIT,
  WINDOW_ROWS,
} from '../src/game/constants';
import { spawnEnemy } from '../src/game/Enemy';
import { SHOOTER_MAX_X, SHOOTER_MIN_X } from '../src/game/Player';
import { isCloneBox, rollDrop, spawnDrop } from '../src/game/Powerup';
import { createSim } from '../src/game/Sim';
import type { SimState } from '../src/types';
import { createScratch, gap, LONE, mapFromRows, rowWith, run } from './helpers';

/** One rat far up the file, so the level stays in progress while a test sets things up. */
const FAR = mapFromRows([...gap(400), rowWith({ 0: 'E1' })]);

/** Puts an enemy with its centre on (x, y), as nearly as the grid allows, and resolves contact once. */
function touch(sim: SimState, type: number, x: number, y: number, hp = 0): void {
  const { w, h } = ENEMY_STATS[type];
  spawnEnemy(sim, type, Math.round(x - w / 2), 0, y + h / 2, hp, 0);
  const scratch = createScratch();
  scratch.hash.build(sim.enemies);
  stepContact(sim, scratch.hash);
}

describe('formation (D8, SPEC 6.2)', () => {
  it('has a slot for every clone up to the cap', () => {
    expect(SLOT_X).toHaveLength(CLONE_CAP);
    expect(SLOT_Y).toHaveLength(CLONE_CAP);
  });

  it('cats are twice their first size: rings are RING_SPACING apart (A31)', () => {
    expect(RING_SPACING).toBe(UNIT);
  });

  it('fills ring 1 clockwise from 12 o clock, 60 degrees apart', () => {
    // Slot 0 is straight up the lane from the shooter (y grows towards the goal line).
    expect(SLOT_X[0]).toBeCloseTo(0, 9);
    expect(SLOT_Y[0]).toBeCloseTo(-RING_SPACING, 9);
    // Slot 1 is up and to the right: clockwise as the player sees it.
    expect(SLOT_X[1]).toBeCloseTo(Math.sin(Math.PI / 3) * RING_SPACING, 9);
    expect(SLOT_Y[1]).toBeCloseTo(-0.5 * RING_SPACING, 9);
    expect(SLOT_X[3]).toBeCloseTo(0, 9);
    expect(SLOT_Y[3]).toBeCloseTo(RING_SPACING, 9);
    for (let i = 0; i < 6; i++) expect(Math.hypot(SLOT_X[i], SLOT_Y[i])).toBeCloseTo(RING_SPACING, 9);
  });

  it('moves out to ring 2 at the 7th clone, with 12 slots', () => {
    expect(SLOT_X[6]).toBeCloseTo(0, 9);
    expect(SLOT_Y[6]).toBeCloseTo(-2 * RING_SPACING, 9);
    for (let i = 6; i < 18; i++) expect(Math.hypot(SLOT_X[i], SLOT_Y[i])).toBeCloseTo(2 * RING_SPACING, 9);
    expect(Math.hypot(SLOT_X[18], SLOT_Y[18])).toBeCloseTo(3 * RING_SPACING, 9);
  });

  it('holds 100 clones in six rings, the last one partly filled', () => {
    expect(ringsFor(0)).toBe(0);
    expect(ringsFor(1)).toBe(1);
    expect(ringsFor(6)).toBe(1);
    expect(ringsFor(7)).toBe(2);
    expect(ringsFor(18)).toBe(2);
    expect(ringsFor(90)).toBe(5);
    expect(ringsFor(100)).toBe(6);
    expect(Math.hypot(SLOT_X[99], SLOT_Y[99])).toBeCloseTo(6 * RING_SPACING, 9);
    expect(formationRadius(100)).toBe(6 * RING_SPACING);
    // The whole formation stays above the goal line.
    for (let i = 0; i < CLONE_CAP; i++) expect(cloneY(i)).toBeLessThan(WINDOW_ROWS);
  });

  it('keeps neighbours about one cat apart', () => {
    for (let i = 1; i < 6; i++) {
      expect(Math.hypot(SLOT_X[i] - SLOT_X[i - 1], SLOT_Y[i] - SLOT_Y[i - 1])).toBeCloseTo(RING_SPACING, 6);
    }
  });

  it('re-packs when a clone dies: the outermost slot empties', () => {
    const sim = createSim(FAR, 1, { startClones: 7 });
    // A rat lands on slot 2; afterwards slots 0..5 are all still filled.
    touch(sim, 1, cloneX(sim, 2), cloneY(2));
    expect(sim.clones).toBe(6);
    expect(ringsFor(sim.clones)).toBe(1);
  });

  it('squeezes slots that would pass the outer wall inward (D2)', () => {
    const sim = createSim(FAR, 1, { startClones: 60 });
    const scratch = createScratch();
    run(sim, FAR, scratch, 1, { targetDelta: 60, keyDir: 0 });
    run(sim, FAR, scratch, 3 * SIM_HZ);
    expect(sim.shooter.x).toBeCloseTo(SHOOTER_MAX_X, 2);
    for (let i = 0; i < sim.clones; i++) {
      expect(cloneX(sim, i)).toBeLessThanOrEqual(SHOOTER_MAX_X);
      expect(cloneX(sim, i)).toBeGreaterThanOrEqual(SHOOTER_MIN_X);
    }
    // Slots on the lane side are untouched.
    expect(cloneX(sim, 4)).toBeCloseTo(sim.shooter.x + SLOT_X[4], 9);
  });
});

describe('clones (SPEC 6.2, B2)', () => {
  it('starts each level with START_CLONES clones: the black cat is alone (A28)', () => {
    expect(START_CLONES).toBe(0);
    expect(createSim(FAR, 1).clones).toBe(START_CLONES);
    expect(createSim(FAR, 1, { startClones: 4 }).clones).toBe(4);
  });

  it('caps the swarm at 100 and discards the rest', () => {
    const sim = createSim(FAR, 1, LONE);
    expect(addClones(sim, 60)).toBe(60);
    expect(addClones(sim, 50)).toBe(40);
    expect(sim.clones).toBe(CLONE_CAP);
    expect(addClones(sim, 10)).toBe(0);
    expect(sim.cloneCooldowns).toHaveLength(CLONE_CAP);
  });

  it('each clone fires at half the shooter rate on average, from its own slot', () => {
    const sim = createSim(FAR, 1, { startClones: 10 });
    const scratch = createScratch();
    run(sim, FAR, scratch, 10 * SIM_HZ);
    const expected = 10 * FIRE_RATE + 10 * 10 * FIRE_RATE * CLONE_FIRE_RATE_FACTOR;
    expect(sim.shots).toBeGreaterThan(expected * 0.88);
    expect(sim.shots).toBeLessThan(expected * 1.12);
    const columns = new Set(sim.bullets.items.filter((b) => b.active).map((b) => b.x.toFixed(3)));
    expect(columns.size).toBeGreaterThan(5);
  });
});

describe('fire timing (A31): no two cats keep the same beat', () => {
  /** Tick numbers at which the shot counter went up. */
  function shotTicks(sim: SimState, seconds: number): number[] {
    const scratch = createScratch();
    const ticks: number[] = [];
    for (let i = 0; i < seconds * SIM_HZ; i++) {
      const before = sim.shots;
      run(sim, FAR, scratch, 1);
      for (let n = before; n < sim.shots; n++) ticks.push(sim.tick);
    }
    return ticks;
  }

  it('the shooter varies the time between its shots', () => {
    const ticks = shotTicks(createSim(FAR, 1, LONE), 12);
    const waits = ticks.slice(1).map((t, i) => t - ticks[i]);
    expect(new Set(waits).size).toBeGreaterThan(4);
    const mean = waits.reduce((a, b) => a + b, 0) / waits.length;
    expect(mean / SIM_HZ).toBeCloseTo(1 / FIRE_RATE, 1);
  });

  it('the swarm never fires as one volley', () => {
    const sim = createSim(FAR, 1, { startClones: 60 });
    const ticks = shotTicks(sim, 6);
    const perTick = new Map<number, number>();
    for (const t of ticks) perTick.set(t, (perTick.get(t) ?? 0) + 1);
    // 62 shots a second over 60 ticks: about one per tick. A volley would be 61 at once.
    expect(Math.max(...perTick.values())).toBeLessThanOrEqual(10);
  });

  it('the pattern of shots does not repeat from one second to the next', () => {
    const sim = createSim(FAR, 1, { startClones: 30 });
    const ticks = shotTicks(sim, 8);
    const second = (n: number): string =>
      Array.from({ length: SIM_HZ }, (_, i) => ticks.filter((t) => t === n * SIM_HZ + i + 1).length).join('');
    expect(second(3)).not.toBe(second(4));
    expect(second(4)).not.toBe(second(5));
    expect(second(5)).not.toBe(second(6));
  });

  it('clones that join together do not start on the same beat', () => {
    const sim = createSim(FAR, 1, LONE);
    addClones(sim, 10);
    const starts = new Set(sim.cloneCooldowns.slice(0, 10).map((c) => c.toFixed(3)));
    expect(starts.size).toBe(10);
  });
});

describe('contact trades (D12 as changed by A18 and A28)', () => {
  it('a rat that touches a clone kills it and dies itself', () => {
    const sim = createSim(FAR, 1, { startClones: 1 });
    touch(sim, 1, cloneX(sim, 0), cloneY(0));
    expect(sim.clones).toBe(0);
    expect(sim.kills).toBe(1);
    expect(sim.phase).toBe('playing');
  });

  it('an E2 costs two cats', () => {
    const sim = createSim(FAR, 1, { startClones: 6 });
    // It lands among the clones of ring 1, in reach of more than one of them.
    touch(sim, 2, cloneX(sim, 0), cloneY(0));
    expect(sim.clones).toBe(4);
    expect(sim.kills).toBe(1);
    expect(sim.phase).toBe('playing');
  });

  it('every clone has a body: a rat passing between two of them still hits one', () => {
    const sim = createSim(FAR, 1, { startClones: 6 });
    // Half way between slot 0 and slot 1: on neither centre.
    const x = (cloneX(sim, 0) + cloneX(sim, 1)) / 2;
    const y = (cloneY(0) + cloneY(1)) / 2;
    touch(sim, 1, x, y);
    expect(sim.clones).toBe(5);
    expect(sim.kills).toBe(1);
  });

  it('the black shooter is not immune: with no clone left the level is lost', () => {
    const sim = createSim(FAR, 1, LONE);
    touch(sim, 1, sim.shooter.x, SHOOTER_Y);
    expect(sim.phase).toBe('lost');
    expect(sim.lossReason).toBe('swarm');
    expect(sim.kills).toBe(1);
  });

  it('when the shooter is hit, a clone is promoted and play goes on', () => {
    const sim = createSim(FAR, 1, { startClones: 3 });
    // A rat right behind the shooter touches it and none of the clones in front.
    touch(sim, 3, sim.shooter.x, SHOOTER_Y + UNIT, 1);
    expect(sim.phase).toBe('playing');
    expect(sim.clones).toBe(2);
  });

  it('cats that are not touched are safe', () => {
    const sim = createSim(FAR, 1, { startClones: 6 });
    touch(sim, 1, sim.shooter.x + 10, SHOOTER_Y);
    expect(sim.clones).toBe(6);
    expect(sim.kills).toBe(0);
  });

  it('a big rat does not trade one for one: it punches (see weapons.test.ts)', () => {
    const sim = createSim(FAR, 1, { startClones: 6 });
    // A fat rat far enough up the lane to touch only the front clone.
    touch(sim, 4, sim.shooter.x, cloneY(0) - ENEMY_STATS[4].h / 2 + 0.5);
    expect(sim.clones).toBe(6);
    expect(sim.kills).toBe(0);
  });
});

describe('boxes dropped by fat rats (B4, B8, B9)', () => {
  it('an authored drop falls from where the enemy died, faster than the march', () => {
    const map = mapFromRows([rowWith({ 22: 'E1-P3' }), ...gap(400), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    while (sim.powerups.live === 0 && sim.tick < 5 * SIM_HZ) run(sim, map, scratch, 1);
    const box = sim.powerups.items.find((p) => p.active)!;
    expect(box.kind).toBe(DROP_CLONE_10);
    expect(box.x).toBe(23);
    const y = box.y;
    run(sim, map, scratch, 30);
    expect(box.y - y).toBeCloseTo(POWERUP_SPEED * 0.5, 6);
  });

  it('is picked up by the swarm and adds its clones', () => {
    for (const [token, amount] of [
      ['E1-P1', 1],
      ['E1-P2', 3],
      ['E1-P3', 10],
      ['E1-P4', 50],
    ] as const) {
      const map = mapFromRows([rowWith({ 22: token }), ...gap(400), rowWith({ 0: 'E1' })]);
      const sim = createSim(map, 1, LONE);
      const scratch = createScratch();
      while (sim.clones === 0 && sim.tick < 10 * SIM_HZ) run(sim, map, scratch, 1);
      expect(sim.clones).toBe(amount);
      expect(sim.powerups.live).toBe(0);
    }
    expect(CLONE_BOX_AMOUNTS).toEqual([1, 3, 10, 50]);
  });

  it('is lost if it reaches the goal line away from the swarm', () => {
    const sim = createSim(FAR, 1, LONE);
    const scratch = createScratch();
    spawnDrop(sim, DROP_CLONE_10, 2, WINDOW_ROWS - 20);
    run(sim, FAR, scratch, 3 * SIM_HZ);
    expect(sim.powerups.live).toBe(0);
    expect(sim.clones).toBe(0);
  });

  it('reaches further as the swarm grows (B9)', () => {
    // Out of a lone shooter's reach, which is half the width of a box; within a four-ring swarm's.
    const offset = POWERUP_WIDTH / 2 + 2 * RING_SPACING;
    const sim = createSim(FAR, 1, { startClones: 40 });
    const scratch = createScratch();
    spawnDrop(sim, DROP_CLONE_1, sim.shooter.x + offset, SHOOTER_Y - 0.5);
    run(sim, FAR, scratch, 2);
    expect(sim.clones).toBe(41);

    const lone = createSim(FAR, 1, LONE);
    spawnDrop(lone, DROP_CLONE_1, lone.shooter.x + offset, SHOOTER_Y - 0.5);
    run(lone, FAR, scratch, 2);
    expect(lone.clones).toBe(0);
  });

  it('rolls drops by the weights of B4', () => {
    const sim = createSim(FAR, 99, LONE);
    const counts = new Map<number, number>();
    const rolls = 20000;
    for (let i = 0; i < rolls; i++) {
      const code = rollDrop(sim);
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    const share = (code: number): number => (counts.get(code) ?? 0) / rolls;
    // Clone box 60% split 40/35/20/5; minigun 15%; rocket 10%; laser 10%; tank 5%.
    expect(share(DROP_CLONE_1)).toBeCloseTo(0.24, 1);
    expect(share(DROP_CLONE_1 + 1)).toBeCloseTo(0.21, 1);
    expect(share(DROP_CLONE_10)).toBeCloseTo(0.12, 1);
    expect(share(DROP_CLONE_50)).toBeCloseTo(0.03, 1);
    expect(share(DROP_CLONE_50)).toBeLessThan(0.05);
    expect(share(DROP_MINIGUN)).toBeCloseTo(0.15, 1);
    expect(share(DROP_TANK)).toBeCloseTo(0.05, 1);
    let total = 0;
    for (const n of counts.values()) total += n;
    expect(total).toBe(rolls);
  });

  it('a weapon code falls as its own box', () => {
    const sim = createSim(FAR, 1, LONE);
    expect(isCloneBox(DROP_CLONE_1)).toBe(true);
    expect(isCloneBox(DROP_CLONE_50)).toBe(true);
    expect(isCloneBox(DROP_MINIGUN)).toBe(false);
    spawnDrop(sim, DROP_MINIGUN, 2, 10);
    spawnDrop(sim, DROP_CLONE_10, 4, 10);
    expect(sim.powerups.live).toBe(2);
    const kinds = sim.powerups.items.filter((p) => p.active).map((p) => p.kind);
    expect(kinds).toEqual([DROP_MINIGUN, DROP_CLONE_10]);
  });
});
