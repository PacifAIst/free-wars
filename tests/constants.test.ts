import { describe, expect, it } from 'vitest';
import {
  CLONE_BOX_WEIGHTS,
  COLS,
  DROP_WEIGHTS,
  ENEMY_STATS,
  ENEMY_TYPE_COUNT,
  MARCH_SPEED,
  POWERUP_SPEED,
  SPEED_SCALE,
  WINDOW_ROWS,
} from '../src/game/constants';

describe('constants', () => {
  it('D1: spec speeds convert through SPEED_SCALE', () => {
    expect(MARCH_SPEED).toBeCloseTo(10 * SPEED_SCALE);
    expect(ENEMY_STATS[4].speedSpec * SPEED_SCALE).toBeCloseTo(MARCH_SPEED * 0.8);
    expect(ENEMY_STATS[7].speedSpec * SPEED_SCALE).toBeCloseTo(MARCH_SPEED * 0.5);
  });

  it('A18: a minion crosses the window in 15 to 30 seconds', () => {
    const seconds = WINDOW_ROWS / MARCH_SPEED;
    expect(seconds).toBeGreaterThan(15);
    expect(seconds).toBeLessThan(30);
  });

  it('B8: boxes fall faster than the army marches', () => {
    expect(POWERUP_SPEED).toBeGreaterThan(MARCH_SPEED);
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
