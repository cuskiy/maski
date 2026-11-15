/**
 * Worker-only media shapes. A `MediaSource` keeps the mxc URI or EncryptedFile that must never
 * cross to the main thread; a `MediaCacheRecord` stores a verified, allowlisted blob by content
 * address. Both live in the account database, which the client never reads.
 */
import type { Media } from "../core/types.ts";
import { isRecord } from "../lib/json.ts";

export type MediaKind = Media["kind"];

/** The `EncryptedFile` fields the attachment spec requires, restricted to the v2 shape we accept. */
export interface EncryptedFileData {
  readonly url: string;
  readonly key: {
    readonly kty: string;
    readonly alg: string;
    readonly key_ops: readonly string[];
    readonly ext: boolean;
    readonly k: string;
  };
  readonly iv: string;
  readonly hashes: Readonly<Record<string, string>>;
  readonly v: string;
}

/**
 * How a worker resolves bytes. `mxc` is a plain content URI, `encrypted` carries the key material,
 * and `local` is the sanitized plaintext of an upload that has not finished yet (or a preview).
 */
export type MediaReference =
  | { readonly kind: "mxc"; readonly url: string }
  | { readonly kind: "encrypted"; readonly file: EncryptedFileData }
  | { readonly kind: "local"; readonly key: string };

export interface MediaSource {
  readonly roomId: string;
  readonly messageId: string;
  readonly kind: MediaKind;
  readonly name: string;
  readonly caption: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly size: number | null;
  readonly duration: number | null;
  /** The MIME the event claims; untrusted until the downloaded bytes are sniffed. */
  readonly mime: string | null;
  readonly source: MediaReference | null;
  readonly thumbnail: MediaReference | null;
}

export interface MediaCacheRecord {
  /** Content address: `sha256:<hex>` for local bytes, `mxc:<uri>` for plain, `enc:<hash>` for sealed. */
  readonly key: string;
  readonly blob: Blob;
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly size: number;
  readonly createdAt: number;
  readonly lastUsed: number;
}

export interface MediaCacheUsage {
  readonly key: string;
  readonly size: number;
  readonly lastUsed: number;
}

function isMediaKind(value: unknown): value is MediaKind {
  return value === "image" || value === "video" || value === "audio" || value === "file" || value === "sticker";
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isEncryptedFileData(value: unknown): value is EncryptedFileData {
  if (!isRecord(value)) return false;
  const key = value["key"];
  const hashes = value["hashes"];
  return (
    typeof value["url"] === "string" &&
    isRecord(key) &&
    typeof key["kty"] === "string" &&
    typeof key["alg"] === "string" &&
    Array.isArray(key["key_ops"]) &&
    key["key_ops"].every((operation: unknown) => typeof operation === "string") &&
    typeof key["ext"] === "boolean" &&
    typeof key["k"] === "string" &&
    typeof value["iv"] === "string" &&
    isRecord(hashes) &&
    Object.values(hashes).every((hash: unknown) => typeof hash === "string") &&
    typeof value["v"] === "string"
  );
}

/** Parses untrusted event content into the strict v2 shape the worker stores. */
export function readEncryptedFileData(value: unknown): EncryptedFileData | null {
  return isEncryptedFileData(value) ? value : null;
}

export function isMediaReference(value: unknown): value is MediaReference {
  if (!isRecord(value)) return false;
  if (value["kind"] === "mxc") return typeof value["url"] === "string";
  if (value["kind"] === "encrypted") return isEncryptedFileData(value["file"]);
  if (value["kind"] === "local") return typeof value["key"] === "string";
  return false;
}

export function isMediaSource(value: unknown): value is MediaSource {
  return (
    isRecord(value) &&
    typeof value["roomId"] === "string" &&
    typeof value["messageId"] === "string" &&
    isMediaKind(value["kind"]) &&
    typeof value["name"] === "string" &&
    typeof value["caption"] === "string" &&
    isNumberOrNull(value["width"]) &&
    isNumberOrNull(value["height"]) &&
    isNumberOrNull(value["size"]) &&
    isNumberOrNull(value["duration"]) &&
    isTextOrNull(value["mime"]) &&
    (value["source"] === null || isMediaReference(value["source"])) &&
    (value["thumbnail"] === null || isMediaReference(value["thumbnail"]))
  );
}

export function isMediaCacheRecord(value: unknown): value is MediaCacheRecord {
  return (
    isRecord(value) &&
    typeof value["key"] === "string" &&
    value["blob"] instanceof Blob &&
    typeof value["mime"] === "string" &&
    isNumberOrNull(value["width"]) &&
    isNumberOrNull(value["height"]) &&
    typeof value["size"] === "number" &&
    typeof value["createdAt"] === "number" &&
    typeof value["lastUsed"] === "number"
  );
}
