import type { Member, MessageRow, PowerLevels, RoomSummary } from "./types.ts";

export const DEFAULT_POWER_LEVELS: PowerLevels = {
  users: {},
  usersDefault: 0,
  events: {},
  eventsDefault: 0,
  stateDefault: 50,
  invite: 0,
  kick: 50,
  ban: 50,
  redact: 50,
  notificationsRoom: 50,
};

export interface RoomPermissions {
  readonly send: boolean;
  readonly invite: boolean;
  readonly name: boolean;
  readonly topic: boolean;
  readonly aliases: boolean;
  readonly access: boolean;
  readonly directory: boolean;
  readonly leave: boolean;
  readonly markRead: boolean;
  readonly favorite: boolean;
  readonly mute: boolean;
  readonly notifications: boolean;
  readonly manage: boolean;
}

export interface MessagePermissions {
  readonly reply: boolean;
  readonly react: boolean;
  readonly edit: boolean;
  readonly redact: boolean;
  readonly copy: boolean;
}

export interface MemberPermissions {
  readonly kick: boolean;
  readonly ban: boolean;
  readonly unban: boolean;
}

function versionAtLeast(room: RoomSummary, version: number): boolean {
  const parsed = Number.parseInt(room.roomVersion, 10);
  return Number.isFinite(parsed) && parsed >= version;
}

export function powerLevelFor(room: RoomSummary, userId: string | null): number {
  if (userId === null) return Number.NEGATIVE_INFINITY;
  if (versionAtLeast(room, 12) && room.creatorIds.includes(userId)) return Number.POSITIVE_INFINITY;
  return room.powerLevels.users[userId] ?? room.powerLevels.usersDefault;
}

export function canSendEvent(room: RoomSummary, userId: string | null, eventType: string, state = false): boolean {
  if (userId === null || room.membership !== "join") return false;
  const required =
    room.powerLevels.events[eventType] ?? (state ? room.powerLevels.stateDefault : room.powerLevels.eventsDefault);
  return powerLevelFor(room, userId) >= required;
}

export function canSendStateEvent(room: RoomSummary, userId: string | null, eventType: string): boolean {
  return canSendEvent(room, userId, eventType, true);
}

export function roomPermissions(room: RoomSummary, userId: string | null): RoomPermissions {
  const joined = userId !== null && room.membership === "join";
  const power = powerLevelFor(room, userId);
  const name = canSendStateEvent(room, userId, "m.room.name");
  const topic = canSendStateEvent(room, userId, "m.room.topic");
  const aliases = canSendStateEvent(room, userId, "m.room.canonical_alias");
  const access = canSendStateEvent(room, userId, "m.room.join_rules");
  const directory = canSendStateEvent(room, userId, "m.room.canonical_alias");
  return {
    send: canSendEvent(room, userId, "m.room.message"),
    invite: joined && power >= room.powerLevels.invite,
    name,
    topic,
    aliases,
    access,
    directory,
    leave: room.membership === "join" || room.membership === "invite" || room.membership === "knock",
    markRead: joined,
    favorite: joined,
    mute: joined,
    notifications: joined,
    manage: name || topic || aliases || access || directory,
  };
}

export function messagePermissions(
  message: MessageRow,
  room: RoomSummary | null,
  userId: string | null,
): MessagePermissions {
  const joined = room !== null && userId !== null && room.membership === "join";
  const canSendMessage = room !== null && canSendEvent(room, userId, "m.room.message");
  const canReact = room !== null && canSendEvent(room, userId, "m.reaction");
  const canRedactEvent = room !== null && canSendEvent(room, userId, "m.room.redaction");
  const own = userId !== null && message.sender === userId;
  const actorPower = room === null ? Number.NEGATIVE_INFINITY : powerLevelFor(room, userId);
  const senderPower = room === null ? Number.NEGATIVE_INFINITY : powerLevelFor(room, message.sender);
  const otherRedact =
    room !== null && canRedactEvent && actorPower >= room.powerLevels.redact && actorPower > senderPower;
  return {
    reply: joined && !message.redacted && canSendMessage,
    react: joined && !message.redacted && canReact,
    edit:
      joined &&
      !message.redacted &&
      own &&
      message.eventId !== null &&
      message.media === null &&
      (message.kind === "text" || message.kind === "notice" || message.kind === "emote") &&
      canSendMessage,
    redact: joined && !message.redacted && canRedactEvent && (own || otherRedact),
    copy: !message.redacted && message.body !== "",
  };
}

export function memberPermissions(room: RoomSummary, member: Member, userId: string | null): MemberPermissions {
  if (userId === null || userId === member.userId || room.membership !== "join") {
    return { kick: false, ban: false, unban: false };
  }
  const actorPower = powerLevelFor(room, userId);
  const targetPower = powerLevelFor(room, member.userId);
  if (actorPower <= targetPower) return { kick: false, ban: false, unban: false };
  return {
    kick: actorPower >= room.powerLevels.kick,
    ban: actorPower >= room.powerLevels.ban,
    unban: actorPower >= room.powerLevels.ban && member.membership === "ban",
  };
}
