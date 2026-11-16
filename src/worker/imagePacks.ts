/**
 * Matrix image packs: `m.room.image_pack` state events plus the user's global
 * `m.image_pack.rooms` references. The older Element convention uses
 * `im.ponies.room_emotes`, `im.ponies.emote_rooms` and the account's own
 * `im.ponies.user_emotes`; both are read, with the stable event taking
 * precedence for the same room and state key.
 */
import { isRecord } from "../lib/json.ts";

const MAX_IMAGES = 100;
const MAX_ROOMS = 64;
const MAX_PACKS = 64;
const USAGE_STICKER = "sticker";

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

export interface PackReference {
  readonly roomId: string;
  readonly stateKey: string;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isStickerUsage(value: unknown, packUsage: unknown): boolean {
  const imageUsage = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  if (imageUsage.length > 0) return imageUsage.includes(USAGE_STICKER);
  const declared = Array.isArray(packUsage)
    ? packUsage.filter((entry): entry is string => typeof entry === "string")
    : [];
  return declared.length === 0 || declared.includes(USAGE_STICKER);
}

function packName(content: Record<string, unknown>, fallback: string): string {
  const pack = content["pack"];
  const name = isRecord(pack) ? pack["display_name"] : undefined;
  return typeof name === "string" && name.trim() !== "" ? name.trim().slice(0, 128) : fallback.slice(0, 128);
}

function images(content: Record<string, unknown>): readonly ImagePackImageReference[] {
  if (!isRecord(content["images"])) return [];
  const pack = content["pack"];
  const packUsage = isRecord(pack) ? pack["usage"] : undefined;
  const result: ImagePackImageReference[] = [];
  for (const [shortcode, value] of Object.entries(content["images"])) {
    if (result.length >= MAX_IMAGES) break;
    if (!isRecord(value) || !isStickerUsage(value["usage"], packUsage)) continue;
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

export function parsePackContent(content: unknown, id: string, fallbackName: string): ImagePackReference | null {
  if (!isRecord(content)) return null;
  const parsed = images(content);
  return parsed.length === 0 ? null : { id, name: packName(content, fallbackName), images: parsed };
}

export function parseUserPack(legacy: unknown): ImagePackReference | null {
  return parsePackContent(legacy, "user:legacy", "");
}

function referenceRooms(content: unknown): ReadonlyMap<string, readonly string[]> {
  const rooms = isRecord(content) ? content["rooms"] : undefined;
  if (!isRecord(rooms)) return new Map();
  const result = new Map<string, readonly string[]>();
  for (const [roomId, stateKeys] of Object.entries(rooms).slice(0, MAX_ROOMS)) {
    if (!isRecord(stateKeys)) continue;
    result.set(roomId, Object.keys(stateKeys).slice(0, MAX_PACKS));
  }
  return result;
}

export function parseGlobalPackReferences(stable: unknown, legacy: unknown): readonly PackReference[] {
  const stableContent = isRecord(stable) ? stable : null;
  const rooms = stableContent === null ? referenceRooms(legacy) : referenceRooms(stableContent);
  const result: PackReference[] = [];
  for (const [roomId, stateKeys] of rooms) {
    for (const stateKey of stateKeys) {
      if (result.length >= MAX_PACKS) return result;
      result.push({ roomId, stateKey });
    }
  }
  return result;
}
