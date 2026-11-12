import { DB_VERSION, INDEX, STORE, accountDbName, upgradeAccount, type StoreName } from "../core/schema.ts";
import type { MediaRef, Message, Member, Pack, RoomSummary } from "../core/types.ts";

export interface RelationRecord {
  id: string;
  target: string;
  roomId: string;
  type: "reaction" | "edit";
  sender: string;
  key: string;
  body: string;
  html: string | null;
  ts: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface MediaRecord {
  key: string;
  mxc: string;
  mime: string;
  data: Blob;
  lastUsed: number;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb transaction aborted"));
  });
}

export class AccountDb {
  readonly hash: string;
  private db: IDBDatabase | null = null;

  constructor(hash: string) {
    this.hash = hash;
  }

  async open(): Promise<void> {
    if (this.db) return;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(accountDbName(this.hash), DB_VERSION);
      req.onupgradeneeded = () => upgradeAccount(req.result);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("cannot open the account database"));
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  async clear(): Promise<void> {
    const db = this.handle();
    const names = [...db.objectStoreNames];
    const tx = db.transaction(names, "readwrite");
    for (const name of names) tx.objectStore(name).clear();
    await done(tx);
  }

  private handle(): IDBDatabase {
    if (!this.db) throw new Error("account database is not open");
    return this.db;
  }

  async put<T>(store: StoreName, value: T): Promise<void> {
    const tx = this.handle().transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    await done(tx);
  }

  async putAll<T>(store: StoreName, values: T[]): Promise<void> {
    if (values.length === 0) return;
    const tx = this.handle().transaction(store, "readwrite");
    const target = tx.objectStore(store);
    for (const value of values) target.put(value);
    await done(tx);
  }

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const tx = this.handle().transaction(store, "readonly");
    const result = await request(tx.objectStore(store).get(key));
    return result as T | undefined;
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const tx = this.handle().transaction(store, "readonly");
    return (await request(tx.objectStore(store).getAll())) as T[];
  }

  async del(store: StoreName, key: IDBValidKey): Promise<void> {
    const tx = this.handle().transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    await done(tx);
  }

  async delMatching(store: StoreName, index: string, key: IDBValidKey): Promise<void> {
    const tx = this.handle().transaction(store, "readwrite");
    const source = tx.objectStore(store).index(index);
    const keys = await request(source.getAllKeys(key));
    for (const primary of keys) tx.objectStore(store).delete(primary);
    await done(tx);
  }

  async roomWindow(roomId: string, limit: number): Promise<Message[]> {
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
      cursor.onerror = () => reject(cursor.error ?? new Error("cursor failed"));
    });
    return rows.toReversed();
  }

  async byStatus(statuses: string[]): Promise<Message[]> {
    const tx = this.handle().transaction(STORE.events, "readonly");
    const index = tx.objectStore(STORE.events).index(INDEX.eventsStatus);
    const rows: Message[] = [];
    for (const status of statuses) rows.push(...((await request(index.getAll(status))) as Message[]));
    return rows;
  }

  async rawEvents(roomId: string): Promise<Message[]> {
    const tx = this.handle().transaction(STORE.events, "readonly");
    const index = tx.objectStore(STORE.events).index(INDEX.eventsRoom);
    return (await request(index.getAll(roomId))) as Message[];
  }

  async search(tokens: string[], roomId: string | null, limit: number): Promise<Message[]> {
    if (tokens.length === 0) return [];
    const tx = this.handle().transaction(STORE.events, "readonly");
    const index = tx.objectStore(STORE.events).index(INDEX.eventsSearch);
    let keys: IDBValidKey[] | null = null;
    for (const token of tokens) {
      const range = IDBKeyRange.bound(token, `${token}\uffff`);
      const found = new Set<IDBValidKey>(await request(index.getAllKeys(range)));
      const previous: IDBValidKey[] = keys ?? [...found];
      keys = previous.filter((key) => found.has(key));
      if (keys.length === 0) return [];
    }
    const rows: Message[] = [];
    for (const key of keys ?? []) {
      const row = (await request(index.objectStore.get(key))) as Message | undefined;
      if (!row) continue;
      if (roomId && row.roomId !== roomId) continue;
      if (row.status !== "sent") continue;
      rows.push(row);
    }
    return rows.toSorted((a, b) => b.ts - a.ts).slice(0, limit);
  }

  putRoom(room: RoomSummary): Promise<void> {
    return this.put(STORE.rooms, room);
  }

  getRoom(roomId: string): Promise<RoomSummary | undefined> {
    return this.get<RoomSummary>(STORE.rooms, roomId);
  }

  putMessage(message: Message): Promise<void> {
    return this.put(STORE.events, message);
  }

  async putMessages(messages: Message[]): Promise<void> {
    await this.putAll(STORE.events, messages);
  }

  async hasMembers(roomId: string): Promise<boolean> {
    const tx = this.handle().transaction(STORE.members, "readonly");
    const count = await request(tx.objectStore(STORE.members).index(INDEX.membersRoom).count(roomId));
    return count > 0;
  }

  async putMembers(members: Member[]): Promise<void> {
    await this.putAll(STORE.members, members);
  }

  async putPacks(packs: Pack[]): Promise<void> {
    await this.putAll(STORE.packs, packs);
  }

  async putRelation(relation: RelationRecord): Promise<void> {
    await this.put(STORE.relations, relation);
  }

  async relationsTo(target: string): Promise<RelationRecord[]> {
    const tx = this.handle().transaction(STORE.relations, "readonly");
    const index = tx.objectStore(STORE.relations).index(INDEX.relationsTarget);
    return (await request(index.getAll(target))) as RelationRecord[];
  }

  async meta<T>(key: string, fallback: T): Promise<T> {
    const record = await this.get<MetaRecord>(STORE.meta, key);
    return (record?.value as T | undefined) ?? fallback;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.put<MetaRecord>(STORE.meta, { key, value });
  }

  async media(key: string): Promise<MediaRecord | undefined> {
    return this.get<MediaRecord>(STORE.media, key);
  }

  async putMedia(record: MediaRecord): Promise<void> {
    await this.put(STORE.media, record);
  }
}

export type { MediaRef };
