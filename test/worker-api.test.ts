import assert from "node:assert/strict";
import test from "node:test";
import type { SessionSummary } from "../src/core/types.ts";
import type { CommandMap, KeyStatus, StartData } from "../src/protocol/index.ts";
import { createWorkerApi } from "../src/worker/api.ts";
import { WorkerFailure } from "../src/worker/failure.ts";
import type { SessionPort } from "../src/worker/ports.ts";

const session: SessionSummary = {
  userId: "@alice:example.org",
  displayName: "Alice",
  avatar: null,
  capabilities: { recoveryKey: false, backup: false, signOut: true, signOutOthers: true },
};

const startData: StartData = { session: null, connection: "offline", key: "missing" };

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
    async logout() {
      calls.push("logout");
      return null;
    },
    async keyStatus(): Promise<KeyStatus> {
      calls.push("keyStatus");
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
    async resetIdentity() {
      calls.push("resetIdentity");
      return null;
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
      },
    }),
    { id: 7, ok: true, data: null },
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
  assert.deepEqual(await api.handle({ id: 10, type: "resetIdentity", payload: { password: "pw" } }), {
    id: 10,
    ok: true,
    data: null,
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
    "resetIdentity",
  ]);
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
