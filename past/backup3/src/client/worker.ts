import type { Command, Event, Reply } from "../protocol/messages.ts";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

/** The page's side of the worker: one socket, ids for requests, events for changes. */
export class WorkerClient {
  private worker: Worker | null = null;
  private sequence = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(event: Event) => void>();

  start(): void {
    if (this.worker) return;
    const url = document.querySelector('meta[name="maski:worker"]')?.getAttribute("content") ?? "";
    this.worker = new Worker(url, { type: "module", name: "maski" });
    this.worker.onmessage = (message: MessageEvent<unknown>) => this.receive(message.data);
    this.worker.onerror = (error) => this.emit({ event: "fatal", message: error.message });
  }

  onEvent(listener: (event: Event) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The wasm path is a page-level fact: the worker cannot read this page's tags. */
  wasm(): string {
    return document.querySelector('meta[name="maski:wasm"]')?.getAttribute("content") ?? "";
  }

  send<T>(command: Command): Promise<T> {
    this.start();
    const worker = this.worker;
    if (!worker) throw new Error("the worker is not available");
    this.sequence += 1;
    const id = this.sequence;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      worker.postMessage({ id, command });
    });
  }

  private receive(data: unknown): void {
    if (typeof data !== "object" || data === null) return;
    const reply = data as Reply & { event?: unknown };
    if ("event" in reply && typeof reply.event === "string") {
      this.emit(reply as unknown as Event);
      return;
    }
    const id = (reply as { id: unknown }).id;
    if (typeof id !== "number") return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    const answer = reply as Reply;
    if (answer.ok) pending.resolve(answer.data);
    else pending.reject(new Error(answer.error));
  }

  private emit(event: Event): void {
    for (const listener of this.listeners) listener(event);
  }
}
