/**
 * The account-scoped UI database. Drafts live in IndexedDB and are mirrored in memory so the composer
 * reads synchronously; a write updates the mirror first and persists behind it.
 */
import { isRecord } from "../lib/json.ts";
import * as storage from "./storage.ts";

export interface DraftRecord {
  readonly account: string;
  readonly roomId: string;
  readonly value: string;
}

export interface DraftBackend {
  load(account: string): Promise<readonly DraftRecord[]>;
  put(record: DraftRecord): Promise<void>;
  remove(account: string, roomId: string): Promise<void>;
  clear(account: string): Promise<void>;
}

export interface LegacyDraft {
  readonly key: string;
  readonly account: string | null;
  readonly roomId: string;
  readonly value: string;
}

export interface LegacyDraftSource {
  scan(): readonly LegacyDraft[];
  remove(key: string): void;
}

export interface DraftStore {
  hydrate(account: string): Promise<void>;
  read(account: string, roomId: string): string;
  write(account: string, roomId: string, value: string): void;
  clear(account: string): Promise<void>;
}

const DB_NAME = "maski:ui";
const DB_VERSION = 1;
const DRAFT_STORE = "drafts";
const ACCOUNT_INDEX = "account";
const LEGACY_PREFIX = "maski.draft.";

function isDraftRecord(value: unknown): value is DraftRecord {
  return (
    isRecord(value) &&
    typeof value["account"] === "string" &&
    typeof value["roomId"] === "string" &&
    typeof value["value"] === "string"
  );
}

function cacheKey(account: string, roomId: string): string {
  return `${account}\u0000${roomId}`;
}

function forgetAccount(cache: Map<string, string>, account: string): void {
  const prefix = `${account}\u0000`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

let database: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (database === null) {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const current = request.result;
        if (current.objectStoreNames.contains(DRAFT_STORE)) return;
        const store = current.createObjectStore(DRAFT_STORE, { keyPath: ["account", "roomId"] });
        store.createIndex(ACCOUNT_INDEX, "account");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("The UI database could not open"));
      request.onblocked = () => reject(new Error("The UI database is blocked by another tab"));
    } catch (error) {
      reject(error);
    }
    database = promise.catch((error: unknown) => {
      database = null;
      throw error;
    });
  }
  return database;
}

function readTransaction<T>(operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((current) => {
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const transaction = current.transaction(DRAFT_STORE, "readonly");
    const request = operation(transaction.objectStore(DRAFT_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The UI database read failed"));
    return promise;
  });
}

function writeTransaction(operation: (store: IDBObjectStore) => void): Promise<void> {
  return openDatabase().then((current) => {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const transaction = current.transaction(DRAFT_STORE, "readwrite");
    operation(transaction.objectStore(DRAFT_STORE));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("The UI database write failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("The UI database write aborted"));
    return promise;
  });
}

async function clearRows(account: string): Promise<void> {
  const current = await openDatabase();
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const transaction = current.transaction(DRAFT_STORE, "readwrite");
  const store = transaction.objectStore(DRAFT_STORE);
  const request = store.index(ACCOUNT_INDEX).openKeyCursor(IDBKeyRange.only(account));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor === null) return;
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("The UI database clear failed"));
  transaction.onabort = () => reject(transaction.error ?? new Error("The UI database clear aborted"));
  await promise;
}

const indexedDbBackend: DraftBackend = {
  async load(account) {
    const value: unknown = await readTransaction((store) => store.index(ACCOUNT_INDEX).getAll(account));
    return Array.isArray(value) ? value.filter(isDraftRecord).filter((draft) => draft.account === account) : [];
  },
  put(record) {
    return writeTransaction((store) => {
      store.put(record);
    });
  },
  remove(account, roomId) {
    return writeTransaction((store) => {
      store.delete([account, roomId]);
    });
  },
  clear: clearRows,
};

/** Reads legacy draft keys once so the caller can move them; this path removes them, never writes one. */
function legacyDrafts(): readonly LegacyDraft[] {
  const drafts: LegacyDraft[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key === null || !key.startsWith(LEGACY_PREFIX)) continue;
      const rest = key.slice(LEGACY_PREFIX.length);
      const value = storage.read(key);
      if (value === null) continue;
      if (rest.startsWith("@")) {
        const separator = rest.indexOf(".!");
        if (separator <= 0) continue;
        drafts.push({
          key,
          account: rest.slice(0, separator),
          roomId: rest.slice(separator + 1),
          value,
        });
      } else if (rest.startsWith("!") || rest.startsWith("#")) {
        drafts.push({ key, account: null, roomId: rest, value });
      }
    }
  } catch {
    // localStorage is unavailable; the database is the only store left.
  }
  return drafts;
}

const legacyStorage: LegacyDraftSource = {
  scan: legacyDrafts,
  remove(key) {
    storage.write(key, null);
  },
};

export function createDraftStore({
  backend,
  legacy,
}: {
  readonly backend: DraftBackend;
  readonly legacy?: LegacyDraftSource;
}): DraftStore {
  const cache = new Map<string, string>();
  const cleared = new Set<string>();

  return {
    async hydrate(account) {
      cleared.delete(account);
      forgetAccount(cache, account);
      try {
        for (const draft of await backend.load(account)) {
          if (draft.account === account && draft.value !== "") {
            cache.set(cacheKey(account, draft.roomId), draft.value);
          }
        }
      } catch {
        // The mirror still serves this session; persistence is retried by the next write.
      }
      const pendingDrafts = (legacy?.scan() ?? []).toSorted(
        (left, right) => Number(left.account === null) - Number(right.account === null),
      );
      for (const draft of pendingDrafts) {
        // An unowned legacy draft cannot be proven to belong to this account; drop it.
        if (draft.account === null) {
          legacy?.remove(draft.key);
          continue;
        }
        if (draft.account !== account) continue;
        const key = cacheKey(account, draft.roomId);
        if (draft.value !== "" && !cache.has(key)) {
          cache.set(key, draft.value);
          try {
            await backend.put({ account, roomId: draft.roomId, value: draft.value });
          } catch {
            // The draft survives in memory for this session; the legacy key still goes away.
          }
        }
        legacy?.remove(draft.key);
      }
    },
    read(account, roomId) {
      return cache.get(cacheKey(account, roomId)) ?? "";
    },
    write(account, roomId, value) {
      if (cleared.has(account)) return;
      const key = cacheKey(account, roomId);
      if (value === "") cache.delete(key);
      else cache.set(key, value);
      const operation = value === "" ? backend.remove(account, roomId) : backend.put({ account, roomId, value });
      void operation.catch(() => undefined);
    },
    async clear(account) {
      cleared.add(account);
      forgetAccount(cache, account);
      try {
        await backend.clear(account);
      } catch {
        // The mirror is already empty; a failed store must not keep the session signed in.
      }
      for (const draft of legacy?.scan() ?? []) {
        if (draft.account === account) legacy?.remove(draft.key);
      }
    },
  };
}

const store = createDraftStore({ backend: indexedDbBackend, legacy: legacyStorage });

export function hydrateDrafts(account: string): Promise<void> {
  return store.hydrate(account);
}

export function readDraft(account: string, roomId: string): string {
  return store.read(account, roomId);
}

export function saveDraft(account: string, roomId: string, value: string): void {
  store.write(account, roomId, value);
}

export function clearDrafts(account: string): Promise<void> {
  return store.clear(account);
}
