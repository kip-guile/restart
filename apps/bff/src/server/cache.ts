export type CacheEntry<T> = {
  value: T;
  expiresAtMs: number;
};

export class TTLCache<T> {
  private map = new Map<string, CacheEntry<T>>();

  constructor(private ttlMs: number) {}

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
    this.map.set(key, { value, expiresAtMs: Date.now() + this.ttlMs });
  }

  delete(key: string) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}
