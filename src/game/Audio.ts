// Sound effects, synthesised with the Web Audio API (decision A30).
//
// Every sound is built from oscillators and filtered noise at the moment it
// plays. There are no audio files, so nothing has to load and the game still
// opens from file://. Browsers only allow sound after a touch or key press:
// call unlock() from the first one.

import { SFX_VOLUME } from './constants';

type Wave = OscillatorType;

interface Tone {
  wave: Wave;
  /** Start and end frequency in Hz; the pitch glides between them. */
  from: number;
  to: number;
  /** Seconds. */
  length: number;
  gain: number;
  /** Seconds after the sound starts. */
  delay?: number;
  /** Seconds of fade-in. */
  attack?: number;
}

interface Noise {
  length: number;
  gain: number;
  filter: BiquadFilterType;
  /** Filter frequency at the start and at the end. */
  from: number;
  to: number;
  q?: number;
  delay?: number;
}

/** Shortest time between two plays of the same sound, in seconds. Keeps a busy swarm from clipping. */
const MIN_GAP: Record<string, number> = {
  shot: 0.045,
  hit: 0.035,
  kill: 0.03,
  gateHit: 0.05,
  cat: 0.06,
  rocket: 0.08,
  blast: 0.06,
  punch: 0.1,
};

const NOTE = (semitonesFromA4: number): number => 440 * 2 ** (semitonesFromA4 / 12);

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly lastPlayed = new Map<string, number>();
  private muted = false;
  private volume = SFX_VOLUME;

  /** Starts the audio engine. Safe to call on every input event. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    // A compressor glues many overlapping sounds together and prevents clipping.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(compressor).connect(ctx.destination);

    // One second of white noise, reused by every noise burst.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.noiseBuffer = buffer;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /** Sets the level of the sound effects, 0 to 1. */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.ctx && this.master && !this.muted) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /** Stops sound while the game is hidden. */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  private ready(name: string): boolean {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return false;
    const gap = MIN_GAP[name];
    if (gap !== undefined) {
      const now = this.ctx.currentTime;
      if (now - (this.lastPlayed.get(name) ?? -1) < gap) return false;
      this.lastPlayed.set(name, now);
    }
    return true;
  }

  private tone(t: Tone, detune = 1): void {
    const ctx = this.ctx as AudioContext;
    const start = ctx.currentTime + (t.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = t.wave;
    osc.frequency.setValueAtTime(t.from * detune, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, t.to * detune), start + t.length);
    const attack = t.attack ?? 0.004;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(t.gain, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t.length);
    osc.connect(gain).connect(this.master as GainNode);
    osc.start(start);
    osc.stop(start + t.length + 0.02);
  }

  private noise(n: Noise): void {
    const ctx = this.ctx as AudioContext;
    const start = ctx.currentTime + (n.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = n.filter;
    filter.Q.value = n.q ?? 0.8;
    filter.frequency.setValueAtTime(n.from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, n.to), start + n.length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(n.gain, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.length);
    source.connect(filter).connect(gain).connect(this.master as GainNode);
    source.start(start, Math.random() * 0.5);
    source.stop(start + n.length + 0.02);
  }

  /** A little random pitch, so repeated sounds do not sound mechanical. */
  private vary(amount: number): number {
    return 1 + (Math.random() * 2 - 1) * amount;
  }

  /** A cat fires. `volume` lets a large swarm stay soft. */
  shot(volume = 1): void {
    if (!this.ready('shot')) return;
    const v = this.vary(0.08);
    this.tone({ wave: 'triangle', from: 1250, to: 380, length: 0.07, gain: 0.11 * volume }, v);
    this.noise({ length: 0.03, gain: 0.05 * volume, filter: 'highpass', from: 5000, to: 3000 });
  }

  /** A bullet hits something that survives. */
  hit(): void {
    if (!this.ready('hit')) return;
    this.noise({ length: 0.04, gain: 0.1, filter: 'bandpass', from: 3200, to: 1800, q: 2 });
    this.tone({ wave: 'square', from: 320, to: 180, length: 0.035, gain: 0.04 }, this.vary(0.1));
  }

  /** A rat dies: a short squeak and a puff. */
  kill(): void {
    if (!this.ready('kill')) return;
    const v = this.vary(0.18);
    this.tone({ wave: 'sine', from: 780, to: 1500, length: 0.05, gain: 0.1 }, v);
    this.tone({ wave: 'sine', from: 1500, to: 620, length: 0.07, gain: 0.07, delay: 0.045 }, v);
    this.noise({ length: 0.09, gain: 0.07, filter: 'lowpass', from: 2200, to: 500 });
  }

  /** A bullet thuds into a gate. */
  gateHit(): void {
    if (!this.ready('gateHit')) return;
    this.tone({ wave: 'sine', from: 210, to: 110, length: 0.08, gain: 0.2 }, this.vary(0.06));
    this.noise({ length: 0.03, gain: 0.08, filter: 'bandpass', from: 1400, to: 900, q: 1.5 });
  }

  /** A gate shatters and the swarm grows: a crash, then a rising chime. Bigger rewards ring higher and longer. */
  gateBreak(clones: number): void {
    if (!this.ready('gateBreak')) return;
    this.noise({ length: 0.28, gain: 0.22, filter: 'highpass', from: 2600, to: 6500 });
    this.tone({ wave: 'sine', from: 150, to: 55, length: 0.22, gain: 0.3 });
    const steps = clones >= 50 ? [3, 7, 10, 15, 19, 22] : clones >= 10 ? [3, 7, 10, 15] : [3, 7, 10];
    steps.forEach((semitone, i) => {
      const f = NOTE(semitone);
      this.tone({ wave: 'triangle', from: f, to: f, length: 0.22, gain: 0.16, delay: 0.05 + i * 0.06 });
      this.tone({ wave: 'sine', from: f * 2, to: f * 2, length: 0.3, gain: 0.07, delay: 0.05 + i * 0.06 });
    });
  }

  /** A falling box is caught. */
  pickup(clones: number): void {
    if (!this.ready('pickup')) return;
    const steps = clones >= 10 ? [0, 4, 7, 12] : [0, 7, 12];
    steps.forEach((semitone, i) => {
      const f = NOTE(semitone + 3);
      this.tone({ wave: 'triangle', from: f, to: f, length: 0.18, gain: 0.15, delay: i * 0.05 });
    });
  }

  /** A cat is lost: a short falling cry. */
  catLost(): void {
    if (!this.ready('cat')) return;
    const v = this.vary(0.1);
    this.tone({ wave: 'sawtooth', from: 880, to: 300, length: 0.16, gain: 0.07, attack: 0.02 }, v);
    this.tone({ wave: 'sine', from: 880, to: 300, length: 0.16, gain: 0.1, attack: 0.02 }, v);
  }

  /** A rat crosses the goal line. */
  breach(): void {
    if (!this.ready('breach')) return;
    this.tone({ wave: 'sawtooth', from: 240, to: 50, length: 0.7, gain: 0.26 });
    this.noise({ length: 0.6, gain: 0.3, filter: 'lowpass', from: 3000, to: 120 });
  }

  win(): void {
    if (!this.ready('win')) return;
    [0, 4, 7, 12, 16].forEach((semitone, i) => {
      const f = NOTE(semitone + 3);
      this.tone({ wave: 'triangle', from: f, to: f, length: 0.3, gain: 0.2, delay: i * 0.11 });
      this.tone({ wave: 'square', from: f / 2, to: f / 2, length: 0.3, gain: 0.05, delay: i * 0.11 });
    });
    for (const semitone of [3, 7, 10, 15]) {
      const f = NOTE(semitone + 12);
      this.tone({ wave: 'triangle', from: f, to: f, length: 0.9, gain: 0.12, delay: 0.6, attack: 0.02 });
    }
  }

  lose(): void {
    if (!this.ready('lose')) return;
    [7, 3, 0, -5].forEach((semitone, i) => {
      const f = NOTE(semitone - 9);
      this.tone({ wave: 'sawtooth', from: f, to: f * 0.97, length: 0.34, gain: 0.13, delay: 0.25 + i * 0.2, attack: 0.02 });
    });
  }

  /** A big rat's punch lands: a deep thud with a crack on top. Harder punches hit lower. */
  punch(kills: number): void {
    if (!this.ready('punch')) return;
    const weight = kills >= 30 ? 0.75 : 1;
    this.tone({ wave: 'sine', from: 170 * weight, to: 38, length: 0.34, gain: 0.5 });
    this.tone({ wave: 'square', from: 90 * weight, to: 40, length: 0.16, gain: 0.12 });
    this.noise({ length: 0.2, gain: 0.3, filter: 'lowpass', from: 2400, to: 160 });
    this.noise({ length: 0.05, gain: 0.16, filter: 'highpass', from: 3000, to: 5000 });
  }

  /** A weapon is picked up: a quick rising arpeggio with a bright top. */
  weapon(): void {
    if (!this.ready('weapon')) return;
    [0, 5, 7, 12, 17].forEach((semitone, i) => {
      const f = NOTE(semitone);
      this.tone({ wave: 'square', from: f, to: f, length: 0.12, gain: 0.07, delay: i * 0.045 });
      this.tone({ wave: 'triangle', from: f * 2, to: f * 2, length: 0.16, gain: 0.1, delay: i * 0.045 });
    });
  }

  /** A rocket leaves its tube. */
  rocket(): void {
    if (!this.ready('rocket')) return;
    this.noise({ length: 0.26, gain: 0.14, filter: 'bandpass', from: 500, to: 2600, q: 0.9 });
    this.tone({ wave: 'sawtooth', from: 160, to: 420, length: 0.2, gain: 0.05 }, this.vary(0.1));
  }

  /** A rocket explodes. The tank's rockets are bigger. */
  explosion(big: boolean): void {
    if (!this.ready('blast')) return;
    const scale = big ? 1.5 : 1;
    this.noise({ length: 0.32 * scale, gain: 0.3 * scale, filter: 'lowpass', from: 3400, to: 110 });
    this.tone({ wave: 'sine', from: 130 / scale, to: 36, length: 0.3 * scale, gain: 0.36 }, this.vary(0.08));
  }

  /** The laser charges: a rising whine, as long as the charge itself. */
  laserCharge(seconds: number): void {
    if (!this.ready('laserCharge')) return;
    this.tone({ wave: 'sawtooth', from: 110, to: 1500, length: seconds, gain: 0.06, attack: seconds * 0.6 });
    this.tone({ wave: 'sine', from: 220, to: 3000, length: seconds, gain: 0.07, attack: seconds * 0.6 });
  }

  /** The laser fires. */
  laserFire(seconds: number): void {
    if (!this.ready('laserFire')) return;
    this.tone({ wave: 'sawtooth', from: 1900, to: 240, length: seconds, gain: 0.2 });
    this.tone({ wave: 'square', from: 950, to: 120, length: seconds, gain: 0.08 });
    this.noise({ length: seconds, gain: 0.16, filter: 'bandpass', from: 5000, to: 1200, q: 0.7 });
  }

  /** The tank rolls out: an engine growl and a fanfare. */
  tankStart(): void {
    if (!this.ready('tank')) return;
    this.tone({ wave: 'sawtooth', from: 55, to: 110, length: 0.7, gain: 0.2, attack: 0.05 });
    this.noise({ length: 0.5, gain: 0.14, filter: 'lowpass', from: 300, to: 900 });
    [0, 4, 7, 12].forEach((semitone, i) => {
      const f = NOTE(semitone - 2);
      this.tone({ wave: 'square', from: f, to: f, length: 0.16, gain: 0.08, delay: 0.1 + i * 0.07 });
    });
  }

  /** The tank is used up. */
  tankEnd(): void {
    if (!this.ready('tank')) return;
    this.tone({ wave: 'sawtooth', from: 120, to: 45, length: 0.4, gain: 0.16 });
    this.noise({ length: 0.3, gain: 0.12, filter: 'lowpass', from: 1500, to: 200 });
  }

  /** Menu and banner taps. */
  tap(): void {
    if (!this.ready('tap')) return;
    this.tone({ wave: 'sine', from: 660, to: 990, length: 0.07, gain: 0.14 });
  }
}
