/**
 * Media validation and event content. Untrusted bytes cross exactly one allowlist here:
 * the magic bytes decide the MIME, an image is decoded and re-encoded to drop EXIF, and a
 * scriptable type never becomes a renderable blob.
 */
import { WorkerFailure } from "./failure.ts";
import type { MediaKind, MediaReference } from "./mediaTypes.ts";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const IMAGE_OUTPUT_TYPE = "image/webp";
const IMAGE_OUTPUT_QUALITY = 0.9;
const SNIFF_BYTES = 64;

const IMAGE_MIMES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/apng",
]);

const VIDEO_MIMES: ReadonlySet<string> = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]);

const AUDIO_MIMES: ReadonlySet<string> = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/flac",
]);

const DOCUMENT_MIMES: ReadonlySet<string> = new Set(["application/pdf", "application/zip"]);

const SCRIPTABLE_MIMES: ReadonlySet<string> = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
  "text/javascript",
  "application/javascript",
  "application/ecmascript",
  "application/wasm",
]);

const VIDEO_BRANDS: ReadonlySet<string> = new Set(["isom", "iso2", "iso4", "iso5", "mp41", "mp42", "avc1", "M4V "]);
const AUDIO_BRANDS: ReadonlySet<string> = new Set(["M4A ", "M4B ", "mp42a"]);

export interface MediaInfoFields {
  readonly mimetype: string;
  readonly size: number;
  readonly w?: number;
  readonly h?: number;
  readonly duration?: number;
}

export interface PreparedMedia {
  readonly kind: MediaKind;
  readonly name: string;
  readonly mime: string;
  readonly size: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly hash: string;
  readonly blob: Blob;
}

export interface MediaContentInput {
  readonly kind: MediaKind;
  readonly name: string;
  readonly caption: string;
  readonly html: string | null;
  readonly mime: string;
  readonly size: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly duration: number | null;
  readonly reference: MediaReference;
}

/** What the worker sends; the SDK enum is applied at the matrix boundary. */
export interface MediaContent {
  readonly event: "message" | "sticker";
  readonly msgtype: "m.image" | "m.video" | "m.audio" | "m.file" | null;
  readonly body: string;
  readonly name: string;
  readonly html: string | null;
  readonly info: MediaInfoFields;
  readonly reference: MediaReference;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = offset; index < offset + length; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) return value;
    value += String.fromCharCode(byte);
  }
  return value;
}

function startsWith(bytes: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((byte, index) => bytes[index] === byte);
}

function isWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0xef || byte === 0xbb;
}

/** One canonical MIME from the leading bytes; `null` means "not a type this product renders". */
export function sniffMime(bytes: Uint8Array): string | null {
  let first = 0;
  while (first < bytes.length && isWhitespace(bytes[first] ?? 0)) first += 1;
  if (bytes[first] === 0x3c) return "text/html";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  const gif = ascii(bytes, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "audio/wav";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand === "qt  ") return "video/quicktime";
    if (AUDIO_BRANDS.has(brand)) return "audio/mp4";
    if (VIDEO_BRANDS.has(brand)) return "video/mp4";
    return "video/mp4";
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (ascii(bytes, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(bytes, 0, 3) === "ID3") return "audio/mpeg";
  if (startsWith(bytes, [0xff, 0xfb]) || startsWith(bytes, [0xff, 0xf3]) || startsWith(bytes, [0xff, 0xf2])) {
    return "audio/mpeg";
  }
  if (startsWith(bytes, [0xff, 0xf1]) || startsWith(bytes, [0xff, 0xf9])) return "audio/aac";
  if (ascii(bytes, 0, 4) === "fLaC") return "audio/flac";
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  if (ascii(bytes, 0, 4) === "PK\u0003\u0004") return "application/zip";
  return null;
}

export function normalizeMime(value: string): string | null {
  const [type] = value.toLowerCase().split(";");
  const normalized = type?.trim() ?? "";
  return normalized === "" ? null : normalized;
}

export function isScriptableMime(mime: string): boolean {
  return SCRIPTABLE_MIMES.has(mime);
}

const ALLOWED_BY_KIND: Readonly<Record<MediaKind, ReadonlySet<string>>> = {
  image: IMAGE_MIMES,
  sticker: IMAGE_MIMES,
  video: VIDEO_MIMES,
  audio: AUDIO_MIMES,
  file: new Set([...IMAGE_MIMES, ...VIDEO_MIMES, ...AUDIO_MIMES, ...DOCUMENT_MIMES]),
};

const THUMBNAIL_DIMENSIONS: Readonly<Record<MediaKind, { readonly width: number; readonly height: number }>> = {
  // Both dimensions are required: the authenticated thumbnail endpoint rejects a lone width.
  image: { width: 320, height: 240 },
  sticker: { width: 256, height: 256 },
  video: { width: 640, height: 360 },
  audio: { width: 320, height: 240 },
  file: { width: 320, height: 240 },
};

/**
 * The MIME a downloaded blob may carry. A scriptable or unknown type never reaches a URL for a
 * renderable kind; a plain file falls back to `application/octet-stream`, which cannot execute.
 */
export function safeMediaMime(bytes: Uint8Array, declared: string | null, kind: MediaKind): string {
  const normalized = declared === null ? null : normalizeMime(declared);
  const sniffed = sniffMime(bytes);
  if (normalized !== null && isScriptableMime(normalized)) throw new WorkerFailure("unsupported");
  if (sniffed !== null && isScriptableMime(sniffed)) throw new WorkerFailure("unsupported");
  const allowed = ALLOWED_BY_KIND[kind];
  if (sniffed !== null && allowed.has(sniffed)) return sniffed;
  if (kind === "video" && sniffed === "audio/ogg") return "video/ogg";
  if (kind === "audio" && sniffed === "video/webm") return "audio/webm";
  if (sniffed === "video/mp4" && kind === "audio" && normalized === "audio/mp4") return normalized;
  if (normalized !== null && allowed.has(normalized)) return normalized;
  if (kind === "file") return "application/octet-stream";
  throw new WorkerFailure("unsupported");
}

/** The declared type and the category must agree before a byte is uploaded. */
function ensureKind(kind: MediaKind, sniffed: string | null, declared: string | null): void {
  const candidates = [sniffed, declared].filter((value): value is string => value !== null);
  if (candidates.some((value) => isScriptableMime(value))) throw new WorkerFailure("unsupported");
  if (kind === "file") return;
  const allowed = ALLOWED_BY_KIND[kind];
  if (kind === "video" && candidates.some((value) => value === "audio/ogg" || value === "video/ogg")) return;
  if (kind === "audio" && candidates.some((value) => value === "video/webm" || value === "audio/webm")) return;
  if (candidates.some((value) => allowed.has(value))) return;
  throw new WorkerFailure("unsupported");
}

function safeStem(name: string): string {
  const stem = Array.from(name.replace(/\.[^.]+$/u, ""))
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && !'\\/:*?"<>|'.includes(character);
    })
    .join("")
    .trim();
  return (stem === "" ? "media" : stem).slice(0, 80);
}

/**
 * Decodes the image and re-encodes its pixels, which drops EXIF, GPS, camera metadata and
 * embedded thumbnails; it also fixes orientation. Animated frames are not preserved.
 */
async function sanitizeImage(
  blob: Blob,
  name: string,
): Promise<{ readonly blob: Blob; readonly width: number; readonly height: number; readonly name: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new WorkerFailure("unsupported");
  }
  try {
    if (bitmap.width === 0 || bitmap.height === 0) throw new WorkerFailure("unsupported");
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (context === null) throw new WorkerFailure("unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    const output = await canvas.convertToBlob({ type: IMAGE_OUTPUT_TYPE, quality: IMAGE_OUTPUT_QUALITY });
    if (output.size === 0) throw new WorkerFailure("unsupported");
    return { blob: output, width, height, name: `${safeStem(name)}.webp` };
  } finally {
    bitmap.close();
  }
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Validates, sniffs and (for an image) re-encodes one attachment for upload. */
export async function prepareUpload(file: Blob, name: string, kind: MediaKind, limit: number): Promise<PreparedMedia> {
  if (file.size === 0) throw new WorkerFailure("unsupported");
  if (file.size > Math.min(limit, MAX_UPLOAD_BYTES)) throw new WorkerFailure("too-large");
  const declared = normalizeMime(file.type) ?? normalizeMime(name);
  if (declared !== null && isScriptableMime(declared)) throw new WorkerFailure("unsupported");
  const prefix = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniffed = sniffMime(prefix);
  ensureKind(kind, sniffed, declared);
  if (kind === "image" || kind === "sticker") {
    if (sniffed === null || !IMAGE_MIMES.has(sniffed)) throw new WorkerFailure("unsupported");
    const sanitized = await sanitizeImage(file, name);
    return {
      kind,
      name: sanitized.name,
      mime: IMAGE_OUTPUT_TYPE,
      size: sanitized.blob.size,
      width: sanitized.width,
      height: sanitized.height,
      hash: await sha256Hex(sanitized.blob),
      blob: sanitized.blob,
    };
  }
  const mime = safeMediaMime(prefix, declared, kind);
  const blob = file.slice(0, file.size, mime);
  return {
    kind,
    name,
    mime,
    size: blob.size,
    width: null,
    height: null,
    hash: await sha256Hex(blob),
    blob,
  };
}

/** Both dimensions are required: the authenticated thumbnail endpoint rejects a lone width. */
export function thumbnailDimensions(kind: MediaKind): { readonly width: number; readonly height: number } {
  return THUMBNAIL_DIMENSIONS[kind];
}

/** The event content for one attachment; `reference` has already been uploaded. */
export function buildMediaContent(input: MediaContentInput): MediaContent {
  if (input.kind === "sticker" && input.reference.kind !== "mxc") {
    // `m.sticker` has no encrypted `file`; only event-level encryption applies to its mxc.
    throw new WorkerFailure("unsupported");
  }
  const info: MediaInfoFields = {
    mimetype: input.mime,
    size: input.size,
    ...(input.width === null ? {} : { w: input.width }),
    ...(input.height === null ? {} : { h: input.height }),
    ...(input.duration === null ? {} : { duration: input.duration }),
  };
  const body = input.caption === "" ? input.name : input.caption;
  const html = input.caption === "" ? null : input.html;
  if (input.kind === "sticker") {
    return { event: "sticker", msgtype: null, body, name: input.name, html: null, info, reference: input.reference };
  }
  const msgtype =
    input.kind === "image"
      ? "m.image"
      : input.kind === "video"
        ? "m.video"
        : input.kind === "audio"
          ? "m.audio"
          : "m.file";
  return { event: "message", msgtype, body, name: input.name, html, info, reference: input.reference };
}
