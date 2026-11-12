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

const DEFAULT_SETTINGS: Settings = {
  locale: null,
  lastAccount: null,
  sections: { invites: true, favorites: true, direct: true, rooms: true, low: false },
  desktop: false,
  preview: true,
  keysReady: false,
};

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
  private ui: IDBDatabase | null = null;

  async openUi(): Promise<void> {
    if (this.ui) return;
    this.ui = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(UI_DB, UI_VERSION);
      req.onupgradeneeded = () => upgradeUi(req.result);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("cannot open the local database"));
    });
  }

  async openAccount(hash: string): Promise<void> {
    if (this.account) return;
    this.account = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(accountDbName(hash));
      req.onupgradeneeded = () => upgradeAccount(req.result);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("cannot open the account database"));
    });
    this.account.onversionchange = () => this.closeAccount();
  }

  closeAccount(): void {
    this.account?.close();
    this.account = null;
  }

  private handle(): IDBDatabase {
    if (!this.account) throw new Error("account database is not open");
    return this.account;
  }

  async rooms(): Promise<RoomSummary[]> {
    const tx = this.handle().transaction(STORE.rooms, "readonly");
    return (await request(tx.objectStore(STORE.rooms).getAll())) as RoomSummary[];
  }

  async room(roomId: string): Promise<RoomSummary | undefined> {
    const tx = this.handle().transaction(STORE.rooms, "readonly");
    return (await request(tx.objectStore(STORE.rooms).get(roomId))) as RoomSummary | undefined;
  }

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
      cursor.onerror = () => reject(cursor.error ?? new Error("cursor failed"));
    });
    return rows.toReversed();
  }

  async message(id: string): Promise<Message | undefined> {
    const tx = this.handle().transaction(STORE.events, "readonly");
    return (await request(tx.objectStore(STORE.events).get(id))) as Message | undefined;
  }

  async putMessage(message: Message): Promise<void> {
    const tx = this.handle().transaction(STORE.events, "readwrite");
    tx.objectStore(STORE.events).put(message);
    await done(tx);
  }

  async deleteMessage(id: string): Promise<void> {
    const tx = this.handle().transaction(STORE.events, "readwrite");
    tx.objectStore(STORE.events).delete(id);
    await done(tx);
  }

  async members(roomId: string): Promise<Member[]> {
    const tx = this.handle().transaction(STORE.members, "readonly");
    const index = tx.objectStore(STORE.members).index(INDEX.membersRoom);
    return (await request(index.getAll(roomId))) as Member[];
  }

  async packs(): Promise<Pack[]> {
    const tx = this.handle().transaction(STORE.packs, "readonly");
    return (await request(tx.objectStore(STORE.packs).getAll())) as Pack[];
  }

  async media(key: string): Promise<{ data: Blob; mime: string } | undefined> {
    const tx = this.handle().transaction(STORE.media, "readonly");
    const row = (await request(tx.objectStore(STORE.media).get(key))) as { data: Blob; mime: string } | undefined;
    return row;
  }

  async settings(): Promise<Settings> {
    await this.openUi();
    const db = this.ui;
    if (!db) return { ...DEFAULT_SETTINGS };
    const tx = db.transaction("settings", "readonly");
    const row = (await request(tx.objectStore("settings").get("settings"))) as { value: Partial<Settings> } | undefined;
    return { ...DEFAULT_SETTINGS, ...row?.value };
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.settings()), ...patch };
    await this.openUi();
    const db = this.ui;
    if (!db) return next;
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ key: "settings", value: next });
    await done(tx);
    return next;
  }

  async draft(accountHash: string, roomId: string): Promise<Draft | null> {
    await this.openUi();
    const db = this.ui;
    if (!db) return null;
    const tx = db.transaction("drafts", "readonly");
    const row = (await request(tx.objectStore("drafts").get(`${accountHash}:${roomId}`))) as { value: Draft } | undefined;
    return row?.value ?? null;
  }

  async saveDraft(accountHash: string, roomId: string, draft: Draft): Promise<void> {
    await this.openUi();
    const db = this.ui;
    if (!db) return;
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    if (draft.text.length === 0 && draft.marks.length === 0 && !draft.reply && !draft.edit) store.delete(`${accountHash}:${roomId}`);
    else store.put({ key: `${accountHash}:${roomId}`, value: draft });
    await done(tx);
  }
}
