import { formationRadius } from '../src/game/Clone';
import {
  CLONE_FIRE_RATE_FACTOR,
  COLS,
  FIRE_RATE,
  GATE_TYPE,
  MARCH_SPEED,
  SHOOTER_Y,
  WINDOW_ROWS,
} from '../src/game/constants';
import { createScratch, type SimScratch, stepSim } from '../src/game/Sim';
import type { SimOptions } from '../src/game/World';
import { formatIssue, parseMap } from '../src/parsers/markdownMapParser';
import type { Enemy, MapData, SimInput, SimState } from '../src/types';

export const IDLE: SimInput = { targetDelta: 0, keyDir: 0 };

/** Sim options for tests about the shooter alone: no starting clones. */
export const LONE: Partial<SimOptions> = { startClones: 0 };

/** A row with the given tokens at the given 0-based columns. */
export function rowWith(cells: Record<number, string>): string {
  const row = Array.from({ length: COLS }, () => '');
  for (const [col, token] of Object.entries(cells)) row[Number(col)] = token;
  return row.join('\t');
}

export const fullRow = (token: string): string => Array.from({ length: COLS }, () => token).join('\t');
export const emptyRow = (): string => '';

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

/**
 * A simple player, used to check that a level can be won, not to play well.
 *
 *  1. With time to spare before the rats reach the goal line, catch a falling
 *     box, or else go and break the nearest gate.
 *  2. Otherwise the rats come first. Sweep: move the swarm over the nearest column that still has
 *     rats of the leading band, a swarm-width at a time, and hold until it is clear.
 */
export function botInput(sim: SimState, out: SimInput): SimInput {
  const x = sim.shooter.targetX;
  const radius = formationRadius(sim.clones);
  let goal = x;

  let box: { x: number; y: number } | null = null;
  for (const p of sim.powerups.items) {
    if (p.active && p.y < SHOOTER_Y + 2 && (box === null || p.y > box.y)) box = p;
  }

  let danger = -Infinity;
  let rats = 0;
  for (const e of sim.enemies.items) {
    if (!e.active || e.type === GATE_TYPE || e.y < 0) continue;
    rats += e.hp;
    if (e.y + e.h / 2 > danger) danger = e.y + e.h / 2;
  }
  const secondsLeft = danger === -Infinity ? Infinity : (WINDOW_ROWS - danger) / MARCH_SPEED;
  // Time to clear what is on the lane: sweeping wastes part of the fire.
  const firepower = FIRE_RATE * (1 + sim.clones * CLONE_FIRE_RATE_FACTOR);
  const secondsNeeded = (rats / firepower) * 1.8 + 3;

  let gate: Enemy | null = null;
  for (const e of sim.enemies.items) {
    if (!e.active || e.type !== GATE_TYPE || e.y > SHOOTER_Y - 1.5 || e.y < 0) continue;
    if (gate === null || Math.abs(e.x - x) < Math.abs(gate.x - x)) gate = e;
  }

  const spare = secondsLeft > secondsNeeded + 2;
  if (spare && box !== null) {
    goal = box.x;
  } else if (spare && gate !== null) {
    goal = gate.x;
  } else if (danger !== -Infinity) {
    // Nearest column that still holds a rat of the leading band (12 rows deep at most).
    let best = Infinity;
    let column = x;
    for (const e of sim.enemies.items) {
      if (!e.active || e.type === GATE_TYPE || e.y < 0 || e.y + e.h / 2 < danger - 12) continue;
      const distance = Math.abs(e.x - x);
      if (distance < best) {
        best = distance;
        column = e.x;
      }
    }
    // Step past it by most of the swarm's width, so each stop covers fresh columns.
    goal = best <= 0.6 ? x : column + Math.sign(column - x) * radius * 0.7;
  }

  const delta = Math.max(0.5, Math.min(COLS - 0.5, goal)) - x;
  out.targetDelta = Math.max(-0.6, Math.min(0.6, delta));
  out.keyDir = 0;
  return out;
}

export { createScratch };
