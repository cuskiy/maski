import type { Keys, Room, Session } from "../core/types.ts";

export type Command =
  | { type: "start"; accountHash: string | null; wasm: string }
  | { type: "login"; baseUrl: string; user: string; password: string }
  | { type: "logout" }
  | { type: "keyStatus" }
  | { type: "send"; roomId: string; txnId: string; body: string };

export type Event =
  | { event: "ready"; session: Session | null; keys: Keys | null }
  | { event: "rooms"; rooms: Room[] }
  | { event: "connection"; state: "connecting" | "online" | "offline" | "error"; message: string }
  | { event: "keys"; keys: Keys }
  | { event: "fatal"; message: string };

export type Reply = { id: number; ok: true; data: unknown } | { id: number; ok: false; error: string };

export interface Envelope {
  readonly id: number;
  readonly command: Command;
}
