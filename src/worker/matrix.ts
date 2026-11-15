import {
  ClientEvent,
  createClient,
  IndexedDBStore,
  MatrixEventEvent,
  MsgType,
  PendingEventOrdering,
  RoomEvent,
  SyncState,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { initAsync } from "@matrix-org/matrix-sdk-crypto-wasm";
import type { SessionSummary } from "../core/types.ts";
import type { CommandMap, Event, KeyStatus, StartData } from "../protocol/index.ts";
import { WorkerFailure } from "./failure.ts";
import type { SessionPort } from "./ports.ts";
import { directRooms, projectMembers, projectRoom, projectWindow } from "./project.ts";
import { clearSession, readSession, writeSession, type StoredSession } from "./sessionDb.ts";

type SilentLogger = {
  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  getChild(namespace: string): SilentLogger;
};

const silentLogger: SilentLogger = {
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  getChild: () => silentLogger,
};

type Listener = (event: Event) => void;

function normalizeHomeserver(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function discoverHomeserver(value: string): Promise<string | null> {
  const direct = normalizeHomeserver(value);
  if (direct === null) return null;
  let target = direct;
  try {
    const response = await fetch(`${direct}/.well-known/matrix/client`, {
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const wellKnown = (await response.json()) as { "m.homeserver"?: { base_url?: unknown } };
      const baseUrl = wellKnown["m.homeserver"]?.["base_url"];
      if (typeof baseUrl === "string") {
        const discovered = normalizeHomeserver(baseUrl);
        if (discovered !== null) target = discovered;
      }
    }
  } catch {
    // A missing or cross-origin .well-known falls back to the entered origin.
  }
  try {
    const versions = await fetch(`${target}/_matrix/client/versions`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!versions.ok) return null;
  } catch {
    return null;
  }
  return target;
}

function accountKey(userId: string): string {
  return encodeURIComponent(userId);
}

function summary(client: MatrixClient, stored: StoredSession): SessionSummary {
  const user = client.getUser(stored.userId);
  return {
    userId: stored.userId,
    displayName: user?.displayName ?? stored.userId,
    avatar: null,
    capabilities: {
      recoveryKey: false,
      backup: false,
      signOut: true,
      signOutOthers: true,
    },
  };
}

export class MatrixSession implements SessionPort {
  private client: MatrixClient | null = null;
  private wasmUrl: string | null = null;
  private cryptoPrefix: string | null = null;
  private activeRoomId: string | null = null;
  private keyReady = false;
  private roomsQueued = false;
  private readonly listeners = new Set<Listener>();

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(input: CommandMap["start"]): Promise<StartData> {
    this.wasmUrl = input.wasmUrl;
    const stored = await readSession();
    if (stored === null) {
      return { session: null, connection: "offline", key: "missing" };
    }
    try {
      const session = await this.startClient(stored);
      return { session, connection: "connecting", key: "unknown" };
    } catch {
      await this.discardClient(this.client);
      return { session: null, connection: "offline", key: "unknown" };
    }
  }

  async login(input: CommandMap["login"]): Promise<SessionSummary> {
    const wasmUrl = this.wasmUrl;
    if (wasmUrl === null) throw new WorkerFailure("unavailable");
    const baseUrl = await discoverHomeserver(input.homeserver);
    if (baseUrl === null) throw new WorkerFailure("auth");

    let response;
    try {
      const provisional = createClient({ baseUrl, logger: silentLogger });
      response = await provisional.loginRequest({
        type: "m.login.password",
        identifier: { type: "m.id.user", user: input.username },
        password: input.password,
        initial_device_display_name: "maski",
      });
    } catch {
      throw new WorkerFailure("auth");
    }

    const stored: StoredSession = {
      baseUrl,
      userId: response.user_id,
      deviceId: response.device_id,
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? null,
    };
    await writeSession(stored);
    await this.startClient(stored);
    return summary(this.requireClient(), stored);
  }

  async logout(): Promise<null> {
    await this.teardown(this.client);
    await clearSession();
    return null;
  }

  async keyStatus(): Promise<KeyStatus> {
    return this.client === null ? "missing" : this.keyReady ? "ready" : "unknown";
  }

  async resetIdentity(password: string): Promise<string | null> {
    const client = this.requireClient();
    const crypto = client.getCrypto();
    const userId = client.getUserId();
    if (crypto === undefined || userId === null) throw new WorkerFailure("unavailable");

    const auth = async (makeRequest: (authData: Record<string, unknown> | null) => Promise<void>): Promise<void> => {
      try {
        await makeRequest(null);
      } catch (error) {
        if (typeof error !== "object" || error === null || !("data" in error)) throw error;
        const data = error.data;
        if (typeof data !== "object" || data === null || !("session" in data)) throw error;
        const session = data.session;
        if (typeof session !== "string") throw error;
        await makeRequest({
          type: "m.login.password",
          identifier: { type: "m.id.user", user: userId.replace(/^@/u, "").split(":")[0] ?? userId },
          password,
          session,
        });
      }
    };

    try {
      await crypto.resetEncryption(auth);
      const key = await crypto.createRecoveryKeyFromPassphrase();
      try {
        await crypto.bootstrapSecretStorage({
          setupNewSecretStorage: true,
          createSecretStorageKey: () => Promise.resolve(key),
        });
      } catch {
        // The key account data is written before the remaining secrets; the key is still the reset result.
      }
      this.keyReady = true;
      return key.encodedPrivateKey ?? null;
    } catch {
      throw new WorkerFailure("auth");
    }
  }

  async open(roomId: string): Promise<null> {
    const client = this.requireClient();
    this.activeRoomId = roomId;
    const room = client.getRoom(roomId);
    if (room !== null) {
      const window = projectWindow(room, client.getUserId() ?? "");
      this.emit({
        type: "window",
        payload: { roomId, messages: window.messages, hasOlder: window.hasOlder, older: false },
      });
    }
    return null;
  }

  async older(roomId: string): Promise<null> {
    const client = this.requireClient();
    const room = client.getRoom(roomId);
    if (room === null) return null;
    const timeline = room.getLiveTimeline();
    try {
      await client.paginateEventTimeline(timeline, { backwards: true, limit: 30 });
    } catch {
      throw new WorkerFailure("network");
    }
    const window = projectWindow(room, client.getUserId() ?? "");
    this.emit({
      type: "window",
      payload: { roomId, messages: window.messages, hasOlder: window.hasOlder, older: true },
    });
    return null;
  }

  async send(
    roomId: string,
    body: string,
    html: string | null,
    replyTo: string | null,
    transactionId: string,
    messageId: string,
  ): Promise<null> {
    const client = this.requireClient();
    try {
      const response = await client.sendMessage(
        roomId,
        {
          msgtype: MsgType.Text,
          body,
          ...(html === null
            ? {}
            : {
                format: "org.matrix.custom.html" as const,
                formatted_body: html,
              }),
          ...(replyTo === null
            ? {}
            : {
                "m.relates_to": { "m.in_reply_to": { event_id: replyTo } },
              }),
        },
        transactionId,
      );
      this.emit({
        type: "outbox",
        payload: {
          roomId,
          messageId,
          eventId: response.event_id,
          status: "sent",
          error: null,
        },
      });
    } catch {
      this.emit({
        type: "outbox",
        payload: {
          roomId,
          messageId,
          eventId: null,
          status: "failed",
          error: null,
        },
      });
      throw new WorkerFailure("network");
    }
    return null;
  }

  async markRead(roomId: string, eventId: string): Promise<null> {
    const client = this.requireClient();
    const room = client.getRoom(roomId);
    const event = room?.findEventById(eventId);
    if (event === undefined) throw new WorkerFailure("unavailable");
    await client.setRoomReadMarkersHttpRequest(roomId, eventId, eventId);
    return null;
  }

  async members(roomId: string): Promise<null> {
    const client = this.requireClient();
    const room = client.getRoom(roomId);
    if (room !== null) this.emit({ type: "members", payload: { roomId, members: projectMembers(room) } });
    return null;
  }

  private requireClient(): MatrixClient {
    if (this.client === null) throw new WorkerFailure("not-signed-in");
    return this.client;
  }

  private emit(event: Event): void {
    this.listeners.forEach((listener) => listener(event));
  }

  private emitRooms(): void {
    const client = this.client;
    if (client === null) return;
    const own = client.getUserId() ?? "";
    const direct = directRooms(client);
    const rooms = client
      .getRooms()
      .map((room) => projectRoom(room, own, direct))
      .filter((room): room is NonNullable<typeof room> => room !== null)
      .toSorted((left, right) => right.lastTs - left.lastTs || left.name.localeCompare(right.name));
    this.emit({ type: "rooms", payload: { rooms, loading: false } });
  }

  private scheduleRooms(): void {
    if (this.roomsQueued) return;
    this.roomsQueued = true;
    queueMicrotask(() => {
      this.roomsQueued = false;
      this.emitRooms();
    });
  }

  private emitWindow(roomId: string): void {
    const client = this.client;
    if (client === null || this.activeRoomId !== roomId) return;
    const room = client.getRoom(roomId);
    if (room === null) return;
    const window = projectWindow(room, client.getUserId() ?? "");
    this.emit({
      type: "window",
      payload: { roomId, messages: window.messages, hasOlder: window.hasOlder, older: false },
    });
  }

  private wire(client: MatrixClient): void {
    client.on(ClientEvent.Sync, (state: SyncState) => {
      if (state === SyncState.Error) {
        this.emit({ type: "connection", payload: "offline" });
        return;
      }
      if (state === SyncState.Prepared || state === SyncState.Syncing || state === SyncState.Catchup) {
        this.emit({ type: "connection", payload: "online" });
        this.scheduleRooms();
      }
    });
    client.on(RoomEvent.Timeline, (_event: MatrixEvent, room: Room | undefined, toStartOfTimeline?: boolean) => {
      if (room !== undefined && toStartOfTimeline !== true) {
        this.emitWindow(room.roomId);
        this.scheduleRooms();
      }
    });
    client.on(MatrixEventEvent.Decrypted, (event: MatrixEvent) => {
      const roomId = event.getRoomId();
      if (roomId !== undefined) this.emitWindow(roomId);
    });
    client.on(RoomEvent.Name, () => this.scheduleRooms());
    client.on(RoomEvent.Tags, () => this.scheduleRooms());
    client.on(RoomEvent.MyMembership, () => this.scheduleRooms());
  }

  private async startClient(stored: StoredSession): Promise<SessionSummary> {
    const wasmUrl = this.wasmUrl;
    if (wasmUrl === null) throw new WorkerFailure("unavailable");
    const key = accountKey(stored.userId);
    const store = new IndexedDBStore({
      indexedDB: self.indexedDB,
      dbName: `maski:sync:${key}`,
    });
    const client = createClient({
      baseUrl: stored.baseUrl,
      accessToken: stored.accessToken,
      userId: stored.userId,
      deviceId: stored.deviceId,
      logger: silentLogger,
      store,
      timelineSupport: true,
      disableVoip: true,
    });
    this.client = client;
    this.cryptoPrefix = `maski:crypto:${key}`;
    this.wire(client);
    await client.store.startup();
    await initAsync(wasmUrl);
    await client.initRustCrypto({ cryptoDatabasePrefix: this.cryptoPrefix });
    this.keyReady = (await client.getCrypto()?.isSecretStorageReady()) ?? false;
    await client.startClient({
      initialSyncLimit: 20,
      lazyLoadMembers: true,
      pendingEventOrdering: PendingEventOrdering.Detached,
      threadSupport: true,
    });
    const session = summary(client, stored);
    this.emit({ type: "session", payload: session });
    this.emit({ type: "connection", payload: "connecting" });
    this.emitRooms();
    return session;
  }

  private async discardClient(client: MatrixClient | null): Promise<void> {
    this.client = null;
    this.cryptoPrefix = null;
    this.activeRoomId = null;
    this.keyReady = false;
    if (client === null) return;
    try {
      client.stopClient();
    } catch {
      // Startup may have failed before the sync loop began.
    }
    client.removeAllListeners();
  }

  private async teardown(client: MatrixClient | null): Promise<void> {
    const prefix = this.cryptoPrefix;
    this.client = null;
    this.cryptoPrefix = null;
    this.activeRoomId = null;
    if (client === null) return;
    try {
      await client.logout(true);
    } catch {
      // The token may already be invalid.
    }
    try {
      await client.store.save(true);
    } catch {
      // The store may be closed after a failed start.
    }
    try {
      if (prefix !== null) await client.clearStores({ cryptoDatabasePrefix: prefix });
    } catch {
      // Clearing is best effort; the session record is cleared below.
    }
    try {
      await client.store.destroy();
    } catch {
      // Already destroyed.
    }
    client.removeAllListeners();
  }
}
