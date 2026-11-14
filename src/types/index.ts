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
  prevX: number;
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
  /**
   * A countdown in seconds. For a big enemy that is winding up, the time until
   * its punch lands; under the tank, the time until it is crushed again.
   */
  contact: number;
  /** Big enemies: true from the moment the swarm comes in reach until the punch lands or the swarm gets away. */
  winding: boolean;
  /** Big enemies: punches landed so far. The arms take turns. */
  punches: number;
  /** Big enemies: seconds since the last punch landed. */
  swing: number;
  /** The last laser cast that damaged this enemy: a cast hurts a big enemy only once. */
  cast: number;
  /** E4, E7, E8: seconds until it fires its next rocket. */
  reload: number;
  /**
   * Gates only (A29). `swept` is -1 until the gate reaches the swarm, then the
   * position of its front edge at its last kill. `quota` is how many cats it
   * still has to kill: the ones that stood in its way when it arrived.
   */
  swept: number;
  quota: number;
}

/** A falling powerup box. */
export interface Powerup {
  active: boolean;
  /** Drop code 1..8 (D9). */
  kind: number;
  x: number;
  y: number;
  prevY: number;
  /** Tank bubble only: shots it still takes to open. */
  hp: number;
  /** Seconds of hit flash left. */
  flash: number;
}

/** A brick wall across a rail (A37). `hp` 0 means there is none, or it is broken. */
export interface Wall {
  hp: number;
  maxHp: number;
  /** Seconds of hit flash left. */
  flash: number;
  /** The last laser cast that damaged it. */
  cast: number;
}

/** A rocket fired by the swarm or the tank. */
export interface Rocket {
  active: boolean;
  x: number;
  y: number;
  prevY: number;
  /** 0 from a cat, 1 from the tank, 2 from an enemy (it flies down the lane). */
  kind: number;
  /** Enemy rockets: shots it still takes, the side of the square it clears, and its speed. */
  hp: number;
  aoe: number;
  speed: number;
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
  /** Serial number, so a renderer can tell which effects are new since its last frame. */
  id: number;
  /** One of the FX_* kinds in Fx.ts. */
  kind: number;
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  /** Extra detail for the renderer: the type of the enemy that died. */
  tag: number;
}

export type SimPhase = 'playing' | 'won' | 'lost';
/**
 * Why the level was lost: an enemy crossed the goal (`base`), a boss crossed it
 * (`boss`), or every cat was killed (`swarm`).
 */
export type LossReason = '' | 'base' | 'boss' | 'swarm';

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
  /** Effects started so far; the serial of the newest one. */
  fxCount: number;
  /** Bullets fired by the swarm so far. */
  shots: number;
  /** Rockets fired by the swarm and the tank so far. */
  rocketsFired: number;
  /** Rockets fired by enemies so far. */
  enemyRocketsFired: number;
  /** Seconds of minigun fire left (SPEC 8.1). */
  minigun: number;
  /** Seconds of rocket mode left. */
  rocketMode: number;
  /** Seconds of laser mode left, and the time into its charge, beam, cooling cycle. */
  laser: number;
  laserClock: number;
  /** Laser casts so far. */
  laserCasts: number;
  /** Seconds of tank left, and seconds until the tank fires again. */
  tank: number;
  tankCooldown: number;
  /** True once the "enemy pool full" warning has been logged. */
  poolFullLogged: boolean;
  shooter: ShooterState;
  /** Number of white clones around the shooter (0..CLONE_CAP). */
  clones: number;
  /** Seconds until each clone slot fires next. Fixed length CLONE_CAP. */
  cloneCooldowns: number[];
  enemies: Pool<Enemy>;
  powerups: Pool<Powerup>;
  bullets: Pool<Bullet>;
  rockets: Pool<Rocket>;
  /** The walls of the left and the right rail. */
  walls: Wall[];
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
  /** Authored drop code P1..P9 (D9, A34), or 0 for none. */
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
  /** A night map (A37). */
  dark: boolean;
  /** HP of the brick wall on the left and on the right rail; 0 for none. */
  walls: [number, number];
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
