import type {
  Connection,
  DeviceEntry,
  Draft,
  KeyStatus,
  Locale,
  Message,
  Phase,
  RoomSummary,
  Session,
  TypingUser,
  VerifyState,
} from "../core/types.ts";
import type { Settings } from "./db.ts";

export interface AppState {
  phase: Phase;
  session: Session | null;
  connection: Connection;
  notice: string;
  rooms: Map<string, RoomSummary>;
  activeRoomId: string | null;
  messages: Message[];
  hasOlder: boolean;
  draft: Draft;
  typing: TypingUser[];
  keys: KeyStatus | null;
  devices: DeviceEntry[];
  progress: Record<string, number>;
  verify: VerifyState | null;
  locale: Locale;
  settings: Settings;
  dialog: string | null;
  readOnly: boolean;
}

export const EMPTY_DRAFT: Draft = { text: "", marks: [], reply: null, edit: null };

export const state: AppState = {
  phase: "boot",
  session: null,
  connection: "idle",
  notice: "",
  rooms: new Map(),
  activeRoomId: null,
  messages: [],
  hasOlder: false,
  draft: EMPTY_DRAFT,
  typing: [],
  keys: null,
  devices: [],
  progress: {},
  verify: null,
  locale: "en",
  settings: {
    locale: null,
    lastAccount: null,
    sections: { invites: true, favorites: true, direct: true, rooms: true, low: false },
    desktop: false,
    preview: true,
    keysReady: false,
  },
  dialog: null,
  readOnly: false,
};

type Listener = () => void;

const listeners = new Set<Listener>();
let frame = 0;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function touch(): void {
  if (frame !== 0) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    for (const listener of listeners) listener();
  });
}

export function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  touch();
}

export function roomList(): RoomSummary[] {
  return [...state.rooms.values()];
}

export function sortRooms(rooms: RoomSummary[]): RoomSummary[] {
  return rooms.toSorted((a, b) => b.lastTs - a.lastTs);
}

