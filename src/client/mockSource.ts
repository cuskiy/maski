import type { ChatSource, RoomStatePatch, SourceEvent, SourceEvents } from "./source.ts";
import { clearSourceListeners, createSourceListeners } from "./source.ts";
import type { DeviceSession, Invite, Member, MessageRow, NotificationPrefs, RoomSummary } from "../core/types.ts";
import { REVIEW_CAPABILITIES } from "../core/types.ts";
import { mockChatState, mockDevices, mockInvites, mockMembersFor, mockMessagesFor } from "../core/mock.ts";
import { messageMatches } from "../core/search.ts";
import { toggledReactions } from "../core/reactions.ts";
import { redactRow } from "../core/message.ts";

const OLDER_BODIES = [
  "The first pass kept the room list still.",
  "I checked the narrow layout before the sidebar changed.",
  "The timeline anchor is the part that matters here.",
  "Earlier, the first row was measured after the list grew.",
  "This part of the conversation is older than the live window.",
  "The quiet shell should keep its place while history loads.",
] as const;

function olderRows(roomId: string): readonly MessageRow[] {
  const first = mockMessagesFor(roomId)[0];
  if (first === undefined) return [];
  return OLDER_BODIES.map((body, index) =>
    Object.assign({}, first, {
      id: `older-${roomId}-${String(index)}`,
      eventId: `$older-${roomId}-${String(index)}`,
      transactionId: null,
      sender: "@alice:matrix.org",
      senderName: "Alice",
      senderAvatar: null,
      ts: first.ts - (OLDER_BODIES.length - index) * 60_000,
      own: false,
      kind: "text" as const,
      body,
      html: null,
      media: null,
      reactions: [],
      reply: null,
      mentions: [],
      edited: false,
      redacted: false,
      status: "sent" as const,
      error: null,
      system: false,
      encryption: { state: "ok" as const },
    }),
  );
}

export class MockSource implements ChatSource {
  readonly capabilities = REVIEW_CAPABILITIES;
  private readonly listeners = createSourceListeners();
  private readonly timers = new Set<number>();
  private readonly olderLoaded = new Set<string>();
  private readonly messageLog = new Map<string, MessageRow[]>();
  private readonly memberLog = new Map<string, Member[]>();
  private state = mockChatState();
  private rooms: RoomSummary[] = [];
  private devices: readonly DeviceSession[] = [...mockDevices];
  private invites: readonly Invite[] = [];
  private readonly withData: boolean;

  constructor(withData = true) {
    this.withData = withData;
    if (withData) {
      this.rooms = [...mockChatState().rooms];
      this.invites = [...mockInvites];
    }
  }

  on<K extends SourceEvent>(event: K, listener: (payload: SourceEvents[K]) => void): () => void {
    const channel = this.listeners[event];
    channel.add(listener);
    return () => {
      channel.delete(listener);
    };
  }

  private emit<K extends SourceEvent>(event: K, payload: SourceEvents[K]): void {
    for (const listener of this.listeners[event]) listener(payload);
  }

  private rowsFor(roomId: string): MessageRow[] {
    let rows = this.messageLog.get(roomId);
    if (rows === undefined) {
      rows = [...mockMessagesFor(roomId)];
      this.messageLog.set(roomId, rows);
    }
    return rows;
  }

  private membersFor(roomId: string): Member[] {
    let members = this.memberLog.get(roomId);
    if (members === undefined) {
      members = [...mockMembersFor(roomId)];
      if (members.length === 0 && this.state.session !== null) {
        members = [
          {
            userId: this.state.session.userId,
            displayName: this.state.session.displayName,
            avatar: this.state.session.avatar,
            profile: true,
            membership: "join",
          },
        ];
      }
      this.memberLog.set(roomId, members);
    }
    return members;
  }

  private replaceRow(roomId: string, messageId: string, update: (row: MessageRow) => MessageRow): void {
    this.messageLog.set(
      roomId,
      this.rowsFor(roomId).map((row) => (row.id === messageId || row.eventId === messageId ? update(row) : row)),
    );
  }

  private upsertRow(roomId: string, row: MessageRow): void {
    const rows = this.rowsFor(roomId);
    const index = rows.findIndex((entry) => entry.id === row.id);
    this.messageLog.set(
      roomId,
      index === -1 ? [...rows, row] : rows.map((entry) => (entry.id === row.id ? row : entry)),
    );
  }

  private settlePending(roomId: string, row: MessageRow): void {
    const transactionId = row.transactionId;
    if (transactionId === null) return;
    const eventId = `$${transactionId}:matrix.org`;
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      this.replaceRow(roomId, row.id, (existing) => ({
        ...existing,
        eventId,
        status: "sent",
        error: null,
        retryable: false,
      }));
      const sent = this.rowsFor(roomId).find((entry) => entry.id === row.id) ?? null;
      if (sent !== null)
        this.emit("outbox", {
          roomId,
          messageId: row.id,
          row: sent,
          retryable: false,
        });
    }, 600);
    this.timers.add(timer);
  }

  start(): void {
    if (this.withData) this.emit("session", this.state.session);
    this.emit("phase", "ready");
    this.emit("connection", "online");
    this.emit("rooms", { rooms: this.withData ? this.rooms : [], loading: false });
    this.emit("devices", { devices: this.withData ? this.devices : [], error: null });
    this.emit("invites", this.withData ? this.invites : []);
  }

  open(roomId: string): void {
    const rows = this.withData ? this.rowsFor(roomId) : [];
    for (const row of rows) {
      if (row.status === "sending" && row.transactionId !== null) this.settlePending(roomId, row);
    }
    this.emit("window", {
      roomId,
      messages: rows,
      hasOlder: this.withData && olderRows(roomId).length > 0 && !this.olderLoaded.has(roomId),
      older: false,
      patch: false,
    });
  }

  older(roomId: string): void {
    const rows = olderRows(roomId);
    if (!this.withData || rows.length === 0 || this.olderLoaded.has(roomId)) {
      this.emit("window", { roomId, messages: [], hasOlder: false, older: true, patch: false });
      return;
    }
    this.olderLoaded.add(roomId);
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      this.messageLog.set(roomId, [...rows, ...this.rowsFor(roomId)]);
      this.emit("window", { roomId, messages: rows, hasOlder: false, older: true, patch: false });
    }, 650);
    this.timers.add(timer);
  }

  async sendMedia(
    roomId: string,
    messageId: string,
    transactionId: string,
    caption: string,
    _html: string | null,
    replyTo: string | null,
    kind: "image" | "video" | "audio" | "file" | "sticker",
    name: string,
    file: File,
  ): Promise<MessageRow> {
    const session = this.state.session;
    const parent =
      replyTo === null ? undefined : this.rowsFor(roomId).find((row) => row.id === replyTo || row.eventId === replyTo);
    const row: MessageRow = {
      id: messageId,
      eventId: null,
      transactionId,
      roomId,
      sender: session?.userId ?? "",
      senderName: session?.displayName ?? "You",
      senderAvatar: session?.avatar ?? null,
      ts: Date.now(),
      own: true,
      kind,
      effect: null,
      body: caption,
      html: null,
      media: {
        kind,
        name,
        width: null,
        height: null,
        size: file.size,
        url: URL.createObjectURL(file),
      },
      reactions: [],
      reply:
        parent === undefined
          ? null
          : { messageId: parent.eventId ?? parent.id, senderName: parent.senderName, body: parent.body },
      mentions: [],
      edited: false,
      redacted: false,
      status: "queued",
      error: null,
      retryable: true,
      system: false,
      encryption: { state: "ok" },
    };
    return this.send(roomId, row);
  }

  async sendSticker(
    roomId: string,
    messageId: string,
    transactionId: string,
    packId: string,
    shortcode: string,
  ): Promise<MessageRow> {
    const session = this.state.session;
    const image = session?.stickerPacks
      .find((pack) => pack.id === packId)
      ?.images.find((entry) => entry.shortcode === shortcode);
    if (image === undefined) throw new Error("sticker pack");
    const row: MessageRow = {
      id: messageId,
      eventId: null,
      transactionId,
      roomId,
      sender: session?.userId ?? "",
      senderName: session?.displayName ?? "You",
      senderAvatar: session?.avatar ?? null,
      ts: Date.now(),
      own: true,
      kind: "sticker",
      effect: null,
      body: image.body,
      html: null,
      media: {
        kind: "sticker",
        name: image.body,
        width: image.width,
        height: image.height,
        size: null,
        url: image.url,
      },
      reactions: [],
      reply: null,
      mentions: [],
      edited: false,
      redacted: false,
      status: "queued",
      error: null,
      retryable: true,
      system: false,
      encryption: { state: "ok" },
    };
    return this.send(roomId, row);
  }

  async send(roomId: string, row: MessageRow): Promise<MessageRow> {
    const queued: MessageRow = {
      ...row,
      eventId: null,
      transactionId: row.transactionId ?? row.id,
      status: "queued",
      error: null,
      retryable: true,
    };
    this.upsertRow(roomId, queued);
    this.emit("outbox", { roomId, messageId: queued.id, row: queued, retryable: true });
    this.settlePending(roomId, queued);
    return queued;
  }

  async retrySend(roomId: string, messageId: string): Promise<MessageRow> {
    const row = this.rowsFor(roomId).find((entry) => entry.id === messageId);
    if (row === undefined) throw new Error("outbox row");
    const retried = { ...row, status: "queued" as const, error: null, retryable: true };
    this.upsertRow(roomId, retried);
    this.emit("outbox", { roomId, messageId, row: retried, retryable: true });
    this.settlePending(roomId, retried);
    return retried;
  }

  discardSend(roomId: string, messageId: string): void {
    const rows = this.rowsFor(roomId).filter((entry) => entry.id !== messageId);
    this.messageLog.set(roomId, rows);
    this.emit("outbox", { roomId, messageId, row: null, retryable: false });
  }

  markRead(_roomId: string, _eventId: string): void {}

  /** The review fixture shows the chosen image as this session's avatar. */
  pat(_roomId: string, _userId: string, _effect: "pat" | "boop"): Promise<void> {
    return Promise.resolve();
  }

  setAvatar(file: Blob): Promise<void> {
    const session = this.state.session;
    if (session === null) return Promise.reject(new Error("not-signed-in"));
    const url = URL.createObjectURL(file);
    this.state = { ...this.state, session: { ...session, avatar: url } };
    this.emit("session", this.state.session);
    return Promise.resolve();
  }

  private emitPatch(roomId: string, row: MessageRow): void {
    this.emit("window", {
      roomId,
      messages: [row],
      hasOlder: this.olderLoaded.has(roomId) ? false : olderRows(roomId).length > 0,
      older: false,
      patch: true,
    });
  }

  react(roomId: string, eventId: string, key: string): void {
    this.replaceRow(roomId, eventId, (row) => ({ ...row, reactions: toggledReactions(row.reactions, key) }));
    const updated = this.rowsFor(roomId).find((row) => row.id === eventId || row.eventId === eventId);
    if (updated !== undefined) this.emitPatch(roomId, updated);
  }

  edit(roomId: string, eventId: string, body: string, html: string | null): void {
    this.replaceRow(roomId, eventId, (row) => ({
      ...row,
      body,
      html,
      edited: true,
      status: "sent",
      error: null,
    }));
    const updated = this.rowsFor(roomId).find((row) => row.id === eventId || row.eventId === eventId);
    if (updated !== undefined) this.emitPatch(roomId, updated);
  }

  redact(roomId: string, eventId: string): void {
    this.replaceRow(roomId, eventId, redactRow);
    const updated = this.rowsFor(roomId).find((row) => row.id === eventId || row.eventId === eventId);
    if (updated !== undefined) this.emitPatch(roomId, updated);
  }

  async search(roomIds: readonly string[], query: string, mediaKinds?: ReadonlySet<string>) {
    if (!this.withData) return [];
    return roomIds
      .flatMap((roomId) => this.rowsFor(roomId))
      .filter((row) => !row.redacted && !row.system && row.encryption.state === "ok")
      .filter((row) => messageMatches(row, query, mediaKinds));
  }

  forward(targetRoomId: string, sources: readonly { readonly roomId: string; readonly eventId: string }[]): void {
    for (const source of sources) {
      const origin = this.rowsFor(source.roomId).find(
        (row) => row.eventId === source.eventId || row.id === source.eventId,
      );
      if (origin === undefined || origin.redacted) continue;
      const id = `local-forward-${crypto.randomUUID()}`;
      const forwarded: MessageRow = {
        ...origin,
        id,
        eventId: null,
        transactionId: `txn-${id}`,
        roomId: targetRoomId,
        sender: this.state.session?.userId ?? origin.sender,
        senderName: this.state.session?.displayName ?? origin.senderName,
        senderAvatar: this.state.session?.avatar ?? null,
        own: true,
        reactions: [],
        reply: null,
        mentions: [],
        edited: false,
        redacted: false,
        status: "queued",
        error: null,
        retryable: true,
      };
      this.upsertRow(targetRoomId, forwarded);
      this.emit("outbox", { roomId: targetRoomId, messageId: id, row: forwarded, retryable: true });
      this.settlePending(targetRoomId, forwarded);
    }
  }

  typing(_roomId: string, _typing: boolean): void {}

  members(roomId: string): void {
    this.emit("members", { roomId, members: this.withData ? this.membersFor(roomId) : [] });
  }

  memberAction(roomId: string, userId: string, action: "kick" | "ban" | "unban"): Promise<void> {
    const members = this.membersFor(roomId).map((member) => {
      if (member.userId !== userId) return member;
      return Object.assign({}, member, {
        membership: action === "ban" ? ("ban" as const) : ("leave" as const),
      });
    });
    this.memberLog.set(roomId, members);
    this.emit("members", { roomId, members });
    return Promise.resolve();
  }

  inviteUser(roomId: string, userId: string): void {
    const localpart = userId.slice(1).split(":")[0] ?? userId;
    const members = [
      ...this.membersFor(roomId),
      {
        userId,
        displayName: localpart,
        avatar: null,
        profile: true,
        membership: "invite" as const,
      },
    ];
    this.memberLog.set(roomId, members);
    this.emit("members", { roomId, members });
  }

  addRoom(room: RoomSummary): void {
    this.rooms = [...this.rooms.filter((entry) => entry.roomId !== room.roomId), room];
    this.emit("rooms", { rooms: this.rooms, loading: false });
  }

  leaveRoom(roomId: string): void {
    this.rooms = this.rooms
      .filter((room) => room.roomId !== roomId)
      .map((room) => (room.spaceId === roomId ? Object.assign({}, room, { spaceId: null }) : room));
    this.emit("rooms", { rooms: this.rooms, loading: false });
  }

  setRoomState(roomId: string, patch: RoomStatePatch): void {
    this.rooms = this.rooms.map((room) => (room.roomId === roomId ? Object.assign({}, room, patch) : room));
    this.emit("rooms", { rooms: this.rooms, loading: false });
  }

  setRoomTag(roomId: string, tag: "m.favourite" | "m.lowpriority", enabled: boolean): void {
    this.rooms = this.rooms.map((room) => {
      if (room.roomId !== roomId) return room;
      const tags = { ...room.tags };
      if (enabled) tags[tag] = {};
      else delete tags[tag];
      return { ...room, tags };
    });
    this.emit("rooms", { rooms: this.rooms, loading: false });
  }

  setNotification(roomId: string, mode: RoomSummary["notification"]): void {
    this.rooms = this.rooms.map((room) => (room.roomId === roomId ? { ...room, notification: mode } : room));
    this.emit("rooms", { rooms: this.rooms, loading: false });
  }

  resetRecoveryKey(): void {
    this.emit("recoveryKey", {
      value: `maski-recovery-key-${crypto.randomUUID()}`,
      copy: true,
      download: true,
    });
  }

  resetIdentity(): void {
    this.emit("recoveryKey", {
      value: `maski-recovery-key-${crypto.randomUUID()}`,
      copy: true,
      download: true,
    });
  }

  signOutDevice(deviceId: string): void {
    this.devices = this.devices.filter((device) => device.id !== deviceId || device.current);
    this.emit("devices", { devices: this.devices, error: null });
  }

  signOutOthers(): void {
    this.devices = this.devices.filter((device) => device.current);
    this.emit("devices", { devices: this.devices, error: null });
  }

  answerInvite(roomId: string, _accept: boolean): void {
    this.invites = this.invites.filter((invite) => invite.roomId !== roomId);
    this.emit("invites", this.invites);
  }

  saveNotifications(_prefs: NotificationPrefs): void {}

  backupSetup(): void {
    this.emit("backup", {
      version: "1",
      trusted: true,
      matchesDecryptionKey: true,
      enabled: true,
      error: null,
    });
  }

  async logout(): Promise<void> {}

  dispose(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    clearSourceListeners(this.listeners);
  }
}
