import { config } from "../app/config.ts";
import type { Member, Message, RoomSummary, SectionId } from "../core/types.ts";
import { dayLabel, t } from "../i18n/index.ts";
import { sortRooms, state } from "./state.ts";

export interface DayItem {
  kind: "day";
  key: string;
  label: string;
}

export interface MessageItem {
  kind: "message";
  key: string;
  message: Message;
  groupStart: boolean;
  own: boolean;
}

export type TimelineItem = DayItem | MessageItem;

export function timelineItems(messages: Message[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let previous: Message | null = null;
  for (const message of messages) {
    const day = new Date(message.ts).toDateString();
    const previousDay = previous ? new Date(previous.ts).toDateString() : "";
    if (day !== previousDay) items.push({ kind: "day", key: `day:${day}`, label: dayLabel(message.ts) });
    const groupStart =
      !previous || previous.sender !== message.sender || previousDay !== day || message.ts - previous.ts > 5 * 60 * 1000;
    items.push({ kind: "message", key: `m:${message.id}`, message, groupStart, own: message.sender === state.session?.userId });
    previous = message;
  }
  return items;
}

export function sectionOf(room: RoomSummary): SectionId {
  if (room.membership === "invite") return "invites";
  if (room.favorite) return "favorites";
  if (room.isDirect) return "direct";
  if (room.lowPriority) return "low";
  return "rooms";
}

export interface Section {
  id: SectionId;
  rooms: RoomSummary[];
}

export function sections(): Section[] {
  const grouped = new Map<SectionId, RoomSummary[]>();
  for (const id of config.sections) grouped.set(id, []);
  for (const room of state.rooms.values()) {
    const section = sectionOf(room);
    grouped.get(section)?.push(room);
  }
  return config.sections.map((id) => ({ id, rooms: sortRooms(grouped.get(id) ?? []) }));
}

export function canModerate(room: RoomSummary, member: Member, self: string): boolean {
  return room.membership === "join" && room.myPower >= 50 && member.userId !== self && member.power < room.myPower;
}

export function roomPreview(room: RoomSummary): string {
  const last = room.last;
  if (!last) return "";
  if (last.kind === "state") return last.body === "leave" ? t("room.memberLeft") : last.body === "invite" ? t("room.memberInvited") : t("room.memberJoined");
  if (last.kind === "error") return t("room.encryptedPreview");
  if (last.kind === "image") return t("room.image");
  if (last.kind === "video") return t("room.video");
  if (last.kind === "audio") return t("room.audio");
  if (last.kind === "file") return t("room.file");
  if (last.kind === "sticker") return t("room.sticker");
  return last.own ? `${t("common.you")}: ${last.body}` : last.body;
}

export function activeRoom(): RoomSummary | null {
  const id = state.activeRoomId;
  return id ? (state.rooms.get(id) ?? null) : null;
}

export function canSend(): boolean {
  const room = activeRoom();
  return Boolean(room && room.membership === "join" && room.canSend && !state.readOnly);
}
