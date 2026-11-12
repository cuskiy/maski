import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import type { PackImage, PackRecord } from "../data/records";
import { legacyPackId, roomPackId, userPackId } from "../data/ids";
import { accountData } from "./normalize";

interface PackContent {
  pack?: {
    display_name?: unknown;
    avatar_url?: unknown;
    attribution?: unknown;
    usage?: unknown;
  };
  images?: unknown;
}

interface RoomsContent {
  rooms?: unknown;
}

export function collectPacks(client: MatrixClient, rooms: readonly Room[]): PackRecord[] {
  const stableGlobal = globalPackIds(accountData(client, "m.image_pack.rooms"));
  const legacyGlobal = globalPackIds(accountData(client, "im.ponies.emote_rooms"));
  const enabled = new Set([...stableGlobal, ...legacyGlobal]);
  const packs: PackRecord[] = [];
  const seen = new Set<string>();

  for (const room of rooms) {
    const stableEvents = room.currentState.getStateEvents("m.room.image_pack");
    for (const event of stableEvents) {
      const stateKey = event.getStateKey();
      if (!stateKey) continue;
      const id = roomPackId(room.roomId, stateKey);
      if (seen.has(id)) continue;
      seen.add(id);
      const pack = packFromEvent(event, room.roomId, stateKey, "room", "stable");
      if (pack) packs.push({ ...pack, packId: id, enabledGlobal: enabled.has(id) });
    }
    const legacyEvents = room.currentState.getStateEvents("im.ponies.room_emotes");
    for (const event of legacyEvents) {
      const stateKey = event.getStateKey();
      if (!stateKey) continue;
      const id = legacyPackId(room.roomId, stateKey);
      if (seen.has(id)) continue;
      const stableId = roomPackId(room.roomId, stateKey);
      if (seen.has(stableId)) continue;
      seen.add(id);
      const pack = packFromEvent(event, room.roomId, stateKey, "legacy", "legacy");
      if (pack) packs.push({ ...pack, packId: id, enabledGlobal: enabled.has(id) });
    }
  }

  const userStable = accountData(client, "m.image_pack");
  const userLegacy = accountData(client, "im.ponies.user_emotes");
  for (const event of [userStable, userLegacy]) {
    if (!event) continue;
    const pack = packFromEvent(event, null, null, "user", event === userStable ? "stable" : "legacy");
    if (pack) packs.push({ ...pack, packId: userPackId(client.getSafeUserId()), enabledGlobal: true });
  }

  for (const pack of packs) {
    if (enabled.has(pack.packId)) pack.enabledGlobal = true;
  }
  return packs;
}

function globalPackIds(event: MatrixEvent | undefined): Set<string> {
  const ids = new Set<string>();
  if (!event) return ids;
  const content = event.getContent<RoomsContent>();
  if (!isRecord(content.rooms)) return ids;
  for (const [roomId, value] of Object.entries(content.rooms)) {
    if (!isRecord(value)) continue;
    for (const stateKey of Object.keys(value)) {
      ids.add(roomPackId(roomId, stateKey));
      ids.add(legacyPackId(roomId, stateKey));
    }
  }
  return ids;
}

function packFromEvent(
  event: MatrixEvent,
  roomId: string | null,
  stateKey: string | null,
  source: PackRecord["source"],
  flavor: "stable" | "legacy",
): PackRecord | null {
  const content = event.getContent<PackContent>();
  if (!isRecord(content.images)) return null;
  const images: Record<string, PackImage> = {};
  for (const [shortcode, value] of Object.entries(content.images)) {
    if (!isRecord(value) || typeof value.url !== "string") continue;
    images[shortcode] = {
      shortcode,
      url: value.url,
      body: typeof value.body === "string" ? value.body : shortcode,
      info: isRecord(value.info) ? value.info : {},
    };
  }
  if (Object.keys(images).length === 0) return null;
  const meta = isRecord(content.pack) ? content.pack : {};
  const usage = usageFor(meta.usage);
  return {
    packId: flavor === "stable" && roomId && stateKey ? roomPackId(roomId, stateKey) : flavor === "legacy" && roomId && stateKey ? legacyPackId(roomId, stateKey) : userPackId(event.getSender() ?? ""),
    roomId,
    stateKey,
    displayName:
      typeof meta.display_name === "string"
        ? meta.display_name
        : stateKey ?? (source === "user" ? "My pack" : "Pack"),
    avatarMxc: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
    usage,
    attribution: typeof meta.attribution === "string" ? meta.attribution : null,
    images,
    source,
    enabledGlobal: false,
    updatedAt: Date.now(),
  };
}

function usageFor(value: unknown): PackRecord["usage"] {
  if (Array.isArray(value) && value.includes("sticker") && !value.includes("emoticon")) return "sticker";
  return "emoticon";
}

export function globalContentForPack(
  current: Record<string, unknown>,
  pack: PackRecord,
  enabled: boolean,
): Record<string, unknown> {
  const rooms = isRecord(current["rooms"]) ? cloneRooms(current["rooms"]) : {};
  if (pack.roomId && pack.stateKey) {
    const existing = rooms[pack.roomId];
    const room: Record<string, unknown> = isRecord(existing) ? existing : {};
    if (enabled) room[pack.stateKey] = room[pack.stateKey] ?? {};
    else delete room[pack.stateKey];
    if (Object.keys(room).length === 0) delete rooms[pack.roomId];
    else rooms[pack.roomId] = room;
  }
  return { ...current, rooms };
}

function cloneRooms(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, room] of Object.entries(value)) {
    out[key] = isRecord(room) ? { ...room } : {};
  }
  return out;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

