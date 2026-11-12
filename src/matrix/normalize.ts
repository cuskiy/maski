import {
  Direction,
  EventType,
  MsgType,
  NotificationCountType,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  type RoomMember,
} from "matrix-js-sdk";
import type {
  EventKind,
  EventRecord,
  EncryptedFile,
  MediaDescriptor,
  MemberRecord,
  Membership,
  ReplyPreview,
  RoomRecord,
} from "../data/records";
import { normalizeText, tokenize } from "../data/text";

export function toMembership(value: string | undefined): Membership {
  switch (value) {
    case "join":
    case "invite":
    case "leave":
    case "ban":
    case "knock":
      return value;
    default:
      return "leave";
  }
}

export function normalizeEvent(event: MatrixEvent, room: Room | null): EventRecord | null {
  const relation = event.getRelation();
  if (
    relation &&
    (relation.rel_type === "m.annotation" ||
      relation.rel_type === "m.replace" ||
      event.getType() === EventType.RoomRedaction)
  ) {
    return null;
  }

  const eventId = event.getId();
  const roomId = event.getRoomId();
  if (!eventId || !roomId || eventId.startsWith("~")) return null;

  const content = contentRecord(event);
  const type = event.getType();
  const redacted = event.isRedacted();
  const decryptionFailure = event.isDecryptionFailure();
  const encrypted = type === EventType.RoomMessageEncrypted;
  const body = redacted ? "" : readString(content["body"]) ?? "";
  const formatted = redacted ? null : readString(content["formatted_body"]);
  const msgtype = readString(content["msgtype"]);
  const base = {
    eventId,
    roomId,
    senderId: event.getSender() ?? "",
    ts: event.getTs(),
    type,
    body,
    formattedBody: formatted,
    msgtype,
    media: redacted ? null : mediaFromContent(content),
    replyTo: redacted ? null : replyFromEvent(event, room),
    mentions: mentionsFromContent(content),
    edited: false,
    redacted,
    encrypted,
    decryptionError: decryptionFailure ? "Unable to decrypt this message." : null,
    decrypting: !redacted && event.isBeingDecrypted(),
    reactions: {},
    txnId: readString(event.getUnsigned()["transaction_id"]) ?? null,
    searchText: redacted ? "" : normalizeText(body),
    tokens: redacted ? [] : tokenize(body),
    stateKey: event.getStateKey() ?? null,
  } satisfies Omit<EventRecord, "kind" | "membership">;
  const kind = kindFor(event, type, msgtype, content, decryptionFailure, redacted);
  const membership =
    type === EventType.RoomMember ? toMembership(readString(content["membership"]) ?? undefined) : null;
  return { ...base, kind, membership };
}

function kindFor(
  event: MatrixEvent,
  type: string,
  msgtype: string | null,
  content: Record<string, unknown>,
  decryptionFailure: boolean,
  redacted: boolean,
): EventKind {
  if (redacted) return "redacted";
  if (decryptionFailure) return "encrypted";
  if (event.isState()) {
    return type === EventType.RoomMember ? "membership" : "state";
  }
  switch (type) {
    case EventType.RoomMessage:
      return messageKind(msgtype);
    case EventType.Sticker:
      return "sticker";
    case EventType.RoomMessageEncrypted:
      return !decryptionFailure && msgtype ? messageKind(msgtype) : "encrypted";
    default:
      return content["msgtype"] === undefined ? "unsupported" : "text";
  }
}

function messageKind(msgtype: string | null): EventKind {
  switch (msgtype) {
    case MsgType.Text:
      return "text";
    case MsgType.Emote:
      return "emote";
    case MsgType.Notice:
      return "notice";
    case MsgType.Image:
      return "image";
    case MsgType.File:
      return "file";
    case MsgType.Audio:
      return "audio";
    case MsgType.Video:
      return "video";
    default:
      return "unsupported";
  }
}

export function normalizeMember(member: RoomMember, roomId: string): MemberRecord {
  return {
    roomId,
    userId: member.userId,
    displayName: member.name,
    avatarMxc: member.getMxcAvatarUrl() ?? null,
    membership: toMembership(member.membership),
    powerLevel: member.powerLevel,
    updatedAt: Date.now(),
  };
}

export function normalizeRoom(
  room: Room,
  selfUserId: string,
  directIds: ReadonlySet<string>,
  client: MatrixClient | null,
): RoomRecord {
  const live = room.getLiveTimeline();
  const events = live.getEvents();
  let last: EventRecord | null = null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const candidate = events[index];
    if (!candidate) continue;
    last = normalizeEvent(candidate, room);
    if (last) break;
  }
  const member = selfUserId ? room.getMember(selfUserId) : null;
  const direct = directIds.has(room.roomId);
  const peerId =
    room.getDMInviter() ??
    (direct ? room.getJoinedMembers().find((candidate) => candidate.userId !== selfUserId)?.userId : undefined) ??
    null;
  const peerMember = peerId ? room.getMember(peerId) : null;
  const peerAvatar = peerMember?.getMxcAvatarUrl() ?? (peerId ? client?.getUser(peerId)?.avatarUrl : undefined) ?? null;
  const topicEvent = room.currentState.getStateEvents(EventType.RoomTopic, "");
  const topic = topicEvent ? readString(topicEvent.getContent()["topic"]) ?? "" : "";
  const tags = Object.keys(room.tags);
  const kind = room.isSpaceRoom() ? "space" : "room";
  // A child entry is only valid with a server list to resolve it through.
  const children =
    kind === "space"
      ? room.currentState
          .getStateEvents("m.space.child")
          .filter((child) => Array.isArray(child.getContent()["via"]) && child.getContent()["via"].length > 0)
          .toSorted(compareSpaceChildren)
          .map((child) => child.getStateKey() ?? "")
          .filter((childId) => childId.startsWith("!"))
      : [];
  return {
    roomId: room.roomId,
    kind,
    children,
    name: room.name || peerMember?.name || (peerId ? client?.getUser(peerId)?.displayName : undefined) || room.roomId,
    topic,
    avatarMxc: room.getMxcAvatarUrl() ?? peerAvatar,
    canonicalAlias: room.getCanonicalAlias(),
    isDirect: direct,
    membership: toMembership(room.getMyMembership()),
    selfMembership: toMembership(room.getMyMembership()),
    selfPowerLevel: member?.powerLevel ?? 0,
    memberCount: room.getJoinedMemberCount(),
    isEncrypted: room.hasEncryptionStateEvent(),
    joinRule: room.getJoinRule(),
    lastTs: last?.ts ?? 0,
    lastEvent: last
      ? {
          eventId: last.eventId,
          senderId: last.senderId,
          ts: last.ts,
          kind: last.kind,
          preview: previewFor(last),
        }
      : null,
    unreadTotal: room.getUnreadNotificationCount(NotificationCountType.Total),
    unreadHighlight: room.getUnreadNotificationCount(NotificationCountType.Highlight),
    readUpToEventId: selfUserId ? room.getEventReadUpTo(selfUserId, true) : null,
    tags,
    muted: isRoomMuted(client, room.roomId),
    order: 0,
    hasOlder: room.getLiveTimeline().getPaginationToken(Direction.Backward) !== null,
    updatedAt: Date.now(),
  };
}

export function previewFor(event: EventRecord): string {
  switch (event.kind) {
    case "text":
    case "emote":
    case "notice":
      return event.body.replace(/\s+/g, " ").trim();
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "file":
      return "File";
    case "sticker":
      return "Sticker";
    case "membership":
      return event.membership ? `Membership: ${event.membership}` : "Membership";
    case "encrypted":
      return "Encrypted message";
    case "redacted":
      return "Message deleted";
    case "state":
      return "Room state";
    default:
      return "Message";
  }
}

export function replyFromEvent(event: MatrixEvent, room: Room | null): ReplyPreview | null {
  // A reply nests m.in_reply_to under m.relates_to, so getRelation() does not see it.
  const targetId = event.replyEventId;
  if (!targetId) return null;
  const target = room?.findEventById(targetId);
  const targetContent = target ? contentRecord(target) : {};
  return {
    eventId: targetId,
    senderId: target?.getSender() ?? "",
    body: readString(targetContent["body"]) ?? "",
    kind: target ? kindFor(target, target.getType(), readString(targetContent["msgtype"]), targetContent, target.isDecryptionFailure(), target.isRedacted()) : "text",
  };
}

// Account data is an open namespace; the SDK types only the keys it knows.
export function accountData(client: MatrixClient, type: string): MatrixEvent | undefined {
  return client.store.getAccountData(type);
}

export function contentRecord(event: MatrixEvent): Record<string, unknown> {
  try {
    const content = event.getContent();
    return isRecord(content) ? content : {};
  } catch {
    return {};
  }
}

export function mediaFromContent(content: Record<string, unknown>): MediaDescriptor | null {
  const info = isRecord(content["info"]) ? content["info"] : {};
  const file = parseEncryptedFile(content["file"]);
  const url = readString(content["url"]) ?? file?.url ?? null;
  const thumbnailFile = parseEncryptedFile(content["thumbnail_file"]);
  const thumbnailUrl = readString(content["thumbnail_url"]) ?? thumbnailFile?.url ?? null;
  if (!url) return null;
  const mimetype = readString(content["mimetype"]) ?? readString(info["mimetype"]) ?? file?.mimetype ?? "";
  const filename = readString(content["filename"]) ?? readString(content["body"]) ?? "";
  const size = readNumber(content["size"]) ?? readNumber(info["size"]) ?? 0;
  const width = readNumber(info["w"]) ?? 0;
  const height = readNumber(info["h"]) ?? 0;
  return {
    mxc: url,
    mimetype,
    filename,
    size,
    width,
    height,
    encrypted: file,
    thumbnail:
      thumbnailUrl === null
        ? null
        : {
            mxc: thumbnailUrl,
            mimetype: readString(info["mimetype"]) ?? "",
            filename,
            size: readNumber(info["size"]) ?? 0,
            width: readNumber(info["w"]) ?? 0,
            height: readNumber(info["h"]) ?? 0,
            encrypted: thumbnailFile,
            thumbnail: null,
          },
  };
}

function parseEncryptedFile(value: unknown): EncryptedFile | null {
  if (!isRecord(value)) return null;
  const url = readString(value["url"]);
  const key = isRecord(value["key"]) ? value["key"] : null;
  const iv = readString(value["iv"]);
  const hashes = isRecord(value["hashes"])
    ? Object.fromEntries(
        Object.entries(value["hashes"]).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
    : null;
  const version = readString(value["v"]);
  if (!url || !key || !iv || !hashes || !version) return null;
  const kty = readString(key["kty"]);
  const alg = readString(key["alg"]);
  const k = readString(key["k"]);
  const keyOps = Array.isArray(key["key_ops"])
    ? key["key_ops"].filter((entry): entry is string => typeof entry === "string")
    : [];
  if (!kty || !alg || !k) return null;
  return {
    url,
    key: { kty, alg, k, key_ops: keyOps, ext: key["ext"] === true },
    iv,
    hashes,
    v: version,
    ...(typeof value["mimetype"] === "string" ? { mimetype: value["mimetype"] } : {}),
  };
}

function mentionsFromContent(content: Record<string, unknown>): string[] {
  const mentions = content["m.mentions"];
  if (!isRecord(mentions)) return [];
  return Array.isArray(mentions["user_ids"])
    ? mentions["user_ids"].filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** A room rule with dont_notify is what the client sets when a room is muted. */
// Spec: children with an order sort lexicographically first, then the rest by the
// timestamp of their child event, then by room id.
function compareSpaceChildren(left: MatrixEvent, right: MatrixEvent): number {
  const leftOrder = left.getContent()["order"];
  const rightOrder = right.getContent()["order"];
  const leftHas = typeof leftOrder === "string";
  const rightHas = typeof rightOrder === "string";
  if (leftHas && rightHas && leftOrder !== rightOrder) return leftOrder < rightOrder ? -1 : 1;
  if (leftHas !== rightHas) return leftHas ? -1 : 1;
  if (left.getTs() !== right.getTs()) return left.getTs() - right.getTs();
  return (left.getStateKey() ?? "").localeCompare(right.getStateKey() ?? "");
}

function isRoomMuted(client: MatrixClient | null, roomId: string): boolean {
  if (!client) return false;
  try {
    const rule = client.getRoomPushRule("global", roomId);
    return rule ? rule.actions.some((action) => action === "dont_notify") : false;
  } catch {
    return false;
  }
}

export function directRoomIds(client: MatrixClient): Set<string> {
  const event = accountData(client, "m.direct");
  if (!event) return new Set();
  const content = contentRecord(event);
  const result = new Set<string>();
  for (const value of Object.values(content)) {
    if (Array.isArray(value)) {
      for (const roomId of value) if (typeof roomId === "string") result.add(roomId);
    }
  }
  return result;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
