import {
  ClientEvent,
  createClient,
  EventTimeline,
  EventType,
  GuestAccess,
  HistoryVisibility,
  IndexedDBStore,
  JoinRule,
  MatrixEventEvent,
  MsgType,
  PendingEventOrdering,
  Preset,
  PushRuleActionName,
  RelationType,
  RestrictedAllowType,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  SSOAction,
  SyncState,
  Visibility,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  type RoomMember,
  type StateEvents,
  type TimelineEvents,
} from "matrix-js-sdk";
import { initAsync } from "@matrix-org/matrix-sdk-crypto-wasm";
import { isRecord } from "../lib/json.ts";
import type {
  BackupState,
  DeviceSession,
  MessageKind,
  MessageRow,
  RoomStatePatch,
  RoomSummary,
  SasState,
  SessionSummary,
} from "../core/types.ts";
import type { CommandMap, Event, KeyStatus, MediaReply, RegisterResult, StartData } from "../protocol/index.ts";
import { WorkerFailure } from "./failure.ts";
import { AccountDatabase, type RoomRecord } from "./accountDb.ts";
import { createOutbox, type Outbox, type OutboxEvent, type OutboxRecord, type UploadedMedia } from "./outbox.ts";
import type { SessionPort } from "./ports.ts";
import { buildMediaContent, MAX_UPLOAD_BYTES, prepareUpload, type MediaContent } from "./mediaFormat.ts";
import { encryptAttachment, encryptedFile } from "./mediaCrypto.ts";
import { createMediaResolver, type MediaResolver } from "./mediaResolver.ts";
import type { EncryptedFileData, MediaReference, MediaSource } from "./mediaTypes.ts";
import {
  advanceMarker,
  markTimelineReset,
  projectRoomState,
  readState,
  rowCursor,
  searchRows,
  WINDOW_LIMIT,
  windowSlice,
  type ReadMarker,
} from "./projection.ts";
import {
  directRooms,
  forwardableEvent,
  projectInvites,
  projectMediaSource,
  projectMediaSources,
  projectMembers,
  projectMessage,
  projectRoom,
  projectWindow,
  spaceParents,
} from "./project.ts";
import { decodeRecoveryKey, derivePassphraseKey } from "./recovery.ts";
import { SasSessions, type SasEvents } from "./sas.ts";
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

type CryptoApiShape = NonNullable<ReturnType<MatrixClient["getCrypto"]>>;
type VerificationRequestShape = Awaited<ReturnType<CryptoApiShape["requestOwnUserVerification"]>>;
type VerifierShape = Awaited<ReturnType<VerificationRequestShape["startVerification"]>>;
type ShowSasShape = NonNullable<ReturnType<VerifierShape["getShowSasCallbacks"]>>;

/**
 * The pinned SDK does not export CryptoEvent, VerificationRequest or Verifier from its package
 * root, so crypto events are subscribed by literal name through this narrow adapter. Callback
 * types are inferred from the public MatrixClient methods; no private subpath is imported.
 */
interface LiteralEmitter {
  on(event: string, listener: (...args: never[]) => void): void;
  off(event: string, listener: (...args: never[]) => void): void;
}

function sasEvents(client: MatrixClient): SasEvents {
  const clientEvents: LiteralEmitter = client;
  return {
    watchIncoming(listener) {
      const handler = (request: VerificationRequestShape): void => listener(request);
      clientEvents.on("crypto.verificationRequestReceived", handler);
      return () => clientEvents.off("crypto.verificationRequestReceived", handler);
    },
    watchRequest(request, onChange) {
      const requestEvents: LiteralEmitter = request;
      requestEvents.on("change", onChange);
      return () => requestEvents.off("change", onChange);
    },
    watchVerifier(verifier, handlers) {
      const verifierEvents: LiteralEmitter = verifier;
      const showSas = (callbacks: ShowSasShape): void => handlers.showSas(callbacks);
      const cancel = (): void => handlers.cancel();
      verifierEvents.on("show_sas", showSas);
      verifierEvents.on("cancel", cancel);
      return () => {
        verifierEvents.off("show_sas", showSas);
        verifierEvents.off("cancel", cancel);
      };
    },
  };
}

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
      backup: true,
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

/** User ids the body names; the one source of mentions for a sent or edited message. */
function mentionedUserIds(room: Room, ownUserId: string, body: string): string[] {
  const ids = new Set<string>();
  for (const member of room.getMembersWithMembership("join")) {
    if (member.userId === ownUserId) continue;
    if (member.name !== "" && body.includes(member.name)) ids.add(member.userId);
    else if (body.includes(member.userId)) ids.add(member.userId);
  }
  return [...ids].toSorted();
}

function mentionIds(value: unknown): readonly string[] {
  if (!isRecord(value) || !Array.isArray(value["user_ids"])) return [];
  return value["user_ids"].filter((id: unknown): id is string => typeof id === "string");
}

type MessageContent = TimelineEvents[typeof EventType.RoomMessage];
type StickerContent = TimelineEvents[typeof EventType.Sticker];

interface SdkEncryptedFile {
  readonly url: string;
  readonly v: string;
  readonly key: {
    readonly kty: string;
    readonly alg: string;
    readonly key_ops: string[];
    readonly ext: boolean;
    readonly k: string;
  };
  readonly iv: string;
  readonly hashes: Record<string, string>;
}

function sdkEncryptedFile(file: EncryptedFileData): SdkEncryptedFile {
  return {
    url: file.url,
    v: file.v,
    key: {
      kty: file.key.kty,
      alg: file.key.alg,
      key_ops: [...file.key.key_ops],
      ext: file.key.ext,
      k: file.key.k,
    },
    iv: file.iv,
    hashes: { ...file.hashes },
  };
}

function messageContent(fields: MediaContent): MessageContent {
  if (fields.msgtype === null) throw new WorkerFailure("unsupported");
  const shared = {
    body: fields.body,
    filename: fields.name,
    info: fields.info,
    ...(fields.html === null ? {} : { format: "org.matrix.custom.html" as const, formatted_body: fields.html }),
    ...(fields.reference.kind === "mxc"
      ? { url: fields.reference.url }
      : fields.reference.kind === "encrypted"
        ? { file: sdkEncryptedFile(fields.reference.file) }
        : {}),
  };
  switch (fields.msgtype) {
    case "m.image":
      return { msgtype: MsgType.Image, ...shared };
    case "m.video":
      return { msgtype: MsgType.Video, ...shared };
    case "m.audio":
      return { msgtype: MsgType.Audio, ...shared };
    case "m.file":
      return { msgtype: MsgType.File, ...shared };
    default:
      throw new WorkerFailure("unsupported");
  }
}

function stickerContent(fields: MediaContent): StickerContent {
  if (fields.reference.kind !== "mxc") throw new WorkerFailure("unsupported");
  return { body: fields.body, info: fields.info, url: fields.reference.url };
}

function uploadFailure(error: unknown): WorkerFailure {
  if (error instanceof WorkerFailure) return error;
  if (isRecord(error)) {
    if (error["httpStatus"] === 413 || error["errcode"] === "M_TOO_LARGE") return new WorkerFailure("too-large");
    if (error["errcode"] === "M_FORBIDDEN") return new WorkerFailure("unavailable");
  }
  return new WorkerFailure("network");
}

async function uploadBlob(client: MatrixClient, blob: Blob, type: string): Promise<string> {
  let response;
  try {
    response = await client.uploadContent(blob, { type, includeFilename: false });
  } catch (error) {
    throw uploadFailure(error);
  }
  if (!response.content_uri.startsWith("mxc://")) throw new WorkerFailure("unavailable");
  return response.content_uri;
}

type JoinRulesContent = StateEvents[typeof EventType.RoomJoinRules];

function restrictedAllow(room: Room): JoinRulesContent["allow"] | undefined {
  const event = room.currentState.getStateEvents(EventType.RoomJoinRules, "");
  const content = event === null ? {} : event.getContent();
  const allow = content["allow"];
  if (!Array.isArray(allow)) return undefined;
  const entries = allow.filter(
    (entry: unknown): entry is { room_id: string; type: RestrictedAllowType } =>
      isRecord(entry) && typeof entry["room_id"] === "string" && entry["type"] === RestrictedAllowType.RoomMembership,
  );
  return entries.length === 0 ? undefined : entries;
}

function sdkJoinRule(value: RoomStatePatch["joinRule"]): JoinRule {
  switch (value) {
    case "public":
      return JoinRule.Public;
    case "invite":
      return JoinRule.Invite;
    case "knock":
      return JoinRule.Knock;
    case "restricted":
      return JoinRule.Restricted;
    case "knock_restricted":
      throw new WorkerFailure("unavailable");
    default:
      throw new WorkerFailure("unavailable");
  }
}

function sdkHistoryVisibility(value: RoomStatePatch["historyVisibility"]): HistoryVisibility {
  switch (value) {
    case "world_readable":
      return HistoryVisibility.WorldReadable;
    case "shared":
      return HistoryVisibility.Shared;
    case "invited":
      return HistoryVisibility.Invited;
    case "joined":
      return HistoryVisibility.Joined;
    default:
      throw new WorkerFailure("unavailable");
  }
}

export class MatrixSession implements SessionPort {
  private client: MatrixClient | null = null;
  private wasmUrl: string | null = null;
  private cryptoPrefix: string | null = null;
  private account: AccountDatabase | null = null;
  private outbox: Outbox | null = null;
  private mediaResolver: MediaResolver | null = null;
  private uploadLimit: number | null = null;
  private stored: StoredSession | null = null;
  private activeRoomId: string | null = null;
  private keyReady: KeyStatus = "unknown";
  private startTask: Promise<SessionSummary> | null = null;
  private sas: SasSessions | null = null;
  private pendingSecret: { readonly key: Uint8Array<ArrayBuffer> | null; readonly passphrase: string } | null = null;
  private readonly secretStorageKeys = new Map<string, Uint8Array<ArrayBuffer>>();
  private releaseLock: (() => void) | null = null;
  private lockUserId: string | null = null;
  private generation = 0;
  private roomsQueued = false;
  private readonly directoryPublished = new Map<string, boolean>();
  private readonly reactionTransactions = new Map<string, string>();
  private readonly leftRooms = new Set<string>();
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
    this.openMedia(account);
    const cached = sortRooms(
      (await account.readRooms()).filter(
        (record) => record.room.membership === "join" || record.room.membership === "invite",
      ),
    );
    this.emitCachedRooms(cached);
    const recent = [...cached].toSorted((left, right) => right.lastOpened - left.lastOpened)[0];
    if (recent !== undefined) await this.emitStoredWindow(recent.room.roomId);
    void this.outbox.resume().catch(() => undefined);
    const generation = this.generation;
    const task = this.startClient(stored, generation);
    this.startTask = task;
    void task
      .catch(() => {
        if (generation !== this.generation) return;
        this.emit({ type: "connection", payload: "offline" });
        this.emit({ type: "session", payload: summary(null, stored) });
      })
      .finally(() => {
        if (this.startTask === task) this.startTask = null;
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
        refresh_token: true,
        initial_device_display_name: "maski",
      });
    } catch {
      throw new WorkerFailure("auth");
    }

    return this.beginSession(baseUrl, response, false);
  }

  async loginToken(input: CommandMap["loginToken"]): Promise<SessionSummary> {
    if (this.wasmUrl === null) throw new WorkerFailure("unavailable");
    const baseUrl = await discoverHomeserver(input.homeserver);
    if (baseUrl === null) throw new WorkerFailure("auth");
    let response;
    try {
      const provisional = createClient({ baseUrl, logger: silentLogger });
      response = await provisional.loginRequest({
        type: "m.login.token",
        token: input.token,
        refresh_token: true,
        initial_device_display_name: "maski",
      });
    } catch {
      throw new WorkerFailure("auth");
    }
    return this.beginSession(baseUrl, response, false);
  }

  async ssoUrl(input: CommandMap["ssoUrl"]): Promise<string> {
    const baseUrl = await discoverHomeserver(input.homeserver);
    if (baseUrl === null) throw new WorkerFailure("auth");
    try {
      const provisional = createClient({ baseUrl, logger: silentLogger });
      return provisional.getSsoLoginUrl(input.redirectUrl, "sso", undefined, SSOAction.LOGIN);
    } catch {
      throw new WorkerFailure("auth");
    }
  }

  async register(input: CommandMap["register"]): Promise<RegisterResult> {
    if (this.wasmUrl === null) throw new WorkerFailure("unavailable");
    const baseUrl = await discoverHomeserver(input.homeserver);
    if (baseUrl === null) throw new WorkerFailure("auth");
    let response;
    const request = {
      username: input.username,
      password: input.password,
      inhibit_login: false,
      refresh_token: true,
      initial_device_display_name: "maski",
    };
    try {
      const provisional = createClient({ baseUrl, logger: silentLogger });
      try {
        response = await provisional.registerRequest(request);
      } catch (error) {
        const data = isRecord(error) ? error["data"] : undefined;
        const sessionId = isRecord(data) ? data["session"] : undefined;
        const flows = isRecord(data) ? data["flows"] : undefined;
        const dummy =
          typeof sessionId === "string" &&
          Array.isArray(flows) &&
          flows.some(
            (flow: unknown) =>
              isRecord(flow) &&
              Array.isArray(flow["stages"]) &&
              flow["stages"].length === 1 &&
              flow["stages"][0] === "m.login.dummy",
          );
        if (!dummy) throw error;
        response = await provisional.registerRequest({
          ...request,
          auth: { type: "m.login.dummy", session: sessionId },
        });
      }
    } catch {
      throw new WorkerFailure("auth");
    }
    const session = await this.beginSession(baseUrl, response);
    let recoveryKey: string | null = null;
    try {
      recoveryKey = await this.resetIdentity(input.password);
    } catch {
      // Registration succeeded; the key page still has to explain a manual reset.
    }
    return { session, recoveryKey, key: this.keyReady };
  }

  async logout(): Promise<null> {
    await this.teardown(this.client);
    await clearSession();
    return null;
  }

  async keyStatus(): Promise<KeyStatus> {
    const task = this.startTask;
    if (task !== null) {
      try {
        await task;
      } catch {
        throw new WorkerFailure("unavailable");
      }
    }
    if (this.client === null) return "missing";
    this.keyReady = await this.refreshGate();
    return this.keyReady;
  }

  async recover(input: CommandMap["recover"]): Promise<KeyStatus> {
    const client = this.requireClient();
    const crypto = client.getCrypto();
    if (crypto === undefined) throw new WorkerFailure("unavailable");
    const recoveryKey = input.recoveryKey.trim();
    let candidate: Uint8Array<ArrayBuffer>;
    if (recoveryKey !== "") {
      candidate = decodeRecoveryKey(recoveryKey);
    } else if (input.passphrase !== "") {
      const keyTuple = await client.secretStorage.getKey();
      const derivation = keyTuple?.[1].passphrase;
      if (derivation === undefined) throw new WorkerFailure("auth");
      candidate = await derivePassphraseKey(input.passphrase, derivation);
    } else {
      throw new WorkerFailure("auth");
    }
    const keyTuple = await client.secretStorage.getKey();
    if (keyTuple === null || !(await client.secretStorage.checkKey(candidate, keyTuple[1]))) {
      throw new WorkerFailure("auth");
    }
    this.pendingSecret = { key: candidate, passphrase: "" };
    this.secretStorageKeys.set(keyTuple[0], candidate);
    try {
      await crypto.bootstrapSecretStorage({});
      if (!(await crypto.isSecretStorageReady())) throw new WorkerFailure("auth");
      if ((await client.secretStorage.get("m.cross_signing.master")) === undefined) {
        throw new WorkerFailure("auth");
      }
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

  async devices(): Promise<readonly DeviceSession[]> {
    const client = this.requireClient();
    const crypto = client.getCrypto();
    const own = client.getUserId();
    if (crypto === undefined || own === null) {
      const failure = new WorkerFailure("unavailable");
      this.emit({ type: "devices", payload: { devices: null, error: failure.code } });
      throw failure;
    }
    const current = client.getDeviceId();
    let response;
    try {
      response = await client.getDevices();
    } catch (error) {
      const failure = this.transportFailure(error);
      this.emit({ type: "devices", payload: { devices: null, error: failure.code } });
      throw failure;
    }
    const devices = await Promise.all(
      response.devices.map(async (device) => {
        const status = await crypto.getDeviceVerificationStatus(own, device.device_id).catch(() => null);
        return {
          id: device.device_id,
          name: device.display_name ?? device.device_id,
          lastSeen: typeof device.last_seen_ts === "number" ? new Date(device.last_seen_ts).toISOString() : "",
          verified: status?.isVerified() ?? false,
          current: device.device_id === current,
          capabilities: { verify: device.device_id !== current, signOut: false },
        } satisfies DeviceSession;
      }),
    );
    this.emit({ type: "devices", payload: { devices, error: null } });
    return devices;
  }

  async backupStatus(): Promise<BackupState> {
    return this.readBackup(this.requireClient());
  }

  async backupSetup(): Promise<BackupState> {
    const client = this.requireClient();
    const crypto = client.getCrypto();
    if (crypto === undefined) throw new WorkerFailure("unavailable");
    try {
      await crypto.resetKeyBackup();
      await crypto.checkKeyBackupAndEnable();
    } catch (error) {
      const failure = this.transportFailure(error);
      const current = await this.readBackup(client).catch(() => null);
      this.emit({
        type: "backup",
        payload: {
          ...(current ?? {
            version: null,
            trusted: false,
            matchesDecryptionKey: false,
            enabled: false,
            error: null,
          }),
          error: failure.code,
        },
      });
      throw failure;
    }
    const state = await this.readBackup(client);
    this.emit({ type: "backup", payload: state });
    return state;
  }

  private async readBackup(client: MatrixClient): Promise<BackupState> {
    const crypto = client.getCrypto();
    if (crypto === undefined) throw new WorkerFailure("unavailable");
    const info = await crypto.getKeyBackupInfo();
    if (info === null) {
      return { version: null, trusted: false, matchesDecryptionKey: false, enabled: false, error: null };
    }
    const trust = await crypto.isKeyBackupTrusted(info);
    const active = await crypto.getActiveSessionBackupVersion();
    return {
      version: info.version,
      trusted: trust.trusted,
      matchesDecryptionKey: trust.matchesDecryptionKey,
      enabled: active !== null,
      error: null,
    };
  }

  private refreshBackup(): void {
    const client = this.client;
    if (client === null) return;
    void this.readBackup(client)
      .then((state) => this.emit({ type: "backup", payload: state }))
      .catch(() => undefined);
  }

  async sasStart(deviceId: string | null): Promise<SasState> {
    const sas = this.sas;
    if (sas === null) throw new WorkerFailure("unavailable");
    return sas.start(deviceId);
  }

  async sasAccept(id: string): Promise<null> {
    const sas = this.sas;
    if (sas === null) throw new WorkerFailure("unavailable");
    return sas.accept(id);
  }

  async sasConfirm(id: string): Promise<null> {
    const sas = this.sas;
    if (sas === null) throw new WorkerFailure("unavailable");
    return sas.confirm(id);
  }

  async sasMismatch(id: string): Promise<null> {
    const sas = this.sas;
    if (sas === null) throw new WorkerFailure("unavailable");
    return sas.mismatch(id);
  }

  async sasCancel(id: string): Promise<null> {
    const sas = this.sas;
    if (sas === null) throw new WorkerFailure("unavailable");
    return sas.cancel(id);
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
          identifier: { type: "m.id.user", user: userId },
          password,
          session,
        });
      }
    };

    try {
      await crypto.resetEncryption(auth);
      const key = await crypto.createRecoveryKeyFromPassphrase();
      await crypto.bootstrapSecretStorage({
        setupNewSecretStorage: true,
        setupNewKeyBackup: true,
        createSecretStorageKey: () => Promise.resolve(key),
      });
      this.keyReady = await this.refreshGate();
      this.emit({ type: "keys", payload: this.keyReady });
      return key.encodedPrivateKey ?? null;
    } catch {
      throw new WorkerFailure("auth");
    }
  }

  async open(roomId: string): Promise<null> {
    const account = this.requireAccount();
    if (!this.directoryPublished.has(roomId)) {
      void this.refreshDirectoryVisibility(roomId).then(() => this.scheduleRooms());
    }
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
    _media: CommandMap["send"]["media"],
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
      // Bytes only travel through `sendMedia`; this path cannot upload.
      media: null,
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

  /**
   * Validates, strips and caches the bytes, then queues one outbox row. The upload itself happens
   * in `deliver`, so a send retry never repeats it.
   */
  async sendMedia(input: CommandMap["sendMedia"]): Promise<MessageRow> {
    const client = this.requireClient();
    const account = this.requireAccount();
    const media = this.requireMedia();
    const room = this.requireRoom(input.roomId);
    const own = client.getUserId();
    if (own === null) throw new WorkerFailure("not-signed-in");
    if (room.getMyMembership() !== "join" || !room.currentState.maySendMessage(own)) {
      throw new WorkerFailure("unavailable");
    }
    if (input.kind === "sticker" && (await this.encryptionEnabled(client, input.roomId))) {
      // `m.sticker` has no encrypted `file`; sending one would leak an unencrypted image.
      throw new WorkerFailure("unsupported");
    }
    const prepared = await prepareUpload(input.file, input.name, input.kind, await this.uploadLimitFor(client));
    const local = await media.cacheLocal(prepared.blob, prepared.mime, prepared.width, prepared.height, prepared.hash);
    await account.writeMediaSource({
      roomId: input.roomId,
      messageId: input.messageId,
      kind: input.kind,
      name: prepared.name,
      caption: input.caption,
      width: prepared.width,
      height: prepared.height,
      size: prepared.size,
      duration: null,
      mime: prepared.mime,
      source: { kind: "local", key: local.key },
      thumbnail: { kind: "local", key: local.key },
    });
    const outbox = this.requireOutbox();
    const row = await outbox.queue({
      roomId: input.roomId,
      messageId: input.messageId,
      transactionId: input.transactionId,
      body: input.caption,
      html: input.html,
      kind: input.kind,
      replyTo: input.replyTo,
      media: {
        kind: input.kind,
        name: prepared.name,
        mime: prepared.mime,
        width: prepared.width,
        height: prepared.height,
        size: prepared.size,
        duration: null,
        hash: prepared.hash,
        blob: prepared.blob,
        previewUrl: local.url,
      },
    });
    void outbox.deliver(input.messageId).catch(() => undefined);
    this.scheduleRooms();
    return row;
  }

  async media(input: CommandMap["media"]): Promise<MediaReply> {
    const client = this.requireClient();
    const account = this.requireAccount();
    const source = await account.readMediaSource(input.roomId, input.messageId);
    if (source === null) throw new WorkerFailure("unavailable");
    return this.requireMedia().resolve(client, source, input.variant);
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

  async react(roomId: string, eventId: string, key: string): Promise<null> {
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    const own = client.getUserId();
    if (own === null) throw new WorkerFailure("not-signed-in");
    if (room.getMyMembership() !== "join") throw new WorkerFailure("unavailable");
    const target = room.findEventById(eventId);
    if (target === undefined || target.isRedacted()) throw new WorkerFailure("unavailable");
    const relations = room.relations.getChildEventsForEvent(eventId, RelationType.Annotation, EventType.Reaction);
    const mine = relations?.getAnnotationsBySender()?.[own] ?? new Set<MatrixEvent>();
    const existing = [...mine].find((child) => !child.isRedacted() && child.getRelation()?.key === key);
    const transactionKey =
      existing === undefined ? `${roomId}\n${eventId}\n${key}` : `redact\n${existing.getId() ?? eventId}`;
    const transactionId = this.reactionTransaction(transactionKey);
    try {
      if (existing === undefined) {
        await client.sendEvent(
          roomId,
          EventType.Reaction,
          { "m.relates_to": { rel_type: RelationType.Annotation, event_id: eventId, key } },
          transactionId,
        );
      } else {
        const reactionId = existing.getId();
        if (reactionId === undefined) throw new WorkerFailure("unavailable");
        await client.redactEvent(roomId, reactionId, transactionId);
      }
    } catch (error) {
      throw this.transportFailure(error);
    }
    this.reactionTransactions.delete(transactionKey);
    return null;
  }

  async edit(roomId: string, eventId: string, body: string, html: string | null): Promise<null> {
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    const own = client.getUserId();
    if (own === null) throw new WorkerFailure("not-signed-in");
    if (!room.currentState.maySendMessage(own)) throw new WorkerFailure("unavailable");
    const target = room.findEventById(eventId);
    if (target === undefined || target.isRedacted() || target.getSender() !== own) {
      throw new WorkerFailure("unavailable");
    }
    if (target.getType() !== EventType.RoomMessage && target.getType() !== EventType.RoomMessageEncrypted) {
      throw new WorkerFailure("unavailable");
    }
    if (target.getRelation()?.rel_type === RelationType.Replace) throw new WorkerFailure("unavailable");
    const original = target.getContent();
    const msgtype =
      original["msgtype"] === MsgType.Notice
        ? MsgType.Notice
        : original["msgtype"] === MsgType.Emote
          ? MsgType.Emote
          : MsgType.Text;
    const mentions = mentionedUserIds(room, own, body);
    const existingMentions = mentionIds(original["m.mentions"]);
    const added = mentions.filter((id) => !existingMentions.includes(id));
    try {
      await client.sendMessage(
        roomId,
        {
          msgtype,
          body: `* ${body}`,
          ...(html === null ? {} : { format: "org.matrix.custom.html" as const, formatted_body: `* ${html}` }),
          "m.new_content": {
            msgtype,
            body,
            ...(html === null ? {} : { format: "org.matrix.custom.html" as const, formatted_body: html }),
            ...(mentions.length === 0 ? {} : { "m.mentions": { user_ids: mentions } }),
          },
          "m.relates_to": { rel_type: RelationType.Replace, event_id: eventId },
          ...(added.length === 0 ? {} : { "m.mentions": { user_ids: added } }),
        },
        crypto.randomUUID(),
      );
    } catch (error) {
      throw this.transportFailure(error);
    }
    return null;
  }

  async redact(roomId: string, eventId: string): Promise<null> {
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    const own = client.getUserId();
    if (own === null) throw new WorkerFailure("not-signed-in");
    const target = room.findEventById(eventId);
    if (target === undefined || target.isRedacted()) throw new WorkerFailure("unavailable");
    if (!room.currentState.maySendRedactionForEvent(target, own)) throw new WorkerFailure("unavailable");
    try {
      await client.redactEvent(roomId, eventId, crypto.randomUUID());
    } catch (error) {
      throw this.transportFailure(error);
    }
    return null;
  }

  async typing(roomId: string, typing: boolean): Promise<null> {
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    if (room.getMyMembership() !== "join") throw new WorkerFailure("unavailable");
    try {
      await client.sendTyping(roomId, typing, typing ? 30_000 : 0);
    } catch (error) {
      throw this.transportFailure(error);
    }
    return null;
  }

  async search(
    roomIds: readonly string[],
    query: string,
    mediaKinds: readonly MessageKind[],
    limit: number,
  ): Promise<readonly MessageRow[]> {
    const account = this.requireAccount();
    const events: MessageRow[] = [];
    const outbox: MessageRow[] = [];
    for (const roomId of roomIds) {
      events.push(...(await account.readEvents(roomId)));
      if (this.outbox !== null) outbox.push(...(await this.outbox.rows(roomId)));
    }
    return searchRows(events, outbox, query, mediaKinds, limit);
  }

  async leaveRoom(roomId: string): Promise<null> {
    const client = this.requireClient();
    const account = this.requireAccount();
    try {
      await client.leave(roomId);
    } catch (error) {
      throw this.transportFailure(error);
    }
    await account.deleteRoom(roomId);
    this.leftRooms.add(roomId);
    this.directoryPublished.delete(roomId);
    if (this.activeRoomId === roomId) this.activeRoomId = null;
    await this.emitRooms();
    this.emitInvites();
    return null;
  }

  async setRoomTag(roomId: string, tag: CommandMap["setRoomTag"]["tag"], enabled: boolean): Promise<null> {
    const client = this.requireClient();
    this.requireRoom(roomId);
    try {
      if (enabled) await client.setRoomTag(roomId, tag, { order: 0.5 });
      else await client.deleteRoomTag(roomId, tag);
    } catch (error) {
      throw this.transportFailure(error);
    }
    await this.emitRooms();
    return null;
  }

  async setNotification(roomId: string, mode: CommandMap["setNotification"]["mode"]): Promise<null> {
    const client = this.requireClient();
    this.requireRoom(roomId);
    if (mode === "all" || mode === "mentions") {
      // A per-room "all/mentions" choice needs push-rule conditions this product does not store.
      throw new WorkerFailure("unavailable");
    }
    try {
      await client.setRoomMutePushRule("global", roomId, mode === "mute");
    } catch (error) {
      throw this.transportFailure(error);
    }
    await this.emitRooms();
    return null;
  }

  async setRoomState(roomId: string, patch: RoomStatePatch): Promise<null> {
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    const own = client.getUserId();
    if (own === null) throw new WorkerFailure("not-signed-in");
    const ownMember = room.getMember(own);
    if (ownMember === null) throw new WorkerFailure("unavailable");
    try {
      if (patch.name !== undefined) {
        if (!room.currentState.maySendStateEvent(EventType.RoomName, own)) throw new WorkerFailure("unavailable");
        await client.setRoomName(roomId, patch.name);
      }
      if (patch.topic !== undefined) {
        if (!room.currentState.maySendStateEvent(EventType.RoomTopic, own)) throw new WorkerFailure("unavailable");
        await client.setRoomTopic(roomId, patch.topic);
      }
      if (patch.joinRule !== undefined) {
        if (!room.currentState.maySendStateEvent(EventType.RoomJoinRules, own)) {
          throw new WorkerFailure("unavailable");
        }
        const allow = restrictedAllow(room);
        await client.sendStateEvent(
          roomId,
          EventType.RoomJoinRules,
          {
            join_rule: sdkJoinRule(patch.joinRule),
            ...(allow === undefined ? {} : { allow }),
          },
          "",
        );
      }
      if (patch.guestAccess !== undefined) {
        if (!room.currentState.maySendStateEvent(EventType.RoomGuestAccess, own)) {
          throw new WorkerFailure("unavailable");
        }
        await client.sendStateEvent(
          roomId,
          EventType.RoomGuestAccess,
          { guest_access: patch.guestAccess === "can_join" ? GuestAccess.CanJoin : GuestAccess.Forbidden },
          "",
        );
      }
      if (patch.historyVisibility !== undefined) {
        if (!room.currentState.maySendStateEvent(EventType.RoomHistoryVisibility, own)) {
          throw new WorkerFailure("unavailable");
        }
        await client.sendStateEvent(
          roomId,
          EventType.RoomHistoryVisibility,
          { history_visibility: sdkHistoryVisibility(patch.historyVisibility) },
          "",
        );
      }
      if (patch.directoryPublished !== undefined) {
        await client.setRoomDirectoryVisibility(
          roomId,
          patch.directoryPublished ? Visibility.Public : Visibility.Private,
        );
        this.directoryPublished.set(roomId, patch.directoryPublished);
      }
      if (patch.aliases !== undefined) {
        if (!room.currentState.maySendStateEvent(EventType.RoomCanonicalAlias, own)) {
          throw new WorkerFailure("unavailable");
        }
        const desired = [...new Set(patch.aliases)];
        const canonical = room.getCanonicalAlias();
        const current = canonical === null ? [] : [canonical, ...room.getAltAliases()];
        for (const alias of desired) {
          if (!current.includes(alias)) await client.createAlias(alias, roomId);
        }
        for (const alias of current) {
          if (!desired.includes(alias)) await client.deleteAlias(alias);
        }
        await client.sendStateEvent(
          roomId,
          EventType.RoomCanonicalAlias,
          desired[0] === undefined ? { alt_aliases: [] } : { alias: desired[0], alt_aliases: desired.slice(1) },
          "",
        );
      }
    } catch (error) {
      throw this.transportFailure(error);
    }
    await this.emitRooms();
    return null;
  }

  async inviteUser(roomId: string, userId: string): Promise<null> {
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    if (!room.canInvite(userId)) throw new WorkerFailure("unavailable");
    const existing = room.getMember(userId);
    if (existing?.membership === "join") return null;
    try {
      await client.invite(roomId, userId);
    } catch (error) {
      throw this.transportFailure(error);
    }
    this.emit({ type: "members", payload: { roomId, members: projectMembers(room) } });
    this.scheduleRooms();
    return null;
  }

  async joinRoom(roomIdOrAlias: string): Promise<string> {
    const client = this.requireClient();
    try {
      const room = await client.joinRoom(roomIdOrAlias);
      this.leftRooms.delete(room.roomId);
      await this.emitRooms();
      this.emitInvites();
      return room.roomId;
    } catch (error) {
      throw this.transportFailure(error);
    }
  }

  async answerInvite(roomId: string, accept: boolean): Promise<string | null> {
    if (accept) return this.joinRoom(roomId);
    await this.leaveRoom(roomId);
    return null;
  }

  async createRoom(name: string, topic: string, directUserId: string | null): Promise<string> {
    const client = this.requireClient();
    let roomId: string;
    try {
      const created = await client.createRoom({
        name,
        topic,
        preset: directUserId === null ? Preset.PrivateChat : Preset.TrustedPrivateChat,
        visibility: Visibility.Private,
        ...(directUserId === null ? {} : { is_direct: true, invite: [directUserId] }),
      });
      roomId = created.room_id;
    } catch (error) {
      throw this.transportFailure(error);
    }
    if (directUserId !== null) {
      const current = client.getAccountData(EventType.Direct)?.getContent();
      const map: Record<string, string[]> = {};
      if (isRecord(current)) {
        for (const [userId, roomIds] of Object.entries(current)) {
          if (!Array.isArray(roomIds)) continue;
          map[userId] = roomIds.filter((id: unknown): id is string => typeof id === "string");
        }
      }
      map[directUserId] = [...(map[directUserId] ?? []).filter((id) => id !== roomId), roomId];
      try {
        await client.setAccountData(EventType.Direct, map);
      } catch (error) {
        throw this.transportFailure(error);
      }
    }
    this.leftRooms.delete(roomId);
    await this.emitRooms();
    return roomId;
  }

  async forward(
    targetRoomId: string,
    sources: readonly { readonly roomId: string; readonly eventId: string }[],
  ): Promise<null> {
    const client = this.requireClient();
    const target = this.requireRoom(targetRoomId);
    if (target.getMyMembership() !== "join") throw new WorkerFailure("unavailable");
    let sent = 0;
    try {
      for (const source of sources) {
        const room = client.getRoom(source.roomId);
        if (room === null) continue;
        const event = room.findEventById(source.eventId);
        if (event === undefined) continue;
        const forwardable = forwardableEvent(event);
        if (forwardable === null) continue;
        const transactionId = crypto.randomUUID();
        if (forwardable.kind === "sticker") {
          await client.sendEvent(targetRoomId, EventType.Sticker, forwardable.content, transactionId);
        } else {
          await client.sendMessage(targetRoomId, forwardable.content, transactionId);
        }
        sent += 1;
      }
    } catch (error) {
      throw this.transportFailure(error);
    }
    if (sent !== sources.length) throw new WorkerFailure("unavailable");
    this.scheduleRooms();
    return null;
  }

  async memberAction(roomId: string, userId: string, action: "kick" | "ban" | "unban"): Promise<null> {
    const client = this.requireClient();
    const room = this.requireRoom(roomId);
    const own = client.getUserId();
    if (own === null) throw new WorkerFailure("not-signed-in");
    if (userId === own) throw new WorkerFailure("unavailable");
    const target = room.getMember(userId);
    if (target === null) throw new WorkerFailure("unavailable");
    if (action === "unban" && target.membership !== "ban") throw new WorkerFailure("unavailable");
    if (action === "kick" && target.membership !== "join" && target.membership !== "invite") {
      throw new WorkerFailure("unavailable");
    }
    const ownMember = room.getMember(own);
    const ownLevel = ownMember?.powerLevel ?? 0;
    const threshold = action === "kick" ? "kick" : "ban";
    if (!room.currentState.hasSufficientPowerLevelFor(threshold, ownLevel)) {
      throw new WorkerFailure("unavailable");
    }
    if (target.powerLevel >= ownLevel && target.membership !== "leave") {
      throw new WorkerFailure("unavailable");
    }
    try {
      if (action === "kick") await client.kick(roomId, userId);
      else if (action === "ban") await client.ban(roomId, userId);
      else await client.unban(roomId, userId);
    } catch (error) {
      throw this.transportFailure(error);
    }
    this.emit({ type: "members", payload: { roomId, members: projectMembers(room) } });
    this.scheduleRooms();
    return null;
  }

  private reactionTransaction(key: string): string {
    const existing = this.reactionTransactions.get(key);
    if (existing !== undefined) return existing;
    const transactionId = crypto.randomUUID();
    this.reactionTransactions.set(key, transactionId);
    return transactionId;
  }

  private transportFailure(error: unknown): WorkerFailure {
    if (error instanceof WorkerFailure) return error;
    return new WorkerFailure("network");
  }

  private requireRoom(roomId: string): Room {
    const client = this.requireClient();
    const room = client.getRoom(roomId);
    if (room === null) throw new WorkerFailure("unavailable");
    return room;
  }

  private async refreshDirectoryVisibility(roomId: string): Promise<void> {
    const client = this.client;
    if (client === null) return;
    try {
      const visibility = await client.getRoomDirectoryVisibility(roomId);
      this.directoryPublished.set(roomId, visibility.visibility === Visibility.Public);
    } catch {
      // A server may forbid reading the directory entry; unknown stays unpublished.
    }
  }

  private async acquireLock(userId: string): Promise<void> {
    if (this.releaseLock !== null) {
      if (this.lockUserId === userId) return;
      throw new WorkerFailure("locked");
    }
    if (navigator.locks === undefined) {
      this.lockUserId = userId;
      return;
    }
    const acquired = Promise.withResolvers<void>();
    const held = Promise.withResolvers<void>();
    this.releaseLock = held.resolve;
    void navigator.locks
      .request(`maski:account:${accountKey(userId)}`, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (lock === null) {
          acquired.reject(new WorkerFailure("locked"));
          return;
        }
        this.lockUserId = userId;
        acquired.resolve();
        await held.promise;
      })
      .catch(() => acquired.reject(new WorkerFailure("locked")));
    try {
      await acquired.promise;
    } catch (error) {
      this.releaseLock = null;
      this.lockUserId = null;
      throw error;
    }
  }

  /** One writer for the SAS aftermath: the gate and the device list both come from crypto. */
  private async refreshKeys(): Promise<void> {
    if (this.client === null) return;
    this.keyReady = await this.refreshGate();
    this.emit({ type: "keys", payload: this.keyReady });
    await this.devices().catch(() => undefined);
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
    const [keyId] = Object.keys(keys);
    if (keyId === undefined) return null;
    const cached = this.secretStorageKeys.get(keyId);
    if (cached !== undefined) return [keyId, cached];
    const pending = this.pendingSecret;
    if (pending === null) return null;
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
        const media = record.media ?? null;
        if (media !== null) {
          const uploaded = record.uploaded;
          if (uploaded === null) throw new WorkerFailure("unavailable");
          const fields = buildMediaContent({
            kind: media.kind,
            name: media.name,
            caption: row.body,
            html: row.html,
            mime: media.mime,
            size: media.size,
            width: media.width,
            height: media.height,
            duration: media.duration,
            reference: uploaded.source,
          });
          const transactionId = row.transactionId ?? undefined;
          const response =
            fields.event === "sticker"
              ? await client.sendEvent(row.roomId, EventType.Sticker, stickerContent(fields), transactionId)
              : await client.sendMessage(row.roomId, messageContent(fields), transactionId);
          return response.event_id;
        }
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
      upload: (record) => this.uploadMedia(record),
      now: () => Date.now(),
    });
  }

  private openMedia(account: AccountDatabase): void {
    this.mediaResolver?.dispose();
    this.mediaResolver = createMediaResolver({
      backend: account,
      createUrl: (blob: Blob) => URL.createObjectURL(blob),
      revokeUrl: (url: string) => URL.revokeObjectURL(url),
      revoked: (subscription) => {
        this.emit({
          type: "media",
          payload: {
            roomId: subscription.roomId,
            messageId: subscription.messageId,
            variant: subscription.variant,
            url: null,
          },
        });
      },
      now: () => Date.now(),
    });
  }

  private requireMedia(): MediaResolver {
    if (this.mediaResolver === null) throw new WorkerFailure("not-signed-in");
    return this.mediaResolver;
  }

  private encryptionEnabled(client: MatrixClient, roomId: string): Promise<boolean> {
    const crypto = client.getCrypto();
    if (crypto === undefined) return Promise.resolve(false);
    return crypto.isEncryptionEnabledInRoom(roomId);
  }

  private async uploadLimitFor(client: MatrixClient): Promise<number> {
    if (this.uploadLimit !== null) return this.uploadLimit;
    let limit = MAX_UPLOAD_BYTES;
    try {
      const config = await client.getMediaConfig(true);
      const declared = config["m.upload.size"];
      if (typeof declared === "number" && Number.isFinite(declared) && declared > 0) {
        limit = Math.min(declared, MAX_UPLOAD_BYTES);
      }
    } catch {
      // A server without the media config endpoint keeps the local cap.
    }
    this.uploadLimit = limit;
    return limit;
  }

  /** Uploads the sanitized bytes once; the reference is persisted by the outbox before send. */
  private async uploadMedia(record: OutboxRecord): Promise<UploadedMedia> {
    const client = this.requireClient();
    const media = record.media;
    if (media === null) throw new WorkerFailure("unavailable");
    let source: MediaReference;
    if (await this.encryptionEnabled(client, record.roomId)) {
      const sealed = await encryptAttachment(media.blob);
      const url = await uploadBlob(client, sealed.ciphertext, "application/octet-stream");
      source = { kind: "encrypted", file: encryptedFile(url, sealed) };
    } else {
      source = { kind: "mxc", url: await uploadBlob(client, media.blob, media.mime) };
    }
    await this.recordUploadSource(record, source);
    return { source };
  }

  private async recordUploadSource(record: OutboxRecord, source: MediaReference): Promise<void> {
    const media = record.media;
    if (media === null) return;
    const account = this.requireAccount();
    const existing = await account.readMediaSource(record.roomId, record.messageId);
    const shared: MediaSource = existing ?? {
      roomId: record.roomId,
      messageId: record.messageId,
      kind: media.kind,
      name: media.name,
      caption: record.row.body,
      width: media.width,
      height: media.height,
      size: media.size,
      duration: media.duration,
      mime: media.mime,
      source: null,
      thumbnail: null,
    };
    await account.writeMediaSource({
      ...shared,
      source,
      thumbnail: media.kind === "image" || media.kind === "sticker" ? source : null,
    });
  }

  private async recordProjectedSource(room: Room, event: MatrixEvent): Promise<void> {
    const source = projectMediaSource(room, event);
    if (source === null) return;
    await this.requireAccount().writeMediaSource(source);
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

  private emitInvites(): void {
    const client = this.client;
    if (client === null) return;
    this.emit({ type: "invites", payload: projectInvites(client) });
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
    const account = this.requireAccount();
    await account.writeEvents(window.messages);
    await account.writeMediaSources(projectMediaSources(room));
  }

  private roomSummary(roomId: string): RoomSummary | null {
    const client = this.client;
    if (client === null) return null;
    const room = client.getRoom(roomId);
    if (room === null) return null;
    const projected = projectRoom(
      room,
      client.getUserId() ?? "",
      directRooms(client),
      this.notificationFor(roomId),
      this.directoryPublished.get(roomId) ?? false,
    );
    return projected === null ? null : { ...projected, spaceId: spaceParents(client).get(roomId) ?? null };
  }

  private notificationFor(roomId: string): RoomSummary["notification"] {
    const client = this.client;
    if (client === null) return "default";
    try {
      const rule = client.getRoomPushRule("global", roomId);
      return rule?.actions.includes(PushRuleActionName.DontNotify) === true ? "mute" : "default";
    } catch {
      // Push rules are unavailable before the first sync.
      return "default";
    }
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
    const spaces = spaceParents(client);
    const rooms: RoomRecord[] = [];
    const live = new Set<string>();
    for (const room of client.getRooms()) {
      if (this.leftRooms.has(room.roomId)) continue;
      const base = projectRoom(
        room,
        own,
        direct,
        this.notificationFor(room.roomId),
        this.directoryPublished.get(room.roomId) ?? false,
      );
      if (base === null) continue;
      live.add(room.roomId);
      const marker = await account.readMarker(room.roomId);
      const latest = await account.readLatest(room.roomId, WINDOW_LIMIT);
      const queued = this.outbox === null ? [] : await this.outbox.rows(room.roomId);
      const projected = projectRoomState(base, latest, queued, marker, own);
      const unread = readState(await account.readEventsAfter(room.roomId, marker?.ts ?? 0), marker, own);
      const summaryRoom = {
        ...projected,
        spaceId: spaces.get(room.roomId) ?? projected.spaceId,
        unread: unread.unread,
        highlight: unread.highlight,
      };
      const record = { room: summaryRoom, lastOpened: lastOpened.get(room.roomId) ?? 0 };
      await account.writeRoom(record);
      rooms.push(record);
    }
    for (const record of records) {
      if (!live.has(record.room.roomId)) await account.deleteRoom(record.room.roomId);
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
    const byEvent = row.eventId === null ? null : await account.readEvent(row.roomId, row.eventId);
    const existing =
      byEvent ??
      (await account.readLatest(row.roomId, WINDOW_LIMIT)).find(
        (entry) => row.transactionId !== null && entry.transactionId === row.transactionId,
      );
    const stored = existing === undefined || existing === null ? row : { ...row, id: existing.id };
    await account.writeEvent(stored);
    return [stored];
  }

  /**
   * A reaction, edit or redaction changes a row that is already in the projection. The row is
   * re-projected from the SDK aggregation and emitted as a patch; no second message store exists.
   */
  private async refreshRelatedTarget(room: Room, event: MatrixEvent): Promise<void> {
    const type = event.getType();
    const relation = event.getRelation();
    let targetId: string | undefined;
    if (
      relation !== null &&
      (relation.rel_type === RelationType.Annotation || relation.rel_type === RelationType.Replace)
    ) {
      targetId = relation.event_id;
    } else if (type === EventType.Reaction || type === EventType.RoomRedaction) {
      targetId = event.getAssociatedId();
    }
    if (targetId === undefined) return;
    await this.refreshEvent(room, targetId);
  }

  private async refreshEvent(room: Room, eventId: string): Promise<void> {
    const event = room.findEventById(eventId);
    if (event === undefined) return;
    const relation = event.getRelation();
    const parentId =
      relation !== null &&
      (relation.rel_type === RelationType.Annotation || relation.rel_type === RelationType.Replace) &&
      relation.event_id !== undefined
        ? relation.event_id
        : null;
    const target = parentId === null ? event : room.findEventById(parentId);
    if (target === undefined) return;
    const own = this.client?.getUserId() ?? "";
    const row = projectMessage(room, target, own);
    if (row === null) return;
    const account = this.requireAccount();
    await this.recordProjectedSource(room, target);
    const existing = row.eventId === null ? null : await account.readEvent(room.roomId, row.eventId);
    const stored = existing === null ? row : { ...row, id: existing.id };
    await account.writeEvent(stored);
    if (this.activeRoomId === room.roomId) {
      const window = await this.windowState(room.roomId);
      this.emit({
        type: "window",
        payload: {
          roomId: room.roomId,
          messages: [stored],
          hasOlder: window.hasOlder,
          older: false,
          patch: true,
        },
      });
    }
  }

  private async handleTimeline(event: MatrixEvent, room: Room, toStartOfTimeline: boolean): Promise<void> {
    const own = this.client?.getUserId() ?? "";
    const row = projectMessage(room, event, own);
    if (row === null) {
      await this.refreshRelatedTarget(room, event);
      this.scheduleRooms();
      return;
    }
    const stored = await this.persistEvent(row);
    await this.recordProjectedSource(room, event);
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
    if (row === null) {
      await this.refreshRelatedTarget(room, event);
      this.scheduleRooms();
      return;
    }
    const stored = await this.persistEvent(row);
    await this.recordProjectedSource(room, event);
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
    this.scheduleRooms();
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
    const cryptoEvents: LiteralEmitter = client;
    cryptoEvents.on("crypto.devicesUpdated", (users: string[]) => {
      const stored = this.stored;
      if (stored === null || !users.includes(stored.userId)) return;
      void this.refreshKeys().catch(() => undefined);
    });
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
        void this.devices().catch(() => undefined);
        this.refreshBackup();
        this.emitInvites();
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
    client.on(RoomEvent.MyMembership, (room: Room) => {
      if (room.getMyMembership() === "join") {
        this.leftRooms.delete(room.roomId);
      } else {
        this.leftRooms.add(room.roomId);
        void this.account?.deleteRoom(room.roomId).catch(() => undefined);
      }
      this.scheduleRooms();
      this.emitInvites();
    });
    client.on(RoomEvent.Redaction, (event: MatrixEvent, room: Room) => {
      const targetId = event.getAssociatedId();
      if (targetId === undefined) return;
      void this.refreshEvent(room, targetId).then(() => this.scheduleRooms());
    });
    client.on(MatrixEventEvent.Replaced, (event: MatrixEvent) => {
      const roomId = event.getRoomId();
      const room = roomId === undefined ? null : this.client?.getRoom(roomId);
      const eventId = event.getId();
      if (room === null || room === undefined || eventId === undefined) return;
      void this.refreshEvent(room, eventId).then(() => this.scheduleRooms());
    });
    client.on(RoomMemberEvent.Typing, (_event: MatrixEvent, member: RoomMember) => {
      this.emitTyping(member.roomId);
    });
    client.on(RoomStateEvent.Events, () => this.scheduleRooms());
  }

  private emitTyping(roomId: string): void {
    const client = this.client;
    if (client === null) return;
    const room = client.getRoom(roomId);
    if (room === null) return;
    const own = client.getUserId();
    const userIds = room.currentState
      .getMembers()
      .filter((member) => member.typing && member.userId !== own)
      .map((member) => member.userId)
      .toSorted();
    this.emit({ type: "typing", payload: { roomId, userIds } });
  }

  private async beginSession(
    baseUrl: string,
    response: {
      readonly user_id: string;
      readonly device_id?: string;
      readonly access_token?: string;
      readonly refresh_token?: string;
    },
    startClient = true,
  ): Promise<SessionSummary> {
    if (response.device_id === undefined || response.access_token === undefined) {
      throw new WorkerFailure("auth");
    }
    if (this.client !== null) throw new WorkerFailure("unavailable");
    const stored: StoredSession = {
      baseUrl,
      userId: response.user_id,
      deviceId: response.device_id,
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? null,
    };
    await this.acquireLock(stored.userId);
    try {
      await writeSession(stored);
    } catch (error) {
      this.releaseLock?.();
      this.releaseLock = null;
      this.lockUserId = null;
      throw error;
    }
    this.stored = stored;
    const account = await AccountDatabase.open(stored.userId);
    this.account = account;
    this.outbox = this.createOutbox(account);
    this.openMedia(account);
    if (!startClient) return summary(null, stored);
    return this.startClient(stored, this.generation);
  }

  private ensureGeneration(generation: number): void {
    if (generation !== this.generation) throw new WorkerFailure("unavailable");
  }

  private async startClient(stored: StoredSession, generation: number): Promise<SessionSummary> {
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
        cacheSecretStorageKey: (keyId, _keyInfo, privateKey) => {
          this.secretStorageKeys.set(keyId, privateKey);
        },
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
    this.ensureGeneration(generation);
    await initAsync(wasmUrl);
    this.ensureGeneration(generation);
    await client.initRustCrypto({ cryptoDatabasePrefix: this.cryptoPrefix });
    this.ensureGeneration(generation);
    this.sas?.dispose();
    this.sas = new SasSessions({
      crypto: () => client.getCrypto(),
      ownUserId: stored.userId,
      events: sasEvents(client),
      emit: (state) => this.emit({ type: "sas", payload: state }),
      settled: () => {
        void this.refreshKeys().catch(() => undefined);
      },
      failure: (error) => this.transportFailure(error),
    });
    this.sas.adoptInProgress();
    this.keyReady = await this.refreshGate();
    this.ensureGeneration(generation);
    await client.startClient({
      initialSyncLimit: 20,
      lazyLoadMembers: true,
      pendingEventOrdering: PendingEventOrdering.Detached,
      threadSupport: false,
    });
    this.ensureGeneration(generation);
    const session = summary(client, stored);
    this.emit({ type: "session", payload: session });
    this.emit({ type: "keys", payload: this.keyReady });
    this.emit({ type: "connection", payload: "connecting" });
    void this.devices().catch(() => undefined);
    this.refreshBackup();
    this.emitInvites();
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
    this.generation += 1;
    this.startTask = null;
    const client = this.client;
    this.sas?.dispose();
    this.sas = null;
    this.client = null;
    this.stored = null;
    this.outbox = null;
    this.mediaResolver?.dispose();
    this.mediaResolver = null;
    this.uploadLimit = null;
    this.keyReady = "missing";
    this.releaseLock?.();
    this.releaseLock = null;
    this.lockUserId = null;
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
    this.generation += 1;
    this.startTask = null;
    const prefix = this.cryptoPrefix;
    const account = this.account;
    this.sas?.dispose();
    this.sas = null;
    this.releaseLock?.();
    this.releaseLock = null;
    this.lockUserId = null;
    this.client = null;
    this.cryptoPrefix = null;
    this.account = null;
    this.outbox = null;
    this.mediaResolver?.dispose();
    this.mediaResolver = null;
    this.uploadLimit = null;
    this.activeRoomId = null;
    this.stored = null;
    this.keyReady = "unknown";
    this.pendingSecret = null;
    this.secretStorageKeys.clear();
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
