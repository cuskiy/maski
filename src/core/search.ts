import type { MessageRow } from "./types.ts";

/** The one text contract for message search and media filters. */
export function messageMatches(message: MessageRow, query: string, mediaKinds?: ReadonlySet<string>): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  if (message.media !== null && mediaKinds?.has(message.media.kind) === true) return true;
  return [message.body, message.senderName, message.media?.name ?? ""].join("\n").toLowerCase().includes(needle);
}
