/** The browser's normal persistent-storage request; never prompts in Chromium, may ask in Firefox. */
type Storage = Pick<StorageManager, "persist" | "persisted">;

let requested: Promise<boolean> | undefined;

export async function requestPersistentStorage(storage: Storage | undefined): Promise<boolean> {
  if (storage === undefined) return false;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

/** One request per page; a failure is not retried on every surface mount. */
export function keepStorage(storage: Storage | undefined = globalThis.navigator?.storage): Promise<boolean> {
  requested ??= requestPersistentStorage(storage);
  return requested;
}
