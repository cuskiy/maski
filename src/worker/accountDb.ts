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
import { isOutboxRecord, type OutboxBackend, type OutboxRecord } from "./outbox.ts";
import { isMediaCacheRecord, isMediaSource } from "./mediaTypes.ts";
import type { MediaCacheRecord, MediaCacheUsage, MediaSource } from "./mediaTypes.ts";

const ACCOUNT_DB_VERSION = 3;

const ACCOUNT_STORES = {
  rooms: "rooms",
  events: "events",
  outbox: "outbox",
  markers: "markers",
  segments: "segments",
  media: "media",
  mediaUsage: "mediaUsage",
  mediaSources: "mediaSources",
} as const;

const ACCOUNT_INDEXES = {
  eventsRoomTs: "roomTs",
  eventsRoomEvent: "roomEvent",
  outboxMessage: "messageId",
  outboxRoom: "roomId",
  mediaUsageLastUsed: "lastUsed",
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
      events.createIndex(ACCOUNT_INDEXES.eventsRoomEvent, ["roomId", "eventId"]);
    } else {
      const events = request.transaction?.objectStore(ACCOUNT_STORES.events);
      if (events !== undefined && !events.indexNames.contains(ACCOUNT_INDEXES.eventsRoomEvent)) {
        events.createIndex(ACCOUNT_INDEXES.eventsRoomEvent, ["roomId", "eventId"]);
      }
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
    if (!database.objectStoreNames.contains(ACCOUNT_STORES.media)) {
      database.createObjectStore(ACCOUNT_STORES.media, { keyPath: "key" });
    }
    if (!database.objectStoreNames.contains(ACCOUNT_STORES.mediaUsage)) {
      const usage = database.createObjectStore(ACCOUNT_STORES.mediaUsage, { keyPath: "key" });
      usage.createIndex(ACCOUNT_INDEXES.mediaUsageLastUsed, "lastUsed");
    }
    if (!database.objectStoreNames.contains(ACCOUNT_STORES.mediaSources)) {
      database.createObjectStore(ACCOUNT_STORES.mediaSources, {
        keyPath: ["roomId", "messageId"],
      });
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

function isMediaUsage(value: unknown): value is MediaCacheUsage {
  return (
    isRecord(value) &&
    typeof value["key"] === "string" &&
    typeof value["size"] === "number" &&
    typeof value["lastUsed"] === "number"
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
      ACCOUNT_STORES.mediaSources,
    ]);
    const events = transaction.objectStore(ACCOUNT_STORES.events);
    const sources = transaction.objectStore(ACCOUNT_STORES.mediaSources);
    transaction.objectStore(ACCOUNT_STORES.rooms).delete(roomId);
    transaction.objectStore(ACCOUNT_STORES.markers).delete(roomId);
    transaction.objectStore(ACCOUNT_STORES.segments).delete(roomId);
    const sourceCursor = sources.openCursor(IDBKeyRange.bound([roomId], [roomId, []]));
    sourceCursor.onsuccess = () => {
      const cursor = sourceCursor.result;
      if (cursor === null) return;
      cursor.delete();
      cursor.continue();
    };
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

  readEvent(roomId: string, eventId: string): Promise<MessageRow | null> {
    const index = this.database
      .transaction(ACCOUNT_STORES.events, "readonly")
      .objectStore(ACCOUNT_STORES.events)
      .index(ACCOUNT_INDEXES.eventsRoomEvent);
    return readOne(index.get([roomId, eventId]), isMessageRow);
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

  // Worker-only media: the source rows keep mxc/keys out of the client projection.

  readMediaSource(roomId: string, messageId: string): Promise<MediaSource | null> {
    const store = this.database
      .transaction(ACCOUNT_STORES.mediaSources, "readonly")
      .objectStore(ACCOUNT_STORES.mediaSources);
    return readOne(store.get([roomId, messageId]), isMediaSource);
  }

  writeMediaSource(source: MediaSource): Promise<void> {
    return this.writeMediaSources([source]);
  }

  async writeMediaSources(sources: readonly MediaSource[]): Promise<void> {
    if (sources.length === 0) return;
    const transaction = writeTransaction(this.database, [ACCOUNT_STORES.mediaSources]);
    const store = transaction.objectStore(ACCOUNT_STORES.mediaSources);
    for (const source of sources) store.put(source);
    await finished(transaction);
  }

  readMediaCache(key: string): Promise<MediaCacheRecord | null> {
    const store = this.database.transaction(ACCOUNT_STORES.media, "readonly").objectStore(ACCOUNT_STORES.media);
    return readOne(store.get(key), isMediaCacheRecord);
  }

  async writeMediaCache(record: MediaCacheRecord): Promise<void> {
    const transaction = writeTransaction(this.database, [ACCOUNT_STORES.media, ACCOUNT_STORES.mediaUsage]);
    transaction.objectStore(ACCOUNT_STORES.media).put(record);
    transaction
      .objectStore(ACCOUNT_STORES.mediaUsage)
      .put({ key: record.key, size: record.size, lastUsed: record.lastUsed });
    await finished(transaction);
  }

  async removeMediaCache(key: string): Promise<void> {
    const transaction = writeTransaction(this.database, [ACCOUNT_STORES.media, ACCOUNT_STORES.mediaUsage]);
    transaction.objectStore(ACCOUNT_STORES.media).delete(key);
    transaction.objectStore(ACCOUNT_STORES.mediaUsage).delete(key);
    await finished(transaction);
  }

  readMediaUsage(): Promise<readonly MediaCacheUsage[]> {
    const store = this.database
      .transaction(ACCOUNT_STORES.mediaUsage, "readonly")
      .objectStore(ACCOUNT_STORES.mediaUsage);
    return readMany(store, null, isMediaUsage);
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
