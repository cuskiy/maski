export const ROOM_HASH = "#/room/";

export function roomHash(roomId: string): string {
  return `${ROOM_HASH}${encodeURIComponent(roomId)}`;
}

export function roomIdFromHash(hash: string): string | null {
  if (!hash.startsWith(ROOM_HASH)) return null;
  try {
    const roomId = decodeURIComponent(hash.slice(ROOM_HASH.length));
    return roomId.startsWith("!") ? roomId : null;
  } catch {
    return null;
  }
}
