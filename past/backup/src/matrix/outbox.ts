import type { OutboxRecord } from "../data/records";
import { errorInfo, isRecord, type WorkerToClient } from "../protocol";

export interface OutboxSenderOptions {
  post: (event: WorkerToClient) => void;
  readRow: (txnId: string) => Promise<OutboxRecord | null>;
  deliver: (row: OutboxRecord) => Promise<string>;
  maxAttempts: number;
}

interface Queued {
  txnId: string;
  roomId: string;
}

// One message in flight per room, retried with backoff, so a queued send survives
// a dropped connection without the main thread scheduling anything.
export class OutboxSender {
  private readonly options: OutboxSenderOptions;
  private readonly queued: Queued[] = [];
  private readonly activeRooms = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly attempts = new Map<string, number>();

  constructor(options: OutboxSenderOptions) {
    this.options = options;
  }

  async enqueue(txnId: string): Promise<void> {
    if (this.timers.has(txnId) || this.queued.some((entry) => entry.txnId === txnId)) return;
    const row = await this.options.readRow(txnId);
    if (!row) return;
    this.queued.push({ txnId, roomId: row.roomId });
    this.pump();
  }

  retryNow(): void {
    for (const [txnId, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(txnId);
      void this.enqueue(txnId);
    }
  }

  cancel(txnId: string): boolean {
    const timer = this.timers.get(txnId);
    const index = this.queued.findIndex((entry) => entry.txnId === txnId);
    if (!timer && index < 0) return false;
    if (timer) clearTimeout(timer);
    if (index >= 0) this.queued.splice(index, 1);
    this.timers.delete(txnId);
    this.attempts.delete(txnId);
    return true;
  }

  private pump(): void {
    const ready = this.queued.filter(
      (entry, index) =>
        !this.activeRooms.has(entry.roomId) &&
        this.queued.findIndex((item) => item.roomId === entry.roomId) === index,
    );
    for (const entry of ready) {
      const index = this.queued.indexOf(entry);
      if (index < 0) continue;
      this.queued.splice(index, 1);
      this.activeRooms.add(entry.roomId);
      void this.run(entry);
    }
  }

  private async run(entry: Queued): Promise<void> {
    try {
      const row = await this.options.readRow(entry.txnId);
      if (!row) return;
      const eventId = await this.options.deliver(row);
      this.attempts.delete(entry.txnId);
      this.options.post({ type: "outbox", txnId: entry.txnId, status: "sent", eventId });
    } catch (error) {
      this.failed(entry, error);
    } finally {
      this.activeRooms.delete(entry.roomId);
      this.pump();
    }
  }

  private failed(entry: Queued, error: unknown): void {
    const info = errorInfo(error, "network");
    const attempts = (this.attempts.get(entry.txnId) ?? 0) + 1;
    if (!retryable(error) || attempts >= this.options.maxAttempts) {
      this.attempts.delete(entry.txnId);
      this.options.post({
        type: "outbox",
        txnId: entry.txnId,
        status: "failed",
        error: info.message,
        attempts,
      });
      return;
    }
    this.attempts.set(entry.txnId, attempts);
    this.options.post({
      type: "outbox",
      txnId: entry.txnId,
      status: "pending",
      error: info.message,
      attempts,
    });
    this.timers.set(
      entry.txnId,
      setTimeout(() => {
        this.timers.delete(entry.txnId);
        void this.enqueue(entry.txnId);
      }, backoff(attempts)),
    );
  }
}

function backoff(attempts: number): number {
  return Math.min(1000 * 2 ** (attempts - 1), 30_000);
}

// A transport failure or a temporary server condition is worth another attempt;
// a rejected event is not.
export function retryable(error: unknown): boolean {
  const code = isRecord(error) && typeof error["errcode"] === "string" ? error["errcode"] : null;
  if (!code) return true;
  return (
    code === "M_LIMIT_EXCEEDED" ||
    code === "M_UNKNOWN" ||
    code === "M_RESOURCE_LIMIT_EXCEEDED" ||
    code === "M_USER_LIMIT_EXCEEDED"
  );
}
