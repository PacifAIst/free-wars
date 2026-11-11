import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../src/game/Collision';
import { makeEnemy } from '../src/game/Enemy';
import { createPool, poolAlloc, poolFree } from '../src/game/Pool';
import { cellHash, nextRandom } from '../src/game/rng';
import type { Enemy, Pool } from '../src/types';

describe('pool', () => {
  const make = (): { active: boolean; v: number } => ({ active: false, v: 0 });

  it('creates every item up front and allocates the lowest index first', () => {
    const pool = createPool(4, make);
    expect(pool.items).toHaveLength(4);
    expect(pool.live).toBe(0);
    expect([poolAlloc(pool), poolAlloc(pool), poolAlloc(pool)]).toEqual([0, 1, 2]);
    expect(pool.live).toBe(3);
    expect(pool.high).toBe(3);
    expect(pool.items[1].active).toBe(true);
  });

  it('returns -1 when full and never grows', () => {
    const pool = createPool(2, make);
    poolAlloc(pool);
    poolAlloc(pool);
    expect(poolAlloc(pool)).toBe(-1);
    expect(pool.items).toHaveLength(2);
    expect(pool.free).toHaveLength(2);
  });

  it('reuses freed slots and shrinks the loop bound', () => {
    const pool = createPool(4, make);
    for (let i = 0; i < 4; i++) poolAlloc(pool);
    poolFree(pool, 3);
    poolFree(pool, 2);
    expect(pool.high).toBe(2);
    expect(pool.live).toBe(2);
    poolFree(pool, 0);
    expect(pool.high).toBe(2);
    expect(poolAlloc(pool)).toBe(0);
    expect(pool.live).toBe(2);
  });

  it('ignores a double free', () => {
    const pool = createPool(2, make);
    const a = poolAlloc(pool);
    poolFree(pool, a);
    poolFree(pool, a);
    expect(pool.freeCount).toBe(2);
    expect(pool.live).toBe(0);
  });

  it('is plain data that survives JSON', () => {
    const pool = createPool(3, make);
    poolAlloc(pool);
    const copy = JSON.parse(JSON.stringify(pool)) as typeof pool;
    expect(copy).toEqual(pool);
    expect(poolAlloc(copy)).toBe(1);
  });
});

describe('seeded randomness', () => {
  it('nextRandom is deterministic, in [0, 1) and well spread', () => {
    const a = { rng: 12345 };
    const b = { rng: 12345 };
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const v = nextRandom(a);
      expect(v).toBe(nextRandom(b));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 2000).toBeGreaterThan(0.45);
    expect(sum / 2000).toBeLessThan(0.55);
    expect(nextRandom({ rng: 1 })).not.toBe(nextRandom({ rng: 2 }));
  });

  it('cellHash depends on seed, row and column', () => {
    expect(cellHash(7, 3, 4)).toBe(cellHash(7, 3, 4));
    expect(cellHash(7, 3, 4)).not.toBe(cellHash(8, 3, 4));
    expect(cellHash(7, 3, 4)).not.toBe(cellHash(7, 4, 3));
    const counts = [0, 0, 0];
    for (let r = 0; r < 100; r++) for (let c = 0; c < 44; c++) counts[cellHash(99, r, c) % 3]++;
    for (const n of counts) {
      expect(n).toBeGreaterThan(4400 * 0.28);
      expect(n).toBeLessThan(4400 * 0.39);
    }
  });
});

describe('spatial hash', () => {
  function enemies(list: Partial<Enemy>[]): Pool<Enemy> {
    const pool = createPool(64, makeEnemy);
    for (const props of list) Object.assign(pool.items[poolAlloc(pool)], { w: 1, h: 1, ...props });
    return pool;
  }

  it('finds the enemy under a point', () => {
    const pool = enemies([
      { x: 5.5, y: 10.5 },
      { x: 30.5, y: 40.5 },
    ]);
    const hash = new SpatialHash(64);
    hash.build(pool);
    expect(hash.queryPoint(5.5, 10.5, pool)).toBe(0);
    expect(hash.queryPoint(5.01, 10.99, pool)).toBe(0);
    expect(hash.queryPoint(30.9, 40.1, pool)).toBe(1);
    expect(hash.queryPoint(6.01, 10.5, pool)).toBe(-1);
    expect(hash.queryPoint(5.5, 11.01, pool)).toBe(-1);
    expect(hash.queryPoint(-1, 10.5, pool)).toBe(-1);
    expect(hash.queryPoint(44, 10.5, pool)).toBe(-1);
  });

  it('finds a boss from any bucket it covers, also above the window', () => {
    const pool = enemies([{ x: 15, y: -5, w: 30, h: 30 }]);
    const hash = new SpatialHash(64);
    hash.build(pool);
    expect(hash.queryPoint(0.5, 9.5, pool)).toBe(0);
    expect(hash.queryPoint(29.5, -19.5, pool)).toBe(0);
    expect(hash.queryPoint(15, 0, pool)).toBe(0);
    expect(hash.queryPoint(30.5, 0, pool)).toBe(-1);
    expect(hash.queryPoint(15, 10.5, pool)).toBe(-1);
  });

  it('prefers the enemy whose front edge is nearest the base line (D10)', () => {
    const pool = enemies([
      { x: 10, y: 10, w: 20, h: 20 },
      { x: 10.5, y: 19.5 },
      { x: 10.5, y: 21.5 },
    ]);
    const hash = new SpatialHash(64);
    hash.build(pool);
    // The minion at y 19.5 stands inside the boss footprint; both end at y 20.
    expect([0, 1]).toContain(hash.queryPoint(10.5, 19.5, pool));
    expect(hash.queryPoint(10.5, 21.5, pool)).toBe(2);
    expect(hash.queryPoint(10.5, 5, pool)).toBe(0);
  });

  it('skips enemies that died after the hash was built', () => {
    const pool = enemies([{ x: 5.5, y: 10.5 }]);
    const hash = new SpatialHash(64);
    hash.build(pool);
    poolFree(pool, 0);
    expect(hash.queryPoint(5.5, 10.5, pool)).toBe(-1);
  });

  it('reports each enemy once in a rectangle query', () => {
    const pool = enemies([
      { x: 10, y: 10, w: 20, h: 20 },
      { x: 3.5, y: 3.5 },
      { x: 40.5, y: 40.5 },
    ]);
    const hash = new SpatialHash(64);
    hash.build(pool);
    const out = new Int32Array(16);
    const n = hash.queryRect(0, 0, 20, 20, pool, out);
    expect(Array.from(out.subarray(0, n)).sort()).toEqual([0, 1]);
    expect(hash.queryRect(21, 21, 30, 30, pool, out)).toBe(0);
    expect(hash.queryRect(40, 40, 44, 44, pool, out)).toBe(1);
    // Touching edges do not count as overlap.
    expect(hash.queryRect(20, 0, 24, 20, pool, out)).toBe(0);
  });

  it('stops when the output buffer is full', () => {
    const pool = enemies(Array.from({ length: 10 }, (_, i) => ({ x: i + 0.5, y: 5.5 })));
    const hash = new SpatialHash(64);
    hash.build(pool);
    expect(hash.queryRect(0, 0, 44, 44, pool, new Int32Array(4))).toBe(4);
  });
});
