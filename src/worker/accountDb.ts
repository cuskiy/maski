/**
 * The worker-owned account projection database. One database per account; the client is never given
 * this object or its rows except through the protocol. Events are keyed by room and event cursor and
 * indexed by room and time; the outbox, read markers and backfill segments have their own stores.
 */
import type { MessageRow, RoomSummary } from "../core/types.ts";
import { isRecord } from "../lib/json.ts";
import { isMessageRow, isRoomSummary } from "../protocol/index.ts";
import type { ReadMarker, Segment } from "./projection.ts";
import { rowCursor } from "./projection.ts";
import type { OutboxBackend, OutboxRecord } from "./outbox.ts";

const ACCOUNT_DB_VERSION = 1;

const ACCOUNT_STORES = {
  rooms: "rooms",
  events: "events",
  outbox: "outbox",
  markers: "markers",
  segments: "segments",
} as const;

const ACCOUNT_INDEXES = {
  eventsRoomTs: "roomTs",
  outboxMessage: "messageId",
  outboxRoom: "roomId",
} as const;

export interface RoomRecord {
  readonly room: RoomSummary;
  readonly lastOpened: number;
}

function accountDatabaseName(userId: string): string {
  return `maski:account:${encodeURIComponent(userId)}`;
}

function openDatabase(userId: string): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const request = indexedDB.open(accountDatabaseName(userId), ACCOUNT_DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(ACCOUNT_STORES.rooms)) {
      database.createObjectStore(ACCOUNT_STORES.rooms, { keyPath: "roomId" });
    }
    if (!database.objectStoreNames.contains(ACCOUNT_STORES.events)) {
      const events = database.createObjectStore(ACCOUNT_STORES.events, {
        keyPath: ["roomId", "id"],
      });
      events.createIndex(ACCOUNT_INDEXES.eventsRoomTs, ["roomId", "ts"]);
    }
    if (!database.objectStoreNames.contains(ACCOUNT_STORES.outbox)) {
      const outbox = database.createObjectStore(ACCOUNT_STORES.outbox, {
        keyPath: "transactionId",
      });
      outbox.createIndex(ACCOUNT_INDEXES.outboxMessage, "messageId", { unique: true });
      outbox.createIndex(ACCOUNT_INDEXES.outboxRoom, "roomId");
    }
    if (!database.objectStoreNames.contains(ACCOUNT_STORES.markers)) {
      database.createObjectStore(ACCOUNT_STORES.markers, { keyPath: "roomId" });
    }
    if (!database.objectStoreNames.contains(ACCOUNT_STORES.segments)) {
      database.createObjectStore(ACCOUNT_STORES.segments, { keyPath: "roomId" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("account database failed"));
  return promise;
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("account read failed"));
  return promise;
}

function writeTransaction(database: IDBDatabase, stores: readonly string[]): IDBTransaction {
  return database.transaction(stores, "readwrite");
}

function finished(transaction: IDBTransaction): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("account write failed"));
  transaction.onabort = () => reject(transaction.error ?? new Error("account write aborted"));
  return promise;
}

function eventRange(roomId: string, from: number, to: number): IDBKeyRange {
  return IDBKeyRange.bound([roomId, from], [roomId, to]);
}

function isRoomRecord(value: unknown): value is RoomRecord {
  return isRecord(value) && isRoomSummary(value["room"]) && typeof value["lastOpened"] === "number";
}

function isReadMarker(value: unknown): value is ReadMarker {
  return (
    isRecord(value) &&
    typeof value["roomId"] === "string" &&
    typeof value["eventId"] === "string" &&
    typeof value["ts"] === "number"
  );
}

function isSegment(value: unknown): value is Segment {
  return (
    isRecord(value) &&
    typeof value["roomId"] === "string" &&
    (value["beforeEventId"] === null || typeof value["beforeEventId"] === "string") &&
    (value["token"] === null || typeof value["token"] === "string") &&
    typeof value["readable"] === "boolean" &&
    typeof value["gapped"] === "boolean"
  );
}

function isOutboxRecord(value: unknown): value is OutboxRecord {
  return (
    isRecord(value) &&
    typeof value["roomId"] === "string" &&
    typeof value["transactionId"] === "string" &&
    typeof value["messageId"] === "string" &&
    (value["replyTo"] === null || typeof value["replyTo"] === "string") &&
    isMessageRow(value["row"]) &&
    typeof value["retryable"] === "boolean"
  );
}

function readMany<T>(
  source: IDBObjectStore | IDBIndex,
  query: IDBKeyRange | null,
  guard: (value: unknown) => value is T,
): Promise<readonly T[]> {
  const { promise, resolve, reject } = Promise.withResolvers<readonly T[]>();
  const rows: T[] = [];
  const request = source.openCursor(query);
  request.onerror = () => reject(request.error ?? new Error("account cursor failed"));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor === null) {
      resolve(rows);
      return;
    }
    const value: unknown = cursor.value;
    if (guard(value)) rows.push(value);
    cursor.continue();
  };
  return promise;
}

function readOne<T>(request: IDBRequest<unknown>, guard: (value: unknown) => value is T): Promise<T | null> {
  return readRequest(request).then((value: unknown) => (guard(value) ? value : null));
}

export class AccountDatabase implements OutboxBackend {
  private readonly database: IDBDatabase;
  private readonly userId: string;

  private constructor(database: IDBDatabase, userId: string) {
    this.database = database;
    this.userId = userId;
  }

  static async open(userId: string): Promise<AccountDatabase> {
    return new AccountDatabase(await openDatabase(userId), userId);
  }

  close(): void {
    this.database.close();
  }

  async destroy(): Promise<void> {
    const name = accountDatabaseName(this.userId);
    this.database.close();
    await readRequest(indexedDB.deleteDatabase(name));
  }

  readRooms(): Promise<readonly RoomRecord[]> {
    const store = this.database.transaction(ACCOUNT_STORES.rooms, "readonly").objectStore(ACCOUNT_STORES.rooms);
    return readMany(store, null, isRoomRecord);
  }

  readRoom(roomId: string): Promise<RoomRecord | null> {
    const store = this.database.transaction(ACCOUNT_STORES.rooms, "readonly").objectStore(ACCOUNT_STORES.rooms);
    return readOne(store.get(roomId), isRoomRecord);
  }

  writeRoom(record: RoomRecord): Promise<void> {
    const transaction = writeTransaction(this.database, [ACCOUNT_STORES.rooms]);
    transaction.objectStore(ACCOUNT_STORES.rooms).put({ ...record, roomId: record.room.roomId });
    return finished(transaction);
  }

  /** Removing a room is an explicit leave; no sync gap calls this. */
  deleteRoom(roomId: string): Promise<void> {
    const transaction = writeTransaction(this.database, [
      ACCOUNT_STORES.rooms,
      ACCOUNT_STORES.events,
      ACCOUNT_STORES.markers,
      ACCOUNT_STORES.segments,
    ]);
    const events = transaction.objectStore(ACCOUNT_STORES.events);
    transaction.objectStore(ACCOUNT_STORES.rooms).delete(roomId);
    transaction.objectStore(ACCOUNT_STORES.markers).delete(roomId);
    transaction.objectStore(ACCOUNT_STORES.segments).delete(roomId);
    const request = events
      .index(ACCOUNT_INDEXES.eventsRoomTs)
      .openKeyCursor(eventRange(roomId, 0, Number.MAX_SAFE_INTEGER));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null) return;
      events.delete(cursor.primaryKey);
      cursor.continue();
    };
    return finished(transaction);
  }

  readEvents(roomId: string): Promise<readonly MessageRow[]> {
    return this.readEventsAfter(roomId, 0);
  }

  readEventsAfter(roomId: string, ts: number): Promise<readonly MessageRow[]> {
    const index = this.database
      .transaction(ACCOUNT_STORES.events, "readonly")
      .objectStore(ACCOUNT_STORES.events)
      .index(ACCOUNT_INDEXES.eventsRoomTs);
    return readMany(index, eventRange(roomId, ts, Number.MAX_SAFE_INTEGER), isMessageRow);
  }

  readLatest(roomId: string, limit: number): Promise<readonly MessageRow[]> {
    return this.readEventsWindow(roomId, limit, Number.MAX_SAFE_INTEGER, null);
  }

  readOldest(roomId: string): Promise<MessageRow | null> {
    const { promise, resolve, reject } = Promise.withResolvers<MessageRow | null>();
    const index = this.database
      .transaction(ACCOUNT_STORES.events, "readonly")
      .objectStore(ACCOUNT_STORES.events)
      .index(ACCOUNT_INDEXES.eventsRoomTs);
    const request = index.openCursor(eventRange(roomId, 0, Number.MAX_SAFE_INTEGER), "next");
    request.onerror = () => reject(request.error ?? new Error("account cursor failed"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null) {
        resolve(null);
        return;
      }
      const value: unknown = cursor.value;
      resolve(isMessageRow(value) ? value : null);
    };
    return promise;
  }

  readBefore(roomId: string, beforeTs: number, beforeId: string, limit: number): Promise<readonly MessageRow[]> {
    return this.readEventsWindow(roomId, limit, beforeTs, beforeId);
  }

  private readEventsWindow(
    roomId: string,
    limit: number,
    upperTs: number,
    beforeId: string | null,
  ): Promise<readonly MessageRow[]> {
    const { promise, resolve, reject } = Promise.withResolvers<readonly MessageRow[]>();
    const rows: MessageRow[] = [];
    const index = this.database
      .transaction(ACCOUNT_STORES.events, "readonly")
      .objectStore(ACCOUNT_STORES.events)
      .index(ACCOUNT_INDEXES.eventsRoomTs);
    const request = index.openCursor(eventRange(roomId, 0, upperTs), "prev");
    request.onerror = () => reject(request.error ?? new Error("account cursor failed"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null || rows.length >= limit) {
        resolve(rows.toReversed());
        return;
      }
      const row: unknown = cursor.value;
      if (!isMessageRow(row)) {
        cursor.continue();
        return;
      }
      if (beforeId === null || rowCursor(row) !== beforeId) rows.push(row);
      cursor.continue();
    };
    return promise;
  }

  async writeEvents(rows: readonly MessageRow[]): Promise<void> {
    if (rows.length === 0) return;
    const transaction = writeTransaction(this.database, [ACCOUNT_STORES.events]);
    const store = transaction.objectStore(ACCOUNT_STORES.events);
    for (const row of rows) store.put(row);
    await finished(transaction);
  }

  writeEvent(row: MessageRow): Promise<void> {
    return this.writeEvents([row]);
  }

  readMarker(roomId: string): Promise<ReadMarker | null> {
    const store = this.database.transaction(ACCOUNT_STORES.markers, "readonly").objectStore(ACCOUNT_STORES.markers);
    return readOne(store.get(roomId), isReadMarker);
  }

  writeMarker(marker: ReadMarker): Promise<void> {
    const transaction = writeTransaction(this.database, [ACCOUNT_STORES.markers]);
    transaction.objectStore(ACCOUNT_STORES.markers).put(marker);
    return finished(transaction);
  }

  readSegment(roomId: string): Promise<Segment | null> {
    const store = this.database.transaction(ACCOUNT_STORES.segments, "readonly").objectStore(ACCOUNT_STORES.segments);
    return readOne(store.get(roomId), isSegment);
  }

  writeSegment(segment: Segment): Promise<void> {
    const transaction = writeTransaction(this.database, [ACCOUNT_STORES.segments]);
    transaction.objectStore(ACCOUNT_STORES.segments).put(segment);
    return finished(transaction);
  }

  // OutboxBackend

  put(record: OutboxRecord): Promise<void> {
    const transaction = writeTransaction(this.database, [ACCOUNT_STORES.outbox]);
    transaction.objectStore(ACCOUNT_STORES.outbox).put(record);
    return finished(transaction);
  }

  read(messageId: string): Promise<OutboxRecord | null> {
    const index = this.database
      .transaction(ACCOUNT_STORES.outbox, "readonly")
      .objectStore(ACCOUNT_STORES.outbox)
      .index(ACCOUNT_INDEXES.outboxMessage);
    return readOne(index.get(messageId), isOutboxRecord);
  }

  readByTransaction(transactionId: string): Promise<OutboxRecord | null> {
    const store = this.database.transaction(ACCOUNT_STORES.outbox, "readonly").objectStore(ACCOUNT_STORES.outbox);
    return readOne(store.get(transactionId), isOutboxRecord);
  }

  list(roomId?: string): Promise<readonly OutboxRecord[]> {
    const store = this.database.transaction(ACCOUNT_STORES.outbox, "readonly").objectStore(ACCOUNT_STORES.outbox);
    if (roomId === undefined) return readMany(store, null, isOutboxRecord);
    const index = store.index(ACCOUNT_INDEXES.outboxRoom);
    return readMany(index, IDBKeyRange.only(roomId), isOutboxRecord);
  }

  remove(transactionId: string): Promise<void> {
    const transaction = writeTransaction(this.database, [ACCOUNT_STORES.outbox]);
    transaction.objectStore(ACCOUNT_STORES.outbox).delete(transactionId);
    return finished(transaction);
  }

  async complete(record: OutboxRecord, row: MessageRow): Promise<void> {
    const transaction = writeTransaction(this.database, [ACCOUNT_STORES.outbox, ACCOUNT_STORES.events]);
    transaction.objectStore(ACCOUNT_STORES.outbox).delete(record.transactionId);
    transaction.objectStore(ACCOUNT_STORES.events).put(row);
    await finished(transaction);
  }
}
