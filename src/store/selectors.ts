import type { EventRecord, MemberRecord, OutboxRecord, PackRecord, RoomRecord } from "../data/records";
import type { AppSnapshot } from "./app-store";

export type SectionKey = "invites" | "channels" | "favorites" | "dms" | "rooms" | "lowPriority";

export interface RoomSection {
  key: SectionKey;
  rooms: RoomRecord[];
}

export interface TimelineEventItem {
  type: "event";
  key: string;
  event: EventRecord;
  groupStart: boolean;
  groupEnd: boolean;
  own: boolean;
  showAvatar: boolean;
  // Applied locally, waiting for the server echo.
  pending: boolean;
}

export interface TimelineDayItem {
  type: "day";
  key: string;
  ts: number;
}

export interface TimelinePendingItem {
  type: "pending";
  key: string;
  outbox: OutboxRecord;
  own: boolean;
}

export interface TimelineOlderItem {
  type: "older";
  key: string;
}

export interface TimelineNewItem {
  type: "new";
  key: string;
}

export interface TimelineReadItem {
  type: "read";
  key: string;
}

export type TimelineItem =
  | TimelineEventItem
  | TimelineDayItem
  | TimelinePendingItem
  | TimelineOlderItem
  | TimelineNewItem
  | TimelineReadItem;

export function roomSections(snapshot: AppSnapshot): RoomSection[] {
  const sections: RoomSection[] = [
    { key: "invites", rooms: [] },
    { key: "favorites", rooms: [] },
    { key: "rooms", rooms: [] },
    { key: "dms", rooms: [] },
    { key: "channels", rooms: [] },
    { key: "lowPriority", rooms: [] },
  ];
  const bucket = (key: SectionKey): RoomRecord[] => sections.find((section) => section.key === key)?.rooms ?? [];
  for (const room of snapshot.rooms) {
    if (room.membership === "invite") {
      bucket("invites").push(room);
      continue;
    }
    if (room.membership !== "join") continue;
    if (room.kind === "space" && !room.tags.includes("m.favourite")) {
      bucket("channels").push(room);
      continue;
    }
    if (room.tags.includes("m.favourite")) bucket("favorites").push(room);
    else if (room.isDirect) bucket("dms").push(room);
    else if (room.tags.includes("m.lowpriority")) bucket("lowPriority").push(room);
    else bucket("rooms").push(room);
  }
  for (const section of sections) section.rooms = section.rooms.toSorted((a, b) => b.lastTs - a.lastTs);
  return sections;
}

export function activeRoom(snapshot: AppSnapshot): RoomRecord | null {
  if (!snapshot.activeRoomId) return null;
  return snapshot.rooms.find((room) => room.roomId === snapshot.activeRoomId) ?? null;
}

export function roomById(snapshot: AppSnapshot, roomId: string): RoomRecord | null {
  return snapshot.rooms.find((room) => room.roomId === roomId) ?? null;
}

export function roomEvents(snapshot: AppSnapshot, roomId: string): EventRecord[] {
  return snapshot.events
    .filter((event) => event.roomId === roomId)
    .toSorted((a, b) => a.ts - b.ts);
}

export function memberFor(snapshot: AppSnapshot, roomId: string, userId: string): MemberRecord | null {
  return snapshot.members.find((member) => member.roomId === roomId && member.userId === userId) ?? null;
}

// Two members may pick the same display name; the spec requires disambiguating
// before showing them, so a clash appends the full MXID.
export function displayName(snapshot: AppSnapshot, roomId: string, userId: string): string {
  const member = memberFor(snapshot, roomId, userId);
  if (!member?.displayName || member.displayName === userId) return localpart(userId);
  const clashes = nameCounts(snapshot.members).get(roomId)?.get(member.displayName.toLowerCase()) ?? 0;
  return clashes > 1 ? `${member.displayName} (${userId})` : member.displayName;
}

const nameCache = new WeakMap<readonly MemberRecord[], Map<string, Map<string, number>>>();

function nameCounts(members: readonly MemberRecord[]): Map<string, Map<string, number>> {
  const cached = nameCache.get(members);
  if (cached) return cached;
  const byRoom = new Map<string, Map<string, number>>();
  for (const member of members) {
    if (!member.displayName) continue;
    const names = byRoom.get(member.roomId) ?? new Map<string, number>();
    const key = member.displayName.toLowerCase();
    names.set(key, (names.get(key) ?? 0) + 1);
    byRoom.set(member.roomId, names);
  }
  nameCache.set(members, byRoom);
  return byRoom;
}

export function localpart(userId: string): string {
  const withoutSigil = userId.startsWith("@") ? userId.slice(1) : userId;
  return withoutSigil.split(":")[0] || userId;
}

export function roomTitle(room: RoomRecord): string {
  return room.name || room.canonicalAlias || room.roomId;
}

export function roomSubtitle(room: RoomRecord): string {
  if (room.lastEvent) return room.lastEvent.preview;
  return room.topic || room.roomId;
}

// The timeline is committed state composed with the operations still in the outbox,
// so a send, an edit, a reaction and a redaction show up at once and settle by
// themselves when the server echo lands and the row leaves the outbox.
export function timelineItems(snapshot: AppSnapshot, roomId: string, windowSize: number): TimelineItem[] {
  const pendingRows = snapshot.outbox.filter((row) => row.roomId === roomId && row.status !== "sent");
  const redacted = new Set<string>();
  const edits = new Map<string, Record<string, unknown>>();
  const reactions = new Map<string, { key: string; senderId: string }[]>();
  for (const row of pendingRows) {
    if (row.eventType === "m.room.redaction") {
      const target = row.content["redacts"];
      if (typeof target === "string") redacted.add(target);
      continue;
    }
    if (row.eventType === "m.reaction") {
      const relates = row.content["m.relates_to"];
      if (!isRecord(relates)) continue;
      const target = typeof relates["event_id"] === "string" ? relates["event_id"] : null;
      const key = typeof relates["key"] === "string" ? relates["key"] : null;
      if (!target || !key) continue;
      const list = reactions.get(target) ?? [];
      list.push({ key, senderId: snapshot.session?.userId ?? "" });
      reactions.set(target, list);
      continue;
    }
    if (row.eventType === "m.room.message") {
      const relates = row.content["m.relates_to"];
      const target =
        isRecord(relates) && relates["rel_type"] === "m.replace" && typeof relates["event_id"] === "string"
          ? relates["event_id"]
          : null;
      const replacement = row.content["m.new_content"];
      if (target && isRecord(replacement)) edits.set(target, replacement);
    }
  }
  const selfId = snapshot.session?.userId ?? "";
  const events = roomEvents(snapshot, roomId)
    .filter((event) => event.kind !== "state" && !event.redacted && !redacted.has(event.eventId))
    .map((event) => applyLocal(event, edits, reactions, selfId));
  const sliced = events.slice(Math.max(0, events.length - windowSize));
  const outbox = pendingRows
    .filter((row) => row.eventType === "m.room.message" || row.eventType === "m.sticker")
    .filter((row) => !isRecord(row.content["m.relates_to"]) || row.content["m.relates_to"]["rel_type"] !== "m.replace")
    .toSorted((a, b) => a.createdAt - b.createdAt);
  const items: TimelineItem[] = [];
  const room = activeRoom(snapshot);
  if (events.length > sliced.length || room?.hasOlder) {
    items.push({ type: "older", key: "older" });
  }
  const readUpTo = room?.readUpToEventId ?? null;
  let readPlaced = !readUpTo;
  let previousDay = "";
  for (let index = 0; index < sliced.length; index += 1) {
    const event = sliced[index];
    if (!event) continue;
    if (!readPlaced && event.eventId === readUpTo && index > 0) {
      items.push({ type: "read", key: `read:${event.eventId}` });
      readPlaced = true;
    }
    const day = dayKey(event.ts);
    if (day !== previousDay) {
      items.push({ type: "day", key: `day:${day}`, ts: event.ts });
      previousDay = day;
    }
    const previous = sliced[index - 1];
    const next = sliced[index + 1];
    const groupedState = event.kind === "state" || event.kind === "membership";
    const groupStart = groupedState || !previous || !isGrouped(previous, event);
    const groupEnd = groupedState || !next || !isGrouped(event, next);
    items.push({
      type: "event",
      key: `event:${event.eventId}`,
      event,
      groupStart,
      groupEnd,
      own: event.senderId === snapshot.session?.userId,
      showAvatar: groupStart && !groupedState,
      pending: event.pending ?? false,
    });
  }
  for (const row of outbox) {
    items.push({ type: "pending", key: `pending:${row.txnId}`, outbox: row, own: true });
  }
  return items;
}

// A projection record with the local operations folded in.
type LocalEvent = EventRecord & { pending?: boolean };

function applyLocal(
  event: EventRecord,
  edits: ReadonlyMap<string, Record<string, unknown>>,
  reactions: ReadonlyMap<string, { key: string; senderId: string }[]>,
  selfId: string,
): LocalEvent {
  const edit = edits.get(event.eventId);
  const addReactions = reactions.get(event.eventId);
  if (!edit && !addReactions) return event;
  let next: LocalEvent = { ...event };
  if (edit) {
    const body = typeof edit["body"] === "string" ? edit["body"] : next.body;
    next = {
      ...next,
      body,
      formattedBody: typeof edit["formatted_body"] === "string" ? edit["formatted_body"] : next.formattedBody,
      edited: true,
      pending: true,
    };
  }
  if (addReactions) {
    const merged = { ...next.reactions };
    for (const { key, senderId } of addReactions) {
      const existing = merged[key] ?? { count: 0, me: false, myReaction: null };
      if (existing.me) continue;
      merged[key] = { ...existing, count: existing.count + 1, me: senderId === selfId };
    }
    next = { ...next, reactions: merged, pending: true };
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGrouped(previous: EventRecord, current: EventRecord): boolean {
  if (previous.senderId !== current.senderId) return false;
  if (dayKey(previous.ts) !== dayKey(current.ts)) return false;
  if (previous.kind === "state" || previous.kind === "membership") return false;
  if (current.kind === "state" || current.kind === "membership") return false;
  return true;
}

export function dayKey(ts: number): string {
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function dayLabel(ts: number, now = Date.now()): string {
  const today = dayKey(now);
  const yesterday = dayKey(now - 86_400_000);
  const key = dayKey(ts);
  if (key === today) return "today";
  if (key === yesterday) return "yesterday";
  return key;
}

export function visiblePacks(snapshot: AppSnapshot): { emoticons: PackRecord[]; stickers: PackRecord[] } {
  return {
    emoticons: snapshot.packs.filter((pack) => pack.usage === "emoticon"),
    stickers: snapshot.packs.filter((pack) => pack.usage === "sticker"),
  };
}

export function ownOutbox(snapshot: AppSnapshot, roomId: string): OutboxRecord[] {
  return snapshot.outbox.filter((row) => row.roomId === roomId && row.status !== "sent");
}
