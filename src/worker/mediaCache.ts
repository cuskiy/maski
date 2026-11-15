/**
 * Content-addressed blob cache. A record is only written after its bytes were verified and its
 * MIME allowlisted, so a cache hit is as safe as the first download. Object URLs are minted once
 * per key here and revoked on eviction or logout; the database never stores a `blob:` URL.
 */
import type { MediaCacheRecord, MediaCacheUsage } from "./mediaTypes.ts";

export interface MediaCacheBackend {
  readMediaCache(key: string): Promise<MediaCacheRecord | null>;
  writeMediaCache(record: MediaCacheRecord): Promise<void>;
  removeMediaCache(key: string): Promise<void>;
  readMediaUsage(): Promise<readonly MediaCacheUsage[]>;
}

export interface MediaCacheOptions {
  readonly backend: MediaCacheBackend;
  readonly createUrl: (blob: Blob) => string;
  readonly revokeUrl: (url: string) => void;
  readonly now: () => number;
  readonly budget: number;
}

export interface MediaCachePut {
  readonly url: string;
  readonly evicted: readonly string[];
}

export interface MediaCacheHit {
  readonly record: MediaCacheRecord;
  readonly url: string;
}

export interface MediaCache {
  put(record: MediaCacheRecord): Promise<MediaCachePut>;
  read(key: string): Promise<MediaCacheHit | null>;
  /** Revokes every object URL this worker minted and returns the keys it held. */
  dispose(): readonly string[];
}

interface Entry {
  readonly url: string;
  readonly size: number;
  lastUsed: number;
}

export function createMediaCache(options: MediaCacheOptions): MediaCache {
  const { backend, createUrl, revokeUrl, now, budget } = options;
  const entries = new Map<string, Entry>();

  function evict(key: string, evicted: string[]): void {
    const entry = entries.get(key);
    if (entry === undefined) return;
    revokeUrl(entry.url);
    entries.delete(key);
    evicted.push(key);
  }

  async function enforceBudget(keep: string): Promise<readonly string[]> {
    const evicted: string[] = [];
    const usage = await backend.readMediaUsage();
    let total = usage.reduce((sum, record) => sum + record.size, 0);
    const oldestFirst = [...usage].toSorted((left, right) => left.lastUsed - right.lastUsed);
    for (const record of oldestFirst) {
      if (total <= budget) break;
      if (record.key === keep) continue;
      await backend.removeMediaCache(record.key);
      total -= record.size;
      evict(record.key, evicted);
    }
    return evicted;
  }

  return {
    async put(record) {
      const existing = entries.get(record.key);
      if (existing !== undefined) {
        existing.lastUsed = now();
        return { url: existing.url, evicted: [] };
      }
      const url = createUrl(record.blob);
      await backend.writeMediaCache(record);
      entries.set(record.key, { url, size: record.size, lastUsed: record.lastUsed });
      const evicted = await enforceBudget(record.key);
      return { url, evicted };
    },

    async read(key) {
      const entry = entries.get(key);
      if (entry !== undefined) {
        entry.lastUsed = now();
        const record = await backend.readMediaCache(key);
        if (record === null) return null;
        const touched = { ...record, lastUsed: entry.lastUsed };
        await backend.writeMediaCache(touched);
        return { record: touched, url: entry.url };
      }
      const record = await backend.readMediaCache(key);
      if (record === null) return null;
      const url = createUrl(record.blob);
      const lastUsed = now();
      entries.set(key, { url, size: record.size, lastUsed });
      const touched = { ...record, lastUsed };
      await backend.writeMediaCache(touched);
      return { record: touched, url };
    },

    dispose() {
      const keys = [...entries.keys()];
      for (const key of keys) {
        const entry = entries.get(key);
        if (entry !== undefined) revokeUrl(entry.url);
      }
      entries.clear();
      return keys;
    },
  };
}
