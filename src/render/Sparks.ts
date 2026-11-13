import {
  AdditiveBlending,
  type Camera,
  CanvasTexture,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { Batch } from './Batch';

/** Most particles alive at once. Extra ones are simply not started. */
const MAX_PARTICLES = 2200;
/** Most one-frame flashes (muzzle flashes and the like) per frame. */
const MAX_FLASHES = 160;
const FIELDS = 15;

/** A soft round dot: bright in the middle, fading to nothing at the edge. */
function dotTexture(hard: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(hard, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Cosmetic particles: sparks, puffs of dust, flashes. They live only in the
 * renderer and never touch the simulation. Each is a small picture that always
 * faces the camera. Two kinds are drawn:
 *
 *  - glow: added on top of the scene, for light (sparks, flashes, shards);
 *  - puff: opaque soft discs, for dust and smoke.
 *
 * All storage is allocated once.
 */
export class Sparks {
  readonly glow: Batch;
  readonly puff: Batch;
  /** x y z, vx vy vz, age, life, size0, size1, r g b, kind (0 glow, 1 puff), gravity. */
  private readonly data = new Float32Array(MAX_PARTICLES * FIELDS);
  private count = 0;
  private readonly flashes = new Float32Array(MAX_FLASHES * 7);
  private flashCount = 0;
  /** Rotation from world space into the space of the camera-facing meshes. */
  private readonly toLocal = new Matrix4();

  constructor() {
    const quad = new PlaneGeometry(1, 1);
    this.glow = new Batch(
      quad,
      new MeshBasicMaterial({ map: dotTexture(0.25), transparent: true, blending: AdditiveBlending, depthWrite: false }),
      MAX_PARTICLES + MAX_FLASHES,
      true,
    );
    this.puff = new Batch(
      quad,
      new MeshBasicMaterial({ map: dotTexture(0.6), transparent: true, depthWrite: false }),
      MAX_PARTICLES,
      true,
    );
    this.puff.mesh.renderOrder = 5;
    this.glow.mesh.renderOrder = 6;
  }

  /** Turns the particles to face the camera. Call whenever the camera's direction changes. */
  face(camera: Camera): void {
    this.glow.mesh.quaternion.copy(camera.quaternion);
    this.puff.mesh.quaternion.copy(camera.quaternion);
    this.toLocal.makeRotationFromQuaternion(camera.quaternion).transpose();
  }

  /** Starts one particle. `kind` is 0 for glow, 1 for puff. */
  emit(
    kind: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size0: number,
    size1: number,
    r: number,
    g: number,
    b: number,
    gravity = 0,
  ): void {
    if (this.count >= MAX_PARTICLES) return;
    const o = this.count++ * FIELDS;
    const d = this.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = vx;
    d[o + 4] = vy;
    d[o + 5] = vz;
    d[o + 6] = 0;
    d[o + 7] = life;
    d[o + 8] = size0;
    d[o + 9] = size1;
    d[o + 10] = r;
    d[o + 11] = g;
    d[o + 12] = b;
    d[o + 13] = kind;
    d[o + 14] = gravity;
  }

  /** A burst of `n` particles flying out from a point in every direction along the ground, and up. */
  burst(
    kind: number,
    n: number,
    x: number,
    y: number,
    z: number,
    speed: number,
    lift: number,
    life: number,
    size0: number,
    size1: number,
    r: number,
    g: number,
    b: number,
    gravity = 0,
  ): void {
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.emit(
        kind,
        x,
        y,
        z,
        Math.cos(angle) * s,
        lift * (0.4 + Math.random() * 0.6),
        Math.sin(angle) * s,
        life * (0.7 + Math.random() * 0.3),
        size0,
        size1,
        r,
        g,
        b,
        gravity,
      );
    }
  }

  /** A glow drawn for this frame only. */
  flash(x: number, y: number, z: number, size: number, r: number, g: number, b: number): void {
    if (this.flashCount >= MAX_FLASHES) return;
    const o = this.flashCount++ * 7;
    const f = this.flashes;
    f[o] = x;
    f[o + 1] = y;
    f[o + 2] = z;
    f[o + 3] = size;
    f[o + 4] = r;
    f[o + 5] = g;
    f[o + 6] = b;
  }

  /** Moves the particles on by `dt` seconds and writes them, and this frame's flashes, to the batches. */
  update(dt: number): void {
    const d = this.data;
    const m = this.toLocal.elements;
    this.glow.begin();
    this.puff.begin();

    let i = 0;
    while (i < this.count) {
      const o = i * FIELDS;
      d[o + 6] += dt;
      if (d[o + 6] >= d[o + 7]) {
        // Swap the last particle into this slot.
        const last = --this.count * FIELDS;
        if (last !== o) d.copyWithin(o, last, last + FIELDS);
        continue;
      }
      d[o + 4] -= d[o + 14] * dt;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      if (d[o + 1] < 0.05) {
        // Rest on the lane.
        d[o + 1] = 0.05;
        d[o + 3] *= 0.6;
        d[o + 5] *= 0.6;
      }

      const t = d[o + 6] / d[o + 7];
      const x = d[o];
      const y = d[o + 1];
      const z = d[o + 2];
      const lx = m[0] * x + m[4] * y + m[8] * z;
      const ly = m[1] * x + m[5] * y + m[9] * z;
      const lz = m[2] * x + m[6] * y + m[10] * z;
      const size = d[o + 8] + (d[o + 9] - d[o + 8]) * t;
      if (d[o + 13] === 0) {
        const fade = (1 - t) * (1 - t);
        this.glow.add(lx, ly, lz, size, size, 1);
        this.glow.tint(d[o + 10] * fade, d[o + 11] * fade, d[o + 12] * fade);
      } else {
        // A puff cannot fade, so it shrinks away at the end of its life.
        const shrink = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        this.puff.add(lx, ly, lz, size * shrink, size * shrink, 1);
        this.puff.tint(d[o + 10], d[o + 11], d[o + 12]);
      }
      i++;
    }

    const f = this.flashes;
    for (let k = 0; k < this.flashCount; k++) {
      const o = k * 7;
      const x = f[o];
      const y = f[o + 1];
      const z = f[o + 2];
      this.glow.add(
        m[0] * x + m[4] * y + m[8] * z,
        m[1] * x + m[5] * y + m[9] * z,
        m[2] * x + m[6] * y + m[10] * z,
        f[o + 3],
        f[o + 3],
        1,
      );
      this.glow.tint(f[o + 4], f[o + 5], f[o + 6]);
    }
    this.flashCount = 0;

    this.glow.end();
    this.puff.end();
  }

  /** Removes every particle, e.g. when a new level starts. */
  clear(): void {
    this.count = 0;
    this.flashCount = 0;
  }
}
