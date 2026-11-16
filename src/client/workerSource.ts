import type { KeyGate, MessageKind, MessageRow, Phase, RoomStatePatch, RoomSummary } from "../core/types.ts";
import type { CommandMap, Event, FailureCode, MediaReply, MediaVariant } from "../protocol/index.ts";
import { isFailureCode } from "../protocol/index.ts";
import { PRODUCTION_CAPABILITIES } from "../core/types.ts";
import type { ChatSource, ForwardSource, SourceEvent, SourceEvents } from "./source.ts";
import { clearSourceListeners, createSourceListeners } from "./source.ts";
import { MatrixTransport } from "./matrixTransport.ts";
import { localeForPath, localeRoot } from "../core/locales.ts";
import { clearAccount, mockSession, setGate } from "./session.ts";
import { keepStorage } from "./persist.ts";

function loginPath(): string {
  const locale = localeForPath(location.pathname) ?? "en";
  return `${localeRoot(locale)}login/`;
}

export function phaseFor(gate: KeyGate): Phase {
  if (gate === "missing") return "signedOut";
  if (gate === "ready") return "ready";
  return "locked";
}

/** A cached ready gate may paint cached data, but never makes the room interactive. */
export function startPhase(gate: KeyGate, cached: KeyGate): Phase | null {
  if (gate !== "unknown") return phaseFor(gate);
  return cached === "ready" ? "verifying" : null;
}

const MESSAGE_KINDS: ReadonlySet<string> = new Set<MessageKind>([
  "text",
  "notice",
  "emote",
  "image",
  "sticker",
  "file",
  "audio",
  "video",
]);

function isMessageKind(value: string): value is MessageKind {
  return MESSAGE_KINDS.has(value);
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
          clearAccount();
          this.emit("phase", "signedOut");
          this.emit("connection", "offline");
          this.emit("rooms", { rooms: [], loading: false });
          if (new URL(location.href).pathname !== loginPath()) location.assign(loginPath());
          return;
        }
        this.emit("session", data.session);
        void keepStorage();
        this.emit("connection", data.connection);
        if (data.key !== "unknown") setGate(data.key);
        const phase = startPhase(data.key, mockSession().gate);
        if (phase === null) return;
        this.emit("keys", phase === "ready" ? "ready" : data.key);
        this.emit("phase", phase);
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
    void this.transport.open(roomId).catch((error: unknown) => this.report("open", error));
  }

  older(roomId: string): void {
    void this.transport.older(roomId).catch((error: unknown) => this.report("older", error));
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

  sendMedia(
    roomId: string,
    messageId: string,
    transactionId: string,
    caption: string,
    html: string | null,
    replyTo: string | null,
    kind: CommandMap["sendMedia"]["kind"],
    name: string,
    file: Blob,
  ): Promise<MessageRow> {
    return this.transport.sendMedia(roomId, messageId, transactionId, caption, html, replyTo, kind, name, file);
  }

  sendSticker(
    roomId: string,
    messageId: string,
    transactionId: string,
    packId: string,
    shortcode: string,
  ): Promise<MessageRow> {
    return this.transport.sendSticker(roomId, messageId, transactionId, packId, shortcode);
  }

  media(roomId: string, messageId: string, variant: MediaVariant): Promise<MediaReply> {
    return this.transport.media(roomId, messageId, variant);
  }

  discardSend(roomId: string, messageId: string): void {
    this.transport.discardSend(roomId, messageId);
  }

  markRead(roomId: string, eventId: string): Promise<void> {
    return this.transport.markRead(roomId, eventId).then(() => undefined);
  }

  members(roomId: string): void {
    void this.transport.members(roomId).catch((error: unknown) => this.report("members", error));
  }

  react(roomId: string, eventId: string, key: string): Promise<void> {
    return this.transport.react(roomId, eventId, key).then(() => undefined);
  }

  edit(roomId: string, eventId: string, body: string, html: string | null): Promise<void> {
    return this.transport.edit(roomId, eventId, body, html).then(() => undefined);
  }

  redact(roomId: string, eventId: string): Promise<void> {
    return this.transport.redact(roomId, eventId).then(() => undefined);
  }

  typing(roomId: string, typing: boolean): void {
    void this.transport.typing(roomId, typing).catch(() => undefined);
  }

  search(roomIds: readonly string[], query: string, mediaKinds?: ReadonlySet<string>): Promise<readonly MessageRow[]> {
    const kinds: MessageKind[] = [];
    if (mediaKinds !== undefined) {
      for (const kind of mediaKinds) {
        if (isMessageKind(kind)) kinds.push(kind);
      }
    }
    return this.transport.search(roomIds, query, kinds, 40);
  }

  leaveRoom(roomId: string): void {
    void this.transport.leaveRoom(roomId).catch(() => undefined);
  }

  setRoomTag(roomId: string, tag: "m.favourite" | "m.lowpriority", enabled: boolean): void {
    void this.transport.setRoomTag(roomId, tag, enabled).catch(() => undefined);
  }

  setNotification(roomId: string, mode: RoomSummary["notification"]): void {
    void this.transport.setNotification(roomId, mode).catch(() => undefined);
  }

  setRoomState(roomId: string, patch: RoomStatePatch): void {
    void this.transport.setRoomState(roomId, patch).catch(() => undefined);
  }

  inviteUser(roomId: string, userId: string): void {
    void this.transport.inviteUser(roomId, userId).catch(() => undefined);
  }

  joinRoom(roomIdOrAlias: string): Promise<string> {
    return this.transport.joinRoom(roomIdOrAlias);
  }

  answerInvite(roomId: string, accept: boolean): void {
    void this.transport.answerInvite(roomId, accept).catch(() => undefined);
  }

  createRoom(name: string, topic: string, directUserId: string | null): Promise<string> {
    return this.transport.createRoom(name, topic, directUserId);
  }

  forward(targetRoomId: string, sources: readonly ForwardSource[]): void {
    void this.transport.forward(targetRoomId, sources).catch(() => undefined);
  }

  memberAction(roomId: string, userId: string, action: "kick" | "ban" | "unban"): void {
    void this.transport.memberAction(roomId, userId, action).catch(() => undefined);
  }

  startSas(deviceId: string | null): Promise<void> {
    return this.transport.sasStart(deviceId).then(() => undefined);
  }

  acceptSas(id: string): Promise<void> {
    return this.transport.sasAccept(id).then(() => undefined);
  }

  confirmSas(id: string): Promise<void> {
    return this.transport.sasConfirm(id).then(() => undefined);
  }

  mismatchSas(id: string): Promise<void> {
    return this.transport.sasMismatch(id).then(() => undefined);
  }

  cancelSas(id: string): Promise<void> {
    return this.transport.sasCancel(id).then(() => undefined);
  }

  async logout(): Promise<void> {
    await this.transport.logout();
  }

  backupSetup(): void {
    void this.transport.backupSetup().catch(() => undefined);
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

  private report(command: "open" | "older" | "members", error: unknown): void {
    const code: FailureCode = error instanceof Error && isFailureCode(error.message) ? error.message : "unavailable";
    this.emit("failure", { command, code });
  }

  private emit<K extends SourceEvent>(event: K, payload: SourceEvents[K]): void {
    for (const listener of this.listeners[event]) listener(payload);
  }

  private dispatch(event: Event): void {
    switch (event.type) {
      case "session":
        if (event.payload === null) {
          clearAccount();
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
      case "devices":
        this.emit("devices", event.payload);
        break;
      case "backup":
        this.emit("backup", event.payload);
        break;
      case "sas":
        this.emit("sas", event.payload);
        break;
      case "invites":
        this.emit("invites", event.payload);
        break;
      case "typing":
        this.emit("typing", event.payload);
        break;
      case "connection":
        this.emit("connection", event.payload);
        break;
      case "outbox":
        this.emit("outbox", event.payload);
        break;
      case "media":
        this.emit("media", event.payload);
        break;
      default:
        break;
    }
  }
}
