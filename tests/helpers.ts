import { formationRadius } from '../src/game/Clone';
import { CLONE_BOX_AMOUNTS, COLS, DROP_CLONE_1, GATE_TYPE, SHOOTER_Y, UNIT } from '../src/game/constants';
import { createScratch, type SimScratch, stepSim } from '../src/game/Sim';
import type { SimOptions } from '../src/game/World';
import { formatIssue, parseMap } from '../src/parsers/markdownMapParser';
import type { Enemy, MapData, SimInput, SimState } from '../src/types';

export const IDLE: SimInput = { targetDelta: 0, keyDir: 0 };

/** Sim options for tests about the shooter alone: no starting clones. */
export const LONE: Partial<SimOptions> = { startClones: 0 };

/** The bot leaves a rail to sweep when the nearest rat is this many rows from the swarm. */
const BOT_CLOSE_ROWS = 26;

/** Minions that fit across the lane: each covers UNIT cells. */
export const UNITS_ACROSS = COLS / UNIT;

/** A row with the given tokens at the given 0-based columns. */
export function rowWith(cells: Record<number, string>): string {
  const row = Array.from({ length: COLS }, () => '');
  for (const [col, token] of Object.entries(cells)) row[Number(col)] = token;
  return row.join('\t');
}

/** A token in every cell of the row. Minions cover 2 by 2 cells, so half of them find room. */
export const fullRow = (token: string): string => Array.from({ length: COLS }, () => token).join('\t');
export const emptyRow = (): string => '';

/** `count` empty rows. */
export const gap = (count: number): string[] => Array.from({ length: count }, emptyRow);

/** Builds a map through the real parser, so tests use exactly what the game uses. */
export function mapFromRows(rows: string[], id = 'test'): MapData {
  const text = `# Map: Test\n\n- id: ${id}\n- name: Test\n- difficulty: 1\n\n## Grid\nColumns: 44\n\n\`\`\`\n${rows.join('\n')}\n\`\`\`\n`;
  const result = parseMap(text);
  if (!result.ok) throw new Error(result.errors.map(formatIssue).join('; '));
  return result.map;
}

export function run(
  sim: SimState,
  map: MapData,
  scratch: SimScratch,
  ticks: number,
  input: SimInput = IDLE,
): void {
  for (let i = 0; i < ticks; i++) stepSim(sim, map, input, scratch);
}

export function activeEnemies(sim: SimState): Enemy[] {
  return sim.enemies.items.filter((e) => e.active);
}

export const rats = (sim: SimState): Enemy[] => activeEnemies(sim).filter((e) => e.type !== GATE_TYPE);
export const gatesOf = (sim: SimState): Enemy[] => activeEnemies(sim).filter((e) => e.type === GATE_TYPE);

/**
 * A simple player, used to check that a level can be won, not to play well.
 *
 *  1. Rats close to the swarm come first: sweep them.
 *  2. Otherwise catch a falling box, or get under a tank bubble to shoot it open.
 *  3. Otherwise walk onto the rail of a panel that will arrive before any rat
 *     does, the richer one when two arrive together, and let it come.
 *  4. Otherwise sweep: move the swarm over the nearest column that still has
 *     rats of the leading band, a swarm-width at a time, and hold until it is clear.
 */
export function botInput(sim: SimState, out: SimInput): SimInput {
  const x = sim.shooter.targetX;
  const radius = formationRadius(sim.clones);
  let goal = x;

  // Front edge of the rat nearest the goal line.
  let danger = -Infinity;
  for (const e of sim.enemies.items) {
    if (!e.active || e.type === GATE_TYPE || e.y + e.h / 2 < 0) continue;
    if (e.y + e.h / 2 > danger) danger = e.y + e.h / 2;
  }
  const close = danger > SHOOTER_Y - radius - BOT_CLOSE_ROWS;

  let box: { x: number; y: number } | null = null;
  for (const p of sim.powerups.items) {
    if (p.active && p.y < SHOOTER_Y + 2 && (box === null || p.y > box.y)) box = p;
  }

  // The panel that reaches the swarm soonest, among those ahead of every rat.
  let gate: Enemy | null = null;
  let gateWorth = 0;
  for (const e of sim.enemies.items) {
    if (!e.active || e.type !== GATE_TYPE || e.y < 0 || e.y > SHOOTER_Y + radius) continue;
    if (e.y + e.h / 2 <= danger) continue;
    // A weapon counts for about as much as twenty cats.
    const worth = CLONE_BOX_AMOUNTS[e.drop - DROP_CLONE_1] ?? 20;
    if (gate === null || e.y > gate.y + 1 || (e.y > gate.y - 1 && worth > gateWorth)) {
      gate = e;
      gateWorth = worth;
    }
  }

  if (!close && box !== null) {
    goal = box.x;
  } else if (!close && gate !== null) {
    goal = gate.x;
  } else if (danger !== -Infinity) {
    // Nearest column that still holds a rat of the leading band (24 rows deep at most).
    let best = Infinity;
    let column = x;
    let reach = 0;
    for (const e of sim.enemies.items) {
      if (!e.active || e.type === GATE_TYPE || e.y + e.h / 2 < 0 || e.y + e.h / 2 < danger - 24) continue;
      const distance = Math.abs(e.x - x);
      if (distance < best) {
        best = distance;
        column = e.x;
        reach = e.w / 2;
      }
    }
    // A column is under fire only when a cat stands in it. Step past it by most of the
    // swarm's width, so each stop covers fresh columns.
    // A big rat is fought from straight in front of it, so the whole swarm hits it.
    if (reach > UNIT) goal = column;
    else goal = best < reach * 0.9 ? x : column + Math.sign(column - x) * radius * 0.7;
  }

  const delta = goal - x;
  out.targetDelta = Math.max(-0.8, Math.min(0.8, delta));
  out.keyDir = 0;
  return out;
}

export { createScratch };
