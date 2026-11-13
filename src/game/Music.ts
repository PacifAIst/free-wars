// Background music (decision A33): one looping MP3 per level, played well under
// the sound effects. The tracks are the owner's files in the `music` folder,
// `0.mp3` to `11.mp3`, served beside the game. A missing file is not an error:
// the level simply has no music.

import { MUSIC_TRACKS, MUSIC_VOLUME_RATIO, SFX_VOLUME } from './constants';

/**
 * The track for a map. Track 0 belongs to the splash screen and the map grid. The 44 built-in
 * maps go round tracks 1 to 11: map 1 plays track 1, map 11 track 11, map 12
 * track 1 again. Any other map (the dev map, a custom map) plays track 1.
 */
export function musicTrackFor(mapId: string): number {
  const n = /^\d+$/.test(mapId) ? Number(mapId) : 0;
  return n >= 1 ? ((n - 1) % MUSIC_TRACKS) + 1 : 1;
}

/** The track of the splash screen and the map grid. */
export const MENU_TRACK = 0;

export class Music {
  private audio: HTMLAudioElement | null = null;
  private track = -1;
  /** True when a new track has been chosen and is not loaded yet. */
  private fresh = false;
  private wanted = false;
  private unlocked = false;
  private muted = false;
  private hidden = false;
  private volume = SFX_VOLUME * MUSIC_VOLUME_RATIO;

  constructor(private readonly folder = './music/') {}

  /** Browsers only allow sound after a touch or a key press: call this from each one. */
  unlock(): void {
    this.unlocked = true;
    this.sync();
  }

  /** Sets the level of the music, 0 to 1. */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.sync();
  }

  /** Plays `track` in a loop. If it is already playing it simply carries on. */
  play(track: number): void {
    if (track === this.track && this.wanted) return;
    this.start(track);
  }

  /** Plays `track` from its beginning, in a loop. */
  start(track: number): void {
    this.track = track;
    this.fresh = true;
    this.wanted = true;
    this.sync();
  }

  pause(): void {
    this.wanted = false;
    this.sync();
  }

  /** Carries on from where `pause` stopped. */
  resume(): void {
    if (this.track < 0) return;
    this.wanted = true;
    this.sync();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.sync();
  }

  /** Stops the music while the game is hidden. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.sync();
  }

  private sync(): void {
    if (!this.unlocked || this.track < 0) return;
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.loop = true;
      this.audio.preload = 'auto';
    }
    const audio = this.audio;
    audio.volume = this.volume;
    audio.muted = this.muted;
    const loaded = this.fresh;
    if (loaded) {
      this.fresh = false;
      audio.src = `${this.folder}${this.track}.mp3`;
    }
    if (this.wanted && !this.hidden) {
      // Rejected when the file is missing or the browser still blocks sound; both are fine.
      if (loaded || audio.paused) audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }
}
