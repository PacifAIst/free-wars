import { describe, expect, it } from 'vitest';
import { COLS, SIM_HZ } from '../src/game/constants';
import { Game, type GameView, type RenderFrame, TRANSITIONS } from '../src/game/Game';
import type { InputSource } from '../src/game/Input';
import type { GameState } from '../src/types';

class FakeInput implements InputSource {
  dragGu = 0;
  dir = 0;
  tap = false;
  pause = false;
  consumeTargetDelta(): number {
    const d = this.dragGu;
    this.dragGu = 0;
    return d;
  }
  keyDir(): number {
    return this.dir;
  }
  takeTap(): boolean {
    const t = this.tap;
    this.tap = false;
    return t;
  }
  takePause(): boolean {
    const p = this.pause;
    this.pause = false;
    return p;
  }
}

class FakeView implements GameView {
  frames: RenderFrame[] = [];
  cellPx(): number {
    return 10;
  }
  render(frame: RenderFrame): void {
    this.frames.push({ ...frame });
  }
  last(): RenderFrame {
    return this.frames[this.frames.length - 1];
  }
}

const FRAME_MS = 1000 / 60;

/** Boots a game and taps through the menu so it is PLAYING at time `t`. */
function startPlaying(): { game: Game; input: FakeInput; view: FakeView; t: number } {
  const input = new FakeInput();
  const view = new FakeView();
  const game = new Game(view, input);
  game.ready();
  let t = 0;
  game.frame(t);
  input.tap = true;
  for (let i = 0; i < 4 && game.state !== 'PLAYING'; i++) game.frame((t += FRAME_MS));
  expect(game.state).toBe('PLAYING');
  return { game, input, view, t };
}

describe('state machine (SPEC section 4)', () => {
  it('defines transitions for all eight states', () => {
    const states: GameState[] = ['BOOT', 'MENU', 'LEVEL_SELECT', 'LOADING', 'PLAYING', 'PAUSED', 'WIN', 'LOSE'];
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...states].sort());
    for (const targets of Object.values(TRANSITIONS)) {
      for (const target of targets) expect(states).toContain(target);
    }
  });

  it('walks BOOT -> MENU -> LEVEL_SELECT -> LOADING -> PLAYING on a tap', () => {
    const input = new FakeInput();
    const game = new Game(new FakeView(), input);
    expect(game.state).toBe('BOOT');
    game.ready();
    expect(game.state).toBe('MENU');
    game.frame(0);
    expect(game.state).toBe('MENU');
    input.tap = true;
    const seen: GameState[] = [];
    for (let i = 1; i <= 3; i++) {
      game.frame(i * FRAME_MS);
      seen.push(game.state);
    }
    expect(seen).toEqual(['LEVEL_SELECT', 'LOADING', 'PLAYING']);
  });

  it('rejects illegal transitions', () => {
    const game = new Game(new FakeView(), new FakeInput());
    expect(() => game.transition('PLAYING')).toThrow(/Illegal state transition BOOT -> PLAYING/);
  });

  it('WIN and LOSE return to level select on a tap', () => {
    for (const end of ['WIN', 'LOSE'] as const) {
      const { game, input, t } = startPlaying();
      game.transition(end);
      game.frame(t + FRAME_MS);
      expect(game.state).toBe(end);
      input.tap = true;
      game.frame(t + 2 * FRAME_MS);
      expect(game.state).toBe('LEVEL_SELECT');
    }
  });
});

describe('fixed-step loop', () => {
  it('runs 60 sim ticks per second of frames', () => {
    const { game, t } = startPlaying();
    const start = game.sim.tick;
    for (let i = 1; i <= 120; i++) game.frame(t + i * FRAME_MS);
    const ticks = game.sim.tick - start;
    expect(ticks).toBeGreaterThanOrEqual(2 * SIM_HZ - 1);
    expect(ticks).toBeLessThanOrEqual(2 * SIM_HZ);
  });

  it('is independent of the display rate', () => {
    const { game, t } = startPlaying();
    const start = game.sim.tick;
    for (let i = 1; i <= 30; i++) game.frame(t + i * (1000 / 30));
    // One tick of slack: the last step can sit a rounding error below the threshold.
    expect(game.sim.tick - start).toBeGreaterThanOrEqual(SIM_HZ - 1);
    expect(game.sim.tick - start).toBeLessThanOrEqual(SIM_HZ);
  });

  it('clamps a 5 second gap to 100 ms of simulation', () => {
    const { game, t } = startPlaying();
    const start = game.sim.tick;
    game.frame(t + 5000);
    expect(game.sim.tick - start).toBeLessThanOrEqual(6);
  });

  it('does not jump after the clock is reset', () => {
    const { game, t } = startPlaying();
    const start = game.sim.tick;
    game.resetClock();
    game.frame(t + 60_000);
    expect(game.sim.tick).toBe(start);
  });

  it('reports an interpolation alpha in [0, 1)', () => {
    const { game, view, t } = startPlaying();
    for (let i = 1; i <= 50; i++) {
      game.frame(t + i * 7.3);
      expect(view.last().alpha).toBeGreaterThanOrEqual(0);
      expect(view.last().alpha).toBeLessThan(1);
    }
  });

  it('applies a drag once, in the first step of the frame', () => {
    const { game, input, t } = startPlaying();
    input.dragGu = 4;
    game.frame(t + 50);
    expect(game.sim.shooter.targetX).toBeCloseTo(COLS / 2 + 4, 6);
  });

  it('keeps a drag that arrives before a full tick has accumulated', () => {
    const { game, input, t } = startPlaying();
    input.dragGu = 2;
    game.frame(t + 1);
    expect(game.sim.shooter.targetX).toBe(COLS / 2);
    game.frame(t + 40);
    expect(game.sim.shooter.targetX).toBeCloseTo(COLS / 2 + 2, 6);
  });
});

describe('pause', () => {
  it('stops the simulation and discards input made while paused', () => {
    const { game, input, t } = startPlaying();
    input.pause = true;
    game.frame(t + FRAME_MS);
    expect(game.state).toBe('PAUSED');
    const tick = game.sim.tick;
    input.dragGu = 9;
    for (let i = 2; i < 20; i++) game.frame(t + i * FRAME_MS);
    expect(game.sim.tick).toBe(tick);
    input.tap = true;
    game.frame(t + 20 * FRAME_MS);
    expect(game.state).toBe('PLAYING');
    game.frame(t + 21 * FRAME_MS);
    expect(game.sim.shooter.targetX).toBe(COLS / 2);
  });

  it('pause() and onBack() only act while playing', () => {
    const game = new Game(new FakeView(), new FakeInput());
    game.pause();
    expect(game.state).toBe('BOOT');
    const playing = startPlaying();
    playing.game.onBack();
    expect(playing.game.state).toBe('PAUSED');
  });
});
