import assert from "node:assert/strict";
import test from "node:test";
import { queuedRow } from "../src/core/message.ts";
import type { MessageRow, SessionSummary } from "../src/core/types.ts";
import type { CommandMap, KeyStatus, StartData } from "../src/protocol/index.ts";
import { createWorkerApi } from "../src/worker/api.ts";
import { WorkerFailure } from "../src/worker/failure.ts";
import type { SessionPort } from "../src/worker/ports.ts";

const session: SessionSummary = {
  userId: "@alice:example.org",
  displayName: "Alice",
  avatar: null,
  capabilities: { recoveryKey: false, backup: false, signOut: true, signOutOthers: true },
  stickerPacks: [],
};

const startData: StartData = { session: null, connection: "offline", key: "missing" };

const sentRow: MessageRow = queuedRow({
  roomId: "!a:example.org",
  messageId: "m1",
  transactionId: "t1",
  body: "hi",
  html: null,
  kind: "text",
  media: null,
  reply: null,
  ownUserId: session.userId,
  ownName: session.displayName,
  ts: 1,
});

function fakePort(calls: string[]): SessionPort {
  return {
    async start(_input: CommandMap["start"]) {
      calls.push("start");
      return startData;
    },
    async login(_input: CommandMap["login"]) {
      calls.push("login");
      return session;
    },
    async loginToken(_input: CommandMap["loginToken"]) {
      calls.push("loginToken");
      return session;
    },
    async ssoUrl(_input: CommandMap["ssoUrl"]) {
      calls.push("ssoUrl");
      return "https://example.org/sso";
    },
    async register(_input: CommandMap["register"]) {
      calls.push("register");
      return { session, recoveryKey: null, key: "needs-recovery" };
    },
    async logout() {
      calls.push("logout");
      return null;
    },
    async keyStatus(): Promise<KeyStatus> {
      calls.push("keyStatus");
      return "missing";
    },
    async recover() {
      calls.push("recover");
      return "missing";
    },
    async open() {
      calls.push("open");
      return null;
    },
    async older() {
      calls.push("older");
      return null;
    },
    async send() {
      calls.push("send");
      return sentRow;
    },
    async retrySend() {
      calls.push("retrySend");
      return sentRow;
    },
    async discardSend() {
      calls.push("discardSend");
      return null;
    },
    async markRead() {
      calls.push("markRead");
      return null;
    },
    async members() {
      calls.push("members");
      return null;
    },
    async devices() {
      calls.push("devices");
      return [];
    },
    async backupStatus() {
      calls.push("backupStatus");
      return { version: null, trusted: false, matchesDecryptionKey: false, enabled: false, error: null };
    },
    async backupSetup() {
      calls.push("backupSetup");
      return { version: "1", trusted: true, matchesDecryptionKey: true, enabled: true, error: null };
    },
    async sasStart() {
      calls.push("sasStart");
      return {
        id: "sas-1",
        otherUserId: session.userId,
        otherDeviceId: "PHONE",
        isSelfVerification: true,
        phase: "requested",
        emoji: null,
        decimal: null,
        cancellationCode: null,
      };
    },
    async sasAccept() {
      calls.push("sasAccept");
      return null;
    },
    async sasConfirm() {
      calls.push("sasConfirm");
      return null;
    },
    async sasMismatch() {
      calls.push("sasMismatch");
      return null;
    },
    async sasCancel() {
      calls.push("sasCancel");
      return null;
    },
    async resetIdentity() {
      calls.push("resetIdentity");
      return null;
    },
    async react() {
      calls.push("react");
      return null;
    },
    async edit() {
      calls.push("edit");
      return null;
    },
    async redact() {
      calls.push("redact");
      return null;
    },
    async typing() {
      calls.push("typing");
      return null;
    },
    async search() {
      calls.push("search");
      return [sentRow];
    },
    async leaveRoom() {
      calls.push("leaveRoom");
      return null;
    },
    async setRoomTag() {
      calls.push("setRoomTag");
      return null;
    },
    async setNotification() {
      calls.push("setNotification");
      return null;
    },
    async setRoomState() {
      calls.push("setRoomState");
      return null;
    },
    async inviteUser() {
      calls.push("inviteUser");
      return null;
    },
    async joinRoom() {
      calls.push("joinRoom");
      return "!a:example.org";
    },
    async answerInvite() {
      calls.push("answerInvite");
      return null;
    },
    async createRoom() {
      calls.push("createRoom");
      return "!a:example.org";
    },
    async forward() {
      calls.push("forward");
      return null;
    },
    async memberAction() {
      calls.push("memberAction");
      return null;
    },
    async sendMedia() {
      calls.push("sendMedia");
      return sentRow;
    },
    async media() {
      calls.push("media");
      return { url: "blob:https://example.org/1", mime: "image/webp", width: 1, height: 1 };
    },
    onEvent() {
      return () => {};
    },
  };
}

void test("the worker dispatcher covers every command and preserves order", async () => {
  const calls: string[] = [];
  const api = createWorkerApi(fakePort(calls));
  const start = await api.handle({ id: 1, type: "start", payload: { wasmUrl: "/a.wasm" } });
  assert.deepEqual(start, { id: 1, ok: true, data: startData });
  assert.deepEqual(
    await api.handle({
      id: 2,
      type: "login",
      payload: { homeserver: "https://example.org", username: "alice", password: "secret" },
    }),
    { id: 2, ok: true, data: session },
  );
  assert.deepEqual(await api.handle({ id: 3, type: "logout", payload: {} }), {
    id: 3,
    ok: true,
    data: null,
  });
  assert.deepEqual(await api.handle({ id: 4, type: "keyStatus", payload: {} }), {
    id: 4,
    ok: true,
    data: "missing",
  });
  assert.deepEqual(await api.handle({ id: 5, type: "open", payload: { roomId: "!a:example.org" } }), {
    id: 5,
    ok: true,
    data: null,
  });
  assert.deepEqual(await api.handle({ id: 6, type: "older", payload: { roomId: "!a:example.org" } }), {
    id: 6,
    ok: true,
    data: null,
  });
  assert.deepEqual(
    await api.handle({
      id: 7,
      type: "send",
      payload: {
        roomId: "!a:example.org",
        body: "hi",
        html: null,
        replyTo: null,
        transactionId: "t1",
        messageId: "m1",
        kind: "text",
        media: null,
      },
    }),
    { id: 7, ok: true, data: sentRow },
  );
  assert.deepEqual(
    await api.handle({ id: 8, type: "markRead", payload: { roomId: "!a:example.org", eventId: "$e" } }),
    { id: 8, ok: true, data: null },
  );
  assert.deepEqual(await api.handle({ id: 9, type: "members", payload: { roomId: "!a:example.org" } }), {
    id: 9,
    ok: true,
    data: null,
  });
  assert.deepEqual(await api.handle({ id: 10, type: "devices", payload: {} }), {
    id: 10,
    ok: true,
    data: [],
  });
  assert.deepEqual(await api.handle({ id: 11, type: "resetIdentity", payload: { password: "pw" } }), {
    id: 11,
    ok: true,
    data: null,
  });
  assert.deepEqual(await api.handle({ id: 12, type: "backupStatus", payload: {} }), {
    id: 12,
    ok: true,
    data: { version: null, trusted: false, matchesDecryptionKey: false, enabled: false, error: null },
  });
  assert.deepEqual(await api.handle({ id: 13, type: "backupSetup", payload: {} }), {
    id: 13,
    ok: true,
    data: { version: "1", trusted: true, matchesDecryptionKey: true, enabled: true, error: null },
  });
  assert.deepEqual(calls, [
    "start",
    "login",
    "logout",
    "keyStatus",
    "open",
    "older",
    "send",
    "markRead",
    "members",
    "devices",
    "resetIdentity",
    "backupStatus",
    "backupSetup",
  ]);
});

void test("the worker dispatcher covers every daily-use command", async () => {
  const calls: string[] = [];
  const api = createWorkerApi(fakePort(calls));
  const roomId = "!a:example.org";
  const payloads = [
    ["react", { roomId, eventId: "$e", key: "👍" }],
    ["edit", { roomId, eventId: "$e", body: "new", html: null }],
    ["redact", { roomId, eventId: "$e" }],
    ["typing", { roomId, typing: true }],
    ["search", { roomIds: [roomId], query: "hi", mediaKinds: ["image"], limit: 10 }],
    ["leaveRoom", { roomId }],
    ["setRoomTag", { roomId, tag: "m.favourite", enabled: true }],
    ["setNotification", { roomId, mode: "mute" }],
    ["setRoomState", { roomId, patch: { name: "Name" } }],
    ["inviteUser", { roomId, userId: "@bob:example.org" }],
    ["joinRoom", { roomIdOrAlias: "#room:example.org" }],
    ["answerInvite", { roomId, accept: true }],
    ["createRoom", { name: "Room", topic: "", directUserId: null }],
    ["forward", { targetRoomId: roomId, sources: [{ roomId, eventId: "$e" }] }],
    ["memberAction", { roomId, userId: "@bob:example.org", action: "kick" }],
  ] as const;
  for (const [index, [type, payload]] of payloads.entries()) {
    const reply = await api.handle({ id: index + 1, type, payload });
    assert.equal(reply.ok, true, type);
  }
  assert.deepEqual(
    calls,
    payloads.map(([type]) => type),
  );
  const searched = await api.handle({
    id: 99,
    type: "search",
    payload: { roomIds: [roomId], query: "", mediaKinds: [], limit: 5 },
  });
  assert.deepEqual(searched, { id: 99, ok: true, data: [sentRow] });
});

void test("the worker dispatcher rejects malformed and failed commands", async () => {
  const api = createWorkerApi({
    ...fakePort([]),
    async login() {
      throw new WorkerFailure("auth");
    },
  });
  assert.deepEqual(await api.handle({ id: 5, type: "start", payload: {} }), {
    id: 5,
    ok: false,
    code: "invalid",
  });
  assert.deepEqual(
    await api.handle({
      id: 7,
      type: "login",
      payload: { homeserver: "https://example.org", username: "alice", password: "bad" },
    }),
    { id: 7, ok: false, code: "auth" },
  );
});

void test("the worker dispatcher routes SAS commands by worker id", async () => {
  const calls: string[] = [];
  const api = createWorkerApi(fakePort(calls));
  const sas = {
    id: "sas-1",
    otherUserId: session.userId,
    otherDeviceId: "PHONE",
    isSelfVerification: true,
    phase: "requested",
    emoji: null,
    decimal: null,
    cancellationCode: null,
  };
  assert.deepEqual(await api.handle({ id: 60, type: "sasStart", payload: { deviceId: null } }), {
    id: 60,
    ok: true,
    data: sas,
  });
  for (const [index, type] of ["sasAccept", "sasConfirm", "sasMismatch", "sasCancel"].entries()) {
    assert.deepEqual(await api.handle({ id: 61 + index, type, payload: { id: "sas-1" } }), {
      id: 61 + index,
      ok: true,
      data: null,
    });
  }
  assert.deepEqual(calls, ["sasStart", "sasAccept", "sasConfirm", "sasMismatch", "sasCancel"]);
});

void test("the worker dispatcher applies SAS failures and malformed ids", async () => {
  const api = createWorkerApi({
    ...fakePort([]),
    async sasConfirm() {
      throw new WorkerFailure("invalid");
    },
  });
  assert.deepEqual(await api.handle({ id: 70, type: "sasConfirm", payload: { id: "sas-404" } }), {
    id: 70,
    ok: false,
    code: "invalid",
  });
  assert.deepEqual(await api.handle({ id: 71, type: "sasAccept", payload: { id: "" } }), {
    id: 71,
    ok: false,
    code: "invalid",
  });
});
