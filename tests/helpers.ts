import { COLS, SHOOTER_Y } from '../src/game/constants';
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
 * A simple player: it goes for a falling box if one is in reach, otherwise it
 * lines the swarm up under the enemy nearest the goal line. Used to check that
 * a level can be won, not to play well.
 */
export function botInput(sim: SimState, out: SimInput): SimInput {
  let goal = sim.shooter.targetX;
  let best = -Infinity;
  for (const p of sim.powerups.items) {
    if (p.active && p.y < SHOOTER_Y + 2 && p.y > best) {
      best = p.y;
      goal = p.x;
    }
  }
  if (best === -Infinity) {
    for (const e of sim.enemies.items) {
      if (e.active && e.y + e.h / 2 > best) {
        best = e.y + e.h / 2;
        goal = e.x;
      }
    }
  }
  const delta = goal - sim.shooter.targetX;
  out.targetDelta = Math.max(-0.5, Math.min(0.5, delta));
  out.keyDir = 0;
  return out;
}

export { createScratch };
