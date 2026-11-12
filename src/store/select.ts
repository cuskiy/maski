import { config } from "../app/config.ts";
import type { Message, RoomSummary, SectionId } from "../core/types.ts";
import { dayLabel } from "../i18n/index.ts";
import { sectionOf, sortRooms, state } from "./state.ts";

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

export function activeRoom(): RoomSummary | null {
  const id = state.activeRoomId;
  return id ? (state.rooms.get(id) ?? null) : null;
}

export function canSend(): boolean {
  const room = activeRoom();
  return Boolean(room && room.membership === "join" && room.canSend && !state.readOnly);
}
