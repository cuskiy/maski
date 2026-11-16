/**
 * Matrix image packs are account data (`m.image_pack`, legacy `im.ponies.user_emotes`).
 * This parser keeps only the fields a picker needs; media stays a worker reference.
 */
import { isRecord } from "../lib/json.ts";

const MAX_IMAGES = 100;

export interface ImagePackImageReference {
  readonly shortcode: string;
  readonly body: string;
  readonly url: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly size: number | null;
  readonly mime: string | null;
}

export interface ImagePackReference {
  readonly id: string;
  readonly name: string;
  readonly images: readonly ImagePackImageReference[];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function packName(content: Record<string, unknown>, fallback: string): string {
  const pack = content["pack"];
  const name = isRecord(pack) ? pack["display_name"] : undefined;
  return typeof name === "string" && name.trim() !== "" ? name.trim().slice(0, 128) : fallback;
}

function images(content: unknown): readonly ImagePackImageReference[] {
  if (!isRecord(content) || !isRecord(content["images"])) return [];
  const result: ImagePackImageReference[] = [];
  for (const [shortcode, value] of Object.entries(content["images"])) {
    if (result.length >= MAX_IMAGES) break;
    if (!isRecord(value)) continue;
    const url = value["url"];
    if (typeof url !== "string" || !url.startsWith("mxc://") || url.length > 4096) continue;
    const info = isRecord(value["info"]) ? value["info"] : {};
    const rawBody = typeof value["body"] === "string" ? value["body"] : shortcode;
    result.push({
      shortcode: shortcode.slice(0, 100),
      body: rawBody.slice(0, 512),
      url,
      width: numberOrNull(info["w"]),
      height: numberOrNull(info["h"]),
      size: numberOrNull(info["size"]),
      mime: typeof info["mimetype"] === "string" ? info["mimetype"] : null,
    });
  }
  return result;
}

export function parseUserImagePacks(stable: unknown, legacy: unknown): readonly ImagePackReference[] {
  const packs: ImagePackReference[] = [];
  if (isRecord(stable)) {
    const parsed = images(stable);
    if (parsed.length > 0) {
      packs.push({ id: "user:stable", name: packName(stable, "My stickers"), images: parsed });
    }
  }
  if (isRecord(legacy)) {
    const parsed = images(legacy);
    if (parsed.length > 0) {
      packs.push({ id: "user:legacy", name: packName(legacy, "My stickers"), images: parsed });
    }
  }
  return packs;
}
