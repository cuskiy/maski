import { createClient, ClientEvent, SyncState, type MatrixClient } from "matrix-js-sdk";
import type { Logger } from "matrix-js-sdk/lib/logger.js";
import { initAsync } from "@matrix-org/matrix-sdk-crypto-wasm";
import type { Keys, Media, Message, Outbox, Room, Session, Status, Window } from "../core/types.ts";
import { accountHash } from "../core/id.ts";
import type { Event } from "../protocol/messages.ts";
import { AccountDb, type StoredSession } from "./db.ts";
import { unlockWith } from "./keys.ts";
import { fetchMedia } from "./media.ts";
import { projectRooms } from "./project.ts";

type Post = (event: Event) => void;

export class WorkerSession {
  private readonly post: Post;
  private db: AccountDb | null = null;
  private client: MatrixClient | null = null;
  private session: Session | null = null;
  private active = "";
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(post: Post) {
    this.post = post;
  }

  async start(hash: string | null, wasm: string): Promise<{ session: Session | null; keys: Keys | null }> {
    if (!hash) return { session: null, keys: null };
    const db = new AccountDb(hash);
    await db.open();
    this.db = db;
    const stored = await db.meta<StoredSession | null>("session", null);
    if (!stored) return { session: null, keys: null };
    await this.begin(stored, wasm);
    return { session: this.session, keys: await this.keys() };
  }

  async login(baseUrl: string, user: string, password: string, wasm: string): Promise<Session> {
    const probe = createClient({ baseUrl });
    const response = await probe.loginRequest({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: user.replace(/^@/u, "").split(":")[0] ?? user },
      password,
      initial_device_display_name: "maski",
    });
    const hash = await accountHash(response.user_id);
    const db = new AccountDb(hash);
    await db.open();
    this.db?.close();
    this.db = db;
    const stored: StoredSession = {
      token: response.access_token,
      session: { userId: response.user_id, deviceId: response.device_id, name: user, avatar: null, baseUrl, accountHash: hash },
    };
    await db.setMeta("session", stored);
    await this.begin(stored, wasm);
    return this.requireSession();
  }

  async logout(): Promise<void> {
    try {
      if (this.client) await this.client.logout(true);
    } catch {
      // a revoked token still ends the session locally
    }
    this.client?.stopClient();
    this.client = null;
    this.session = null;
    const db = this.db;
    this.db = null;
    if (db) await db.delete();
    this.post({ event: "ready", session: null, keys: null });
  }

  /** One path out of the gate: the recovery key or passphrase that opens secret storage. */
  async unlock(input: string): Promise<Keys> {
    const keys = await unlockWith(this.requireClient(), input);
    this.post({ event: "keys", keys });
    return keys;
  }

  async keys(): Promise<Keys> {
    const crypto = this.client?.getCrypto();
    if (!crypto) return { ready: false };
    return { ready: await crypto.isSecretStorageReady() };
  }

  async open(roomId: string): Promise<Window> {
    this.active = roomId;
    const db = this.requireDb();
    const client = this.requireClient();
    const room = client.getRoom(roomId);
    if (room) {
      const rows = await projectRooms(db, client, [roomId], "forward");
      await db.putRooms(rows);
    }
    const stored = (await db.rooms<Room>()).find((entry) => entry.roomId === roomId);
    return { roomId, messages: await db.window(roomId, 80), hasOlder: stored?.hasOlder ?? false };
  }

  /** One page back, sized by what the interface already holds. */
  async older(roomId: string, keep: number): Promise<Window> {
    const db = this.requireDb();
    const client = this.requireClient();
    const room = client.getRoom(roomId);
    if (!room) return { roomId, messages: await db.window(roomId, keep), hasOlder: false };
    await client.scrollback(room, 50);
    const rows = await projectRooms(db, client, [roomId], "backward");
    await db.putRooms(rows);
    const stored = (await db.rooms<Room>()).find((entry) => entry.roomId === roomId);
    return { roomId, messages: await db.window(roomId, Math.max(keep, 80)), hasOlder: stored?.hasOlder ?? false };
  }

  async send(roomId: string, txnId: string, body: string, html: string | null): Promise<void> {
    const db = this.requireDb();
    const client = this.requireClient();
    const session = this.requireSession();
    const queued: Message = {
      id: txnId,
      roomId,
      sender: session.userId,
      name: session.name,
      avatar: session.avatar,
      ts: Date.now(),
      kind: "text",
      body,
      html,
      media: null,
      reply: null,
      edited: false,
      reactions: [],
      mentions: [],
      status: "queued",
      error: null,
      encrypted: client.getRoom(roomId)?.hasEncryptionStateEvent() ?? false,
      membership: null,
      tokens: [],
    };
    await db.putMessages([queued]);
    this.postOutbox({ txnId, status: "queued", error: "" });
    await this.pushWindow(roomId);
    const content = html === null ? { msgtype: "m.text", body } : { msgtype: "m.text", body, format: "org.matrix.custom.html", formatted_body: html };
    this.setStatus(txnId, "sending");
    try {
      await client.sendEvent(roomId, "m.room.message" as never, content as never, txnId);
      this.deliver(txnId, "sent", "");
    } catch (error) {
      this.deliver(txnId, "failed", error instanceof Error ? error.message : String(error));
    }
  }

  async retry(txnId: string, roomId: string): Promise<void> {
    const db = this.requireDb();
    const row = await db.get<Message>("events", txnId);
    if (!row) return;
    await db.del("events", txnId);
    await this.send(roomId, txnId, row.body, row.html);
  }

  async discard(txnId: string, roomId: string): Promise<void> {
    await this.requireDb().del("events", txnId);
    await this.pushWindow(roomId);
  }

  async media(media: Media, size: number): Promise<Blob> {
    return fetchMedia(this.requireDb(), this.requireClient(), media, size);
  }

  async markRead(roomId: string, eventId: string): Promise<void> {
    await this.requireClient().setRoomReadMarkers(roomId, eventId);
  }

  async typing(roomId: string, on: boolean): Promise<void> {
    await this.requireClient().sendTyping(roomId, on, 20000);
  }

  private async begin(stored: StoredSession, wasm: string): Promise<void> {
    await initAsync(wasm);
    const client = createClient({
      baseUrl: stored.session.baseUrl,
      accessToken: stored.token,
      userId: stored.session.userId,
      deviceId: stored.session.deviceId,
      logger: silentLogger(),
    });
    await client.initRustCrypto({ cryptoDatabasePrefix: `maski-rust-${stored.session.accountHash}` });
    this.client = client;
    this.session = stored.session;
    this.watch(client);
    // A device that already holds its keys reopens the backup at start, so history decrypts
    // without asking the reader to unlock again.
    const crypto = client.getCrypto();
    if (crypto) {
      void crypto
        .isSecretStorageReady()
        .then(async (ready) => {
          if (ready) await crypto.checkKeyBackupAndEnable();
        })
        .then(() => this.schedule())
        .catch(() => undefined);
    }
    client.startClient({ initialSyncLimit: 20 }).catch((error: unknown) => {
      this.post({ event: "connection", state: "error", message: error instanceof Error ? error.message : "" });
    });
  }

  private watch(client: MatrixClient): void {
    client.on(ClientEvent.Sync, (state: SyncState, _previous: SyncState | null, data?: unknown) => {
      if (state === SyncState.Prepared || state === SyncState.Syncing) {
        this.post({ event: "connection", state: "online", message: "" });
        this.schedule();
        return;
      }
      if (state !== SyncState.Error && state !== SyncState.Reconnecting) return;
      const failure = typeof data === "object" && data !== null ? (data as { error?: { data?: { errcode?: string } } }).error : undefined;
      if (failure?.data?.errcode === "M_UNKNOWN_TOKEN") {
        this.post({ event: "connection", state: "error", message: "M_UNKNOWN_TOKEN" });
        return;
      }
      this.post({ event: "connection", state: "offline", message: "" });
    });
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pass().catch((error: unknown) => {
        this.post({ event: "connection", state: "error", message: error instanceof Error ? error.message : String(error) });
      });
    }, 60);
  }

  private async pass(): Promise<void> {
    const db = this.db;
    const client = this.client;
    if (!db || !client) return;
    const rooms = client.getRooms().filter((room) => room.getMyMembership() === "join" || room.getMyMembership() === "invite");
    const rows = await projectRooms(db, client, rooms.map((room) => room.roomId), "forward");
    await db.putRooms(rows);
    this.post({ event: "rooms", rooms: rows });
    if (this.active) {
      const stored = rows.find((room) => room.roomId === this.active);
      this.post({ event: "window", window: { roomId: this.active, messages: await db.window(this.active, 200), hasOlder: stored?.hasOlder ?? false } });
    }
  }

  private async pushWindow(roomId: string): Promise<void> {
    const db = this.requireDb();
    const stored = (await db.rooms<Room>()).find((entry) => entry.roomId === roomId);
    this.post({ event: "window", window: { roomId, messages: await db.window(roomId, 200), hasOlder: stored?.hasOlder ?? false } });
  }

  private setStatus(txnId: string, status: Status): void {
    void this.patchStatus(txnId, status);
  }

  private async patchStatus(txnId: string, status: Status): Promise<void> {
    const db = this.db;
    if (!db) return;
    const row = await db.get<Message>("events", txnId);
    if (!row) return;
    await db.putMessages([{ ...row, status }]);
  }

  private deliver(txnId: string, status: Status, error: string): void {
    void this.patchStatus(txnId, status);
    this.postOutbox({ txnId, status, error });
  }

  private postOutbox(outbox: Outbox): void {
    this.post({ event: "outbox", outbox });
  }

  private requireDb(): AccountDb {
    if (!this.db) throw new Error("the account database is not open");
    return this.db;
  }

  private requireClient(): MatrixClient {
    if (!this.client) throw new Error("not signed in");
    return this.client;
  }

  private requireSession(): Session {
    if (!this.session) throw new Error("not signed in");
    return this.session;
  }
}

const quiet = (): void => undefined;

/** The SDK's default logger writes every request to the console; the worker keeps its own record. */
function silentLogger(): Logger {
  const logger: Logger = { trace: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet, getChild: () => logger };
  return logger;
}
