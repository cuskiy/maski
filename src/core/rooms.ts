import type {
  GuestAccess,
  Invite,
  Membership,
  NotificationLevel,
  PowerLevels,
  RoomEncryption,
  RoomHistoryVisibility,
  RoomJoinRule,
  RoomSummary,
  RoomTag,
} from "./types.ts";
import { DEFAULT_POWER_LEVELS } from "./permissions.ts";

export interface RoomInput {
  readonly roomId: string;
  readonly name: string;
  readonly topic: string;
  readonly avatar?: string | null;
  readonly directUserId?: string | null;
  readonly roomType?: string | null;
  readonly spaceId?: string | null;
  readonly tags?: Readonly<Record<string, RoomTag>>;
  readonly membership?: Membership;
  readonly notification?: NotificationLevel | "default";
  readonly encryption?: RoomEncryption;
  readonly joinRule?: RoomJoinRule;
  readonly guestAccess?: GuestAccess;
  readonly historyVisibility?: RoomHistoryVisibility;
  readonly directoryPublished?: boolean;
  readonly roomVersion?: string;
  readonly federated?: boolean;
  readonly aliases?: readonly string[];
  readonly creatorIds?: readonly string[];
  readonly powerLevels?: PowerLevels;
  readonly readReceipt?: string | null;
  readonly fullyRead?: string | null;
  readonly latestEventId?: string | null;
}

export function createRoom(input: RoomInput): RoomSummary {
  return {
    roomId: input.roomId,
    name: input.name,
    topic: input.topic,
    avatar: input.avatar ?? null,
    preview: null,
    lastTs: Date.now(),
    latestEventId: input.latestEventId ?? null,
    readReceipt: input.readReceipt ?? null,
    fullyRead: input.fullyRead ?? input.readReceipt ?? null,
    unread: 0,
    highlight: 0,
    membership: input.membership ?? "join",
    roomType: input.roomType ?? null,
    directUserId: input.directUserId ?? null,
    spaceId: input.spaceId ?? null,
    tags: input.tags ?? {},
    aliases: input.aliases ?? [],
    joinRule: input.joinRule ?? "invite",
    guestAccess: input.guestAccess ?? "forbidden",
    historyVisibility: input.historyVisibility ?? "shared",
    directoryPublished: input.directoryPublished ?? false,
    roomVersion: input.roomVersion ?? "12",
    federated: input.federated ?? true,
    notification: input.notification ?? "default",
    encryption: input.encryption ?? "encrypted",
    creatorIds: input.creatorIds ?? [],
    powerLevels: input.powerLevels ?? DEFAULT_POWER_LEVELS,
  };
}

export function roomFromInvite(invite: Invite): RoomSummary {
  return createRoom({
    roomId: invite.roomId,
    name: invite.name,
    topic: invite.topic,
    avatar: invite.avatar,
    directUserId: invite.directUserId,
    roomType: invite.roomType,
    joinRule: invite.joinRule,
    guestAccess: invite.guestAccess,
    historyVisibility: invite.historyVisibility,
    encryption: invite.encryption,
    roomVersion: invite.roomVersion,
    federated: invite.federated,
  });
}

export function isSpaceRoom(room: RoomSummary): boolean {
  return room.roomType === "m.space";
}

export function isDirectRoom(room: RoomSummary): boolean {
  return room.directUserId !== null;
}

export function hasTag(room: RoomSummary, tag: "m.favourite" | "m.lowpriority"): boolean {
  return Object.prototype.hasOwnProperty.call(room.tags, tag);
}

export function isMuted(room: RoomSummary): boolean {
  return room.notification === "mute";
}

const NOTIFICATION_LEVELS: ReadonlySet<string> = new Set<NotificationLevel>(["all", "mentions", "mute"]);

const JOIN_RULES: ReadonlySet<string> = new Set<RoomJoinRule>([
  "public",
  "invite",
  "knock",
  "restricted",
  "knock_restricted",
]);

const HISTORY_VISIBILITIES: ReadonlySet<string> = new Set<RoomHistoryVisibility>([
  "world_readable",
  "shared",
  "invited",
  "joined",
]);

/** A global notification level from a select value. */
export function isNotificationLevel(value: unknown): value is NotificationLevel {
  return typeof value === "string" && NOTIFICATION_LEVELS.has(value);
}

/** A room notification level from a select value, including the account default. */
export function isRoomNotification(value: unknown): value is NotificationLevel | "default" {
  return value === "default" || isNotificationLevel(value);
}

/** A join rule from a select value or the SDK. */
export function isRoomJoinRule(value: unknown): value is RoomJoinRule {
  return typeof value === "string" && JOIN_RULES.has(value);
}

/** A history visibility from a select value. */
export function isHistoryVisibility(value: unknown): value is RoomHistoryVisibility {
  return typeof value === "string" && HISTORY_VISIBILITIES.has(value);
}
