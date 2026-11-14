import type { ChatState } from "./types.ts";

/** The shell the static page and a fresh store both start from: no session, no room, no data. */
export function emptyChatState(): ChatState {
  return {
    phase: "boot",
    connection: "connecting",
    roomsLoading: false,
    session: null,
    rooms: [],
    roomId: null,
    messages: [],
    hasOlder: false,
    typing: [],
    openSpaces: [],
    sections: {
      favorites: { open: false },
      rooms: { open: true },
      direct: { open: false },
      channels: { open: false },
    },
    notifications: {
      badge: true,
      titleTotal: false,
      desktop: false,
      preview: true,
    },
    devices: [],
    invites: [],
    members: [],
    recoveryKey: null,
  };
}
