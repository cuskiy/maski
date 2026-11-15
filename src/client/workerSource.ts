import type { MessageRow, NotificationPrefs, RoomSummary } from "../core/types.ts";
import type { Event } from "../protocol/index.ts";
import type { ChatSource, RoomStatePatch, SourceEvent, SourceEvents } from "./source.ts";
import { MatrixTransport } from "./matrixTransport.ts";
import { clearSession } from "./session.ts";

export class WorkerSource implements ChatSource {
  private readonly transport: MatrixTransport;
  private readonly listeners = new Map<SourceEvent, Set<(payload: unknown) => void>>();
  private readonly unlisten: () => void;
  private disposed = false;

  constructor() {
    const workerUrl = document.querySelector<HTMLMetaElement>('meta[name="matrix-worker"]')?.content;
    const wasmUrl = document.querySelector<HTMLMetaElement>('meta[name="crypto-wasm"]')?.content;
    if (workerUrl === undefined || wasmUrl === undefined || workerUrl === "" || wasmUrl === "") {
      throw new Error("the Matrix worker is not configured");
    }
    this.transport = new MatrixTransport(workerUrl, wasmUrl);
    this.unlisten = this.transport.onEvent((event) => this.dispatch(event));
  }

  on<K extends SourceEvent>(event: K, listener: (payload: SourceEvents[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped = (payload: unknown): void => listener(payload as SourceEvents[K]);
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  start(): void {
    void this.transport.start().then(
      (data) => {
        if (data.session === null) {
          clearSession();
          this.emit("phase", "signedOut");
          this.emit("connection", "offline");
          this.emit("rooms", { rooms: [], loading: false });
          return;
        }
        this.emit("session", data.session);
        this.emit("connection", data.connection);
        this.emit("phase", "ready");
      },
      () => {
        this.emit("phase", "signedOut");
        this.emit("connection", "offline");
        this.emit("rooms", { rooms: [], loading: false });
      },
    );
  }

  open(roomId: string): void {
    this.transport.open(roomId);
  }

  older(roomId: string): void {
    this.transport.older(roomId);
  }

  send(roomId: string, row: MessageRow): void {
    if (row.media !== null) {
      this.emit("outbox", {
        roomId,
        messageId: row.id,
        eventId: row.eventId,
        status: "failed",
        error: null,
      });
      return;
    }
    this.transport.send(roomId, row.body, row.html, row.reply?.messageId ?? null, row.transactionId ?? row.id, row.id);
  }

  markRead(_roomId: string, _eventId: string | null): void {
    if (_eventId !== null) this.transport.markRead(_roomId, _eventId);
  }

  members(roomId: string): void {
    this.transport.members(roomId);
  }

  async logout(): Promise<void> {
    await this.transport.logout();
  }

  search(): readonly MessageRow[] {
    return [];
  }

  react(): void {}
  edit(): void {}
  redact(): void {}
  forward(): void {}
  typing(): void {}
  memberAction(): void {}
  inviteUser(): void {}
  addRoom(): void {}
  leaveRoom(): void {}
  setRoomState(_roomId: string, _patch: RoomStatePatch): void {}
  setRoomTag(_roomId: string, _tag: "m.favourite" | "m.lowpriority", _enabled: boolean): void {}
  setNotification(_roomId: string, _mode: RoomSummary["notification"]): void {}
  resetRecoveryKey(): void {}
  resetIdentity(): void {}
  signOutDevice(): void {}
  signOutOthers(): void {}
  answerInvite(): void {}
  saveNotifications(_prefs: NotificationPrefs): void {}
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unlisten();
    this.transport.dispose();
    this.listeners.clear();
  }

  private emit<K extends SourceEvent>(event: K, payload: SourceEvents[K]): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }

  private dispatch(event: Event): void {
    switch (event.type) {
      case "session":
        this.emit("session", event.payload);
        break;
      case "rooms":
        this.emit("rooms", event.payload);
        break;
      case "window":
        this.emit("window", event.payload);
        break;
      case "members":
        this.emit("members", event.payload);
        break;
      case "connection":
        this.emit("connection", event.payload);
        break;
      case "outbox":
        this.emit("outbox", event.payload);
        break;
      default:
        break;
    }
  }
}
