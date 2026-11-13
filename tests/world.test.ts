import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COLS,
  DROP_CLONE_10,
  ENEMY_STATS,
  GATE_WIDTH,
  MARCH_SPEED,
  MINION_SPACING,
  POOL_ENEMIES,
  PRE_ADVANCE_ROWS,
  RAIL_LEFT_X,
  RAIL_RIGHT_X,
  SIM_DT,
  SIM_HZ,
  SPEED_SCALE,
  UNIT,
  WINDOW_ROWS,
} from '../src/game/constants';
import { enemyTypeAt, getLayout } from '../src/game/layout';
import { createSim } from '../src/game/Sim';
import { cellSpec } from '../src/parsers/tokens';
import {
  createScratch,
  fullRow,
  gap,
  gatesOf,
  LONE,
  mapFromRows,
  rats,
  rowWith,
  run,
  UNITS_ACROSS,
} from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

/** One rat far up the file, so a level stays in progress while a test looks at something else. */
const FAR_RAT = [...gap(400), rowWith({ 22: 'E1' })];

describe('row streaming (D4)', () => {
  it('starts with the front line PRE_ADVANCE_ROWS inside the play area', () => {
    const map = mapFromRows(Array.from({ length: 200 }, () => fullRow('E1')));
    const sim = createSim(map, 1);
    expect(sim.scroll).toBe(PRE_ADVANCE_ROWS);
    // Rows 0..PRE_ADVANCE_ROWS have entered: the last one has just reached the top edge.
    expect(sim.nextRow).toBe(PRE_ADVANCE_ROWS + 1);
    // A minion is UNIT rows deep, so every second row of the file gives a rank.
    const ranks = Math.floor(PRE_ADVANCE_ROWS / UNIT) + 1;
    expect(sim.enemies.live).toBe(ranks * UNITS_ACROSS);
    expect(Math.max(...rats(sim).map((e) => e.y + e.h / 2))).toBeCloseTo(PRE_ADVANCE_ROWS, 9);
    expect(Math.min(...rats(sim).map((e) => e.y + e.h / 2))).toBeCloseTo(0, 9);
  });

  it('stands each minion on the cell of its token and the one beside it', () => {
    const map = mapFromRows([rowWith({ 0: 'E1', 20: 'E2', 42: 'E3' })]);
    const sim = createSim(map, 1);
    const byType = Object.fromEntries(rats(sim).map((e) => [e.type, e.x]));
    expect(byType).toEqual({ 1: 1, 2: 21, 3: 43 });
    for (const e of rats(sim)) expect([e.w, e.h]).toEqual([UNIT, UNIT]);
  });

  it('spawns one row per cell of march, in file order', () => {
    const map = mapFromRows(Array.from({ length: 300 }, (_, i) => rowWith({ [i % 4 === 0 ? 0 : 42]: 'E1' })));
    const scratch = createScratch();
    // Tick counts chosen so the scroll is not on a row boundary.
    for (const ticks of [93, 157, 233]) {
      const sim = createSim(map, 1, LONE);
      run(sim, map, scratch, ticks);
      const scroll = PRE_ADVANCE_ROWS + ticks * MARCH_SPEED * SIM_DT;
      expect(sim.scroll).toBeCloseTo(scroll, 6);
      expect(sim.nextRow).toBe(Math.floor(scroll) + 1);
    }
  });

  it('enters ranks exactly one unit apart, at their exact position', () => {
    const map = mapFromRows(Array.from({ length: 300 }, (_, i) => (i % UNIT === 0 ? rowWith({ 0: 'E1' }) : '')));
    const sim = createSim(map, 1, LONE);
    run(sim, map, createScratch(), 137);
    const list = rats(sim).sort((a, b) => a.row - b.row);
    expect(list.length).toBeGreaterThan(30);
    for (const e of list) expect(e.y + e.h / 2).toBeCloseTo(sim.scroll - e.row, 6);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].y - list[i].y).toBeCloseTo(UNIT, 6);
  });

  it('never spawns the whole map at once', () => {
    const map = mapFromRows(Array.from({ length: 4444 }, () => fullRow('E1')));
    const sim = createSim(map, 1);
    const scratch = createScratch();
    let peak = 0;
    for (let i = 0; i < 30 * SIM_HZ && sim.phase === 'playing'; i++) {
      run(sim, map, scratch, 1);
      peak = Math.max(peak, sim.enemies.live);
    }
    // At most the ranks inside the play area, plus the one entering.
    expect(peak).toBeLessThanOrEqual((WINDOW_ROWS / UNIT + 2) * UNITS_ACROSS);
    expect(sim.enemies.items).toHaveLength(POOL_ENEMIES);
    expect(sim.nextRow).toBeLessThan(WINDOW_ROWS + 150);
  });

  it('treats empty rows as gaps in the march', () => {
    const map = mapFromRows([rowWith({ 5: 'E1' }), ...gap(5), rowWith({ 5: 'E1' })]);
    const sim = createSim(map, 1);
    const ys = rats(sim)
      .map((e) => e.y)
      .sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeCloseTo(6, 9);
  });
});

describe('enemy placement', () => {
  it('uses the token cell as the front-left corner of big enemies (D11)', () => {
    const map = mapFromRows([rowWith({ 4: 'E4' }), ...gap(19), rowWith({ 2: 'E5' })]);
    const sim = createSim(map, 1);
    const [e4, e5] = [4, 5].map((t) => rats(sim).find((e) => e.type === t)!);
    expect([e4.w, e4.h]).toEqual([8 * UNIT, 8 * UNIT]);
    expect(e4.x - e4.w / 2).toBe(4);
    expect(e4.y + e4.h / 2).toBeCloseTo(PRE_ADVANCE_ROWS, 9);
    expect([e5.w, e5.h]).toEqual([20 * UNIT, 20 * UNIT]);
    expect(e5.x - e5.w / 2).toBe(2);
    expect(e5.y + e5.h / 2).toBeCloseTo(PRE_ADVANCE_ROWS - 20, 9);
    // The body extends behind the front edge, up the lane.
    expect(e5.y - e5.h / 2).toBeCloseTo(PRE_ADVANCE_ROWS - 20 - e5.h, 9);
  });

  it('shifts a footprint that would leave the lane inward (D11)', () => {
    for (const row of [rowWith({ 43: 'E5' }), rowWith({ 40: 'E4' }), rowWith({ 30: 'E8' })]) {
      const sim = createSim(mapFromRows([row]), 1);
      const e = rats(sim)[0];
      expect(e.x + e.w / 2).toBe(COLS);
      expect(e.x - e.w / 2).toBeGreaterThanOrEqual(0);
    }
  });

  it('no enemy is wider than the lane, even at twice its SPEC size (A31)', () => {
    for (let t = 1; t <= 8; t++) expect(ENEMY_STATS[t].w).toBeLessThanOrEqual(COLS);
    expect(ENEMY_STATS[1].w).toBe(UNIT);
    expect(ENEMY_STATS[4].w).toBe(8 * UNIT);
    expect(ENEMY_STATS[5].w).toBe(20 * UNIT);
    // E8 would be 60 cells wide; it is as wide as the lane.
    expect(ENEMY_STATS[8].w).toBe(COLS);
  });

  it('applies HP overrides and authored drops', () => {
    const map = mapFromRows([rowWith({ 0: 'E41', 20: 'E1-P2', 30: 'E1', 40: 'E3-9' })]);
    const sim = createSim(map, 1);
    const find = (t: number, x?: number) => rats(sim).find((e) => e.type === t && (x === undefined || e.x === x))!;
    expect(find(4)).toMatchObject({ hp: ENEMY_STATS[4].hp, maxHp: ENEMY_STATS[4].hp, drop: 1 });
    expect(find(1, 21)).toMatchObject({ hp: 1, drop: 2 });
    expect(find(1, 31)).toMatchObject({ hp: 1, drop: 0 });
    expect(find(3)).toMatchObject({ hp: 9, maxHp: 9 });
    const boss = rats(createSim(mapFromRows([rowWith({ 0: 'E5-100' })]), 1))[0];
    expect(boss).toMatchObject({ type: 5, hp: 100, maxHp: 100 });
  });

  it('marches each type at its own speed (D1)', () => {
    for (const [token, type] of [
      ['E1', 1],
      ['E4', 4],
      ['E7', 7],
    ] as const) {
      const map = mapFromRows([rowWith({ 0: `${token}-99999` }), ...FAR_RAT]);
      const sim = createSim(map, 1, LONE);
      const scratch = createScratch();
      // Keep the lone cat out of the way.
      run(sim, map, scratch, 1, { targetDelta: 40, keyDir: 0 });
      const e = rats(sim)[0];
      const y = e.y;
      run(sim, map, scratch, SIM_HZ);
      expect(e.y - y).toBeCloseTo(ENEMY_STATS[type].speedSpec * SPEED_SCALE, 6);
    }
    expect(ENEMY_STATS[1].speedSpec).toBeGreaterThan(ENEMY_STATS[4].speedSpec);
    expect(ENEMY_STATS[4].speedSpec).toBeGreaterThan(ENEMY_STATS[7].speedSpec);
  });

  it('resolves ER to E1-E3 from the seed', () => {
    const map = mapFromRows(Array.from({ length: 20 }, () => fullRow('ER')));
    const a = createSim(map, 42);
    const b = createSim(map, 42);
    const c = createSim(map, 43);
    const types = (sim: typeof a) => rats(sim).map((e) => e.type);
    expect(types(a)).toEqual(types(b));
    expect(types(a)).not.toEqual(types(c));
    expect(new Set(types(a))).toEqual(new Set([1, 2, 3]));
    for (const e of rats(a)) {
      expect(enemyTypeAt(map, 42, e.row, e.x - e.w / 2)).toBe(e.type);
    }
  });

  it('reports no enemy for empty cells and gates', () => {
    const map = mapFromRows([rowWith({ 0: 'G5', 2: 'E2', 43: 'G9-P3' })]);
    expect(enemyTypeAt(map, 1, 0, 0)).toBe(0);
    expect(enemyTypeAt(map, 1, 0, 2)).toBe(2);
    expect(enemyTypeAt(map, 1, 0, 5)).toBe(0);
  });
});

describe('footprints in the grid (A21, A31)', () => {
  it('a minion covers 2 by 2 cells: a full row gives 22, and the row behind gives none', () => {
    const map = mapFromRows([fullRow('E1'), fullRow('E1'), fullRow('E2')]);
    const layout = getLayout(map, 1);
    const row = (r: number): number[] => [...layout.type.subarray(r * COLS, (r + 1) * COLS)];
    expect(row(0).filter((t) => t === 1)).toHaveLength(UNITS_ACROSS);
    expect(row(0).every((t, c) => (c % 2 === 0 ? t === 1 : t === 0))).toBe(true);
    expect(row(1).every((t) => t === 0)).toBe(true);
    expect(row(2).filter((t) => t === 2)).toHaveLength(UNITS_ACROSS);
    expect(layout.dropped).toBe(3 * COLS - 2 * UNITS_ACROSS);
    expect(createSim(map, 1).enemies.live).toBe(2 * UNITS_ACROSS);
  });

  it('a minion may start on any column that has room', () => {
    const map = mapFromRows([rowWith({ 1: 'E1', 2: 'E1', 3: 'E1', 43: 'E1' })]);
    const layout = getLayout(map, 1);
    const placed = [...layout.type.subarray(0, COLS)].flatMap((t, c) => (t === 1 ? [c] : []));
    // Column 2 is taken by the first; the last is pulled in from the wall.
    expect(placed).toEqual([1, 3, 42]);
  });

  it('leaves out minions that stand inside a big enemy', () => {
    // An E4 at column 10 covers columns 10-25 of its own row and the 15 rows behind it.
    const map = mapFromRows([
      rowWith({ 8: 'E1', 10: 'E4', 12: 'E1', 26: 'E1' }),
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 1 ? rowWith({ 12: 'E2', 26: 'E1' }) : rowWith({ 12: 'E2' }))),
      rowWith({ 12: 'E3' }),
    ]);
    const layout = getLayout(map, 1);
    const at = (r: number, c: number): number => layout.type[r * COLS + c];
    expect(at(0, 10)).toBe(4);
    expect(at(0, 8)).toBe(1);
    expect(at(0, 12)).toBe(0);
    expect(at(0, 26)).toBe(1);
    for (let r = 1; r <= 15; r++) expect(at(r, 12)).toBe(0);
    expect(at(2, 26)).toBe(1);
    // Row 16 is behind the footprint, so the cell is free again.
    expect(at(16, 12)).toBe(3);
  });

  it('moves a big enemy that would overlap another to the nearest free span', () => {
    const map = mapFromRows([rowWith({ 0: 'E41', 1: 'E42' })]);
    const layout = getLayout(map, 1);
    const placed = [...layout.type.subarray(0, COLS)].flatMap((t, c) => (t === 4 ? [c] : []));
    expect(placed).toEqual([0, 16]);
    // Each keeps the drop of its own token.
    expect(placed.map((c) => cellSpec(map, map.cells[layout.source[c]]).drop)).toEqual([1, 2]);
    expect(layout.dropped).toBe(0);

    const sim = createSim(map, 1);
    expect(
      rats(sim)
        .map((e) => e.x)
        .sort((a, b) => a - b),
    ).toEqual([8, 24]);
  });

  it('leaves out a big enemy when its row has no room', () => {
    const map = mapFromRows([rowWith({ 0: 'E5', 20: 'E5' })]);
    const layout = getLayout(map, 1);
    expect([...layout.type.subarray(0, COLS)].filter((t) => t === 5)).toHaveLength(1);
    expect(layout.dropped).toBe(1);
  });

  it('never lets two footprints share a cell', () => {
    const rows = Array.from({ length: 120 }, (_, r) =>
      rowWith({ [(r * 7) % 40]: r % 9 === 0 ? 'E5' : 'E4', [(r * 13) % 44]: 'E1', [(r * 5 + 3) % 44]: 'E3', 20: 'E2' }),
    );
    const map = mapFromRows(rows);
    const layout = getLayout(map, 3);
    const owner = new Int32Array((map.rows + COLS) * COLS).fill(-1);
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
    const map = mapFromRows([rowWith({ 0: 'E4', 20: 'ER', 30: 'ER' })]);
    expect(getLayout(map, 5)).toBe(getLayout(map, 5));
  });
});

describe('march (A28: pursuit is switched off)', () => {
  it('every rat marches straight for the goal line, whatever the swarm does', () => {
    const map = mapFromRows([rowWith({ 2: 'E1', 6: 'E4', 40: 'E3' }), ...FAR_RAT]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    const before = rats(sim).map((e) => ({ e, x: e.x, y: e.y }));
    run(sim, map, scratch, 1, { targetDelta: 15, keyDir: 0 });
    run(sim, map, scratch, 3 * SIM_HZ);
    for (const { e, x, y } of before) {
      expect(e.x).toBe(x);
      expect(e.y - y).toBeGreaterThan(2.9 * e.speed);
    }
  });

  it('a rat that the swarm does not stop walks on to the goal line', () => {
    const map = mapFromRows([rowWith({ 2: 'E1' })]);
    const sim = createSim(map, 1, { startClones: 6 });
    const scratch = createScratch();
    while (sim.phase === 'playing' && sim.tick < 30 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.phase).toBe('lost');
    expect(sim.lossReason).toBe('base');
    expect(sim.clones).toBe(6);
  });
});

describe('rail gates (A27, A29, A31)', () => {
  it('a gate token in an edge column puts a gate on that side rail, outside the lane', () => {
    const map = mapFromRows([rowWith({ 2: 'G25-P3', 4: 'E1', 41: 'G7' })]);
    const layout = getLayout(map, 1);
    // The value is the token's column plus one.
    expect(layout.gateLeft[0]).toBe(3);
    expect(layout.gateRight[0]).toBe(42);
    // The token's own cell holds no rat; the cells beside it are free for one.
    expect(layout.type[2]).toBe(0);
    expect(layout.type[4]).toBe(1);

    const sim = createSim(map, 1);
    const gates = gatesOf(sim).sort((a, b) => a.x - b.x);
    expect(gates).toHaveLength(2);
    expect(gates[0]).toMatchObject({ x: RAIL_LEFT_X, w: GATE_WIDTH, hp: 25, drop: DROP_CLONE_10 });
    expect(gates[1]).toMatchObject({ x: RAIL_RIGHT_X, w: GATE_WIDTH, hp: 7, drop: 0 });
    expect(gates[0].x + gates[0].w / 2).toBeLessThanOrEqual(0);
    expect(gates[1].x - gates[1].w / 2).toBeGreaterThanOrEqual(COLS);
    expect(sim.enemies.live).toBe(3);
  });

  it('rats fill the lane from wall to wall and never stand on a rail', () => {
    const map = mapFromRows([fullRow('E1'), '', rowWith({ 0: 'G5' }), '', fullRow('E2')]);
    const sim = createSim(map, 1);
    expect(rats(sim)).toHaveLength(2 * UNITS_ACROSS);
    expect(Math.min(...rats(sim).map((e) => e.x - e.w / 2))).toBe(0);
    expect(Math.max(...rats(sim).map((e) => e.x + e.w / 2))).toBe(COLS);
  });

  it('is collected by touching it: the swarm grows on the spot', () => {
    const map = mapFromRows([rowWith({ 0: 'G3-P3' }), ...FAR_RAT]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    // Step onto the left rail and wait for the gate.
    run(sim, map, scratch, 1, { targetDelta: RAIL_LEFT_X - sim.shooter.x, keyDir: 0 });
    while (sim.clones === 0 && sim.tick < 20 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.clones).toBe(10);
    expect(gatesOf(sim)).toHaveLength(0);
    // No box to catch: the reward is immediate.
    expect(sim.powerups.live).toBe(0);
    expect(sim.phase).toBe('playing');
  });

  it('bullets fly through it: it cannot be shot', () => {
    const map = mapFromRows([rowWith({ 0: 'G3-P3' }), ...FAR_RAT]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    run(sim, map, scratch, 1, { targetDelta: RAIL_LEFT_X - sim.shooter.x, keyDir: 0 });
    run(sim, map, scratch, 2 * SIM_HZ);
    expect(sim.shots).toBeGreaterThan(2);
    expect(gatesOf(sim)).toHaveLength(1);
    expect(gatesOf(sim)[0].hp).toBe(3);
    expect(sim.clones).toBe(0);
  });

  it('hurts nobody: clones standing in its way are kept, and more join', () => {
    const map = mapFromRows([rowWith({ 0: 'G3-P3' }), ...FAR_RAT]);
    const sim = createSim(map, 1, { startClones: 18 });
    const scratch = createScratch();
    run(sim, map, scratch, 1, { targetDelta: RAIL_LEFT_X - sim.shooter.x, keyDir: 0 });
    while (gatesOf(sim).length > 0 && sim.tick < 20 * SIM_HZ) run(sim, map, scratch, 1);
    run(sim, map, scratch, SIM_HZ);
    expect(sim.clones).toBe(28);
    expect(sim.phase).toBe('playing');
  });

  it('is only a missed reward when the swarm is elsewhere', () => {
    const map = mapFromRows([rowWith({ 0: 'G3-P3' }), ...FAR_RAT]);
    const sim = createSim(map, 1, { startClones: 6 });
    const scratch = createScratch();
    while (gatesOf(sim).length > 0 && sim.tick < 30 * SIM_HZ) run(sim, map, scratch, 1);
    expect(gatesOf(sim)).toHaveLength(0);
    expect(sim.phase).toBe('playing');
    expect(sim.clones).toBe(6);
  });

  it('with no drop code it still gives a reward', () => {
    const map = mapFromRows([rowWith({ 43: 'G2' }), ...FAR_RAT]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    run(sim, map, scratch, 1, { targetDelta: RAIL_RIGHT_X - sim.shooter.x, keyDir: 0 });
    while (gatesOf(sim).length > 0 && sim.tick < 20 * SIM_HZ) run(sim, map, scratch, 1);
    // A surprise panel gives clones or one of the weapons (B4).
    const weapon = sim.minigun > 0 || sim.rocketMode > 0 || sim.laser > 0 || sim.tank > 0;
    expect(weapon || [1, 3, 10, 50].includes(sim.clones)).toBe(true);
  });
});

describe('enemy collision (A21)', () => {
  it('a packed block marches without being disturbed', () => {
    const map = mapFromRows([...Array.from({ length: 6 }, () => rowWith({ 0: 'E3', 2: 'E3', 4: 'E3' })), ...FAR_RAT]);
    const sim = createSim(map, 1, LONE);
    run(sim, map, createScratch(), 60);
    const xs = [...new Set(rats(sim).map((e) => e.x))].sort((a, b) => a - b);
    expect(xs).toEqual([1, 3, 5]);
    expect(rats(sim)).toHaveLength(9);
  });

  it('minions keep their distance from each other', () => {
    const map = mapFromRows(Array.from({ length: 12 }, () => fullRow('E3')));
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    let closest = Infinity;
    for (let i = 0; i < 4 * SIM_HZ && sim.phase === 'playing'; i++) {
      run(sim, map, scratch, 1);
      if (i % 30 !== 0) continue;
      const list = rats(sim);
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const d = Math.hypot(list[a].x - list[b].x, list[a].y - list[b].y);
          if (d < closest) closest = d;
        }
      }
    }
    expect(closest).toBeGreaterThan(MINION_SPACING * 0.9);
  });

  it('big enemies side by side keep their footprints apart', () => {
    const map = mapFromRows([rowWith({ 0: 'E4-100000', 1: 'E4-100000' }), ...FAR_RAT]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    run(sim, map, scratch, 1, { targetDelta: 40, keyDir: 0 });
    let worst = Infinity;
    for (let i = 0; i < 4 * SIM_HZ && sim.phase === 'playing'; i++) {
      run(sim, map, scratch, 1);
      const xs = rats(sim)
        .filter((e) => e.type === 4)
        .map((e) => e.x)
        .sort((a, b) => a - b);
      worst = Math.min(worst, xs[1] - xs[0]);
    }
    expect(worst).toBeGreaterThan(ENEMY_STATS[4].w - 0.4);
  });

  it('minions do not walk through a slower big enemy: they are held up behind it', () => {
    // The E4 marches at 80% of the minions' speed, so the ranks behind it catch up.
    const map = mapFromRows([
      rowWith({ 14: 'E4-100000' }),
      ...gap(15),
      ...Array.from({ length: 12 }, () => fullRow('E1')),
      ...FAR_RAT,
    ]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    run(sim, map, scratch, 1, { targetDelta: 40, keyDir: 0 });
    for (let i = 0; i < 6 * SIM_HZ && sim.phase === 'playing'; i++) {
      run(sim, map, scratch, 1);
      const big = rats(sim).find((e) => e.type === 4);
      if (!big || i % 10 !== 0) continue;
      for (const e of rats(sim)) {
        if (e.type === 4) continue;
        const inside = Math.abs(e.x - big.x) < big.w / 2 - 0.6 && Math.abs(e.y - big.y) < big.h / 2 - 0.6;
        expect(inside).toBe(false);
      }
    }
  });
});

describe('enemy pool', () => {
  const small = (enemies: number) => ({ capacities: { enemies, bullets: 64, fx: 64, powerups: 8 }, startClones: 0 });

  it('waits when the pool cannot hold the next rank, and logs once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = mapFromRows(Array.from({ length: 12 }, () => fullRow('E3')));
    const sim = createSim(map, 1, small(UNITS_ACROSS + 8));
    // Row 0 fits; row 1 holds nobody; row 2 has to wait.
    expect(sim.nextRow).toBe(2);
    expect(sim.enemies.live).toBe(UNITS_ACROSS);
    expect(warn).toHaveBeenCalledTimes(1);

    run(sim, map, createScratch(UNITS_ACROSS + 8), 2 * SIM_HZ);
    expect(sim.nextRow).toBe(2);
    expect(sim.enemies.items).toHaveLength(UNITS_ACROSS + 8);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('resumes at the right place once there is room', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Two rats in the line of fire come first; the shooter clears them and frees the pool.
    const map = mapFromRows([rowWith({ 22: 'E1' }), '', rowWith({ 22: 'E1' }), '', fullRow('E1'), ...gap(300), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, small(UNITS_ACROSS + 1));
    expect(sim.nextRow).toBe(4);
    const scratch = createScratch(UNITS_ACROSS + 1);
    while (sim.nextRow < 5 && sim.tick < 5 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.nextRow).toBeGreaterThanOrEqual(5);
    const late = rats(sim).filter((e) => e.row === 4);
    expect(late.length).toBeGreaterThan(UNITS_ACROSS - 3);
    for (const e of late) expect(e.y + e.h / 2).toBeCloseTo(sim.scroll - 4, 1);
  });
});
