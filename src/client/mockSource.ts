import type { ChatSource, SourceEvent, SourceEvents } from "./source.ts";
import type { DeviceSession, Invite, MessageRow, NotificationPrefs, RoomSummary } from "../core/types.ts";
import { mockChatState, mockDevices, mockInvites, mockMessagesFor, mockRecoveryKey } from "../core/mock.ts";
import { messageMatches } from "../core/search.ts";
import { toggledReactions } from "../core/reactions.ts";

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
      edited: false,
      status: "sent" as const,
      error: null,
      system: false,
      encryption: { state: "ok" as const },
      capabilities: { reply: true, react: true, edit: false, redact: false, copy: true, copyLink: true },
    }),
  );
}

export class MockSource implements ChatSource {
  private readonly listeners = new Map<SourceEvent, Set<Listener>>();
  private readonly timers = new Set<number>();
  private readonly olderLoaded = new Set<string>();
  private readonly messageLog = new Map<string, MessageRow[]>();
  private readonly state = mockChatState();
  private devices: readonly DeviceSession[] = [...mockDevices];
  private invites: readonly Invite[] = [...mockInvites];
  private readonly withData: boolean;

  constructor(withData = true) {
    this.withData = withData;
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

  private replaceRow(roomId: string, messageId: string, update: (row: MessageRow) => MessageRow): void {
    const rows = this.rowsFor(roomId);
    this.messageLog.set(
      roomId,
      rows.map((row) => (row.id === messageId ? update(row) : row)),
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

  start(): void {
    if (this.withData) this.emit("session", this.state.session);
    this.emit("phase", "ready");
    this.emit("connection", "online");
    this.emit("rooms", { rooms: this.withData ? this.state.rooms : [], loading: false });
    this.emit("devices", this.withData ? this.devices : []);
    this.emit("invites", this.withData ? this.invites : []);
    this.emit("members", this.withData ? this.state.members : []);
  }

  open(roomId: string): void {
    const rows = this.withData ? this.rowsFor(roomId) : [];
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
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      this.replaceRow(roomId, row.id, (existing) => ({ ...existing, status: "sent", error: null }));
      this.emit("outbox", { roomId, messageId: row.id, status: "sent", error: null });
    }, 600);
    this.timers.add(timer);
  }
  markRead(_roomId: string): void {}
  react(roomId: string, messageId: string, key: string): void {
    this.replaceRow(roomId, messageId, (row) => ({ ...row, reactions: toggledReactions(row.reactions, key) }));
  }
  edit(roomId: string, messageId: string, body: string, html: string | null): void {
    this.replaceRow(roomId, messageId, (row) => ({ ...row, body, html, edited: true, status: "sent", error: null }));
  }
  redact(roomId: string, messageId: string): void {
    this.messageLog.set(
      roomId,
      this.rowsFor(roomId).filter((row) => row.id !== messageId),
    );
  }
  search(roomIds: readonly string[], query: string, mediaKinds?: ReadonlySet<string>): readonly MessageRow[] {
    if (!this.withData) return [];
    return roomIds.flatMap((roomId) => this.rowsFor(roomId)).filter((row) => messageMatches(row, query, mediaKinds));
  }
  forward(roomId: string, rows: readonly MessageRow[]): void {
    this.messageLog.set(roomId, [...this.rowsFor(roomId), ...rows]);
  }
  typing(_roomId: string): void {}

  setNotification(_roomId: string, _mode: RoomSummary["notification"]): void {}

  revealRecoveryKey(): void {
    this.emit("recoveryKey", mockRecoveryKey);
  }

  resetIdentity(): void {
    this.emit("recoveryKey", {
      value: `maski-recovery-key-${crypto.randomUUID()}`,
      copy: true,
      download: true,
    });
  }

  verifyDevice(deviceId: string): void {
    this.devices = this.devices.map((device) => (device.id === deviceId ? { ...device, verified: true } : device));
    this.emit("devices", this.devices);
  }

  signOutDevice(deviceId: string): void {
    this.devices = this.devices.filter((device) => device.id !== deviceId || device.current);
    this.emit("devices", this.devices);
  }

  signOutOthers(): void {
    this.devices = this.devices.filter((device) => device.current);
    this.emit("devices", this.devices);
  }

  signOutAll(): void {
    this.devices = [];
    this.emit("devices", this.devices);
  }

  answerInvite(roomId: string, _accept: boolean): void {
    this.invites = this.invites.filter((invite) => invite.roomId !== roomId);
    this.emit("invites", this.invites);
  }

  saveNotifications(_prefs: NotificationPrefs): void {}

  logout(): void {}

  dispose(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.listeners.clear();
  }
}
