import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BASE_HP,
  BULLET_SPEED,
  COLS,
  FIRE_RATE,
  MARCH_SPEED,
  POOL_BULLETS,
  POOL_ENEMIES,
  POOL_PARTICLES,
  PRE_ADVANCE_ROWS,
  SHOOTER_Y,
  SIM_HZ,
  WINDOW_ROWS,
} from '../src/game/constants';
import { spawnEnemy } from '../src/game/Enemy';
import { createSim, stepSim } from '../src/game/Sim';
import { parseMap } from '../src/parsers/markdownMapParser';
import type { MapData, SimInput, SimState } from '../src/types';
import { activeEnemies, botInput, createScratch, fullRow, IDLE, LONE, mapFromRows, rowWith, run } from './helpers';

/** Shooter starts at x = 22, which is inside column 22 (x from 22 to 23). */
const SHOOTER_COL = 22;
/** Seconds for row 0 to march from its starting place to the goal line. */
const SECONDS_TO_GOAL = (WINDOW_ROWS - PRE_ADVANCE_ROWS) / MARCH_SPEED;

function builtIn(id: string): MapData {
  const text = readFileSync(fileURLToPath(new URL(`../public/maps/${id}.md`, import.meta.url)), 'utf8');
  const result = parseMap(text);
  if (!result.ok) throw new Error(`map ${id} does not parse`);
  return result.map;
}

describe('shooting', () => {
  it('fires FIRE_RATE bullets per second straight up from the shooter', () => {
    const map = mapFromRows([rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    run(sim, map, scratch, 1);
    expect(sim.shots).toBe(1);
    const first = sim.bullets.items.find((b) => b.active)!;
    expect(first.x).toBe(sim.shooter.x);
    expect(first.y).toBeLessThan(SHOOTER_Y);
    run(sim, map, scratch, 10 * SIM_HZ - 1);
    expect(sim.shots).toBeGreaterThanOrEqual(10 * FIRE_RATE);
    expect(sim.shots).toBeLessThanOrEqual(10 * FIRE_RATE + 1);
  });

  it('moves bullets at BULLET_SPEED and expires them at the top of the window (B3)', () => {
    const map = mapFromRows([rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    run(sim, map, scratch, 1);
    const bullet = sim.bullets.items.find((b) => b.active)!;
    const y0 = bullet.y;
    run(sim, map, scratch, 30);
    expect(y0 - bullet.y).toBeCloseTo(BULLET_SPEED * 0.5, 6);
    for (let i = 0; i < 5 * SIM_HZ; i++) {
      run(sim, map, scratch, 1);
      for (const b of sim.bullets.items) {
        if (b.active) {
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeLessThan(SHOOTER_Y);
        }
      }
    }
    // Steady state: a bullet lives about 1.2 s, so only a few exist at once.
    expect(sim.bullets.live).toBeLessThanOrEqual(5);
    expect(sim.bullets.items).toHaveLength(POOL_BULLETS);
  });

  it('follows the shooter when the map slides', () => {
    const map = mapFromRows([rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    stepSim(sim, map, { targetDelta: 8, keyDir: 0 }, scratch);
    run(sim, map, scratch, 90);
    const newest = sim.bullets.items.filter((b) => b.active).sort((a, b) => b.y - a.y)[0];
    expect(newest.x).toBeCloseTo(30, 1);
  });

  it('kills an E1 with one bullet', () => {
    const map = mapFromRows([rowWith({ [SHOOTER_COL]: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    run(sim, map, createScratch(), SIM_HZ * 2);
    expect(sim.kills).toBe(1);
    expect(sim.enemies.live).toBe(0);
    expect(sim.shots).toBeGreaterThanOrEqual(1);
  });

  it('needs 2 hits for an E2 and 4 for an E3', () => {
    for (const [token, hp] of [
      ['E2', 2],
      ['E3', 4],
    ] as const) {
      const map = mapFromRows([rowWith({ [SHOOTER_COL]: token })]);
      const sim = createSim(map, 1, LONE);
      const scratch = createScratch();
      const seen = new Set<number>();
      while (sim.enemies.live > 0 && sim.tick < 10 * SIM_HZ) {
        run(sim, map, scratch, 1);
        const e = activeEnemies(sim)[0];
        if (e) seen.add(e.hp);
      }
      expect(sim.kills).toBe(1);
      expect([...seen].sort((a, b) => b - a)).toEqual(Array.from({ length: hp }, (_, i) => hp - i));
    }
  });

  it('flashes an enemy that survives a hit', () => {
    const map = mapFromRows([rowWith({ [SHOOTER_COL]: 'E3' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    while (activeEnemies(sim)[0].hp === 4) run(sim, map, scratch, 1);
    expect(activeEnemies(sim)[0].flash).toBeGreaterThan(0);
    expect(sim.fx.live).toBeGreaterThan(0);
  });

  it('only hits enemies in the column of fire', () => {
    // The rat in column 19 is beside the line of fire at x = 22, and still far up the lane.
    const map = mapFromRows([rowWith({ [SHOOTER_COL - 3]: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    run(sim, map, createScratch(), 2 * SIM_HZ);
    expect(sim.kills).toBe(0);
    expect(sim.enemies.live).toBe(1);
  });

  it('hits the visible part of a big enemy and wears it down', () => {
    const map = mapFromRows([rowWith({ 16: 'E4-10' })]);
    const sim = createSim(map, 1, LONE);
    run(sim, map, createScratch(), 8 * SIM_HZ);
    expect(sim.kills).toBe(1);
  });

  it('one bullet damages one enemy', () => {
    const map = mapFromRows(Array.from({ length: 6 }, () => rowWith({ [SHOOTER_COL]: 'E1' })));
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    while (sim.kills === 0) run(sim, map, scratch, 1);
    expect(sim.kills).toBe(1);
    expect(sim.enemies.live).toBe(5);
  });
});

describe('goal line (B1 with the owner rule A18)', () => {
  it('has no lives: BASE_HP is 1', () => {
    expect(BASE_HP).toBe(1);
  });

  it('loses the level when the first enemy crosses it', () => {
    const map = mapFromRows([...Array.from({ length: 60 }, () => ''), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1);
    const scratch = createScratch();
    // Two rats that have already got past the swarm, one a little ahead of the other.
    spawnEnemy(sim, 1, 5, 0, SHOOTER_Y + 4, 0, 0);
    spawnEnemy(sim, 3, 30, 0, SHOOTER_Y + 2, 0, 0);
    while (sim.phase === 'playing' && sim.tick < 10 * SIM_HZ) {
      for (const e of activeEnemies(sim)) expect(e.y + e.h / 2).toBeLessThan(WINDOW_ROWS);
      run(sim, map, scratch, 1);
    }
    expect(sim.phase).toBe('lost');
    expect(sim.lossReason).toBe('base');
    expect(sim.baseHp).toBe(0);
    // It took the first rat the march time for the remaining 4 rows.
    expect(sim.tick / SIM_HZ).toBeCloseTo(4 / MARCH_SPEED, 1);
    // The rat that crossed is removed; the second one had not arrived yet.
    expect(sim.enemies.live).toBe(1);
    expect(activeEnemies(sim)[0].type).toBe(3);
  });

  it('a rat marching straight needs the documented time to reach the line', () => {
    expect(SECONDS_TO_GOAL).toBeCloseTo((WINDOW_ROWS - PRE_ADVANCE_ROWS) / MARCH_SPEED, 9);
    expect(SECONDS_TO_GOAL).toBeGreaterThan(10);
    expect(SECONDS_TO_GOAL).toBeLessThan(25);
  });

  it('reports a boss crossing as its own reason', () => {
    const map = mapFromRows([...Array.from({ length: 60 }, () => ''), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    // A boss whose front edge is a step from the goal line, away from the shooter.
    spawnEnemy(sim, 5, 24, 0, WINDOW_ROWS - 0.01, 0, 0);
    run(sim, map, createScratch(), 1);
    expect(sim.phase).toBe('lost');
    expect(sim.lossReason).toBe('boss');
  });
});

describe('win condition (D5)', () => {
  it('needs the end of the file and no enemy alive', () => {
    const rows = Array.from({ length: 30 }, () => rowWith({ [SHOOTER_COL]: 'E1' }));
    const map = mapFromRows(rows);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    while (sim.phase === 'playing' && sim.tick < 120 * SIM_HZ) {
      run(sim, map, scratch, 1);
      if ((sim.phase as string) === 'won') {
        expect(sim.nextRow).toBe(30);
        expect(sim.enemies.live).toBe(0);
      }
    }
    expect(sim.phase).toBe('won');
    expect(sim.kills).toBe(30);
  });

  it('does not win while rows are still to come', () => {
    const rows = [rowWith({ [SHOOTER_COL]: 'E1' }), ...Array.from({ length: 70 }, () => ''), rowWith({ 0: 'E1' })];
    const map = mapFromRows(rows);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    run(sim, map, scratch, 2 * SIM_HZ);
    expect(sim.enemies.live).toBe(0);
    expect(sim.nextRow).toBeLessThan(map.rows);
    expect(sim.phase).toBe('playing');
  });

  it('stops advancing once the level is over', () => {
    const map = mapFromRows([rowWith({ [SHOOTER_COL]: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    run(sim, map, scratch, 5 * SIM_HZ);
    expect(sim.phase).toBe('won');
    const tick = sim.tick;
    run(sim, map, scratch, 100);
    expect(sim.tick).toBe(tick);
  });
});

describe('determinism and serialisation (PLAN section 4)', () => {
  /** A fixed input script: slide right, hold, slide left with the keyboard. */
  function scripted(tick: number): SimInput {
    if (tick < 60) return { targetDelta: 0.15, keyDir: 0 };
    if (tick > 200 && tick < 320) return { targetDelta: 0, keyDir: -1 };
    if (tick % 97 === 0) return { targetDelta: -1.5, keyDir: 0 };
    return IDLE;
  }

  function play(map: MapData, seed: number, ticks: number, from?: SimState): SimState {
    const sim = from ?? createSim(map, seed);
    const scratch = createScratch();
    while (sim.tick < ticks && sim.phase === 'playing') stepSim(sim, map, scripted(sim.tick), scratch);
    return sim;
  }

  it('the same seed and input give the same state', () => {
    const map = builtIn('0');
    const a = play(map, 2024, 500);
    const b = play(map, 2024, 500);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.kills).toBeGreaterThan(0);
  });

  it('a different seed changes the run (ER cells)', () => {
    const map = builtIn('0');
    expect(JSON.stringify(play(map, 1, 500))).not.toBe(JSON.stringify(play(map, 2, 500)));
  });

  it('state survives JSON and continues identically', () => {
    const map = builtIn('1');
    const straight = play(map, 77, 600);
    const half = play(map, 77, 300);
    const restored = JSON.parse(JSON.stringify(half)) as SimState;
    expect(restored).toEqual(half);
    const resumed = play(map, 77, 600, restored);
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(straight));
  });

  it('holds no renderer objects or typed arrays', () => {
    const sim = play(builtIn('0'), 5, 120);
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== 'object') return;
      const proto = Object.getPrototypeOf(value);
      expect(proto === Object.prototype || proto === Array.prototype).toBe(true);
      for (const v of Object.values(value)) visit(v);
    };
    visit(sim);
  });
});

describe('scale (M3 check)', () => {
  it('runs a 44 x 4,444 map with fixed memory', () => {
    const map = mapFromRows(Array.from({ length: 4444 }, () => fullRow('E1')));
    expect(map.cells.byteLength).toBe(4444 * COLS * 2);
    const sim = createSim(map, 1);
    const scratch = createScratch();
    const start = performance.now();
    let ticks = 0;
    while (sim.phase === 'playing' && ticks < 60 * SIM_HZ) {
      stepSim(sim, map, IDLE, scratch);
      ticks++;
    }
    const msPerTick = (performance.now() - start) / ticks;
    // The lane fills with minions until they overrun the swarm. Pools never grow.
    expect(sim.enemies.items).toHaveLength(POOL_ENEMIES);
    expect(sim.bullets.items).toHaveLength(POOL_BULLETS);
    expect(sim.fx.items).toHaveLength(POOL_PARTICLES);
    expect(sim.enemies.live).toBeLessThanOrEqual((WINDOW_ROWS + 1) * COLS);
    expect(sim.enemies.live).toBeGreaterThan(22 * COLS);
    // A tick must fit many times into the 16.7 ms frame, even on a slow machine.
    expect(msPerTick).toBeLessThan(4);
  });
});

describe('level 1', () => {
  it('can be won by a simple bot', () => {
    const map = builtIn('1');
    const input: SimInput = { targetDelta: 0, keyDir: 0 };
    const results: string[] = [];
    for (const seed of [1, 2, 3]) {
      const sim = createSim(map, seed);
      const scratch = createScratch();
      while (sim.phase === 'playing' && sim.tick < 180 * SIM_HZ) stepSim(sim, map, botInput(sim, input), scratch);
      results.push(`${sim.phase}${sim.lossReason ? `:${sim.lossReason}` : ''} cats=${sim.clones + 1} rows=${sim.nextRow}`);
    }
    for (const result of results) expect(result).toMatch(/^won/);
  });
});
