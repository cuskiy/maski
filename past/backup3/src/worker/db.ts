import type { Message, Session } from "../core/types.ts";

export const DB_VERSION = 1;

const STORE = {
  meta: "meta",
  rooms: "rooms",
  events: "events",
  media: "media",
} as const;

const INDEX = {
  eventsRoom: "byRoom",
  eventsRoomTs: "byRoomTs",
  eventsToken: "byToken",
} as const;

export interface StoredSession {
  session: Session;
  token: string;
}

export interface MediaRow {
  key: string;
  mime: string;
  data: Blob;
}

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error ?? new Error("indexeddb"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb"));
  });
}

/** The account database. The worker opens it and nothing else does. */
export class AccountDb {
  private db: IDBDatabase | null = null;
  private readonly hash: string;

  constructor(hash: string) {
    this.hash = hash;
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(`maski-${this.hash}`, DB_VERSION);
      opening.onupgradeneeded = () => upgrade(opening.result);
      opening.onsuccess = () => {
        this.db = opening.result;
        resolve();
      };
      opening.onerror = () => reject(opening.error ?? new Error("indexeddb"));
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  async delete(): Promise<void> {
    this.close();
    await new Promise<void>((resolve) => {
      const deleting = indexedDB.deleteDatabase(`maski-${this.hash}`);
      deleting.onsuccess = () => resolve();
      deleting.onerror = () => resolve();
    });
  }

  async meta<T>(key: string, fallback: T): Promise<T> {
    const tx = this.handle().transaction(STORE.meta, "readonly");
    const value = await request(tx.objectStore(STORE.meta).get(key));
    return value === undefined ? fallback : (value as T);
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const tx = this.handle().transaction(STORE.meta, "readwrite");
    tx.objectStore(STORE.meta).put(value, key);
    await done(tx);
  }

  async get<T>(store: keyof typeof STORE, key: IDBValidKey): Promise<T | undefined> {
    const tx = this.handle().transaction(STORE[store], "readonly");
    const value = await request(tx.objectStore(STORE[store]).get(key));
    return value === undefined ? undefined : (value as T);
  }

  async del(store: keyof typeof STORE, key: IDBValidKey): Promise<void> {
    const tx = this.handle().transaction(STORE[store], "readwrite");
    tx.objectStore(STORE[store]).delete(key);
    await done(tx);
  }

  async putRooms(rooms: readonly { roomId: string }[]): Promise<void> {
    const tx = this.handle().transaction(STORE.rooms, "readwrite");
    for (const room of rooms) tx.objectStore(STORE.rooms).put(room, room.roomId);
    await done(tx);
  }

  async rooms<T>(): Promise<T[]> {
    const tx = this.handle().transaction(STORE.rooms, "readonly");
    return (await request(tx.objectStore(STORE.rooms).getAll())) as T[];
  }

  async putMessages(messages: readonly Message[]): Promise<void> {
    if (messages.length === 0) return;
    const tx = this.handle().transaction(STORE.events, "readwrite");
    for (const message of messages) tx.objectStore(STORE.events).put(message, message.id);
    await done(tx);
  }

  /** Newest last, the order the timeline draws. */
  async window(roomId: string, limit: number): Promise<Message[]> {
    const tx = this.handle().transaction(STORE.events, "readonly");
    const index = tx.objectStore(STORE.events).index(INDEX.eventsRoomTs);
    const range = IDBKeyRange.bound([roomId, 0, ""], [roomId, Number.MAX_SAFE_INTEGER, "\uffff"]);
    const rows: Message[] = [];
    await new Promise<void>((resolve) => {
      const cursor = index.openCursor(range, "prev");
      cursor.onsuccess = () => {
        const at = cursor.result;
        if (!at || rows.length >= limit) {
          resolve();
          return;
        }
        rows.push(at.value as Message);
        at.continue();
      };
      cursor.onerror = () => resolve();
    });
    return rows.toReversed();
  }

  async media(key: string): Promise<MediaRow | undefined> {
    return this.get<MediaRow>("media", key);
  }

  async putMedia(row: MediaRow): Promise<void> {
    const tx = this.handle().transaction(STORE.media, "readwrite");
    tx.objectStore(STORE.media).put(row, row.key);
    await done(tx);
  }

  private handle(): IDBDatabase {
    if (!this.db) throw new Error("the account database is not open");
    return this.db;
  }
}

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE.meta)) db.createObjectStore(STORE.meta);
  if (!db.objectStoreNames.contains(STORE.rooms)) db.createObjectStore(STORE.rooms);
  if (!db.objectStoreNames.contains(STORE.events)) {
    const events = db.createObjectStore(STORE.events);
    events.createIndex(INDEX.eventsRoom, "roomId");
    events.createIndex(INDEX.eventsRoomTs, ["roomId", "ts", "id"]);
    events.createIndex(INDEX.eventsToken, "tokens", { multiEntry: true });
  }
  if (!db.objectStoreNames.contains(STORE.media)) db.createObjectStore(STORE.media);
}
