/**
 * Pure projection rules shared by the worker database and its tests. Nothing here reads the SDK or
 * IndexedDB: the worker feeds stored rows in and sends the bounded result out.
 */
import type { MessageRow, RoomSummary } from "../core/types.ts";

export const WINDOW_LIMIT = 30;

export interface WindowSlice {
  readonly messages: readonly MessageRow[];
  readonly hasOlder: boolean;
  readonly before: string | null;
}

export interface ReadMarker {
  readonly roomId: string;
  readonly eventId: string;
  readonly ts: number;
}

export interface Segment {
  readonly roomId: string;
  readonly beforeEventId: string | null;
  readonly token: string | null;
  readonly readable: boolean;
  readonly gapped: boolean;
}

/** The stable cursor for a row: the homeserver event id when it exists, the local id otherwise. */
export function rowCursor(row: MessageRow): string {
  return row.eventId ?? row.id;
}

export function compareRows(left: MessageRow, right: MessageRow): number {
  if (left.ts !== right.ts) return left.ts - right.ts;
  return left.id.localeCompare(right.id);
}

export function orderRows(rows: readonly MessageRow[]): MessageRow[] {
  return [...rows].toSorted(compareRows);
}

function sameRow(left: MessageRow, right: MessageRow): boolean {
  if (left.id === right.id) return true;
  if (left.eventId !== null && left.eventId === right.eventId) return true;
  return left.transactionId !== null && left.transactionId === right.transactionId;
}

/** Merges changed rows by id, event id or transaction id; the incoming row wins in place. */
export function mergeRows(current: readonly MessageRow[], changed: readonly MessageRow[]): MessageRow[] {
  const merged = [...current];
  for (const row of changed) {
    const index = merged.findIndex((entry) => sameRow(entry, row));
    if (index === -1) merged.push(row);
    else merged[index] = row;
  }
  return orderRows(merged);
}

export function removeRow(rows: readonly MessageRow[], messageId: string): MessageRow[] {
  return rows.filter((row) => row.id !== messageId && row.transactionId !== messageId);
}

/** The visible window plus whether anything remains before it. */
export function windowSlice(
  events: readonly MessageRow[],
  outbox: readonly MessageRow[],
  segment: Segment | null,
  limit = WINDOW_LIMIT,
): WindowSlice {
  const merged = mergeRows(events, outbox);
  const messages = merged.slice(Math.max(0, merged.length - limit));
  const hasToken = segment !== null && segment.token !== null;
  return {
    messages,
    hasOlder: merged.length > messages.length || hasToken,
    before: messages[0] === undefined ? null : rowCursor(messages[0]),
  };
}

/** One page strictly before `before`, newest first in the returned slice. */
export function olderPage(events: readonly MessageRow[], before: string, limit = WINDOW_LIMIT): readonly MessageRow[] {
  const ordered = orderRows(events);
  const index = ordered.findIndex((row) => rowCursor(row) === before || row.id === before);
  if (index <= 0) return [];
  return ordered.slice(Math.max(0, index - limit), index);
}

export interface ReadState {
  readonly unread: number;
  readonly highlight: number;
}

function mentionsUser(row: MessageRow, ownUserId: string): boolean {
  if (ownUserId === "") return false;
  if (row.mentions.includes(ownUserId)) return true;
  return row.body.includes(ownUserId);
}

/**
 * Unread and highlight are derived from projected rows after the advancing marker. The server
 * notification count is never used as an array index.
 */
export function readState(events: readonly MessageRow[], marker: ReadMarker | null, ownUserId: string): ReadState {
  const ordered = orderRows(events);
  const start =
    marker === null
      ? 0
      : ordered.findIndex(
          (row) =>
            row.eventId === marker.eventId ||
            row.id === marker.eventId ||
            (row.ts === marker.ts && rowCursor(row) === marker.eventId),
        ) + 1;
  let unread = 0;
  let highlight = 0;
  for (const row of ordered.slice(Math.max(0, start))) {
    if (row.own || row.redacted || row.system) continue;
    unread += 1;
    if (mentionsUser(row, ownUserId)) highlight += 1;
  }
  return { unread, highlight };
}

/** A marker only advances; a stale or unknown event leaves the stored marker unchanged. */
export function advanceMarker(
  current: ReadMarker | null,
  candidateEventId: string,
  events: readonly MessageRow[],
): ReadMarker | null {
  const candidate = events.find((row) => row.eventId === candidateEventId || row.id === candidateEventId);
  if (candidate === undefined) return current;
  const next: ReadMarker = {
    roomId: candidate.roomId,
    eventId: rowCursor(candidate),
    ts: candidate.ts,
  };
  if (current === null) return next;
  const newer = next.ts > current.ts || (next.ts === current.ts && next.eventId.localeCompare(current.eventId) > 0);
  return newer ? next : current;
}

/**
 * A timeline reset marks the backfill chain as gapped. It never deletes a readable segment or its
 * rows: a gappy sync must not erase history the reader can still scroll.
 */
export function markTimelineReset(segment: Segment | null, roomId: string): Segment {
  if (segment === null) {
    return { roomId, beforeEventId: null, token: null, readable: false, gapped: true };
  }
  return { ...segment, gapped: true };
}

export function previewOf(rows: readonly MessageRow[]): RoomSummary["preview"] {
  const ordered = orderRows(rows);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const row = ordered[index];
    if (row === undefined) continue;
    if (row.status === "failed") {
      return { kind: "error", body: row.body === "" ? (row.media?.name ?? "") : row.body };
    }
    if (row.redacted) continue;
    if (row.body !== "" || row.media !== null) return { kind: row.kind, body: row.body };
  }
  return null;
}

/** Room fields that depend on projected rows, leaving SDK state fields untouched. */
export function projectRoomState(
  room: RoomSummary,
  events: readonly MessageRow[],
  outbox: readonly MessageRow[],
  marker: ReadMarker | null,
  ownUserId: string,
): RoomSummary {
  const rows = orderRows([...events, ...outbox]);
  const latest = rows[rows.length - 1];
  const read = readState(events, marker, ownUserId);
  return {
    ...room,
    preview: previewOf(rows),
    lastTs: latest?.ts ?? room.lastTs,
    latestEventId: latest?.eventId ?? room.latestEventId,
    readReceipt: marker?.eventId ?? room.readReceipt,
    fullyRead: marker?.eventId ?? room.fullyRead,
    unread: read.unread,
    highlight: read.highlight,
  };
}
