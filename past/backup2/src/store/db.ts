import { INDEX, STORE, UI_DB, UI_VERSION, accountDbName, upgradeAccount, upgradeUi } from "../core/schema.ts";
import type { Draft, Member, Message, Pack, RoomSummary, SectionId } from "../core/types.ts";

export interface Settings {
  locale: "en" | "zh-CN" | null;
  lastAccount: { hash: string; userId: string; name: string; avatar: string | null; baseUrl: string } | null;
  sections: Record<SectionId, boolean>;
  desktop: boolean;
  preview: boolean;
  keysReady: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: null,
  lastAccount: null,
  sections: { invites: true, favorites: true, direct: true, rooms: true, low: false },
  desktop: false,
  preview: true,
  keysReady: false,
};

function open(name: string, version: number | undefined, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    opening.onupgradeneeded = () => upgrade(opening.result);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error(`cannot open ${name}`));
  });
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
  });
}

export class LocalDb {
  private account: IDBDatabase | null = null;
  private hash: string | null = null;
  private ui: IDBDatabase | null = null;

  async openAccount(hash: string): Promise<void> {
    if (this.account && this.hash === hash) return;
    this.closeAccount();
    this.hash = hash;
    this.account = await open(accountDbName(hash), undefined, upgradeAccount);
  }

  closeAccount(): void {
    this.account?.close();
    this.account = null;
  }

  forgetAccount(): void {
    this.closeAccount();
    this.hash = null;
  }

  private async handle(): Promise<IDBDatabase> {
    if (this.account) return this.account;
    if (!this.hash) throw new Error("no account is open");
    await this.openAccount(this.hash);
    const db = this.account;
    if (!db) throw new Error("no account is open");
    return db;
  }

  private async uiDb(): Promise<IDBDatabase> {
    if (!this.ui) this.ui = await open(UI_DB, UI_VERSION, upgradeUi);
    return this.ui;
  }

  async rooms(): Promise<RoomSummary[]> {
    const db = await this.handle();
    return (await request(db.transaction(STORE.rooms, "readonly").objectStore(STORE.rooms).getAll())) as RoomSummary[];
  }

  async room(roomId: string): Promise<RoomSummary | undefined> {
    const db = await this.handle();
    return (await request(db.transaction(STORE.rooms, "readonly").objectStore(STORE.rooms).get(roomId))) as RoomSummary | undefined;
  }

  async window(roomId: string, limit: number): Promise<Message[]> {
    const db = await this.handle();
    const index = db.transaction(STORE.events, "readonly").objectStore(STORE.events).index(INDEX.eventsRoomTs);
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

  async message(id: string): Promise<Message | undefined> {
    const db = await this.handle();
    return (await request(db.transaction(STORE.events, "readonly").objectStore(STORE.events).get(id))) as Message | undefined;
  }

  async putMessage(message: Message): Promise<void> {
    const db = await this.handle();
    const tx = db.transaction(STORE.events, "readwrite");
    tx.objectStore(STORE.events).put(message);
    await done(tx);
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await this.handle();
    const tx = db.transaction(STORE.events, "readwrite");
    tx.objectStore(STORE.events).delete(id);
    await done(tx);
  }

  async members(roomId: string): Promise<Member[]> {
    const db = await this.handle();
    const index = db.transaction(STORE.members, "readonly").objectStore(STORE.members).index(INDEX.membersRoom);
    return (await request(index.getAll(roomId))) as Member[];
  }

  async packs(): Promise<Pack[]> {
    const db = await this.handle();
    return (await request(db.transaction(STORE.packs, "readonly").objectStore(STORE.packs).getAll())) as Pack[];
  }

  async media(key: string): Promise<{ data: Blob; mime: string } | undefined> {
    const db = await this.handle();
    const store = db.transaction(STORE.media, "readonly").objectStore(STORE.media);
    return (await request(store.get(key))) as { data: Blob; mime: string } | undefined;
  }

  async settings(): Promise<Settings> {
    const db = await this.uiDb();
    const row = (await request(db.transaction("settings", "readonly").objectStore("settings").get("settings"))) as
      | { value: Partial<Settings> }
      | undefined;
    return { ...DEFAULT_SETTINGS, ...row?.value };
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.settings()), ...patch };
    const db = await this.uiDb();
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ key: "settings", value: next });
    await done(tx);
    return next;
  }

  async draft(accountHash: string, roomId: string): Promise<Draft | null> {
    const db = await this.uiDb();
    const row = (await request(db.transaction("drafts", "readonly").objectStore("drafts").get(`${accountHash}:${roomId}`))) as
      | { value: Draft }
      | undefined;
    return row?.value ?? null;
  }

  async saveDraft(accountHash: string, roomId: string, draft: Draft): Promise<void> {
    const db = await this.uiDb();
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    const empty = draft.text.length === 0 && draft.marks.length === 0 && !draft.reply && !draft.edit;
    if (empty) store.delete(`${accountHash}:${roomId}`);
    else store.put({ key: `${accountHash}:${roomId}`, value: draft });
    await done(tx);
  }
}
