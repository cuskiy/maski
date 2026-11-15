import assert from "node:assert/strict";
import test from "node:test";
import { createDraftStore } from "../src/client/uiDb.ts";
import type { DraftBackend, DraftRecord, LegacyDraft } from "../src/client/uiDb.ts";

interface MemoryBackend extends DraftBackend {
  readonly rows: Map<string, DraftRecord>;
}

function recordKey(account: string, roomId: string): string {
  return `${account}\u0000${roomId}`;
}

function memoryBackend(): MemoryBackend {
  const rows = new Map<string, DraftRecord>();
  return {
    rows,
    load(account) {
      return Promise.resolve([...rows.values()].filter((row) => row.account === account));
    },
    put(record) {
      rows.set(recordKey(record.account, record.roomId), record);
      return Promise.resolve();
    },
    remove(account, roomId) {
      rows.delete(recordKey(account, roomId));
      return Promise.resolve();
    },
    clear(account) {
      for (const [entry, row] of rows) {
        if (row.account === account) rows.delete(entry);
      }
      return Promise.resolve();
    },
  };
}

const accountA = "@a:example.org";
const accountB = "@b:example.org";
const roomId = "!room:example.org";

void test("drafts are account-scoped and cleared on logout", async () => {
  const backend = memoryBackend();
  const store = createDraftStore({ backend });

  await store.hydrate(accountA);
  store.write(accountA, roomId, "draft a");
  assert.equal(backend.rows.get(recordKey(accountA, roomId))?.value, "draft a");
  await store.hydrate(accountA);
  assert.equal(store.read(accountA, roomId), "draft a");
  assert.equal(store.read(accountB, roomId), "");

  await store.hydrate(accountB);
  assert.equal(store.read(accountB, roomId), "");
  store.write(accountB, roomId, "draft b");
  await store.hydrate(accountB);
  assert.equal(store.read(accountA, roomId), "draft a");
  assert.equal(store.read(accountB, roomId), "draft b");

  await store.hydrate(accountA);
  assert.equal(store.read(accountA, roomId), "draft a");
  assert.equal(store.read(accountB, roomId), "draft b");

  await store.clear(accountA);
  assert.equal(store.read(accountA, roomId), "");
  store.write(accountA, roomId, "written after logout");
  assert.equal(store.read(accountA, roomId), "");
  await store.hydrate(accountA);
  assert.equal(store.read(accountA, roomId), "");
  await store.hydrate(accountB);
  assert.equal(store.read(accountB, roomId), "draft b");
});

void test("legacy localStorage drafts migrate once, account-scoped first", async () => {
  const backend = memoryBackend();
  const legacyRows = new Map<string, LegacyDraft>();
  const addLegacy = (key: string, account: string | null, room: string, value: string): void => {
    legacyRows.set(key, { key, account, roomId: room, value });
  };
  addLegacy(`maski.draft.${accountA}.${roomId}`, accountA, roomId, "scoped a");
  addLegacy("maski.draft.!loose:example.org", null, "!loose:example.org", "loose draft");
  addLegacy(`maski.draft.${accountB}.${roomId}`, accountB, roomId, "scoped b");
  const store = createDraftStore({
    backend,
    legacy: {
      scan() {
        return [...legacyRows.values()];
      },
      remove(key) {
        legacyRows.delete(key);
      },
    },
  });

  await backend.put({ account: accountA, roomId, value: "database a" });
  await store.hydrate(accountA);
  assert.equal(store.read(accountA, roomId), "database a");
  assert.equal(store.read(accountA, "!loose:example.org"), "loose draft");
  assert.equal(store.read(accountB, roomId), "");
  assert.deepEqual([...legacyRows.keys()], [`maski.draft.${accountB}.${roomId}`]);

  await store.hydrate(accountB);
  assert.equal(store.read(accountB, roomId), "scoped b");
  assert.deepEqual([...legacyRows.keys()], []);
});

void test("logout removes the account's legacy localStorage drafts", async () => {
  const backend = memoryBackend();
  const legacyRows = new Map<string, LegacyDraft>();
  const addLegacy = (key: string, account: string | null, room: string, value: string): void => {
    legacyRows.set(key, { key, account, roomId: room, value });
  };
  addLegacy(`maski.draft.${accountA}.${roomId}`, accountA, roomId, "draft a");
  addLegacy("maski.draft.!loose:example.org", null, "!loose:example.org", "loose draft");
  addLegacy(`maski.draft.${accountB}.${roomId}`, accountB, roomId, "draft b");
  const store = createDraftStore({
    backend,
    legacy: {
      scan() {
        return [...legacyRows.values()];
      },
      remove(entry) {
        legacyRows.delete(entry);
      },
    },
  });

  store.write(accountA, roomId, "draft a");
  await store.clear(accountA);
  assert.equal(store.read(accountA, roomId), "");
  assert.equal(backend.rows.size, 0);
  assert.deepEqual([...legacyRows.keys()], [`maski.draft.${accountB}.${roomId}`]);
});
