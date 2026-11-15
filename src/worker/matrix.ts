import {
  ClientEvent,
  createClient,
  EventTimeline,
  EventType,
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
import { isRecord } from "../lib/json.ts";
import type { MessageRow, RoomSummary, SessionSummary } from "../core/types.ts";
import type { CommandMap, Event, KeyStatus, StartData } from "../protocol/index.ts";
import { WorkerFailure } from "./failure.ts";
import { AccountDatabase, type RoomRecord } from "./accountDb.ts";
import { createOutbox, type Outbox, type OutboxEvent } from "./outbox.ts";
import type { SessionPort } from "./ports.ts";
import {
  advanceMarker,
  markTimelineReset,
  projectRoomState,
  readState,
  rowCursor,
  WINDOW_LIMIT,
  windowSlice,
  type ReadMarker,
} from "./projection.ts";
import { directRooms, projectMembers, projectMessage, projectRoom, projectWindow } from "./project.ts";
import { decodeRecoveryKey, derivePassphraseKey } from "./recovery.ts";
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
      const wellKnown: unknown = await response.json();
      const homeserver = isRecord(wellKnown) ? wellKnown["m.homeserver"] : undefined;
      const baseUrl = isRecord(homeserver) ? homeserver["base_url"] : undefined;
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
    throw new WorkerFailure("network");
  }
  return target;
}

function accountKey(userId: string): string {
  return encodeURIComponent(userId);
}

function summary(client: MatrixClient | null, stored: StoredSession): SessionSummary {
  const user = client?.getUser(stored.userId);
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

function sortRooms(rooms: readonly RoomRecord[]): readonly RoomRecord[] {
  return [...rooms].toSorted(
    (left, right) => right.room.lastTs - left.room.lastTs || left.room.name.localeCompare(right.room.name),
  );
}

export class MatrixSession implements SessionPort {
  private client: MatrixClient | null = null;
  private wasmUrl: string | null = null;
  private cryptoPrefix: string | null = null;
  private account: AccountDatabase | null = null;
  private outbox: Outbox | null = null;
  private stored: StoredSession | null = null;
  private activeRoomId: string | null = null;
  private keyReady: KeyStatus = "unknown";
  private pendingSecret: { readonly key: Uint8Array<ArrayBuffer> | null; readonly passphrase: string } | null = null;
  private releaseLock: (() => void) | null = null;
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
    this.stored = stored;
    await this.acquireLock(stored.userId);
    const account = await AccountDatabase.open(stored.userId);
    this.account = account;
    this.outbox = this.createOutbox(account);
    const cached = sortRooms(await account.readRooms());
    this.emitCachedRooms(cached);
    const recent = [...cached].toSorted((left, right) => right.lastOpened - left.lastOpened)[0];
    if (recent !== undefined) await this.emitStoredWindow(recent.room.roomId);
    void this.outbox.resume().catch(() => undefined);
    void this.startClient(stored).catch(() => {
      this.emit({ type: "connection", payload: "offline" });
      this.emit({ type: "session", payload: summary(null, stored) });
    });
    return { session: summary(null, stored), connection: "connecting", key: "unknown" };
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
    this.stored = stored;
    await this.acquireLock(stored.userId);
    const account = await AccountDatabase.open(stored.userId);
    this.account = account;
    this.outbox = this.createOutbox(account);
    return this.startClient(stored);
  }

  async logout(): Promise<null> {
    await this.teardown(this.client);
    await clearSession();
    return null;
  }

  async keyStatus(): Promise<KeyStatus> {
    if (this.client === null) return "missing";
    this.keyReady = await this.refreshGate();
    return this.keyReady;
  }

  async recover(input: CommandMap["recover"]): Promise<KeyStatus> {
    const client = this.requireClient();
    const crypto = client.getCrypto();
    if (crypto === undefined) throw new WorkerFailure("unavailable");
    const recoveryKey = input.recoveryKey.trim();
    if (recoveryKey !== "") {
      this.pendingSecret = { key: decodeRecoveryKey(recoveryKey), passphrase: "" };
    } else if (input.passphrase !== "") {
      this.pendingSecret = { key: null, passphrase: input.passphrase };
    } else {
      throw new WorkerFailure("auth");
    }
    try {
      await crypto.bootstrapSecretStorage({});
      if (!(await crypto.isSecretStorageReady())) throw new WorkerFailure("auth");
      await crypto.bootstrapCrossSigning({});
    } catch {
      throw new WorkerFailure("auth");
    } finally {
      this.pendingSecret = null;
    }
    this.keyReady = await this.refreshGate();
    this.emit({ type: "keys", payload: this.keyReady });
    return this.keyReady;
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
      this.keyReady = await this.refreshGate();
      this.emit({ type: "keys", payload: this.keyReady });
      return key.encodedPrivateKey ?? null;
    } catch {
      throw new WorkerFailure("auth");
    }
  }

  async open(roomId: string): Promise<null> {
    const account = this.requireAccount();
    const record = await account.readRoom(roomId);
    await account.writeRoom({
      room: this.roomSummary(roomId) ?? record?.room ?? this.placeholderRoom(roomId),
      lastOpened: Date.now(),
    });
    this.activeRoomId = roomId;
    const window = await this.windowState(roomId);
    if (window.messages.length === 0) await this.ingestRoom(roomId);
    const current = window.messages.length === 0 ? await this.windowState(roomId) : window;
    this.emit({
      type: "window",
      payload: {
        roomId,
        messages: current.messages,
        hasOlder: current.hasOlder,
        older: false,
        patch: false,
      },
    });
    return null;
  }

  async older(roomId: string): Promise<null> {
    const account = this.requireAccount();
    const segment = await account.readSegment(roomId);
    const oldest = await account.readOldest(roomId);
    let page = oldest === null ? [] : await account.readBefore(roomId, oldest.ts, rowCursor(oldest), WINDOW_LIMIT);
    let fetched = false;
    if (page.length < WINDOW_LIMIT) {
      const client = this.client;
      const room = client?.getRoom(roomId);
      if (client !== null && room !== undefined && room !== null) {
        fetched = true;
        try {
          await client.scrollback(room, WINDOW_LIMIT);
        } catch {
          throw new WorkerFailure("network");
        }
        await this.ingestRoom(roomId);
        page = oldest === null ? [] : await account.readBefore(roomId, oldest.ts, rowCursor(oldest), WINDOW_LIMIT);
      }
    }
    const timeline = this.client?.getRoom(roomId)?.getLiveTimeline();
    const token = fetched ? (timeline?.getPaginationToken(EventTimeline.BACKWARDS) ?? null) : (segment?.token ?? null);
    const first = page[0];
    await account.writeSegment({
      roomId,
      beforeEventId: first === undefined ? (oldest === null ? null : rowCursor(oldest)) : rowCursor(first),
      token,
      readable: page.length > 0 || segment?.readable === true,
      gapped: segment?.gapped === true,
    });
    this.emit({
      type: "window",
      payload: {
        roomId,
        messages: page,
        hasOlder: page.length === WINDOW_LIMIT || token !== null,
        older: true,
        patch: false,
      },
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
    kind: CommandMap["send"]["kind"],
    media: CommandMap["send"]["media"],
  ): Promise<MessageRow> {
    this.requireClient();
    const outbox = this.requireOutbox();
    const row = await outbox.queue({
      roomId,
      messageId,
      transactionId,
      body,
      html,
      kind,
      media,
      replyTo,
    });
    void outbox.deliver(messageId).catch(() => undefined);
    this.scheduleRooms();
    return row;
  }

  async retrySend(_roomId: string, messageId: string): Promise<MessageRow> {
    this.requireClient();
    const outbox = this.requireOutbox();
    const row = await outbox.retry(messageId);
    if (row === null) throw new WorkerFailure("unavailable");
    if (row.retryable) void outbox.deliver(messageId).catch(() => undefined);
    this.scheduleRooms();
    return row;
  }

  async discardSend(_roomId: string, messageId: string): Promise<null> {
    const outbox = this.requireOutbox();
    await outbox.discard(messageId);
    this.scheduleRooms();
    return null;
  }

  async markRead(roomId: string, eventId: string): Promise<null> {
    const client = this.requireClient();
    const account = this.requireAccount();
    const current = await account.readMarker(roomId);
    const events = await account.readLatest(roomId, WINDOW_LIMIT);
    const next = advanceMarker(current, eventId, events);
    if (next === null) throw new WorkerFailure("unavailable");
    if (next === current) return null;
    try {
      // Public m.read only: the private receipt stays an explicit user decision.
      await client.setRoomReadMarkersHttpRequest(roomId, next.eventId, next.eventId);
    } catch {
      throw new WorkerFailure("network");
    }
    await account.writeMarker(next);
    this.scheduleRooms();
    return null;
  }

  async members(roomId: string): Promise<null> {
    const client = this.requireClient();
    const room = client.getRoom(roomId);
    if (room !== null) this.emit({ type: "members", payload: { roomId, members: projectMembers(room) } });
    return null;
  }

  private async acquireLock(userId: string): Promise<void> {
    if (this.releaseLock !== null) return;
    if (navigator.locks === undefined) return;
    const acquired = Promise.withResolvers<void>();
    const held = Promise.withResolvers<void>();
    this.releaseLock = held.resolve;
    void navigator.locks
      .request(`maski:account:${accountKey(userId)}`, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (lock === null) {
          acquired.reject(new WorkerFailure("locked"));
          return;
        }
        acquired.resolve();
        await held.promise;
      })
      .catch(() => acquired.reject(new WorkerFailure("locked")));
    try {
      await acquired.promise;
    } catch (error) {
      this.releaseLock = null;
      throw error;
    }
  }

  private async refreshGate(): Promise<KeyStatus> {
    const client = this.client;
    const userId = client?.getUserId();
    const deviceId = client?.getDeviceId();
    const crypto = client?.getCrypto();
    if (
      client === null ||
      crypto === undefined ||
      userId === null ||
      userId === undefined ||
      deviceId === null ||
      deviceId === undefined
    ) {
      return "unknown";
    }
    const secretStorage = await crypto.isSecretStorageReady();
    const status = await crypto.getDeviceVerificationStatus(userId, deviceId);
    if (!secretStorage) return "needs-recovery";
    if (status === null) return "unknown";
    return status.isVerified() ? "ready" : "needs-verification";
  }

  private async secretStorageKey(
    keys: Record<
      string,
      {
        readonly passphrase?: {
          readonly salt: string;
          readonly iterations: number;
          readonly bits?: number;
        };
      }
    >,
  ): Promise<[string, Uint8Array<ArrayBuffer>] | null> {
    const pending = this.pendingSecret;
    if (pending === null) return null;
    const [keyId] = Object.keys(keys);
    if (keyId === undefined) return null;
    if (pending.key !== null) return [keyId, pending.key];
    const derivation = keys[keyId]?.passphrase;
    if (derivation === undefined) return null;
    return [keyId, await derivePassphraseKey(pending.passphrase, derivation)];
  }

  private requireClient(): MatrixClient {
    if (this.client === null) throw new WorkerFailure("not-signed-in");
    return this.client;
  }

  private requireAccount(): AccountDatabase {
    if (this.account === null) throw new WorkerFailure("not-signed-in");
    return this.account;
  }

  private requireOutbox(): Outbox {
    if (this.outbox === null) throw new WorkerFailure("not-signed-in");
    return this.outbox;
  }

  private createOutbox(account: AccountDatabase): Outbox {
    return createOutbox({
      backend: account,
      identity: () => {
        const stored = this.stored;
        if (stored === null) return null;
        const user = this.client?.getUser(stored.userId);
        return { userId: stored.userId, displayName: user?.displayName ?? stored.userId };
      },
      emit: (event: OutboxEvent) => {
        this.emit({ type: "outbox", payload: event });
        this.scheduleRooms();
      },
      deliver: async (record) => {
        const client = this.requireClient();
        const row = record.row;
        const msgtype = row.kind === "notice" ? MsgType.Notice : row.kind === "emote" ? MsgType.Emote : MsgType.Text;
        const response = await client.sendMessage(
          row.roomId,
          {
            msgtype,
            body: row.body,
            ...(row.html === null ? {} : { format: "org.matrix.custom.html" as const, formatted_body: row.html }),
            ...(record.replyTo === null ? {} : { "m.relates_to": { "m.in_reply_to": { event_id: record.replyTo } } }),
          },
          row.transactionId ?? undefined,
        );
        return response.event_id;
      },
      now: () => Date.now(),
    });
  }

  private emit(event: Event): void {
    this.listeners.forEach((listener) => listener(event));
  }

  private emitCachedRooms(records: readonly RoomRecord[]): void {
    this.emit({
      type: "rooms",
      payload: { rooms: records.map((record) => record.room), loading: false },
    });
  }

  private async emitStoredWindow(roomId: string): Promise<void> {
    const window = await this.windowState(roomId);
    if (window.messages.length === 0) return;
    this.emit({
      type: "window",
      payload: {
        roomId,
        messages: window.messages,
        hasOlder: window.hasOlder,
        older: false,
        patch: false,
      },
    });
  }

  private async windowState(roomId: string): Promise<{ messages: readonly MessageRow[]; hasOlder: boolean }> {
    const account = this.requireAccount();
    const events = await account.readLatest(roomId, WINDOW_LIMIT + 1);
    const outbox = this.outbox === null ? [] : await this.outbox.rows(roomId);
    const segment = await account.readSegment(roomId);
    const slice = windowSlice(events, outbox, segment, WINDOW_LIMIT);
    return { messages: slice.messages, hasOlder: slice.hasOlder };
  }

  private async ingestRoom(roomId: string): Promise<void> {
    const client = this.client;
    const room = client?.getRoom(roomId);
    if (client === null || room === null || room === undefined) return;
    const window = projectWindow(room, client.getUserId() ?? "");
    await this.requireAccount().writeEvents(window.messages);
  }

  private roomSummary(roomId: string): RoomSummary | null {
    const client = this.client;
    if (client === null) return null;
    const room = client.getRoom(roomId);
    if (room === null) return null;
    return projectRoom(room, client.getUserId() ?? "", directRooms(client));
  }

  private placeholderRoom(roomId: string): RoomSummary {
    return {
      roomId,
      name: roomId,
      topic: "",
      avatar: null,
      preview: null,
      lastTs: Date.now(),
      latestEventId: null,
      readReceipt: null,
      fullyRead: null,
      unread: 0,
      highlight: 0,
      membership: "join" as const,
      roomType: null,
      directUserId: null,
      spaceId: null,
      tags: {},
      aliases: [],
      joinRule: "invite" as const,
      guestAccess: "forbidden" as const,
      historyVisibility: "shared" as const,
      directoryPublished: false,
      roomVersion: "",
      federated: true,
      notification: "default" as const,
      encryption: "unknown" as const,
      creatorIds: [],
      powerLevels: {
        users: {},
        usersDefault: 0,
        events: {},
        eventsDefault: 0,
        stateDefault: 0,
        invite: 0,
        kick: 0,
        ban: 0,
        redact: 0,
        notificationsRoom: 0,
      },
    };
  }

  private scheduleRooms(): void {
    if (this.roomsQueued) return;
    this.roomsQueued = true;
    queueMicrotask(() => {
      this.roomsQueued = false;
      void this.emitRooms().catch(() => undefined);
    });
  }

  private async emitRooms(): Promise<void> {
    const account = this.account;
    if (account === null) return;
    const records = await account.readRooms();
    const lastOpened = new Map(records.map((record) => [record.room.roomId, record.lastOpened]));
    const client = this.client;
    if (client === null) {
      this.emitCachedRooms(sortRooms(records));
      return;
    }
    const own = client.getUserId() ?? "";
    const direct = directRooms(client);
    const rooms: RoomRecord[] = [];
    for (const room of client.getRooms()) {
      const base = projectRoom(room, own, direct);
      if (base === null) continue;
      const marker = await account.readMarker(room.roomId);
      const latest = await account.readLatest(room.roomId, WINDOW_LIMIT);
      const queued = this.outbox === null ? [] : await this.outbox.rows(room.roomId);
      const projected = projectRoomState(base, latest, queued, marker, own);
      const unread = readState(await account.readEventsAfter(room.roomId, marker?.ts ?? 0), marker, own);
      const summaryRoom = { ...projected, unread: unread.unread, highlight: unread.highlight };
      const record = { room: summaryRoom, lastOpened: lastOpened.get(room.roomId) ?? 0 };
      await account.writeRoom(record);
      rooms.push(record);
    }
    this.emit({
      type: "rooms",
      payload: { rooms: sortRooms(rooms).map((record) => record.room), loading: false },
    });
  }

  private async persistEvent(row: MessageRow): Promise<readonly MessageRow[]> {
    const account = this.requireAccount();
    const outbox = this.outbox;
    if (outbox !== null && row.transactionId !== null) {
      const replaced = await outbox.reconcile(row);
      if (replaced) return [];
    }
    const existing = (await account.readLatest(row.roomId, WINDOW_LIMIT)).find(
      (entry) =>
        (row.eventId !== null && entry.eventId === row.eventId) ||
        (row.transactionId !== null && entry.transactionId === row.transactionId),
    );
    const stored = existing === undefined ? row : { ...row, id: existing.id };
    await account.writeEvent(stored);
    return [stored];
  }

  private async handleTimeline(event: MatrixEvent, room: Room, toStartOfTimeline: boolean): Promise<void> {
    const own = this.client?.getUserId() ?? "";
    const row = projectMessage(room, event, own);
    if (row === null) {
      this.scheduleRooms();
      return;
    }
    const stored = await this.persistEvent(row);
    if (!toStartOfTimeline && this.activeRoomId === room.roomId && stored.length > 0) {
      const window = await this.windowState(room.roomId);
      this.emit({
        type: "window",
        payload: {
          roomId: room.roomId,
          messages: stored,
          hasOlder: window.hasOlder,
          older: false,
          patch: true,
        },
      });
    }
    this.scheduleRooms();
  }

  private async handleDecrypted(event: MatrixEvent): Promise<void> {
    const roomId = event.getRoomId();
    const client = this.client;
    if (roomId === undefined || client === null) return;
    const room = client.getRoom(roomId);
    if (room === null) return;
    const row = projectMessage(room, event, client.getUserId() ?? "");
    if (row === null) return;
    const stored = await this.persistEvent(row);
    if (this.activeRoomId === roomId && stored.length > 0) {
      const window = await this.windowState(roomId);
      this.emit({
        type: "window",
        payload: {
          roomId,
          messages: stored,
          hasOlder: window.hasOlder,
          older: false,
          patch: true,
        },
      });
    }
  }

  private async handleTimelineReset(roomId: string): Promise<void> {
    const account = this.requireAccount();
    const segment = await account.readSegment(roomId);
    await account.writeSegment(markTimelineReset(segment, roomId));
    this.scheduleRooms();
  }

  private async syncMarker(room: Room): Promise<void> {
    const account = this.requireAccount();
    const own = this.client?.getUserId() ?? "";
    const current = await account.readMarker(room.roomId);
    const latest = await account.readLatest(room.roomId, WINDOW_LIMIT);
    let marker: ReadMarker | null = current;
    const fullyRead = room.getAccountData(EventType.FullyRead)?.getContent()["event_id"];
    if (typeof fullyRead === "string") marker = advanceMarker(marker, fullyRead, latest);
    const receipt = room.getEventReadUpTo(own, true);
    if (typeof receipt === "string") marker = advanceMarker(marker, receipt, latest);
    if (marker !== null && marker !== current) await account.writeMarker(marker);
  }

  private wire(client: MatrixClient): void {
    client.on(ClientEvent.SyncUnexpectedError, (error: Error) => {
      if (isRecord(error) && error["errcode"] === "M_UNKNOWN_TOKEN") void this.softLogout();
    });
    client.on(ClientEvent.Sync, (state: SyncState) => {
      if (state === SyncState.Error) {
        this.emit({ type: "connection", payload: "offline" });
        return;
      }
      if (state === SyncState.Prepared || state === SyncState.Syncing || state === SyncState.Catchup) {
        this.emit({ type: "connection", payload: "online" });
        this.scheduleRooms();
      }
      if (state === SyncState.Prepared) {
        void this.refreshGate().then((gate) => {
          this.keyReady = gate;
          this.emit({ type: "keys", payload: gate });
        });
      }
    });
    client.on(RoomEvent.Timeline, (event: MatrixEvent, room: Room | undefined, toStart?: boolean) => {
      if (room !== undefined) void this.handleTimeline(event, room, toStart === true);
    });
    client.on(RoomEvent.TimelineReset, (room: Room | undefined) => {
      if (room !== undefined) void this.handleTimelineReset(room.roomId);
    });
    client.on(MatrixEventEvent.Decrypted, (event: MatrixEvent) => {
      void this.handleDecrypted(event);
    });
    client.on(RoomEvent.Receipt, (_event: MatrixEvent, room: Room) => {
      void this.syncMarker(room).then(() => this.scheduleRooms());
    });
    client.on(RoomEvent.AccountData, (_event: MatrixEvent, room: Room) => {
      void this.syncMarker(room).then(() => this.scheduleRooms());
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
      dbName: `maski:sync:${key}:${stored.deviceId}`,
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
      cryptoCallbacks: {
        getSecretStorageKey: async ({ keys }) => this.secretStorageKey(keys),
      },
      ...(stored.refreshToken === null
        ? {}
        : {
            refreshToken: stored.refreshToken,
            onTokenRefresh: (tokens: { readonly accessToken: string; readonly refreshToken?: string }) => {
              const next: StoredSession = {
                ...stored,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken ?? stored.refreshToken,
              };
              this.stored = next;
              void writeSession(next).catch(() => undefined);
            },
          }),
    });
    this.client = client;
    this.stored = stored;
    this.cryptoPrefix = `maski:crypto:${key}:${stored.deviceId}`;
    this.wire(client);
    await client.store.startup();
    await initAsync(wasmUrl);
    await client.initRustCrypto({ cryptoDatabasePrefix: this.cryptoPrefix });
    this.keyReady = await this.refreshGate();
    await client.startClient({
      initialSyncLimit: 20,
      lazyLoadMembers: true,
      pendingEventOrdering: PendingEventOrdering.Detached,
      threadSupport: false,
    });
    const session = summary(client, stored);
    this.emit({ type: "session", payload: session });
    this.emit({ type: "keys", payload: this.keyReady });
    this.emit({ type: "connection", payload: "connecting" });
    const account = this.account;
    if (account !== null) {
      for (const room of client.getRooms()) await this.syncMarker(room);
    }
    this.scheduleRooms();
    if (this.activeRoomId !== null) {
      await this.ingestRoom(this.activeRoomId);
      await this.emitStoredWindow(this.activeRoomId);
    }
    return session;
  }

  private async softLogout(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.stored = null;
    this.outbox = null;
    this.keyReady = "missing";
    this.releaseLock?.();
    this.releaseLock = null;
    if (client !== null) {
      try {
        client.stopClient();
      } catch {
        // The sync loop may already be stopped.
      }
      client.removeAllListeners();
    }
    await clearSession();
    this.emit({ type: "session", payload: null });
    this.emit({ type: "keys", payload: "missing" });
    this.emit({ type: "connection", payload: "offline" });
  }

  private async teardown(client: MatrixClient | null): Promise<void> {
    const prefix = this.cryptoPrefix;
    const account = this.account;
    this.releaseLock?.();
    this.releaseLock = null;
    this.client = null;
    this.cryptoPrefix = null;
    this.account = null;
    this.outbox = null;
    this.activeRoomId = null;
    this.stored = null;
    this.keyReady = "unknown";
    this.pendingSecret = null;
    if (client === null) {
      if (account !== null) await account.destroy().catch(() => undefined);
      return;
    }
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
    if (account !== null) await account.destroy().catch(() => undefined);
  }
}
