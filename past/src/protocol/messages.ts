import type { Discovery, KeyStatus, MediaRef, Room, Session, Window } from "../core/types.ts";

export type Command =
  | { type: "start"; account: string | null }
  | { type: "discover"; baseUrl: string }
  | { type: "login"; user: string; password: string }
  | { type: "register"; user: string; password: string }
  | { type: "logout" }
  | { type: "keyStatus" }
  | { type: "unlock"; key: string }
  | { type: "resetKey"; password: string }
  | { type: "rooms" }
  | { type: "open"; roomId: string }
  | { type: "older"; roomId: string; keep: number }
  | { type: "send"; roomId: string; txnId: string; body: string; html: string | null }
  | { type: "retry"; txnId: string }
  | { type: "discard"; txnId: string }
  | { type: "media"; ref: MediaRef; size: number }
  | { type: "markRead"; roomId: string; eventId: string }
  | { type: "typing"; roomId: string; on: boolean }
  | { type: "join"; target: string }
  | { type: "accept"; roomId: string }
  | { type: "leave"; roomId: string }
  | { type: "create"; name: string; topic: string; encrypted: boolean }
  | { type: "direct"; userId: string }
  | { type: "search"; query: string };

export type Event =
  | { event: "session"; session: Session | null; keys: KeyStatus | null }
  | { event: "rooms"; rooms: Room[] }
  | { event: "window"; window: Window }
  | { event: "outbox"; txnId: string; status: "queued" | "sending" | "sent" | "failed"; error: string }
  | { event: "connection"; state: "connecting" | "online" | "offline" | "error"; message: string }
  | { event: "keys"; keys: KeyStatus }
  | { event: "typing"; roomId: string; users: string[] }
  | { event: "fatal"; message: string };

export interface StartResult {
  session: Session | null;
  keys: KeyStatus | null;
  rooms: Room[];
}

export type Reply<T = unknown> = { id: number; ok: true; data: T } | { id: number; ok: false; error: string };

export type DiscoverResult = Discovery;
