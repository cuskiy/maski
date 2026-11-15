/**
 * The worker-owned outbox state machine. A row is written before the request and stays until the
 * remote echo replaces it or the reader discards it. The store is injected so this module is pure
 * enough to test without an SDK or IndexedDB.
 */
import type { Media, MessageKind, MessageRow } from "../core/types.ts";
import { queuedRow } from "../core/message.ts";
import { WorkerFailure } from "./failure.ts";

export interface OutboxRecord {
  readonly roomId: string;
  readonly transactionId: string;
  readonly messageId: string;
  readonly replyTo: string | null;
  readonly row: MessageRow;
  readonly retryable: boolean;
}

export interface OutboxBackend {
  put(record: OutboxRecord): Promise<void>;
  read(messageId: string): Promise<OutboxRecord | null>;
  readByTransaction(transactionId: string): Promise<OutboxRecord | null>;
  list(roomId?: string): Promise<readonly OutboxRecord[]>;
  remove(transactionId: string): Promise<void>;
  /** Removes the queue row and stores the sent echo as an ordinary event row in one transaction. */
  complete(record: OutboxRecord, row: MessageRow): Promise<void>;
}

export interface OutboxEvent {
  readonly roomId: string;
  readonly messageId: string;
  readonly row: MessageRow | null;
  readonly retryable: boolean;
}

export interface OutboxInput {
  readonly roomId: string;
  readonly messageId: string;
  readonly transactionId: string;
  readonly body: string;
  readonly html: string | null;
  readonly kind: MessageKind;
  readonly media: Media | null;
  readonly replyTo: string | null;
}

export interface OutboxIdentity {
  readonly userId: string;
  readonly displayName: string;
}

export interface OutboxOptions {
  readonly backend: OutboxBackend;
  readonly identity: () => OutboxIdentity | null;
  readonly emit: (event: OutboxEvent) => void;
  readonly deliver: (record: OutboxRecord) => Promise<string>;
  readonly now: () => number;
}

export interface Outbox {
  queue(input: OutboxInput): Promise<MessageRow>;
  deliver(messageId: string): Promise<void>;
  retry(messageId: string): Promise<MessageRow | null>;
  discard(messageId: string): Promise<void>;
  reconcile(echo: MessageRow): Promise<boolean>;
  resume(): Promise<readonly MessageRow[]>;
  rows(roomId: string): Promise<readonly MessageRow[]>;
}

export function createOutbox(options: OutboxOptions): Outbox {
  const { backend, identity, emit, deliver, now } = options;
  const inFlight = new Set<string>();

  async function deliverRow(record: OutboxRecord): Promise<void> {
    if (!record.retryable || inFlight.has(record.transactionId)) return;
    inFlight.add(record.transactionId);
    const sending: MessageRow = { ...record.row, status: "sending", error: null, retryable: true };
    await backend.put({ ...record, row: sending });
    emit({ roomId: record.roomId, messageId: record.messageId, row: sending, retryable: true });
    try {
      const eventId = await deliver(record);
      const current = await backend.read(record.messageId);
      if (current === null) return;
      const sent: MessageRow = {
        ...sending,
        eventId,
        status: "sent",
        error: null,
        retryable: false,
      };
      await backend.complete(current, sent);
      emit({ roomId: record.roomId, messageId: record.messageId, row: sent, retryable: false });
    } catch (error) {
      const current = await backend.read(record.messageId);
      if (current === null) return;
      const failed: MessageRow = {
        ...current.row,
        status: "failed",
        error: error instanceof WorkerFailure ? error.code : "network",
        retryable: true,
      };
      await backend.put({ ...current, row: failed, retryable: true });
      emit({ roomId: record.roomId, messageId: record.messageId, row: failed, retryable: true });
    } finally {
      inFlight.delete(record.transactionId);
    }
  }

  return {
    async queue(input) {
      const account = identity();
      if (account === null) throw new WorkerFailure("not-signed-in");
      const allowed =
        input.media === null && (input.kind === "text" || input.kind === "notice" || input.kind === "emote");
      const row = queuedRow({
        roomId: input.roomId,
        messageId: input.messageId,
        transactionId: input.transactionId,
        body: input.body,
        html: input.html,
        kind: input.kind,
        media: input.media === null ? null : { ...input.media, url: null },
        reply: null,
        ownUserId: account.userId,
        ownName: account.displayName,
        ts: now(),
        status: allowed ? "queued" : "failed",
        error: allowed ? null : "unavailable",
        retryable: allowed,
      });
      const record: OutboxRecord = {
        roomId: input.roomId,
        transactionId: input.transactionId,
        messageId: input.messageId,
        replyTo: input.replyTo,
        row,
        retryable: allowed,
      };
      await backend.put(record);
      emit({ roomId: input.roomId, messageId: input.messageId, row, retryable: allowed });
      return row;
    },

    async deliver(messageId) {
      const record = await backend.read(messageId);
      if (record === null) return;
      await deliverRow(record);
    },

    async retry(messageId) {
      const record = await backend.read(messageId);
      if (record === null) return null;
      if (!record.retryable) return record.row;
      const row: MessageRow = { ...record.row, status: "queued", error: null, retryable: true };
      await backend.put({ ...record, row });
      emit({ roomId: record.roomId, messageId, row, retryable: true });
      return row;
    },

    async discard(messageId) {
      const record = await backend.read(messageId);
      if (record === null) return;
      await backend.remove(record.transactionId);
      emit({ roomId: record.roomId, messageId, row: null, retryable: false });
    },

    async reconcile(echo) {
      const transactionId = echo.transactionId;
      if (transactionId === null) return false;
      const record = await backend.readByTransaction(transactionId);
      if (record === null) return false;
      const replaced: MessageRow = {
        ...record.row,
        ...echo,
        id: record.row.id,
        transactionId,
        status: "sent",
        error: null,
        retryable: false,
      };
      await backend.complete(record, replaced);
      emit({ roomId: record.roomId, messageId: record.messageId, row: replaced, retryable: false });
      return true;
    },

    async resume() {
      const records = await backend.list();
      const rows: MessageRow[] = [];
      for (const record of records) {
        if (record.row.status !== "queued" && record.row.status !== "sending") {
          rows.push(record.row);
          continue;
        }
        const row: MessageRow = {
          ...record.row,
          status: "failed",
          error: "restart",
          retryable: record.retryable,
        };
        await backend.put({ ...record, row });
        emit({ roomId: record.roomId, messageId: record.messageId, row, retryable: record.retryable });
        rows.push(row);
      }
      return rows;
    },

    async rows(roomId) {
      const records = await backend.list(roomId);
      return records.map((record) => record.row);
    },
  };
}
