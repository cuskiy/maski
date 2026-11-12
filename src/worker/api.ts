import {
  ClientEvent,
  MatrixError,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  PushRuleKind,
  SyncState,
  createClient,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  type RoomMember,
} from "matrix-js-sdk";
import { decodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api/recovery-key.js";
import { deriveRecoveryKeyFromPassphrase } from "matrix-js-sdk/lib/crypto-api/key-passphrase.js";
import type { CryptoApi } from "matrix-js-sdk/lib/crypto-api/index.js";
import { Attachment, EncryptedAttachment } from "@matrix-org/matrix-sdk-crypto-wasm";
import { accountHash } from "../core/id.ts";
import { STORE } from "../core/schema.ts";
import { asArray, asString, isRecord } from "../core/guard.ts";
import type { KeyStatus, MediaRef, Message, RoomSummary, Session } from "../core/types.ts";
import type { Command, Event, UiaStage } from "../protocol/messages.ts";
import { AccountDb } from "./db.ts";
import type { StoredMessage } from "./normalize.ts";
import { projectPacks, projectRooms, readDirect, refreshDirect } from "./project.ts";
import { searchTokens } from "./normalize.ts";
import { escapeText } from "../core/text.ts";

interface StoredSession {
  session: Session;
  token: string;
}

type Post = (event: Event) => void;

const DEVICE_NAME = "maski";
const MEDIA_LIMIT = 16 * 1024 * 1024;

function reason(error: unknown): string {
  if (error instanceof MatrixError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function send(client: MatrixClient, roomId: string, type: string, content: unknown, txnId?: string): Promise<unknown> {
  const emit: (roomId: string, type: string, content: unknown, txnId?: string) => Promise<unknown> = client.sendEvent.bind(client) as never;
  return emit(roomId, type, content, txnId);
}

export class GateError extends Error {
  readonly code: "no-keys" | "invalid" | "restore" | "uia";

  constructor(code: "no-keys" | "invalid" | "restore" | "uia", cause?: unknown) {
    super(code);
    this.code = code;
    if (cause instanceof Error) this.cause = cause;
  }
}

interface PassphraseInfo {
  salt?: string;
  iterations?: number;
  bits?: number;
}

interface KeyDescription {
  passphrase?: PassphraseInfo;
}

/** Keys arrive from a chat window, a password manager or a scan, so all spacing and
 * formatting characters are dropped before decoding. A passphrase keeps its spaces. */
export function normalizeRecoveryKey(input: string): string {
  return input.replace(/[\s\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/gu, "");
}

async function keyFromInput(input: string, info: KeyDescription): Promise<Uint8Array<ArrayBuffer>> {
  const compact = normalizeRecoveryKey(input);
  if (compact) {
    try {
      return decodeRecoveryKey(compact);
    } catch {
      // A passphrase is not base58, so it falls through to the derivation below.
    }
  }
  const passphrase = info.passphrase;
  if (!passphrase?.salt || input.trim().length === 0) throw new GateError("invalid");
  return deriveRecoveryKeyFromPassphrase(input.trim(), passphrase.salt, passphrase.iterations ?? 500000, passphrase.bits);
}

interface QuietLogger {
  log: () => void;
  info: () => void;
  warn: () => void;
  error: () => void;
  debug: () => void;
  trace: () => void;
  getChild: () => QuietLogger;
}

function kindOfMime(mime: string): Message["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function msgTypeOf(mime: string): string {
  if (mime.startsWith("image/")) return "m.image";
  if (mime.startsWith("video/")) return "m.video";
  if (mime.startsWith("audio/")) return "m.audio";
  return "m.file";
}

function lastMessageId(room: Room | null): string {
  const events = room?.getLiveTimeline().getEvents() ?? [];
  return events.findLast((event) => event.getType() === "m.room.message" || event.getType() === "m.sticker")?.getId() ?? "";
}

function quietLogger(): QuietLogger {
  const logger: QuietLogger = {
    log: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    trace: () => undefined,
    getChild: () => logger,
  };
  return logger;
}

function toStage(stage: string): UiaStage {
  if (stage === "m.login.registration_token") return { stage: "token" };
  if (stage === "m.login.terms") return { stage: "terms" };
  if (stage === "m.login.password") return { stage: "password" };
  return { stage: "dummy" };
}

function normaliseBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

export async function discoverBaseUrl(input: string, user: string): Promise<string> {
  const explicit = normaliseBase(input);
  const fromUser = user.includes(":") ? normaliseBase(user.slice(user.indexOf(":") + 1)) : "";
  const candidate = fromUser || explicit;
  if (!candidate) throw new Error("homeserver");
  try {
    const response = await fetch(new URL("/.well-known/matrix/client", candidate), { mode: "cors" });
    if (response.ok) {
      const body: unknown = await response.json();
      const homeserver = isRecord(body) && isRecord(body["m.homeserver"]) ? body["m.homeserver"]["base_url"] : null;
      const base = typeof homeserver === "string" ? normaliseBase(homeserver) : "";
      if (base) return base;
    }
  } catch {
    // A server without a well-known document is normal; fall back to the origin.
  }
  return candidate;
}

export class WorkerApi {
  private readonly post: Post;
  private db: AccountDb | null = null;
  private client: MatrixClient | null = null;
  private session: Session | null = null;
  private secretKey: { id: string; key: Uint8Array<ArrayBuffer> } | null = null;
  private revision = 0;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private touched = new Set<string>();
  private activeRoomId: string | null = null;
  private ready: Promise<{ session: Session | null }> = Promise.resolve({ session: null });
  private booting: Promise<void> | null = null;

  constructor(post: Post) {
    this.post = post;
  }

  /** Commands wait for the account database, which `start` opens. */
  dispatch(command: Command): Promise<unknown> {
    if (command.type === "start" || command.type === "login" || command.type === "register") return this.handle(command);
    return this.ready.then(() => this.handle(command));
  }

  private handle(command: Command): Promise<unknown> {
    switch (command.type) {
      case "start":
        return this.start(command.accountHash);
      case "login":
        return this.login(command.baseUrl, command.user, command.password);
      case "register":
        return this.register(command);
      case "logout":
        return this.logout();
      case "retrySync":
        this.requireClient().retryImmediately();
        return Promise.resolve({});
      case "keyStatus":
        return this.keyStatus();
      case "unlock":
        return this.unlock(command.recoveryKey);
      case "resetKey":
        return this.resetKey(command.password);
      case "openRoom":
        return this.openRoom(command.roomId);
      case "paginate":
        return this.paginate(command.roomId);
      case "members":
        return this.members(command.roomId);
      case "text":
        return this.sendText(command.roomId, command.txnId, command.body, command.html, command.replyTo);
      case "sticker":
        return this.sendSticker(command.roomId, command.txnId, command.body, command.url, command.replyTo);
      case "sendFile":
        return this.sendFile(command.roomId, command.txnId, command.name, command.mime, command.data);
      case "retry":
        return this.retry(command.txnId);
      case "cancel":
        return this.cancel(command.txnId);
      case "react":
        return this.react(command.roomId, command.eventId, command.key, command.on);
      case "edit":
        return this.edit(command.roomId, command.eventId, command.body, command.html);
      case "redact":
        return this.redact(command.roomId, command.eventId);
      case "markRead":
        return this.markRead(command.roomId, command.eventId);
      case "typing":
        return this.requireClient().sendTyping(command.roomId, command.on, 20000).then(() => ({}));
      case "media":
        return this.media(command.mxc, command.size, command.method, command.file);
      case "join":
        return this.join(command.target);
      case "leave":
        return this.leave(command.roomId);
      case "create":
        return this.create(command.name, command.topic, command.isPublic, command.encrypted, command.invites);
      case "direct":
        return this.direct(command.userId);
      case "invite":
        return this.requireClient().invite(command.roomId, command.userId).then(() => ({}));
      case "tag":
        return this.tag(command.roomId, command.tag, command.on);
      case "mute":
        return this.mute(command.roomId, command.on);
      case "profile":
        return this.profile(command.name, command.avatar);
      case "uploadAvatar":
        return this.uploadAvatar(command.data, command.mime);
      case "uploadRoomAvatar":
        return this.uploadRoomAvatar(command.roomId, command.data, command.mime);
      case "setRoomState":
        return this.setRoomState(command.roomId, command.name, command.topic, command.avatarUrl);
      case "search":
        return this.search(command.query, command.roomId);
      default:
        return Promise.reject(new Error("unknown command"));
    }
  }

  private requireDb(): AccountDb {
    if (!this.db) throw new Error("no account database");
    return this.db;
  }

  private requireClient(): MatrixClient {
    if (!this.client) throw new Error("not signed in");
    return this.client;
  }

  async start(accountHashValue: string | null): Promise<{ session: Session | null }> {
    this.ready = this.openAccount(accountHashValue);
    return this.ready;
  }

  private async openAccount(accountHashValue: string | null): Promise<{ session: Session | null }> {
    if (!accountHashValue) {
      this.post({ event: "ready", session: null, revision: 0 });
      return { session: null };
    }
    this.db = new AccountDb(accountHashValue);
    await this.db.open();
    this.revision = await this.db.meta("revision", 0);
    const stored = await this.db.meta<StoredSession | null>("session", null);
    if (!stored) {
      this.post({ event: "ready", session: null, revision: this.revision });
      return { session: null };
    }
    this.session = stored.session;
    this.post({ event: "ready", session: this.session, revision: this.revision });
    void this.boot(stored);
    this.afterBoot(stored);
    return { session: this.session };
  }

  private requireBooting(): Promise<void> {
    return this.booting ?? Promise.resolve();
  }

  private async requireCrypto(): Promise<CryptoApi> {
    await this.requireBooting();
    const crypto = this.requireClient().getCrypto();
    if (!crypto) throw new Error("Encryption is still starting");
    return crypto;
  }

  private boot(stored: StoredSession): Promise<void> {
    this.booting = this.startUp(stored);
    return this.booting;
  }

  private async startUp(stored: StoredSession): Promise<void> {
    const client = createClient({
      baseUrl: stored.session.baseUrl,
      accessToken: stored.token,
      userId: stored.session.userId,
      deviceId: stored.session.deviceId,
      cryptoCallbacks: {
        getSecretStorageKey: (opts) => {
          const cached = this.secretKey;
          if (!cached || !opts.keys[cached.id]) return Promise.resolve(null);
          return Promise.resolve([cached.id, cached.key]);
        },
        cacheSecretStorageKey: (keyId, _info, key) => {
          this.secretKey = { id: keyId, key };
        },
      },
      logger: quietLogger(),
    });
    this.client = client;
    await client.initRustCrypto({ cryptoDatabasePrefix: `maski-rust-${stored.session.accountHash}` });
    this.attach(client);
    this.post({ event: "connection", connection: "connecting", message: "" });
    client.startClient({ initialSyncLimit: 20, lazyLoadMembers: true }).catch((error: unknown) => {
      this.post({ event: "connection", connection: "error", message: reason(error) });
    });
    await this.recoverQueue();
    await this.postKeys();
  }

  private async refreshProfile(stored: StoredSession): Promise<void> {
    const profile = await this.requireClient().getProfileInfo(stored.session.userId);
    this.session = {
      ...stored.session,
      displayName: profile.displayname ?? stored.session.displayName,
      avatar: profile.avatar_url ?? null,
    };
    await this.saveSession({ ...stored, session: this.session });
    this.post({ event: "session", session: this.session });
  }

  private afterBoot(stored: StoredSession): void {
    void this.requireBooting()
      .then(() => this.refreshProfile(stored))
      .catch(() => undefined);
  }

  private attach(client: MatrixClient): void {
    client.on(ClientEvent.Sync, (state: SyncState, _previous: SyncState | null, data?: unknown) => {
      if (state === SyncState.Syncing || state === SyncState.Prepared) {
        this.post({ event: "connection", connection: "online", message: "" });
        this.collectTouched(data);
        this.schedule();
      } else if (state === SyncState.Error || state === SyncState.Reconnecting) {
        this.post({ event: "connection", connection: "offline", message: "" });
      }
    });
    client.on(RoomEvent.Timeline, (_event: MatrixEvent, room?: Room) => {
      if (room) this.touched.add(room.roomId);
      this.schedule();
    });
    client.on(RoomEvent.TimelineReset, (room?: Room) => {
      if (room) this.touched.add(room.roomId);
      this.schedule();
    });
    client.on(RoomEvent.MyMembership, (room: Room) => {
      this.touched.add(room.roomId);
      this.schedule();
    });
    client.on(RoomStateEvent.Events, (event: MatrixEvent) => {
      const roomId = event.getRoomId();
      if (roomId) this.touched.add(roomId);
      this.schedule();
    });
    client.on(ClientEvent.AccountData, () => this.schedule());
    client.on(ClientEvent.Room, (room: Room) => {
      this.touched.add(room.roomId);
      this.schedule();
    });
    client.on(RoomEvent.Receipt, (_event: MatrixEvent, room: Room) => {
      this.touched.add(room.roomId);
      this.schedule();
    });
    client.on(RoomEvent.Tags, (_event: MatrixEvent, room: Room) => {
      this.touched.add(room.roomId);
      this.schedule();
    });
    client.on(RoomMemberEvent.Typing, (_event: MatrixEvent, member: RoomMember) => {
      const room = client.getRoom(member.roomId);
      if (!room) return;
      const users = room.getMembers().filter((entry) => entry.typing).map((entry) => ({ userId: entry.userId, name: entry.name }));
      this.post({ event: "typing", roomId: member.roomId, users });
    });
  }

  private collectTouched(data: unknown): void {
    if (!isRecord(data) || !isRecord(data["rooms"])) return;
    for (const kind of ["join", "invite", "leave"]) {
      const section = data["rooms"][kind];
      if (!isRecord(section)) continue;
      for (const roomId of Object.keys(section)) this.touched.add(roomId);
    }
  }

  private schedule(): void {
    if (this.syncTimer !== null) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.syncPass();
    }, 60);
  }

  private async syncPass(): Promise<void> {
    const client = this.client;
    const db = this.db;
    if (!client || !db) return;
    const rooms = [...this.touched];
    this.touched.clear();
    try {
      await refreshDirect(db, client);
      if (rooms.length > 0) await projectRooms(db, client, rooms);
      await projectPacks(db, client);
      this.revision += 1;
      await db.setMeta("revision", this.revision);
      this.post({ event: "sync", revision: this.revision, rooms, active: this.activeRoomId, removed: [] });
    } catch (error) {
      this.post({ event: "connection", connection: "error", message: reason(error) });
    }
  }

  private async recoverQueue(): Promise<void> {
    const pending = await this.requireDb().byStatus(["queued", "sending"]);
    for (const message of pending) {
      await this.requireDb().putMessage({ ...message, status: "failed", error: "interrupted" });
    }
  }

  private async saveSession(stored: StoredSession): Promise<void> {
    await this.requireDb().setMeta("session", { session: stored.session, token: stored.token });
    this.session = stored.session;
  }

  private async login(baseUrl: string, user: string, password: string): Promise<Session> {
    const base = await discoverBaseUrl(baseUrl, user);
    const probe = createClient({ baseUrl: base });
    const response = await probe.loginRequest({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: user.replace(/^@/, "").split(":")[0] ?? user },
      password,
      initial_device_display_name: DEVICE_NAME,
    });
    const hash = await accountHash(response.user_id);
    this.db = new AccountDb(hash);
    await this.db.open();
    const stored: StoredSession = {
      token: response.access_token,
      session: {
        userId: response.user_id,
        deviceId: response.device_id,
        displayName: user,
        avatar: null,
        baseUrl: base,
        accountHash: hash,
      },
    };
    await this.saveSession(stored);
    this.post({ event: "ready", session: this.session, revision: this.revision });
    void this.boot(stored);
    this.afterBoot(stored);
    return stored.session;
  }

  private async register(command: Extract<Command, { type: "register" }>): Promise<{ session: Session | null; uia: UiaStage[] | null; uiaSession: string | null }> {
    const base = await discoverBaseUrl(command.baseUrl, "");
    const probe = createClient({ baseUrl: base });
    let auth = command.auth;
    let session = command.session;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await probe.registerRequest({
          username: command.username,
          password: command.password,
          initial_device_display_name: DEVICE_NAME,
          ...(auth ? { auth } : {}),
          ...(session ? { session } : {}),
        } as never);
        return this.acceptRegistration(base, command.username, response);
      } catch (error) {
        if (!(error instanceof MatrixError) || !isRecord(error.data)) throw error;
        const data = error.data;
        session = asString(data["session"]) || session;
        const flows = asArray(data["flows"]);
        const completed = new Set(asArray(data["completed"]).map(String));
        const stages = new Set<string>();
        for (const flow of flows) {
          if (!isRecord(flow)) continue;
          for (const stage of asArray(flow["stages"]).map(String)) stages.add(stage);
        }
        const pending = [...stages].filter((stage) => !completed.has(stage));
        if (pending.length === 1 && pending[0] === "m.login.dummy" && session) {
          auth = { type: "m.login.dummy", session };
          continue;
        }
        return { session: null, uia: pending.map(toStage), uiaSession: session };
      }
    }
    return { session: null, uia: [{ stage: "dummy" }], uiaSession: session };
  }

  private async acceptRegistration(
    base: string,
    username: string,
    response: { access_token?: string; user_id?: string; device_id?: string },
  ): Promise<{ session: Session | null; uia: UiaStage[] | null; uiaSession: string | null }> {
    {
      if (!response.access_token || !response.user_id || !response.device_id) {
        return { session: null, uia: [], uiaSession: null };
      }
      const hash = await accountHash(response.user_id);
      this.db = new AccountDb(hash);
      await this.db.open();
      const stored: StoredSession = {
        token: response.access_token,
        session: {
          userId: response.user_id,
          deviceId: response.device_id,
          displayName: username,
          avatar: null,
          baseUrl: base,
          accountHash: hash,
        },
      };
      await this.saveSession(stored);
      this.post({ event: "ready", session: this.session, revision: this.revision });
      void this.boot(stored);
      this.afterBoot(stored);
      return { session: stored.session, uia: null, uiaSession: null };
    }
  }

  private async logout(): Promise<unknown> {
    const client = this.client;
    const db = this.db;
    try {
      if (client) await client.logout(true);
    } catch {
      // A revoked token still ends the session locally.
    }
    if (client) client.stopClient();
    this.client = null;
    this.session = null;
    if (db) {
      await db.clear();
      db.close();
    }
    this.db = null;
    this.post({ event: "session", session: null });
    return {};
  }

  private async keyStatus(): Promise<KeyStatus> {
    await this.requireBooting();
    const status = await this.currentKeys();
    this.post({ event: "keys", status });
    return status;
  }

  private async currentKeys(): Promise<KeyStatus> {
    const crypto = this.requireClient().getCrypto();
    if (!crypto) return { ready: false, backup: false };
    const ready = await crypto.isSecretStorageReady();
    const backup = (await crypto.checkKeyBackupAndEnable().catch(() => null)) !== null;
    return { ready, backup };
  }

  private async postKeys(): Promise<void> {
    try {
      this.post({ event: "keys", status: await this.currentKeys() });
    } catch {
      this.post({ event: "keys", status: { ready: false, backup: false } });
    }
  }

  private async unlock(input: string): Promise<KeyStatus> {
    const client = this.requireClient();
    const crypto = await this.requireCrypto();
    if (!(await client.secretStorage.hasKey())) throw new GateError("no-keys");
    const stored = await client.secretStorage.getKey();
    if (!stored) throw new GateError("no-keys");
    const [keyId, info] = stored;
    const key = await keyFromInput(input, info);
    if (!(await client.secretStorage.checkKey(key, info))) throw new GateError("invalid");
    this.secretKey = { id: keyId, key };
    try {
      // Importing the cross-signing keys also signs this device, which is what
      // makes it trusted by the other sessions of the account.
      await crypto.bootstrapCrossSigning({});
      await crypto.bootstrapSecretStorage({});
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      await crypto.checkKeyBackupAndEnable();
    } catch (error) {
      throw new GateError("restore", error);
    } finally {
      this.secretKey = null;
    }
    return this.keyStatus();
  }

  private async resetKey(password: string): Promise<{ key: string; status: KeyStatus }> {
    const client = this.requireClient();
    const crypto = await this.requireCrypto();
    const generated = await crypto.createRecoveryKeyFromPassphrase();
    const userId = client.getUserId() ?? "";
    try {
      await crypto.bootstrapSecretStorage({
        createSecretStorageKey: () => Promise.resolve(generated),
        setupNewSecretStorage: true,
        setupNewKeyBackup: true,
      });
      await crypto.bootstrapCrossSigning({
        setupNewCrossSigning: true,
        authUploadDeviceSigningKeys: (makeRequest) =>
          makeRequest({ type: "m.login.password", identifier: { type: "m.id.user", user: userId }, password }),
      });
    } catch (error) {
      throw new GateError("uia", error);
    } finally {
      this.secretKey = null;
    }
    return { key: generated.encodedPrivateKey ?? "", status: await this.keyStatus() };
  }

  private async openRoom(roomId: string): Promise<{ room: RoomSummary | null; messages: Message[]; hasOlder: boolean }> {
    const db = this.requireDb();
    this.activeRoomId = roomId;
    const room = this.client?.getRoom(roomId);
    if (room && room.getMembers().length <= 1) {
      void room
        .loadMembersIfNeeded()
        .then(() => projectRooms(db, this.requireClient(), [roomId]))
        .catch(() => undefined);
    }
    const stored = await db.getRoom(roomId);
    const messages = await db.roomWindow(roomId, 80);
    return { room: stored ?? null, messages, hasOlder: stored?.hasOlder ?? false };
  }

  private async paginate(roomId: string): Promise<{ messages: Message[]; hasOlder: boolean }> {
    const client = this.requireClient();
    const db = this.requireDb();
    const room = client.getRoom(roomId);
    if (!room) return { messages: [], hasOlder: false };
    await client.scrollback(room, 50);
    const cursors = await db.meta<Record<string, string>>("cursors", {});
    delete cursors[roomId];
    await db.setMeta("cursors", cursors);
    await projectRooms(db, client, [roomId]);
    const stored = await db.getRoom(roomId);
    const messages = await db.roomWindow(roomId, 400);
    this.revision += 1;
    await db.setMeta("revision", this.revision);
    this.post({ event: "sync", revision: this.revision, rooms: [roomId], active: roomId, removed: [] });
    return { messages, hasOlder: stored?.hasOlder ?? false };
  }

  private async members(roomId: string): Promise<unknown> {
    const client = this.requireClient();
    const db = this.requireDb();
    const room = client.getRoom(roomId);
    if (!room) return { members: [] };
    if (room.getMembers().length <= 1) {
      try {
        await room.loadMembersIfNeeded();
      } catch {
        // A room whose members cannot be fetched still lists who is known.
      }
    }
    await projectRooms(db, client, [roomId]);
    const members = await db.getAll<{ roomId: string }>(STORE.members);
    return { members: members.filter((member) => member.roomId === roomId) };
  }

  private replyContent(replyTo: string | null, roomId: string): Record<string, unknown> {
    if (!replyTo) return {};
    const fallback = this.replyFallback(replyTo, roomId);
    return {
      "m.relates_to": { "m.in_reply_to": { event_id: replyTo } },
      ...(fallback ? { "m.mentions": { user_ids: [fallback.sender] } } : {}),
    };
  }

  private replyFallback(replyTo: string, roomId: string): { sender: string; body: string; html: string } | null {
    const target = this.requireClient().getRoom(roomId)?.findEventById(replyTo);
    if (!target) return null;
    const sender = target.getSender() ?? "";
    const body = asString(target.getContent()["body"]);
    const line = (body.split("\n")[0] ?? "").slice(0, 120);
    const link = `https://matrix.to/#/${roomId}/${replyTo}`;
    return {
      sender,
      body: `> <${sender}> ${line}\n\n`,
      html: `<mx-reply><blockquote><a href="${link}">In reply to</a> <a href="https://matrix.to/#/${sender}">${escapeText(sender)}</a><br>${escapeText(line)}</blockquote></mx-reply>`,
    };
  }

  private async deliver(txnId: string, task: () => Promise<unknown>): Promise<unknown> {
    try {
      await task();
      this.post({ event: "outbox", txnId, status: "sent", error: "" });
      return {};
    } catch (error) {
      this.post({ event: "outbox", txnId, status: "failed", error: reason(error) });
      throw error;
    }
  }

  private async sendText(roomId: string, txnId: string, body: string, html: string | null, replyTo: string | null): Promise<unknown> {
    const client = this.requireClient();
    const fallback = replyTo ? this.replyFallback(replyTo, roomId) : null;
    const content: Record<string, unknown> = {
      msgtype: "m.text",
      body: `${fallback?.body ?? ""}${body}`,
      ...this.replyContent(replyTo, roomId),
    };
    const formatted = html ?? (body.includes("\n") ? escapeText(body).replace(/\n/g, "<br>") : null);
    if (fallback || formatted) {
      content["format"] = "org.matrix.custom.html";
      content["formatted_body"] = `${fallback?.html ?? ""}${formatted ?? escapeText(body)}`;
    }
    return this.deliver(txnId, () => send(client, roomId, "m.room.message", content, txnId));
  }

  private async sendSticker(roomId: string, txnId: string, body: string, url: string, replyTo: string | null): Promise<unknown> {
    const client = this.requireClient();
    const content = { body, url, info: {}, ...this.replyContent(replyTo, roomId) };
    return this.deliver(txnId, () => send(client, roomId, "m.sticker", content, txnId));
  }

  private async sendFile(roomId: string, txnId: string, name: string, mime: string, data: ArrayBuffer): Promise<unknown> {
    const client = this.requireClient();
    const db = this.requireDb();
    const room = client.getRoom(roomId);
    if (!room) throw new Error("unknown room");
    const msgtype = msgTypeOf(mime);
    let content: Record<string, unknown>;
    return this.deliver(txnId, async () => {
      if (room.hasEncryptionStateEvent()) {
        const attachment = Attachment.encrypt(new Uint8Array(data));
        const file = JSON.parse(attachment.mediaEncryptionInfo ?? "{}") as Record<string, unknown>;
        const blob = new Blob([new Uint8Array(attachment.encryptedData).buffer as ArrayBuffer], { type: "application/octet-stream" });
        const uploaded = await client.uploadContent(new File([blob], name, { type: mime }));
        content = { msgtype, body: name, file: { ...file, url: uploaded.content_uri }, info: { mimetype: mime, size: data.byteLength } };
      } else {
        const uploaded = await client.uploadContent(new File([data], name, { type: mime }));
        content = { msgtype, body: name, url: uploaded.content_uri, info: { mimetype: mime, size: data.byteLength } };
      }
      const pending = await db.get<StoredMessage>(STORE.events, txnId);
      if (pending) {
        const file = isRecord(content["file"]) ? content["file"] : null;
        const media: MediaRef = {
          mxc: asString(file ? file["url"] : content["url"]),
          mime,
          size: data.byteLength,
          width: null,
          height: null,
          duration: null,
          name,
          file,
        };
        await db.putMessage({ ...pending, kind: kindOfMime(mime), body: name, media });
      }
      await send(client, roomId, "m.room.message", content, txnId);
    });
  }

  private async retry(txnId: string): Promise<unknown> {
    const db = this.requireDb();
    const row = await db.get<StoredMessage>(STORE.events, txnId);
    if (!row) return {};
    await db.putMessage({ ...row, status: "queued", error: null });
    if (row.kind === "sticker") return this.sendSticker(row.roomId, txnId, row.body, row.media?.mxc ?? "", row.reply?.id ?? null);
    if (row.kind === "image" || row.kind === "file") return {};
    return this.sendText(row.roomId, txnId, row.body, row.html, row.reply?.id ?? null);
  }

  private async cancel(txnId: string): Promise<unknown> {
    await this.requireDb().del(STORE.events, txnId);
    return {};
  }

  private async react(roomId: string, eventId: string, key: string, on: boolean): Promise<unknown> {
    const client = this.requireClient();
    const room = client.getRoom(roomId);
    if (!room) throw new Error("unknown room");
    if (on) {
      await send(client, roomId, "m.reaction", { "m.relates_to": { rel_type: "m.annotation", event_id: eventId, key } });
      return {};
    }
    const self = client.getUserId() ?? "";
    const container = room.relations.getChildEventsForEvent(eventId, "m.annotation", "m.reaction");
    const bySender = container ? container.getAnnotationsBySender() : null;
    const existing = (bySender ? bySender[self] : null) ?? new Set<MatrixEvent>();
    for (const event of existing) {
      if (asString(event.getContent()["key"]) !== key) continue;
      const id = event.getId();
      if (id) await client.redactEvent(roomId, id);
    }
    return {};
  }

  private async edit(roomId: string, eventId: string, body: string, html: string | null): Promise<unknown> {
    const client = this.requireClient();
    const next: Record<string, unknown> = { msgtype: "m.text", body };
    if (html) {
      next["format"] = "org.matrix.custom.html";
      next["formatted_body"] = html;
    }
    await send(client, roomId, "m.room.message", {
      "m.new_content": next,
      "m.relates_to": { rel_type: "m.replace", event_id: eventId },
      msgtype: "m.text",
      body: `* ${body}`,
    });
    return {};
  }

  private async redact(roomId: string, eventId: string): Promise<unknown> {
    await this.requireClient().redactEvent(roomId, eventId);
    await this.requireDb().del(STORE.events, eventId);
    return {};
  }

  private async markRead(roomId: string, eventId: string): Promise<unknown> {
    const client = this.requireClient();
    const id = eventId || lastMessageId(client.getRoom(roomId));
    if (!id) return {};
    await client.setRoomReadMarkers(roomId, id);
    return {};
  }

  private async search(query: string, roomId: string | null): Promise<{ hits: { roomId: string; message: Message }[] }> {
    const tokens = searchTokens(query);
    if (tokens.length === 0) return { hits: [] };
    const messages = await this.requireDb().search(tokens, roomId, 50);
    return { hits: messages.map((message) => ({ roomId: message.roomId, message })) };
  }

  private async media(mxc: string, size: number, method: "scale" | "crop", file: Record<string, unknown> | null): Promise<{ blob: Blob; mime: string }> {
    const db = this.requireDb();
    const client = this.requireClient();
    const key = `${mxc}@${size}/${method}`;
    const cached = await db.media(key);
    if (cached) return { blob: cached.data, mime: cached.mime };
    const match = /^mxc:\/\/([^/]+)\/(.+)$/.exec(mxc);
    if (!match) throw new Error("bad media id");
    const server = match[1] ?? "";
    const id = match[2] ?? "";
    const token = client.getAccessToken() ?? "";
    const base = client.getHomeserverUrl();
    const path =
      size > 0
        ? `/_matrix/client/v1/media/thumbnail/${encodeURIComponent(server)}/${encodeURIComponent(id)}?width=${size}&height=${size}&method=${method}`
        : `/_matrix/client/v1/media/download/${encodeURIComponent(server)}/${encodeURIComponent(id)}`;
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`media ${response.status}`);
    const raw = new Uint8Array(await response.arrayBuffer());
    const mime = response.headers.get("content-type") ?? "application/octet-stream";
    let bytes = raw;
    if (file) {
      try {
        bytes = new Uint8Array(Attachment.decrypt(new EncryptedAttachment(raw, JSON.stringify(file))));
      } catch {
        throw new Error("cannot decrypt media");
      }
    }
    if (bytes.byteLength > MEDIA_LIMIT) throw new Error("media too large");
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
    await db.putMedia({ key, mxc, mime, data: blob, lastUsed: Date.now() });
    return { blob, mime };
  }

  private async join(target: string): Promise<unknown> {
    const room = await this.requireClient().joinRoom(target);
    await projectRooms(this.requireDb(), this.requireClient(), [room.roomId]);
    return { roomId: room.roomId };
  }

  private async leave(roomId: string): Promise<unknown> {
    const client = this.requireClient();
    await client.leave(roomId);
    const db = this.requireDb();
    await db.del(STORE.rooms, roomId);
    await db.delMatching(STORE.events, "room", roomId);
    await db.delMatching(STORE.members, "room", roomId);
    if (this.activeRoomId === roomId) this.activeRoomId = null;
    this.revision += 1;
    await db.setMeta("revision", this.revision);
    this.post({ event: "sync", revision: this.revision, rooms: [], active: null, removed: [roomId] });
    return {};
  }

  private async create(name: string, topic: string, isPublic: boolean, encrypted: boolean, invites: string[]): Promise<unknown> {
    const client = this.requireClient();
    const options: Record<string, unknown> = {
      name,
      topic,
      visibility: isPublic ? "public" : "private",
      preset: isPublic ? "public_chat" : "private_chat",
      invite: invites.filter(Boolean),
    };
    if (encrypted) {
      options["initial_state"] = [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }];
    }
    const result = await client.createRoom(options as never);
    await projectRooms(this.requireDb(), client, [result.room_id]);
    return { roomId: result.room_id };
  }

  private async direct(userId: string): Promise<unknown> {
    const client = this.requireClient();
    const existing = readDirect(client);
    const rooms = existing?.[userId] ?? [];
    for (const roomId of rooms) {
      const room = client.getRoom(roomId);
      if (room && room.getMyMembership() === "join") return { roomId };
    }
    const result = await client.createRoom({
      is_direct: true,
      invite: [userId],
      preset: "trusted_private_chat",
      initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    } as never);
    const next = { ...existing, [userId]: [...rooms, result.room_id] };
    await client.setAccountData("m.direct" as never, next as never);
    await refreshDirect(this.requireDb(), client);
    await projectRooms(this.requireDb(), client, [result.room_id]);
    return { roomId: result.room_id };
  }

  private async tag(roomId: string, tag: string, on: boolean): Promise<unknown> {
    const client = this.requireClient();
    if (on) await client.setRoomTag(roomId, tag, { order: 0.5 });
    else await client.deleteRoomTag(roomId, tag);
    return {};
  }

  private async mute(roomId: string, on: boolean): Promise<unknown> {
    const client = this.requireClient();
    if (on) {
      await client.addPushRule("global", PushRuleKind.Override, roomId, {
        actions: ["dont_notify"],
        conditions: [{ kind: "event_match", key: "room_id", pattern: roomId }],
      } as never);
    } else {
      await client.deletePushRule("global", PushRuleKind.Override, roomId);
    }
    return {};
  }

  private async profile(name?: string, avatar?: string): Promise<unknown> {
    const client = this.requireClient();
    if (name !== undefined) await client.setDisplayName(name);
    if (avatar !== undefined) await client.setAvatarUrl(avatar);
    return {};
  }

  private async uploadAvatar(data: ArrayBuffer, mime: string): Promise<{ url: string }> {
    const client = this.requireClient();
    const uploaded = await client.uploadContent(new File([data], "avatar", { type: mime }));
    await client.setAvatarUrl(uploaded.content_uri);
    return { url: uploaded.content_uri };
  }

  private async uploadRoomAvatar(roomId: string, data: ArrayBuffer, mime: string): Promise<{ url: string }> {
    const client = this.requireClient();
    const uploaded = await client.uploadContent(new File([data], "room-avatar", { type: mime }));
    await client.sendStateEvent(roomId, "m.room.avatar" as never, { url: uploaded.content_uri } as never, "");
    await projectRooms(this.requireDb(), client, [roomId]);
    return { url: uploaded.content_uri };
  }

  private async setRoomState(roomId: string, name?: string, topic?: string, avatarUrl?: string): Promise<unknown> {
    const client = this.requireClient();
    if (name !== undefined) await client.setRoomName(roomId, name);
    if (topic !== undefined) await client.setRoomTopic(roomId, topic);
    if (avatarUrl !== undefined) await client.sendStateEvent(roomId, "m.room.avatar" as never, { url: avatarUrl } as never, "");
    return {};
  }
}
