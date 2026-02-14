/**
 * BoundedMap — LRU-evicting Map with configurable max size and TTL cleanup.
 *
 * Prevents unbounded memory growth in long-running gateway processes
 * for maps like approval tokens, idempotency caches, and limiter state.
 */

export class BoundedMap<K, V> {
  private readonly map = new Map<K, { value: V; insertedAt: number }>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(opts: { maxSize: number; ttlMs?: number }) {
    this.maxSize = Math.max(1, opts.maxSize);
    this.ttlMs = opts.ttlMs ?? 0; // 0 = no TTL
  }

  get size(): number {
    return this.map.size;
  }

  set(key: K, value: V, now = Date.now()): void {
    // Delete first to reset insertion order
    this.map.delete(key);
    this.map.set(key, { value, insertedAt: now });
    this.evictIfNeeded();
  }

  get(key: K, now = Date.now()): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.ttlMs > 0 && now - entry.insertedAt > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: K, now = Date.now()): boolean {
    return this.get(key, now) !== undefined;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  /**
   * Purge all expired entries. Returns count of purged entries.
   */
  purgeExpired(now = Date.now()): number {
    if (this.ttlMs <= 0) {
      return 0;
    }
    let purged = 0;
    for (const [key, entry] of this.map) {
      if (now - entry.insertedAt > this.ttlMs) {
        this.map.delete(key);
        purged++;
      }
    }
    return purged;
  }

  private evictIfNeeded(): void {
    while (this.map.size > this.maxSize) {
      // Evict oldest (first inserted)
      const oldest = this.map.keys().next();
      if (!oldest.done) {
        this.map.delete(oldest.value);
      }
    }
  }
}
