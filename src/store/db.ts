import {
  ACCOUNT_DB_VERSION,
  ACCOUNT_STORES,
  STORE,
  UI_DB_VERSION,
  UI_DB_NAME,
  UI_STORES,
  accountDb,
  deleteOne,
  getAll,
  getOne,
  openDb,
  putOne,
  requestResult,
  transactionDone,
} from "../data";
import type {
  DraftRecord,
  EventRecord,
  MemberRecord,
  MetaRecord,
  OutboxRecord,
  PackRecord,
  RoomRecord,
  ScrollRecord,
  SettingRecord,
} from "../data/records";
import { matchesTokens, searchTokens } from "../data/text";

export interface ProjectionRead {
  revision: number;
  rooms: RoomRecord[];
  events: EventRecord[];
  members: MemberRecord[];
  packs: PackRecord[];
  outbox: OutboxRecord[];
}

export class MainDb {
  private account: IDBDatabase | null = null;
  private ui: IDBDatabase | null = null;
  private hash: string | null = null;

  async open(): Promise<void> {
    if (!this.ui) {
      this.ui = await openDb(UI_DB_NAME, UI_DB_VERSION, UI_STORES);
    }
  }

  async openAccount(hash: string): Promise<void> {
    await this.open();
    if (this.hash === hash && this.account) return;
    this.account?.close();
    this.account = await openDb(accountDb(hash), ACCOUNT_DB_VERSION, ACCOUNT_STORES);
    this.hash = hash;
  }

  closeAccount(): void {
    this.account?.close();
    this.account = null;
    this.hash = null;
  }

  // Only the open room's timeline is read: every other room is a summary in
  // `rooms`, and its events stay on disk until it is opened.
  async readProjection(roomId: string | null): Promise<ProjectionRead> {
    const account = this.requireAccount();
    const [rooms, members, packs, outbox, meta] = await Promise.all([
      getAll<RoomRecord>(account, STORE.rooms),
      getAll<MemberRecord>(account, STORE.members),
      getAll<PackRecord>(account, STORE.packs),
      getAll<OutboxRecord>(account, STORE.outbox),
      getOne<MetaRecord>(account, STORE.meta, "projectionRevision"),
    ]);
    const events = roomId ? await this.readRoomEvents(roomId) : [];
    return {
      revision: typeof meta?.value === "number" ? meta.value : 0,
      rooms: rooms.toSorted((a, b) => b.lastTs - a.lastTs),
      events: events.toSorted((a, b) => a.ts - b.ts),
      members,
      packs,
      outbox,
    };
  }

  // Read backwards so the newest `limit` rows are the ones that come back.
  async readRoomEvents(roomId: string, limit = 2000): Promise<EventRecord[]> {
    const account = this.requireAccount();
    const tx = account.transaction(STORE.events, "readonly");
    const index = tx.objectStore(STORE.events).index("roomTs");
    const range = IDBKeyRange.bound(
      [roomId, Number.MIN_SAFE_INTEGER, ""],
      [roomId, Number.MAX_SAFE_INTEGER, "\uffff"],
    );
    const request = index.openCursor(range, "prev");
    const events: EventRecord[] = [];
    await new Promise<void>((resolve, reject) => {
      request.addEventListener("success", () => {
        const cursor = request.result;
        if (!cursor || events.length >= limit) {
          resolve();
          return;
        }
        events.push(cursor.value as EventRecord);
        cursor.continue();
      });
      request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB cursor failed")));
    });
    return events.toSorted((a, b) => a.ts - b.ts);
  }

  async search(query: string, roomId: string | null, limit: number): Promise<EventRecord[]> {
    const tokens = searchTokens(query);
    if (tokens.length === 0) return [];
    const account = this.requireAccount();
    const tx = account.transaction(STORE.events, "readonly");
    const index = tx.objectStore(STORE.events).index("byToken");
    const results = new Map<string, EventRecord>();
    for (const token of tokens) {
      const range = IDBKeyRange.bound(token, `${token}\uffff`);
      const rows = (await requestResult(index.getAll(range))) as EventRecord[];
      for (const row of rows) {
        if (roomId && row.roomId !== roomId) continue;
        if (!matchesTokens(row.tokens, tokens)) continue;
        results.set(row.eventId, row);
      }
    }
    return [...results.values()]
      .toSorted((a, b) => b.ts - a.ts)
      .slice(0, limit);
  }

  async writeOutbox(record: OutboxRecord): Promise<void> {
    await putOne(this.requireAccount(), STORE.outbox, record);
  }

  async deleteOutbox(txnId: string): Promise<void> {
    await deleteOne(this.requireAccount(), STORE.outbox, txnId);
  }

  async readOutbox(): Promise<OutboxRecord[]> {
    return getAll<OutboxRecord>(this.requireAccount(), STORE.outbox);
  }

  async readSettings(): Promise<Record<string, unknown>> {
    const rows = await getAll<SettingRecord>(this.requireUi(), STORE.settings);
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async writeSetting(key: string, value: unknown): Promise<void> {
    await putOne(this.requireUi(), STORE.settings, { key, value } satisfies SettingRecord);
  }

  async lastAccountHash(): Promise<string | null> {
    const row = await getOne<SettingRecord>(this.requireUi(), STORE.settings, "lastAccountHash");
    return typeof row?.value === "string" ? row.value : null;
  }

  async readDraft(accountHash: string, roomId: string): Promise<DraftRecord | null> {
    return (await getOne<DraftRecord>(this.requireUi(), STORE.drafts, [accountHash, roomId])) ?? null;
  }

  async writeDraft(record: DraftRecord): Promise<void> {
    await putOne(this.requireUi(), STORE.drafts, record);
  }

  async deleteDraft(accountHash: string, roomId: string): Promise<void> {
    await deleteOne(this.requireUi(), STORE.drafts, [accountHash, roomId]);
  }

  async readScroll(accountHash: string, roomId: string): Promise<ScrollRecord | null> {
    return (await getOne<ScrollRecord>(this.requireUi(), STORE.scroll, [accountHash, roomId])) ?? null;
  }

  async writeScroll(record: ScrollRecord): Promise<void> {
    await putOne(this.requireUi(), STORE.scroll, record);
  }

  async clearAccountUi(accountHash: string): Promise<void> {
    const ui = this.requireUi();
    const tx = ui.transaction([STORE.drafts, STORE.scroll, STORE.settings], "readwrite");
    tx.objectStore(STORE.drafts).delete(IDBKeyRange.bound([accountHash, ""], [accountHash, "\uffff"]));
    tx.objectStore(STORE.scroll).delete(IDBKeyRange.bound([accountHash, ""], [accountHash, "\uffff"]));
    tx.objectStore(STORE.settings).delete("lastAccountHash");
    tx.objectStore(STORE.settings).delete("lastSession");
    tx.objectStore(STORE.settings).delete(`keyGate:${accountHash}`);
    await transactionDone(tx);
  }

  private requireAccount(): IDBDatabase {
    if (!this.account) throw new Error("Account database is not open");
    return this.account;
  }

  private requireUi(): IDBDatabase {
    if (!this.ui) throw new Error("UI database is not open");
    return this.ui;
  }
}
