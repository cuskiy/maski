import type { Keys, Media, Outbox, Room, Session, Window } from "../core/types.ts";

export type Command =
  | { type: "start"; accountHash: string | null; wasm: string }
  | { type: "discover"; address: string }
  | { type: "login"; baseUrl: string; user: string; password: string }
  | { type: "register"; baseUrl: string; username: string; password: string }
  | { type: "logout" }
  | { type: "keyStatus" }
  | { type: "unlock"; input: string; password: string }
  | { type: "resetKey"; password: string }
  | { type: "open"; roomId: string }
  | { type: "older"; roomId: string; keep: number }
  | { type: "send"; roomId: string; txnId: string; body: string; html: string | null }
  | { type: "retry"; txnId: string; roomId: string }
  | { type: "discard"; txnId: string; roomId: string }
  | { type: "media"; media: Media; size: number }
  | { type: "packs" }
  | { type: "sticker"; roomId: string; txnId: string; body: string; media: Media }
  | { type: "react"; roomId: string; eventId: string; key: string; on: boolean }
  | { type: "edit"; roomId: string; eventId: string; body: string; html: string | null }
  | { type: "redact"; roomId: string; eventId: string }
  | { type: "markRead"; roomId: string; eventId: string }
  | { type: "typing"; roomId: string; on: boolean };

export type Event =
  | { event: "ready"; session: Session | null; keys: Keys | null }
  | { event: "rooms"; rooms: Room[] }
  | { event: "window"; window: Window }
  | { event: "outbox"; outbox: Outbox }
  | { event: "connection"; state: "connecting" | "online" | "offline" | "error"; message: string }
  | { event: "keys"; keys: Keys }
  | { event: "fatal"; message: string };

export type Reply = { id: number; ok: true; data: unknown } | { id: number; ok: false; error: string };

