import type { GameState, SimInput, SimState } from '../types';
import { MAX_FRAME_DELTA_MS, SIM_DT } from './constants';
import type { InputSource } from './Input';
import { createSim, stepSim } from './Sim';

/** Everything the renderer needs to draw one frame. */
export interface RenderFrame {
  state: GameState;
  sim: SimState;
  /** 0..1 position between the previous and the current sim tick. */
  alpha: number;
  /** Wall-clock time of this frame, for cosmetic animation only. */
  timeMs: number;
}

/** The loop talks to rendering through this interface, so it stays Pixi-free. */
export interface GameView {
  /** Size of one grid unit in CSS pixels at the current screen size. */
  cellPx(): number;
  render(frame: RenderFrame): void;
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

/**
 * Top-level loop and state machine. `frame()` is called once per animation
 * frame; the simulation advances in fixed 60 Hz steps and the renderer
 * interpolates between the last two steps.
 */
export class Game {
  state: GameState = 'BOOT';
  sim: SimState = createSim();
  private accumulatorMs = 0;
  private lastMs = -1;
  private readonly stepInput: SimInput = { targetDelta: 0, keyDir: 0 };

  constructor(
    private readonly view: GameView,
    private readonly input: InputSource,
  ) {}

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
        if (this.input.takeTap()) this.transition('LEVEL_SELECT');
        break;
      case 'LEVEL_SELECT':
        // The level select screen arrives in M8; until then go straight in.
        this.transition('LOADING');
        break;
      case 'LOADING':
        this.sim = createSim();
        this.accumulatorMs = 0;
        this.input.consumeTargetDelta(this.view.cellPx());
        this.transition('PLAYING');
        break;
      case 'PLAYING':
        this.input.takeTap();
        if (this.input.takePause()) {
          this.transition('PAUSED');
          break;
        }
        this.advance(delta);
        break;
      case 'PAUSED':
        // Input made while paused must not move the map on resume.
        this.input.consumeTargetDelta(this.view.cellPx());
        if (this.input.takeTap() || this.input.takePause()) this.transition('PLAYING');
        break;
      case 'WIN':
      case 'LOSE':
        this.input.takePause();
        if (this.input.takeTap()) this.transition('LEVEL_SELECT');
        break;
    }

    this.view.render({
      state: this.state,
      sim: this.sim,
      alpha: this.state === 'PLAYING' ? this.accumulatorMs / SIM_DT_MS : 1,
      timeMs: nowMs,
    });
  }

  private advance(deltaMs: number): void {
    this.accumulatorMs += deltaMs;
    if (this.accumulatorMs < SIM_DT_MS) return;

    // Drag distance is applied in the first step of the frame; the keyboard
    // direction holds for every step.
    this.stepInput.targetDelta = this.input.consumeTargetDelta(this.view.cellPx());
    this.stepInput.keyDir = this.input.keyDir();
    while (this.accumulatorMs >= SIM_DT_MS) {
      stepSim(this.sim, this.stepInput);
      this.stepInput.targetDelta = 0;
      this.accumulatorMs -= SIM_DT_MS;
    }
  }
}
