import { NotificationCountType, type Room as SdkRoom } from "matrix-js-sdk";
import type { Room } from "../core/types.ts";

/** One room as the navigation reads it. The projection fills the same shape later. */
export function roomRow(room: SdkRoom, self: string): Room {
  const last = room.getLiveTimeline().getEvents().at(-1);
  const body = last ? String(last.getContent()["body"] ?? "") : "";
  const sender = last?.getSender() ?? "";
  return {
    roomId: room.roomId,
    name: room.name || room.getCanonicalAlias() || room.roomId,
    avatar: room.getMxcAvatarUrl() ?? null,
    topic: String(room.currentState.getStateEvents("m.room.topic", "")?.getContent()["topic"] ?? ""),
    encrypted: room.hasEncryptionStateEvent(),
    lastTs: last?.getTs() ?? 0,
    preview: last ? { body: body.slice(0, 140), name: sender, own: sender === self } : null,
    unread: room.getUnreadNotificationCount(NotificationCountType.Total),
    highlight: room.getUnreadNotificationCount(NotificationCountType.Highlight),
    membership: room.getMyMembership(),
  };
}
