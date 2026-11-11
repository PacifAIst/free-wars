import type { Enemy, Pool } from '../types';
import { COLS, HASH_BUCKET, MAX_ENEMY_SIZE, WINDOW_ROWS } from './constants';

/**
 * Uniform spatial hash over the enemies, rebuilt every tick (PLAN section 4).
 * Buckets are HASH_BUCKET gu square. An enemy is listed in every bucket its
 * footprint touches, so a 30x30 boss and a 1x1 minion are found the same way.
 *
 * This is scratch data: it is derived from the sim state and never serialised.
 * All arrays are allocated once.
 */
export class SpatialHash {
  private readonly minY = -(Math.ceil(MAX_ENEMY_SIZE / HASH_BUCKET) + 1) * HASH_BUCKET;
  readonly cols = Math.ceil(COLS / HASH_BUCKET);
  readonly rows = Math.ceil((WINDOW_ROWS - this.minY) / HASH_BUCKET) + 1;
  /** start[b]..start[b + 1] is the slice of `entries` for bucket b. */
  private readonly start: Int32Array;
  private readonly fill: Int32Array;
  private entries: Int32Array;
  /** Per-enemy stamp, to report an enemy once when a query spans several buckets. */
  private readonly seen: Int32Array;
  private stamp = 0;

  constructor(enemyCapacity: number) {
    const buckets = this.cols * this.rows;
    this.start = new Int32Array(buckets + 1);
    this.fill = new Int32Array(buckets);
    this.entries = new Int32Array(enemyCapacity * 2);
    this.seen = new Int32Array(enemyCapacity);
  }

  private bx(x: number): number {
    const b = Math.floor(x / HASH_BUCKET);
    return b < 0 ? 0 : b >= this.cols ? this.cols - 1 : b;
  }

  private by(y: number): number {
    const b = Math.floor((y - this.minY) / HASH_BUCKET);
    return b < 0 ? 0 : b >= this.rows ? this.rows - 1 : b;
  }

  build(enemies: Pool<Enemy>): void {
    const { items, high } = enemies;
    const { start, fill, cols } = this;
    start.fill(0);

    // Pass 1: count the entries of each bucket.
    let total = 0;
    for (let i = 0; i < high; i++) {
      const e = items[i];
      if (!e.active) continue;
      const x0 = this.bx(e.x - e.w / 2);
      const x1 = this.bx(e.x + e.w / 2 - 1e-9);
      const y0 = this.by(e.y - e.h / 2);
      const y1 = this.by(e.y + e.h / 2 - 1e-9);
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) start[by * cols + bx + 1]++;
      }
      total += (x1 - x0 + 1) * (y1 - y0 + 1);
    }
    // Only happens when many bosses overlap; growing here keeps queries exact.
    if (total > this.entries.length) this.entries = new Int32Array(total * 2);

    // Prefix sums turn counts into slice starts.
    for (let b = 0; b < fill.length; b++) {
      start[b + 1] += start[b];
      fill[b] = start[b];
    }

    // Pass 2: write the enemy indices into their slices.
    const entries = this.entries;
    for (let i = 0; i < high; i++) {
      const e = items[i];
      if (!e.active) continue;
      const x0 = this.bx(e.x - e.w / 2);
      const x1 = this.bx(e.x + e.w / 2 - 1e-9);
      const y0 = this.by(e.y - e.h / 2);
      const y1 = this.by(e.y + e.h / 2 - 1e-9);
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) entries[fill[by * cols + bx]++] = i;
      }
    }
  }

  /**
   * Index of an active enemy whose footprint contains the point, or -1.
   * When footprints overlap (D10) the one whose front edge is nearest the base
   * line wins, because that is the one a bullet from below meets first.
   */
  queryPoint(x: number, y: number, enemies: Pool<Enemy>): number {
    if (x < 0 || x >= COLS) return -1;
    const b = this.by(y) * this.cols + this.bx(x);
    const { items } = enemies;
    let best = -1;
    let bestFront = -Infinity;
    for (let n = this.start[b]; n < this.start[b + 1]; n++) {
      const i = this.entries[n];
      const e = items[i];
      if (!e.active) continue;
      const halfW = e.w / 2;
      const halfH = e.h / 2;
      if (x < e.x - halfW || x >= e.x + halfW || y < e.y - halfH || y >= e.y + halfH) continue;
      const front = e.y + halfH;
      if (front > bestFront) {
        bestFront = front;
        best = i;
      }
    }
    return best;
  }

  /**
   * Writes the indices of active enemies whose footprint overlaps the
   * rectangle into `out` and returns how many were found. Each enemy is
   * reported once. Stops when `out` is full.
   */
  queryRect(x0: number, y0: number, x1: number, y1: number, enemies: Pool<Enemy>, out: Int32Array): number {
    const { items } = enemies;
    const stamp = ++this.stamp;
    let count = 0;
    const bx0 = this.bx(x0);
    const bx1 = this.bx(x1 - 1e-9);
    const by0 = this.by(y0);
    const by1 = this.by(y1 - 1e-9);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const b = by * this.cols + bx;
        for (let n = this.start[b]; n < this.start[b + 1]; n++) {
          const i = this.entries[n];
          if (this.seen[i] === stamp) continue;
          this.seen[i] = stamp;
          const e = items[i];
          if (!e.active) continue;
          if (e.x + e.w / 2 <= x0 || e.x - e.w / 2 >= x1 || e.y + e.h / 2 <= y0 || e.y - e.h / 2 >= y1) continue;
          if (count === out.length) return count;
          out[count++] = i;
        }
      }
    }
    return count;
  }
}
