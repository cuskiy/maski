import assert from "node:assert/strict";
import test from "node:test";
import { en } from "../src/catalogs/en.ts";
import { mockChatState } from "../src/core/mock.ts";
import { timeline } from "../src/components/timeline.ts";

const markup = timeline(mockChatState(), en, "en").value;

function message(id: string): string {
  const match = new RegExp(`<li class="message[^"]*" id="${id}"[\\s\\S]*?(?=<li class="message|<\\/ol>)`).exec(markup);
  assert.ok(match, id);
  return match[0];
}

void test("the avatar sits on the last message of a group", () => {
  for (const [firstId, lastId] of [
    ["d1", "d2"],
    ["d4", "d5"],
    ["d11", "d12"],
  ] as const) {
    const first = message(firstId);
    const last = message(lastId);
    assert.doesNotMatch(first, /<button\s+class="message-avatar"/);
    assert.match(last, /<button\s+class="message-avatar"/);
    assert.match(last, /is-group-end/);
    assert.doesNotMatch(last, /is-group-start/);
  }
});

void test("a single message still carries its avatar", () => {
  assert.match(message("d3"), /<button\s+class="message-avatar"/);
});

void test("remote image media is lazy and decoded off the main path", () => {
  const state = mockChatState();
  const messages = state.messages.map((row) =>
    row.media?.kind === "image" ? { ...row, media: { ...row.media, url: "/media/image.png" } } : row,
  );
  const imageMarkup = timeline({ ...state, messages }, en, "en").value;
  assert.match(imageMarkup, /loading="lazy"/u);
  assert.match(imageMarkup, /decoding="async"/u);
});

void test("image and video messages carry no visible caption", () => {
  const image = message("d4");
  const video = message("d9");
  assert.doesNotMatch(image, /media-caption/u);
  assert.doesNotMatch(image, /The new layout/u);
  assert.doesNotMatch(video, /video-title/u);
});
