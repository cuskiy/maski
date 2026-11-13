import type { Command, Event, Reply } from "../protocol/messages.ts";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class WorkerClient {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(event: Event) => void>();

  start(): void {
    if (this.worker) return;
    this.worker = new Worker(new URL("../worker/worker.ts", import.meta.url), { type: "module", name: "maski-matrix" });
    this.worker.onmessage = (message: MessageEvent<unknown>) => this.receive(message.data);
    this.worker.onerror = (event) => {
      this.emit({ event: "fatal", message: event.message || "worker failed" });
    };
    this.worker.onmessageerror = () => {
      this.emit({ event: "fatal", message: "worker message could not be decoded" });
    };
  }

  onEvent(listener: (event: Event) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async send<T>(command: Command, timeoutMs = 60000): Promise<T> {
    this.start();
    const worker = this.worker;
    if (!worker) throw new Error("worker is not available");
    const id = (this.sequence += 1);
    return new Promise<T>((resolve, reject) => {
      const timer = command.type === "start" ? 0 : window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("the client did not answer"));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          window.clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      });
      worker.postMessage({ id, command }, transferOf(command));
    });
  }

  private receive(data: unknown): void {
    if (typeof data !== "object" || data === null) return;
    const envelope = data as Reply & { event?: unknown; id?: unknown };
    if (typeof envelope.id === "number") {
      const entry = this.pending.get(envelope.id);
      if (!entry) return;
      this.pending.delete(envelope.id);
      if (envelope.ok) entry.resolve(envelope.data);
      else entry.reject(new Error(envelope.error.message));
      return;
    }
    if (typeof envelope.event === "string") this.emit(envelope as unknown as Event);
  }

  private emit(event: Event): void {
    for (const listener of this.listeners) listener(event);
  }
}

function transferOf(command: Command): Transferable[] {
  return command.type === "sendFile" || command.type === "uploadAvatar" ? [command.data] : [];
}
