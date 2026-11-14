import {
  errorInfo,
  isCommandReply,
  isWorkerToClient,
  type CommandReply,
  type WorkerToClient,
} from "../protocol";

export class WorkerError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "WorkerError";
    this.code = code;
    this.retryable = retryable;
  }
}

interface Pending {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
}

export class WorkerClient {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Set<(event: WorkerToClient) => void>();
  private readonly fatalListeners = new Set<(error: Error) => void>();

  // The worker is created on the first command, so the first paint never waits
  // for its chunk or for the wasm inside it.
  private connect(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (message: MessageEvent<unknown>) => this.onMessage(message.data));
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Worker failed");
      for (const listener of this.fatalListeners) listener(error);
    });
    this.worker = worker;
    return worker;
  }

  request<T>(type: string, payload: unknown, timeoutMs = 30000, transfer: Transferable[] = []): Promise<T> {
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timeout =
        timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id);
              reject(new WorkerError("timeout", "The worker did not respond", true));
            }, timeoutMs)
          : null;
      this.pending.set(id, { resolve: (data) => resolve(data as T), reject, timeout });
      try {
        this.connect().postMessage({ id, type, payload }, transfer);
      } catch (error) {
        if (timeout) clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  onEvent(listener: (event: WorkerToClient) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onFatal(listener: (error: Error) => void): () => void {
    this.fatalListeners.add(listener);
    return () => this.fatalListeners.delete(listener);
  }

  ack(revision: number): void {
    this.connect().postMessage({ type: "ack", revision });
  }

  answerUia(requestId: string, auth: Record<string, unknown> | null): void {
    this.connect().postMessage({ type: "uia", requestId, auth });
  }

  cancelUia(requestId: string): void {
    this.connect().postMessage({ type: "uiaCancel", requestId });
  }

  private onMessage(data: unknown): void {
    if (isCommandReply(data)) {
      this.onReply(data);
      return;
    }
    if (!isWorkerToClient(data)) return;
    if (data.type === "delta") this.ack(data.delta.revision);
    if (data.type === "reload") this.ack(data.revision);
    for (const listener of this.listeners) listener(data);
  }

  private onReply(reply: CommandReply): void {
    const pending = this.pending.get(reply.id);
    if (!pending) return;
    this.pending.delete(reply.id);
    if (pending.timeout) clearTimeout(pending.timeout);
    if (reply.ok) {
      pending.resolve(reply.data);
      return;
    }
    const info = reply.error ?? errorInfo(new Error("Worker request failed"));
    pending.reject(new WorkerError(info.code, info.message, info.retryable));
  }
}
