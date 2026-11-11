// Shared types. Sim state is plain data: no Pixi objects, no class instances,
// and it survives JSON.stringify / JSON.parse unchanged (PLAN section 4).

/** Top-level state machine (SPEC section 4). */
export type GameState = 'BOOT' | 'MENU' | 'LEVEL_SELECT' | 'LOADING' | 'PLAYING' | 'PAUSED' | 'WIN' | 'LOSE';

/** The black shooter. `x` is its position along the lane in gu (0..COLS). */
export interface ShooterState {
  x: number;
  /** Position at the previous tick, for render interpolation. */
  prevX: number;
  /** Velocity in gu/s. */
  v: number;
  /** Where the drag wants the shooter to be; the spring follows it. */
  targetX: number;
}

/** Player input for one sim tick, already converted to lane units. */
export interface SimInput {
  /** Change of the shooter target this tick, in gu. */
  targetDelta: number;
  /** Keyboard direction: -1 left, 0 none, +1 right. */
  keyDir: number;
}

export interface SimState {
  version: 1;
  tick: number;
  shooter: ShooterState;
}

// --- Maps (PLAN section 5) -------------------------------------------------------

export type CellKind = 'empty' | 'enemy' | 'random' | 'gate';

/** Decoded meaning of one grid cell. */
export interface CellSpec {
  readonly kind: CellKind;
  /** Enemy type 1..8 for `enemy`; 0 otherwise. */
  readonly type: number;
  /** Enemy HP override (0 = use the enemy table), or the resistance of a gate. */
  readonly hp: number;
  /** Authored drop code P1..P8 (D9), or 0 for none. */
  readonly drop: number;
}

export interface MapData {
  id: string;
  title: string;
  name: string;
  difficulty: number;
  author: string;
  description: string;
  columns: number;
  /** Number of grid rows. Row 0 enters the lane first. */
  rows: number;
  /** One token id per cell, row-major: `cells[row * columns + col]`. */
  cells: Uint16Array;
  /** Side table for cells with an HP override, an authored drop or a gate. */
  overrides: CellSpec[];
}

/** A parser message. `column` is the grid column 1..44 for cells, else a character position. */
export interface ParseIssue {
  line: number;
  column: number;
  message: string;
}

export type ParseResult =
  | { ok: true; map: MapData; warnings: ParseIssue[] }
  | { ok: false; errors: ParseIssue[] };
