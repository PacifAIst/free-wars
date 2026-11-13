import type { Enemy, Pool } from '../types';
import {
  BIG_ENEMY_MIN_TYPE,
  COLS,
  GATE_TYPE,
  GATES_ARE_SHOT,
  HASH_BUCKET,
  MAX_ENEMY_SIZE,
  MINION_SPACING,
  RAIL_WIDTH,
  SEPARATION_STIFFNESS,
  WINDOW_ROWS,
} from './constants';

/**
 * Uniform spatial hash over the enemies, rebuilt every tick (PLAN section 4).
 * Buckets are HASH_BUCKET gu square. An enemy is listed in every bucket its
 * footprint touches, so a 30x30 boss and a 1x1 minion are found the same way.
 * It covers the lane and the rail on each side of it. Gates are only listed
 * when they can be shot (A31); otherwise bullets fly straight through them.
 *
 * This is scratch data: it is derived from the sim state and never serialised.
 * All arrays are allocated once.
 */
export class SpatialHash {
  private readonly minX = -Math.ceil(RAIL_WIDTH / HASH_BUCKET) * HASH_BUCKET;
  private readonly maxX = COLS + RAIL_WIDTH;
  private readonly minY = -(Math.ceil(MAX_ENEMY_SIZE / HASH_BUCKET) + 1) * HASH_BUCKET;
  readonly cols = Math.ceil((this.maxX - this.minX) / HASH_BUCKET);
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
    const b = Math.floor((x - this.minX) / HASH_BUCKET);
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
      if (!e.active || (e.type === GATE_TYPE && !GATES_ARE_SHOT)) continue;
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
      if (!e.active || (e.type === GATE_TYPE && !GATES_ARE_SHOT)) continue;
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
   * Pushes overlapping enemies apart, so they never pass through each other
   * (decision A21). Call after `build`; rebuild afterwards if exact queries
   * are needed, because enemies move.
   *
   *  - Two minions are discs: they are pushed apart along the line between them.
   *  - A minion that overlaps a big enemy is pushed out of its footprint by the
   *    shortest way. The big enemy does not move: it ploughs through the crowd.
   *  - Of two big enemies, the one further from `targetX` (where they are both heading)
   *    gives way, so they queue up side by side instead of piling onto one spot.
   *  - Gates are alone on their rails and take no part.
   *
   * One pass per tick is enough: a dense crowd settles over a few ticks.
   */
  separate(enemies: Pool<Enemy>, targetX: number): void {
    const { items } = enemies;
    const { start, entries } = this;
    const buckets = this.cols * this.rows;
    const spacing = MINION_SPACING;
    const spacing2 = spacing * spacing;
    const reach = spacing / 2;

    for (let b = 0; b < buckets; b++) {
      const from = start[b];
      const to = start[b + 1];
      for (let m = from; m < to; m++) {
        const i = entries[m];
        const a = items[i];
        if (a.type === GATE_TYPE) continue;
        for (let n = m + 1; n < to; n++) {
          const j = entries[n];
          const c = items[j];
          if (c.type === GATE_TYPE) continue;
          // Two enemies can share several buckets. Handle the pair only in the
          // bucket that holds the top-left corner of the area their boxes share,
          // so a pair is never pushed twice in one pass.
          const left = Math.max(a.x - a.w / 2, c.x - c.w / 2);
          const top = Math.max(a.y - a.h / 2, c.y - c.h / 2);
          if (this.by(top) * this.cols + this.bx(left) !== b) continue;
          const aBig = a.type >= BIG_ENEMY_MIN_TYPE;
          const cBig = c.type >= BIG_ENEMY_MIN_TYPE;

          if (!aBig && !cBig) {
            let dx = c.x - a.x;
            let dy = c.y - a.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= spacing2) continue;
            let d = Math.sqrt(d2);
            if (d < 1e-6) {
              // Exactly on top of each other: split them sideways, by index so it is deterministic.
              dx = i < j ? 1 : -1;
              dy = 0;
              d = 1;
            }
            const push = ((spacing - d) / 2) * SEPARATION_STIFFNESS;
            const ux = (dx / d) * push;
            const uy = (dy / d) * push;
            a.x -= ux;
            a.y -= uy;
            c.x += ux;
            c.y += uy;
            continue;
          }

          if (aBig && cBig) {
            const px = (a.w + c.w) / 2 - Math.abs(c.x - a.x);
            const py = (a.h + c.h) / 2 - Math.abs(c.y - a.y);
            if (px <= 0 || py <= 0) continue;
            // The one further from the target gives way, sideways or backwards, whichever is shorter.
            const back = Math.abs(a.x - targetX) > Math.abs(c.x - targetX) ? a : c;
            const other = back === a ? c : a;
            if (px < py) back.x += (back.x < other.x ? -px : px) * SEPARATION_STIFFNESS;
            else back.y -= py * SEPARATION_STIFFNESS;
            continue;
          }

          const big = aBig ? a : c;
          const small = aBig ? c : a;
          const px = big.w / 2 + reach - Math.abs(small.x - big.x);
          const py = big.h / 2 + reach - Math.abs(small.y - big.y);
          if (px <= 0 || py <= 0) continue;
          if (px < py) small.x += small.x < big.x ? -px : px;
          else small.y += small.y < big.y ? -py : py;
        }
      }
    }

    // Keep every rat inside the lane.
    for (let i = 0; i < enemies.high; i++) {
      const e = items[i];
      if (!e.active || e.type === GATE_TYPE) continue;
      const half = e.w / 2;
      if (e.x < half) e.x = half;
      else if (e.x > COLS - half) e.x = COLS - half;
    }
  }

  /**
   * Index of an active enemy whose footprint contains the point, or -1.
   * When footprints overlap the one whose front edge is nearest the goal line
   * wins, because that is the one a bullet from below meets first.
   */
  queryPoint(x: number, y: number, enemies: Pool<Enemy>): number {
    if (x < this.minX || x >= this.maxX) return -1;
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
