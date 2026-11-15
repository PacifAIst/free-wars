import type { GameState, MapData, SimInput, SimState } from '../types';
import { BUILT_IN_LEVELS, MAX_FRAME_DELTA_MS, SIM_DT } from './constants';
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

/** How far the player has got through the built-in maps. The real one saves to the browser. */
export interface Progress {
  /** Highest built-in map that may be played. */
  unlocked(): number;
  /** Map `level` has been won: the next one opens. */
  complete(level: number): void;
}

/** Progress that lasts as long as the page: for tests, and for a game with no storage. */
export function memoryProgress(start = 1): Progress {
  let unlocked = start;
  return {
    unlocked: () => unlocked,
    complete: (level) => {
      unlocked = Math.max(unlocked, Math.min(BUILT_IN_LEVELS, level + 1));
    },
  };
}

export interface GameOptions {
  /** Skip the map grid and play this map: the dev map, or a map under test. */
  levelId?: string;
  progress?: Progress;
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
  PAUSED: ['PLAYING', 'MENU'],
  WIN: ['LEVEL_SELECT', 'LOADING', 'MENU'],
  LOSE: ['LOADING', 'MENU'],
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
  /** True while something else has the screen on the menu, such as the map editor: PLAY waits. */
  menuBusy = false;

  private readonly scratch: SimScratch = createScratch();
  private readonly nextSeed: () => number;
  private readonly progress: Progress;
  /** Set when the game was started on one given map: the map grid is skipped. */
  private readonly directLevel: string | null;
  /** A map handed to the game directly, from the map editor or a link: it is not in the map source. */
  private custom: MapData | null = null;
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
    this.directLevel = options.levelId ?? null;
    this.progress = options.progress ?? memoryProgress();
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

  // --- What the screens ask for (decision A34). Each does nothing in the wrong state. ---

  /** The PLAY button: on to the map grid, or straight into the map the game was started on. */
  play(): void {
    if (this.state !== 'MENU' || this.menuBusy) return;
    this.notice = '';
    this.transition('LEVEL_SELECT');
    if (this.directLevel !== null) this.load(this.directLevel);
  }

  /** True when `id` may be played: a built-in map up to the one the player has reached, or any other map. */
  isUnlocked(id: string): boolean {
    if (!/^[1-9]\d*$/.test(id)) return true;
    const n = Number(id);
    return n > BUILT_IN_LEVELS || n <= this.progress.unlocked();
  }

  /** A map is picked on the grid. A locked map is refused. */
  chooseLevel(id: string): void {
    if (this.state !== 'LEVEL_SELECT' || !this.isUnlocked(id)) return;
    this.load(id);
  }

  /** Plays a map that is not one of the built-in ones: from the map editor, or from a link to a .fw file. */
  playCustom(map: MapData): void {
    if (this.state !== 'MENU') return;
    this.notice = '';
    this.custom = map;
    this.transition('LEVEL_SELECT');
    this.load(map.id);
  }

  private load(id: string): void {
    if (this.custom !== null && this.custom.id !== id) this.custom = null;
    this.levelId = id;
    this.loadStarted = false;
    this.transition('LOADING');
  }

  resume(): void {
    if (this.state === 'PAUSED') this.transition('PLAYING');
  }

  /** After a defeat: the same map again. */
  retry(): void {
    if (this.state !== 'LOSE') return;
    this.loadStarted = false;
    this.transition('LOADING');
  }

  /** The built-in map after the one just played, or null when there is none to go on to. */
  nextLevelId(): string | null {
    if (this.directLevel !== null || this.custom !== null || !/^[1-9]\d*$/.test(this.levelId)) return null;
    const next = String(Number(this.levelId) + 1);
    return Number(next) <= BUILT_IN_LEVELS && this.maps.has(next) ? next : null;
  }

  /** After a victory: straight into the next map (A38). */
  nextLevel(): void {
    if (this.state !== 'WIN') return;
    const next = this.nextLevelId();
    if (next === null) this.continueAfterWin();
    else this.load(next);
  }

  /** After a victory: back to the map grid, where the next map is now open. */
  continueAfterWin(): void {
    if (this.state !== 'WIN') return;
    if (this.directLevel !== null || this.custom !== null) this.transition('MENU');
    else this.transition('LEVEL_SELECT');
  }

  /** Back to the splash screen from the map grid, a pause or the end of a level. */
  toMenu(): void {
    if (TRANSITIONS[this.state].includes('MENU')) this.transition('MENU');
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
        // The screens drive the menus with their buttons; Enter or Space stands for the main one.
        this.input.takePause();
        if (this.input.takeTap()) this.play();
        break;
      case 'LEVEL_SELECT':
        this.input.takePause();
        this.input.takeTap();
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
        if (this.sim.phase === 'won') {
          if (/^[1-9]\d*$/.test(this.levelId)) this.progress.complete(Number(this.levelId));
          this.transition('WIN');
        }
        else if (this.sim.phase === 'lost') this.transition('LOSE');
        break;
      case 'PAUSED':
        // Input made while paused must not move the map on resume.
        this.input.consumeTargetDelta(this.view.cellPx());
        if (this.input.takeTap() || this.input.takePause()) this.resume();
        break;
      case 'WIN':
      case 'LOSE':
        this.input.takePause();
        if (this.input.takeTap()) {
          if (this.state === 'WIN') this.nextLevel();
          else this.retry();
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
      if (this.custom !== null) {
        this.loadedMap = this.custom;
        return;
      }
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
      // Drop the tap that asked for the map, so it does not ask again.
      this.input.takeTap();
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
