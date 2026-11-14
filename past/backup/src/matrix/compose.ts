export interface OutgoingMessage {
  body: string;
  formattedBody: string | null;
  replyTo: { eventId: string; senderId: string } | null;
  editTarget: string | null;
}

// Spec: a replacement's own body is the fallback, prefixed, and the real content
// lives in m.new_content; m.mentions is always present so older push rules do not
// re-read the body. See client-server-api event_replacements, rich_replies, mentions.
export function messageContent(message: OutgoingMessage): Record<string, unknown> {
  const content = bodyContent(message.body, message.formattedBody);
  const mentions: Record<string, unknown> = {};
  if (message.replyTo?.senderId) mentions["user_ids"] = [message.replyTo.senderId];
  content["m.mentions"] = mentions;
  if (message.replyTo) {
    content["m.relates_to"] = { "m.in_reply_to": { event_id: message.replyTo.eventId } };
  }
  if (!message.editTarget) return content;
  return {
    msgtype: content["msgtype"],
    body: `* ${message.body}`,
    "m.new_content": content,
    "m.relates_to": { rel_type: "m.replace", event_id: message.editTarget },
  };
}

export function redactionContent(eventId: string, reason: string | null): Record<string, unknown> {
  return { redacts: eventId, ...(reason ? { reason } : {}) };
}

function bodyContent(body: string, formattedBody: string | null): Record<string, unknown> {
  return {
    msgtype: "m.text",
    body,
    ...(formattedBody ? { format: "org.matrix.custom.html", formatted_body: formattedBody } : {}),
  };
}
