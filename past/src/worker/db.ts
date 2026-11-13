import type { MediaRef, Member, Message, Room } from "../core/types.ts";

export const DB_VERSION = 1;

export const STORE = {
  meta: "meta",
  rooms: "rooms",
  events: "events",
  members: "members",
  media: "media",
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

const INDEX = {
  eventsRoom: "byRoom",
  eventsRoomTs: "byRoomTs",
  eventsStatus: "byStatus",
  eventsSearch: "byToken",
  membersRoom: "byRoom",
} as const;

interface MediaRow {
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

/** The account database, opened by the worker and by nobody else. */
export class AccountDb {
  private db: IDBDatabase | null = null;
  private readonly name: string;

  constructor(hash: string) {
    this.name = `maski-${hash}`;
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(this.name, DB_VERSION);
      open.onupgradeneeded = () => upgrade(open.result);
      open.onsuccess = () => {
        this.db = open.result;
        resolve();
      };
      open.onerror = () => reject(open.error ?? new Error("indexeddb"));
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  async clear(): Promise<void> {
    for (const store of Object.values(STORE)) {
      const tx = this.handle().transaction(store, "readwrite");
      await request(tx.objectStore(store).clear());
      await done(tx);
    }
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

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const tx = this.handle().transaction(store, "readonly");
    const value = await request(tx.objectStore(store).get(key));
    return value === undefined ? undefined : (value as T);
  }

  async del(store: StoreName, key: IDBValidKey): Promise<void> {
    const tx = this.handle().transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    await done(tx);
  }

  async putRooms(rooms: Room[]): Promise<void> {
    const tx = this.handle().transaction(STORE.rooms, "readwrite");
    for (const room of rooms) tx.objectStore(STORE.rooms).put(room, room.roomId);
    await done(tx);
  }

  async delRoom(roomId: string): Promise<void> {
    const tx = this.handle().transaction([STORE.rooms, STORE.events, STORE.members], "readwrite");
    tx.objectStore(STORE.rooms).delete(roomId);
    const events = tx.objectStore(STORE.events).index(INDEX.eventsRoom);
    const keys = await request(events.getAllKeys(roomId));
    for (const key of keys) tx.objectStore(STORE.events).delete(key);
    const members = tx.objectStore(STORE.members).index(INDEX.membersRoom);
    const memberKeys = await request(members.getAllKeys(roomId));
    for (const key of memberKeys) tx.objectStore(STORE.members).delete(key);
    await done(tx);
  }

  async rooms(): Promise<Room[]> {
    const tx = this.handle().transaction(STORE.rooms, "readonly");
    return (await request(tx.objectStore(STORE.rooms).getAll())) as Room[];
  }

  async room(roomId: string): Promise<Room | undefined> {
    return this.get<Room>(STORE.rooms, roomId);
  }

  async putMessage(message: Message): Promise<void> {
    const tx = this.handle().transaction(STORE.events, "readwrite");
    tx.objectStore(STORE.events).put(message, message.id);
    await done(tx);
  }

  async putMessages(messages: Message[]): Promise<void> {
    if (messages.length === 0) return;
    const tx = this.handle().transaction(STORE.events, "readwrite");
    for (const message of messages) tx.objectStore(STORE.events).put(message, message.id);
    await done(tx);
  }

  async message(id: string): Promise<Message | undefined> {
    return this.get<Message>(STORE.events, id);
  }

  async delMessage(id: string): Promise<void> {
    await this.del(STORE.events, id);
  }

  /** Newest last, which is the order the timeline draws. */
  async window(roomId: string, limit: number): Promise<Message[]> {
    const tx = this.handle().transaction(STORE.events, "readonly");
    const index = tx.objectStore(STORE.events).index(INDEX.eventsRoomTs);
    const range = IDBKeyRange.bound([roomId, 0, ""], [roomId, Number.MAX_SAFE_INTEGER, "\uffff"]);
    const rows: Message[] = [];
    await new Promise<void>((resolve, reject) => {
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
      cursor.onerror = () => reject(cursor.error ?? new Error("indexeddb"));
    });
    return rows.reverse();
  }

  async countRoom(roomId: string): Promise<number> {
    const tx = this.handle().transaction(STORE.events, "readonly");
    return request(tx.objectStore(STORE.events).index(INDEX.eventsRoom).count(roomId));
  }

  async members(roomId: string): Promise<Member[]> {
    const tx = this.handle().transaction(STORE.members, "readonly");
    return (await request(tx.objectStore(STORE.members).index(INDEX.membersRoom).getAll(roomId))) as Member[];
  }

  async putMembers(members: Member[]): Promise<void> {
    if (members.length === 0) return;
    const tx = this.handle().transaction(STORE.members, "readwrite");
    for (const member of members) tx.objectStore(STORE.members).put(member, [member.roomId, member.userId]);
    await done(tx);
  }

  async media(key: string): Promise<MediaRow | undefined> {
    return this.get<MediaRow>(STORE.media, key);
  }

  async putMedia(row: MediaRow): Promise<void> {
    const tx = this.handle().transaction(STORE.media, "readwrite");
    tx.objectStore(STORE.media).put(row, row.key);
    await done(tx);
  }

  /** Search is an index read in the worker, never a scan in the interface. */
  async search(words: string[], limit: number): Promise<Message[]> {
    if (words.length === 0) return [];
    const tx = this.handle().transaction(STORE.events, "readonly");
    const index = tx.objectStore(STORE.events).index(INDEX.eventsSearch);
    let found: Set<string> | null = null;
    for (const word of words) {
      const ids = new Set<string>();
      const keys = await request(index.getAllKeys(IDBKeyRange.bound(word, `${word}\uffff`)));
      for (const key of keys) ids.add(String(key));
      found = found === null ? ids : new Set([...found].filter((id) => ids.has(id)));
      if (found.size === 0) return [];
    }
    const rows: Message[] = [];
    for (const id of found ?? []) {
      const message = await this.message(id);
      if (message) rows.push(message);
      if (rows.length >= limit) break;
    }
    return rows.toSorted((a, b) => b.ts - a.ts);
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
    events.createIndex(INDEX.eventsStatus, "status");
    events.createIndex(INDEX.eventsSearch, "tokens", { multiEntry: true });
  }
  if (!db.objectStoreNames.contains(STORE.members)) {
    const members = db.createObjectStore(STORE.members);
    members.createIndex(INDEX.membersRoom, "roomId");
  }
  if (!db.objectStoreNames.contains(STORE.media)) db.createObjectStore(STORE.media);
}
