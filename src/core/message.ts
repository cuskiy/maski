import type { MessageRow } from "./types.ts";

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
    encryption: { state: "ok" },
  };
}
