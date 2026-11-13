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

/**
 * Two directions. A sync only adds to the end, so a pass reads after the room's cursor
 * and the last rows again. Backfill adds to the start, where the cursor cannot see.
 */
export type Pass = "fresh" | "older";

export async function projectRooms(db: AccountDb, client: MatrixClient, roomIds: string[], pass: Pass = "fresh"): Promise<string[]> {
  const self = client.getUserId() ?? "";
  const direct = await directMap(db, client);
  const changed: string[] = [];
  for (const roomId of roomIds) {
    const room = client.getRoom(roomId);
    if (!room) continue;
    if (await projectRoom(db, room, direct, self, pass)) changed.push(roomId);
  }
  return changed;
}

/** The one read this scan needs, so the rule can be tested without a database. */
interface KnownRows {
  get(store: string, key: string): Promise<unknown>;
}

/** The events before the oldest stored row; the first known id ends the scan. */
export async function olderEvents<T extends { getId(): string | undefined | null }>(
  db: KnownRows,
  events: T[],
): Promise<T[]> {
  const chosen: T[] = [];
  for (const event of events) {
    const id = event.getId();
    if (!id || id.startsWith("~")) break;
    if (await db.get(STORE.events, id)) break;
    chosen.push(event);
  }
  return chosen;
}

/**
 * The indexes to project: everything after the room's cursor, and the last rows again
 * because a reaction, an edit or a redaction changes an older event without adding one.
 */
export function selectFresh(ids: string[], cursor: string | undefined, tail = 30, limit = 400): number[] {
  const after = new Set<number>();
  for (let index = ids.length - 1; index >= 0 && after.size < limit; index -= 1) {
    const id = ids[index] ?? "";
    if (cursor !== undefined && id === cursor) break;
    after.add(index);
  }
  const start = Math.max(0, ids.length - tail);
  const chosen: number[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    if (index >= start || after.has(index)) chosen.push(index);
  }
  return chosen;
}

async function projectRoom(db: AccountDb, room: Room, direct: Map<string, string>, self: string, pass: Pass): Promise<boolean> {
  // A room that was left or banned is not part of the account any more, so its local
  // copy goes with it.
  const membership = room.getMyMembership();
  if (membership === "leave" || membership === "ban" || membership === "knock") {
    await db.del(STORE.rooms, room.roomId);
    await db.delMatching(STORE.events, "room", room.roomId);
    await db.delMatching(STORE.members, "room", room.roomId);
    return true;
  }
  const cursors = await db.meta<Record<string, string>>("cursors", {});
  const cursor = cursors[room.roomId];
  const events = room.getLiveTimeline().getEvents();
  const fresh: MatrixEvent[] =
    pass === "older"
      ? await olderEvents(db, events)
      : selectFresh(events.map((event) => event.getId() ?? ""), cursor)
          .map((index) => events[index])
          .filter((event): event is MatrixEvent => Boolean(event));

  let changed = false;
  let membersChanged = false;
  const writes: StoredMessage[] = [];
  const batch = new Map<string, StoredMessage>();
  for (const event of fresh) {
    const id = event.getId();
    if (!id) continue;
    // A local echo (`~room:txn`) is the queued row the main thread already wrote.
    if (id.startsWith("~")) continue;
    if (event.isRedacted()) {
      await db.del(STORE.events, id);
      changed = true;
      continue;
    }
    const stored = await normalize(event, room);
    if (!stored) continue;
    if (event.getType() === "m.room.member") membersChanged = true;
    const txn = asString(event.getUnsigned()["transaction_id"]);
    if (txn) await db.del(STORE.events, txn);
    if (stored.kind === "state" && stored.membership !== "join" && stored.membership !== "leave" && stored.membership !== "invite") {
      continue;
    }
    writes.push(resolveReply(stored, batch));
    batch.set(stored.id, stored);
    if (event.getType() === "m.room.message" || event.getType() === "m.sticker") changed = true;
  }
  if (writes.length > 0) {
    await db.putMessages(writes);
    const late = writes.filter((message) => message.replyId && !message.reply);
    const patched: StoredMessage[] = [];
    for (const message of late) {
      const target = await db.get<Message>(STORE.events, message.replyId ?? "");
      if (!target) continue;
      message.reply = { id: target.id, name: target.name, body: target.body };
      patched.push(message);
    }
    if (patched.length > 0) await db.putMessages(patched);
  }

  const newest = events.at(-1);
  if (newest) {
    cursors[room.roomId] = newest.getId() ?? cursor ?? "";
    await db.setMeta("cursors", cursors);
  }

  if (membersChanged || !(await db.hasMembers(room.roomId))) await projectMembers(db, room);
  const window = await db.roomWindow(room.roomId, 8);
  const latest = window.findLast((message) => (message as StoredMessage).kind !== "state") as StoredMessage | undefined;
  const summary = summarize({ room, direct, last: latest ?? null, selfId: self });
  const previous = await db.getRoom(room.roomId);
  const same = previous ? sameSummary(previous, summary) : false;
  if (!same) await db.putRoom(summary);
  return changed || !same;
}

function resolveReply(message: StoredMessage, batch: Map<string, StoredMessage>): StoredMessage {
  if (!message.replyId) return message;
  const target = batch.get(message.replyId);
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
    a.last?.body === b.last?.body &&
    a.last?.kind === b.last?.kind &&
    a.joined === b.joined &&
    a.readUpTo === b.readUpTo &&
    a.isDirect === b.isDirect &&
    a.encrypted === b.encrypted &&
    a.hasOlder === b.hasOlder &&
    a.myPower === b.myPower &&
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
