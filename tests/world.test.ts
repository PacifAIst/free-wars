import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BIG_CHASE_SPEED,
  COLS,
  ENEMY_STATS,
  FUNNEL_START_ROW,
  MARCH_SPEED,
  MINION_SPACING,
  POOL_ENEMIES,
  PRE_ADVANCE_ROWS,
  SHOOTER_Y,
  SIM_DT,
  SIM_HZ,
  SPEED_SCALE,
} from '../src/game/constants';
import { enemyTypeAt, getLayout } from '../src/game/layout';
import { createSim } from '../src/game/Sim';
import { cellSpec } from '../src/parsers/tokens';
import { activeEnemies, createScratch, emptyRow, fullRow, LONE, mapFromRows, rowWith, run } from './helpers';

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
    const map = mapFromRows(Array.from({ length: 60 }, (_, i) => rowWith({ [i % 2 === 0 ? 0 : 43]: 'E1' })));
    const scratch = createScratch();
    // Tick counts chosen so the scroll is not on a row boundary.
    for (const ticks of [100, 250, 400]) {
      const sim = createSim(map, 1, LONE);
      run(sim, map, scratch, ticks);
      const scroll = PRE_ADVANCE_ROWS + ticks * MARCH_SPEED * SIM_DT;
      expect(sim.scroll).toBeCloseTo(scroll, 6);
      expect(sim.nextRow).toBe(Math.floor(scroll) + 1);
    }
  });

  it('enters rows exactly one cell apart, at their exact position', () => {
    const map = mapFromRows(Array.from({ length: 80 }, () => rowWith({ 0: 'E1', 43: 'E1' })));
    const sim = createSim(map, 1, LONE);
    run(sim, map, createScratch(), 137);
    // Above the funnel a minion marches straight down, in step with the row stream.
    const fresh = activeEnemies(sim).filter((e) => e.y < FUNNEL_START_ROW && e.x < 1);
    expect(fresh.length).toBeGreaterThanOrEqual(5);
    fresh.sort((a, b) => a.row - b.row);
    for (const e of fresh) expect(e.y + 0.5).toBeCloseTo(sim.scroll - e.row, 6);
    for (let i = 1; i < fresh.length; i++) expect(fresh[i - 1].y - fresh[i].y).toBeCloseTo(1, 6);
  });

  it('never spawns the whole map at once', () => {
    const map = mapFromRows(Array.from({ length: 4444 }, () => fullRow('E1')));
    const sim = createSim(map, 1);
    expect(sim.enemies.live).toBe(13 * COLS);
    const scratch = createScratch();
    let peak = 0;
    for (let i = 0; i < 30 * SIM_HZ && sim.phase === 'playing'; i++) {
      run(sim, map, scratch, 1);
      peak = Math.max(peak, sim.enemies.live);
    }
    // At most the rows inside the 44-row window, plus the one entering.
    expect(peak).toBeLessThanOrEqual(45 * COLS);
    expect(sim.enemies.items).toHaveLength(POOL_ENEMIES);
    expect(sim.nextRow).toBeLessThan(60);
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
    const map = mapFromRows([rowWith({ 4: 'E4' }), ...Array.from({ length: 9 }, emptyRow), rowWith({ 10: 'E5' })]);
    const sim = createSim(map, 1);
    const [e4, e5] = [4, 5].map((t) => activeEnemies(sim).find((e) => e.type === t)!);
    expect([e4.w, e4.h]).toEqual([8, 8]);
    expect(e4.x - e4.w / 2).toBe(4);
    expect(e4.y + e4.h / 2).toBeCloseTo(12, 9);
    expect([e5.w, e5.h]).toEqual([20, 20]);
    expect(e5.x - e5.w / 2).toBe(10);
    expect(e5.y + e5.h / 2).toBeCloseTo(2, 9);
    // The body extends behind the front edge, above the window.
    expect(e5.y - e5.h / 2).toBeCloseTo(2 - 20, 9);
  });

  it('shifts a footprint that would leave the lane inward (D11)', () => {
    for (const row of [rowWith({ 43: 'E5' }), rowWith({ 40: 'E4' }), rowWith({ 30: 'E8' })]) {
      const sim = createSim(mapFromRows([row]), 1);
      const e = activeEnemies(sim)[0];
      expect(e.x + e.w / 2).toBe(COLS);
    }
  });

  it('applies HP overrides and authored drops', () => {
    const map = mapFromRows([rowWith({ 0: 'E5-100', 22: 'E41', 34: 'E1-P2', 40: 'E1' })]);
    const sim = createSim(map, 1);
    const find = (t: number, x?: number) => activeEnemies(sim).find((e) => e.type === t && (x === undefined || e.x === x))!;
    expect(find(5)).toMatchObject({ hp: 100, maxHp: 100, drop: 0 });
    expect(find(4)).toMatchObject({ hp: 200, maxHp: 200, drop: 1 });
    expect(find(1, 34.5)).toMatchObject({ hp: 1, drop: 2 });
    expect(find(1, 40.5)).toMatchObject({ hp: 1, drop: 0 });
  });

  it('marches each type at its own speed (D1)', () => {
    const map = mapFromRows([rowWith({ 0: 'E1', 2: 'E4', 12: 'E7' })]);
    const sim = createSim(map, 1, LONE);
    const before = Object.fromEntries(activeEnemies(sim).map((e) => [e.type, { x: e.x, y: e.y }]));
    run(sim, map, createScratch(), SIM_HZ);
    const now = Object.fromEntries(activeEnemies(sim).map((e) => [e.type, e]));
    // Big enemies always march straight down at their speed.
    for (const type of [4, 7]) {
      expect(now[type].y - before[type].y).toBeCloseTo(ENEMY_STATS[type].speedSpec * SPEED_SCALE, 6);
    }
    // A minion runs at its speed along its line of march.
    const run1 = Math.hypot(now[1].x - before[1].x, now[1].y - before[1].y);
    expect(run1).toBeCloseTo(ENEMY_STATS[1].speedSpec * SPEED_SCALE, 2);
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

describe('footprints in the grid (A21)', () => {
  it('leaves out minions that stand inside a big enemy', () => {
    // An E4 at column 10 covers columns 10-17 of its own row and the 7 rows behind it.
    const map = mapFromRows([
      rowWith({ 9: 'E1', 10: 'E4', 12: 'E1', 17: 'E1', 18: 'E1' }),
      ...Array.from({ length: 7 }, () => rowWith({ 9: 'E1', 13: 'E2', 18: 'E1' })),
      rowWith({ 13: 'E3' }),
    ]);
    const layout = getLayout(map, 1);
    const at = (r: number, c: number): number => layout.type[r * COLS + c];
    expect(at(0, 10)).toBe(4);
    expect(at(0, 9)).toBe(1);
    expect(at(0, 12)).toBe(0);
    expect(at(0, 17)).toBe(0);
    expect(at(0, 18)).toBe(1);
    for (let r = 1; r <= 7; r++) {
      expect(at(r, 13)).toBe(0);
      expect(at(r, 9)).toBe(1);
      expect(at(r, 18)).toBe(1);
    }
    // Row 8 is behind the footprint, so the cell is free again.
    expect(at(8, 13)).toBe(3);
    expect(layout.dropped).toBe(2 + 7);
  });

  it('moves a big enemy that would overlap another to the nearest free span', () => {
    const map = mapFromRows([rowWith({ 0: 'E41', 1: 'E42', 2: 'E43', 3: 'E44' })]);
    const layout = getLayout(map, 1);
    const placed = [...layout.type.subarray(0, COLS)].flatMap((t, c) => (t === 4 ? [c] : []));
    expect(placed).toEqual([0, 8, 16, 24]);
    // Each keeps the drop of its own token.
    const drops = placed.map((c) => cellSpec(map, map.cells[layout.source[c]]).drop);
    expect(drops).toEqual([1, 2, 3, 4]);
    expect(layout.dropped).toBe(0);

    const sim = createSim(map, 1);
    const xs = activeEnemies(sim).map((e) => e.x).sort((a, b) => a - b);
    expect(xs).toEqual([4, 12, 20, 28]);
    expect(activeEnemies(sim).map((e) => e.drop).sort()).toEqual([1, 2, 3, 4]);
  });

  it('leaves out a big enemy when its row has no room', () => {
    const map = mapFromRows([rowWith({ 0: 'E5', 20: 'E5', 40: 'E5' })]);
    const layout = getLayout(map, 1);
    expect([...layout.type.subarray(0, COLS)].filter((t) => t === 5)).toHaveLength(2);
    expect(layout.dropped).toBe(1);
  });

  it('never lets two footprints share a cell', () => {
    const rows = Array.from({ length: 60 }, (_, r) =>
      rowWith({ [(r * 7) % 40]: r % 9 === 0 ? 'E5' : 'E4', [(r * 13) % 44]: 'E1', [(r * 5 + 3) % 44]: 'E8', 20: 'E2' }),
    );
    const map = mapFromRows(rows);
    const layout = getLayout(map, 3);
    const owner = new Int32Array(map.rows * COLS + 40 * COLS).fill(-1);
    let placed = 0;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = layout.type[r * COLS + c];
        if (t === 0) continue;
        placed++;
        const { w, h } = ENEMY_STATS[t];
        expect(c + w).toBeLessThanOrEqual(COLS);
        for (let dr = 0; dr < h; dr++) {
          for (let dc = 0; dc < w; dc++) {
            const cell = (r + dr) * COLS + c + dc;
            expect(owner[cell]).toBe(-1);
            owner[cell] = r * COLS + c;
          }
        }
      }
    }
    expect(placed).toBeGreaterThan(20);
    expect(layout.dropped).toBeGreaterThan(0);
  });

  it('is the same every time for the same map and seed', () => {
    const map = mapFromRows([rowWith({ 0: 'E4', 3: 'ER', 30: 'ER' })]);
    expect(getLayout(map, 5)).toBe(getLayout(map, 5));
    expect([...getLayout(map, 5).type]).toEqual([...getLayout(map, 5).type]);
  });
});

describe('pursuit (A19)', () => {
  it('big enemies steer sideways towards the swarm at BIG_CHASE_SPEED', () => {
    const map = mapFromRows([rowWith({ 0: 'E4' })]);
    const sim = createSim(map, 1, LONE);
    const e4 = activeEnemies(sim)[0];
    expect(e4.x).toBe(4);
    run(sim, map, createScratch(), SIM_HZ);
    expect(e4.x).toBeCloseTo(4 + BIG_CHASE_SPEED, 6);
    expect(e4.prevX).toBeLessThan(e4.x);
  });

  it('a big enemy stops over the swarm and follows it when the map slides', () => {
    const map = mapFromRows([rowWith({ 30: 'E4-100000' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    const e4 = activeEnemies(sim)[0];
    run(sim, map, scratch, 8 * SIM_HZ);
    expect(e4.x).toBeCloseTo(sim.shooter.x, 6);
    run(sim, map, scratch, 1, { targetDelta: -15, keyDir: 0 });
    run(sim, map, scratch, 2 * SIM_HZ);
    expect(sim.shooter.x).toBeCloseTo(7, 1);
    expect(e4.x).toBeLessThan(22);
    expect(e4.x).toBeGreaterThan(7);
  });

  it('keeps a big footprint inside the lane', () => {
    const map = mapFromRows([rowWith({ 10: 'E5-100000' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    run(sim, map, scratch, 1, { targetDelta: -30, keyDir: 0 });
    run(sim, map, scratch, 8 * SIM_HZ);
    const e5 = activeEnemies(sim)[0];
    expect(e5.x).toBe(e5.w / 2);
  });

  it('minions close in on the swarm from both sides', () => {
    const map = mapFromRows([rowWith({ 3: 'E3', 40: 'E3' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    const [left, right] = activeEnemies(sim).sort((a, b) => a.x - b.x);
    run(sim, map, scratch, 6 * SIM_HZ);
    expect(left.x).toBeGreaterThan(3.5 + 3);
    expect(right.x).toBeLessThan(40.5 - 3);
    // They arrive at the shooter instead of walking past it to the goal line.
    while (sim.phase === 'playing' && sim.tick < 30 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.lossReason).not.toBe('base');
  });

  it('a minion already in front of the swarm marches straight down', () => {
    // With two rings the swarm is five cells wide, so column 21 is in front of it.
    const map = mapFromRows([rowWith({ 21: 'E3-9999' })]);
    const sim = createSim(map, 1, { startClones: 18 });
    const rat = activeEnemies(sim)[0];
    run(sim, map, createScratch(), 5 * SIM_HZ);
    expect(rat.x).toBe(21.5);
    expect(rat.y).toBeCloseTo(11.5 + 5 * MARCH_SPEED, 6);
    expect(rat.y).toBeLessThan(SHOOTER_Y);
  });

  it('a rat always meets a lone shooter: it aims straight at it', () => {
    const map = mapFromRows([rowWith({ 21: 'E3-9999' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    while (sim.phase === 'playing' && sim.tick < 30 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.lossReason).toBe('swarm');
  });
});

describe('enemy collision (A21)', () => {
  it('a packed block marches without being disturbed until it converges', () => {
    const map = mapFromRows(Array.from({ length: 3 }, () => rowWith({ 20: 'E3', 21: 'E3', 22: 'E3', 23: 'E3' })));
    const sim = createSim(map, 1, { startClones: 18 });
    run(sim, map, createScratch(), 30);
    const xs = [...new Set(activeEnemies(sim).map((e) => e.x))].sort((a, b) => a - b);
    expect(xs).toEqual([20.5, 21.5, 22.5, 23.5]);
  });

  it('minions never end up on top of each other while converging', () => {
    const map = mapFromRows(Array.from({ length: 6 }, () => fullRow('E3')));
    const sim = createSim(map, 1, { startClones: 0 });
    const scratch = createScratch();
    let closest = Infinity;
    for (let i = 0; i < 9 * SIM_HZ && sim.phase === 'playing'; i++) {
      run(sim, map, scratch, 1);
      if (i % 20 !== 0) continue;
      const list = activeEnemies(sim);
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const d = Math.hypot(list[a].x - list[b].x, list[a].y - list[b].y);
          if (d < closest) closest = d;
        }
      }
    }
    // A crowd under pressure may squeeze a little, but rats do not pass through each other.
    expect(closest).toBeGreaterThan(MINION_SPACING * 0.6);
  });

  it('big enemies chasing the same spot queue up side by side', () => {
    const map = mapFromRows([rowWith({ 0: 'E4-100000', 1: 'E4-100000', 2: 'E4-100000', 36: 'E4-100000' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    let worst = Infinity;
    for (let i = 0; i < 9 * SIM_HZ && sim.phase === 'playing'; i++) {
      run(sim, map, scratch, 1);
      const xs = activeEnemies(sim).map((e) => e.x).sort((a, b) => a - b);
      for (let k = 1; k < xs.length; k++) worst = Math.min(worst, xs[k] - xs[k - 1]);
    }
    // Footprints are 8 wide; a small overlap can appear for a tick while they jostle.
    expect(worst).toBeGreaterThan(7.6);
  });

  it('minions flow round a big enemy instead of walking through it', () => {
    const map = mapFromRows([rowWith({ 18: 'E4-100000' }), ...Array.from({ length: 12 }, () => fullRow('E1'))]);
    const sim = createSim(map, 1, { startClones: 0 });
    const scratch = createScratch();
    for (let i = 0; i < 6 * SIM_HZ && sim.phase === 'playing'; i++) {
      run(sim, map, scratch, 1);
      const big = activeEnemies(sim).find((e) => e.type === 4);
      if (!big || i % 10 !== 0) continue;
      for (const e of activeEnemies(sim)) {
        if (e.type === 4) continue;
        const inside = Math.abs(e.x - big.x) < big.w / 2 - 0.3 && Math.abs(e.y - big.y) < big.h / 2 - 0.3;
        expect(inside).toBe(false);
      }
    }
  });
});

describe('enemy pool', () => {
  const small = (enemies: number) => ({ capacities: { enemies, bullets: 64, fx: 64, powerups: 8 }, startClones: 0 });

  it('waits when the pool cannot hold the next row, and logs once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = mapFromRows(Array.from({ length: 6 }, () => fullRow('E3')));
    const sim = createSim(map, 1, small(50));
    expect(sim.nextRow).toBe(1);
    expect(sim.enemies.live).toBe(COLS);
    expect(warn).toHaveBeenCalledTimes(1);

    run(sim, map, createScratch(50), 5 * SIM_HZ);
    expect(sim.nextRow).toBe(1);
    expect(sim.enemies.items).toHaveLength(50);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('resumes at the right place once there is room', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // The first rows are one column wide, so the shooter clears them and frees the pool.
    const map = mapFromRows([...Array.from({ length: 3 }, () => rowWith({ 22: 'E1' })), fullRow('E1')]);
    const sim = createSim(map, 1, small(45));
    expect(sim.nextRow).toBe(3);
    const scratch = createScratch(45);
    while (sim.nextRow < 4 && sim.tick < 8 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.nextRow).toBe(4);
    const late = activeEnemies(sim).filter((e) => e.row === 3);
    expect(late).toHaveLength(COLS);
    for (const e of late) expect(e.y + 0.5).toBeCloseTo(sim.scroll - 3, 1);
  });
});
