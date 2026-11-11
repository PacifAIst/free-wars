import type { Pool } from '../types';

/** Creates a pool with `capacity` items, all inactive. */
export function createPool<T extends { active: boolean }>(capacity: number, make: () => T): Pool<T> {
  const items: T[] = [];
  const free: number[] = [];
  for (let i = 0; i < capacity; i++) {
    items.push(make());
    // Reverse order, so the first allocations take the lowest indices.
    free.push(capacity - 1 - i);
  }
  return { items, free, freeCount: capacity, live: 0, high: 0 };
}

/** Takes a free slot and marks it active. Returns its index, or -1 if the pool is full. */
export function poolAlloc<T extends { active: boolean }>(pool: Pool<T>): number {
  if (pool.freeCount === 0) return -1;
  const index = pool.free[--pool.freeCount];
  pool.items[index].active = true;
  pool.live++;
  if (index >= pool.high) pool.high = index + 1;
  return index;
}

/** Returns a slot to the pool. Freeing an inactive slot is a no-op. */
export function poolFree<T extends { active: boolean }>(pool: Pool<T>, index: number): void {
  const item = pool.items[index];
  if (!item.active) return;
  item.active = false;
  pool.free[pool.freeCount++] = index;
  pool.live--;
  while (pool.high > 0 && !pool.items[pool.high - 1].active) pool.high--;
}
