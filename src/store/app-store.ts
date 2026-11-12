import type { Locale } from "../app/config";
import type {
  DeltaPayload,
  DeviceRecord,
  EventRecord,
  MemberRecord,
  OutboxRecord,
  PackRecord,
  RoomRecord,
  VerificationState,
} from "../data/records";
import type { RecoveryStatus, SessionSummary } from "../protocol";
import type { ProjectionRead } from "./db";

export type ConnectionState = "boot" | "connecting" | "ready" | "offline" | "error" | "readonly" | "fatal";
export type KeyGateState = "checking" | "required" | "complete";

export interface UiState {
  locale: Locale;
  toast: string | null;
  notificationsPreview: boolean;
  notificationPermission: NotificationPermission | "unsupported";
}

export interface AppSnapshot {
  session: SessionSummary | null;
  connection: ConnectionState;
  keyGate: KeyGateState;
  recovery: RecoveryStatus | null;
  // The projection revision the snapshot was built from, so a slow read can never
  // overwrite a delta that already landed.
  revision: number;
  rooms: RoomRecord[];
  activeRoomId: string | null;
  events: EventRecord[];
  members: MemberRecord[];
  packs: PackRecord[];
  outbox: OutboxRecord[];
  typing: Record<string, string[]>;
  devices: DeviceRecord[];
  verification: VerificationState | null;
  ui: UiState;
}

export type Listener = (snapshot: AppSnapshot, previous: AppSnapshot) => void;

export class AppStore {
  private snapshot: AppSnapshot;
  private readonly listeners = new Set<Listener>();

  constructor(locale: Locale) {
    this.snapshot = {
      session: null,
      connection: "boot",
      keyGate: "checking",
      recovery: null,
      revision: 0,
      rooms: [],
      activeRoomId: null,
      events: [],
      members: [],
      packs: [],
      outbox: [],
      typing: {},
      devices: [],
      verification: null,
      ui: {
        locale,
        toast: null,
        notificationsPreview: true,
        notificationPermission:
          typeof Notification === "undefined" ? "unsupported" : Notification.permission,
      },
    };
  }

  getSnapshot(): AppSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  patch(patch: Partial<AppSnapshot>): void {
    const previous = this.snapshot;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot, previous);
  }

  patchUi(patch: Partial<UiState>): void {
    const previous = this.snapshot;
    this.snapshot = { ...this.snapshot, ui: { ...this.snapshot.ui, ...patch } };
    for (const listener of this.listeners) listener(this.snapshot, previous);
  }

  setSession(session: SessionSummary | null): void {
    this.patch({ session });
  }

  setConnection(connection: ConnectionState): void {
    this.patch({ connection });
  }

  setKeyGate(keyGate: KeyGateState): void {
    this.patch({ keyGate });
  }

  setRecovery(recovery: RecoveryStatus | null): void {
    this.patch({ recovery });
  }

  setProjection(projection: ProjectionRead): void {
    if (projection.revision < this.snapshot.revision) return;
    this.patch({
      revision: projection.revision,
      rooms: projection.rooms,
      events: projection.events,
      members: projection.members,
      packs: projection.packs,
      outbox: projection.outbox,
    });
  }

  applyDelta(delta: DeltaPayload): void {
    if (delta.revision <= this.snapshot.revision && delta.events.length === 0) return;
    const rooms = new Map(this.snapshot.rooms.map((room) => [room.roomId, room]));
    for (const room of delta.rooms) rooms.set(room.roomId, room);
    for (const roomId of delta.removedRooms) rooms.delete(roomId);
    const events = new Map(this.snapshot.events.map((event) => [event.eventId, event]));
    for (const event of delta.events) events.set(event.eventId, event);
    const members = new Map(
      this.snapshot.members.map((member) => [`${member.roomId}|${member.userId}`, member]),
    );
    for (const member of delta.members) members.set(`${member.roomId}|${member.userId}`, member);
    const packs = new Map(this.snapshot.packs.map((pack) => [pack.packId, pack]));
    for (const pack of delta.packs) packs.set(pack.packId, pack);
    for (const packId of delta.removedPacks) packs.delete(packId);
    this.patch({
      revision: Math.max(this.snapshot.revision, delta.revision),
      rooms: [...rooms.values()].toSorted((a, b) => b.lastTs - a.lastTs),
      events: [...events.values()].toSorted((a, b) => a.ts - b.ts),
      members: [...members.values()],
      packs: [...packs.values()],
    });
  }

  setActiveRoom(roomId: string | null, events?: readonly EventRecord[]): void {
    const merged = new Map(this.snapshot.events.map((event) => [event.eventId, event]));
    for (const event of events ?? []) merged.set(event.eventId, event);
    this.patch({
      activeRoomId: roomId,
      events: [...merged.values()].toSorted((a, b) => a.ts - b.ts),
    });
  }

  setRooms(rooms: readonly RoomRecord[]): void {
    this.patch({ rooms: [...rooms].toSorted((a, b) => b.lastTs - a.lastTs) });
  }

  setEvents(events: readonly EventRecord[]): void {
    this.patch({ events: [...events].toSorted((a, b) => a.ts - b.ts) });
  }

  setMembers(members: readonly MemberRecord[]): void {
    this.patch({ members: [...members] });
  }

  setPacks(packs: readonly PackRecord[]): void {
    this.patch({ packs: [...packs] });
  }

  setOutbox(outbox: readonly OutboxRecord[]): void {
    this.patch({ outbox: [...outbox] });
  }

  addOutbox(record: OutboxRecord): void {
    this.patch({ outbox: [...this.snapshot.outbox.filter((row) => row.txnId !== record.txnId), record] });
  }

  updateOutbox(txnId: string, patch: Partial<OutboxRecord>): void {
    this.patch({
      outbox: this.snapshot.outbox.map((row) => (row.txnId === txnId ? { ...row, ...patch } : row)),
    });
  }

  removeOutbox(txnId: string): void {
    this.patch({ outbox: this.snapshot.outbox.filter((row) => row.txnId !== txnId) });
  }

  setTyping(roomId: string, userIds: readonly string[]): void {
    this.patch({ typing: { ...this.snapshot.typing, [roomId]: [...userIds] } });
  }

  setDevices(devices: readonly DeviceRecord[]): void {
    this.patch({ devices: [...devices] });
  }

  setVerification(verification: VerificationState | null): void {
    this.patch({ verification });
  }

  setToast(toast: string | null): void {
    this.patchUi({ toast });
  }
}
