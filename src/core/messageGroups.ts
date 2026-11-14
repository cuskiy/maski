import type { MessageRow } from "./types.ts";

export type MessageGroupRow = Pick<MessageRow, "ts" | "sender" | "own" | "media" | "system">;

export interface MessagePosition {
  readonly dayStart: boolean;
  readonly groupStart: boolean;
  readonly groupEnd: boolean;
  readonly showSender: boolean;
}

export function dayKey(ts: number): string {
  const date = new Date(ts);
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1)}-${String(date.getDate())}`;
}

export function messagePosition(messages: readonly MessageGroupRow[], index: number): MessagePosition {
  const message = messages[index];
  if (message === undefined) throw new Error(`Message at index ${String(index)} is missing`);
  const previous = messages[index - 1];
  const next = messages[index + 1];
  const date = dayKey(message.ts);
  const dayStart = previous === undefined || dayKey(previous.ts) !== date;
  const nextDayStart = next === undefined || dayKey(next.ts) !== date;
  const groupStart = previous === undefined || previous.sender !== message.sender || dayStart;
  const groupEnd = next === undefined || next.sender !== message.sender || nextDayStart;

  let groupFirst = index;
  while (groupFirst > 0) {
    const prior = messages[groupFirst - 1];
    if (prior === undefined || prior.sender !== message.sender || dayKey(prior.ts) !== date) break;
    groupFirst -= 1;
  }

  const firstText = messages.findIndex(
    (entry, entryIndex) => entryIndex >= groupFirst && entryIndex <= index && entry.media === null,
  );
  return {
    dayStart,
    groupStart,
    groupEnd,
    showSender: !message.own && message.system !== true && message.media === null && index === firstText,
  };
}
