import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand, parseEvent, parseReply, PROTOCOL_VERSION } from "../src/protocol/index.ts";

void test("the protocol parses the command set and rejects malformed input", () => {
  assert.equal(PROTOCOL_VERSION, 1);
  assert.deepEqual(parseCommand({ id: 1, type: "start", payload: { wasmUrl: "/a.wasm" } }), {
    id: 1,
    type: "start",
    payload: { wasmUrl: "/a.wasm" },
  });
  assert.deepEqual(
    parseCommand({
      id: 2,
      type: "login",
      payload: { homeserver: "https://example.org", username: "alice", password: "secret" },
    }),
    {
      id: 2,
      type: "login",
      payload: { homeserver: "https://example.org", username: "alice", password: "secret" },
    },
  );
  assert.equal(parseCommand({ id: 3, type: "logout", payload: {} })?.type, "logout");
  assert.equal(parseCommand({ id: 4, type: "keyStatus", payload: {} })?.type, "keyStatus");
  assert.deepEqual(parseCommand({ id: 6, type: "recover", payload: { recoveryKey: "EsT", passphrase: "" } }), {
    id: 6,
    type: "recover",
    payload: { recoveryKey: "EsT", passphrase: "" },
  });
  assert.equal(parseCommand({ id: 6, type: "recover", payload: { recoveryKey: "EsT" } }), null);
  assert.equal(parseCommand({ id: 0, type: "logout", payload: {} }), null);
  assert.equal(parseCommand({ id: 1, type: "unknown", payload: {} }), null);
  assert.equal(parseCommand({ id: 1, type: "start", payload: {} }), null);
  assert.equal(parseCommand({ id: 1, type: "login", payload: { homeserver: "x" } }), null);
  assert.equal(parseCommand({ id: 1, type: "logout", payload: { extra: true } }), null);
  assert.deepEqual(
    parseCommand({
      id: 5,
      type: "send",
      payload: {
        roomId: "!a:example.org",
        body: "hi",
        html: "<b>hi</b>",
        replyTo: "$event",
        transactionId: "t1",
        messageId: "m1",
        kind: "text",
        media: null,
      },
    }),
    {
      id: 5,
      type: "send",
      payload: {
        roomId: "!a:example.org",
        body: "hi",
        html: "<b>hi</b>",
        replyTo: "$event",
        transactionId: "t1",
        messageId: "m1",
        kind: "text",
        media: null,
      },
    },
  );
  assert.equal(
    parseCommand({
      id: 6,
      type: "send",
      payload: { roomId: "!a:example.org", body: "hi", transactionId: "t1", messageId: "m1" },
    }),
    null,
  );
  assert.deepEqual(
    parseCommand({
      id: 7,
      type: "retrySend",
      payload: { roomId: "!a:example.org", messageId: "m1" },
    }),
    { id: 7, type: "retrySend", payload: { roomId: "!a:example.org", messageId: "m1" } },
  );
  assert.deepEqual(
    parseCommand({
      id: 8,
      type: "discardSend",
      payload: { roomId: "!a:example.org", messageId: "m1" },
    }),
    { id: 8, type: "discardSend", payload: { roomId: "!a:example.org", messageId: "m1" } },
  );
});

void test("inbound worker messages are parsed before they reach the store", () => {
  assert.deepEqual(parseReply({ id: 1, ok: true, data: null }), { id: 1, ok: true, data: null });
  assert.equal(parseReply({ id: 1, ok: true }), null);
  assert.equal(parseReply({ id: 1, ok: false, code: "unknown" }), null);
  assert.deepEqual(parseEvent({ type: "connection", payload: "online" }), {
    type: "connection",
    payload: "online",
  });
  assert.equal(parseEvent({ type: "connection", payload: "maybe" }), null);
  assert.equal(parseEvent({ type: "rooms", payload: { rooms: "none", loading: true } }), null);
  assert.equal(parseEvent({ type: "unknown", payload: {} }), null);
});
