import type { MatrixEvent, Room } from "matrix-js-sdk";
import { NotificationCountType, PushRuleKind } from "matrix-js-sdk";
import type { MediaRef, Member, Membership, Message, MessageKind, Reaction, Room as RoomRow } from "../core/types.ts";
import { arr, isRecord, num, str } from "../core/guard.ts";
import { tokens } from "../core/text.ts";

function kindOf(type: string, msgtype: string): MessageKind | null {
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

function mediaOf(content: Record<string, unknown>, name: string): MediaRef | null {
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
    duration: num(info["duration"]) || null,
    name,
    file: file ? { ...file } : null,
  };
}

function relationsOf(content: Record<string, unknown>): Record<string, unknown> | null {
  const rel = content["m.relates_to"];
  return isRecord(rel) ? rel : null;
}

export function replyTarget(event: MatrixEvent): string | null {
  const rel = relationsOf(event.getWireContent()) ?? relationsOf(event.getContent());
  const target = rel ? rel["m.in_reply_to"] : null;
  return isRecord(target) ? str(target["event_id"]) || null : null;
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

export function storedId(event: MatrixEvent): string {
  return event.getId() ?? "";
}

/** A local echo is the queued row this client already wrote, not a new message. */
export function isLocalEcho(event: MatrixEvent): boolean {
  const id = event.getId() ?? "";
  return id.startsWith("~");
}

export function normalize(event: MatrixEvent, room: Room, self: string): Message | null {
  if (event.isRedacted()) return null;
  const content = event.getContent();
  const type = event.getType();
  const membership = type === "m.room.member" ? (str(content["membership"]) as Membership) : null;
  const kind = membership ? "state" : kindOf(type, str(content["msgtype"]));
  if (!kind) return null;

  const sender = event.getSender() ?? "";
  const member = room.getMember(sender);
  const failed = event.isDecryptionFailure();
  const id = storedId(event);

  let body = failed ? "" : membership ?? str(content["body"]);
  let html = str(content["formatted_body"]) || null;
  let edited = false;
  if (!failed && (kind === "text" || kind === "emote" || kind === "notice")) {
    const replacement = room.relations.getChildEventsForEvent(id, "m.replace", type)?.getLastReplacement();
    const next = replacement ? replacement.getContent()["m.new_content"] : null;
    if (replacement && isRecord(next)) {
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

export function summary(room: Room, direct: Map<string, string>, last: Message | null, self: string): RoomRow {
  const partner = direct.get(room.roomId) ?? null;
  const partnerMember = partner ? room.getMember(partner) : null;
  const membership = room.getMyMembership() as Membership;
  const inviterId = room.getDMInviter() ?? null;
  return {
    roomId: room.roomId,
    name: room.name || room.getCanonicalAlias() || room.roomId,
    avatar: room.getMxcAvatarUrl() ?? partnerMember?.getMxcAvatarUrl() ?? null,
    topic: str(room.currentState.getStateEvents("m.room.topic", "")?.getContent()["topic"]),
    membership,
    isDirect: direct.has(room.roomId),
    encrypted: room.hasEncryptionStateEvent(),
    lastTs: last ? last.ts : 0,
    preview: last ? { body: last.body, name: last.name, own: last.sender === self, kind: last.kind } : null,
    unread: room.getUnreadNotificationCount(NotificationCountType.Total),
    highlight: room.getUnreadNotificationCount(NotificationCountType.Highlight),
    muted: muted(room),
    favorite: Boolean(room.tags["m.favourite"]),
    lowPriority: Boolean(room.tags["m.lowpriority"]),
    inviter: inviterId ? (room.getMember(inviterId)?.name ?? inviterId) : null,
    readUpTo: room.getEventReadUpTo(self),
    members: room.getJoinedMemberCount(),
    canSend: room.maySendMessage(),
    hasOlder: room.getLiveTimeline().getPaginationToken("b" as never) !== null,
    myPower: room.getMember(self)?.powerLevel ?? 0,
  };
}

export function membersOf(room: Room): Member[] {
  return room.getMembers().map((member) => ({
    roomId: room.roomId,
    userId: member.userId,
    name: member.name,
    avatar: member.getMxcAvatarUrl() ?? null,
    membership: member.membership as Membership,
    power: member.powerLevel,
  }));
}
