import type { GameState, MapData, SimInput, SimState } from '../types';
import { MAX_FRAME_DELTA_MS, SIM_DT } from './constants';
import type { InputSource } from './Input';
import type { MapSource } from './maps';
import { createScratch, createSim, type SimScratch, stepSim } from './Sim';
import { EMPTY_MAP } from './World';

/** Everything the renderer needs to draw one frame. */
export interface RenderFrame {
  state: GameState;
  sim: SimState;
  /** The map `sim` is running. Needed to preview rows that have not spawned yet. */
  map: MapData;
  /** 0..1 position between the previous and the current sim tick. */
  alpha: number;
  /** Wall-clock time of this frame, for cosmetic animation only. */
  timeMs: number;
  /** A message for the player, e.g. a map that failed to load. Empty when there is none. */
  notice: string;
}

/** The loop talks to rendering through this interface, so it stays Pixi-free. */
export interface GameView {
  /** Size of one grid unit in CSS pixels at the current screen size. */
  cellPx(): number;
  render(frame: RenderFrame): void;
}

export interface GameOptions {
  /** Map to play first. */
  levelId?: string;
  /** Source of run seeds. Fixed in tests; random in the real game. */
  nextSeed?: () => number;
}

/** Legal moves of the state machine (SPEC section 4). */
export const TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  BOOT: ['MENU'],
  MENU: ['LEVEL_SELECT'],
  LEVEL_SELECT: ['LOADING', 'MENU'],
  LOADING: ['PLAYING', 'LEVEL_SELECT'],
  PLAYING: ['PAUSED', 'WIN', 'LOSE'],
  PAUSED: ['PLAYING', 'LEVEL_SELECT'],
  WIN: ['LEVEL_SELECT'],
  LOSE: ['LEVEL_SELECT'],
};

const SIM_DT_MS = SIM_DT * 1000;
const DEFAULT_LEVEL = '1';

/**
 * Top-level loop and state machine. `frame()` is called once per animation
 * frame; the simulation advances in fixed 60 Hz steps and the renderer
 * interpolates between the last two steps.
 */
export class Game {
  state: GameState = 'BOOT';
  levelId: string;
  map: MapData = EMPTY_MAP;
  sim: SimState = createSim(EMPTY_MAP, 0);
  notice = '';

  private readonly scratch: SimScratch = createScratch();
  private readonly nextSeed: () => number;
  private accumulatorMs = 0;
  private lastMs = -1;
  private readonly stepInput: SimInput = { targetDelta: 0, keyDir: 0 };
  private loadStarted = false;
  private loadedMap: MapData | null = null;
  private loadError: string | null = null;
  /** Reused every frame, so the loop itself allocates nothing. */
  private readonly frameOut: RenderFrame = {
    state: 'BOOT',
    sim: this.sim,
    map: this.map,
    alpha: 1,
    timeMs: 0,
    notice: '',
  };

  constructor(
    private readonly view: GameView,
    private readonly input: InputSource,
    private readonly maps: MapSource,
    options: GameOptions = {},
  ) {
    this.levelId = options.levelId ?? DEFAULT_LEVEL;
    this.nextSeed = options.nextSeed ?? (() => (Math.random() * 0x100000000) >>> 0);
  }

  /** Moves to `next`, or throws if the state machine does not allow it. */
  transition(next: GameState): void {
    if (!TRANSITIONS[this.state].includes(next)) {
      throw new Error(`Illegal state transition ${this.state} -> ${next}`);
    }
    this.state = next;
  }

  /** Called when assets are loaded: BOOT -> MENU. */
  ready(): void {
    this.transition('MENU');
  }

  /** Pauses play, e.g. when the tab is hidden or the Android back button is pressed. */
  pause(): void {
    if (this.state === 'PLAYING') this.transition('PAUSED');
  }

  /** Single hook for the platform back action (PLAN section 6). */
  onBack(): void {
    this.pause();
  }

  /** Forgets the last frame time so the next frame does not see a long gap. */
  resetClock(): void {
    this.lastMs = -1;
  }

  frame(nowMs: number): void {
    // Clamp the delta so a tab switch or a slow frame never causes a jump.
    const delta = this.lastMs < 0 ? 0 : Math.min(Math.max(nowMs - this.lastMs, 0), MAX_FRAME_DELTA_MS);
    this.lastMs = nowMs;

    switch (this.state) {
      case 'BOOT':
        break;
      case 'MENU':
        this.input.takePause();
        if (this.input.takeTap()) {
          this.notice = '';
          this.transition('LEVEL_SELECT');
        }
        break;
      case 'LEVEL_SELECT':
        // The level select screen arrives in M8; until then go straight in.
        this.loadStarted = false;
        this.transition('LOADING');
        break;
      case 'LOADING':
        this.updateLoading();
        break;
      case 'PLAYING':
        this.input.takeTap();
        if (this.input.takePause()) {
          this.transition('PAUSED');
          break;
        }
        this.advance(delta);
        if (this.sim.phase === 'won') this.transition('WIN');
        else if (this.sim.phase === 'lost') this.transition('LOSE');
        break;
      case 'PAUSED':
        // Input made while paused must not move the map on resume.
        this.input.consumeTargetDelta(this.view.cellPx());
        if (this.input.takeTap() || this.input.takePause()) this.transition('PLAYING');
        break;
      case 'WIN':
      case 'LOSE':
        this.input.takePause();
        if (this.input.takeTap()) {
          if (this.state === 'WIN') this.selectNextLevel();
          this.transition('LEVEL_SELECT');
        }
        break;
    }

    const out = this.frameOut;
    out.state = this.state;
    out.sim = this.sim;
    out.map = this.map;
    out.alpha = this.state === 'PLAYING' ? this.accumulatorMs / SIM_DT_MS : 1;
    out.timeMs = nowMs;
    out.notice = this.notice;
    this.view.render(out);
  }

  private updateLoading(): void {
    if (!this.loadStarted) {
      this.loadStarted = true;
      this.loadedMap = null;
      this.loadError = null;
      const id = this.levelId;
      this.maps.load(id).then(
        (map) => {
          this.loadedMap = map;
        },
        (error: unknown) => {
          console.error(error);
          this.loadError = `Could not load level ${id}`;
        },
      );
      return;
    }
    if (this.loadError !== null) {
      this.notice = this.loadError;
      this.transition('LEVEL_SELECT');
      this.transition('MENU');
      return;
    }
    if (this.loadedMap === null) return;

    this.map = this.loadedMap;
    this.sim = createSim(this.map, this.nextSeed());
    this.loadedMap = null;
    this.accumulatorMs = 0;
    // Drop input made on the menu so the map does not start off-centre.
    this.input.consumeTargetDelta(this.view.cellPx());
    this.input.takeTap();
    this.transition('PLAYING');
  }

  /** After a win, moves on to the next numbered level if there is one. */
  private selectNextLevel(): void {
    if (!/^\d+$/.test(this.levelId)) return;
    const next = String(Number(this.levelId) + 1);
    if (this.maps.has(next)) this.levelId = next;
  }

  private advance(deltaMs: number): void {
    this.accumulatorMs += deltaMs;
    if (this.accumulatorMs < SIM_DT_MS) return;

    // Drag distance is applied in the first step of the frame; the keyboard
    // direction holds for every step.
    this.stepInput.targetDelta = this.input.consumeTargetDelta(this.view.cellPx());
    this.stepInput.keyDir = this.input.keyDir();
    while (this.accumulatorMs >= SIM_DT_MS) {
      stepSim(this.sim, this.map, this.stepInput, this.scratch);
      this.stepInput.targetDelta = 0;
      this.accumulatorMs -= SIM_DT_MS;
    }
  }
}
