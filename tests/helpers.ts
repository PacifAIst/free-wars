import { formationRadius } from '../src/game/Clone';
import {
  CLONE_BOX_AMOUNTS,
  CLONE_CAP,
  CLONE_FIRE_RATE_FACTOR,
  COLS,
  DROP_CLONE_1,
  FIRE_RATE,
  GATE_TYPE,
  MARCH_SPEED,
  SHOOTER_Y,
  UNIT,
  WINDOW_ROWS,
} from '../src/game/constants';
import { createScratch, type SimScratch, stepSim } from '../src/game/Sim';
import type { SimOptions } from '../src/game/World';
import { formatIssue, parseMap } from '../src/parsers/markdownMapParser';
import type { Enemy, MapData, SimInput, SimState } from '../src/types';

export const IDLE: SimInput = { targetDelta: 0, keyDir: 0 };

/** Sim options for tests about the shooter alone: no starting clones. */
export const LONE: Partial<SimOptions> = { startClones: 0 };

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
 *  1. With time to spare before the rats reach the goal line, catch a falling
 *     box, or else walk onto the rail of the nearest gate and let it arrive.
 *     A gate counts as time well spent when the cats it adds still leave time
 *     to clear the lane afterwards.
 *  2. Otherwise the rats come first. Sweep: move the swarm over the nearest
 *     column that still has rats of the leading band, a swarm-width at a time,
 *     and hold until it is clear.
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
  let hp = 0;
  for (const e of sim.enemies.items) {
    if (!e.active || e.type === GATE_TYPE || e.y < 0) continue;
    hp += e.hp;
    if (e.y + e.h / 2 > danger) danger = e.y + e.h / 2;
  }
  const secondsLeft = danger === -Infinity ? Infinity : (WINDOW_ROWS - danger) / MARCH_SPEED;
  // Time to clear what is on the lane: sweeping wastes part of the fire.
  const clearTime = (clones: number): number =>
    (hp / (FIRE_RATE * (1 + Math.min(CLONE_CAP, clones) * CLONE_FIRE_RATE_FACTOR))) * 1.8 + 3;
  const secondsNeeded = clearTime(sim.clones);

  // The gate that will reach the swarm's row soonest.
  let gate: Enemy | null = null;
  for (const e of sim.enemies.items) {
    if (!e.active || e.type !== GATE_TYPE || e.y < 0 || e.y > SHOOTER_Y + radius) continue;
    if (gate === null || e.y > gate.y) gate = e;
  }

  const spare = secondsLeft > secondsNeeded + 2;
  // Waiting for the gate, then clearing the lane with the cats it adds.
  let gateTime = Infinity;
  if (gate !== null) {
    const reward = CLONE_BOX_AMOUNTS[gate.drop - DROP_CLONE_1] ?? 1;
    const wait = Math.max(0, SHOOTER_Y - radius - gate.y) / gate.speed;
    gateTime = wait + clearTime(sim.clones + reward);
  }
  if (spare && box !== null) {
    goal = box.x;
  } else if (gate !== null && (spare || secondsLeft > gateTime + 2)) {
    goal = gate.x;
  } else if (danger !== -Infinity) {
    // Nearest column that still holds a rat of the leading band (24 rows deep at most).
    let best = Infinity;
    let column = x;
    let reach = 0;
    for (const e of sim.enemies.items) {
      if (!e.active || e.type === GATE_TYPE || e.y < 0 || e.y + e.h / 2 < danger - 24) continue;
      const distance = Math.abs(e.x - x);
      if (distance < best) {
        best = distance;
        column = e.x;
        reach = e.w / 2;
      }
    }
    // A column is under fire only when a cat stands in it. Step past it by most of the
    // swarm's width, so each stop covers fresh columns.
    goal = best < reach * 0.9 ? x : column + Math.sign(column - x) * radius * 0.7;
  }

  const delta = goal - x;
  out.targetDelta = Math.max(-0.8, Math.min(0.8, delta));
  out.keyDir = 0;
  return out;
}

export { createScratch };
