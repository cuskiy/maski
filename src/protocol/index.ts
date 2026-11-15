import type { Connection, Member, MessageRow, MessageStatus, RoomSummary, SessionSummary } from "../core/types.ts";

export const PROTOCOL_VERSION = 1;

export type CommandName =
  "start" | "login" | "logout" | "keyStatus" | "open" | "older" | "send" | "markRead" | "members" | "resetIdentity";
export type KeyStatus = "ready" | "missing" | "unknown";
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
  readonly open: { readonly roomId: string };
  readonly older: { readonly roomId: string };
  readonly send: {
    readonly roomId: string;
    readonly body: string;
    readonly html: string | null;
    readonly replyTo: string | null;
    readonly transactionId: string;
    readonly messageId: string;
  };
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
  readonly open: null;
  readonly older: null;
  readonly send: null;
  readonly markRead: null;
  readonly members: null;
  readonly resetIdentity: string | null;
}

export interface EventMap {
  readonly session: SessionSummary;
  readonly rooms: { readonly rooms: readonly RoomSummary[]; readonly loading: boolean };
  readonly window: {
    readonly roomId: string;
    readonly messages: readonly MessageRow[];
    readonly hasOlder: boolean;
    readonly older: boolean;
  };
  readonly members: { readonly roomId: string; readonly members: readonly Member[] };
  readonly connection: Connection;
  readonly outbox: {
    readonly roomId: string;
    readonly messageId: string;
    readonly eventId: string | null;
    readonly status: MessageStatus;
    readonly error: string | null;
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

export type Event = {
  [K in keyof EventMap]: { readonly type: K; readonly payload: EventMap[K] };
}[keyof EventMap];

const COMMANDS: ReadonlySet<string> = new Set<CommandName>([
  "start",
  "login",
  "logout",
  "keyStatus",
  "open",
  "older",
  "send",
  "markRead",
  "members",
  "resetIdentity",
]);

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isConnection(value: unknown): value is Connection {
  return value === "connecting" || value === "online" || value === "offline";
}

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
  "rooms",
  "window",
  "members",
  "connection",
  "outbox",
]);

export function parseReply(value: unknown): Reply | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  const id = reply["id"];
  const ok = reply["ok"];
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1 || typeof ok !== "boolean") return null;
  if (ok) {
    if (!("data" in reply)) return null;
    return reply as unknown as Reply;
  }
  const code = reply["code"];
  if (typeof code !== "string" || !FAILURE_CODES.has(code)) return null;
  return reply as unknown as Reply;
}

export function parseEvent(value: unknown): Event | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  const type = event["type"];
  if (typeof type !== "string" || !EVENT_TYPES.has(type)) return null;
  const payload = event["payload"];
  if (type === "connection") return isConnection(payload) ? (event as Event) : null;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  if (type === "rooms" && !Array.isArray((payload as Record<string, unknown>)["rooms"])) return null;
  if (type === "window") {
    const window = payload as Record<string, unknown>;
    if (!Array.isArray(window["messages"]) || typeof window["hasOlder"] !== "boolean") return null;
  }
  if (type === "members" && !Array.isArray((payload as Record<string, unknown>)["members"])) return null;
  return event as Event;
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

function validSend(fields: Record<string, unknown>): fields is CommandMap["send"] {
  const html = fields["html"];
  const replyTo = fields["replyTo"];
  return (
    isRoomId(fields["roomId"]) &&
    isString(fields["body"]) &&
    fields["body"].length <= 65536 &&
    (html === null || (isString(html) && html.length <= 65536)) &&
    (replyTo === null || isString(replyTo)) &&
    isString(fields["transactionId"]) &&
    isString(fields["messageId"])
  );
}

function validMarkRead(fields: Record<string, unknown>): fields is CommandMap["markRead"] {
  return isRoomId(fields["roomId"]) && isString(fields["eventId"]);
}

function empty(fields: Record<string, unknown>): fields is Record<string, never> {
  return Object.keys(fields).length === 0;
}

export function parseCommand(value: unknown): Command | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const command = value as Record<string, unknown>;
  const id = command["id"];
  const type = command["type"];
  const payload = command["payload"];
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return null;
  if (typeof type !== "string" || !COMMANDS.has(type)) return null;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const fields = payload as Record<string, unknown>;

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
        },
      };
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
