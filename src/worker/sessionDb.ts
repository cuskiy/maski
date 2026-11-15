import { isRecord } from "../lib/json.ts";

export interface StoredSession {
  readonly baseUrl: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly accessToken: string;
  readonly refreshToken: string | null;
}

const DB_NAME = "maski:matrix";
const DB_VERSION = 1;
const STORE = "session";
const KEY = "active";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("session database failed"));
  });
}

function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const tx = database.transaction(STORE, mode);
        const request = operation(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("session request failed"));
        tx.oncomplete = () => database.close();
        tx.onerror = () => {
          database.close();
          reject(tx.error ?? new Error("session transaction failed"));
        };
      }),
  );
}

export async function readSession(): Promise<StoredSession | null> {
  try {
    const value: unknown = await transaction("readonly", (store) => store.get(KEY));
    if (!isRecord(value)) return null;
    if (
      typeof value["baseUrl"] !== "string" ||
      typeof value["userId"] !== "string" ||
      typeof value["deviceId"] !== "string" ||
      typeof value["accessToken"] !== "string"
    ) {
      return null;
    }
    return {
      baseUrl: value["baseUrl"],
      userId: value["userId"],
      deviceId: value["deviceId"],
      accessToken: value["accessToken"],
      refreshToken: typeof value["refreshToken"] === "string" ? value["refreshToken"] : null,
    };
  } catch {
    return null;
  }
}

export async function writeSession(session: StoredSession): Promise<void> {
  await transaction("readwrite", (store) => store.put(session, KEY));
}

export async function clearSession(): Promise<void> {
  try {
    await transaction("readwrite", (store) => store.delete(KEY));
  } catch {
    // The worker is already signed out from its in-memory state.
  }
}
