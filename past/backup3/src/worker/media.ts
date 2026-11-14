import type { MatrixClient } from "matrix-js-sdk";
import { Attachment, EncryptedAttachment } from "@matrix-org/matrix-sdk-crypto-wasm";
import type { Media } from "../core/types.ts";
import type { AccountDb } from "./db.ts";

const LIMIT = 24 * 1024 * 1024;

/** A thumbnail of an encrypted original is ciphertext, so an encrypted file is fetched whole. */
export function mediaKey(media: Media, size: number): string {
  return `${media.url}@${media.file ? 0 : size}`;
}

export async function fetchMedia(db: AccountDb, client: MatrixClient, media: Media, size: number): Promise<Blob> {
  const key = mediaKey(media, size);
  const cached = await db.media(key);
  if (cached) return cached.data;

  const parts = /^mxc:\/\/([^/]+)\/(.+)$/u.exec(media.url);
  if (!parts) throw new Error("bad media id");
  const server = parts[1] ?? "";
  const id = parts[2] ?? "";
  const width = media.file ? 0 : size;
  const path =
    width > 0
      ? `/_matrix/client/v1/media/thumbnail/${encodeURIComponent(server)}/${encodeURIComponent(id)}?width=${String(width)}&height=${String(width)}&method=scale`
      : `/_matrix/client/v1/media/download/${encodeURIComponent(server)}/${encodeURIComponent(id)}`;
  const token = client.getAccessToken() ?? "";
  const response = await fetch(`${client.getHomeserverUrl()}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`media ${String(response.status)}`);
  let bytes = new Uint8Array(await response.arrayBuffer());
  if (media.file) bytes = new Uint8Array(Attachment.decrypt(new EncryptedAttachment(bytes, JSON.stringify(media.file))));
  if (bytes.byteLength > LIMIT) throw new Error("media is too large");
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: media.mime });
  await db.putMedia({ key, mime: media.mime, data: blob });
  return blob;
}
