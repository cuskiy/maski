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

void test("the protocol parses the daily-use command shapes and rejects bad fields", () => {
  const roomId = "!a:example.org";
  assert.deepEqual(parseCommand({ id: 20, type: "react", payload: { roomId, eventId: "$e", key: "👍" } }), {
    id: 20,
    type: "react",
    payload: { roomId, eventId: "$e", key: "👍" },
  });
  assert.equal(parseCommand({ id: 20, type: "react", payload: { roomId, eventId: "$e", key: "" } }), null);
  assert.deepEqual(
    parseCommand({ id: 21, type: "edit", payload: { roomId, eventId: "$e", body: "new", html: null } }),
    { id: 21, type: "edit", payload: { roomId, eventId: "$e", body: "new", html: null } },
  );
  assert.equal(parseCommand({ id: 21, type: "edit", payload: { roomId, eventId: "$e", body: "new" } }), null);
  assert.deepEqual(parseCommand({ id: 22, type: "redact", payload: { roomId, eventId: "$e" } }), {
    id: 22,
    type: "redact",
    payload: { roomId, eventId: "$e" },
  });
  assert.deepEqual(parseCommand({ id: 23, type: "typing", payload: { roomId, typing: false } }), {
    id: 23,
    type: "typing",
    payload: { roomId, typing: false },
  });
  assert.equal(parseCommand({ id: 23, type: "typing", payload: { roomId, typing: "yes" } }), null);
  assert.deepEqual(
    parseCommand({
      id: 24,
      type: "search",
      payload: { roomIds: [roomId], query: "hi", mediaKinds: ["image"], limit: 10 },
    }),
    {
      id: 24,
      type: "search",
      payload: { roomIds: [roomId], query: "hi", mediaKinds: ["image"], limit: 10 },
    },
  );
  assert.equal(
    parseCommand({ id: 24, type: "search", payload: { roomIds: [], query: "hi", mediaKinds: [], limit: 10 } }),
    null,
  );
  assert.equal(
    parseCommand({
      id: 24,
      type: "search",
      payload: { roomIds: [roomId], query: "hi", mediaKinds: [], limit: 0 },
    }),
    null,
  );
  assert.equal(
    parseCommand({
      id: 24,
      type: "search",
      payload: { roomIds: [roomId], query: "hi", mediaKinds: ["nope"], limit: 10 },
    }),
    null,
  );
  assert.deepEqual(parseCommand({ id: 25, type: "leaveRoom", payload: { roomId } }), {
    id: 25,
    type: "leaveRoom",
    payload: { roomId },
  });
  assert.deepEqual(
    parseCommand({ id: 26, type: "setRoomTag", payload: { roomId, tag: "m.favourite", enabled: true } }),
    {
      id: 26,
      type: "setRoomTag",
      payload: { roomId, tag: "m.favourite", enabled: true },
    },
  );
  assert.equal(parseCommand({ id: 26, type: "setRoomTag", payload: { roomId, tag: "m.other", enabled: true } }), null);
  assert.deepEqual(parseCommand({ id: 27, type: "setNotification", payload: { roomId, mode: "mute" } }), {
    id: 27,
    type: "setNotification",
    payload: { roomId, mode: "mute" },
  });
  assert.equal(parseCommand({ id: 27, type: "setNotification", payload: { roomId, mode: "off" } }), null);
  assert.deepEqual(parseCommand({ id: 28, type: "setRoomState", payload: { roomId, patch: { name: "Name" } } }), {
    id: 28,
    type: "setRoomState",
    payload: { roomId, patch: { name: "Name" } },
  });
  assert.deepEqual(
    parseCommand({
      id: 28,
      type: "setRoomState",
      payload: { roomId, patch: { joinRule: "public", directoryPublished: true } },
    }),
    { id: 28, type: "setRoomState", payload: { roomId, patch: { joinRule: "public", directoryPublished: true } } },
  );
  assert.equal(parseCommand({ id: 28, type: "setRoomState", payload: { roomId, patch: {} } }), null);
  assert.equal(parseCommand({ id: 28, type: "setRoomState", payload: { roomId, patch: { unknown: 1 } } }), null);
  assert.equal(parseCommand({ id: 28, type: "setRoomState", payload: { roomId, patch: { joinRule: "bogus" } } }), null);
  assert.deepEqual(parseCommand({ id: 29, type: "inviteUser", payload: { roomId, userId: "@bob:example.org" } }), {
    id: 29,
    type: "inviteUser",
    payload: { roomId, userId: "@bob:example.org" },
  });
  assert.equal(parseCommand({ id: 29, type: "inviteUser", payload: { roomId, userId: "bob" } }), null);
  assert.deepEqual(parseCommand({ id: 30, type: "joinRoom", payload: { roomIdOrAlias: "#room:example.org" } }), {
    id: 30,
    type: "joinRoom",
    payload: { roomIdOrAlias: "#room:example.org" },
  });
  assert.equal(parseCommand({ id: 30, type: "joinRoom", payload: { roomIdOrAlias: "room" } }), null);
  assert.deepEqual(parseCommand({ id: 31, type: "answerInvite", payload: { roomId, accept: true } }), {
    id: 31,
    type: "answerInvite",
    payload: { roomId, accept: true },
  });
  assert.deepEqual(
    parseCommand({ id: 32, type: "createRoom", payload: { name: "Room", topic: "", directUserId: null } }),
    { id: 32, type: "createRoom", payload: { name: "Room", topic: "", directUserId: null } },
  );
  assert.equal(
    parseCommand({ id: 32, type: "createRoom", payload: { name: "", topic: "", directUserId: "bob" } }),
    null,
  );
  assert.deepEqual(
    parseCommand({
      id: 33,
      type: "forward",
      payload: { targetRoomId: roomId, sources: [{ roomId, eventId: "$e" }] },
    }),
    { id: 33, type: "forward", payload: { targetRoomId: roomId, sources: [{ roomId, eventId: "$e" }] } },
  );
  assert.equal(parseCommand({ id: 33, type: "forward", payload: { targetRoomId: roomId, sources: [] } }), null);
  assert.deepEqual(
    parseCommand({ id: 34, type: "memberAction", payload: { roomId, userId: "@bob:example.org", action: "kick" } }),
    { id: 34, type: "memberAction", payload: { roomId, userId: "@bob:example.org", action: "kick" } },
  );
  assert.equal(
    parseCommand({ id: 34, type: "memberAction", payload: { roomId, userId: "@bob:example.org", action: "warn" } }),
    null,
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
  assert.deepEqual(parseEvent({ type: "typing", payload: { roomId: "!a:example.org", userIds: ["@b:example.org"] } }), {
    type: "typing",
    payload: { roomId: "!a:example.org", userIds: ["@b:example.org"] },
  });
  assert.equal(parseEvent({ type: "typing", payload: { roomId: "!a:example.org", userIds: [1] } }), null);
  assert.equal(parseEvent({ type: "unknown", payload: {} }), null);
});
