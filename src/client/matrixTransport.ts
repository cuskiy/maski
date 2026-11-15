import type { MessageRow, SessionSummary } from "../core/types.ts";
import type {
  CommandMap,
  CommandName,
  Event,
  KeyStatus,
  ReplyData,
  ReplyEnvelope,
  StartData,
} from "../protocol/index.ts";
import { parseEvent, parseReply, REPLY_DATA_GUARDS } from "../protocol/index.ts";

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

  discardSend(roomId: string, messageId: string): void {
    void this.request("discardSend", { roomId, messageId }).catch(() => undefined);
  }

  markRead(roomId: string, eventId: string): void {
    void this.request("markRead", { roomId, eventId }).catch(() => undefined);
  }

  members(roomId: string): void {
    void this.request("members", { roomId }).catch(() => undefined);
  }

  resetIdentity(password: string): Promise<string | null> {
    return this.request("resetIdentity", { password });
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
        }, 30_000),
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
