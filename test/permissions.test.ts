import assert from "node:assert/strict";
import test from "node:test";
import { mockChatState } from "../src/core/mock.ts";
import { memberPermissions, messagePermissions, roomPermissions } from "../src/core/permissions.ts";

void test("message redaction follows own events and the target power level", () => {
  const state = mockChatState();
  const design = state.rooms.find((room) => room.roomId === "design");
  const lobby = state.rooms.find((room) => room.roomId === "lobby");
  const own = state.messages.find((message) => message.own);
  const other = state.messages.find((message) => message.sender === "@bob:matrix.org");
  assert.ok(design && lobby && own && other);
  assert.equal(messagePermissions(own, design, state.session?.userId ?? null).redact, true);
  assert.equal(messagePermissions(other, design, state.session?.userId ?? null).redact, true);
  assert.equal(messagePermissions(other, lobby, state.session?.userId ?? null).redact, false);
});

void test("member moderation respects the actor and target power levels", () => {
  const state = mockChatState();
  const design = state.rooms.find((room) => room.roomId === "design");
  const alice = state.members.find((member) => member.userId === "@alice:matrix.org");
  const bob = state.members.find((member) => member.userId === "@bob:matrix.org");
  assert.ok(design && alice && bob);
  const userId = state.session?.userId ?? null;
  assert.deepEqual(memberPermissions(design, alice, userId), { kick: false, ban: false, unban: false });
  assert.deepEqual(memberPermissions(design, bob, userId), { kick: true, ban: true, unban: false });
});

void test("a room defaults to invite-only and forbids guests", () => {
  const state = mockChatState();
  const lobby = state.rooms.find((room) => room.roomId === "lobby");
  assert.ok(lobby);
  const permissions = roomPermissions(lobby, state.session?.userId ?? null);
  assert.equal(permissions.send, true);
  assert.equal(permissions.manage, false);
  assert.equal(permissions.leave, true);
});
