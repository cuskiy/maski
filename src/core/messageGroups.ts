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

export function messagePositions(messages: readonly MessageGroupRow[]): MessagePosition[] {
  const positions: MessagePosition[] = [];
  if (messages.length === 0) return positions;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message === undefined) throw new Error(`Message at index ${String(index)} is missing`);
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const date = dayKey(message.ts);
    const nextDate = next === undefined ? null : dayKey(next.ts);
    positions.push({
      dayStart: previous === undefined || dayKey(previous.ts) !== date,
      groupStart: previous === undefined || previous.sender !== message.sender || dayKey(previous.ts) !== date,
      groupEnd: next === undefined || next.sender !== message.sender || nextDate !== date,
      showSender: false,
    });
  }

  let groupStart = 0;
  while (groupStart < messages.length) {
    const first = messages[groupStart];
    if (first === undefined) break;
    const date = dayKey(first.ts);
    let groupEnd = groupStart;
    while (groupEnd + 1 < messages.length) {
      const next = messages[groupEnd + 1];
      if (next === undefined || next.sender !== first.sender || dayKey(next.ts) !== date) break;
      groupEnd += 1;
    }
    for (let index = groupStart; index <= groupEnd; index += 1) {
      const message = messages[index];
      if (message !== undefined && !message.own && !message.system && message.media === null) {
        const position = positions[index];
        if (position !== undefined) positions[index] = { ...position, showSender: true };
        break;
      }
    }
    groupStart = groupEnd + 1;
  }
  return positions;
}

export function messagePosition(messages: readonly MessageGroupRow[], index: number): MessagePosition {
  const position = messagePositions(messages)[index];
  if (position === undefined) throw new Error(`Message at index ${String(index)} is missing`);
  return position;
}
