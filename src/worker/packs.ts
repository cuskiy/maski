import type { MatrixClient } from "matrix-js-sdk";
import type { Media, Pack, PackImage } from "../core/types.ts";
import { isRecord, num, str } from "../core/guard.ts";

const ROOM_PACK = "m.room.image_pack";
const ROOM_PACK_OLD = "im.ponies.room_emotes";
const ACCOUNT_PACKS = "m.image_pack.rooms";
const ACCOUNT_PACKS_OLD = "im.ponies.emote_rooms";

type Usage = "emoticon" | "sticker";

function mediaOf(content: Record<string, unknown>, name: string): Media | null {
  const url = str(content["url"]);
  if (!url.startsWith("mxc://")) return null;
  const info = isRecord(content["info"]) ? content["info"] : {};
  return {
    url,
    mime: str(info["mimetype"], "image/png"),
    size: num(info["size"]),
    width: num(info["w"]) || null,
    height: num(info["h"]) || null,
    name,
    file: null,
  };
}

/** A pack's `usage` decides where its images belong; an image may override it on its own. */
function imagesOf(content: Record<string, unknown>, usage: Usage): PackImage[] {
  const images: PackImage[] = [];
  for (const [shortcode, raw] of Object.entries(isRecord(content["images"]) ? content["images"] : {})) {
    if (!isRecord(raw)) continue;
    const override = str(raw["usage"]);
    const own: Usage = override === "sticker" || override === "emoticon" ? override : usage;
    if (own !== usage) continue;
    const media = mediaOf(raw, shortcode);
    if (media === null) continue;
    images.push({ shortcode, body: str(raw["body"], shortcode), media });
  }
  return images;
}

function packOf(id: string, content: Record<string, unknown>, usage: Usage): Pack | null {
  const images = imagesOf(content, usage);
  if (images.length === 0) return null;
  const pack = isRecord(content["pack"]) ? content["pack"] : {};
  const name = str(pack["display_name"]) || id;
  return { id, name, avatar: mediaOf(pack, name), usage, images };
}

/**
 * The packs a room and the account carry: room state first, then the account's map of room to
 * packs. Both identifiers are read, because clients still send the older one.
 */
export function collectPacks(client: MatrixClient): Pack[] {
  const packs = new Map<string, Pack>();
  for (const room of client.getRooms()) {
    for (const type of [ROOM_PACK, ROOM_PACK_OLD]) {
      const event = room.currentState.getStateEvents(type, "");
      if (!event || event.getType() !== type) continue;
      for (const usage of ["emoticon", "sticker"] as const) {
        const pack = packOf(`${room.roomId}/${type}`, event.getContent(), usage);
        if (pack) packs.set(pack.id, pack);
      }
    }
  }
  for (const type of [ACCOUNT_PACKS, ACCOUNT_PACKS_OLD]) {
    const content = client.getAccountData(type as never)?.getContent();
    const rooms = isRecord(content) && isRecord(content["rooms"]) ? content["rooms"] : {};
    for (const [roomId, raw] of Object.entries(rooms)) {
      for (const [packId, entry] of Object.entries(isRecord(raw) ? raw : {})) {
        if (!isRecord(entry)) continue;
        for (const usage of ["emoticon", "sticker"] as const) {
          const pack = packOf(`${roomId}/${packId}`, entry, usage);
          if (pack) packs.set(pack.id, pack);
        }
      }
    }
  }
  return [...packs.values()];
}
