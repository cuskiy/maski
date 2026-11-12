import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { STORE } from "../core/schema.ts";
import type { Member, Message, Pack, PackImage, RoomSummary } from "../core/types.ts";
import { asArray, asNumber, asString, isRecord } from "../core/guard.ts";
import type { AccountDb } from "./db.ts";
import { directTargets, normalize, summarize, type StoredMessage } from "./normalize.ts";

export function readDirect(client: MatrixClient): Record<string, string[]> | null {
  const content = client.getAccountData("m.direct" as never)?.getContent();
  if (!isRecord(content)) return null;
  const out: Record<string, string[]> = {};
  for (const [userId, roomIds] of Object.entries(content)) out[userId] = asArray(roomIds).map(String);
  return out;
}

export async function directMap(db: AccountDb, client: MatrixClient): Promise<Map<string, string>> {
  const stored = await db.meta<Record<string, string[]> | null>("direct", null);
  return directTargets(stored, client.getUserId() ?? "");
}

export async function refreshDirect(db: AccountDb, client: MatrixClient): Promise<void> {
  const next = readDirect(client);
  if (next) await db.setMeta("direct", next);
}

export async function projectRooms(db: AccountDb, client: MatrixClient, roomIds: string[]): Promise<string[]> {
  const self = client.getUserId() ?? "";
  const direct = await directMap(db, client);
  const changed: string[] = [];
  for (const roomId of roomIds) {
    const room = client.getRoom(roomId);
    if (!room) continue;
    if (await projectRoom(db, room, direct, self)) changed.push(roomId);
  }
  return changed;
}

async function projectRoom(db: AccountDb, room: Room, direct: Map<string, string>, self: string): Promise<boolean> {
  const cursors = await db.meta<Record<string, string>>("cursors", {});
  const cursor = cursors[room.roomId];
  const events = room.getLiveTimeline().getEvents();
  const fresh: MatrixEvent[] = [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    const id = event.getId();
    if (id && id === cursor) break;
    fresh.unshift(event);
    if (fresh.length > 400) break;
  }

  let changed = false;
  const writes: StoredMessage[] = [];
  for (const event of fresh) {
    const id = event.getId();
    if (!id) continue;
    if (event.isRedacted()) {
      await db.del(STORE.events, id);
      changed = true;
      continue;
    }
    const stored = await normalize(event, room);
    if (!stored) continue;
    if (stored.kind === "state" && stored.membership !== "join" && stored.membership !== "leave" && stored.membership !== "invite") {
      continue;
    }
    writes.push(await resolveReply(db, stored));
    if (event.getType() === "m.room.message" || event.getType() === "m.sticker") changed = true;
  }
  if (writes.length > 0) await db.putMessages(writes);

  const newest = fresh.at(-1);
  if (newest) {
    cursors[room.roomId] = newest.getId() ?? cursor ?? "";
    await db.setMeta("cursors", cursors);
  }

  await projectMembers(db, room);
  const window = await db.roomWindow(room.roomId, 1);
  const summary = summarize({ room, direct, last: (window[0] as StoredMessage | undefined) ?? null, selfId: self });
  const previous = await db.getRoom(room.roomId);
  const same = previous ? sameSummary(previous, summary) : false;
  if (!same) await db.putRoom(summary);
  return changed || !same;
}

async function resolveReply(db: AccountDb, message: StoredMessage): Promise<StoredMessage> {
  if (!message.replyId) return message;
  const target = await db.get<Message>(STORE.events, message.replyId);
  if (target) message.reply = { id: message.replyId, name: target.name, body: target.body };
  return message;
}

function sameSummary(a: RoomSummary, b: RoomSummary): boolean {
  return (
    a.lastTs === b.lastTs &&
    a.unread === b.unread &&
    a.highlight === b.highlight &&
    a.name === b.name &&
    a.avatar === b.avatar &&
    a.membership === b.membership &&
    a.muted === b.muted &&
    a.favorite === b.favorite &&
    a.lowPriority === b.lowPriority &&
    a.topic === b.topic &&
    a.preview === b.preview &&
    a.canSend === b.canSend
  );
}

async function projectMembers(db: AccountDb, room: Room): Promise<void> {
  const members: Member[] = room.getMembers().slice(0, 500).map((member) => ({
    roomId: room.roomId,
    userId: member.userId,
    name: member.name,
    avatar: member.getMxcAvatarUrl() ?? null,
    membership: member.membership as Member["membership"],
    power: member.powerLevel,
  }));
  await db.putMembers(members);
}

export function packFromContent(id: string, roomId: string | null, content: Record<string, unknown>): Pack | null {
  const pack = isRecord(content["pack"]) ? content["pack"] : {};
  const images: PackImage[] = [];
  for (const [shortcode, raw] of Object.entries(isRecord(content["images"]) ? content["images"] : {})) {
    if (!isRecord(raw)) continue;
    const url = asString(raw["url"]);
    if (!url) continue;
    const info = isRecord(raw["info"]) ? raw["info"] : {};
    images.push({
      shortcode,
      body: asString(raw["body"], shortcode),
      url,
      info: {
        mxc: url,
        mime: asString(info["mimetype"], "image/png"),
        size: asNumber(info["size"]),
        width: asNumber(info["w"]) || null,
        height: asNumber(info["h"]) || null,
        duration: null,
        name: asString(raw["body"], shortcode),
        file: null,
      },
    });
  }
  if (images.length === 0) return null;
  const usage = pack["usage"];
  const list = Array.isArray(usage) ? usage.map(String) : [asString(usage, "emoticon")];
  const both = list.includes("emoticon") && list.includes("sticker");
  return {
    id,
    roomId,
    name: asString(pack["display_name"], id),
    usage: both ? "both" : list.includes("sticker") ? "sticker" : "emoticon",
    avatar: asString(pack["avatar_url"]) || null,
    attribution: asString(pack["attribution"]) || null,
    images,
  };
}

export async function projectPacks(db: AccountDb, client: MatrixClient): Promise<void> {
  const packs: Pack[] = [];
  const global = client.getAccountData("m.image_pack" as never)?.getContent();
  if (isRecord(global)) {
    for (const [id, content] of Object.entries(global)) {
      if (!isRecord(content)) continue;
      const pack = packFromContent(id, null, content);
      if (pack) packs.push(pack);
    }
  }
  const enabled = client.getAccountData("m.image_pack.rooms" as never)?.getContent();
  const enabledRooms = new Set<string>();
  if (isRecord(enabled) && isRecord(enabled["rooms"])) {
    for (const roomId of Object.keys(enabled["rooms"])) enabledRooms.add(roomId);
  }
  for (const room of client.getRooms()) {
    const stateEvents = [
      ...room.currentState.getStateEvents("m.room.image_pack" as never),
      ...room.currentState.getStateEvents("im.ponies.room_emotes" as never),
    ];
    for (const event of stateEvents) {
      const pack = packFromContent(`${room.roomId}/${event.getStateKey() ?? ""}`, room.roomId, event.getContent());
      if (!pack) continue;
      packs.push(enabledRooms.has(room.roomId) ? { ...pack, roomId: null } : pack);
    }
  }
  await db.putPacks(packs);
}
