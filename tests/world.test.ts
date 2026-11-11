import { afterEach, describe, expect, it, vi } from 'vitest';
import { COLS, MARCH_SPEED, POOL_ENEMIES, PRE_ADVANCE_ROWS, SIM_DT, SIM_HZ } from '../src/game/constants';
import { createSim } from '../src/game/Sim';
import { enemyTypeAt } from '../src/game/World';
import { activeEnemies, createScratch, emptyRow, fullRow, mapFromRows, rowWith, run } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('row streaming (D4)', () => {
  it('starts with the front line 12 rows inside the window', () => {
    const map = mapFromRows(Array.from({ length: 40 }, () => fullRow('E1')));
    const sim = createSim(map, 1);
    expect(sim.scroll).toBe(PRE_ADVANCE_ROWS);
    // Rows 0..12: row 12 has just reached the top edge.
    expect(sim.nextRow).toBe(PRE_ADVANCE_ROWS + 1);
    expect(sim.enemies.live).toBe((PRE_ADVANCE_ROWS + 1) * COLS);
    const rows = activeEnemies(sim);
    expect(Math.max(...rows.map((e) => e.y))).toBeCloseTo(PRE_ADVANCE_ROWS - 0.5, 9);
    expect(Math.min(...rows.map((e) => e.y))).toBeCloseTo(-0.5, 9);
  });

  it('puts each cell in its own column', () => {
    const map = mapFromRows([rowWith({ 0: 'E1', 21: 'E2', 43: 'E3' })]);
    const sim = createSim(map, 1);
    const byType = Object.fromEntries(activeEnemies(sim).map((e) => [e.type, e.x]));
    expect(byType).toEqual({ 1: 0.5, 2: 21.5, 3: 43.5 });
  });

  it('spawns one row per cell of march, in file order', () => {
    const map = mapFromRows(Array.from({ length: 60 }, (_, i) => rowWith({ [i % COLS]: 'E1' })));
    const sim = createSim(map, 1);
    const scratch = createScratch();
    // Tick counts chosen so the scroll is not on a row boundary.
    for (const ticks of [100, 250, 500]) {
      const fresh = createSim(map, 1);
      run(fresh, map, scratch, ticks);
      const scroll = PRE_ADVANCE_ROWS + ticks * MARCH_SPEED * SIM_DT;
      expect(fresh.scroll).toBeCloseTo(scroll, 6);
      expect(fresh.nextRow).toBe(Math.floor(scroll) + 1);
    }
    expect(sim.nextRow).toBe(13);
  });

  it('keeps consecutive rows exactly one cell apart', () => {
    const map = mapFromRows(Array.from({ length: 80 }, () => rowWith({ 0: 'E1', 43: 'E1' })));
    const sim = createSim(map, 1);
    run(sim, map, createScratch(), 900);
    const ys = [...new Set(activeEnemies(sim).map((e) => e.row))]
      .sort((a, b) => a - b)
      .map((row) => activeEnemies(sim).find((e) => e.row === row)!.y);
    expect(ys.length).toBeGreaterThan(20);
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1] - ys[i]).toBeCloseTo(1, 6);
  });

  it('places a row that enters between ticks at its exact position', () => {
    const map = mapFromRows(Array.from({ length: 30 }, () => rowWith({ 0: 'E1' })));
    const sim = createSim(map, 1);
    run(sim, map, createScratch(), 137);
    for (const e of activeEnemies(sim)) expect(e.y + 0.5).toBeCloseTo(sim.scroll - e.row, 6);
  });

  it('never spawns the whole map at once', () => {
    const map = mapFromRows(Array.from({ length: 4444 }, () => fullRow('E1')));
    const sim = createSim(map, 1);
    expect(sim.enemies.live).toBe(13 * COLS);
    const scratch = createScratch();
    let peak = 0;
    for (let i = 0; i < 20 * SIM_HZ && sim.phase === 'playing'; i++) {
      run(sim, map, scratch, 1);
      peak = Math.max(peak, sim.enemies.live);
    }
    // At most the rows inside the 44-row window, plus the one entering.
    expect(peak).toBeLessThanOrEqual(45 * COLS);
    expect(sim.enemies.items).toHaveLength(POOL_ENEMIES);
    expect(sim.nextRow).toBeLessThan(40);
  });

  it('treats empty rows as gaps in the march', () => {
    const map = mapFromRows([rowWith({ 5: 'E1' }), emptyRow(), emptyRow(), rowWith({ 5: 'E1' })]);
    const sim = createSim(map, 1);
    const ys = activeEnemies(sim).map((e) => e.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeCloseTo(3, 9);
  });
});

describe('enemy placement', () => {
  it('uses the token cell as the front-left corner of big enemies (D11)', () => {
    const map = mapFromRows([rowWith({ 4: 'E4' }), rowWith({ 10: 'E5' }), rowWith({ 2: 'E8' })]);
    const sim = createSim(map, 1);
    const [e4, e5, e8] = [4, 5, 8].map((t) => activeEnemies(sim).find((e) => e.type === t)!);
    expect([e4.w, e4.h]).toEqual([8, 8]);
    expect(e4.x - e4.w / 2).toBe(4);
    expect(e4.y + e4.h / 2).toBeCloseTo(12, 9);
    expect(e5.x - e5.w / 2).toBe(10);
    expect(e5.y + e5.h / 2).toBeCloseTo(11, 9);
    expect([e8.w, e8.h]).toEqual([30, 30]);
    expect(e8.x - e8.w / 2).toBe(2);
    // The body extends behind the front edge, above the window.
    expect(e8.y - e8.h / 2).toBeCloseTo(10 - 30, 9);
  });

  it('shifts a footprint that would leave the lane inward (D11)', () => {
    const map = mapFromRows([rowWith({ 43: 'E5' }), rowWith({ 40: 'E4' }), rowWith({ 30: 'E8' })]);
    const sim = createSim(map, 1);
    for (const e of activeEnemies(sim)) {
      expect(e.x + e.w / 2).toBe(COLS);
      expect(e.x - e.w / 2).toBeGreaterThanOrEqual(0);
    }
  });

  it('applies HP overrides and authored drops', () => {
    const map = mapFromRows([rowWith({ 0: 'E5-100', 22: 'E41', 30: 'E7-400-P3', 40: 'E1' })]);
    const sim = createSim(map, 1);
    const find = (t: number) => activeEnemies(sim).find((e) => e.type === t)!;
    expect(find(5)).toMatchObject({ hp: 100, maxHp: 100, drop: 0 });
    expect(find(4)).toMatchObject({ hp: 200, maxHp: 200, drop: 1 });
    expect(find(7)).toMatchObject({ hp: 400, drop: 3 });
    expect(find(1)).toMatchObject({ hp: 1, drop: 0 });
  });

  it('marches each type at its own speed (D1)', () => {
    const map = mapFromRows([rowWith({ 0: 'E1', 2: 'E4', 12: 'E7' })]);
    const sim = createSim(map, 1);
    const before = Object.fromEntries(activeEnemies(sim).map((e) => [e.type, e.y]));
    run(sim, map, createScratch(), SIM_HZ);
    const moved = Object.fromEntries(activeEnemies(sim).map((e) => [e.type, e.y - before[e.type]]));
    expect(moved[1]).toBeCloseTo(0.75, 6);
    expect(moved[4]).toBeCloseTo(0.6, 6);
    expect(moved[7]).toBeCloseTo(0.375, 6);
  });

  it('resolves ER to E1-E3 from the seed', () => {
    const map = mapFromRows(Array.from({ length: 10 }, () => fullRow('ER')));
    const a = createSim(map, 42);
    const b = createSim(map, 42);
    const c = createSim(map, 43);
    const types = (sim: typeof a) => activeEnemies(sim).map((e) => e.type);
    expect(types(a)).toEqual(types(b));
    expect(types(a)).not.toEqual(types(c));
    expect(new Set(types(a))).toEqual(new Set([1, 2, 3]));
    for (const e of activeEnemies(a)) {
      expect(enemyTypeAt(map, 42, e.row, Math.floor(e.x))).toBe(e.type);
    }
  });

  it('reports no enemy for empty cells and gates', () => {
    const map = mapFromRows([rowWith({ 0: 'G5', 1: 'E2', 43: 'G9-P3' })]);
    expect(enemyTypeAt(map, 1, 0, 0)).toBe(0);
    expect(enemyTypeAt(map, 1, 0, 1)).toBe(2);
    expect(enemyTypeAt(map, 1, 0, 5)).toBe(0);
    expect(createSim(map, 1).enemies.live).toBe(1);
  });
});

describe('enemy pool', () => {
  it('waits when the pool cannot hold the next row, and logs once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = mapFromRows(Array.from({ length: 6 }, () => fullRow('E3')));
    const sim = createSim(map, 1, { enemies: 50, bullets: 64, fx: 64 });
    expect(sim.nextRow).toBe(1);
    expect(sim.enemies.live).toBe(COLS);
    expect(warn).toHaveBeenCalledTimes(1);

    const scratch = createScratch(50);
    run(sim, map, scratch, 10 * SIM_HZ);
    expect(sim.nextRow).toBe(1);
    expect(sim.enemies.items).toHaveLength(50);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('resumes at the right place once there is room', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Row 0 is one column wide, so the shooter clears it and frees the pool.
    const map = mapFromRows([...Array.from({ length: 3 }, () => rowWith({ 22: 'E1' })), fullRow('E1')]);
    const sim = createSim(map, 1, { enemies: 45, bullets: 64, fx: 64 });
    expect(sim.nextRow).toBe(3);
    const scratch = createScratch(45);
    while (sim.nextRow < 4 && sim.tick < 20 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.nextRow).toBe(4);
    const late = activeEnemies(sim).filter((e) => e.row === 3);
    expect(late).toHaveLength(COLS);
    for (const e of late) expect(e.y + 0.5).toBeCloseTo(sim.scroll - 3, 6);
  });
});
