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
