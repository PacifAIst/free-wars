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
  /** Seconds until the next shot. */
  fireCooldown: number;
}

/**
 * Fixed-capacity free-list pool. All items are created once; `active` marks the
 * ones in use. Nothing is allocated during play (PLAN section 4).
 */
export interface Pool<T extends { active: boolean }> {
  items: T[];
  /** Stack of free indices; the top `freeCount` entries are valid. */
  free: number[];
  freeCount: number;
  /** Number of active items. */
  live: number;
  /** One past the highest index in use: loops run over `0..high`. */
  high: number;
}

export interface Enemy {
  active: boolean;
  /** 1..8, see ENEMY_STATS. */
  type: number;
  /** Centre of the footprint, in gu. y grows towards the base line. */
  x: number;
  y: number;
  prevY: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  /** March speed in gu/s. */
  speed: number;
  /** Authored drop code (D9), 0 for none. */
  drop: number;
  /** Seconds of hit flash left. */
  flash: number;
  /** Grid row this enemy came from. */
  row: number;
}

export interface Bullet {
  active: boolean;
  x: number;
  y: number;
  prevY: number;
  /** 0 regular, 1 minigun. */
  kind: number;
}

/** Cosmetic effect. Lives in the sim so replays look identical, but never affects play. */
export interface Fx {
  active: boolean;
  /** FX_HIT, FX_KILL or FX_BASE. */
  kind: number;
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
}

export type SimPhase = 'playing' | 'won' | 'lost';
/** Why the level was lost: base integrity gone, or a boss reached the base line (B1). */
export type LossReason = '' | 'base' | 'boss';

/** Player input for one sim tick, already converted to lane units. */
export interface SimInput {
  /** Change of the shooter target this tick, in gu. */
  targetDelta: number;
  /** Keyboard direction: -1 left, 0 none, +1 right. */
  keyDir: number;
}

export interface SimState {
  version: 1;
  mapId: string;
  /** Seed of this run. `ER` cells are resolved from it. */
  seed: number;
  /** Current state of the seeded PRNG. */
  rng: number;
  tick: number;
  phase: SimPhase;
  lossReason: LossReason;
  /** Distance the front line has marched since it entered the window, in gu. */
  scroll: number;
  /** Stream cursor: the next grid row to spawn (D4). */
  nextRow: number;
  totalRows: number;
  /** B1: base integrity. */
  baseHp: number;
  kills: number;
  /** Bullets fired by the swarm so far. */
  shots: number;
  /** True once the "enemy pool full" warning has been logged. */
  poolFullLogged: boolean;
  shooter: ShooterState;
  enemies: Pool<Enemy>;
  bullets: Pool<Bullet>;
  fx: Pool<Fx>;
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
