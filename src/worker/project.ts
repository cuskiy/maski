import {
  EventTimeline,
  EventType,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  type TimelineEvents,
} from "matrix-js-sdk";
import type {
  ChatEffect,
  Poll,
  PollAnswer,
  Invite,
  Member,
  MessageEncryption,
  MessageKind,
  MessageRow,
  Membership,
  RoomSummary,
} from "../core/types.ts";
import { DEFAULT_POWER_LEVELS } from "../core/permissions.ts";
import { createRoom, isRoomJoinRule } from "../core/rooms.ts";
import { isRecord } from "../lib/json.ts";
import { readEncryptedFileData } from "./mediaTypes.ts";
import type { MediaReference, MediaSource } from "./mediaTypes.ts";

function content(event: MatrixEvent): Record<string, unknown> {
  const value: unknown = event.getContent();
  return isRecord(value) ? value : {};
}

const MEMBERSHIPS: ReadonlySet<string> = new Set<Membership>(["join", "invite", "leave", "ban", "knock"]);

function isMembership(value: unknown): value is Membership {
  return typeof value === "string" && MEMBERSHIPS.has(value);
}

function chatEffect(event: MatrixEvent): ChatEffect | null {
  switch (content(event)["msgtype"]) {
    case "nic.custom.confetti":
      return "confetti";
    case "nic.custom.fireworks":
      return "fireworks";
    case "io.element.effect.rainfall":
      return "rainfall";
    case "io.element.effect.snowfall":
      return "snowfall";
    case "io.element.effects.space_invaders":
      return "space-invaders";
    case "io.element.effect.hearts":
      return "hearts";
    default:
      return null;
  }
}

function chatPoll(event: MatrixEvent): Poll | null {
  const start = content(event)["org.matrix.msc3381.poll.start"];
  if (!isRecord(start)) return null;
  const question = start["question"];
  const questionText = isRecord(question) ? question["org.matrix.msc1767.text"] : undefined;
  const answers = start["answers"];
  if (!Array.isArray(answers)) return null;
  const parsed: PollAnswer[] = [];
  for (const answer of answers) {
    if (!isRecord(answer) || typeof answer["id"] !== "string") continue;
    const text = answer["org.matrix.msc1767.text"];
    if (typeof text !== "string") continue;
    parsed.push({ id: answer["id"], text });
  }
  if (parsed.length === 0) return null;
  return {
    question: typeof questionText === "string" ? questionText : "",
    answers: parsed,
    disclosed: start["kind"] === "org.matrix.msc3381.poll.disclosed",
  };
}

function messageKind(event: MatrixEvent): MessageKind {
  if (event.getType() === EventType.Sticker) return "sticker";
  switch (content(event)["msgtype"]) {
    case "m.image":
      return "image";
    case "m.video":
      return "video";
    case "m.audio":
      return "audio";
    case "m.file":
      return "file";
    case "m.notice":
      return "notice";
    case "m.emote":
      return "emote";
    default:
      return "text";
  }
}

interface MediaDetails {
  readonly kind: "image" | "video" | "audio" | "file" | "sticker";
  readonly name: string;
  readonly caption: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly size: number | null;
  readonly duration: number | null;
  readonly mime: string | null;
  readonly source: MediaReference | null;
  readonly thumbnail: MediaReference | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mediaReference(url: unknown, file: unknown): MediaReference | null {
  if (typeof url === "string" && url.startsWith("mxc://")) return { kind: "mxc", url };
  const encrypted = readEncryptedFileData(file);
  return encrypted === null ? null : { kind: "encrypted", file: encrypted };
}

/**
 * Media fields split into the part the client may see and the worker-only source. The spec says
 * `body` is the filename when `filename` is absent or equal, otherwise it is a caption.
 */
function mediaDetails(event: MatrixEvent, kind: MessageKind): MediaDetails | null {
  if (kind !== "image" && kind !== "video" && kind !== "audio" && kind !== "file" && kind !== "sticker") {
    return null;
  }
  const value = content(event);
  const infoValue = value["info"];
  const info = isRecord(infoValue) ? infoValue : {};
  const body = typeof value["body"] === "string" ? value["body"] : "";
  const filenameValue = value["filename"];
  const filename = typeof filenameValue === "string" && filenameValue !== "" ? filenameValue : null;
  const name = kind === "sticker" ? body : (filename ?? body);
  const caption = kind === "sticker" ? body : filename !== null && filename !== body ? body : "";
  const mimetype = info["mimetype"];
  return {
    kind,
    name,
    caption,
    width: numberOrNull(info["w"]),
    height: numberOrNull(info["h"]),
    size: numberOrNull(info["size"]),
    duration: numberOrNull(info["duration"]),
    mime: typeof mimetype === "string" ? mimetype : null,
    source: mediaReference(value["url"], value["file"]),
    thumbnail: mediaReference(info["thumbnail_url"], info["thumbnail_file"]),
  };
}

function messageMedia(details: MediaDetails): MessageRow["media"] {
  return {
    kind: details.kind,
    name: details.name,
    width: details.width,
    height: details.height,
    size: details.size,
    // The worker resolves mxc/EncryptedFile to a blob URL outside this row.
    url: null,
  };
}

/** The worker-only record that can answer a `media` command for this event. */
export function projectMediaSource(room: Room, event: MatrixEvent): MediaSource | null {
  const type = event.getType();
  // A poll is its own event type, and the room renders it with the message it names.
  if (
    type !== EventType.RoomMessage &&
    type !== EventType.RoomMessageEncrypted &&
    type !== EventType.Sticker &&
    type !== "m.poll.start"
  ) {
    return null;
  }
  if (event.isRedacted() || event.isDecryptionFailure()) return null;
  if (event.getRelation()?.rel_type === "m.replace") return null;
  const kind = messageKind(event);
  const details = mediaDetails(event, kind);
  if (details === null || (details.source === null && details.thumbnail === null)) return null;
  return {
    roomId: room.roomId,
    messageId: event.getId() ?? event.getTxnId() ?? `${room.roomId}:${String(event.getTs())}`,
    kind: details.kind,
    name: details.name,
    caption: details.caption,
    width: details.width,
    height: details.height,
    size: details.size,
    duration: details.duration,
    mime: details.mime,
    source: details.source,
    thumbnail: details.thumbnail,
  };
}

/** The one writer of the window's media sources, called beside `projectWindow`. */
export function projectMediaSources(room: Room): readonly MediaSource[] {
  const sources: MediaSource[] = [];
  for (const event of room.getLiveTimeline().getEvents()) {
    const source = projectMediaSource(room, event);
    if (source !== null) sources.push(source);
  }
  return sources;
}

function projectReactions(room: Room, event: MatrixEvent, ownUserId: string): MessageRow["reactions"] {
  const eventId = event.getId();
  if (eventId === undefined) return [];
  const senders = new Map<string, Set<string>>();
  for (const child of room.relations.getAllChildEventsForEvent(eventId) ?? []) {
    const relation = child.getRelation();
    if (relation?.rel_type !== "m.annotation" || child.isRedacted()) continue;
    const key = relation.key;
    const sender = child.getSender();
    if (typeof key !== "string" || key === "" || sender === undefined) continue;
    const set = senders.get(key) ?? new Set<string>();
    set.add(sender);
    senders.set(key, set);
  }
  return [...senders.entries()]
    .map(([key, set]) => ({ key, count: set.size, mine: set.has(ownUserId) }))
    .toSorted((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function projectReply(room: Room, event: MatrixEvent): MessageRow["reply"] {
  const parentId = event.replyEventId;
  if (parentId === undefined) return null;
  const parent = room.findEventById(parentId);
  if (parent === undefined) return { messageId: parentId, senderName: "", body: "" };
  const sender = parent.getSender() ?? "";
  const value = content(parent);
  return {
    messageId: parentId,
    senderName: room.getMember(sender)?.name ?? sender,
    body: typeof value["body"] === "string" ? value["body"] : "",
  };
}

function projectMentions(value: Readonly<Record<string, unknown>>): readonly string[] {
  const mentions = value["m.mentions"];
  if (!isRecord(mentions) || !Array.isArray(mentions["user_ids"])) return [];
  return mentions["user_ids"].filter((id: unknown): id is string => typeof id === "string");
}

function messageEncryption(event: MatrixEvent): MessageEncryption {
  if (!event.isEncrypted() || !event.isDecryptionFailure()) return { state: "ok" };
  return {
    state: "undecryptable",
    reason: event.decryptionFailureReason === "MEGOLM_UNKNOWN_INBOUND_SESSION_ID" ? "missing-key" : "corrupt",
  };
}

function messageStatus(event: MatrixEvent): MessageRow["status"] {
  switch (event.status) {
    case "sending":
      return "sending";
    case "queued":
      return "queued";
    case "not_sent":
      return "failed";
    default:
      return "sent";
  }
}

export function projectMessage(room: Room, event: MatrixEvent, ownUserId: string): MessageRow | null {
  const type = event.getType();
  if (type !== EventType.RoomMessage && type !== EventType.RoomMessageEncrypted && type !== EventType.Sticker) {
    return null;
  }
  if (event.getRelation()?.rel_type === "m.replace") return null;
  const encryption = messageEncryption(event);
  const redacted = event.isRedacted();
  const replacement = redacted ? null : event.replacingEvent();
  const effective = replacement === null ? content(event) : content(replacement);
  const body = redacted || encryption.state === "undecryptable" ? "" : effective["body"];
  const formatted = effective["formatted_body"];
  const unsigned = event.getUnsigned();
  const transactionId =
    typeof unsigned["transaction_id"] === "string" ? unsigned["transaction_id"] : (event.getTxnId() ?? null);
  const sender = event.getSender() ?? "";
  const member = room.getMember(sender);
  const kind = messageKind(event);
  const details = !redacted && encryption.state === "ok" ? mediaDetails(event, kind) : null;
  return {
    id: event.getId() ?? transactionId ?? `${room.roomId}:${String(event.getTs())}`,
    eventId: event.getId() ?? null,
    transactionId,
    roomId: room.roomId,
    sender,
    senderName: member?.name ?? sender,
    senderAvatar: null,
    ts: event.getTs(),
    own: sender === ownUserId,
    kind,
    effect: redacted ? null : chatEffect(event),
    poll: redacted ? null : chatPoll(event),
    body: details === null ? (typeof body === "string" ? body : "") : details.caption,
    html: !redacted && encryption.state === "ok" && typeof formatted === "string" ? formatted : null,
    media: details === null ? null : messageMedia(details),
    reactions: redacted ? [] : projectReactions(room, event, ownUserId),
    reply: redacted ? null : projectReply(room, event),
    mentions: redacted ? [] : projectMentions(effective),
    edited: replacement !== null,
    redacted,
    status: messageStatus(event),
    error: null,
    retryable: false,
    system: false,
    encryption,
  };
}

export type ForwardableEvent =
  | { readonly kind: "message"; readonly content: TimelineEvents[typeof EventType.RoomMessage] }
  | { readonly kind: "sticker"; readonly content: TimelineEvents[typeof EventType.Sticker] };

type MessageContent = TimelineEvents[typeof EventType.RoomMessage];
type StickerContent = TimelineEvents[typeof EventType.Sticker];

function isForwardableMessage(value: unknown): value is MessageContent {
  return isRecord(value) && typeof value["body"] === "string" && typeof value["msgtype"] === "string";
}

function isForwardableSticker(value: unknown): value is StickerContent {
  return (
    isRecord(value) && typeof value["body"] === "string" && typeof value["url"] === "string" && isRecord(value["info"])
  );
}

/**
 * A forward is a new event with the decrypted content of the source. Relationships and mentions
 * describe the source room and must not leak into the target room.
 */
export function forwardableEvent(event: MatrixEvent): ForwardableEvent | null {
  if (event.isRedacted()) return null;
  const raw = event.replacingEvent()?.getContent() ?? event.getContent();
  if (!isRecord(raw)) return null;
  const payload: Record<string, unknown> = { ...raw };
  delete payload["m.relates_to"];
  delete payload["m.mentions"];
  if (event.getType() === EventType.Sticker) {
    return isForwardableSticker(payload) ? { kind: "sticker", content: payload } : null;
  }
  if (event.getType() !== EventType.RoomMessage) return null;
  return isForwardableMessage(payload) ? { kind: "message", content: payload } : null;
}

export function projectWindow(room: Room, ownUserId: string): { messages: readonly MessageRow[]; hasOlder: boolean } {
  const timeline = room.getLiveTimeline();
  const messages: MessageRow[] = [];
  const seen = new Set<string>();
  for (const event of [...timeline.getEvents(), ...room.getPendingEvents()]) {
    const id = event.getId();
    const transactionId = event.getTxnId();
    if (id !== undefined) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    if (transactionId !== undefined) {
      if (seen.has(transactionId)) continue;
      seen.add(transactionId);
    }
    const message = projectMessage(room, event, ownUserId);
    if (message !== null) messages.push(message);
  }
  return {
    messages,
    hasOlder: timeline.getPaginationToken(EventTimeline.BACKWARDS) !== null,
  };
}

function previewFor(room: Room, ownUserId: string): RoomSummary["preview"] {
  const events = room.getLiveTimeline().getEvents();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined) continue;
    const message = projectMessage(room, event, ownUserId);
    if (message !== null && !message.redacted && (message.body !== "" || message.media !== null)) {
      return { kind: message.kind, body: message.body };
    }
  }
  return null;
}

function numberRecord(value: unknown): Readonly<Record<string, number>> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number") result[key] = entry;
  }
  return result;
}

function powerLevels(room: Room): RoomSummary["powerLevels"] {
  const event = room.currentState.getStateEvents(EventType.RoomPowerLevels, "");
  const value: Record<string, unknown> = event === null ? {} : content(event);
  const notifications = value["notifications"];
  const notificationsRoom = isRecord(notifications) ? notifications["room"] : undefined;
  return {
    users: numberRecord(value["users"]),
    usersDefault: typeof value["users_default"] === "number" ? value["users_default"] : 0,
    events: numberRecord(value["events"]),
    eventsDefault:
      typeof value["events_default"] === "number" ? value["events_default"] : DEFAULT_POWER_LEVELS.eventsDefault,
    stateDefault:
      typeof value["state_default"] === "number" ? value["state_default"] : DEFAULT_POWER_LEVELS.stateDefault,
    invite: typeof value["invite"] === "number" ? value["invite"] : DEFAULT_POWER_LEVELS.invite,
    kick: typeof value["kick"] === "number" ? value["kick"] : DEFAULT_POWER_LEVELS.kick,
    ban: typeof value["ban"] === "number" ? value["ban"] : DEFAULT_POWER_LEVELS.ban,
    redact: typeof value["redact"] === "number" ? value["redact"] : DEFAULT_POWER_LEVELS.redact,
    notificationsRoom:
      typeof notificationsRoom === "number" ? notificationsRoom : DEFAULT_POWER_LEVELS.notificationsRoom,
  };
}

export function projectRoom(
  room: Room,
  ownUserId: string,
  direct: ReadonlyMap<string, string>,
  notification: RoomSummary["notification"] = "default",
  directoryPublished = false,
): RoomSummary | null {
  const membership = room.getMyMembership();
  if (membership !== "join" && membership !== "invite") return null;
  const topic = room.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent()["topic"];
  const createEvent = room.currentState.getStateEvents(EventType.RoomCreate, "");
  const create = createEvent === null ? undefined : content(createEvent);
  const canonical = room.getCanonicalAlias();
  const aliases = canonical === null ? [] : [canonical, ...room.getAltAliases()];
  const additionalCreators = create?.["additional_creators"];
  const creators = Array.isArray(additionalCreators)
    ? additionalCreators.filter((id: unknown): id is string => typeof id === "string")
    : [];
  const creator = createEvent?.getSender();
  if (creator !== undefined && !creators.includes(creator)) creators.push(creator);
  const tags: Record<string, { order?: string }> = {};
  for (const [name, info] of Object.entries(room.tags)) {
    tags[name] = info["order"] === undefined ? {} : { order: String(info["order"]) };
  }
  const readReceipt = room.getEventReadUpTo(ownUserId, true) ?? null;
  const joinRuleValue = room.getJoinRule();
  const events = room.getLiveTimeline().getEvents();
  const lastEvent = events[events.length - 1];
  const base = createRoom({
    roomId: room.roomId,
    name: room.name || aliases[0] || room.roomId,
    topic: typeof topic === "string" ? topic : "",
    avatar: null,
    directUserId: direct.get(room.roomId) ?? null,
    roomType: room.getType() ?? null,
    tags,
    membership,
    notification,
    encryption: room.currentState.getStateEvents(EventType.RoomEncryption, "") === undefined ? "none" : "encrypted",
    joinRule: isRoomJoinRule(joinRuleValue) ? joinRuleValue : "invite",
    guestAccess: room.getGuestAccess(),
    historyVisibility: room.getHistoryVisibility(),
    directoryPublished,
    roomVersion: room.currentState.getRoomVersion(),
    federated: create?.["m.federate"] !== false,
    aliases,
    creatorIds: creators,
    powerLevels: powerLevels(room),
    readReceipt,
    fullyRead: readReceipt,
    latestEventId: lastEvent?.getId() ?? null,
  });
  return Object.assign(base, {
    preview: previewFor(room, ownUserId),
    lastTs: lastEvent?.getTs() ?? Date.now(),
    unread: 0,
    highlight: 0,
  });
}

export function projectInvites(client: MatrixClient): readonly Invite[] {
  const ownUserId = client.getUserId();
  if (ownUserId === null || ownUserId === undefined) return [];
  const direct = directRooms(client);
  const invites: Invite[] = [];
  for (const room of client.getRooms()) {
    if (room.getMyMembership() !== "invite") continue;
    const summary = projectRoom(room, ownUserId, direct);
    if (summary === null) continue;
    const inviteEvent = room.getMember(ownUserId)?.events.member;
    const inviterId = inviteEvent?.getSender() ?? "";
    const inviter = room.getMember(inviterId)?.name ?? inviterId;
    invites.push({
      roomId: room.roomId,
      name: summary.name,
      topic: summary.topic,
      avatar: summary.avatar,
      inviter,
      inviterId,
      directUserId: summary.directUserId,
      roomType: summary.roomType,
      joinRule: summary.joinRule,
      guestAccess: summary.guestAccess,
      historyVisibility: summary.historyVisibility,
      encryption: summary.encryption,
      roomVersion: summary.roomVersion,
      federated: summary.federated,
      capabilities: { accept: true, decline: true },
    });
  }
  return invites;
}

export function projectMembers(room: Room): readonly Member[] {
  return room.getMembers().map((member) => ({
    userId: member.userId,
    displayName: member.name,
    avatar: null,
    profile: true,
    membership: isMembership(member.membership) ? member.membership : "leave",
  }));
}

/** Children advertised by a space's `m.space.child` state; first valid parent wins. */
export function spaceParents(client: MatrixClient): ReadonlyMap<string, string> {
  const parents = new Map<string, string>();
  for (const room of client.getRooms()) {
    if (room.getType() !== "m.space") continue;
    for (const event of room.currentState.getStateEvents(EventType.SpaceChild)) {
      const childId = event.getStateKey();
      const via = content(event)["via"];
      if (typeof childId !== "string" || !Array.isArray(via) || via.length === 0) continue;
      if (!parents.has(childId)) parents.set(childId, room.roomId);
    }
  }
  return parents;
}

export function directRooms(client: MatrixClient): ReadonlyMap<string, string> {
  const event = client.getAccountData(EventType.Direct);
  const direct = event === undefined ? undefined : content(event);
  const result = new Map<string, string>();
  for (const [userId, rooms] of Object.entries(direct ?? {})) {
    if (!Array.isArray(rooms)) continue;
    for (const roomId of rooms) if (typeof roomId === "string") result.set(roomId, userId);
  }
  return result;
}
