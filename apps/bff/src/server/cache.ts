export type CacheEntry<T> = {
  value: T;
  expiresAtMs: number;
};

export class TTLCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(private ttlMs: number, maxSize = 1000) {
    this.maxSize = maxSize;
    // Periodic cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (now >= entry.expiresAtMs) {
        this.map.delete(key);
      }
    }
  }

  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAtMs) {
      this.map.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T) {
    // Evict oldest if at capacity
    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      const oldest = this.map.keys().next().value;
      if (oldest) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAtMs: Date.now() + this.ttlMs });
  }

  delete(key: string) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  invalidate(pattern: RegExp) {
    for (const key of this.map.keys()) {
      if (pattern.test(key)) {
        this.map.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
