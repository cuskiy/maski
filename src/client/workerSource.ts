import type { KeyGate, MessageRow, Phase } from "../core/types.ts";
import type { Event } from "../protocol/index.ts";
import { PRODUCTION_CAPABILITIES } from "../core/types.ts";
import type { ChatSource, SourceEvent, SourceEvents } from "./source.ts";
import { clearSourceListeners, createSourceListeners } from "./source.ts";
import { MatrixTransport } from "./matrixTransport.ts";
import { localeForPath, localeRoot } from "../core/locales.ts";
import { clearSession, setGate } from "./session.ts";

function loginPath(): string {
  const locale = localeForPath(location.pathname) ?? "en";
  return `${localeRoot(locale)}login/`;
}

function phaseFor(gate: KeyGate): Phase {
  if (gate === "missing") return "signedOut";
  if (gate === "ready" || gate === "unknown") return "ready";
  return "locked";
}

export class WorkerSource implements ChatSource {
  readonly capabilities = PRODUCTION_CAPABILITIES;
  private readonly transport: MatrixTransport;
  private readonly listeners = createSourceListeners();
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
    const channel = this.listeners[event];
    channel.add(listener);
    return () => {
      channel.delete(listener);
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
          if (new URL(location.href).pathname !== loginPath()) location.assign(loginPath());
          return;
        }
        this.emit("session", data.session);
        setGate(data.key);
        this.emit("keys", data.key);
        this.emit("connection", data.connection);
        this.emit("phase", phaseFor(data.key));
      },
      (error: unknown) => {
        if (error instanceof Error && error.message === "locked") {
          this.emit("phase", "locked");
          this.emit("connection", "offline");
          return;
        }
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

  send(roomId: string, row: MessageRow): Promise<MessageRow> {
    return this.transport.send(
      roomId,
      row.body,
      row.html,
      row.reply?.messageId ?? null,
      row.transactionId ?? row.id,
      row.id,
      row.kind,
      row.media,
    );
  }

  retrySend(roomId: string, messageId: string): Promise<MessageRow> {
    return this.transport.retrySend(roomId, messageId);
  }

  discardSend(roomId: string, messageId: string): void {
    this.transport.discardSend(roomId, messageId);
  }

  markRead(roomId: string, eventId: string): void {
    this.transport.markRead(roomId, eventId);
  }

  members(roomId: string): void {
    this.transport.members(roomId);
  }

  async logout(): Promise<void> {
    await this.transport.logout();
  }

  resetIdentity(password: string): void {
    void this.transport
      .resetIdentity(password)
      .then((value) => {
        if (value !== null) this.emit("recoveryKey", { value, copy: true, download: true });
      })
      .catch(() => undefined);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unlisten();
    this.transport.dispose();
    clearSourceListeners(this.listeners);
  }

  private emit<K extends SourceEvent>(event: K, payload: SourceEvents[K]): void {
    for (const listener of this.listeners[event]) listener(payload);
  }

  private dispatch(event: Event): void {
    switch (event.type) {
      case "session":
        if (event.payload === null) {
          clearSession();
          this.emit("session", null);
          this.emit("phase", "signedOut");
          location.assign(loginPath());
          break;
        }
        this.emit("session", event.payload);
        break;
      case "keys":
        setGate(event.payload);
        this.emit("keys", event.payload);
        this.emit("phase", phaseFor(event.payload));
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
