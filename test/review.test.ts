import assert from "node:assert/strict";
import test from "node:test";
import { en } from "../src/catalogs/en.ts";
import { appShell } from "../src/layouts/app.ts";
import { mockChatState } from "../src/core/mock.ts";

void test("the static shell contains no room or message data", () => {
  const markup = appShell(en, "en").value;
  assert.match(markup, /data-view="list"/);
  assert.match(markup, /data-region="nav"/);
  assert.match(markup, /data-region="room-header"/);
  assert.match(markup, /data-region="timeline"/);
  assert.match(markup, /data-region="composer"/);
  assert.doesNotMatch(markup, /data-room="/);
  assert.doesNotMatch(markup, /<li class="message/u);
  assert.doesNotMatch(markup, /room-badge/u);
  assert.doesNotMatch(markup, /section-count/u);
  assert.doesNotMatch(markup, /pack-item/u);
  assert.doesNotMatch(markup, /data-sticker/u);
  assert.doesNotMatch(markup, /member-row/u);
  assert.doesNotMatch(markup, /profile-line/u);
  assert.doesNotMatch(markup, /<button class="search-result"/u);
  assert.doesNotMatch(markup, /data-setting=/u);
  assert.doesNotMatch(markup, /data-setting-value=/u);
  assert.equal(markup.includes(en["settings.signedOut"]), false);
  assert.doesNotMatch(markup, /invite-row/u);
  assert.doesNotMatch(markup, /device-row/u);
  assert.doesNotMatch(markup, /class="media-file/u);
  assert.doesNotMatch(markup, /\schecked(?=[\s>])/u);
});

void test("the booted review starts from the read state", () => {
  const state = mockChatState();
  const active = state.rooms.find((room) => room.roomId === state.roomId);
  const last = state.messages[state.messages.length - 1];
  assert.ok(active);
  assert.ok(last);
  assert.equal(active.unread, 0);
  assert.equal(active.highlight, 0);
  assert.equal(active.readReceipt, last.id);
});
