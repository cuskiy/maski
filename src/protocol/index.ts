import type {
  BackupState,
  Connection,
  DeviceSession,
  GuestAccess,
  Invite,
  KeyGate,
  Media,
  Member,
  Membership,
  MessageEncryption,
  MessageKind,
  MessageRow,
  MessageStatus,
  NotificationLevel,
  PowerLevels,
  Preview,
  Reaction,
  ReplyRef,
  RoomEncryption,
  RoomHistoryVisibility,
  RoomJoinRule,
  RoomStatePatch,
  RoomSummary,
  RoomTag,
  SasPhase,
  SasState,
  SessionSummary,
  StickerImage,
  StickerPack,
  UndecryptableReason,
} from "../core/types.ts";
import { isRecord } from "../lib/json.ts";

export const PROTOCOL_VERSION = 1;

export type CommandName =
  | "start"
  | "login"
  | "loginToken"
  | "ssoUrl"
  | "register"
  | "logout"
  | "keyStatus"
  | "recover"
  | "open"
  | "older"
  | "send"
  | "retrySend"
  | "discardSend"
  | "markRead"
  | "members"
  | "devices"
  | "backupStatus"
  | "backupSetup"
  | "resetIdentity"
  | "react"
  | "edit"
  | "redact"
  | "typing"
  | "search"
  | "leaveRoom"
  | "setRoomTag"
  | "setNotification"
  | "setRoomState"
  | "inviteUser"
  | "joinRoom"
  | "answerInvite"
  | "createRoom"
  | "forward"
  | "memberAction"
  | "sendMedia"
  | "media"
  | "sasStart"
  | "sasAccept"
  | "sasConfirm"
  | "sasMismatch"
  | "sasCancel";
export type KeyStatus = KeyGate;
export type FailureCode =
  | "invalid"
  | "unknown-command"
  | "unavailable"
  | "auth"
  | "network"
  | "locked"
  | "not-signed-in"
  | "too-large"
  | "unsupported"
  | "corrupt"
  | "restart";

/** `thumbnail` feeds a row preview; `full` feeds the viewer and a file download. */
export type MediaVariant = "thumbnail" | "full";

/** The only media shape the main thread may receive: a worker-minted object URL and safe MIME. */
export interface MediaReply {
  readonly url: string;
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface CommandMap {
  readonly start: { readonly wasmUrl: string };
  readonly login: {
    readonly homeserver: string;
    readonly username: string;
    readonly password: string;
  };
  readonly loginToken: { readonly homeserver: string; readonly token: string };
  readonly ssoUrl: { readonly homeserver: string; readonly redirectUrl: string };
  readonly register: {
    readonly homeserver: string;
    readonly username: string;
    readonly password: string;
  };
  readonly logout: Record<string, never>;
  readonly keyStatus: Record<string, never>;
  readonly recover: { readonly recoveryKey: string; readonly passphrase: string };
  readonly open: { readonly roomId: string };
  readonly older: { readonly roomId: string };
  readonly send: {
    readonly roomId: string;
    readonly body: string;
    readonly html: string | null;
    readonly replyTo: string | null;
    readonly transactionId: string;
    readonly messageId: string;
    readonly kind: MessageKind;
    readonly media: Media | null;
  };
  readonly retrySend: { readonly roomId: string; readonly messageId: string };
  readonly discardSend: { readonly roomId: string; readonly messageId: string };
  readonly markRead: { readonly roomId: string; readonly eventId: string };
  readonly members: { readonly roomId: string };
  readonly devices: Record<string, never>;
  readonly backupStatus: Record<string, never>;
  readonly backupSetup: Record<string, never>;
  readonly resetIdentity: { readonly password: string };
  readonly react: { readonly roomId: string; readonly eventId: string; readonly key: string };
  readonly edit: {
    readonly roomId: string;
    readonly eventId: string;
    readonly body: string;
    readonly html: string | null;
  };
  readonly redact: { readonly roomId: string; readonly eventId: string };
  readonly typing: { readonly roomId: string; readonly typing: boolean };
  readonly search: {
    readonly roomIds: readonly string[];
    readonly query: string;
    readonly mediaKinds: readonly MessageKind[];
    readonly limit: number;
  };
  readonly leaveRoom: { readonly roomId: string };
  readonly setRoomTag: {
    readonly roomId: string;
    readonly tag: "m.favourite" | "m.lowpriority";
    readonly enabled: boolean;
  };
  readonly setNotification: {
    readonly roomId: string;
    readonly mode: NotificationLevel | "default";
  };
  readonly setRoomState: { readonly roomId: string; readonly patch: RoomStatePatch };
  readonly inviteUser: { readonly roomId: string; readonly userId: string };
  readonly joinRoom: { readonly roomIdOrAlias: string };
  readonly answerInvite: { readonly roomId: string; readonly accept: boolean };
  readonly createRoom: {
    readonly name: string;
    readonly topic: string;
    readonly directUserId: string | null;
  };
  readonly forward: {
    readonly targetRoomId: string;
    readonly sources: readonly { readonly roomId: string; readonly eventId: string }[];
  };
  readonly memberAction: {
    readonly roomId: string;
    readonly userId: string;
    readonly action: "kick" | "ban" | "unban";
  };
  /** The bytes stay a `Blob`; the worker validates, strips, encrypts and uploads them. */
  readonly sendMedia: {
    readonly roomId: string;
    readonly messageId: string;
    readonly transactionId: string;
    readonly caption: string;
    readonly html: string | null;
    readonly replyTo: string | null;
    readonly kind: "image" | "video" | "audio" | "file" | "sticker";
    readonly name: string;
    readonly file: Blob;
  };
  readonly media: {
    readonly roomId: string;
    readonly messageId: string;
    readonly variant: MediaVariant;
  };
  /** `deviceId` null starts own-user verification; a device id targets that device. */
  readonly sasStart: { readonly deviceId: string | null };
  readonly sasAccept: { readonly id: string };
  readonly sasConfirm: { readonly id: string };
  readonly sasMismatch: { readonly id: string };
  readonly sasCancel: { readonly id: string };
}

export interface RegisterResult {
  readonly session: SessionSummary;
  readonly recoveryKey: string | null;
  readonly key: KeyStatus;
}

export interface StartData {
  readonly session: SessionSummary | null;
  readonly connection: Connection;
  readonly key: KeyStatus;
}

export interface ReplyData {
  readonly start: StartData;
  readonly login: SessionSummary;
  readonly loginToken: SessionSummary;
  readonly ssoUrl: string;
  readonly register: RegisterResult;
  readonly logout: null;
  readonly keyStatus: KeyStatus;
  readonly recover: KeyStatus;
  readonly open: null;
  readonly older: null;
  readonly send: MessageRow;
  readonly retrySend: MessageRow;
  readonly discardSend: null;
  readonly markRead: null;
  readonly members: null;
  readonly devices: readonly DeviceSession[];
  readonly backupStatus: BackupState;
  readonly backupSetup: BackupState;
  readonly resetIdentity: string | null;
  readonly react: null;
  readonly edit: null;
  readonly redact: null;
  readonly typing: null;
  readonly search: readonly MessageRow[];
  readonly leaveRoom: null;
  readonly setRoomTag: null;
  readonly setNotification: null;
  readonly setRoomState: null;
  readonly inviteUser: null;
  readonly joinRoom: string;
  readonly answerInvite: string | null;
  readonly createRoom: string;
  readonly forward: null;
  readonly memberAction: null;
  readonly sendMedia: MessageRow;
  readonly media: MediaReply;
  readonly sasStart: SasState;
  readonly sasAccept: null;
  readonly sasConfirm: null;
  readonly sasMismatch: null;
  readonly sasCancel: null;
}

export interface EventMap {
  readonly session: SessionSummary | null;
  readonly keys: KeyStatus;
  readonly rooms: { readonly rooms: readonly RoomSummary[]; readonly loading: boolean };
  readonly window: {
    readonly roomId: string;
    readonly messages: readonly MessageRow[];
    readonly hasOlder: boolean;
    /** True when `messages` prepend an older page instead of describing the visible window. */
    readonly older: boolean;
    /** True when `messages` are changed rows to merge, not a replacement window. */
    readonly patch: boolean;
  };
  readonly members: { readonly roomId: string; readonly members: readonly Member[] };
  readonly devices: {
    /** Null keeps the last known rows; the failure code explains why they are stale. */
    readonly devices: readonly DeviceSession[] | null;
    readonly error: FailureCode | null;
  };
  readonly backup: BackupState;
  readonly invites: readonly Invite[];
  /** An ephemeral typing event replaces the whole user list; it is never stored. */
  readonly typing: { readonly roomId: string; readonly userIds: readonly string[] };
  readonly connection: Connection;
  readonly outbox: {
    readonly roomId: string;
    readonly messageId: string;
    /** The queued row and each later status; null removes the row after discard. */
    readonly row: MessageRow | null;
    readonly retryable: boolean;
  };
  /** Null means a worker-minted object URL was revoked and the row must resolve again. */
  readonly media: {
    readonly roomId: string;
    readonly messageId: string;
    readonly variant: MediaVariant;
    readonly url: string | null;
  };
  /** Every SAS transition, including one adopted after a worker restart. */
  readonly sas: SasState;
}

export type Command = {
  [K in CommandName]: { readonly id: number; readonly type: K; readonly payload: CommandMap[K] };
}[CommandName];

export type Reply = {
  [K in CommandName]:
    | { readonly id: number; readonly ok: true; readonly data: ReplyData[K] }
    | { readonly id: number; readonly ok: false; readonly code: FailureCode };
}[CommandName];

/** A reply whose `data` has crossed the envelope check but not yet the per-command guard. */
export type ReplyEnvelope =
  | { readonly id: number; readonly ok: true; readonly data: unknown }
  | { readonly id: number; readonly ok: false; readonly code: FailureCode };

export type Event = {
  [K in keyof EventMap]: { readonly type: K; readonly payload: EventMap[K] };
}[keyof EventMap];

const COMMANDS: ReadonlySet<string> = new Set<CommandName>([
  "start",
  "login",
  "loginToken",
  "ssoUrl",
  "register",
  "logout",
  "keyStatus",
  "recover",
  "open",
  "older",
  "send",
  "retrySend",
  "discardSend",
  "markRead",
  "members",
  "devices",
  "backupStatus",
  "backupSetup",
  "resetIdentity",
  "react",
  "edit",
  "redact",
  "typing",
  "search",
  "leaveRoom",
  "setRoomTag",
  "setNotification",
  "setRoomState",
  "inviteUser",
  "joinRoom",
  "answerInvite",
  "createRoom",
  "forward",
  "memberAction",
  "sendMedia",
  "media",
  "sasStart",
  "sasAccept",
  "sasConfirm",
  "sasMismatch",
  "sasCancel",
]);

const FAILURE_CODES: ReadonlySet<string> = new Set<FailureCode>([
  "invalid",
  "unknown-command",
  "unavailable",
  "auth",
  "network",
  "locked",
  "not-signed-in",
  "too-large",
  "unsupported",
  "corrupt",
  "restart",
]);

const EVENT_TYPES: ReadonlySet<string> = new Set<keyof EventMap>([
  "session",
  "keys",
  "rooms",
  "window",
  "members",
  "devices",
  "backup",
  "invites",
  "typing",
  "connection",
  "outbox",
  "media",
  "sas",
]);

const SAS_PHASES: ReadonlySet<string> = new Set<SasPhase>([
  "needs-accept",
  "requested",
  "ready",
  "started",
  "cancelled",
  "done",
]);

const ATTACHMENT_KINDS: ReadonlySet<string> = new Set(["image", "video", "audio", "file", "sticker"]);

const MEDIA_VARIANTS: ReadonlySet<string> = new Set(["thumbnail", "full"]);

const MESSAGE_KINDS: ReadonlySet<string> = new Set<MessageKind>([
  "text",
  "notice",
  "emote",
  "image",
  "sticker",
  "file",
  "audio",
  "video",
]);

const MESSAGE_STATUSES: ReadonlySet<string> = new Set<MessageStatus>(["sent", "queued", "sending", "failed"]);

const MEMBERSHIPS: ReadonlySet<string> = new Set<Membership>(["join", "invite", "leave", "ban", "knock"]);

const NOTIFICATION_LEVELS: ReadonlySet<string> = new Set<NotificationLevel>(["all", "mentions", "mute"]);

const JOIN_RULES: ReadonlySet<string> = new Set<RoomJoinRule>([
  "public",
  "invite",
  "knock",
  "restricted",
  "knock_restricted",
]);

const GUEST_ACCESS: ReadonlySet<string> = new Set<GuestAccess>(["can_join", "forbidden"]);

const HISTORY_VISIBILITY: ReadonlySet<string> = new Set<RoomHistoryVisibility>([
  "world_readable",
  "shared",
  "invited",
  "joined",
]);

const ROOM_ENCRYPTION: ReadonlySet<string> = new Set<RoomEncryption>(["none", "encrypted", "unknown"]);

const UNDECRYPTABLE_REASONS: ReadonlySet<string> = new Set<UndecryptableReason>(["missing-key", "corrupt"]);

const KEY_STATUSES: ReadonlySet<string> = new Set<KeyStatus>([
  "ready",
  "missing",
  "unknown",
  "needs-recovery",
  "needs-verification",
]);

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNull(value: unknown): value is null {
  return value === null;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is readonly T[] {
  return Array.isArray(value) && value.every((item: unknown) => guard(item));
}

function isInSet<T>(value: unknown, allowed: ReadonlySet<string>): value is T {
  return typeof value === "string" && allowed.has(value);
}

function isAttachmentKind(value: unknown): value is CommandMap["sendMedia"]["kind"] {
  return isInSet<CommandMap["sendMedia"]["kind"]>(value, ATTACHMENT_KINDS);
}

function isMediaVariant(value: unknown): value is MediaVariant {
  return isInSet<MediaVariant>(value, MEDIA_VARIANTS);
}

function validSasStart(fields: Record<string, unknown>): fields is CommandMap["sasStart"] {
  const deviceId = fields["deviceId"];
  return "deviceId" in fields && (deviceId === null || (isString(deviceId) && deviceId.length <= 255));
}

function validSasId(fields: Record<string, unknown>): fields is CommandMap["sasAccept"] {
  return isString(fields["id"]) && fields["id"].length <= 128;
}

/** The main thread only ever receives a worker-minted object URL for media. */
function isMediaReply(value: unknown): value is MediaReply {
  return (
    isRecord(value) &&
    isString(value["url"]) &&
    value["url"].startsWith("blob:") &&
    isString(value["mime"]) &&
    value["mime"].includes("/") &&
    isNumberOrNull(value["width"]) &&
    isNumberOrNull(value["height"])
  );
}

function isMediaPayload(value: unknown): value is EventMap["media"] {
  return (
    isRecord(value) &&
    isRoomId(value["roomId"]) &&
    isString(value["messageId"]) &&
    isMediaVariant(value["variant"]) &&
    (value["url"] === null || (isString(value["url"]) && value["url"].startsWith("blob:")))
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled protocol value ${String(value)}`);
}

function isCommandName(value: unknown): value is CommandName {
  return isInSet<CommandName>(value, COMMANDS);
}

export function isFailureCode(value: unknown): value is FailureCode {
  return isInSet<FailureCode>(value, FAILURE_CODES);
}

function isEventType(value: unknown): value is keyof EventMap {
  return isInSet<keyof EventMap>(value, EVENT_TYPES);
}

function isConnection(value: unknown): value is Connection {
  return value === "connecting" || value === "online" || value === "offline";
}

function isKeyStatus(value: unknown): value is KeyStatus {
  return isInSet<KeyStatus>(value, KEY_STATUSES);
}

function isMessageKind(value: unknown): value is MessageKind {
  return isInSet<MessageKind>(value, MESSAGE_KINDS);
}

function isMessageStatus(value: unknown): value is MessageStatus {
  return isInSet<MessageStatus>(value, MESSAGE_STATUSES);
}

function isMembership(value: unknown): value is Membership {
  return isInSet<Membership>(value, MEMBERSHIPS);
}

function isNotificationLevel(value: unknown): value is NotificationLevel {
  return isInSet<NotificationLevel>(value, NOTIFICATION_LEVELS);
}

function isJoinRule(value: unknown): value is RoomJoinRule {
  return isInSet<RoomJoinRule>(value, JOIN_RULES);
}

function isGuestAccess(value: unknown): value is GuestAccess {
  return isInSet<GuestAccess>(value, GUEST_ACCESS);
}

function isHistoryVisibility(value: unknown): value is RoomHistoryVisibility {
  return isInSet<RoomHistoryVisibility>(value, HISTORY_VISIBILITY);
}

function isRoomEncryption(value: unknown): value is RoomEncryption {
  return isInSet<RoomEncryption>(value, ROOM_ENCRYPTION);
}

function isUndecryptableReason(value: unknown): value is UndecryptableReason {
  return isInSet<UndecryptableReason>(value, UNDECRYPTABLE_REASONS);
}

function isSessionCapabilities(value: unknown): value is SessionSummary["capabilities"] {
  return (
    isRecord(value) &&
    isBoolean(value["recoveryKey"]) &&
    isBoolean(value["backup"]) &&
    isBoolean(value["signOut"]) &&
    isBoolean(value["signOutOthers"])
  );
}

function isStickerImage(value: unknown): value is StickerImage {
  return (
    isRecord(value) &&
    isString(value["shortcode"]) &&
    isString(value["body"]) &&
    isString(value["url"]) &&
    value["url"].startsWith("blob:") &&
    isNumberOrNull(value["width"]) &&
    isNumberOrNull(value["height"]) &&
    isStringOrNull(value["mime"])
  );
}

function isStickerPack(value: unknown): value is StickerPack {
  return (
    isRecord(value) && isString(value["id"]) && isString(value["name"]) && isArrayOf(value["images"], isStickerImage)
  );
}

function isSessionSummary(value: unknown): value is SessionSummary {
  return (
    isRecord(value) &&
    isString(value["userId"]) &&
    isText(value["displayName"]) &&
    isStringOrNull(value["avatar"]) &&
    isSessionCapabilities(value["capabilities"]) &&
    isArrayOf(value["stickerPacks"], isStickerPack)
  );
}

function isStartData(value: unknown): value is StartData {
  return (
    isRecord(value) &&
    (value["session"] === null || isSessionSummary(value["session"])) &&
    isConnection(value["connection"]) &&
    isKeyStatus(value["key"])
  );
}

function isRegisterResult(value: unknown): value is RegisterResult {
  return (
    isRecord(value) &&
    isSessionSummary(value["session"]) &&
    isStringOrNull(value["recoveryKey"]) &&
    isKeyStatus(value["key"])
  );
}

function isPreview(value: unknown): value is Preview {
  return isRecord(value) && (value["kind"] === "error" || isMessageKind(value["kind"])) && isText(value["body"]);
}

function isRoomTag(value: unknown): value is RoomTag {
  return isRecord(value) && (value["order"] === undefined || isText(value["order"]));
}

function isTagRecord(value: unknown): value is Readonly<Record<string, RoomTag>> {
  return isRecord(value) && Object.values(value).every((tag: unknown) => isRoomTag(tag));
}

function isPowerLevelRecord(value: unknown): value is Readonly<Record<string, number>> {
  return isRecord(value) && Object.values(value).every((level: unknown) => isNumber(level));
}

function isPowerLevels(value: unknown): value is PowerLevels {
  return (
    isRecord(value) &&
    isPowerLevelRecord(value["users"]) &&
    isNumber(value["usersDefault"]) &&
    isPowerLevelRecord(value["events"]) &&
    isNumber(value["eventsDefault"]) &&
    isNumber(value["stateDefault"]) &&
    isNumber(value["invite"]) &&
    isNumber(value["kick"]) &&
    isNumber(value["ban"]) &&
    isNumber(value["redact"]) &&
    isNumber(value["notificationsRoom"])
  );
}

export function isRoomSummary(value: unknown): value is RoomSummary {
  return (
    isRecord(value) &&
    isString(value["roomId"]) &&
    isText(value["name"]) &&
    isText(value["topic"]) &&
    isStringOrNull(value["avatar"]) &&
    (value["preview"] === null || isPreview(value["preview"])) &&
    isNumber(value["lastTs"]) &&
    isStringOrNull(value["latestEventId"]) &&
    isStringOrNull(value["readReceipt"]) &&
    isStringOrNull(value["fullyRead"]) &&
    isNumber(value["unread"]) &&
    isNumber(value["highlight"]) &&
    isMembership(value["membership"]) &&
    isStringOrNull(value["roomType"]) &&
    isStringOrNull(value["directUserId"]) &&
    isStringOrNull(value["spaceId"]) &&
    isTagRecord(value["tags"]) &&
    isArrayOf(value["aliases"], isText) &&
    isJoinRule(value["joinRule"]) &&
    isGuestAccess(value["guestAccess"]) &&
    isHistoryVisibility(value["historyVisibility"]) &&
    isBoolean(value["directoryPublished"]) &&
    isText(value["roomVersion"]) &&
    isBoolean(value["federated"]) &&
    (value["notification"] === "default" || isNotificationLevel(value["notification"])) &&
    isRoomEncryption(value["encryption"]) &&
    isArrayOf(value["creatorIds"], isString) &&
    isPowerLevels(value["powerLevels"])
  );
}

function isMedia(value: unknown): value is Media {
  if (!isRecord(value)) return false;
  const kind = value["kind"];
  return (
    (kind === "image" || kind === "video" || kind === "file" || kind === "audio" || kind === "sticker") &&
    isText(value["name"]) &&
    isNumberOrNull(value["width"]) &&
    isNumberOrNull(value["height"]) &&
    isNumberOrNull(value["size"]) &&
    isStringOrNull(value["url"])
  );
}

function isReaction(value: unknown): value is Reaction {
  return isRecord(value) && isText(value["key"]) && isNumber(value["count"]) && isBoolean(value["mine"]);
}

function isReplyRef(value: unknown): value is ReplyRef {
  return isRecord(value) && isText(value["messageId"]) && isText(value["senderName"]) && isText(value["body"]);
}

function isMessageEncryption(value: unknown): value is MessageEncryption {
  if (!isRecord(value)) return false;
  if (value["state"] === "ok") return true;
  return value["state"] === "undecryptable" && isUndecryptableReason(value["reason"]);
}

export function isMessageRow(value: unknown): value is MessageRow {
  return (
    isRecord(value) &&
    isText(value["id"]) &&
    isStringOrNull(value["eventId"]) &&
    isStringOrNull(value["transactionId"]) &&
    isString(value["roomId"]) &&
    isText(value["sender"]) &&
    isText(value["senderName"]) &&
    isStringOrNull(value["senderAvatar"]) &&
    isNumber(value["ts"]) &&
    isBoolean(value["own"]) &&
    isMessageKind(value["kind"]) &&
    isText(value["body"]) &&
    isStringOrNull(value["html"]) &&
    (value["media"] === null || isMedia(value["media"])) &&
    isArrayOf(value["reactions"], isReaction) &&
    (value["reply"] === null || isReplyRef(value["reply"])) &&
    isArrayOf(value["mentions"], isText) &&
    isBoolean(value["edited"]) &&
    isBoolean(value["redacted"]) &&
    isMessageStatus(value["status"]) &&
    (value["error"] === null || isFailureCode(value["error"])) &&
    isBoolean(value["retryable"]) &&
    isBoolean(value["system"]) &&
    isMessageEncryption(value["encryption"])
  );
}

function isMessageRows(value: unknown): value is readonly MessageRow[] {
  return isArrayOf(value, isMessageRow);
}

function isMember(value: unknown): value is Member {
  return (
    isRecord(value) &&
    isString(value["userId"]) &&
    isText(value["displayName"]) &&
    isStringOrNull(value["avatar"]) &&
    isBoolean(value["profile"]) &&
    isMembership(value["membership"])
  );
}

function isDeviceSession(value: unknown): value is DeviceSession {
  if (!isRecord(value)) return false;
  const capabilities = value["capabilities"];
  return (
    isString(value["id"]) &&
    isText(value["name"]) &&
    isText(value["lastSeen"]) &&
    isBoolean(value["verified"]) &&
    isBoolean(value["current"]) &&
    isRecord(capabilities) &&
    isBoolean(capabilities["verify"]) &&
    isBoolean(capabilities["signOut"])
  );
}

function isDeviceList(value: unknown): value is readonly DeviceSession[] {
  return isArrayOf(value, isDeviceSession);
}

function isDevicesPayload(value: unknown): value is EventMap["devices"] {
  if (!isRecord(value)) return false;
  return (
    (value["devices"] === null || isArrayOf(value["devices"], isDeviceSession)) &&
    (value["error"] === null || isFailureCode(value["error"]))
  );
}

function isBackupState(value: unknown): value is BackupState {
  return (
    isRecord(value) &&
    isStringOrNull(value["version"]) &&
    isBoolean(value["trusted"]) &&
    isBoolean(value["matchesDecryptionKey"]) &&
    isBoolean(value["enabled"]) &&
    isStringOrNull(value["error"])
  );
}

function isSasPhase(value: unknown): value is SasPhase {
  return isInSet<SasPhase>(value, SAS_PHASES);
}

function isSasDecimal(value: unknown): value is SasState["decimal"] {
  return (
    value === null || (Array.isArray(value) && value.length === 3 && value.every((entry: unknown) => isNumber(entry)))
  );
}

function isSasState(value: unknown): value is SasState {
  if (!isRecord(value)) return false;
  const emoji = value["emoji"];
  return (
    isString(value["id"]) &&
    value["id"].length <= 128 &&
    isUserId(value["otherUserId"]) &&
    (value["otherDeviceId"] === null || (isString(value["otherDeviceId"]) && value["otherDeviceId"].length <= 255)) &&
    isBoolean(value["isSelfVerification"]) &&
    isSasPhase(value["phase"]) &&
    (emoji === null || (isArrayOf(emoji, isString) && emoji.length > 0 && emoji.length <= 7)) &&
    isSasDecimal(value["decimal"]) &&
    isStringOrNull(value["cancellationCode"])
  );
}

function isInvite(value: unknown): value is Invite {
  if (!isRecord(value)) return false;
  const capabilities = value["capabilities"];
  return (
    isRoomId(value["roomId"]) &&
    isText(value["name"]) &&
    isText(value["topic"]) &&
    isStringOrNull(value["avatar"]) &&
    isText(value["inviter"]) &&
    isString(value["inviterId"]) &&
    isStringOrNull(value["directUserId"]) &&
    isStringOrNull(value["roomType"]) &&
    isJoinRule(value["joinRule"]) &&
    isGuestAccess(value["guestAccess"]) &&
    isHistoryVisibility(value["historyVisibility"]) &&
    isRoomEncryption(value["encryption"]) &&
    isText(value["roomVersion"]) &&
    isBoolean(value["federated"]) &&
    isRecord(capabilities) &&
    isBoolean(capabilities["accept"]) &&
    isBoolean(capabilities["decline"])
  );
}

function isInvitesPayload(value: unknown): value is EventMap["invites"] {
  return isArrayOf(value, isInvite);
}

function isRoomsPayload(value: unknown): value is EventMap["rooms"] {
  return isRecord(value) && isArrayOf(value["rooms"], isRoomSummary) && isBoolean(value["loading"]);
}

function isWindowPayload(value: unknown): value is EventMap["window"] {
  return (
    isRecord(value) &&
    isString(value["roomId"]) &&
    isArrayOf(value["messages"], isMessageRow) &&
    isBoolean(value["hasOlder"]) &&
    isBoolean(value["older"]) &&
    isBoolean(value["patch"])
  );
}

function isMembersPayload(value: unknown): value is EventMap["members"] {
  return isRecord(value) && isString(value["roomId"]) && isArrayOf(value["members"], isMember);
}

function isTypingPayload(value: unknown): value is EventMap["typing"] {
  return isRecord(value) && isString(value["roomId"]) && isArrayOf(value["userIds"], isString);
}

const ROOM_TAGS: ReadonlySet<string> = new Set(["m.favourite", "m.lowpriority"]);

const NOTIFICATION_MODES: ReadonlySet<string> = new Set(["default", "all", "mentions", "mute"]);

const MEMBER_ACTIONS: ReadonlySet<string> = new Set(["kick", "ban", "unban"]);

function isRoomTagName(value: unknown): value is CommandMap["setRoomTag"]["tag"] {
  return isInSet<CommandMap["setRoomTag"]["tag"]>(value, ROOM_TAGS);
}

function isNotificationMode(value: unknown): value is CommandMap["setNotification"]["mode"] {
  return isInSet<CommandMap["setNotification"]["mode"]>(value, NOTIFICATION_MODES);
}

function isMemberAction(value: unknown): value is CommandMap["memberAction"]["action"] {
  return isInSet<CommandMap["memberAction"]["action"]>(value, MEMBER_ACTIONS);
}

function isForwardSource(value: unknown): value is CommandMap["forward"]["sources"][number] {
  return isRecord(value) && isRoomId(value["roomId"]) && isString(value["eventId"]);
}

function isRoomStatePatch(value: unknown): value is RoomStatePatch {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  for (const key of keys) {
    const entry = value[key];
    if (key === "name" || key === "topic") {
      if (!isText(entry) || entry.length > (key === "name" ? 255 : 1024)) return false;
      continue;
    }
    if (key === "aliases") {
      if (!isArrayOf(entry, isAlias)) return false;
      continue;
    }
    if (key === "joinRule") {
      if (!isJoinRule(entry)) return false;
      continue;
    }
    if (key === "guestAccess") {
      if (!isGuestAccess(entry)) return false;
      continue;
    }
    if (key === "historyVisibility") {
      if (!isHistoryVisibility(entry)) return false;
      continue;
    }
    if (key === "directoryPublished") {
      if (!isBoolean(entry)) return false;
      continue;
    }
    return false;
  }
  return true;
}

function isOutboxPayload(value: unknown): value is EventMap["outbox"] {
  return (
    isRecord(value) &&
    isString(value["roomId"]) &&
    isString(value["messageId"]) &&
    (value["row"] === null || isMessageRow(value["row"])) &&
    isBoolean(value["retryable"])
  );
}

/** The per-command guard for `Reply.data`; a reply is only typed once its data passes it. */
export const REPLY_DATA_GUARDS: {
  readonly [K in CommandName]: (value: unknown) => value is ReplyData[K];
} = {
  start: isStartData,
  login: isSessionSummary,
  loginToken: isSessionSummary,
  ssoUrl: isString,
  register: isRegisterResult,
  logout: isNull,
  keyStatus: isKeyStatus,
  recover: isKeyStatus,
  open: isNull,
  older: isNull,
  send: isMessageRow,
  retrySend: isMessageRow,
  discardSend: isNull,
  markRead: isNull,
  members: isNull,
  devices: isDeviceList,
  backupStatus: isBackupState,
  backupSetup: isBackupState,
  resetIdentity: isStringOrNull,
  react: isNull,
  edit: isNull,
  redact: isNull,
  typing: isNull,
  search: isMessageRows,
  leaveRoom: isNull,
  setRoomTag: isNull,
  setNotification: isNull,
  setRoomState: isNull,
  inviteUser: isNull,
  joinRoom: isString,
  answerInvite: isStringOrNull,
  createRoom: isString,
  forward: isNull,
  memberAction: isNull,
  sendMedia: isMessageRow,
  media: isMediaReply,
  sasStart: isSasState,
  sasAccept: isNull,
  sasConfirm: isNull,
  sasMismatch: isNull,
  sasCancel: isNull,
};

export function parseReply(value: unknown): ReplyEnvelope | null {
  if (!isRecord(value)) return null;
  const id = value["id"];
  const ok = value["ok"];
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return null;
  if (ok === true) {
    if (!("data" in value)) return null;
    return { id, ok: true, data: value["data"] };
  }
  if (ok !== false) return null;
  const code = value["code"];
  if (!isFailureCode(code)) return null;
  return { id, ok: false, code };
}

export function parseEvent(value: unknown): Event | null {
  if (!isRecord(value)) return null;
  const type = value["type"];
  if (!isEventType(type)) return null;
  const payload = value["payload"];
  switch (type) {
    case "session":
      return payload === null || isSessionSummary(payload) ? { type, payload } : null;
    case "keys":
      return isKeyStatus(payload) ? { type, payload } : null;
    case "rooms":
      return isRoomsPayload(payload) ? { type, payload } : null;
    case "window":
      return isWindowPayload(payload) ? { type, payload } : null;
    case "members":
      return isMembersPayload(payload) ? { type, payload } : null;
    case "devices":
      return isDevicesPayload(payload) ? { type, payload } : null;
    case "backup":
      return isBackupState(payload) ? { type, payload } : null;
    case "invites":
      return isInvitesPayload(payload) ? { type, payload } : null;
    case "typing":
      return isTypingPayload(payload) ? { type, payload } : null;
    case "connection":
      return isConnection(payload) ? { type, payload } : null;
    case "outbox":
      return isOutboxPayload(payload) ? { type, payload } : null;
    case "media":
      return isMediaPayload(payload) ? { type, payload } : null;
    case "sas":
      return isSasState(payload) ? { type, payload } : null;
    default:
      return assertNever(type);
  }
}

function isRoomId(value: unknown): value is string {
  return isString(value) && value.startsWith("!");
}

function validStart(fields: Record<string, unknown>): fields is CommandMap["start"] {
  return isString(fields["wasmUrl"]);
}

function validLogin(fields: Record<string, unknown>): fields is CommandMap["login"] {
  return (
    isString(fields["homeserver"]) &&
    isString(fields["username"]) &&
    isString(fields["password"]) &&
    fields["username"].length <= 255 &&
    fields["password"].length <= 4096 &&
    fields["homeserver"].length <= 2048
  );
}

function validLoginToken(fields: Record<string, unknown>): fields is CommandMap["loginToken"] {
  return (
    isString(fields["homeserver"]) &&
    fields["homeserver"].length <= 2048 &&
    isString(fields["token"]) &&
    fields["token"].length <= 8192
  );
}

function validSsoUrl(fields: Record<string, unknown>): fields is CommandMap["ssoUrl"] {
  return (
    isString(fields["homeserver"]) &&
    fields["homeserver"].length <= 2048 &&
    isString(fields["redirectUrl"]) &&
    fields["redirectUrl"].length <= 2048
  );
}

function validRoom(fields: Record<string, unknown>): fields is { roomId: string } {
  return isRoomId(fields["roomId"]);
}

function validRecover(fields: Record<string, unknown>): fields is CommandMap["recover"] {
  return (
    isText(fields["recoveryKey"]) &&
    fields["recoveryKey"].length <= 512 &&
    isText(fields["passphrase"]) &&
    fields["passphrase"].length <= 1024
  );
}

function validSend(fields: Record<string, unknown>): fields is CommandMap["send"] {
  const html = fields["html"];
  const replyTo = fields["replyTo"];
  const media = fields["media"];
  return (
    isRoomId(fields["roomId"]) &&
    isText(fields["body"]) &&
    fields["body"].length <= 65536 &&
    (html === null || (isString(html) && html.length <= 65536)) &&
    (replyTo === null || isString(replyTo)) &&
    isString(fields["transactionId"]) &&
    fields["transactionId"].length <= 128 &&
    isString(fields["messageId"]) &&
    fields["messageId"].length <= 128 &&
    isMessageKind(fields["kind"]) &&
    (media === null || isMedia(media))
  );
}

function validOutboxCommand(fields: Record<string, unknown>): fields is { roomId: string; messageId: string } {
  return isRoomId(fields["roomId"]) && isString(fields["messageId"]) && fields["messageId"].length <= 128;
}

function validMarkRead(fields: Record<string, unknown>): fields is CommandMap["markRead"] {
  return isRoomId(fields["roomId"]) && isString(fields["eventId"]);
}

function isEventId(value: unknown): value is string {
  return isString(value) && value.length <= 255;
}

function isUserId(value: unknown): value is string {
  return isString(value) && value.startsWith("@") && value.includes(":") && value.length <= 255;
}

function isRoomIdOrAlias(value: unknown): value is string {
  return (
    isString(value) && value.length <= 255 && (value.startsWith("!") || value.startsWith("#")) && value.includes(":")
  );
}

function isAlias(value: unknown): value is string {
  return isString(value) && value.startsWith("#") && value.includes(":") && value.length <= 255;
}

function validReact(fields: Record<string, unknown>): fields is CommandMap["react"] {
  return (
    isRoomId(fields["roomId"]) && isEventId(fields["eventId"]) && isString(fields["key"]) && fields["key"].length <= 256
  );
}

function validEdit(fields: Record<string, unknown>): fields is CommandMap["edit"] {
  const html = fields["html"];
  return (
    isRoomId(fields["roomId"]) &&
    isEventId(fields["eventId"]) &&
    isText(fields["body"]) &&
    fields["body"].length <= 65536 &&
    (html === null || (isString(html) && html.length <= 65536))
  );
}

function validRedact(fields: Record<string, unknown>): fields is CommandMap["redact"] {
  return isRoomId(fields["roomId"]) && isEventId(fields["eventId"]);
}

function validTyping(fields: Record<string, unknown>): fields is CommandMap["typing"] {
  return isRoomId(fields["roomId"]) && isBoolean(fields["typing"]);
}

const SEARCH_LIMIT = 100;

function validSearch(fields: Record<string, unknown>): fields is CommandMap["search"] {
  const roomIds = fields["roomIds"];
  const mediaKinds = fields["mediaKinds"];
  const limit = fields["limit"];
  return (
    isArrayOf(roomIds, isRoomId) &&
    roomIds.length > 0 &&
    roomIds.length <= SEARCH_LIMIT &&
    isText(fields["query"]) &&
    fields["query"].length <= 512 &&
    isArrayOf(mediaKinds, isMessageKind) &&
    isNumber(limit) &&
    Number.isSafeInteger(limit) &&
    limit >= 1 &&
    limit <= SEARCH_LIMIT
  );
}

function validSetRoomTag(fields: Record<string, unknown>): fields is CommandMap["setRoomTag"] {
  return isRoomId(fields["roomId"]) && isRoomTagName(fields["tag"]) && isBoolean(fields["enabled"]);
}

function validSetNotification(fields: Record<string, unknown>): fields is CommandMap["setNotification"] {
  return isRoomId(fields["roomId"]) && isNotificationMode(fields["mode"]);
}

function validSetRoomState(fields: Record<string, unknown>): fields is CommandMap["setRoomState"] {
  return isRoomId(fields["roomId"]) && isRoomStatePatch(fields["patch"]);
}

function validInviteUser(fields: Record<string, unknown>): fields is CommandMap["inviteUser"] {
  return isRoomId(fields["roomId"]) && isUserId(fields["userId"]);
}

function validJoinRoom(fields: Record<string, unknown>): fields is CommandMap["joinRoom"] {
  return isRoomIdOrAlias(fields["roomIdOrAlias"]);
}

function validAnswerInvite(fields: Record<string, unknown>): fields is CommandMap["answerInvite"] {
  return isRoomId(fields["roomId"]) && isBoolean(fields["accept"]);
}

function validCreateRoom(fields: Record<string, unknown>): fields is CommandMap["createRoom"] {
  const directUserId = fields["directUserId"];
  return (
    isString(fields["name"]) &&
    fields["name"].length <= 255 &&
    isText(fields["topic"]) &&
    fields["topic"].length <= 1024 &&
    (directUserId === null || isUserId(directUserId))
  );
}

function validForward(fields: Record<string, unknown>): fields is CommandMap["forward"] {
  const sources = fields["sources"];
  return (
    isRoomId(fields["targetRoomId"]) &&
    isArrayOf(sources, isForwardSource) &&
    sources.length > 0 &&
    sources.length <= 50
  );
}

function validMemberAction(fields: Record<string, unknown>): fields is CommandMap["memberAction"] {
  return isRoomId(fields["roomId"]) && isUserId(fields["userId"]) && isMemberAction(fields["action"]);
}

function validSendMedia(fields: Record<string, unknown>): fields is CommandMap["sendMedia"] {
  const html = fields["html"];
  const replyTo = fields["replyTo"];
  const file = fields["file"];
  return (
    isRoomId(fields["roomId"]) &&
    isString(fields["messageId"]) &&
    fields["messageId"].length <= 128 &&
    isString(fields["transactionId"]) &&
    fields["transactionId"].length <= 128 &&
    isText(fields["caption"]) &&
    fields["caption"].length <= 65536 &&
    (html === null || (isString(html) && html.length <= 65536)) &&
    (replyTo === null || isString(replyTo)) &&
    isAttachmentKind(fields["kind"]) &&
    isString(fields["name"]) &&
    fields["name"].length <= 255 &&
    file instanceof Blob &&
    file.size > 0
  );
}

function validMediaCommand(fields: Record<string, unknown>): fields is CommandMap["media"] {
  return (
    isRoomId(fields["roomId"]) &&
    isString(fields["messageId"]) &&
    fields["messageId"].length <= 128 &&
    isMediaVariant(fields["variant"])
  );
}

/** Copies only the present patch fields, so an absent field never becomes `undefined`. */
function parseRoomStatePatch(value: unknown): RoomStatePatch | null {
  if (!isRoomStatePatch(value)) return null;
  const patch: {
    name?: string;
    topic?: string;
    aliases?: readonly string[];
    joinRule?: RoomJoinRule;
    guestAccess?: GuestAccess;
    historyVisibility?: RoomHistoryVisibility;
    directoryPublished?: boolean;
  } = {};
  if (value.name !== undefined) patch.name = value.name;
  if (value.topic !== undefined) patch.topic = value.topic;
  if (value.aliases !== undefined) patch.aliases = value.aliases;
  if (value.joinRule !== undefined) patch.joinRule = value.joinRule;
  if (value.guestAccess !== undefined) patch.guestAccess = value.guestAccess;
  if (value.historyVisibility !== undefined) patch.historyVisibility = value.historyVisibility;
  if (value.directoryPublished !== undefined) patch.directoryPublished = value.directoryPublished;
  return patch;
}

function empty(fields: Record<string, unknown>): fields is Record<string, never> {
  return Object.keys(fields).length === 0;
}

export function parseCommand(value: unknown): Command | null {
  if (!isRecord(value)) return null;
  const id = value["id"];
  const type = value["type"];
  const payload = value["payload"];
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return null;
  if (!isCommandName(type)) return null;
  if (!isRecord(payload)) return null;
  const fields = payload;

  switch (type) {
    case "start":
      if (!validStart(fields)) return null;
      return { id, type, payload: { wasmUrl: fields.wasmUrl } };
    case "login":
      if (!validLogin(fields)) return null;
      return {
        id,
        type,
        payload: {
          homeserver: fields.homeserver,
          username: fields.username,
          password: fields.password,
        },
      };
    case "loginToken":
      if (!validLoginToken(fields)) return null;
      return {
        id,
        type,
        payload: { homeserver: fields.homeserver, token: fields.token },
      };
    case "ssoUrl":
      if (!validSsoUrl(fields)) return null;
      return {
        id,
        type,
        payload: { homeserver: fields.homeserver, redirectUrl: fields.redirectUrl },
      };
    case "register":
      if (!validLogin(fields)) return null;
      return {
        id,
        type,
        payload: {
          homeserver: fields.homeserver,
          username: fields.username,
          password: fields.password,
        },
      };
    case "logout":
      if (!empty(fields)) return null;
      return { id, type, payload: {} };
    case "keyStatus":
      if (!empty(fields)) return null;
      return { id, type, payload: {} };
    case "recover":
      if (!validRecover(fields)) return null;
      return {
        id,
        type,
        payload: { recoveryKey: fields.recoveryKey, passphrase: fields.passphrase },
      };
    case "open":
    case "older":
    case "members":
      if (!validRoom(fields)) return null;
      return { id, type, payload: { roomId: fields.roomId } };
    case "devices":
    case "backupStatus":
    case "backupSetup":
      if (!empty(fields)) return null;
      return { id, type, payload: {} };
    case "send":
      if (!validSend(fields)) return null;
      return {
        id,
        type,
        payload: {
          roomId: fields.roomId,
          body: fields.body,
          html: fields.html,
          replyTo: fields.replyTo,
          transactionId: fields.transactionId,
          messageId: fields.messageId,
          kind: fields.kind,
          media: fields.media,
        },
      };
    case "retrySend":
    case "discardSend":
      if (!validOutboxCommand(fields)) return null;
      return { id, type, payload: { roomId: fields.roomId, messageId: fields.messageId } };
    case "markRead":
      if (!validMarkRead(fields)) return null;
      return { id, type, payload: { roomId: fields.roomId, eventId: fields.eventId } };
    case "resetIdentity":
      if (!isString(fields["password"]) || fields["password"].length > 4096) return null;
      return { id, type, payload: { password: fields["password"] } };
    case "react":
      if (!validReact(fields)) return null;
      return {
        id,
        type,
        payload: { roomId: fields.roomId, eventId: fields.eventId, key: fields.key },
      };
    case "edit":
      if (!validEdit(fields)) return null;
      return {
        id,
        type,
        payload: { roomId: fields.roomId, eventId: fields.eventId, body: fields.body, html: fields.html },
      };
    case "redact":
      if (!validRedact(fields)) return null;
      return { id, type, payload: { roomId: fields.roomId, eventId: fields.eventId } };
    case "typing":
      if (!validTyping(fields)) return null;
      return { id, type, payload: { roomId: fields.roomId, typing: fields.typing } };
    case "search":
      if (!validSearch(fields)) return null;
      return {
        id,
        type,
        payload: {
          roomIds: fields.roomIds,
          query: fields.query,
          mediaKinds: fields.mediaKinds,
          limit: fields.limit,
        },
      };
    case "leaveRoom":
      if (!validRoom(fields)) return null;
      return { id, type, payload: { roomId: fields.roomId } };
    case "setRoomTag":
      if (!validSetRoomTag(fields)) return null;
      return { id, type, payload: { roomId: fields.roomId, tag: fields.tag, enabled: fields.enabled } };
    case "setNotification":
      if (!validSetNotification(fields)) return null;
      return { id, type, payload: { roomId: fields.roomId, mode: fields.mode } };
    case "setRoomState": {
      if (!validSetRoomState(fields)) return null;
      const patch = parseRoomStatePatch(fields.patch);
      if (patch === null) return null;
      return { id, type, payload: { roomId: fields.roomId, patch } };
    }
    case "inviteUser":
      if (!validInviteUser(fields)) return null;
      return { id, type, payload: { roomId: fields.roomId, userId: fields.userId } };
    case "joinRoom":
      if (!validJoinRoom(fields)) return null;
      return { id, type, payload: { roomIdOrAlias: fields.roomIdOrAlias } };
    case "answerInvite":
      if (!validAnswerInvite(fields)) return null;
      return { id, type, payload: { roomId: fields.roomId, accept: fields.accept } };
    case "createRoom":
      if (!validCreateRoom(fields)) return null;
      return {
        id,
        type,
        payload: { name: fields.name, topic: fields.topic, directUserId: fields.directUserId },
      };
    case "forward":
      if (!validForward(fields)) return null;
      return {
        id,
        type,
        payload: {
          targetRoomId: fields.targetRoomId,
          sources: fields.sources.map((source) => ({ roomId: source.roomId, eventId: source.eventId })),
        },
      };
    case "memberAction":
      if (!validMemberAction(fields)) return null;
      return {
        id,
        type,
        payload: { roomId: fields.roomId, userId: fields.userId, action: fields.action },
      };
    case "sendMedia":
      if (!validSendMedia(fields)) return null;
      return {
        id,
        type,
        payload: {
          roomId: fields.roomId,
          messageId: fields.messageId,
          transactionId: fields.transactionId,
          caption: fields.caption,
          html: fields.html,
          replyTo: fields.replyTo,
          kind: fields.kind,
          name: fields.name,
          file: fields.file,
        },
      };
    case "media":
      if (!validMediaCommand(fields)) return null;
      return {
        id,
        type,
        payload: { roomId: fields.roomId, messageId: fields.messageId, variant: fields.variant },
      };
    case "sasStart":
      if (!validSasStart(fields)) return null;
      return { id, type, payload: { deviceId: fields.deviceId } };
    case "sasAccept":
    case "sasConfirm":
    case "sasMismatch":
    case "sasCancel":
      if (!validSasId(fields)) return null;
      return { id, type, payload: { id: fields.id } };
    default:
      return null;
  }
}
