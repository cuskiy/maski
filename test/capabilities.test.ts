import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCTION_CAPABILITIES, REVIEW_CAPABILITIES } from "../src/core/types.ts";
import type { SourceCapability } from "../src/core/types.ts";
import { WorkerSource } from "../src/client/workerSource.ts";
import { MockSource } from "../src/client/mockSource.ts";

/** Capabilities that name a ChatSource command. `media` and `stickers` name composer surfaces. */
const METHOD_CAPABILITIES = [
  "search",
  "react",
  "edit",
  "redact",
  "forward",
  "typing",
  "memberAction",
  "inviteUser",
  "addRoom",
  "leaveRoom",
  "setRoomState",
  "setRoomTag",
  "setNotification",
  "resetRecoveryKey",
  "resetIdentity",
  "signOutDevice",
  "signOutOthers",
  "answerInvite",
  "saveNotifications",
  "setAvatar",
  "pat",
  "backupSetup",
] as const satisfies readonly SourceCapability[];

/** Every command the worker protocol answers, so every one must stay implemented. */
const CORE_METHODS = [
  "start",
  "open",
  "older",
  "send",
  "retrySend",
  "discardSend",
  "markRead",
  "members",
  "logout",
  "resetIdentity",
  "on",
  "dispose",
] as const;

/** SAS has no capability key; the production worker still owns these commands. */
const WORKER_SAS_METHODS = ["startSas", "acceptSas", "confirmSas", "mismatchSas", "cancelSas"] as const;

function method(prototype: object, name: string): unknown {
  return Reflect.get(prototype, name);
}

void test("the production source advertises only the commands it implements", () => {
  const capabilities = Object.entries(PRODUCTION_CAPABILITIES).filter(([, enabled]) => enabled);
  for (const [name] of capabilities) {
    if (name === "addRoom") {
      assert.equal(typeof method(WorkerSource.prototype, "createRoom"), "function");
      assert.equal(typeof method(WorkerSource.prototype, "joinRoom"), "function");
      continue;
    }
    if (name === "media" || name === "stickers") {
      assert.equal(typeof method(WorkerSource.prototype, "media"), "function");
      assert.equal(typeof method(WorkerSource.prototype, "sendMedia"), "function");
      continue;
    }
    if ((METHOD_CAPABILITIES as readonly string[]).includes(name)) {
      assert.equal(
        typeof method(WorkerSource.prototype, name),
        "function",
        `production advertises ${name} without a command`,
      );
    } else {
      assert.fail(`production advertises an unimplemented surface: ${name}`);
    }
  }
  for (const name of CORE_METHODS) {
    assert.equal(typeof method(WorkerSource.prototype, name), "function", name);
  }
  for (const name of WORKER_SAS_METHODS) {
    assert.equal(typeof method(WorkerSource.prototype, name), "function", name);
  }
});

void test("the worker source leaves every unimplemented command absent", () => {
  const absent = [
    "resetRecoveryKey",
    "signOutDevice",
    "signOutOthers",
    "saveNotifications",
  ] as const satisfies readonly SourceCapability[];
  for (const name of absent) {
    assert.equal(PRODUCTION_CAPABILITIES[name], false, name);
  }
  assert.equal(typeof method(WorkerSource.prototype, "resetRecoveryKey"), "undefined");
  assert.equal(typeof method(WorkerSource.prototype, "signOutDevice"), "undefined");
  assert.equal(typeof method(WorkerSource.prototype, "signOutOthers"), "undefined");
  assert.equal(typeof method(WorkerSource.prototype, "saveNotifications"), "undefined");
  for (const name of METHOD_CAPABILITIES) {
    if ((absent as readonly string[]).includes(name)) continue;
    assert.equal(PRODUCTION_CAPABILITIES[name], true, name);
    if (name === "addRoom") continue;
    assert.equal(typeof method(WorkerSource.prototype, name), "function", name);
  }
  assert.equal(typeof method(WorkerSource.prototype, "resetIdentity"), "function");
  assert.equal(PRODUCTION_CAPABILITIES.resetIdentity, true);
});

void test("the mock source advertises the full review surface", () => {
  for (const name of METHOD_CAPABILITIES) {
    assert.equal(REVIEW_CAPABILITIES[name], true, name);
    assert.equal(typeof method(MockSource.prototype, name), "function", name);
  }
  assert.equal(REVIEW_CAPABILITIES.media, true);
  assert.equal(REVIEW_CAPABILITIES.stickers, true);
  for (const name of CORE_METHODS) {
    assert.equal(typeof method(MockSource.prototype, name), "function", name);
  }
});

void test("both sources share one capability key set", () => {
  assert.deepEqual(Object.keys(PRODUCTION_CAPABILITIES).toSorted(), Object.keys(REVIEW_CAPABILITIES).toSorted());
});
