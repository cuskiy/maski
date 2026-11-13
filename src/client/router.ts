import { set } from "./store.ts";

const HASH = /^#\/room\/([^?]+)/u;

let navigate: ((roomId: string | null) => void) | null = null;

export function roomFromHash(): string | null {
  const match = HASH.exec(location.hash);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * The room lives in the hash, and every way in goes through here: a click, back and forward, or
 * the first load. Without that, the hash would change while the pane keeps the old room.
 */
export function openRoom(roomId: string | null, replace = false): void {
  const url = roomId === null ? location.pathname : `#/room/${encodeURIComponent(roomId)}`;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  set({ roomId });
  navigate?.(roomId);
}

export function watchRoute(onRoom: (roomId: string | null) => void): void {
  navigate = onRoom;
  window.addEventListener("popstate", () => {
    const roomId = roomFromHash();
    set({ roomId });
    onRoom(roomId);
  });
  onRoom(roomFromHash());
}
