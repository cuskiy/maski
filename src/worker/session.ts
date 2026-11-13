import { createClient, ClientEvent, SyncState, type MatrixClient } from "matrix-js-sdk";
import { initAsync } from "@matrix-org/matrix-sdk-crypto-wasm";
import type { Keys, Session } from "../core/types.ts";
import { accountHash } from "../core/id.ts";
import type { Event } from "../protocol/messages.ts";
import { AccountDb, type StoredSession } from "./db.ts";
import { roomRow } from "./rooms.ts";

export type Post = (event: Event) => void;

interface Startup {
  readonly wasm: string;
  readonly db: AccountDb;
  readonly client: MatrixClient;
  readonly session: Session;
}

/**
 * One client, one account database, one sync. The rust crypto module is initialised with the
 * hashed wasm path the build wrote, because esbuild keeps the SDK's relative URL untouched.
 */
export class WorkerSession {
  private readonly post: Post;
  private db: AccountDb | null = null;
  private client: MatrixClient | null = null;
  private session: Session | null = null;

  constructor(post: Post) {
    this.post = post;
  }

  get active(): Session | null {
    return this.session;
  }

  /** Opens the account database and restores a stored session, without waiting for the network. */
  async start(hash: string | null, wasm: string): Promise<{ session: Session | null; keys: Keys | null }> {
    if (!hash) return { session: null, keys: null };
    const db = new AccountDb(hash);
    await db.open();
    this.db = db;
    const stored = await db.meta<StoredSession | null>("session", null);
    if (!stored) return { session: null, keys: null };
    const startup = await this.begin(stored, wasm);
    return { session: startup.session, keys: await this.keys() };
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
      session: {
        userId: response.user_id,
        deviceId: response.device_id,
        name: user,
        avatar: null,
        baseUrl,
        accountHash: hash,
      },
    };
    await db.setMeta("session", stored);
    const startup = await this.begin(stored, wasm);
    return startup.session;
  }

  async logout(): Promise<void> {
    const client = this.client;
    try {
      if (client) await client.logout(true);
    } catch {
      // a revoked token still ends the session locally
    }
    client?.stopClient();
    this.client = null;
    this.session = null;
    const db = this.db;
    this.db = null;
    if (db) await db.delete();
    this.post({ event: "ready", session: null, keys: null });
  }

  async send(roomId: string, txnId: string, body: string): Promise<void> {
    if (!this.client) throw new Error("not signed in");
    // The SDK types the event content by event type; a plain text message is the one shape we own.
    await this.client.sendEvent(roomId, "m.room.message" as never, { msgtype: "m.text", body } as never, txnId);
  }

  async keys(): Promise<Keys> {
    const crypto = this.client?.getCrypto();
    if (!crypto) return { ready: false };
    return { ready: await crypto.isSecretStorageReady() };
  }

  private async begin(stored: StoredSession, wasm: string): Promise<Startup> {
    await initAsync(wasm);
    const client = createClient({
      baseUrl: stored.session.baseUrl,
      accessToken: stored.token,
      userId: stored.session.userId,
      deviceId: stored.session.deviceId,
    });
    await client.initRustCrypto({ cryptoDatabasePrefix: `maski-rust-${stored.session.accountHash}` });
    this.client = client;
    this.session = stored.session;
    this.watch(client);
    client.startClient({ initialSyncLimit: 20 }).catch((error: unknown) => {
      this.post({ event: "connection", state: "error", message: reason(error) });
    });
    return { wasm, db: this.requireDb(), client, session: stored.session };
  }

  private watch(client: MatrixClient): void {
    const self = client.getUserId() ?? "";
    client.on(ClientEvent.Sync, (state: SyncState, _previous: SyncState | null, data?: unknown) => {
      if (state === SyncState.Prepared || state === SyncState.Syncing) {
        this.post({ event: "connection", state: "online", message: "" });
        this.post({ event: "ready", session: this.session, keys: null });
        const rooms = client.getRooms().map((room) => roomRow(room, self));
        this.post({ event: "rooms", rooms: rooms.toSorted((a, b) => b.lastTs - a.lastTs) });
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

  private requireDb(): AccountDb {
    if (!this.db) throw new Error("the account database is not open");
    return this.db;
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
