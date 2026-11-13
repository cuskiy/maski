import { NotificationCountType, PushRuleKind, type MatrixEvent, type Room } from "matrix-js-sdk";
import type { Kind, Media, Message, Reaction, Room as RoomRow } from "../core/types.ts";
import { arr, isRecord, num, str } from "../core/guard.ts";

const SPLIT = /[^\p{L}\p{N}]+/u;

/** The search index of one message: folded words, no duplicates. */
export function tokens(text: string): string[] {
  const folded = text
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return [...new Set(folded.split(SPLIT).filter((word) => word.length > 0))];
}

function kindOf(type: string, msgtype: string): Kind | null {
  if (type === "m.sticker") return "sticker";
  if (type !== "m.room.message") return null;
  switch (msgtype) {
    case "m.emote":
      return "emote";
    case "m.notice":
      return "notice";
    case "m.image":
      return "image";
    case "m.video":
      return "video";
    case "m.audio":
      return "audio";
    case "m.file":
      return "file";
    default:
      return "text";
  }
}

function mediaOf(content: Record<string, unknown>, name: string): Media | null {
  const info = isRecord(content["info"]) ? content["info"] : {};
  const file = isRecord(content["file"]) ? content["file"] : null;
  const url = str(file ? file["url"] : content["url"]);
  if (!url) return null;
  return {
    url,
    mime: str(info["mimetype"], "application/octet-stream"),
    size: num(info["size"]),
    width: num(info["w"]) || null,
    height: num(info["h"]) || null,
    name,
    file: file ? { ...file } : null,
  };
}



export function transactionId(event: MatrixEvent): string {
  const txn = event.getUnsigned()["transaction_id"];
  return typeof txn === "string" ? txn : "";
}

/** A local echo is the queued row this client already wrote, not a new message. */
export function isLocalEcho(event: MatrixEvent): boolean {
  return (event.getId() ?? "").startsWith("~");
}

/** One annotation counts once per sender: a repeat replaces the first. */
function reactionsOf(room: Room, eventId: string, self: string): Reaction[] {
  const container = room.relations.getChildEventsForEvent(eventId, "m.annotation", "m.reaction");
  const bySender = container?.getAnnotationsBySender();
  if (!bySender) return [];
  const counts = new Map<string, { senders: Set<string>; me: boolean }>();
  for (const [sender, events] of Object.entries(bySender)) {
    for (const event of events) {
      const key = str(event.getContent()["key"]) || str(event.getContent()["body"]);
      if (!key) continue;
      const entry = counts.get(key) ?? { senders: new Set<string>(), me: false };
      entry.senders.add(sender);
      if (sender === self) entry.me = true;
      counts.set(key, entry);
    }
  }
  return [...counts.entries()].map(([key, value]) => ({ key, count: value.senders.size, me: value.me }));
}

export async function normalize(event: MatrixEvent, room: Room, self: string): Promise<Message | null> {
  if (event.isRedacted()) return null;
  const content = event.getContent();
  const type = event.getType();
  const membership = type === "m.room.member" ? str(content["membership"]) : null;
  const kind = membership ? "state" : kindOf(type, str(content["msgtype"]));
  if (!kind) return null;

  const sender = event.getSender() ?? "";
  const member = room.getMember(sender);
  const failed = event.isDecryptionFailure();
  const id = event.getId() ?? "";

  let body = failed ? "" : membership ?? str(content["body"]);
  let html = str(content["formatted_body"]) || null;
  let edited = false;
  if (!failed && (kind === "text" || kind === "emote" || kind === "notice")) {
    const replacement = room.relations.getChildEventsForEvent(id, "m.replace", type);
    const newest = replacement ? await replacement.getLastReplacement() : null;
    const next = newest ? newest.getContent()["m.new_content"] : null;
    if (newest && isRecord(next)) {
      body = str(next["body"], body);
      html = str(next["formatted_body"]) || null;
      edited = true;
    }
  }

  const media = kind === "image" || kind === "video" || kind === "audio" || kind === "file" || kind === "sticker" ? mediaOf(content, body) : null;
  const mentions = isRecord(content["m.mentions"]) ? arr(content["m.mentions"]["user_ids"]).map(String) : [];

  return {
    id,
    roomId: room.roomId,
    sender,
    name: member ? member.name : sender,
    avatar: member?.getMxcAvatarUrl() ?? null,
    ts: event.getTs(),
    kind: failed ? "error" : kind,
    body,
    html,
    media,
    reply: null,
    edited,
    reactions: failed ? [] : reactionsOf(room, id, self),
    mentions,
    status: "sent",
    error: failed ? "decrypt" : null,
    encrypted: event.isEncrypted(),
    membership,
    tokens: kind === "state" ? [] : tokens(`${body} ${media ? media.name : ""}`),
  };
}

function muted(room: Room): boolean {
  const rules = room.client.pushRules;
  if (!rules) return false;
  for (const kind of [PushRuleKind.Override, PushRuleKind.ContentSpecific, PushRuleKind.RoomSpecific]) {
    for (const rule of rules.global[kind] ?? []) {
      if (!rule.enabled || rule.rule_id !== room.roomId) continue;
      if (rule.actions.includes("dont_notify" as never)) return true;
    }
  }
  return false;
}

export function directTargets(accountData: Record<string, string[]> | null, self: string): Map<string, string> {
  const targets = new Map<string, string>();
  for (const [userId, roomIds] of Object.entries(accountData ?? {})) {
    if (userId === self) continue;
    for (const roomId of roomIds) targets.set(roomId, userId);
  }
  return targets;
}

export function summarize(room: Room, direct: Map<string, string>, last: Message | null, self: string): RoomRow {
  const partner = direct.get(room.roomId) ?? null;
  const partnerMember = partner ? room.getMember(partner) : null;
  return {
    roomId: room.roomId,
    name: room.name || room.getCanonicalAlias() || room.roomId,
    avatar: room.getMxcAvatarUrl() ?? partnerMember?.getMxcAvatarUrl() ?? null,
    topic: str(room.currentState.getStateEvents("m.room.topic", "")?.getContent()["topic"]),
    encrypted: room.hasEncryptionStateEvent(),
    lastTs: last ? last.ts : 0,
    preview: last ? { body: last.body, name: last.name, own: last.sender === self, kind: last.kind } : null,
    unread: room.getUnreadNotificationCount(NotificationCountType.Total),
    highlight: room.getUnreadNotificationCount(NotificationCountType.Highlight),
    membership: room.getMyMembership(),
    isDirect: direct.has(room.roomId),
    favorite: Boolean(room.tags["m.favourite"]),
    muted: muted(room),
    readUpTo: room.getEventReadUpTo(self),
    hasOlder: room.getLiveTimeline().getPaginationToken("b" as never) !== null,
    canSend: room.maySendMessage(),
  };
}
