import { get, set } from "./store.ts";

const HASH = /^#\/room\/([^?]+)/u;

export function roomFromHash(): string | null {
  const match = HASH.exec(location.hash);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** The room lives in the hash, so back and forward walk rooms without reloading the document. */
export function openRoom(roomId: string | null, replace = false): void {
  const hash = roomId === null ? location.pathname : `#/room/${encodeURIComponent(roomId)}`;
  if (roomId === null) {
    if (replace) history.replaceState(null, "", hash);
    else history.pushState(null, "", hash);
  } else if (replace) {
    history.replaceState(null, "", hash);
  } else {
    history.pushState(null, "", hash);
  }
  set({ roomId });
}

export function watchRoute(onRoom: (roomId: string | null) => void): void {
  window.addEventListener("popstate", () => {
    const roomId = roomFromHash();
    set({ roomId });
    onRoom(roomId);
  });
  const initial = roomFromHash();
  set({ roomId: initial });
  onRoom(initial);
}

export function currentRoom(): string | null {
  return get().roomId;
}
