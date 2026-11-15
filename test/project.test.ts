import assert from "node:assert/strict";
import test from "node:test";
import type { MatrixEvent, Room, RoomMember } from "matrix-js-sdk";
import { forwardableEvent, projectMessage } from "../src/worker/project.ts";

const ROOM = "!r:example.org";
const OWN = "@alice:example.org";

interface EventInput {
  readonly type?: string;
  readonly id?: string;
  readonly sender?: string;
  readonly ts?: number;
  readonly content?: Record<string, unknown>;
  readonly relation?: { readonly rel_type: string; readonly event_id?: string; readonly key?: string } | null;
  readonly redacted?: boolean;
  readonly replacement?: MatrixEvent;
  readonly replyTo?: string;
}

function fakeEvent(input: EventInput = {}): MatrixEvent {
  // The fake exposes exactly the SDK methods the projection reads.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return {
    getType: () => input.type ?? "m.room.message",
    getContent: () => input.content ?? { msgtype: "m.text", body: "hello" },
    getRelation: () => input.relation ?? null,
    getId: () => ("id" in input ? input.id : "$e:example.org"),
    getTs: () => input.ts ?? 1_000,
    getSender: () => input.sender ?? "@bob:example.org",
    getUnsigned: () => ({}),
    getTxnId: () => undefined,
    isEncrypted: () => false,
    isDecryptionFailure: () => false,
    decryptionFailureReason: undefined,
    isRedacted: () => input.redacted === true,
    replacingEvent: () => input.replacement ?? null,
    replyEventId: input.replyTo,
    // The fake exposes exactly the SDK methods the projection reads.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  } as unknown as MatrixEvent;
}

function fakeRoom(children: readonly MatrixEvent[] = [], events: ReadonlyMap<string, MatrixEvent> = new Map()): Room {
  // The fake exposes exactly the SDK members the projection reads.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return {
    roomId: ROOM,
    relations: { getAllChildEventsForEvent: () => [...children] },
    findEventById: (eventId: string) => events.get(eventId),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    getMember: (userId: string) => ({ userId, name: userId === OWN ? "Alice" : "Bob" }) as unknown as RoomMember,
    // The fake exposes exactly the SDK members the projection reads.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  } as unknown as Room;
}

function reaction(sender: string, key: string, redacted = false): MatrixEvent {
  return fakeEvent({
    type: "m.reaction",
    sender,
    content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$target:example.org", key } },
    relation: { rel_type: "m.annotation", event_id: "$target:example.org", key },
    redacted,
  });
}

void test("reactions aggregate once per sender and a redacted reaction removes it", () => {
  const target = fakeEvent({ id: "$target:example.org", content: { msgtype: "m.text", body: "hi" } });
  const empty = projectMessage(fakeRoom(), target, OWN);
  assert.deepEqual(empty?.reactions, []);

  const bob = reaction("@bob:example.org", "👍");
  const alice = reaction(OWN, "👍");
  const added = projectMessage(fakeRoom([bob, alice]), target, OWN);
  assert.deepEqual(added?.reactions, [{ key: "👍", count: 2, mine: true }]);

  const removed = projectMessage(fakeRoom([bob, reaction(OWN, "👍", true)]), target, OWN);
  assert.deepEqual(removed?.reactions, [{ key: "👍", count: 1, mine: false }]);
});

void test("an edit re-projects the original row from the replacement content", () => {
  const replacement = fakeEvent({
    id: "$edit:example.org",
    sender: OWN,
    relation: { rel_type: "m.replace", event_id: "$target:example.org" },
    content: {
      msgtype: "m.text",
      body: "new",
      formatted_body: "<b>new</b>",
      "m.mentions": { user_ids: ["@bob:example.org"] },
    },
  });
  const original = fakeEvent({
    id: "$target:example.org",
    content: { msgtype: "m.text", body: "old" },
    replacement,
  });
  const row = projectMessage(fakeRoom(), original, OWN);
  assert.equal(row?.edited, true);
  assert.equal(row?.body, "new");
  assert.equal(row?.html, "<b>new</b>");
  assert.deepEqual(row?.mentions, ["@bob:example.org"]);

  const editEvent = projectMessage(fakeRoom(), replacement, OWN);
  assert.equal(editEvent, null);
});

void test("a redaction keeps a tombstone row and clears renderable fields", () => {
  const target = fakeEvent({
    id: "$target:example.org",
    redacted: true,
    content: {},
    relation: null,
    replyTo: "$parent:example.org",
  });
  const row = projectMessage(fakeRoom([reaction(OWN, "👍")], new Map([["$target:example.org", target]])), target, OWN);
  assert.equal(row?.redacted, true);
  assert.equal(row?.body, "");
  assert.equal(row?.html, null);
  assert.equal(row?.media, null);
  assert.deepEqual(row?.reactions, []);
  assert.equal(row?.reply, null);
  assert.deepEqual(row?.mentions, []);
  assert.equal(row?.status, "sent");
});

void test("a forward uses the replacement content and drops source relations", () => {
  const replacement = fakeEvent({
    content: {
      msgtype: "m.text",
      body: "new",
      "m.relates_to": { rel_type: "m.replace", event_id: "$original:example.org" },
      "m.mentions": { user_ids: ["@bob:example.org"] },
    },
  });
  const original = fakeEvent({
    content: { msgtype: "m.text", body: "old" },
    replacement,
  });
  const forwarded = forwardableEvent(original);
  assert.equal(forwarded?.kind, "message");
  assert.equal(forwarded?.content.body, "new");
  assert.equal("m.relates_to" in (forwarded?.content ?? {}), false);
  assert.equal("m.mentions" in (forwarded?.content ?? {}), false);
});
