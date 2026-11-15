import type {
  Connection,
  GuestAccess,
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
  RoomSummary,
  RoomTag,
  SessionSummary,
  UndecryptableReason,
} from "../core/types.ts";
import { isRecord } from "../lib/json.ts";

export const PROTOCOL_VERSION = 1;

export type CommandName =
  | "start"
  | "login"
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
  | "resetIdentity";
export type KeyStatus = KeyGate;
export type FailureCode =
  "invalid" | "unknown-command" | "unavailable" | "auth" | "network" | "locked" | "not-signed-in";

export interface CommandMap {
  readonly start: { readonly wasmUrl: string };
  readonly login: {
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
  readonly resetIdentity: { readonly password: string };
}

export interface StartData {
  readonly session: SessionSummary | null;
  readonly connection: Connection;
  readonly key: KeyStatus;
}

export interface ReplyData {
  readonly start: StartData;
  readonly login: SessionSummary;
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
  readonly resetIdentity: string | null;
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
  readonly connection: Connection;
  readonly outbox: {
    readonly roomId: string;
    readonly messageId: string;
    /** The queued row and each later status; null removes the row after discard. */
    readonly row: MessageRow | null;
    readonly retryable: boolean;
  };
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
  "resetIdentity",
]);

const FAILURE_CODES: ReadonlySet<string> = new Set<FailureCode>([
  "invalid",
  "unknown-command",
  "unavailable",
  "auth",
  "network",
  "locked",
  "not-signed-in",
]);

const EVENT_TYPES: ReadonlySet<string> = new Set<keyof EventMap>([
  "session",
  "keys",
  "rooms",
  "window",
  "members",
  "connection",
  "outbox",
]);

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

function assertNever(value: never): never {
  throw new Error(`Unhandled protocol value ${String(value)}`);
}

function isCommandName(value: unknown): value is CommandName {
  return isInSet<CommandName>(value, COMMANDS);
}

function isFailureCode(value: unknown): value is FailureCode {
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

function isSessionSummary(value: unknown): value is SessionSummary {
  return (
    isRecord(value) &&
    isString(value["userId"]) &&
    isText(value["displayName"]) &&
    isStringOrNull(value["avatar"]) &&
    isSessionCapabilities(value["capabilities"])
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
    isStringOrNull(value["error"]) &&
    isBoolean(value["retryable"]) &&
    isBoolean(value["system"]) &&
    isMessageEncryption(value["encryption"])
  );
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
  resetIdentity: isStringOrNull,
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
    case "connection":
      return isConnection(payload) ? { type, payload } : null;
    case "outbox":
      return isOutboxPayload(payload) ? { type, payload } : null;
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
    default:
      return null;
  }
}
