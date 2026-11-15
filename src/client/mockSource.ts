import type { ChatSource, RoomStatePatch, SourceEvent, SourceEvents } from "./source.ts";
import type { DeviceSession, Invite, Member, MessageRow, NotificationPrefs, RoomSummary } from "../core/types.ts";
import { mockChatState, mockDevices, mockInvites, mockMembersFor, mockMessagesFor } from "../core/mock.ts";
import { messageMatches } from "../core/search.ts";
import { toggledReactions } from "../core/reactions.ts";
import { redactRow } from "../core/message.ts";

type Listener = (payload: unknown) => void;

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
  private readonly listeners = new Map<SourceEvent, Set<Listener>>();
  private readonly timers = new Set<number>();
  private readonly olderLoaded = new Set<string>();
  private readonly messageLog = new Map<string, MessageRow[]>();
  private readonly memberLog = new Map<string, Member[]>();
  private readonly state = mockChatState();
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
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped: Listener = (payload) => {
      listener(payload as SourceEvents[K]);
    };
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  private emit<K extends SourceEvent>(event: K, payload: SourceEvents[K]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
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
      }));
      this.emit("outbox", { roomId, messageId: row.id, eventId, status: "sent", error: null });
    }, 600);
    this.timers.add(timer);
  }

  start(): void {
    if (this.withData) this.emit("session", this.state.session);
    this.emit("phase", "ready");
    this.emit("connection", "online");
    this.emit("rooms", { rooms: this.withData ? this.rooms : [], loading: false });
    this.emit("devices", this.withData ? this.devices : []);
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
    });
  }

  older(roomId: string): void {
    const rows = olderRows(roomId);
    if (!this.withData || rows.length === 0 || this.olderLoaded.has(roomId)) {
      this.emit("window", { roomId, messages: [], hasOlder: false, older: true });
      return;
    }
    this.olderLoaded.add(roomId);
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      this.messageLog.set(roomId, [...rows, ...this.rowsFor(roomId)]);
      this.emit("window", { roomId, messages: rows, hasOlder: false, older: true });
    }, 650);
    this.timers.add(timer);
  }

  send(roomId: string, row: MessageRow): void {
    this.upsertRow(roomId, row);
    if (row.status === "sent") return;
    this.settlePending(roomId, row);
  }

  markRead(_roomId: string, _eventId: string | null): void {}

  react(roomId: string, eventId: string, key: string): void {
    this.replaceRow(roomId, eventId, (row) => ({ ...row, reactions: toggledReactions(row.reactions, key) }));
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
  }

  redact(roomId: string, eventId: string): void {
    this.replaceRow(roomId, eventId, redactRow);
  }

  search(roomIds: readonly string[], query: string, mediaKinds?: ReadonlySet<string>): readonly MessageRow[] {
    if (!this.withData) return [];
    return roomIds.flatMap((roomId) => this.rowsFor(roomId)).filter((row) => messageMatches(row, query, mediaKinds));
  }

  forward(roomId: string, rows: readonly MessageRow[]): void {
    this.messageLog.set(roomId, [...this.rowsFor(roomId), ...rows]);
  }

  typing(_roomId: string): void {}

  members(roomId: string): void {
    this.emit("members", { roomId, members: this.withData ? this.membersFor(roomId) : [] });
  }

  memberAction(roomId: string, userId: string, action: "kick" | "ban" | "unban"): void {
    const members = this.membersFor(roomId).map((member) => {
      if (member.userId !== userId) return member;
      return Object.assign({}, member, {
        membership: action === "ban" ? ("ban" as const) : ("leave" as const),
      });
    });
    this.memberLog.set(roomId, members);
    this.emit("members", { roomId, members });
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
    this.emit("devices", this.devices);
  }

  signOutOthers(): void {
    this.devices = this.devices.filter((device) => device.current);
    this.emit("devices", this.devices);
  }

  answerInvite(roomId: string, _accept: boolean): void {
    this.invites = this.invites.filter((invite) => invite.roomId !== roomId);
    this.emit("invites", this.invites);
  }

  saveNotifications(_prefs: NotificationPrefs): void {}

  async logout(): Promise<void> {}

  dispose(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.listeners.clear();
  }
}
