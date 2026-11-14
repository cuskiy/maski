import type { MatrixClient } from "matrix-js-sdk";
import type { EncryptedFile, MediaDescriptor, MediaRecord, OutboxRecord } from "../data/records";
import { mediaCacheKey } from "../data/ids";
import type { Projection } from "./projection";

export interface MediaRequest {
  mediaKey: string;
  mxc: string;
  width: number;
  height: number;
  method: string;
  file?: EncryptedFile;
}

export interface MediaResult {
  buffer: ArrayBuffer;
  mime: string;
}

export async function fetchMedia(
  client: MatrixClient,
  projection: Projection,
  request: MediaRequest,
): Promise<MediaResult> {
  const encryptedHash = request.file?.hashes["sha256"] ?? null;
  const cacheKey =
    request.mediaKey ||
    mediaCacheKey(request.mxc, request.width, request.height, request.method, encryptedHash);
  const cached = await projection.getMedia(cacheKey);
  if (cached?.blob) {
    return { buffer: await cached.blob.arrayBuffer(), mime: cached.mimetype };
  }
  const token = client.getAccessToken();
  if (!token) throw new Error("Not signed in");
  // Thumbnails are an optimisation: a homeserver may refuse one for a media type,
  // an animated image or an encrypted file, so each candidate is tried in turn and
  // the original file is always the last resort. The SDK derives a thumbnail URL
  // whenever a resize method is present, so the download URL passes none.
  const size =
    request.file || !request.width || !request.height
      ? null
      : { width: request.width, height: request.height };
  const candidates: { url: string | null; auth: boolean }[] = [
    {
      url: client.mxcUrlToHttp(request.mxc, size?.width, size?.height, size ? request.method : undefined, false, true, true),
      auth: true,
    },
    { url: client.mxcUrlToHttp(request.mxc, undefined, undefined, undefined, false, true, true), auth: true },
    {
      url: client.mxcUrlToHttp(request.mxc, size?.width, size?.height, size ? request.method : undefined, false, true, false),
      auth: false,
    },
    { url: client.mxcUrlToHttp(request.mxc, undefined, undefined, undefined, false, true, false), auth: false },
  ];
  const urls = candidates
    .map((candidate) => candidate)
    .filter((candidate, index, list) => Boolean(candidate.url) && list.findIndex((item) => item.url === candidate.url) === index);
  if (urls.length === 0) throw new Error("Invalid media URL");
  let response: Response | null = null;
  for (const candidate of urls) {
    if (!candidate.url) continue;
    try {
      const attempt = await fetch(
        candidate.url,
        candidate.auth ? { headers: { Authorization: `Bearer ${token}` } } : {},
      );
      if (attempt.ok) {
        response = attempt;
        break;
      }
    } catch {
      // Try the next candidate.
    }
  }
  if (!response) throw new Error("Media request failed");
  let buffer = await response.arrayBuffer();
  let mime = response.headers.get("content-type") ?? request.file?.mimetype ?? "application/octet-stream";
  if (request.file) {
    buffer = await decryptAttachment(buffer, request.file);
    mime = request.file.mimetype ?? mime;
  }
  const blob = new Blob([buffer], { type: mime });
  const record: MediaRecord = {
    mediaKey: cacheKey,
    mxc: request.mxc,
    mimetype: mime,
    size: blob.size,
    blob,
    cachedAt: Date.now(),
    lastUsedAt: Date.now(),
  };
  await projection.putMedia(record);
  return { buffer, mime };
}

export async function attachmentForSend(
  client: MatrixClient,
  outbox: OutboxRecord,
  roomEncrypted: boolean,
): Promise<Record<string, unknown>> {
  if (!outbox.blob || !outbox.media) throw new Error("Missing attachment");
  const media = outbox.media;
  let upload: ArrayBuffer;
  let encryptedFile: EncryptedFile | null = null;
  if (roomEncrypted) {
    const encrypted = await encryptAttachment(await outbox.blob.arrayBuffer(), media.mimetype);
    upload = encrypted.ciphertext;
    encryptedFile = encrypted.file;
  } else {
    upload = await outbox.blob.arrayBuffer();
  }
  const response = await client.uploadContent(new Blob([upload], { type: "application/octet-stream" }), {
    name: media.filename || "attachment",
    type: media.mimetype || "application/octet-stream",
  });
  const url = response.content_uri;
  if (!url) throw new Error("Upload did not return a content URI");
  const msgtype = msgtypeForMime(media.mimetype);
  const info: Record<string, unknown> = {
    mimetype: media.mimetype,
    size: upload.byteLength,
  };
  if (media.width) info["w"] = media.width;
  if (media.height) info["h"] = media.height;
  if (encryptedFile) {
    encryptedFile.url = url;
    return {
      msgtype,
      body: media.filename || "Attachment",
      file: encryptedFile,
      info,
    };
  }
  return {
    msgtype,
    body: media.filename || "Attachment",
    url,
    info,
  };
}

function msgtypeForMime(mime: string): string {
  if (mime.startsWith("image/")) return "m.image";
  if (mime.startsWith("video/")) return "m.video";
  if (mime.startsWith("audio/")) return "m.audio";
  return "m.file";
}

async function decryptAttachment(ciphertext: ArrayBuffer, file: EncryptedFile): Promise<ArrayBuffer> {
  const key = base64UrlDecode(file.key.k);
  const iv = base64UrlDecode(file.iv);
  const hmacKey = base64UrlDecode(file.key.k);
  const expected = file.hashes["sha256"];
  if (!expected) throw new Error("Encrypted file has no SHA-256 hash");
  const hmac = await crypto.subtle.importKey(
    "raw",
    hmacKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const actual = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, ciphertext));
  if (!constantTimeEqual(actual, base64UrlDecode(expected))) {
    throw new Error("Encrypted file hash mismatch");
  }
  const aes = await crypto.subtle.importKey("raw", key, { name: "AES-CTR" }, false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-CTR", counter: iv, length: 64 }, aes, ciphertext);
}

async function encryptAttachment(
  plaintext: ArrayBuffer,
  mimetype: string,
): Promise<{ ciphertext: ArrayBuffer; file: EncryptedFile }> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const aes = await crypto.subtle.importKey("raw", key, { name: "AES-CTR" }, false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-CTR", counter: iv, length: 64 }, aes, plaintext);
  const hmac = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, ciphertext));
  return {
    ciphertext,
    file: {
      url: "upload",
      key: {
        kty: "oct",
        key_ops: ["encrypt", "decrypt"],
        alg: "A256CTR",
        k: base64UrlEncode(key),
        ext: true,
      },
      iv: base64UrlEncode(iv),
      hashes: { sha256: base64UrlEncode(hash) },
      v: "v2",
      mimetype,
    },
  };
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return diff === 0;
}

export function mediaDescriptorFromFile(
  media: MediaDescriptor,
  file: EncryptedFile,
): MediaDescriptor {
  return { ...media, encrypted: file };
}
