import { describe, expect, it } from 'vitest';
import { DRAG_SENSITIVITY, LASER_BEAM_SECONDS, RAIL_RIGHT_X, SIM_HZ, WALL_DEPTH, WALL_Y } from '../src/game/constants';
import { FX_WALL } from '../src/game/Fx';
import { emptyFwMap, formatFw, fwToMapData, mapDataToFw, parseFw, placeItem } from '../src/game/fw';
import { Input } from '../src/game/Input';
import { createSim } from '../src/game/Sim';
import { parseMap } from '../src/parsers/markdownMapParser';
import type { MapData } from '../src/types';
import { createScratch, gap, gatesOf, LONE, rowWith, run } from './helpers';

/** A map with header lines of its own, through the real parser. */
function mapWith(header: string, rows: string[], id = 'test'): MapData {
  const text = `# Map: Test\n\n- id: ${id}\n- name: Test\n- difficulty: 1\n${header}\n## Grid\nColumns: 44\n\n\`\`\`\n${rows.join('\n')}\n\`\`\`\n`;
  const result = parseMap(text);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('; '));
  return result.map;
}

/** Three +10 panels on the right rail, eight rows apart, then a rat far up the file. */
const PANELS = [rowWith({ 43: 'G1-P3' }), ...gap(7), rowWith({ 43: 'G1-P3' }), ...gap(7), rowWith({ 43: 'G1-P3' }), ...gap(600), rowWith({ 0: 'E1' })];

describe('brick walls (A37)', () => {
  it('a map sets a wall and its HP on either rail', () => {
    const map = mapWith('- wall-right: 40\n', PANELS);
    expect(map.walls).toEqual([0, 40]);
    const sim = createSim(map, 1, LONE);
    expect(sim.walls[0].hp).toBe(0);
    expect(sim.walls[1]).toMatchObject({ hp: 40, maxHp: 40 });
    expect(mapWith('', PANELS).walls).toEqual([0, 0]);
  });

  it('holds the panels of its rail in a queue, in order, without overlap', () => {
    const map = mapWith('- wall-right: 100000\n', PANELS);
    const sim = createSim(map, 1, LONE);
    run(sim, map, createScratch(), 6 * SIM_HZ);
    const held = gatesOf(sim).sort((a, b) => b.y - a.y);
    expect(held).toHaveLength(3);
    // The first rests against the wall; the others behind it.
    expect(held[0].y + held[0].h / 2).toBeLessThan(WALL_Y - WALL_DEPTH / 2);
    expect(held[0].y + held[0].h / 2).toBeGreaterThan(WALL_Y - WALL_DEPTH / 2 - 1);
    for (let i = 1; i < held.length; i++) expect(held[i].y + held[i].h / 2).toBeLessThan(held[i - 1].y - held[i - 1].h / 2);
    for (const gate of held) expect(gate.y).toBe(gate.prevY);
    expect(sim.clones).toBe(0);
  });

  it('a rail without a wall is not held', () => {
    const map = mapWith('- wall-left: 100000\n', PANELS);
    const sim = createSim(map, 1, LONE);
    run(sim, map, createScratch(), 6 * SIM_HZ);
    expect(gatesOf(sim)).toHaveLength(0);
  });

  it('shots from its rail wear it down; when it breaks, what it held comes down', () => {
    const map = mapWith('- wall-right: 12\n', PANELS);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    // Shots from the lane do not touch it.
    run(sim, map, scratch, 3 * SIM_HZ);
    expect(sim.walls[1].hp).toBe(12);
    run(sim, map, scratch, 1, { targetDelta: RAIL_RIGHT_X - sim.shooter.x, keyDir: 0 });
    while (sim.walls[1].hp > 0 && sim.tick < 20 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.walls[1].hp).toBe(0);
    expect(sim.fx.items.some((f) => f.active && f.kind === FX_WALL && f.tag === 1)).toBe(true);
    // The three panels arrive one after the other: thirty cats.
    run(sim, map, scratch, 4 * SIM_HZ);
    expect(sim.clones).toBe(30);
    expect(gatesOf(sim)).toHaveLength(0);
  });

  it('panels left behind a wall that was never broken do not stop the level from being won', () => {
    const map = mapWith('- wall-right: 100000\n', [rowWith({ 43: 'G1-P3', 22: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    run(sim, map, createScratch(), 6 * SIM_HZ);
    expect(sim.phase).toBe('won');
    expect(gatesOf(sim)).toHaveLength(1);
  });

  it('is saved in a .fw file, on row 0 only', () => {
    const map = emptyFwMap('Walled');
    placeItem(map, { row: 0, side: 1, drop: 3 });
    map.walls = [0, 250];
    map.dark = true;
    const text = formatFw(map);
    expect(text).toContain('\ndark: yes\n');
    expect(text).toContain('\n0,R,WALL hp=250\n');
    const back = parseFw(text)!;
    expect(back.walls).toEqual([0, 250]);
    expect(back.dark).toBe(true);
    const data = fwToMapData(back)!;
    expect(data.walls).toEqual([0, 250]);
    expect(data.dark).toBe(true);
    expect(mapDataToFw(data).walls).toEqual([0, 250]);
    // Anywhere but the start of the map, or without HP, it is a wrong file.
    expect(parseFw('FREE-WARS MAP 1\n4,R,WALL hp=250\n')).toBeNull();
    expect(parseFw('FREE-WARS MAP 1\n0,R,WALL\n')).toBeNull();
    expect(parseFw('FREE-WARS MAP 1\n0,R,WALL hp=0\n')).toBeNull();
  });
});

describe('night maps (A37)', () => {
  const ROW = [rowWith({ 0: 'E1' })];

  it('boss maps are dark unless they say otherwise; other maps are not', () => {
    for (const id of ['11', '22', '33', '44']) expect(mapWith('', ROW, id).dark).toBe(true);
    for (const id of ['1', '10', '12', '43', 'custom']) expect(mapWith('', ROW, id).dark).toBe(false);
    expect(mapWith('- dark: no\n', ROW, '11').dark).toBe(false);
    expect(mapWith('- dark: yes\n', ROW, '5').dark).toBe(true);
  });
});

describe('quick edits (A37)', () => {
  it('a drag moves the swarm 44% less than the pointer', () => {
    expect(DRAG_SENSITIVITY).toBeCloseTo(0.56, 6);
    const input = new Input();
    (input as unknown as { dragPx: number }).dragPx = 100;
    // The swarm follows the finger: 100 px at 10 px a cell would be 10 cells.
    expect(Math.abs(input.consumeTargetDelta(10))).toBeCloseTo(5.6, 6);
  });

  it('the laser beam lasts half as long as in the SPEC', () => {
    expect(LASER_BEAM_SECONDS).toBe(0.25);
  });
});
