import {
  EventTimeline,
  EventType,
  NotificationCountType,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import type { Member, MessageEncryption, MessageKind, MessageRow, RoomSummary } from "../core/types.ts";
import { DEFAULT_POWER_LEVELS } from "../core/permissions.ts";
import { createRoom } from "../core/rooms.ts";

function content(event: MatrixEvent): Record<string, unknown> {
  return event.getContent() as Record<string, unknown>;
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
    default:
      return "text";
  }
}

function messageMedia(event: MatrixEvent, kind: MessageKind): MessageRow["media"] {
  if (kind === "text" || kind === "notice" || kind === "emote") return null;
  const value = content(event);
  const info = value["info"];
  const details = typeof info === "object" && info !== null ? Object.fromEntries(Object.entries(info)) : {};
  const url = value["url"];
  return {
    kind,
    name: typeof value["body"] === "string" ? value["body"] : "",
    width: typeof details["w"] === "number" ? details["w"] : null,
    height: typeof details["h"] === "number" ? details["h"] : null,
    size: typeof details["size"] === "number" ? details["size"] : null,
    url: typeof url === "string" ? url : null,
  };
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
  const body = encryption.state === "undecryptable" ? "" : content(event)["body"];
  const unsigned = event.getUnsigned();
  const transactionId =
    typeof unsigned["transaction_id"] === "string" ? unsigned["transaction_id"] : (event.getTxnId() ?? null);
  const sender = event.getSender() ?? "";
  const member = room.getMember(sender);
  const kind = messageKind(event);
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
    body: typeof body === "string" ? body : "",
    html:
      encryption.state === "ok" && typeof content(event)["formatted_body"] === "string"
        ? (content(event)["formatted_body"] as string)
        : null,
    media: encryption.state === "ok" ? messageMedia(event, kind) : null,
    reactions: [],
    reply: null,
    mentions: [],
    edited: event.replacingEvent() !== null,
    redacted: event.isRedacted(),
    status: messageStatus(event),
    error: null,
    system: false,
    encryption,
  };
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

function powerLevels(room: Room): RoomSummary["powerLevels"] {
  const event = room.currentState.getStateEvents(EventType.RoomPowerLevels, "");
  const value = event?.getContent() ?? {};
  const users = value["users"];
  const events = value["events"];
  const notifications = value["notifications"];
  return {
    users: (typeof users === "object" && users !== null ? users : {}) as Record<string, number>,
    usersDefault: typeof value["users_default"] === "number" ? value["users_default"] : 0,
    events: (typeof events === "object" && events !== null ? events : {}) as Record<string, number>,
    eventsDefault:
      typeof value["events_default"] === "number" ? value["events_default"] : DEFAULT_POWER_LEVELS.eventsDefault,
    stateDefault:
      typeof value["state_default"] === "number" ? value["state_default"] : DEFAULT_POWER_LEVELS.stateDefault,
    invite: typeof value["invite"] === "number" ? value["invite"] : DEFAULT_POWER_LEVELS.invite,
    kick: typeof value["kick"] === "number" ? value["kick"] : DEFAULT_POWER_LEVELS.kick,
    ban: typeof value["ban"] === "number" ? value["ban"] : DEFAULT_POWER_LEVELS.ban,
    redact: typeof value["redact"] === "number" ? value["redact"] : DEFAULT_POWER_LEVELS.redact,
    notificationsRoom:
      typeof notifications === "object" &&
      notifications !== null &&
      typeof (notifications as Record<string, unknown>)["room"] === "number"
        ? ((notifications as Record<string, unknown>)["room"] as number)
        : DEFAULT_POWER_LEVELS.notificationsRoom,
  };
}

export function projectRoom(room: Room, ownUserId: string, direct: ReadonlyMap<string, string>): RoomSummary | null {
  const membership = room.getMyMembership();
  if (membership !== "join" && membership !== "invite") return null;
  const topic = room.currentState.getStateEvents(EventType.RoomTopic, "")?.getContent()["topic"];
  const createEvent = room.currentState.getStateEvents(EventType.RoomCreate, "");
  const create = createEvent?.getContent() as Record<string, unknown> | undefined;
  const aliases =
    room.getCanonicalAlias() === null ? [] : [room.getCanonicalAlias() as string, ...room.getAltAliases()];
  const creators = Array.isArray(create?.["additional_creators"])
    ? (create["additional_creators"] as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  const creator = createEvent?.getSender();
  if (creator !== undefined && !creators.includes(creator)) creators.push(creator);
  const tags: Record<string, { order?: string }> = {};
  for (const [name, info] of Object.entries(room.tags)) {
    tags[name] = info["order"] === undefined ? {} : { order: String(info["order"]) };
  }
  const readReceipt = room.getEventReadUpTo(ownUserId, true) ?? null;
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
    notification: "default",
    encryption: room.currentState.getStateEvents(EventType.RoomEncryption, "") === undefined ? "none" : "encrypted",
    joinRule: room.getJoinRule() as RoomSummary["joinRule"],
    guestAccess: room.getGuestAccess(),
    historyVisibility: room.getHistoryVisibility(),
    directoryPublished: aliases.length > 0,
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
    unread: room.getUnreadNotificationCount(NotificationCountType.Total),
    highlight: room.getUnreadNotificationCount(NotificationCountType.Highlight),
  });
}

export function projectMembers(room: Room): readonly Member[] {
  return room.getMembers().map((member) => ({
    userId: member.userId,
    displayName: member.name,
    avatar: null,
    profile: true,
    membership: (member.membership ?? "leave") as Member["membership"],
  }));
}

export function directRooms(client: MatrixClient): ReadonlyMap<string, string> {
  const direct = client.getAccountData(EventType.Direct)?.getContent() as Record<string, unknown> | undefined;
  const result = new Map<string, string>();
  for (const [userId, rooms] of Object.entries(direct ?? {})) {
    if (!Array.isArray(rooms)) continue;
    for (const roomId of rooms) if (typeof roomId === "string") result.set(roomId, userId);
  }
  return result;
}
