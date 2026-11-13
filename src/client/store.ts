import type { Message, Room, Session } from "../core/types.ts";

export interface State {
  phase: "boot" | "signedOut" | "gated" | "ready";
  session: Session | null;
  rooms: Room[];
  roomId: string | null;
  messages: Message[];
  hasOlder: boolean;
  connection: "connecting" | "online" | "offline" | "error";
}

const state: State = {
  phase: "boot",
  session: null,
  rooms: [],
  roomId: null,
  messages: [],
  hasOlder: false,
  connection: "connecting",
};

type Listener = () => void;

const listeners = new Map<keyof State, Set<Listener>>();

export function get(): State {
  return state;
}

/** A key that did not change does not wake its readers. */
export function set(patch: Partial<State>): void {
  let touched = false;
  for (const [key, value] of Object.entries(patch) as Array<[keyof State, State[keyof State]]>) {
    if (Object.is(state[key], value)) continue;
    (state[key] as unknown) = value;
    touched = true;
    for (const listener of listeners.get(key) ?? []) listener();
  }
  if (!touched) return;
}

export function subscribe(keys: readonly (keyof State)[], listener: Listener): () => void {
  for (const key of keys) {
    const bucket = listeners.get(key) ?? new Set<Listener>();
    bucket.add(listener);
    listeners.set(key, bucket);
  }
  return () => {
    for (const key of keys) listeners.get(key)?.delete(listener);
  };
}

/** One place decides the phase: no session, keys not ready, or ready. */
export function applySession(session: Session | null, keys: { ready: boolean } | null): void {
  set({ session, phase: session === null ? "signedOut" : keys?.ready === true ? "ready" : "gated" });
}

export function roomById(roomId: string | null): Room | null {
  return roomId === null ? null : (state.rooms.find((room) => room.roomId === roomId) ?? null);
}
