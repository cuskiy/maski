import type { Session } from "../core/types.ts";

export const DB_VERSION = 1;

const STORE = {
  meta: "meta",
  rooms: "rooms",
} as const;

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

export interface StoredSession {
  session: Session;
  token: string;
}

/** The account database. Only the worker opens it. */
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
    await new Promise<void>((resolve, reject) => {
      const deleting = indexedDB.deleteDatabase(`maski-${this.hash}`);
      deleting.onsuccess = () => resolve();
      deleting.onerror = () => reject(deleting.error ?? new Error("indexeddb"));
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

  async clear(): Promise<void> {
    for (const store of Object.values(STORE)) {
      const tx = this.handle().transaction(store, "readwrite");
      tx.objectStore(store).clear();
      await done(tx);
    }
  }

  private handle(): IDBDatabase {
    if (!this.db) throw new Error("the account database is not open");
    return this.db;
  }
}

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE.meta)) db.createObjectStore(STORE.meta);
  if (!db.objectStoreNames.contains(STORE.rooms)) db.createObjectStore(STORE.rooms);
}
