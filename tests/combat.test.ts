import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BASE_HP,
  BULLET_SPEED,
  COLS,
  FIRE_RATE,
  POOL_BULLETS,
  POOL_ENEMIES,
  POOL_PARTICLES,
  SHOOTER_Y,
  SIM_HZ,
  WINDOW_ROWS,
} from '../src/game/constants';
import { createSim, stepSim } from '../src/game/Sim';
import { parseMap } from '../src/parsers/markdownMapParser';
import type { MapData, SimInput, SimState } from '../src/types';
import { activeEnemies, createScratch, fullRow, IDLE, mapFromRows, rowWith, run } from './helpers';

/** Shooter starts at x = 22, which is inside column 22 (x from 22 to 23). */
const SHOOTER_COL = 22;

function devMap(): MapData {
  const text = readFileSync(fileURLToPath(new URL('../public/maps/0.md', import.meta.url)), 'utf8');
  const result = parseMap(text);
  if (!result.ok) throw new Error('dev map does not parse');
  return result.map;
}

describe('shooting', () => {
  it('fires FIRE_RATE bullets per second straight up from the shooter', () => {
    const map = mapFromRows([rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1);
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
    const sim = createSim(map, 1);
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
    expect(sim.bullets.live).toBeLessThanOrEqual(4);
    expect(sim.bullets.items).toHaveLength(POOL_BULLETS);
  });

  it('follows the shooter when the map slides', () => {
    const map = mapFromRows([rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1);
    const scratch = createScratch();
    stepSim(sim, map, { targetDelta: 8, keyDir: 0 }, scratch);
    run(sim, map, scratch, 90);
    const newest = sim.bullets.items.filter((b) => b.active).sort((a, b) => b.y - a.y)[0];
    expect(newest.x).toBeCloseTo(30, 1);
  });

  it('kills an E1 with one bullet', () => {
    const map = mapFromRows([rowWith({ [SHOOTER_COL]: 'E1' })]);
    const sim = createSim(map, 1);
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
      const sim = createSim(map, 1);
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
    const sim = createSim(map, 1);
    const scratch = createScratch();
    while (activeEnemies(sim)[0].hp === 4) run(sim, map, scratch, 1);
    expect(activeEnemies(sim)[0].flash).toBeGreaterThan(0);
    expect(sim.fx.live).toBeGreaterThan(0);
  });

  it('only hits enemies in the column of fire', () => {
    const map = mapFromRows([rowWith({ [SHOOTER_COL - 1]: 'E1', [SHOOTER_COL + 1]: 'E1' })]);
    const sim = createSim(map, 1);
    run(sim, map, createScratch(), 5 * SIM_HZ);
    expect(sim.kills).toBe(0);
    expect(sim.enemies.live).toBe(2);
  });

  it('hits the visible part of a big enemy and wears it down', () => {
    const map = mapFromRows([rowWith({ 16: 'E4-10' })]);
    const sim = createSim(map, 1);
    run(sim, map, createScratch(), 8 * SIM_HZ);
    expect(sim.kills).toBe(1);
  });

  it('one bullet damages one enemy', () => {
    const map = mapFromRows(Array.from({ length: 6 }, () => rowWith({ [SHOOTER_COL]: 'E1' })));
    const sim = createSim(map, 1);
    const scratch = createScratch();
    while (sim.kills === 0) run(sim, map, scratch, 1);
    expect(sim.kills).toBe(1);
    expect(sim.enemies.live).toBe(5);
  });
});

describe('base integrity (B1)', () => {
  it('loses the remaining HP of each enemy that reaches the base line', () => {
    const map = mapFromRows([rowWith({ 0: 'E1' }), rowWith({ 1: 'E3' })]);
    const sim = createSim(map, 1);
    const scratch = createScratch();
    expect(sim.baseHp).toBe(BASE_HP);
    while (sim.enemies.live === 2) run(sim, map, scratch, 1);
    expect(sim.baseHp).toBe(BASE_HP - 1);
    // Row 0 started 12 rows in: 32 rows at 0.75 gu/s is about 42.7 s.
    expect(sim.tick / SIM_HZ).toBeGreaterThan(42);
    expect(sim.tick / SIM_HZ).toBeLessThan(43.5);
    while (sim.enemies.live === 1) run(sim, map, scratch, 1);
    expect(sim.baseHp).toBe(BASE_HP - 1 - 4);
    expect(sim.phase).toBe('won');
    expect(sim.kills).toBe(0);
  });

  it('removes the enemy at the line, not past it', () => {
    const map = mapFromRows([rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1);
    const scratch = createScratch();
    while (sim.enemies.live > 0) {
      for (const e of activeEnemies(sim)) expect(e.y + e.h / 2).toBeLessThan(WINDOW_ROWS);
      run(sim, map, scratch, 1);
    }
  });

  it('loses the level when the base is destroyed', () => {
    const map = mapFromRows(Array.from({ length: 3 }, () => fullRow('E3')));
    const sim = createSim(map, 1);
    run(sim, map, createScratch(), 60 * SIM_HZ);
    expect(sim.phase).toBe('lost');
    expect(sim.lossReason).toBe('base');
    expect(sim.baseHp).toBe(0);
  });

  it('loses at once when a boss reaches the base line', () => {
    const map = mapFromRows([rowWith({ 0: 'E5' })]);
    const sim = createSim(map, 1);
    run(sim, map, createScratch(), 60 * SIM_HZ);
    expect(sim.phase).toBe('lost');
    expect(sim.lossReason).toBe('boss');
    expect(sim.baseHp).toBe(BASE_HP);
  });

  it('an E4 is not a boss: it costs its remaining HP', () => {
    const map = mapFromRows([rowWith({ 0: 'E4-30' })]);
    const sim = createSim(map, 1);
    run(sim, map, createScratch(), 70 * SIM_HZ);
    expect(sim.baseHp).toBe(BASE_HP - 30);
    expect(sim.phase).toBe('won');
  });
});

describe('win condition (D5)', () => {
  it('needs the end of the file and no enemy alive', () => {
    const rows = Array.from({ length: 30 }, () => rowWith({ [SHOOTER_COL]: 'E1' }));
    const map = mapFromRows(rows);
    const sim = createSim(map, 1);
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
    expect(sim.baseHp).toBe(BASE_HP);
  });

  it('does not win while rows are still to come', () => {
    const rows = [rowWith({ [SHOOTER_COL]: 'E1' }), ...Array.from({ length: 20 }, () => ''), rowWith({ 0: 'E1' })];
    const map = mapFromRows(rows);
    const sim = createSim(map, 1);
    const scratch = createScratch();
    run(sim, map, scratch, 3 * SIM_HZ);
    expect(sim.enemies.live).toBe(0);
    expect(sim.nextRow).toBeLessThan(map.rows);
    expect(sim.phase).toBe('playing');
  });

  it('stops advancing once the level is over', () => {
    const map = mapFromRows([rowWith({ [SHOOTER_COL]: 'E1' })]);
    const sim = createSim(map, 1);
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
    const map = devMap();
    const a = play(map, 2024, 900);
    const b = play(map, 2024, 900);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.kills).toBeGreaterThan(0);
  });

  it('a different seed changes the run (ER cells)', () => {
    const map = devMap();
    expect(JSON.stringify(play(map, 1, 300))).not.toBe(JSON.stringify(play(map, 2, 300)));
  });

  it('state survives JSON and continues identically', () => {
    const map = devMap();
    const straight = play(map, 77, 800);
    const half = play(map, 77, 400);
    const restored = JSON.parse(JSON.stringify(half)) as SimState;
    expect(restored).toEqual(half);
    const resumed = play(map, 77, 800, restored);
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(straight));
  });

  it('holds no Pixi objects or typed arrays', () => {
    const sim = play(devMap(), 5, 120);
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
    // The window fills with minions, then the base falls. Pools never grow.
    expect(sim.enemies.items).toHaveLength(POOL_ENEMIES);
    expect(sim.bullets.items).toHaveLength(POOL_BULLETS);
    expect(sim.fx.items).toHaveLength(POOL_PARTICLES);
    expect(sim.enemies.live).toBeLessThanOrEqual(45 * COLS);
    expect(sim.enemies.live).toBeGreaterThan(40 * COLS);
    // A tick must fit many times into the 16.7 ms frame, even on a slow machine.
    expect(msPerTick).toBeLessThan(4);
  });
});
