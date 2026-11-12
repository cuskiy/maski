import type { MediaPayload, MediaResult } from "../protocol";
import type { WorkerClient } from "../matrix/client";
import { mediaCacheKey } from "../data/ids";

interface Entry {
  url: string;
  refs: number;
}

const maxEntries = 240;

export class MediaCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private readonly client: WorkerClient;

  constructor(client: WorkerClient) {
    this.client = client;
  }

  async get(request: MediaPayload): Promise<string | null> {
    const key = request.mediaKey || mediaCacheKey(request.mxc, request.width, request.height, request.method, null);
    const entry = this.entries.get(key);
    if (entry) {
      entry.refs += 1;
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry.url;
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const promise = this.load(key, request);
    this.pending.set(key, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(key);
    }
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    URL.revokeObjectURL(entry.url);
    this.entries.delete(key);
  }

  releaseAll(): void {
    for (const entry of this.entries.values()) URL.revokeObjectURL(entry.url);
    this.entries.clear();
  }

  private evict(): void {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= maxEntries) break;
      if (entry.refs > 1) continue;
      URL.revokeObjectURL(entry.url);
      this.entries.delete(key);
    }
  }

  private async load(key: string, request: MediaPayload): Promise<string | null> {
    try {
      const result = await this.client.request<MediaResult>("media", request);
      const url = URL.createObjectURL(new Blob([result.buffer], { type: result.mime }));
      this.entries.set(key, { url, refs: 1 });
      this.evict();
      return url;
    } catch {
      return null;
    }
  }
}
