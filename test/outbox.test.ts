import { describe, expect, it, vi } from "vitest";
import { retryable, OutboxSender } from "../src/matrix/outbox";
import { messageContent, redactionContent } from "../src/matrix/compose";
import type { OutboxRecord } from "../src/data/records";

describe("retryable", () => {
  it("retries transport failures and temporary server errors", () => {
    expect(retryable(new Error("Failed to fetch"))).toBe(true);
    expect(retryable({ errcode: "M_LIMIT_EXCEEDED" })).toBe(true);
    expect(retryable({ errcode: "M_UNKNOWN" })).toBe(true);
  });

  it("does not retry a rejected event", () => {
    expect(retryable({ errcode: "M_FORBIDDEN" })).toBe(false);
    expect(retryable({ errcode: "M_BAD_JSON" })).toBe(false);
  });
});

function row(txnId: string, roomId: string): OutboxRecord {
  return {
    txnId,
    roomId,
    eventType: "m.room.message",
    content: { body: txnId },
    blob: null,
    media: null,
    createdAt: 0,
    attempts: 0,
    nextAttemptAt: 0,
    status: "pending",
    error: null,
    eventId: null,
  };
}

describe("outbox sender", () => {
  it("sends one message per room and reports it", async () => {
    const events: string[] = [];
    const sender = new OutboxSender({
      post: (event) => events.push(event.type === "outbox" ? `${event.txnId}:${event.status}` : event.type),
      readRow: (txnId) => Promise.resolve(row(txnId, "!a")),
      deliver: () => Promise.resolve("$event"),
      maxAttempts: 3,
    });
    await sender.enqueue("t1");
    await sender.enqueue("t2");
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events).toEqual(["t1:sent", "t2:sent"]);
  });

  it("cancels a queued send", async () => {
    const events: string[] = [];
    const sender = new OutboxSender({
      post: (event) => events.push(event.type === "outbox" ? `${event.txnId}:${event.status}` : event.type),
      readRow: (txnId) => Promise.resolve(row(txnId, "!a")),
      deliver: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return "$event";
      },
      maxAttempts: 3,
    });
    await sender.enqueue("t1");
    await sender.enqueue("t2");
    expect(sender.cancel("t2")).toBe(true);
    await vi.waitFor(() => expect(events).toEqual(["t1:sent"]));
  });
});

describe("message content", () => {
  it("mentions the replied to sender and keeps the reply relation", () => {
    expect(
      messageContent({
        body: "hi",
        formattedBody: null,
        replyTo: { eventId: "$parent", senderId: "@alice:example.org" },
        editTarget: null,
      }),
    ).toEqual({
      msgtype: "m.text",
      body: "hi",
      "m.mentions": { user_ids: ["@alice:example.org"] },
      "m.relates_to": { "m.in_reply_to": { event_id: "$parent" } },
    });
  });

  it("always carries an empty mentions object", () => {
    expect(messageContent({ body: "hi", formattedBody: null, replyTo: null, editTarget: null })["m.mentions"]).toEqual({});
  });

  it("prefixes the edit fallback body and keeps the real content", () => {
    const content = messageContent({
      body: "fixed",
      formattedBody: "<strong>fixed</strong>",
      replyTo: null,
      editTarget: "$target",
    });
    expect(content["body"]).toBe("* fixed");
    expect(content["m.relates_to"]).toEqual({ rel_type: "m.replace", event_id: "$target" });
    expect(content["m.new_content"]).toMatchObject({
      body: "fixed",
      formatted_body: "<strong>fixed</strong>",
    });
  });

  it("names the redaction target", () => {
    expect(redactionContent("$event", null)).toEqual({ redacts: "$event" });
    expect(redactionContent("$event", "why")).toEqual({ redacts: "$event", reason: "why" });
  });
});
