import type { MediaPayload, MediaResult } from "../protocol";
import type { WorkerClient } from "../matrix/client";
import { mediaCacheKey } from "../data/ids";

export type LocalMedia = (key: string) => Promise<Blob | null>;

// Object urls stay alive until they are evicted, so a row that scrolls back into
// view reuses the decoded image instead of decoding it again.
const maxEntries = 240;

export class MediaCache {
  private readonly entries = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private readonly client: WorkerClient;
  private readonly local: LocalMedia;

  constructor(client: WorkerClient, local: LocalMedia) {
    this.client = client;
    this.local = local;
  }

  async get(request: MediaPayload): Promise<string | null> {
    const key = request.mediaKey || mediaCacheKey(request.mxc, request.width, request.height, request.method, null);
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
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

  clear(): void {
    for (const url of this.entries.values()) URL.revokeObjectURL(url);
    this.entries.clear();
  }

  private evict(): void {
    for (const [key, url] of this.entries) {
      if (this.entries.size <= maxEntries) break;
      URL.revokeObjectURL(url);
      this.entries.delete(key);
    }
  }

  private async load(key: string, request: MediaPayload): Promise<string | null> {
    // A cached blob comes straight from the local database: no worker round trip, so
    // an avatar is on screen in the same frame the row appears.
    const blob = await this.local(key).catch(() => null);
    if (blob) {
      const url = URL.createObjectURL(blob);
      this.entries.set(key, url);
      this.evict();
      return url;
    }
    try {
      const result = await this.client.request<MediaResult>("media", request);
      const url = URL.createObjectURL(new Blob([result.buffer], { type: result.mime }));
      this.entries.set(key, url);
      this.evict();
      return url;
    } catch {
      return null;
    }
  }
}
