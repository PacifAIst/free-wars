import { describe, expect, it } from 'vitest';
import { COLS, KEY_PAN_SPEED, SIM_DT, SIM_HZ } from '../src/game/constants';
import { createShooter, SHOOTER_MAX_X, SHOOTER_MIN_X, stepShooter } from '../src/game/Player';

const idle = { targetDelta: 0, keyDir: 0 };

describe('shooter spring (D2)', () => {
  it('starts at the lane centre, at rest', () => {
    const s = createShooter();
    expect(s.x).toBe(COLS / 2);
    expect(s.v).toBe(0);
  });

  it('eases to the target and settles within a second', () => {
    const s = createShooter();
    stepShooter(s, { targetDelta: 5, keyDir: 0 });
    let maxX = s.x;
    let maxStep = 0;
    for (let i = 0; i < SIM_HZ; i++) {
      const before = s.x;
      stepShooter(s, idle);
      maxX = Math.max(maxX, s.x);
      maxStep = Math.max(maxStep, Math.abs(s.x - before));
    }
    expect(s.x).toBeCloseTo(COLS / 2 + 5, 2);
    expect(Math.abs(s.v)).toBeLessThan(0.05);
    // Nearly critically damped: no visible overshoot.
    expect(maxX).toBeLessThan(COLS / 2 + 5 * 1.01);
    // Eased, not teleported: no single tick covers a large part of the move.
    expect(maxStep).toBeLessThan(0.5);
  });

  it('accelerates smoothly from rest', () => {
    const s = createShooter();
    stepShooter(s, { targetDelta: 10, keyDir: 0 });
    const first = s.x - s.prevX;
    stepShooter(s, idle);
    const second = s.x - s.prevX;
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
  });

  it('stops at both barriers however hard it is pushed', () => {
    const s = createShooter();
    for (let i = 0; i < 120; i++) {
      stepShooter(s, { targetDelta: 3, keyDir: 0 });
      expect(s.x).toBeLessThanOrEqual(SHOOTER_MAX_X);
    }
    expect(s.x).toBeCloseTo(SHOOTER_MAX_X, 3);
    expect(s.targetX).toBe(SHOOTER_MAX_X);

    for (let i = 0; i < 240; i++) {
      stepShooter(s, { targetDelta: -3, keyDir: 0 });
      expect(s.x).toBeGreaterThanOrEqual(SHOOTER_MIN_X);
    }
    expect(s.x).toBeCloseTo(SHOOTER_MIN_X, 3);
  });

  it('keeps prevX one tick behind for interpolation', () => {
    const s = createShooter();
    stepShooter(s, { targetDelta: 4, keyDir: 0 });
    const x1 = s.x;
    stepShooter(s, idle);
    expect(s.prevX).toBe(x1);
  });

  it('moves with the keyboard at KEY_PAN_SPEED', () => {
    const s = createShooter();
    for (let i = 0; i < SIM_HZ / 2; i++) stepShooter(s, { targetDelta: 0, keyDir: 1 });
    expect(s.targetX).toBeCloseTo(COLS / 2 + KEY_PAN_SPEED * 0.5, 5);
    for (let i = 0; i < SIM_HZ; i++) stepShooter(s, { targetDelta: 0, keyDir: -1 });
    expect(s.targetX).toBeCloseTo(COLS / 2 - KEY_PAN_SPEED * 0.5, 5);
    expect(SIM_DT).toBeCloseTo(1 / 60);
  });
});
