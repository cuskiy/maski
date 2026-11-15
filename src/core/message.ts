import type { Media, MessageKind, MessageRow, ReplyRef } from "./types.ts";

export interface QueuedMessage {
  readonly roomId: string;
  readonly messageId: string;
  readonly transactionId: string;
  readonly body: string;
  readonly html: string | null;
  readonly kind: MessageKind;
  readonly media: Media | null;
  readonly reply: ReplyRef | null;
  readonly ownUserId: string;
  readonly ownName: string;
  readonly ts: number;
  readonly status?: "queued" | "sending" | "failed";
  readonly error?: string | null;
  readonly retryable?: boolean;
}

/** The row the worker writes before it sends, and the row the client first renders. */
export function queuedRow(input: QueuedMessage): MessageRow {
  return {
    id: input.messageId,
    eventId: null,
    transactionId: input.transactionId,
    roomId: input.roomId,
    sender: input.ownUserId,
    senderName: input.ownName,
    senderAvatar: null,
    ts: input.ts,
    own: true,
    kind: input.kind,
    body: input.body,
    html: input.html,
    media: input.media,
    reactions: [],
    reply: input.reply,
    mentions: [],
    edited: false,
    redacted: false,
    status: input.status ?? "queued",
    error: input.error ?? null,
    retryable: input.retryable ?? true,
    system: false,
    encryption: { state: "ok" },
  };
}

/** A redacted event keeps its identity and sender but loses all renderable content. */
export function redactRow(row: MessageRow): MessageRow {
  return {
    ...row,
    body: "",
    html: null,
    media: null,
    reactions: [],
    reply: null,
    mentions: [],
    edited: false,
    redacted: true,
    status: "sent",
    error: null,
    retryable: false,
    encryption: { state: "ok" },
  };
}
