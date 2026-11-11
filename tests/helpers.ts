import { COLS } from '../src/game/constants';
import { createScratch, type SimScratch, stepSim } from '../src/game/Sim';
import { formatIssue, parseMap } from '../src/parsers/markdownMapParser';
import type { Enemy, MapData, SimInput, SimState } from '../src/types';

export const IDLE: SimInput = { targetDelta: 0, keyDir: 0 };

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

export { createScratch };
