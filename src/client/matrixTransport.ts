import type {
  DeviceSession,
  MessageKind,
  MessageRow,
  RoomStatePatch,
  SasState,
  SessionSummary,
} from "../core/types.ts";
import type {
  CommandMap,
  CommandName,
  Event,
  KeyStatus,
  MediaReply,
  MediaVariant,
  ReplyData,
  ReplyEnvelope,
  StartData,
} from "../protocol/index.ts";
import { parseEvent, parseReply, REPLY_DATA_GUARDS } from "../protocol/index.ts";

const DEFAULT_TIMEOUT = 30_000;
const TIMEOUTS: Partial<Record<CommandName, number>> = {
  login: 60_000,
  loginToken: 60_000,
  ssoUrl: 60_000,
  register: 120_000,
  recover: 120_000,
  resetIdentity: 120_000,
  createRoom: 60_000,
  joinRoom: 60_000,
  leaveRoom: 60_000,
  // An upload outlives the default; progress keeps the worker busy, not the main thread.
  sendMedia: 15 * 60_000,
  media: 180_000,
};

type Pending = {
  readonly resolve: (reply: ReplyEnvelope) => void;
  readonly reject: (error: Error) => void;
};

export class MatrixTransport {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private readonly timers = new Map<number, number>();
  private readonly listeners = new Set<(event: Event) => void>();
  private sequence = 0;
  private wasmUrl: string;

  constructor(workerUrl: string, wasmUrl: string) {
    this.wasmUrl = wasmUrl;
    this.worker = new Worker(workerUrl, { type: "module" });
    this.worker.addEventListener("message", (message: MessageEvent<unknown>) => {
      const reply = parseReply(message.data);
      if (reply !== null) {
        const entry = this.pending.get(reply.id);
        if (entry !== undefined) {
          this.pending.delete(reply.id);
          entry.resolve(reply);
        }
        return;
      }
      const event = parseEvent(message.data);
      if (event !== null) this.listeners.forEach((listener) => listener(event));
    });
    this.worker.addEventListener("error", () => this.fail());
    this.worker.addEventListener("messageerror", () => this.fail());
  }

  onEvent(listener: (event: Event) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<StartData> {
    return this.request("start", { wasmUrl: this.wasmUrl });
  }

  async login(input: CommandMap["login"]): Promise<SessionSummary> {
    return this.request("login", input);
  }

  async loginToken(input: CommandMap["loginToken"]): Promise<SessionSummary> {
    return this.request("loginToken", input);
  }

  async ssoUrl(input: CommandMap["ssoUrl"]): Promise<string> {
    return this.request("ssoUrl", input);
  }

  async register(input: CommandMap["register"]): Promise<ReplyData["register"]> {
    return this.request("register", input);
  }

  async logout(): Promise<null> {
    return this.request("logout", {});
  }

  async keyStatus(): Promise<KeyStatus> {
    return this.request("keyStatus", {});
  }

  async recover(input: CommandMap["recover"]): Promise<KeyStatus> {
    return this.request("recover", input);
  }

  open(roomId: string): void {
    void this.request("open", { roomId }).catch(() => undefined);
  }

  older(roomId: string): void {
    void this.request("older", { roomId }).catch(() => undefined);
  }

  send(
    roomId: string,
    body: string,
    html: string | null,
    replyTo: string | null,
    transactionId: string,
    messageId: string,
    kind: CommandMap["send"]["kind"],
    media: CommandMap["send"]["media"],
  ): Promise<MessageRow> {
    return this.request("send", {
      roomId,
      body,
      html,
      replyTo,
      transactionId,
      messageId,
      kind,
      media,
    });
  }

  retrySend(roomId: string, messageId: string): Promise<MessageRow> {
    return this.request("retrySend", { roomId, messageId });
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
    return this.request("sendMedia", {
      roomId,
      messageId,
      transactionId,
      caption,
      html,
      replyTo,
      kind,
      name,
      file,
    });
  }

  media(roomId: string, messageId: string, variant: MediaVariant): Promise<MediaReply> {
    return this.request("media", { roomId, messageId, variant });
  }

  discardSend(roomId: string, messageId: string): void {
    void this.request("discardSend", { roomId, messageId }).catch(() => undefined);
  }

  markRead(roomId: string, eventId: string): void {
    void this.request("markRead", { roomId, eventId }).catch(() => undefined);
  }

  members(roomId: string): void {
    void this.request("members", { roomId }).catch(() => undefined);
  }

  devices(): Promise<readonly DeviceSession[]> {
    return this.request("devices", {});
  }

  sasStart(deviceId: string | null): Promise<SasState> {
    return this.request("sasStart", { deviceId });
  }

  sasAccept(id: string): Promise<null> {
    return this.request("sasAccept", { id });
  }

  sasConfirm(id: string): Promise<null> {
    return this.request("sasConfirm", { id });
  }

  sasMismatch(id: string): Promise<null> {
    return this.request("sasMismatch", { id });
  }

  sasCancel(id: string): Promise<null> {
    return this.request("sasCancel", { id });
  }

  resetIdentity(password: string): Promise<string | null> {
    return this.request("resetIdentity", { password });
  }

  react(roomId: string, eventId: string, key: string): Promise<null> {
    return this.request("react", { roomId, eventId, key });
  }

  edit(roomId: string, eventId: string, body: string, html: string | null): Promise<null> {
    return this.request("edit", { roomId, eventId, body, html });
  }

  redact(roomId: string, eventId: string): Promise<null> {
    return this.request("redact", { roomId, eventId });
  }

  typing(roomId: string, typing: boolean): Promise<null> {
    return this.request("typing", { roomId, typing });
  }

  search(
    roomIds: readonly string[],
    query: string,
    mediaKinds: readonly MessageKind[],
    limit: number,
  ): Promise<readonly MessageRow[]> {
    return this.request("search", { roomIds, query, mediaKinds, limit });
  }

  leaveRoom(roomId: string): Promise<null> {
    return this.request("leaveRoom", { roomId });
  }

  setRoomTag(roomId: string, tag: CommandMap["setRoomTag"]["tag"], enabled: boolean): Promise<null> {
    return this.request("setRoomTag", { roomId, tag, enabled });
  }

  setNotification(roomId: string, mode: CommandMap["setNotification"]["mode"]): Promise<null> {
    return this.request("setNotification", { roomId, mode });
  }

  setRoomState(roomId: string, patch: RoomStatePatch): Promise<null> {
    return this.request("setRoomState", { roomId, patch });
  }

  inviteUser(roomId: string, userId: string): Promise<null> {
    return this.request("inviteUser", { roomId, userId });
  }

  joinRoom(roomIdOrAlias: string): Promise<string> {
    return this.request("joinRoom", { roomIdOrAlias });
  }

  answerInvite(roomId: string, accept: boolean): Promise<string | null> {
    return this.request("answerInvite", { roomId, accept });
  }

  createRoom(name: string, topic: string, directUserId: string | null): Promise<string> {
    return this.request("createRoom", { name, topic, directUserId });
  }

  forward(
    targetRoomId: string,
    sources: readonly { readonly roomId: string; readonly eventId: string }[],
  ): Promise<null> {
    return this.request("forward", { targetRoomId, sources });
  }

  memberAction(roomId: string, userId: string, action: "kick" | "ban" | "unban"): Promise<null> {
    return this.request("memberAction", { roomId, userId, action });
  }

  dispose(): void {
    this.fail();
    this.worker.terminate();
    this.listeners.clear();
  }

  private request<K extends CommandName>(type: K, payload: CommandMap[K]): Promise<ReplyData[K]> {
    const id = ++this.sequence;
    const guard = REPLY_DATA_GUARDS[type];
    const promise = new Promise<ReplyEnvelope>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.timers.set(
        id,
        window.setTimeout(() => {
          this.pending.delete(id);
          this.timers.delete(id);
          reject(new Error("worker timeout"));
        }, TIMEOUTS[type] ?? DEFAULT_TIMEOUT),
      );
    });
    this.worker.postMessage({ id, type, payload });
    return promise
      .then((reply) => {
        if (!reply.ok) throw new Error(reply.code);
        const data = reply.data;
        if (!guard(data)) throw new Error("worker reply");
        return data;
      })
      .finally(() => {
        const timer = this.timers.get(id);
        if (timer !== undefined) window.clearTimeout(timer);
        this.timers.delete(id);
      });
  }

  private fail(): void {
    const entries = Array.from(this.pending.values());
    this.pending.clear();
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    for (const entry of entries) entry.reject(new Error("worker unavailable"));
  }
}
