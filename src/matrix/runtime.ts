import {
  ClientEvent,
  Direction,
  EventType,
  MatrixEvent,
  MatrixEventEvent,
  Preset,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  Visibility,
  type ICreateRoomOpts,
  type ICreateRoomStateEvent,
  type MatrixClient,
  type Room,
  type RoomMember,
} from "matrix-js-sdk";
import type { CryptoCallbacks } from "matrix-js-sdk/lib/crypto-api";
import {
  ACCOUNT_DB_VERSION,
  ACCOUNT_STORES,
  STORE,
  accountHash,
  accountDb,
  getAll,
  getOne,
  openDb,
  type OutboxRecord,
} from "../data";
import type {
  CommandRequest,
  DeviceListResult,
  MediaPayload,
  MediaResult,
  PaginateResult,
  ProfileResult,
  RecoveryResult,
  SessionSummary,
  SetupRecoveryResult,
  VerificationResult,
  WorkerToClient,
} from "../protocol";
import { errorInfo, readBooleanField, readNumberField, readRecord, readStringArray, readStringField } from "../protocol/guards";
import {
  createRuntimeClient,
  discoverHomeserver,
  isRecord,
  loginWithPassword,
  loginWithToken,
  normalizeServer,
  readSession,
  removeSession,
  writeSession,
} from "./session";
import type { SessionRecord } from "../data/records";
import {
  applyRelationToEvent,
  Projection,
  relationFromEvent,
} from "./projection";
import {
  accountData,
  directRoomIds,
  normalizeEvent,
  normalizeMember,
  normalizeRoom,
} from "./normalize";
import { collectPacks, globalContentForPack } from "./packs";
import { attachmentForSend, fetchMedia } from "./media";
import { Uia } from "./uia";
import { Recovery } from "./recovery";
import { Verification } from "./verification";
import { OutboxSender } from "./outbox";

export class Runtime {
  private client: MatrixClient | null = null;
  private projection: Projection | null = null;
  private recovery: Recovery | null = null;
  private verification: Verification | null = null;
  private readonly uia: Uia;
  private readonly outbox: OutboxSender;
  private session: SessionRecord | null = null;
  private hash: string | null = null;
  private initializing = false;
  private ready = false;
  private readonly keys = new Map<string, Uint8Array<ArrayBuffer>>();
  private readonly readyWaiters: { resolve: () => void; reject: (error: Error) => void }[] = [];
  private starting = false;

  private readonly post: (event: WorkerToClient) => void;

  constructor(post: (event: WorkerToClient) => void) {
    this.post = post;
    this.uia = new Uia(post, () => this.client?.getSafeUserId() ?? this.session?.userId ?? "");
    this.outbox = new OutboxSender({
      post,
      readRow: (txnId) => this.readOutboxRow(txnId),
      deliver: (row) => this.deliver(row),
      maxAttempts: 8,
    });
  }

  private async retrySend(txnId: string): Promise<{ queued: true }> {
    this.outbox.cancel(txnId);
    await this.outbox.enqueue(txnId);
    return { queued: true };
  }

  async handle(command: CommandRequest): Promise<unknown> {
    if (!SESSION_COMMANDS.has(command.type)) await this.whenReady();
    switch (command.type) {
      case "start":
        return this.start(optionalString(payload(command), "accountHash"));
      case "discover":
        return discoverHomeserver(readStringField(payload(command), "server"));
      case "login":
        return this.login(command.payload);
      case "loginToken":
        return this.loginToken(command.payload);
      case "register":
        return this.register(command.payload);
      case "ssoUrl":
        return this.ssoUrl(command.payload);
      case "logout":
        return this.logout();
      case "retrySync":
        return this.retrySync();
      case "setOnline":
        this.setOnline(readBooleanField(payload(command), "online"));
        return {};
      case "resumeOutbox":
        return this.resumeOutbox();
      case "paginate":
        return this.paginate(command.payload);
      case "jump":
        return this.jump(command.payload);
      case "markRead":
        return this.markRead(command.payload);
      case "typing":
        return this.typing(command.payload);
      case "send":
        return this.send(readStringField(payload(command), "txnId"));
      case "retry":
        return this.retrySend(readStringField(payload(command), "txnId"));
      case "cancelSend":
        return this.cancelSend(readStringField(payload(command), "txnId"));
      case "createRoom":
        return this.createRoom(command.payload);
      case "joinRoom":
        return this.joinRoom(command.payload);
      case "leaveRoom":
        return this.leaveRoom(command.payload);
      case "invite":
        return this.invite(command.payload);
      case "createDm":
        return this.createDm(command.payload);
      case "setRoomState":
        return this.setRoomState(command.payload);
      case "setRoomTag":
        return this.setRoomTag(command.payload);
      case "setNotificationMode":
        return this.setNotificationMode(command.payload);
      case "uploadRoomAvatar":
        return this.uploadRoomAvatar(command.payload);
      case "setPackGlobal":
        return this.setPackGlobal(command.payload);
      case "getDevices":
        return this.getDevices();
      case "deleteDevice":
        return this.deleteDevice(command.payload);
      case "deleteDevices":
        return this.deleteDevices(command.payload);
      case "verifyOwnDevice":
        return this.verifyOwnDevice();
      case "verifyDevice":
        return this.verifyDevice(command.payload);
      case "verifyUser":
        return this.verifyUser(command.payload);
      case "acceptVerification":
        return this.acceptVerification(command.payload);
      case "startSas":
        return this.startSas(command.payload);
      case "confirmSas":
        return this.confirmSas(command.payload);
      case "cancelVerification":
        return this.cancelVerification(command.payload);
      case "getProfile":
        return this.getProfile(command.payload);
      case "setDisplayName":
        return this.setDisplayName(command.payload);
      case "uploadAvatar":
        return this.uploadAvatar(command.payload);
      case "recoveryStatus":
        return this.recoveryStatus();
      case "setupRecovery":
        return this.setupRecovery(command.payload);
      case "unlockRecovery":
        return this.unlockRecovery(command.payload);
      case "resetRecovery":
        return this.resetRecovery();
      case "restoreBackup":
        return this.restoreBackup();
      case "createBackup":
        return this.createBackup();
      case "media":
        return this.media(command.payload);
      default:
        throw new Error(`Unsupported command: ${command.type}`);
    }
  }

  async start(hashValue?: string): Promise<{ started: true }> {
    const session = hashValue ? await readSession(hashValue) : null;
    if (!hashValue || !session) {
      this.post({ type: "ready", session: null, revision: 0, syncState: "STOPPED" });
      this.settleReady(null);
      return { started: true };
    }
    this.starting = true;
    try {
      await this.setup(session, hashValue);
    } catch (error) {
      this.settleReady(asError(error));
      throw error;
    } finally {
      this.starting = false;
    }
    return { started: true };
  }

  // A reload renders the shell before the worker finishes starting, so a command
  // issued in that window waits for the client instead of failing on an empty one.
  private whenReady(): Promise<void> {
    if (this.ready || !this.starting) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject });
    });
  }

  private settleReady(error: Error | null): void {
    for (const waiter of this.readyWaiters.splice(0)) {
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
  }

  private async setup(session: SessionRecord, hash: string): Promise<void> {
    this.session = session;
    this.hash = hash;
    this.keys.clear();
    this.initializing = true;
    this.ready = false;
    this.projection = new Projection(hash, session.userId);
    await this.projection.open();
    const callbacks: CryptoCallbacks = {
      getSecretStorageKey: async ({ keys }) => {
        if (!this.client) return null;
        const keyId = await this.client.secretStorage.getDefaultKeyId();
        if (!keyId || !(keyId in keys)) return null;
        const key = this.keys.get(keyId);
        return key ? [keyId, key] : null;
      },
      cacheSecretStorageKey: (keyId, _info, key) => {
        this.keys.set(keyId, key);
      },
    };
    const runtime = await createRuntimeClient(session, hash, callbacks);
    this.client = runtime.client;
    this.recovery = new Recovery(this.client, this.keys, this.uia, hash);
    this.verification = new Verification(
      this.client,
      this.post,
      () => {
        void this.postRecoveryStatus();
      },
    );
    this.attachListeners();
    await this.client.startClient({
      initialSyncLimit: 30,
      lazyLoadMembers: true,
    });
    await this.projectAll();
    this.initializing = false;
    this.ready = true;
    this.settleReady(null);
    void this.resumeOutbox();
    this.post({
      type: "ready",
      session: this.sessionSummary(),
      revision: this.projection.currentRevision,
      syncState: this.client.getSyncState() ?? "PREPARED",
    });
  }

  private attachListeners(): void {
    const client = this.requireClient();
    client.on(ClientEvent.Sync, (state) => {
      this.post({ type: "sync", state });
      if (state === "PREPARED" && this.ready && !this.initializing) {
        void this.projectAll().catch((error: unknown) => this.logError(error));
      }
    });
    client.on(RoomEvent.Timeline, (event, room, toStartOfTimeline, removed) => {
      if (!room || this.initializing || !this.ready || removed || toStartOfTimeline) return;
      void this.onTimeline(event, room).catch((error: unknown) => this.logError(error));
    });
    client.on(RoomEvent.TimelineReset, () => {
      if (!this.initializing && this.ready) void this.projectAll().catch((error: unknown) => this.logError(error));
    });
    client.on(RoomEvent.Name, (room) => void this.refreshRoom(room).catch((error: unknown) => this.logError(error)));
    client.on(RoomEvent.Tags, (_event, room) => void this.refreshRoom(room).catch((error: unknown) => this.logError(error)));
    client.on(RoomEvent.MyMembership, (room) => void this.refreshRoom(room).catch((error: unknown) => this.logError(error)));
    client.on(RoomStateEvent.Events, (event) => {
      if (!this.ready) return;
      const roomId = event.getRoomId();
      const room = roomId ? client.getRoom(roomId) : null;
      if (!room) return;
      const type = event.getType();
      if (type === "m.room.image_pack" || type === "im.ponies.room_emotes") {
        void this.refreshPacks().catch((error: unknown) => this.logError(error));
      }
      void this.refreshRoom(room).catch((error: unknown) => this.logError(error));
    });
    client.on(RoomMemberEvent.Membership, (_event, member: RoomMember) => {
      if (!this.ready) return;
      const room = client.getRoom(member.roomId);
      if (!room) return;
      void this.onMember(room, member).catch((error: unknown) => this.logError(error));
    });
    client.on(RoomMemberEvent.Typing, (_event, member: RoomMember) => {
      const room = client.getRoom(member.roomId);
      if (!room) return;
      this.post({
        type: "typing",
        roomId: room.roomId,
        userIds: room.getJoinedMembers().filter((candidate) => candidate.typing).map((candidate) => candidate.userId),
      });
    });
    client.on(MatrixEventEvent.Decrypted, (event) => {
      if (!this.ready) return;
      void this.onDecrypted(event).catch((error: unknown) => this.logError(error));
    });
    client.on(ClientEvent.AccountData, () => {
      if (!this.ready) return;
      void this.refreshPacks().catch((error: unknown) => this.logError(error));
      void this.refreshRooms().catch((error: unknown) => this.logError(error));
    });
    client.on(RoomEvent.AccountData, () => {
      if (!this.ready) return;
      void this.refreshPacks().catch((error: unknown) => this.logError(error));
    });
  }

  private async projectAll(): Promise<void> {
    const client = this.requireClient();
    const projection = this.requireProjection();
    const direct = directRoomIds(client);
    const rooms = client.getRooms();
    const chatRooms = rooms.filter((room) => !room.isSpaceRoom());
    const roomRecords = rooms.map((room) => normalizeRoom(room, client.getSafeUserId(), direct, client));
    const members = chatRooms.flatMap((room) =>
      room.currentState.getMembers().map((member) => normalizeMember(member, room.roomId)),
    );
    const { events, relations } = initialEvents(chatRooms, client.getSafeUserId());
    const packs = collectPacks(client, chatRooms);
    await projection.replace(roomRecords, events, members, packs);
    if (relations.length > 0) await projection.putRelations(relations);
    this.post({ type: "reload", revision: projection.currentRevision });
  }

  private async onTimeline(event: MatrixEvent, room: Room): Promise<void> {
    const client = this.requireClient();
    const projection = this.requireProjection();
    const relation = relationFromEvent(event, client.getSafeUserId());
    if (relation) {
      const target = await projection.getEvent(relation.targetEventId);
      const updated = await projection.applyRelation(relation, target ?? null);
      if (!updated) return;
      const roomRecord = normalizeRoom(room, client.getSafeUserId(), directRoomIds(client), client);
      await projection.putRooms([roomRecord]);
      await projection.bumpRevision();
      this.post({
        type: "delta",
        delta: await projection.delta([roomRecord], [updated], [], [], [], [], "SYNCING"),
      });
      return;
    }
    const normalized = normalizeEvent(event, room);
    if (!normalized) return;
    await projection.putEvents([normalized]);
    const roomRecord = normalizeRoom(room, client.getSafeUserId(), directRoomIds(client), client);
    await projection.putRooms([roomRecord]);
    const packs = collectPacks(client, client.getRooms());
    await projection.putPacks(packs);
    await projection.bumpRevision();
    this.post({
      type: "delta",
      delta: await projection.delta([roomRecord], [normalized], [], packs, [], [], "SYNCING"),
    });
  }

  private async refreshRoom(room: Room): Promise<void> {
    if (!this.ready) return;
    const client = this.requireClient();
    const projection = this.requireProjection();
    const record = normalizeRoom(room, client.getSafeUserId(), directRoomIds(client), client);
    await projection.putRooms([record]);
    await projection.bumpRevision();
    this.post({
      type: "delta",
      delta: await projection.delta([record], [], [], [], [], [], "SYNCING"),
    });
  }

  private async refreshRooms(): Promise<void> {
    if (!this.ready) return;
    const client = this.requireClient();
    const projection = this.requireProjection();
    const direct = directRoomIds(client);
    const records = client.getRooms().map((room) => normalizeRoom(room, client.getSafeUserId(), direct, client));
    await projection.putRooms(records);
    await projection.bumpRevision();
    this.post({
      type: "delta",
      delta: await projection.delta(records, [], [], [], [], [], "SYNCING"),
    });
  }

  private async onMember(room: Room, member: RoomMember): Promise<void> {
    const client = this.requireClient();
    const projection = this.requireProjection();
    const memberRecord = normalizeMember(member, room.roomId);
    const roomRecord = normalizeRoom(room, client.getSafeUserId(), directRoomIds(client), client);
    await projection.putMembers([memberRecord]);
    await projection.putRooms([roomRecord]);
    await projection.bumpRevision();
    this.post({
      type: "delta",
      delta: await projection.delta([roomRecord], [], [memberRecord], [], [], [], "SYNCING"),
    });
  }

  private async onDecrypted(event: MatrixEvent): Promise<void> {
    const room = event.getRoomId() ? this.requireClient().getRoom(event.getRoomId() ?? "") : null;
    if (!room) return;
    const normalized = normalizeEvent(event, room);
    if (!normalized) return;
    const projection = this.requireProjection();
    await projection.putEvents([normalized]);
    const roomRecord = normalizeRoom(room, this.requireClient().getSafeUserId(), directRoomIds(this.requireClient()), this.requireClient());
    await projection.putRooms([roomRecord]);
    await projection.bumpRevision();
    this.post({ type: "delta", delta: await projection.delta([roomRecord], [normalized], [], [], [], [], "SYNCING") });
  }

  private async redecryptAll(): Promise<void> {
    const client = this.requireClient();
    for (const room of client.getRooms()) {
      for (const event of room.getLiveTimeline().getEvents()) {
        if (event.getType() !== EventType.RoomMessageEncrypted) continue;
        try {
          await client.decryptEventIfNeeded(event);
        } catch {
          // Decryption failure is represented in the projection.
        }
      }
    }
  }

  private async refreshPacks(): Promise<void> {
    if (!this.ready) return;
    const client = this.requireClient();
    const projection = this.requireProjection();
    const packs = collectPacks(client, client.getRooms());
    await projection.putPacks(packs);
    await projection.bumpRevision();
    this.post({
      type: "delta",
      delta: await projection.delta([], [], [], packs, [], [], "SYNCING"),
    });
  }

  private async paginate(payloadValue: unknown): Promise<PaginateResult> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const roomId = readStringField(payloadRecord, "roomId");
    const limit = readNumberField(payloadRecord, "limit");
    const room = this.requireClient().getRoom(roomId);
    if (!room) throw new Error("Room not found");
    const timeline = room.getLiveTimeline();
    const before = timeline.getEvents().length;
    await this.requireClient().paginateEventTimeline(timeline, { backwards: true, limit });
    const after = timeline.getEvents().length;
    await this.projectAll();
    return {
      added: Math.max(0, after - before),
      reachedStart: timeline.getPaginationToken(Direction.Backward) === null,
    };
  }

  private async jump(payloadValue: unknown): Promise<{ found: boolean }> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const roomId = readStringField(payloadRecord, "roomId");
    const eventId = readStringField(payloadRecord, "eventId");
    const room = this.requireClient().getRoom(roomId);
    return { found: Boolean(room?.findEventById(eventId)) };
  }

  private async markRead(payloadValue: unknown): Promise<Record<string, never>> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const roomId = readStringField(payloadRecord, "roomId");
    const eventId = readStringField(payloadRecord, "eventId");
    const client = this.requireClient();
    const room = client.getRoom(roomId);
    const event = room?.findEventById(eventId);
    if (room && event) {
      await client.setRoomReadMarkers(roomId, eventId, event);
      await this.refreshRoom(room);
    }
    return {};
  }

  private async typing(payloadValue: unknown): Promise<Record<string, never>> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const roomId = readStringField(payloadRecord, "roomId");
    const typing = readBooleanField(payloadRecord, "typing");
    await this.requireClient().sendTyping(roomId, typing, 10000);
    return {};
  }

  private cancelSend(txnId: string): { cancelled: boolean } {
    return { cancelled: this.outbox.cancel(txnId) };
  }

  private async send(txnId: string): Promise<{ queued: true }> {
    await this.outbox.enqueue(txnId);
    return { queued: true };
  }

  private async deliver(row: OutboxRecord): Promise<string> {
    const client = this.requireClient();
    const room = client.getRoom(row.roomId);
    let content = row.content;
    if (row.blob && row.media) {
      const attachment = await attachmentForSend(client, row, room?.hasEncryptionStateEvent() ?? false);
      content = { ...content, ...attachment };
    }
    if (row.eventType === "m.room.redaction") {
      const reason = optionalString(content, "reason");
      const response = await client.redactEvent(
        row.roomId,
        readStringField(content, "redacts"),
        row.txnId,
        reason ? { reason } : {},
      );
      return response.event_id;
    }
    const response = await client.sendEvent(row.roomId, row.eventType as never, content as never, row.txnId);
    return response.event_id;
  }

  private async readOutboxRow(txnId: string): Promise<OutboxRecord | null> {
    const db = await openDb(accountDb(this.requireHash()), ACCOUNT_DB_VERSION, ACCOUNT_STORES);
    try {
      return (await getOne<OutboxRecord>(db, STORE.outbox, txnId)) ?? null;
    } finally {
      db.close();
    }
  }

  private async createRoom(payloadValue: unknown): Promise<{ roomId: string }> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const initialContent: ICreateRoomStateEvent[] = readBooleanField(payloadRecord, "encrypted")
      ? [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }]
      : [];
    const visibility = readStringField(payloadRecord, "visibility") === "public" ? Visibility.Public : Visibility.Private;
    const options: ICreateRoomOpts = {
      visibility,
      preset: visibility === Visibility.Public ? Preset.PublicChat : Preset.PrivateChat,
      invite: readStringArray(payloadRecord["invite"], "invite"),
      initial_state: initialContent,
    };
    const name = readStringField(payloadRecord, "name");
    const topic = readStringField(payloadRecord, "topic");
    if (name) options.name = name;
    if (topic) options.topic = topic;
    const result = await this.requireClient().createRoom(options);
    await this.projectAll();
    return { roomId: result.room_id };
  }

  private async joinRoom(payloadValue: unknown): Promise<{ roomId: string }> {
    const roomIdOrAlias = readStringField(readRecord(payloadValue, "payload"), "roomIdOrAlias");
    const room = await this.requireClient().joinRoom(roomIdOrAlias);
    await this.projectAll();
    return { roomId: room.roomId };
  }

  private async leaveRoom(payloadValue: unknown): Promise<Record<string, never>> {
    const roomId = readStringField(readRecord(payloadValue, "payload"), "roomId");
    await this.requireClient().leave(roomId);
    await this.projectAll();
    return {};
  }

  private async invite(payloadValue: unknown): Promise<Record<string, never>> {
    const payloadRecord = readRecord(payloadValue, "payload");
    await this.requireClient().invite(readStringField(payloadRecord, "roomId"), readStringField(payloadRecord, "userId"));
    return {};
  }

  private async createDm(payloadValue: unknown): Promise<{ roomId: string }> {
    const userId = readStringField(readRecord(payloadValue, "payload"), "userId");
    const client = this.requireClient();
    const direct = accountData(client, "m.direct");
    if (direct) {
      const content = direct.getContent();
      if (isRecord(content)) {
        const rooms = content[userId];
        if (Array.isArray(rooms)) {
          for (const roomId of rooms) {
            if (typeof roomId === "string" && client.getRoom(roomId)?.getMyMembership() === "join") return { roomId };
          }
        }
      }
    }
    const result = await client.createRoom({
      is_direct: true,
      invite: [userId],
      preset: Preset.TrustedPrivateChat,
      initial_state: [
        { type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } },
      ] as never,
    });
    await this.projectAll();
    return { roomId: result.room_id };
  }

  private async setRoomState(payloadValue: unknown): Promise<Record<string, never>> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const content = readRecord(payloadRecord, "content");
    await this.requireClient().sendStateEvent(
      readStringField(payloadRecord, "roomId"),
      readStringField(payloadRecord, "eventType") as never,
      content as never,
      optionalString(payloadRecord, "stateKey") ?? "",
    );
    return {};
  }

  private async setRoomTag(payloadValue: unknown): Promise<Record<string, never>> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const roomId = readStringField(payloadRecord, "roomId");
    const tag = readStringField(payloadRecord, "tag");
    const value = payloadRecord["value"];
    if (value === null) await this.requireClient().deleteRoomTag(roomId, tag);
    else await this.requireClient().setRoomTag(roomId, tag, isRecord(value) ? value : {});
    const room = this.requireClient().getRoom(roomId);
    if (room) await this.refreshRoom(room);
    return {};
  }

  private async setNotificationMode(payloadValue: unknown): Promise<Record<string, never>> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const roomId = readStringField(payloadRecord, "roomId");
    const mode = readStringField(payloadRecord, "mode");
    if (mode !== "mute" && mode !== "unmute") throw new Error("Unsupported notification mode");
    await this.requireClient().setRoomMutePushRule("global", roomId, mode === "mute");
    const room = this.requireClient().getRoom(roomId);
    if (room) await this.refreshRoom(room);
    return {};
  }

  private async uploadRoomAvatar(payloadValue: unknown): Promise<Record<string, never>> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const roomId = readStringField(payloadRecord, "roomId");
    const buffer = payloadRecord["buffer"];
    const mime = readStringField(payloadRecord, "mime");
    if (!(buffer instanceof ArrayBuffer)) throw new Error("Invalid avatar data");
    const uploaded = await this.requireClient().uploadContent(new Blob([buffer], { type: mime }), {
      name: "avatar",
      type: mime,
    });
    if (!uploaded.content_uri) throw new Error("Avatar upload failed");
    await this.requireClient().sendStateEvent(
      roomId,
      "m.room.avatar" as never,
      { url: uploaded.content_uri } as never,
      "",
    );
    return {};
  }

  private async setPackGlobal(payloadValue: unknown): Promise<Record<string, never>> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const packId = readStringField(payloadRecord, "packId");
    const enabled = readBooleanField(payloadRecord, "enabled");
    const client = this.requireClient();
    const packs = collectPacks(client, client.getRooms());
    const pack = packs.find((candidate) => candidate.packId === packId);
    if (!pack) throw new Error("Pack not found");
    const stable = accountData(client, "m.image_pack.rooms")?.getContent() ?? {};
    const legacy = accountData(client, "im.ponies.emote_rooms")?.getContent() ?? {};
    await client.setAccountData("m.image_pack.rooms" as never, globalContentForPack(stable, pack, enabled) as never);
    await client.setAccountData("im.ponies.emote_rooms" as never, globalContentForPack(legacy, pack, enabled) as never);
    await this.refreshPacks();
    return {};
  }

  private async getDevices(): Promise<DeviceListResult> {
    const client = this.requireClient();
    const crypto = client.getCrypto();
    if (!crypto) throw new Error("Crypto is not initialized");
    const result = await client.getDevices();
    const current = client.getDeviceId();
    const devices = await Promise.all(
      result.devices.map(async (device) => {
        const status = await crypto.getDeviceVerificationStatus(client.getSafeUserId(), device.device_id);
        return {
          deviceId: device.device_id,
          displayName: device.display_name ?? "",
          lastSeenIp: device.last_seen_ip ?? null,
          lastSeenTs: device.last_seen_ts ?? null,
          verified: status?.isVerified() ?? false,
          current: device.device_id === current,
        };
      }),
    );
    return { devices };
  }

  private async deleteDevice(payloadValue: unknown): Promise<Record<string, never>> {
    const deviceId = readStringField(readRecord(payloadValue, "payload"), "deviceId");
    await this.requireUia().run(async (auth) => {
      await this.requireClient().deleteDevice(deviceId, auth as never);
    });
    return {};
  }

  private async deleteDevices(payloadValue: unknown): Promise<Record<string, never>> {
    const deviceIds = readStringArray(readRecord(payloadValue, "payload")["deviceIds"], "deviceIds");
    await this.requireUia().run(async (auth) => {
      await this.requireClient().deleteMultipleDevices(deviceIds, auth as never);
    });
    return {};
  }

  private async verifyOwnDevice(): Promise<VerificationResult> {
    const requestId = await this.requireVerification().requestOwn();
    return { requestId };
  }

  private async verifyDevice(payloadValue: unknown): Promise<VerificationResult> {
    const deviceId = readStringField(readRecord(payloadValue, "payload"), "deviceId");
    return { requestId: await this.requireVerification().requestDevice(deviceId) };
  }

  private async verifyUser(payloadValue: unknown): Promise<VerificationResult> {
    const userId = readStringField(readRecord(payloadValue, "payload"), "userId");
    const client = this.requireClient();
    const room = client.getRooms().find(
      (candidate) => candidate.getMyMembership() === "join" && candidate.getMember(userId),
    );
    if (!room) throw new Error("Open a direct room with this user first");
    return { requestId: await this.requireVerification().requestUser(userId, room.roomId) };
  }

  private async acceptVerification(payloadValue: unknown): Promise<Record<string, never>> {
    await this.requireVerification().accept(readStringField(readRecord(payloadValue, "payload"), "requestId"));
    return {};
  }

  private async startSas(payloadValue: unknown): Promise<Record<string, never>> {
    await this.requireVerification().startSas(readStringField(readRecord(payloadValue, "payload"), "requestId"));
    return {};
  }

  private async confirmSas(payloadValue: unknown): Promise<Record<string, never>> {
    await this.requireVerification().confirm(readStringField(readRecord(payloadValue, "payload"), "requestId"));
    return {};
  }

  private async cancelVerification(payloadValue: unknown): Promise<Record<string, never>> {
    await this.requireVerification().cancel(readStringField(readRecord(payloadValue, "payload"), "requestId"));
    return {};
  }

  private async getProfile(payloadValue: unknown): Promise<ProfileResult> {
    const userId = readStringField(readRecord(payloadValue, "payload"), "userId");
    const client = this.requireClient();
    const info = await client.getProfileInfo(userId);
    const crypto = client.getCrypto();
    const verification = crypto ? await crypto.getUserVerificationStatus(userId) : null;
    return {
      profile: {
        userId,
        displayName: info.displayname ?? userId,
        avatarMxc: info.avatar_url ?? null,
        verified: verification?.isVerified() ?? false,
        identityChanged: verification?.needsUserApproval ?? false,
      },
    };
  }

  private async setDisplayName(payloadValue: unknown): Promise<Record<string, never>> {
    const displayName = readStringField(readRecord(payloadValue, "payload"), "displayName");
    await this.requireClient().setDisplayName(displayName);
    return {};
  }

  private async uploadAvatar(payloadValue: unknown): Promise<{ avatarMxc: string }> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const buffer = payloadRecord["buffer"];
    const mime = readStringField(payloadRecord, "mime");
    if (!(buffer instanceof ArrayBuffer)) throw new Error("Invalid avatar data");
    const uploaded = await this.requireClient().uploadContent(new Blob([buffer], { type: mime }), {
      name: "avatar",
      type: mime,
    });
    if (!uploaded.content_uri) throw new Error("Avatar upload failed");
    await this.requireClient().setAvatarUrl(uploaded.content_uri);
    return { avatarMxc: uploaded.content_uri };
  }

  private async recoveryStatus(): Promise<RecoveryResult> {
    return { status: await this.requireRecovery().status() };
  }

  private async setupRecovery(payloadValue: unknown): Promise<SetupRecoveryResult> {
    const passphrase = optionalString(readRecord(payloadValue, "payload"), "passphrase");
    return this.requireRecovery().setup(passphrase);
  }

  private async unlockRecovery(payloadValue: unknown): Promise<RecoveryResult> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const status = await this.requireRecovery().unlock(
      optionalString(payloadRecord, "recoveryKey"),
      optionalString(payloadRecord, "passphrase"),
    );
    await this.redecryptAll();
    await this.projectAll();
    return { status };
  }

  private async resetRecovery(): Promise<SetupRecoveryResult> {
    return this.requireRecovery().reset();
  }

  private async restoreBackup(): Promise<Record<string, never>> {
    await this.requireRecovery().restoreBackup();
    await this.redecryptAll();
    await this.projectAll();
    return {};
  }

  private async createBackup(): Promise<Record<string, never>> {
    await this.requireRecovery().createBackup();
    return {};
  }

  private async media(payloadValue: unknown): Promise<MediaResult> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const request: MediaPayload = {
      mediaKey: readStringField(payloadRecord, "mediaKey"),
      mxc: readStringField(payloadRecord, "mxc"),
      width: readNumberField(payloadRecord, "width"),
      height: readNumberField(payloadRecord, "height"),
      method: readStringField(payloadRecord, "method"),
      ...(isEncryptedFile(payloadRecord["file"]) ? { file: payloadRecord["file"] } : {}),
    };
    return fetchMedia(this.requireClient(), this.requireProjection(), request);
  }

  private async login(payloadValue: unknown): Promise<{ session: SessionSummary }> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const result = await loginWithPassword(
      readStringField(payloadRecord, "baseUrl"),
      readStringField(payloadRecord, "identifier"),
      readStringField(payloadRecord, "password"),
    );
    await this.setup(result.session, result.hash);
    return { session: this.sessionSummary() };
  }

  private async loginToken(payloadValue: unknown): Promise<{ session: SessionSummary }> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const result = await loginWithToken(
      readStringField(payloadRecord, "baseUrl"),
      readStringField(payloadRecord, "token"),
      optionalString(payloadRecord, "deviceId"),
    );
    await this.setup(result.session, result.hash);
    return { session: this.sessionSummary() };
  }

  private async register(payloadValue: unknown): Promise<{ session: SessionSummary }> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const baseUrl = normalizeServer(readStringField(payloadRecord, "baseUrl"));
    const username = readStringField(payloadRecord, "username");
    const password = readStringField(payloadRecord, "password");
    const temp = (await import("matrix-js-sdk")).createClient({ baseUrl });
    const response = await this.requireUia().run(async (auth) => {
      return temp.registerRequest({
        username,
        password,
        ...(auth ? { auth } : {}),
      });
    });
    const userId = response.user_id;
    const accessToken = response.access_token;
    const deviceId = response.device_id;
    if (!userId || !accessToken || !deviceId) throw new Error("Registration did not return a session");
    const hash = await accountHash(userId);
    const session: SessionRecord = {
      id: "session",
      userId,
      deviceId,
      accessToken,
      refreshToken: response.refresh_token ?? null,
      baseUrl,
    };
    await writeSession(hash, session);
    await this.setup(session, hash);
    return { session: this.sessionSummary() };
  }

  private async ssoUrl(payloadValue: unknown): Promise<{ url: string }> {
    const payloadRecord = readRecord(payloadValue, "payload");
    const baseUrl = normalizeServer(readStringField(payloadRecord, "baseUrl"));
    const redirectUrl = readStringField(payloadRecord, "redirectUrl");
    const loginType = payloadRecord["loginType"] === "cas" ? "cas" : "sso";
    const idpId = optionalString(payloadRecord, "idpId");
    const temp = (await import("matrix-js-sdk")).createClient({ baseUrl });
    return { url: temp.getSsoLoginUrl(redirectUrl, loginType, idpId) };
  }

  private async logout(): Promise<Record<string, never>> {
    const client = this.client;
    const hash = this.hash;
    this.ready = false;
    if (client) {
      client.stopClient();
      try {
        await client.logout();
      } catch {
        // A local logout still removes the local session.
      }
    }
    this.client = null;
    this.projection = null;
    this.recovery = null;
    this.verification = null;
    this.session = null;
    this.hash = null;
    if (hash) {
      await removeSession(hash);
      await deleteAccountDatabases(hash);
    }
    this.post({ type: "ready", session: null, revision: 0, syncState: "STOPPED" });
    return {};
  }

  private async postRecoveryStatus(): Promise<void> {
    if (!this.recovery) return;
    const result = await this.recovery.status();
    this.post({ type: "sync", state: "PREPARED" });
    this.post({
      type: "progress",
      phase: "recovery",
      done: result.secretStorage ? 1 : 0,
      total: 1,
    });
  }

  private retrySync(): Promise<Record<string, never>> {
    this.requireClient().retryImmediately();
    this.outbox.retryNow();
    return Promise.resolve({});
  }

  private setOnline(online: boolean): void {
    if (!online) return;
    this.requireClient().retryImmediately();
    this.outbox.retryNow();
    void this.resumeOutbox();
  }

  // Rows written before a reload are still owed to the user.
  private async resumeOutbox(): Promise<{ queued: number }> {
    if (!this.hash) return { queued: 0 };
    const db = await openDb(accountDb(this.hash), ACCOUNT_DB_VERSION, ACCOUNT_STORES);
    let rows: OutboxRecord[] = [];
    try {
      rows = await getAll<OutboxRecord>(db, STORE.outbox);
    } finally {
      db.close();
    }
    const pending = rows.filter((row) => row.status !== "sent");
    for (const row of pending) await this.outbox.enqueue(row.txnId);
    return { queued: pending.length };
  }

  private sessionSummary(): SessionSummary {
    const client = this.requireClient();
    const session = this.requireSession();
    const user = client.getUser(session.userId);
    return {
      userId: session.userId,
      deviceId: session.deviceId,
      displayName: user?.displayName ?? session.userId,
      avatarMxc: user?.avatarUrl ?? null,
      accountHash: this.requireHash(),
    };
  }

  private logError(error: unknown): void {
    const info = errorInfo(error);
    this.post({ type: "log", level: "error", message: info.message });
  }

  private requireClient(): MatrixClient {
    if (!this.client) throw new Error("Client is not started");
    return this.client;
  }

  private requireProjection(): Projection {
    if (!this.projection) throw new Error("Projection is not started");
    return this.projection;
  }

  private requireRecovery(): Recovery {
    if (!this.recovery) throw new Error("Recovery is not started");
    return this.recovery;
  }

  private requireVerification(): Verification {
    if (!this.verification) throw new Error("Verification is not started");
    return this.verification;
  }

  answerUia(requestId: string, auth: Record<string, unknown> | null): void {
    this.uia.answer(requestId, auth);
  }

  cancelUia(requestId: string): void {
    this.uia.cancel(requestId);
  }

  private requireUia(): Uia {
    return this.uia;
  }

  private requireSession(): SessionRecord {
    if (!this.session) throw new Error("No session");
    return this.session;
  }

  private requireHash(): string {
    if (!this.hash) throw new Error("No account");
    return this.hash;
  }
}

const SESSION_COMMANDS = new Set([
  "start",
  "discover",
  "login",
  "loginToken",
  "register",
  "ssoUrl",
  "logout",
]);

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function payload(command: CommandRequest): Record<string, unknown> {
  return readRecord(command.payload, "payload");
}

function optionalString(value: Record<string, unknown>, field: string): string | undefined {
  const item = value[field];
  return typeof item === "string" && item.length > 0 ? item : undefined;
}

function initialEvents(rooms: readonly Room[], selfUserId: string): {
  events: import("../data/records").EventRecord[];
  relations: import("../data/records").RelationRecord[];
} {
  const events: import("../data/records").EventRecord[] = [];
  const pending: import("../data/records").RelationRecord[] = [];
  for (const room of rooms) {
    const byId = new Map<string, import("../data/records").EventRecord>();
    for (const event of room.getLiveTimeline().getEvents()) {
      const relation = relationFromEvent(event, selfUserId);
      if (relation) {
        const target = byId.get(relation.targetEventId);
        if (target) {
          const updated = applyRelationToEvent(target, relation, selfUserId);
          if (updated) byId.set(updated.eventId, updated);
        } else {
          pending.push(relation);
        }
        continue;
      }
      const normalized = normalizeEvent(event, room);
      if (normalized) byId.set(normalized.eventId, normalized);
    }
    events.push(...byId.values());
  }
  return { events, relations: pending };
}

function isEncryptedFile(value: unknown): value is import("../data/records").EncryptedFile {
  if (!isRecord(value)) return false;
  return (
    typeof value["url"] === "string" &&
    isRecord(value["key"]) &&
    typeof value["key"]["k"] === "string" &&
    typeof value["iv"] === "string" &&
    isRecord(value["hashes"])
  );
}

async function deleteAccountDatabases(hash: string): Promise<void> {
  const databases = await indexedDB.databases();
  const names = databases
    .map((info) => info.name)
    .filter((name): name is string => Boolean(name))
    .filter(
      (name) =>
        name === accountDb(hash) ||
        name.startsWith(`maski-sdk-${hash}`) ||
        name.startsWith(`maski-crypto-${hash}`) ||
        name.startsWith(`maski-rust-${hash}`),
    );
  for (const name of names) {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.addEventListener("success", () => resolve());
      request.addEventListener("error", () => resolve());
      request.addEventListener("blocked", () => resolve());
    });
  }
}
