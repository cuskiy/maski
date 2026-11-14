import assert from "node:assert/strict";
import test from "node:test";
import { en } from "../src/catalogs/en.ts";
import { appShell } from "../src/layouts/app.ts";
import { mockChatState } from "../src/core/mock.ts";

void test("the review starts from the booted read state", () => {
  const state = mockChatState();
  const active = state.rooms.find((room) => room.roomId === state.roomId);
  const last = state.messages[state.messages.length - 1];
  assert.ok(active);
  assert.ok(last);
  assert.equal(active.unread, 0);
  assert.equal(active.highlight, 0);
  assert.equal(active.readReceipt, last.id);
});

void test("the review shell contains no chrome that boot removes", () => {
  const state = mockChatState();
  const last = state.messages[state.messages.length - 1];
  const markup = appShell(state, en, "en").value;
  assert.match(markup, new RegExp(`data-read-receipt="${String(last?.id)}"`));
  assert.doesNotMatch(markup, /is-unread-reveal/);
  assert.doesNotMatch(markup, /<video/);
  assert.doesNotMatch(markup, /viewer-player/);
  assert.doesNotMatch(markup, /room-badge is-mention/);
  assert.equal((markup.match(/aria-label="1 unread"/g) ?? []).length, 1);
});
