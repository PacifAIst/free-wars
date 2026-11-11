import type { ShooterState, SimInput } from '../types';
import {
  COLS,
  KEY_PAN_SPEED,
  SHOOTER_HALF_WIDTH,
  SHOOTER_START_X,
  SIM_DT,
  SPRING_OMEGA,
  SPRING_ZETA,
} from './constants';

/** Leftmost and rightmost shooter positions: it stops when it touches a barrier (D2). */
export const SHOOTER_MIN_X = SHOOTER_HALF_WIDTH;
export const SHOOTER_MAX_X = COLS - SHOOTER_HALF_WIDTH;

export function createShooter(): ShooterState {
  return { x: SHOOTER_START_X, prevX: SHOOTER_START_X, v: 0, targetX: SHOOTER_START_X, fireCooldown: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Moves the shooter one tick. Input shifts the target; the shooter follows it
 * through a damped spring, which gives the eased start and stop of the map
 * slide. The target is clamped at the barriers, so the spring itself produces
 * the soft stop; the position clamp is only a guard against overshoot.
 */
export function stepShooter(s: ShooterState, input: SimInput): void {
  s.prevX = s.x;
  s.targetX = clamp(
    s.targetX + input.targetDelta + input.keyDir * KEY_PAN_SPEED * SIM_DT,
    SHOOTER_MIN_X,
    SHOOTER_MAX_X,
  );

  // Semi-implicit Euler: stable here because SPRING_OMEGA * SIM_DT is 0.2.
  const accel = -SPRING_OMEGA * SPRING_OMEGA * (s.x - s.targetX) - 2 * SPRING_ZETA * SPRING_OMEGA * s.v;
  s.v += accel * SIM_DT;
  s.x += s.v * SIM_DT;

  if (s.x < SHOOTER_MIN_X) {
    s.x = SHOOTER_MIN_X;
    if (s.v < 0) s.v = 0;
  } else if (s.x > SHOOTER_MAX_X) {
    s.x = SHOOTER_MAX_X;
    if (s.v > 0) s.v = 0;
  }
}
