import type { KeyStatus, Message, RoomSummary, SendStatus, Session } from "../core/types.ts";
import type { VerifyState } from "../core/types.ts";

export interface UiaStage {
  stage: "terms" | "token" | "password" | "dummy";
}

export type Command =
  | { type: "start"; accountHash: string | null }
  | { type: "discover"; baseUrl: string }
  | { type: "login"; baseUrl: string; user: string; password: string }
  | {
      type: "register";
      baseUrl: string;
      username: string;
      password: string;
      auth: Record<string, unknown> | null;
      session: string | null;
    }
  | { type: "logout" }
  | { type: "retrySync" }
  | { type: "keyStatus" }
  | { type: "unlock"; recoveryKey: string }
  | { type: "resetKey"; password: string }
  | { type: "openRoom"; roomId: string }
  | { type: "paginate"; roomId: string }
  | { type: "members"; roomId: string }
  | { type: "text"; roomId: string; txnId: string; body: string; html: string | null; replyTo: string | null }
  | { type: "sticker"; roomId: string; txnId: string; body: string; url: string; replyTo: string | null }
  | { type: "sendFile"; roomId: string; txnId: string; name: string; mime: string; data: ArrayBuffer }
  | { type: "retry"; txnId: string }
  | { type: "cancel"; txnId: string }
  | { type: "react"; roomId: string; eventId: string; key: string; on: boolean }
  | { type: "edit"; roomId: string; eventId: string; body: string; html: string | null }
  | { type: "redact"; roomId: string; eventId: string }
  | { type: "markRead"; roomId: string; eventId: string }
  | { type: "typing"; roomId: string; on: boolean }
  | { type: "media"; mxc: string; size: number; method: "scale" | "crop"; file: Record<string, unknown> | null }
  | { type: "join"; target: string }
  | { type: "leave"; roomId: string }
  | { type: "create"; name: string; topic: string; isPublic: boolean; encrypted: boolean; invites: string[] }
  | { type: "direct"; userId: string }
  | { type: "invite"; roomId: string; userId: string }
  | { type: "tag"; roomId: string; tag: "m.favourite" | "m.lowpriority"; on: boolean }
  | { type: "mute"; roomId: string; on: boolean }
  | { type: "profile"; name?: string; avatar?: string }
  | { type: "uploadAvatar"; data: ArrayBuffer; mime: string }
  | { type: "uploadRoomAvatar"; roomId: string; data: ArrayBuffer; mime: string }
  | { type: "setRoomState"; roomId: string; name?: string; topic?: string; avatarUrl?: string }
  | { type: "search"; query: string; roomId: string | null }
  | { type: "devices" }
  | { type: "verifyStart"; deviceId: string }
  | { type: "verifyAccept" }
  | { type: "verifyConfirm" }
  | { type: "verifyMismatch" }
  | { type: "verifyCancel" }
  | { type: "signOutOthers"; password: string }
  | { type: "signOutDevice"; deviceId: string; password: string }
  | { type: "moderate"; roomId: string; userId: string; action: "kick" | "ban" | "unban" };

export type CommandType = Command["type"];

export type Reply = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } };

export type Event =
  | { event: "ready"; session: Session | null; revision: number }
  | { event: "session"; session: Session | null }
  | { event: "sync"; revision: number; rooms: string[]; active: string | null; removed: string[] }
  | { event: "connection"; connection: "connecting" | "online" | "offline" | "error"; message: string }
  | { event: "outbox"; txnId: string; status: SendStatus; error: string }
  | { event: "progress"; txnId: string; loaded: number; total: number }
  | { event: "keys"; status: KeyStatus }
  | { event: "typing"; roomId: string; users: { userId: string; name: string }[] }
  | { event: "verify"; update: VerifyState }
  | { event: "fatal"; message: string };

export interface RoomWindow {
  room: RoomSummary | null;
  messages: Message[];
  hasOlder: boolean;
}

export interface Discovery {
  baseUrl: string;
  password: boolean;
  sso: boolean;
  registration: boolean;
}

export interface SearchResult {
  hits: { roomId: string; message: Message }[];
}

export interface RegisterResult {
  session: Session | null;
  uia: UiaStage[] | null;
  uiaSession: string | null;
}
