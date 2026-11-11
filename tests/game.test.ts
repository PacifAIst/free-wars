import { describe, expect, it, vi } from 'vitest';
import { COLS, SIM_HZ } from '../src/game/constants';
import { Game, type GameView, type RenderFrame, TRANSITIONS } from '../src/game/Game';
import type { InputSource } from '../src/game/Input';
import type { MapSource } from '../src/game/maps';
import type { GameState, MapData } from '../src/types';
import { mapFromRows, rowWith } from './helpers';

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

/** Enemies far from the shooter's column, so the level stays in progress. */
const QUIET_MAP = mapFromRows(Array.from({ length: 200 }, () => rowWith({ 0: 'E1' })), '1');
/** One enemy in the line of fire: won within a couple of seconds. */
const QUICK_WIN = mapFromRows([rowWith({ 22: 'E1' })], '1');
/** A boss that walks to the base line: lost after about 43 seconds. */
const SURE_LOSS = mapFromRows([rowWith({ 0: 'E5' })], '1');

function source(maps: Record<string, MapData>): MapSource & { loads: string[] } {
  const loads: string[] = [];
  return {
    loads,
    has: (id) => id in maps,
    load: (id) => {
      loads.push(id);
      return id in maps ? Promise.resolve(maps[id]) : Promise.reject(new Error(`no map ${id}`));
    },
  };
}

const FRAME_MS = 1000 / 60;
/** Lets resolved promises (the map load) run their callbacks. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Session {
  game: Game;
  input: FakeInput;
  view: FakeView;
  maps: ReturnType<typeof source>;
  t: number;
}

/** Boots a game and taps through the menu so it is PLAYING at time `t`. */
async function startPlaying(maps: Record<string, MapData> = { '1': QUIET_MAP }): Promise<Session> {
  const input = new FakeInput();
  const view = new FakeView();
  const mapSource = source(maps);
  const game = new Game(view, input, mapSource, { nextSeed: () => 7 });
  game.ready();
  let t = 0;
  game.frame(t);
  input.tap = true;
  for (let i = 0; i < 6 && game.state !== 'PLAYING'; i++) {
    game.frame((t += FRAME_MS));
    await settle();
  }
  expect(game.state).toBe('PLAYING');
  return { game, input, view, maps: mapSource, t };
}

describe('state machine (SPEC section 4)', () => {
  it('defines transitions for all eight states', () => {
    const states: GameState[] = ['BOOT', 'MENU', 'LEVEL_SELECT', 'LOADING', 'PLAYING', 'PAUSED', 'WIN', 'LOSE'];
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...states].sort());
    for (const targets of Object.values(TRANSITIONS)) {
      for (const target of targets) expect(states).toContain(target);
    }
  });

  it('walks BOOT -> MENU -> LEVEL_SELECT -> LOADING -> PLAYING on a tap', async () => {
    const input = new FakeInput();
    const game = new Game(new FakeView(), input, source({ '1': QUIET_MAP }));
    expect(game.state).toBe('BOOT');
    game.ready();
    expect(game.state).toBe('MENU');
    game.frame(0);
    expect(game.state).toBe('MENU');
    input.tap = true;
    const seen: GameState[] = [];
    for (let i = 1; i <= 5; i++) {
      game.frame(i * FRAME_MS);
      seen.push(game.state);
      await settle();
    }
    expect(seen).toEqual(['LEVEL_SELECT', 'LOADING', 'LOADING', 'PLAYING', 'PLAYING']);
    expect(game.map).toBe(QUIET_MAP);
    expect(game.sim.totalRows).toBe(200);
  });

  it('rejects illegal transitions', () => {
    const game = new Game(new FakeView(), new FakeInput(), source({}));
    expect(() => game.transition('PLAYING')).toThrow(/Illegal state transition BOOT -> PLAYING/);
  });

  it('plays the requested level', async () => {
    const input = new FakeInput();
    const maps = source({ '0': QUICK_WIN, '1': QUIET_MAP });
    const game = new Game(new FakeView(), input, maps, { levelId: '0' });
    game.ready();
    input.tap = true;
    for (let i = 0; i < 5; i++) {
      game.frame(i * FRAME_MS);
      await settle();
    }
    expect(maps.loads).toEqual(['0']);
    expect(game.map).toBe(QUICK_WIN);
  });

  it('returns to the menu with a notice when a map fails to load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const input = new FakeInput();
    const view = new FakeView();
    const game = new Game(view, input, source({}), { levelId: '9' });
    game.ready();
    input.tap = true;
    for (let i = 0; i < 6; i++) {
      game.frame(i * FRAME_MS);
      await settle();
    }
    expect(game.state).toBe('MENU');
    expect(view.last().notice).toBe('Could not load level 9');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('goes to WIN when the level is won, then on to the next level', async () => {
    const { game, input, maps, t } = await startPlaying({ '1': QUICK_WIN, '2': QUIET_MAP });
    let now = t;
    for (let i = 0; i < 5 * SIM_HZ && game.state === 'PLAYING'; i++) game.frame((now += FRAME_MS));
    expect(game.state).toBe('WIN');
    game.frame((now += FRAME_MS));
    expect(game.state).toBe('WIN');
    input.tap = true;
    for (let i = 0; i < 5; i++) {
      game.frame((now += FRAME_MS));
      await settle();
    }
    expect(game.state).toBe('PLAYING');
    expect(game.levelId).toBe('2');
    expect(maps.loads).toEqual(['1', '2']);
  });

  it('stays on the last level after winning it', async () => {
    const { game, input, t } = await startPlaying({ '1': QUICK_WIN });
    let now = t;
    for (let i = 0; i < 5 * SIM_HZ && game.state === 'PLAYING'; i++) game.frame((now += FRAME_MS));
    input.tap = true;
    game.frame(now + FRAME_MS);
    expect(game.state).toBe('LEVEL_SELECT');
    expect(game.levelId).toBe('1');
  });

  it('goes to LOSE when the level is lost, and retries the same level', async () => {
    const { game, input, maps, t } = await startPlaying({ '1': SURE_LOSS, '2': QUIET_MAP });
    let now = t;
    for (let i = 0; i < 60 * SIM_HZ && game.state === 'PLAYING'; i++) game.frame((now += FRAME_MS));
    expect(game.state).toBe('LOSE');
    expect(game.sim.lossReason).toBe('boss');
    input.tap = true;
    for (let i = 0; i < 5; i++) {
      game.frame((now += FRAME_MS));
      await settle();
    }
    expect(game.state).toBe('PLAYING');
    expect(game.levelId).toBe('1');
    expect(maps.loads).toEqual(['1', '1']);
    expect(game.sim.tick).toBeLessThan(10);
  });
});

describe('fixed-step loop', () => {
  it('runs 60 sim ticks per second of frames', async () => {
    const { game, t } = await startPlaying();
    const start = game.sim.tick;
    for (let i = 1; i <= 120; i++) game.frame(t + i * FRAME_MS);
    const ticks = game.sim.tick - start;
    expect(ticks).toBeGreaterThanOrEqual(2 * SIM_HZ - 1);
    expect(ticks).toBeLessThanOrEqual(2 * SIM_HZ);
  });

  it('is independent of the display rate', async () => {
    const { game, t } = await startPlaying();
    const start = game.sim.tick;
    for (let i = 1; i <= 30; i++) game.frame(t + i * (1000 / 30));
    // One tick of slack: the last step can sit a rounding error below the threshold.
    expect(game.sim.tick - start).toBeGreaterThanOrEqual(SIM_HZ - 1);
    expect(game.sim.tick - start).toBeLessThanOrEqual(SIM_HZ);
  });

  it('clamps a 5 second gap to 100 ms of simulation', async () => {
    const { game, t } = await startPlaying();
    const start = game.sim.tick;
    game.frame(t + 5000);
    expect(game.sim.tick - start).toBeLessThanOrEqual(6);
  });

  it('does not jump after the clock is reset', async () => {
    const { game, t } = await startPlaying();
    const start = game.sim.tick;
    game.resetClock();
    game.frame(t + 60_000);
    expect(game.sim.tick).toBe(start);
  });

  it('reports an interpolation alpha in [0, 1)', async () => {
    const { game, view, t } = await startPlaying();
    for (let i = 1; i <= 50; i++) {
      game.frame(t + i * 7.3);
      expect(view.last().alpha).toBeGreaterThanOrEqual(0);
      expect(view.last().alpha).toBeLessThan(1);
    }
  });

  it('applies a drag once, in the first step of the frame', async () => {
    const { game, input, t } = await startPlaying();
    input.dragGu = 4;
    game.frame(t + 50);
    expect(game.sim.shooter.targetX).toBeCloseTo(COLS / 2 + 4, 6);
  });

  it('keeps a drag that arrives before a full tick has accumulated', async () => {
    const { game, input, t } = await startPlaying();
    input.dragGu = 2;
    game.frame(t + 1);
    expect(game.sim.shooter.targetX).toBe(COLS / 2);
    game.frame(t + 40);
    expect(game.sim.shooter.targetX).toBeCloseTo(COLS / 2 + 2, 6);
  });

  it('ignores drags made on the menu', async () => {
    const input = new FakeInput();
    const game = new Game(new FakeView(), input, source({ '1': QUIET_MAP }));
    game.ready();
    input.dragGu = 12;
    input.tap = true;
    for (let i = 0; i < 6; i++) {
      game.frame(i * FRAME_MS);
      await settle();
    }
    expect(game.state).toBe('PLAYING');
    expect(game.sim.shooter.targetX).toBe(COLS / 2);
  });
});

describe('pause', () => {
  it('stops the simulation and discards input made while paused', async () => {
    const { game, input, t } = await startPlaying();
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

  it('pause() and onBack() only act while playing', async () => {
    const game = new Game(new FakeView(), new FakeInput(), source({}));
    game.pause();
    expect(game.state).toBe('BOOT');
    const playing = await startPlaying();
    playing.game.onBack();
    expect(playing.game.state).toBe('PAUSED');
  });
});
