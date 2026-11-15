// Token table: the single source of truth for what a grid cell means
// (PLAN section 5). If a reading turns out to be wrong, only this file and
// tests/tokens.test.ts change.
//
// | Token                 | Reading                                                   |
// |-----------------------|-----------------------------------------------------------|
// | empty or `.`          | Empty cell                                                |
// | `E1`..`E8`            | Enemy of that type                                        |
// | `E41`..`E44`          | E4 with an authored clone-box drop: +1, +3, +10, +50 (guess) |
// | `E5-100`, `E7-400`    | Enemy with an HP override (guess)                         |
// | `ER`                  | Random minion E1-E3 from the seeded PRNG (guess)          |
// | `E4-P8`, `E7-400-P3`  | Authored drop per D9; combines with an HP override        |
// | `G25`, `G25-P3`       | Gate cell with resistance 25 and an optional drop; only   |
// |                       | in columns 1-4 and 41-44                                  |

import { BUBBLE_TYPE, COLS, DROP_CODE_MAX, ENEMY_TYPE_COUNT } from '../game/constants';
import type { CellSpec, MapData } from '../types';

// --- Cell ids stored in the typed-array grid -----------------------------------

export const CELL_EMPTY = 0;
/** Ids 1..8 are plain enemies E1..E8. */
export const CELL_RANDOM = 9;
/** A tank bubble with its default HP (`TB`). */
export const CELL_BUBBLE = 10;
/** Ids from here up index `MapData.overrides`. */
export const CELL_OVERRIDE_BASE = 16;
/** A grid cell is a Uint16, which bounds the number of distinct override combinations. */
export const MAX_OVERRIDES = 0xffff - CELL_OVERRIDE_BASE + 1;

/** Gates may only stand in the four columns at each edge of the lane (SPEC section 10). */
export const GATE_EDGE_COLUMNS = 4;
/** Upper bound for HP overrides and gate resistance, to catch typos. */
export const MAX_AUTHORED_HP = 1_000_000;

const EMPTY_SPEC: CellSpec = Object.freeze({ kind: 'empty', type: 0, hp: 0, drop: 0 });
const RANDOM_SPEC: CellSpec = Object.freeze({ kind: 'random', type: 0, hp: 0, drop: 0 });

const BASIC_SPECS: readonly CellSpec[] = (() => {
  const specs: CellSpec[] = [];
  for (let id = 0; id < CELL_OVERRIDE_BASE; id++) {
    if (id >= 1 && id <= ENEMY_TYPE_COUNT) specs.push(Object.freeze({ kind: 'enemy', type: id, hp: 0, drop: 0 }));
    else if (id === CELL_RANDOM) specs.push(RANDOM_SPEC);
    else if (id === CELL_BUBBLE) specs.push(Object.freeze({ kind: 'enemy', type: BUBBLE_TYPE, hp: 0, drop: 0 }));
    else specs.push(EMPTY_SPEC);
  }
  return specs;
})();

/** Decodes a cell id. Returns shared objects: no allocation, safe in the hot loop. */
export function cellSpec(map: Pick<MapData, 'overrides'>, id: number): CellSpec {
  return id < CELL_OVERRIDE_BASE ? BASIC_SPECS[id] : map.overrides[id - CELL_OVERRIDE_BASE];
}

// --- Token grammar ---------------------------------------------------------------

// BASE[-HP][-P#]   where BASE is E1..E8, E41..E44 or ER
const ENEMY_TOKEN = /^(E4[1-4]|E[1-8]|ER)(?:-(\d+))?(?:-P(\d+))?$/;
// G<resistance>[-P#]
const GATE_TOKEN = /^G(\d+)(?:-P(\d+))?$/;

export type TokenResult = { ok: true; spec: CellSpec } | { ok: false; message: string };

const fail = (message: string): TokenResult => ({ ok: false, message });

function parseDrop(text: string | undefined): number | string {
  if (text === undefined) return 0;
  const code = Number(text);
  if (code < 1 || code > DROP_CODE_MAX) return `drop code P${text} is out of range (P1-P${DROP_CODE_MAX})`;
  return code;
}

function parseHp(text: string, what: string): number | string {
  const hp = Number(text);
  if (hp < 1) return `${what} must be at least 1`;
  if (hp > MAX_AUTHORED_HP) return `${what} ${text} is too large (max ${MAX_AUTHORED_HP})`;
  return hp;
}

/**
 * Parses one non-empty cell. `column` is the 1-based grid column and is only
 * used to check where gates may stand. Tokens are case-insensitive.
 */
export function parseToken(raw: string, column: number): TokenResult {
  const token = raw.trim().toUpperCase();
  if (token === '' || token === '.') return { ok: true, spec: EMPTY_SPEC };

  const gate = GATE_TOKEN.exec(token);
  if (gate) {
    if (column > GATE_EDGE_COLUMNS && column <= COLS - GATE_EDGE_COLUMNS) {
      return fail(`gate "${raw.trim()}" is only allowed in columns 1-${GATE_EDGE_COLUMNS} and ${COLS - GATE_EDGE_COLUMNS + 1}-${COLS}`);
    }
    const hp = parseHp(gate[1], 'gate resistance');
    if (typeof hp === 'string') return fail(hp);
    const drop = parseDrop(gate[2]);
    if (typeof drop === 'string') return fail(drop);
    return { ok: true, spec: { kind: 'gate', type: 0, hp, drop } };
  }

  // TB or TB-<hp>: a tank bubble.
  const bubble = /^TB(?:-(\d+))?$/.exec(token);
  if (bubble) {
    if (bubble[1] === undefined) return { ok: true, spec: BASIC_SPECS[CELL_BUBBLE] };
    const hp = parseHp(bubble[1], 'bubble HP');
    if (typeof hp === 'string') return fail(hp);
    return { ok: true, spec: { kind: 'enemy', type: BUBBLE_TYPE, hp, drop: 0 } };
  }

  const enemy = ENEMY_TOKEN.exec(token);
  if (!enemy) {
    return fail(`unknown token "${raw.trim()}" (expected E1-E8, E41-E44, ER, TB, G<n>, with optional -<hp> and -P<1-${DROP_CODE_MAX}>)`);
  }
  const [, base, hpText, dropText] = enemy;

  let hp = 0;
  if (hpText !== undefined) {
    const parsed = parseHp(hpText, 'HP override');
    if (typeof parsed === 'string') return fail(parsed);
    hp = parsed;
  }
  let drop = parseDrop(dropText);
  if (typeof drop === 'string') return fail(drop);

  if (base === 'ER') return { ok: true, spec: hp === 0 && drop === 0 ? RANDOM_SPEC : { kind: 'random', type: 0, hp, drop } };

  let type = Number(base[1]);
  if (base.length === 3) {
    // E41..E44: an E4 whose second digit names the clone box it drops.
    if (drop !== 0) return fail(`"${raw.trim()}" names two drops: ${base} already drops a clone box`);
    type = 4;
    drop = Number(base[2]);
  }
  return { ok: true, spec: hp === 0 && drop === 0 ? BASIC_SPECS[type] : { kind: 'enemy', type, hp, drop } };
}

/**
 * Turns decoded cells into ids, sharing one override entry between identical
 * cells so the side table stays small.
 */
export class CellEncoder {
  readonly overrides: CellSpec[] = [];
  private readonly index = new Map<string, number>();

  /** Returns the cell id, or -1 if the override table is full. */
  encode(spec: CellSpec): number {
    if (spec.hp === 0 && spec.drop === 0) {
      if (spec.kind === 'empty') return CELL_EMPTY;
      if (spec.kind === 'random') return CELL_RANDOM;
      if (spec.kind === 'enemy') return spec.type;
    }
    const key = `${spec.kind}:${spec.type}:${spec.hp}:${spec.drop}`;
    let id = this.index.get(key);
    if (id === undefined) {
      if (this.overrides.length >= MAX_OVERRIDES) return -1;
      id = CELL_OVERRIDE_BASE + this.overrides.length;
      this.overrides.push(Object.freeze({ ...spec }));
      this.index.set(key, id);
    }
    return id;
  }
}
