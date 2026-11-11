import { describe, expect, it } from 'vitest';
import {
  CLONE_BOX_WEIGHTS,
  COLS,
  DROP_WEIGHTS,
  ENEMY_STATS,
  ENEMY_TYPE_COUNT,
  MARCH_SPEED,
  SPEED_SCALE,
  WINDOW_ROWS,
} from '../src/game/constants';

describe('constants', () => {
  it('D1: spec speeds convert to the documented gu/s values', () => {
    expect(10 * SPEED_SCALE).toBeCloseTo(0.75);
    expect(8 * SPEED_SCALE).toBeCloseTo(0.6);
    expect(5 * SPEED_SCALE).toBeCloseTo(0.375);
    expect(20 * SPEED_SCALE).toBeCloseTo(1.5);
    expect(50 * SPEED_SCALE).toBeCloseTo(3.75);
  });

  it('D1: a minion crosses the window in about a minute', () => {
    const seconds = WINDOW_ROWS / MARCH_SPEED;
    expect(seconds).toBeGreaterThan(55);
    expect(seconds).toBeLessThan(65);
  });

  it('has stats for all eight enemy types that fit the lane', () => {
    expect(ENEMY_STATS).toHaveLength(ENEMY_TYPE_COUNT + 1);
    for (let t = 1; t <= ENEMY_TYPE_COUNT; t++) {
      const s = ENEMY_STATS[t];
      expect(s.hp).toBeGreaterThan(0);
      expect(s.w).toBeLessThanOrEqual(COLS);
      expect(s.boss).toBe(t >= 5);
    }
  });

  it('B4: drop weights sum to 100', () => {
    expect(CLONE_BOX_WEIGHTS.reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.values(DROP_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});
