import type { MatrixEvent, Room } from "matrix-js-sdk";
import { NotificationCountType, PushRuleKind } from "matrix-js-sdk";
import type { MediaRef, Membership, Message, MessageKind, Reaction, RoomSummary } from "../core/types.ts";
import { asArray, asNumber, asString, isRecord } from "../core/guard.ts";

export interface StoredMessage extends Message {
  replyId: string | null;
  membership: string | null;
}

function reactionsOf(room: Room, eventId: string, self: string): Reaction[] {
  const container = room.relations.getChildEventsForEvent(eventId, "m.annotation", "m.reaction");
  const bySender = container?.getAnnotationsBySender();
  if (!bySender) return [];
  const counts = new Map<string, { senders: Set<string>; me: boolean }>();
  for (const [sender, events] of Object.entries(bySender)) {
    for (const event of events) {
      const key = asString(event.getContent()["key"]) || asString(event.getContent()["body"]);
      if (!key) continue;
      const entry = counts.get(key) ?? { senders: new Set<string>(), me: false };
      // One user counts once per key: a repeated annotation replaces the first.
      entry.senders.add(sender);
      if (sender === self) entry.me = true;
      counts.set(key, entry);
    }
  }
  return [...counts.entries()].map(([key, value]) => ({ key, count: value.senders.size, me: value.me }));
}

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;

export function searchTokens(text: string): string[] {
  const flat = text
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const words = flat.split(TOKEN_SPLIT).filter((word) => word.length > 0);
  return [...new Set(words)];
}

function mediaFrom(content: Record<string, unknown>, fallbackName: string): MediaRef | null {
  const info = isRecord(content["info"]) ? content["info"] : {};
  const file = isRecord(content["file"]) ? content["file"] : null;
  const url = asString(file ? file["url"] : content["url"]);
  if (!url) return null;
  return {
    mxc: url,
    mime: asString(info["mimetype"], "application/octet-stream"),
    size: asNumber(info["size"]),
    width: asNumber(info["w"]) || null,
    height: asNumber(info["h"]) || null,
    duration: asNumber(info["duration"]) || null,
    name: fallbackName,
    file: file ? { ...file } : null,
  };
}

function msgKind(type: string, msgtype: string): MessageKind | null {
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

function relatedTo(content: Record<string, unknown>): Record<string, unknown> | null {
  const rel = content["m.relates_to"];
  return isRecord(rel) ? rel : null;
}

export function replyTargetOf(event: MatrixEvent): string | null {
  const wire = event.getWireContent();
  const rel = relatedTo(wire) ?? relatedTo(event.getContent());
  if (!rel) return null;
  const inReply = rel["m.in_reply_to"];
  if (!isRecord(inReply)) return null;
  return asString(inReply["event_id"]) || null;
}

export async function normalize(event: MatrixEvent, room: Room): Promise<StoredMessage | null> {
  const type = event.getType();
  if (event.isRedacted()) return null;

  const content = event.getContent();
  const msgtype = asString(content["msgtype"]);
  const membership = type === "m.room.member" ? asString(content["membership"]) : null;
  const kind = membership ? "state" : msgKind(type, msgtype);
  if (!kind) return null;

  const sender = event.getSender() ?? "";
  const member = room.getMember(sender);
  let kindFinal: MessageKind = kind;
  if (event.isDecryptionFailure()) kindFinal = "error";

  const eventId = event.getId() ?? "";
  // A membership event carries no body, so the membership is what the timeline reads.
  let body = kindFinal === "error" ? "" : (membership ?? asString(content["body"]));
  let formatted = asString(content["formatted_body"]);
  let edited = false;
  if (kindFinal === "text" || kindFinal === "emote" || kindFinal === "notice") {
    const replacement = await room.relations.getChildEventsForEvent(eventId, "m.replace", type)?.getLastReplacement();
    const next = replacement?.getContent()["m.new_content"];
    if (replacement && isRecord(next)) {
      body = asString(next["body"], body);
      formatted = asString(next["formatted_body"]);
      edited = true;
    }
  }
  const mentions = isRecord(content["m.mentions"]) ? asArray(content["m.mentions"]["user_ids"]).map(String) : [];
  const media = kind === "image" || kind === "video" || kind === "audio" || kind === "file" || kind === "sticker"
    ? mediaFrom(content, body)
    : null;

  const search: string[] = kindFinal === "state" ? [] : searchTokens(`${body} ${media ? media.name : ""}`);

  return {
    id: eventId,
    roomId: room.roomId,
    sender,
    name: member ? member.name : sender,
    avatar: member?.getMxcAvatarUrl() ?? avatarFromState(room, sender),
    ts: event.getTs(),
    kind: kindFinal,
    body,
    html: formatted || null,
    media,
    reply: null,
    mentions,
    edited,
    reactions: reactionsOf(room, eventId, room.myUserId),
    status: "sent",
    error: kindFinal === "error" ? "decrypt" : null,
    encrypted: event.isEncrypted(),
    search,
    replyId: replyTargetOf(event),
    membership,
  };
}

function avatarFromState(room: Room, userId: string): string | null {
  const state = room.currentState.getStateEvents("m.room.member", userId);
  const content = state?.getContent();
  return isRecord(content) ? asString(content["avatar_url"]) || null : null;
}

export function displayNameOf(room: Room, userId: string): string {
  const member = room.getMember(userId);
  if (member) return member.name;
  return userId;
}

export function directRoomIds(accountData: Record<string, string[]> | null): Set<string> {
  const result = new Set<string>();
  for (const roomIds of Object.values(accountData ?? {})) {
    for (const roomId of roomIds) result.add(roomId);
  }
  return result;
}

export function directTargets(accountData: Record<string, string[]> | null, self: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [userId, roomIds] of Object.entries(accountData ?? {})) {
    if (userId === self) continue;
    for (const roomId of roomIds) result.set(roomId, userId);
  }
  return result;
}

function isMuted(room: Room): boolean {
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

export interface SummaryInput {
  room: Room;
  direct: Map<string, string>;
  last: StoredMessage | null;
  selfId: string;
}

export function summarize({ room, direct, last, selfId }: SummaryInput): RoomSummary {
  const partner = direct.get(room.roomId) ?? null;
  const partnerMember = partner ? room.getMember(partner) : null;
  const avatar = room.getMxcAvatarUrl() ?? partnerMember?.getMxcAvatarUrl() ?? null;
  const membership = room.getMyMembership() as Membership;
  const inviterId = room.getDMInviter() ?? null;
  const inviter = inviterId ? (room.getMember(inviterId)?.name ?? inviterId) : null;
  const preview: RoomSummary["last"] = last
    ? { kind: last.kind, body: last.body, name: last.name, own: last.sender === selfId }
    : null;
  return {
    roomId: room.roomId,
    name: room.name || room.getCanonicalAlias() || room.roomId,
    avatar,
    topic: room.currentState.getStateEvents("m.room.topic", "")?.getContent()["topic"] ?? "",
    alias: room.getCanonicalAlias(),
    membership,
    isDirect: direct.has(room.roomId),
    encrypted: room.hasEncryptionStateEvent(),
    lastTs: last ? last.ts : 0,
    last: preview,
    unread: room.getUnreadNotificationCount(NotificationCountType.Total),
    highlight: room.getUnreadNotificationCount(NotificationCountType.Highlight),
    muted: isMuted(room),
    favorite: Boolean(room.tags["m.favourite"]),
    lowPriority: Boolean(room.tags["m.lowpriority"]),
    inviter,
    readUpTo: room.getEventReadUpTo(selfId),
    joined: room.getJoinedMemberCount(),
    myPower: room.getMember(selfId)?.powerLevel ?? 0,
    hasOlder: room.getLiveTimeline().getPaginationToken("b" as never) !== null,
    canSend: room.maySendMessage(),
  };
}
