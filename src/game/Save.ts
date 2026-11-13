// What the game remembers between visits (SPEC section 4): how far the player
// has got and the two volume settings. Kept in localStorage under one key.
// Where storage is not available (some browsers refuse it for file://), the
// game still runs; it just forgets when the page is closed.

import { BUILT_IN_LEVELS, MUSIC_VOLUME_RATIO, SFX_VOLUME, STORAGE_KEY } from './constants';
import type { Progress } from './Game';

interface Saved {
  /** Highest built-in map that may be played, 1 to BUILT_IN_LEVELS. */
  unlocked: number;
  /** Set once the last map has been won. */
  finished: boolean;
  /** Volumes, 0 to 1. */
  music: number;
  sfx: number;
}

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const DEFAULTS: Readonly<Saved> = {
  unlocked: 1,
  finished: false,
  music: SFX_VOLUME * MUSIC_VOLUME_RATIO,
  sfx: SFX_VOLUME,
};

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const unit = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export class Save implements Progress {
  private data: Saved = { ...DEFAULTS };

  constructor(private readonly store: KeyValueStore | null = browserStore()) {
    try {
      const raw = this.store?.getItem(STORAGE_KEY);
      if (!raw) return;
      // Anything missing or out of range falls back to its default, so an old or damaged save is harmless.
      const saved = JSON.parse(raw) as Partial<Saved>;
      const unlocked = typeof saved.unlocked === 'number' ? Math.floor(saved.unlocked) : 1;
      this.data = {
        unlocked: Math.min(BUILT_IN_LEVELS, Math.max(1, unlocked || 1)),
        finished: saved.finished === true,
        music: unit(saved.music, DEFAULTS.music),
        sfx: unit(saved.sfx, DEFAULTS.sfx),
      };
    } catch {
      this.data = { ...DEFAULTS };
    }
  }

  private write(): void {
    try {
      this.store?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or refused: play on without saving.
    }
  }

  unlocked(): number {
    return this.data.unlocked;
  }

  get finished(): boolean {
    return this.data.finished;
  }

  /** Winning map `level` opens the next one. */
  complete(level: number): void {
    if (level >= BUILT_IN_LEVELS) this.data.finished = true;
    this.data.unlocked = Math.max(this.data.unlocked, Math.min(BUILT_IN_LEVELS, level + 1));
    this.write();
  }

  /** Back to map 1. The volume settings stay. */
  clearProgress(): void {
    this.data.unlocked = 1;
    this.data.finished = false;
    this.write();
  }

  get music(): number {
    return this.data.music;
  }

  get sfx(): number {
    return this.data.sfx;
  }

  setMusic(volume: number): void {
    this.data.music = unit(volume, this.data.music);
    this.write();
  }

  setSfx(volume: number): void {
    this.data.sfx = unit(volume, this.data.sfx);
    this.write();
  }
}
