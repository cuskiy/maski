import type { MatrixClient } from "matrix-js-sdk";
import { Attachment, EncryptedAttachment } from "@matrix-org/matrix-sdk-crypto-wasm";
import type { AccountDb } from "./db.ts";

const LIMIT = 16 * 1024 * 1024;

export async function fetchMedia(
  db: AccountDb,
  client: MatrixClient,
  mxc: string,
  size: number,
  method: "scale" | "crop",
  file: Record<string, unknown> | null,
): Promise<{ blob: Blob; mime: string }> {
  const key = `${mxc}@${size}/${method}`;
  const cached = await db.media(key);
  if (cached) return { blob: cached.data, mime: cached.mime };

  const match = /^mxc:\/\/([^/]+)\/(.+)$/u.exec(mxc);
  if (!match) throw new Error("bad media id");
  const server = match[1] ?? "";
  const id = match[2] ?? "";
  const token = client.getAccessToken() ?? "";
  const path =
    size > 0
      ? `/_matrix/client/v1/media/thumbnail/${encodeURIComponent(server)}/${encodeURIComponent(id)}?width=${size}&height=${size}&method=${method}`
      : `/_matrix/client/v1/media/download/${encodeURIComponent(server)}/${encodeURIComponent(id)}`;
  const response = await fetch(`${client.getHomeserverUrl()}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`media ${response.status}`);

  const raw = new Uint8Array(await response.arrayBuffer());
  const mime = response.headers.get("content-type") ?? "application/octet-stream";
  let bytes = raw;
  if (file) {
    try {
      bytes = new Uint8Array(Attachment.decrypt(new EncryptedAttachment(raw, JSON.stringify(file))));
    } catch {
      throw new Error("cannot decrypt media");
    }
  }
  if (bytes.byteLength > LIMIT) throw new Error("media too large");
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
  await db.putMedia({ key, mxc, mime, data: blob, lastUsed: Date.now() });
  return { blob, mime };
}

export interface EncryptedUpload {
  url: string;
  file: Record<string, unknown> | null;
}

/** Encrypt before uploading, so an encrypted room never receives plaintext media. */
export interface UploadOptions {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export async function uploadAttachment(
  client: MatrixClient,
  name: string,
  mime: string,
  data: ArrayBuffer,
  encrypted: boolean,
  options: UploadOptions = {},
): Promise<EncryptedUpload> {
  const abortController = options.signal ? toAbortController(options.signal) : undefined;
  const opts = {
    type: mime,
    ...(options.onProgress ? { progressHandler: (progress: { loaded: number; total: number }) => options.onProgress?.(progress.loaded, progress.total) } : {}),
    ...(abortController ? { abortController } : {}),
  };
  if (!encrypted) {
    // The filename would leak the plaintext name of an encrypted upload.
    const uploaded = await client.uploadContent(new File([data], name, { type: mime }), opts);
    return { url: uploaded.content_uri, file: null };
  }
  const attachment = Attachment.encrypt(new Uint8Array(data));
  const file = JSON.parse(attachment.mediaEncryptionInfo ?? "{}") as Record<string, unknown>;
  const bytes = new Uint8Array(attachment.encryptedData).buffer as ArrayBuffer;
  const uploaded = await client.uploadContent(new File([bytes], name, { type: mime }), { ...opts, includeFilename: false });
  return { url: uploaded.content_uri, file: { ...file, url: uploaded.content_uri } };
}

function toAbortController(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}
