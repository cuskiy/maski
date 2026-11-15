/**
 * The worker-owned outbox state machine. A row is written before the request and stays until the
 * remote echo replaces it or the reader discards it. An attachment is uploaded at most once: the
 * uploaded reference is persisted before the event send, so a retry only repeats the send.
 */
import type { Media, MessageKind, MessageRow } from "../core/types.ts";
import { queuedRow } from "../core/message.ts";
import { isRecord } from "../lib/json.ts";
import { isMessageRow } from "../protocol/index.ts";
import { WorkerFailure } from "./failure.ts";
import { isMediaReference, type MediaReference } from "./mediaTypes.ts";

export interface OutboxMedia {
  readonly kind: Media["kind"];
  readonly name: string;
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly size: number;
  readonly duration: number | null;
  readonly hash: string;
  readonly blob: Blob;
  readonly previewUrl: string | null;
}

export interface UploadedMedia {
  readonly source: MediaReference;
}

export interface OutboxRecord {
  readonly roomId: string;
  readonly transactionId: string;
  readonly messageId: string;
  readonly replyTo: string | null;
  readonly row: MessageRow;
  readonly retryable: boolean;
  /** The sanitized bytes and metadata; the record is the only place they are stored. */
  readonly media: OutboxMedia | null;
  readonly uploaded: UploadedMedia | null;
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
  readonly media: OutboxMedia | null;
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
  /** Uploads the attachment bytes once; the returned reference is persisted before the send. */
  readonly upload: (record: OutboxRecord) => Promise<UploadedMedia>;
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

const ATTACHMENT_KINDS: ReadonlySet<string> = new Set(["image", "video", "audio", "file", "sticker"]);
const TEXT_KINDS: ReadonlySet<string> = new Set(["text", "notice", "emote"]);

export function isOutboxMedia(value: unknown): value is OutboxMedia {
  return (
    isRecord(value) &&
    typeof value["kind"] === "string" &&
    ATTACHMENT_KINDS.has(value["kind"]) &&
    typeof value["name"] === "string" &&
    typeof value["mime"] === "string" &&
    (value["width"] === null || typeof value["width"] === "number") &&
    (value["height"] === null || typeof value["height"] === "number") &&
    typeof value["size"] === "number" &&
    (value["duration"] === null || typeof value["duration"] === "number") &&
    typeof value["hash"] === "string" &&
    value["blob"] instanceof Blob &&
    (value["previewUrl"] === null || typeof value["previewUrl"] === "string")
  );
}

export function isUploadedMedia(value: unknown): value is UploadedMedia {
  return isRecord(value) && isMediaReference(value["source"]);
}

/** Older records predate the media fields; an absent value reads as null. */
export function isOutboxRecord(value: unknown): value is OutboxRecord {
  if (!isRecord(value)) return false;
  const media = value["media"];
  const uploaded = value["uploaded"];
  return (
    typeof value["roomId"] === "string" &&
    typeof value["transactionId"] === "string" &&
    typeof value["messageId"] === "string" &&
    (value["replyTo"] === null || typeof value["replyTo"] === "string") &&
    isMessageRow(value["row"]) &&
    typeof value["retryable"] === "boolean" &&
    (media === null || media === undefined || isOutboxMedia(media)) &&
    (uploaded === null || uploaded === undefined || isUploadedMedia(uploaded))
  );
}

export function createOutbox(options: OutboxOptions): Outbox {
  const { backend, identity, emit, upload, deliver, now } = options;
  const inFlight = new Set<string>();

  async function deliverRow(record: OutboxRecord): Promise<void> {
    if (!record.retryable || inFlight.has(record.transactionId)) return;
    inFlight.add(record.transactionId);
    try {
      let current = await backend.read(record.messageId);
      if (current === null) return;
      if ((current.media ?? null) !== null && (current.uploaded ?? null) === null) {
        const sending: MessageRow = { ...current.row, status: "sending", error: null, retryable: true };
        await backend.put({ ...current, row: sending });
        emit({ roomId: current.roomId, messageId: current.messageId, row: sending, retryable: true });
        const uploaded = await upload(current);
        const afterUpload = await backend.read(record.messageId);
        if (afterUpload === null) return;
        current = { ...afterUpload, uploaded };
        await backend.put(current);
      }
      const sending: MessageRow = { ...current.row, status: "sending", error: null, retryable: true };
      await backend.put({ ...current, row: sending });
      emit({ roomId: current.roomId, messageId: current.messageId, row: sending, retryable: true });
      const eventId = await deliver({ ...current, row: sending });
      const afterSend = await backend.read(record.messageId);
      if (afterSend === null) return;
      const sent: MessageRow = {
        ...sending,
        eventId,
        status: "sent",
        error: null,
        retryable: false,
      };
      const stored: MessageRow = sent.media === null ? sent : { ...sent, media: { ...sent.media, url: null } };
      await backend.complete(afterSend, stored);
      emit({ roomId: current.roomId, messageId: current.messageId, row: sent, retryable: false });
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
      emit({ roomId: current.roomId, messageId: current.messageId, row: failed, retryable: true });
    } finally {
      inFlight.delete(record.transactionId);
    }
  }

  return {
    async queue(input) {
      const account = identity();
      if (account === null) throw new WorkerFailure("not-signed-in");
      const allowed = input.media !== null ? ATTACHMENT_KINDS.has(input.media.kind) : TEXT_KINDS.has(input.kind);
      const media: Media | null =
        input.media === null
          ? null
          : {
              kind: input.media.kind,
              name: input.media.name,
              width: input.media.width,
              height: input.media.height,
              size: input.media.size,
              url: input.media.previewUrl,
            };
      const row = queuedRow({
        roomId: input.roomId,
        messageId: input.messageId,
        transactionId: input.transactionId,
        body: input.body,
        html: input.html,
        kind: input.kind,
        media,
        reply: null,
        ownUserId: account.userId,
        ownName: account.displayName,
        ts: now(),
        status: allowed ? "queued" : "failed",
        error: allowed ? null : "unavailable",
        retryable: allowed,
      });
      const storedRow: MessageRow = row.media === null ? row : { ...row, media: { ...row.media, url: null } };
      const record: OutboxRecord = {
        roomId: input.roomId,
        transactionId: input.transactionId,
        messageId: input.messageId,
        replyTo: input.replyTo,
        row: storedRow,
        retryable: allowed,
        media: input.media,
        uploaded: null,
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
