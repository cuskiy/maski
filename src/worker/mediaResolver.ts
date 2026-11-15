/**
 * Turns a worker-only `MediaSource` into a `blob:` URL. Plain media is downloaded with the
 * authenticated endpoint; encrypted media is downloaded, hash-verified and decrypted before its
 * MIME is allowlisted. Nothing here returns an mxc URI or a key to the main thread.
 */
import type { MatrixClient } from "matrix-js-sdk";
import type { MediaReply, MediaVariant } from "../protocol/index.ts";
import { WorkerFailure } from "./failure.ts";
import { createMediaCache, type MediaCache, type MediaCacheBackend } from "./mediaCache.ts";
import { decryptAttachment, sha256, toBase64 } from "./mediaCrypto.ts";
import { safeMediaMime, thumbnailDimensions } from "./mediaFormat.ts";
import { fetchMedia } from "./mediaTransport.ts";
import type { MediaCacheRecord, MediaKind, MediaReference, MediaSource } from "./mediaTypes.ts";

const CACHE_BUDGET = 64 * 1024 * 1024;

export interface MediaSubscription {
  readonly roomId: string;
  readonly messageId: string;
  readonly variant: MediaVariant;
}

export interface MediaResolverOptions {
  readonly backend: MediaCacheBackend;
  readonly createUrl: (blob: Blob) => string;
  readonly revokeUrl: (url: string) => void;
  readonly revoked: (subscription: MediaSubscription) => void;
  readonly now: () => number;
}

export interface MediaResolver {
  resolve(client: MatrixClient, source: MediaSource, variant: MediaVariant): Promise<MediaReply>;
  /** Caches the sanitized bytes of an upload and returns the key and its preview URL. */
  cacheLocal(
    bytes: Blob,
    mime: string,
    width: number | null,
    height: number | null,
    hash: string,
  ): Promise<{ readonly key: string; readonly url: string }>;
  /** Revokes every object URL and reports each subscription that pointed at one. */
  dispose(): void;
}

function subscriptionKey(subscription: MediaSubscription): string {
  return `${subscription.roomId}\n${subscription.messageId}\n${subscription.variant}`;
}

function replyFor(record: MediaCacheRecord, url: string): MediaReply {
  return { url, mime: record.mime, width: record.width, height: record.height };
}

export function createMediaResolver(options: MediaResolverOptions): MediaResolver {
  const { revoked, ...cacheOptions } = options;
  const cache: MediaCache = createMediaCache({ ...cacheOptions, budget: CACHE_BUDGET });
  const subscriptions = new Map<string, Map<string, MediaSubscription>>();
  const inflight = new Map<string, Promise<MediaReply>>();
  const verifiedHashes = new Map<string, string>();

  function remember(key: string, subscription: MediaSubscription): void {
    const entries = subscriptions.get(key) ?? new Map<string, MediaSubscription>();
    entries.set(subscriptionKey(subscription), subscription);
    subscriptions.set(key, entries);
  }

  function report(keys: readonly string[]): void {
    for (const key of keys) {
      const entries = subscriptions.get(key);
      subscriptions.delete(key);
      for (const subscription of entries?.values() ?? []) revoked(subscription);
    }
  }

  function inflightFor(key: string, run: () => Promise<MediaReply>): Promise<MediaReply> {
    const existing = inflight.get(key);
    if (existing !== undefined) return existing;
    const promise = run().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  async function store(
    key: string,
    bytes: Blob,
    declared: string | null,
    kind: MediaKind,
    width: number | null,
    height: number | null,
  ): Promise<MediaReply> {
    const prefix = new Uint8Array(await bytes.slice(0, 64).arrayBuffer());
    const mime = safeMediaMime(prefix, declared, kind);
    const typed = bytes.slice(0, bytes.size, mime);
    const timestamp = options.now();
    const record: MediaCacheRecord = {
      key,
      blob: typed,
      mime,
      width,
      height,
      size: typed.size,
      createdAt: timestamp,
      lastUsed: timestamp,
    };
    const stored = await cache.put(record);
    report(stored.evicted);
    return replyFor(record, stored.url);
  }

  async function resolvePlain(
    client: MatrixClient,
    source: MediaSource,
    reference: Extract<MediaReference, { kind: "mxc" }>,
    variant: MediaVariant,
  ): Promise<MediaReply> {
    const thumbnail = variant === "thumbnail" && source.thumbnail === null;
    const size = thumbnail ? thumbnailDimensions(source.kind) : null;
    const key = size === null ? `mxc:${reference.url}` : `mxc:${reference.url}|thumb:${size.width}x${size.height}`;
    const hit = await cache.read(key);
    if (hit !== null) return replyFor(hit.record, hit.url);
    const loaded = await inflightFor(key, async () => {
      const bytes = await fetchMedia(client, reference.url, size, false);
      return store(key, bytes, source.mime, source.kind, size?.width ?? source.width, size?.height ?? source.height);
    });
    remember(key, { roomId: source.roomId, messageId: source.messageId, variant });
    return loaded;
  }

  async function resolveEncrypted(
    client: MatrixClient,
    source: MediaSource,
    reference: Extract<MediaReference, { kind: "encrypted" }>,
    variant: MediaVariant,
  ): Promise<MediaReply> {
    const known = verifiedHashes.get(reference.file.url);
    if (known !== undefined) {
      const hit = await cache.read(`enc:${known}|${variant}`);
      if (hit !== null) return replyFor(hit.record, hit.url);
    }
    const loaded = await inflightFor(`enc:${reference.file.url}|${variant}`, async () => {
      const ciphertext = await fetchMedia(client, reference.file.url, null);
      const hash = toBase64(await sha256(new Uint8Array(await ciphertext.arrayBuffer())));
      // A ciphertext hash alone is not enough: the same bytes with a different key decrypt to
      // different plaintext. Bind the cache entry to the key and IV context as well.
      const context = toBase64(await sha256(new TextEncoder().encode(`${reference.file.key.k}|${reference.file.iv}`)));
      const bound = `${hash}|${context}`;
      const plaintext = await decryptAttachment(ciphertext, reference.file);
      verifiedHashes.set(reference.file.url, bound);
      const key = `enc:${bound}|${variant}`;
      const hit = await cache.read(key);
      if (hit !== null) return replyFor(hit.record, hit.url);
      return store(key, plaintext, source.mime, source.kind, source.width, source.height);
    });
    const key = verifiedHashes.get(reference.file.url);
    if (key !== undefined) {
      remember(`enc:${key}|${variant}`, { roomId: source.roomId, messageId: source.messageId, variant });
    }
    return loaded;
  }

  return {
    async resolve(client, source, variant) {
      if (source.source === null) throw new WorkerFailure("unavailable");
      const reference = variant === "thumbnail" ? (source.thumbnail ?? source.source) : source.source;
      if (reference.kind === "local") {
        const hit = await cache.read(reference.key);
        if (hit === null) throw new WorkerFailure("unavailable");
        remember(reference.key, { roomId: source.roomId, messageId: source.messageId, variant });
        return replyFor(hit.record, hit.url);
      }
      if (reference.kind === "mxc") return resolvePlain(client, source, reference, variant);
      if (
        variant === "thumbnail" &&
        source.thumbnail === null &&
        source.kind !== "image" &&
        source.kind !== "sticker"
      ) {
        // No server thumbnail exists for sealed video/audio/file content.
        throw new WorkerFailure("unsupported");
      }
      return resolveEncrypted(client, source, reference, variant);
    },

    async cacheLocal(bytes, mime, width, height, hash) {
      const key = `sha256:${hash}`;
      const existing = await cache.read(key);
      if (existing !== null) return { key, url: existing.url };
      const timestamp = options.now();
      const stored = await cache.put({
        key,
        blob: bytes.slice(0, bytes.size, mime),
        mime,
        width,
        height,
        size: bytes.size,
        createdAt: timestamp,
        lastUsed: timestamp,
      });
      report(stored.evicted);
      return { key, url: stored.url };
    },

    dispose() {
      const keys = cache.dispose();
      report(keys);
      inflight.clear();
      verifiedHashes.clear();
    },
  };
}
