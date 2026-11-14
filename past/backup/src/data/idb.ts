import type { StoreDefinition } from "./schema";

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")));
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")));
  });
}

export function openDb(name: string, version: number, stores: readonly StoreDefinition[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, version);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const store of stores) {
        const objectStore = db.objectStoreNames.contains(store.name)
          ? open.transaction?.objectStore(store.name)
          : db.createObjectStore(store.name, { keyPath: store.keyPath });
        if (!objectStore) continue;
        for (const index of store.indexes ?? []) {
          if (objectStore.indexNames.contains(index.name)) continue;
          objectStore.createIndex(index.name, index.keyPath, {
            multiEntry: index.multiEntry ?? false,
            unique: index.unique ?? false,
          });
        }
      }
    };
    open.addEventListener("success", () => {
      const db = open.result;
      db.addEventListener("versionchange", () => db.close());
      resolve(db);
    });
    open.addEventListener("error", () => reject(open.error ?? new Error("IndexedDB open failed")));
    open.addEventListener("blocked", () => reject(new Error("IndexedDB open blocked by another connection")));
  });
}

export function getOne<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  const tx = db.transaction(store, "readonly");
  return requestResult(tx.objectStore(store).get(key)) as Promise<T | undefined>;
}

export function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  const tx = db.transaction(store, "readonly");
  return requestResult(tx.objectStore(store).getAll()) as Promise<T[]>;
}

export function getAllByIndex<T>(
  db: IDBDatabase,
  store: string,
  index: string,
  query?: IDBValidKey | IDBKeyRange,
  count?: number,
): Promise<T[]> {
  const tx = db.transaction(store, "readonly");
  const source = tx.objectStore(store).index(index);
  return requestResult(count === undefined ? source.getAll(query) : source.getAll(query, count)) as Promise<T[]>;
}

export function putOne(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  return transactionDone(tx);
}

export function putMany(db: IDBDatabase, store: string, values: readonly unknown[]): Promise<void> {
  if (values.length === 0) return Promise.resolve();
  const tx = db.transaction(store, "readwrite");
  const objectStore = tx.objectStore(store);
  for (const value of values) objectStore.put(value);
  return transactionDone(tx);
}

export function deleteOne(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  return transactionDone(tx);
}

export function clearStore(db: IDBDatabase, store: string): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  return transactionDone(tx);
}
