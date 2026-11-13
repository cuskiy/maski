import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import type { Message, Room as RoomRow } from "../core/types.ts";
import type { AccountDb } from "./db.ts";
import { directTargets, isLocalEcho, normalize, summarize, transactionId } from "./normalize.ts";

type Pass = "forward" | "backward";

/** Everything after the cursor, plus the last rows again: a relation changes an old row in place. */
export function selectFresh(ids: readonly string[], cursor: string | undefined, tail: number, limit: number): number[] {
  const after = new Set<number>();
  for (let index = ids.length - 1; index >= 0 && after.size < limit; index -= 1) {
    const id = ids[index] ?? "";
    if (cursor !== undefined && id === cursor) break;
    after.add(index);
  }
  const first = Math.max(0, ids.length - tail);
  const chosen: number[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    if (index >= first || after.has(index)) chosen.push(index);
  }
  return chosen;
}

export interface Rows {
  get(store: "events", key: string): Promise<unknown>;
}

/** Backfill prepends, where the cursor is blind: take from the start until a stored row. */
export async function olderEvents<T extends { getId(): string | undefined | null }>(db: Rows, events: readonly T[]): Promise<T[]> {
  const chosen: T[] = [];
  for (const event of events) {
    const id = event.getId();
    if (!id || id.startsWith("~")) break;
    if (await db.get("events", id)) break;
    chosen.push(event);
  }
  return chosen;
}

async function directMap(db: AccountDb, client: MatrixClient): Promise<Map<string, string>> {
  const content = client.getAccountData("m.direct" as never)?.getContent();
  if (content !== undefined && typeof content === "object" && content !== null) {
    await db.setMeta("direct", content);
  }
  const stored = await db.meta<Record<string, string[]> | null>("direct", null);
  return directTargets(stored, client.getUserId() ?? "");
}

/** One pass over the rooms a sync touched, then the summary each of them shows in the list. */
export async function projectRooms(db: AccountDb, client: MatrixClient, roomIds: readonly string[], pass: Pass): Promise<RoomRow[]> {
  const self = client.getUserId() ?? "";
  const direct = await directMap(db, client);
  const cursors = await db.meta<Record<string, string>>("cursors", {});
  const rows: RoomRow[] = [];

  for (const roomId of roomIds) {
    const room = client.getRoom(roomId);
    if (!room) continue;
    if (room.getMyMembership() === "leave" || room.getMyMembership() === "ban") continue;

    const timeline = room.getLiveTimeline().getEvents();
    const fresh =
      pass === "backward"
        ? await olderEvents(db, timeline)
        : selectFresh(timeline.map((event) => event.getId() ?? ""), cursors[roomId], 30, 400)
            .map((index) => timeline[index])
            .filter((event): event is MatrixEvent => event !== undefined);

    const batch: Message[] = [];
    for (const event of fresh) {
      if (isLocalEcho(event)) continue;
      if (event.isEncrypted()) await client.decryptEventIfNeeded(event).catch(() => undefined);
      const txn = transactionId(event);
      if (txn) await db.del("events", txn);
      const row = await normalize(event, room, self);
      if (!row) {
        const id = event.getId();
        if (id) await db.del("events", id);
        continue;
      }
      batch.push(row);
    }
    await db.putMessages(batch);

    const newest = timeline.at(-1)?.getId();
    if (pass === "forward" && newest) {
      cursors[roomId] = newest;
      await db.setMeta("cursors", cursors);
    }

    rows.push(summaryOf(room, direct, self, await newestRow(db, room.roomId)));
  }
  return rows;
}

async function newestRow(db: AccountDb, roomId: string): Promise<Message | null> {
  const rows = await db.window(roomId, 8);
  return rows.findLast((row) => row.kind !== "state") ?? null;
}

export function summaryOf(room: Room, direct: Map<string, string>, self: string, last: Message | null): RoomRow {
  return summarize(room, direct, last, self);
}
