import assert from "node:assert/strict";
import test from "node:test";
import { en } from "../src/catalogs/en.ts";
import { mockChatState } from "../src/core/mock.ts";
import { timeline } from "../src/components/timeline.ts";
import { redactRow } from "../src/core/message.ts";

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

void test("a redacted message remains as a tombstone without its media", () => {
  const state = mockChatState();
  const image = state.messages.find((row) => row.id === "d4");
  assert.ok(image);
  const redacted = redactRow(image);
  const redactedMarkup = timeline({ ...state, messages: [redacted] }, en, "en").value;
  assert.match(redactedMarkup, /Message deleted\./u);
  assert.match(redactedMarkup, /is-redacted/u);
  assert.doesNotMatch(redactedMarkup, /media-element/u);
});

void test("media captions render and the viewer control carries the message id", () => {
  const image = message("d4");
  const video = message("d9");
  assert.match(image, /media-caption/u);
  assert.match(image, /The new layout/u);
  assert.match(image, /data-media-open="d4"/u);
  assert.doesNotMatch(image, /data-media-open="layout\.png"/u);
  assert.match(video, /media-caption/u);
  assert.match(video, /data-media-open="d9"/u);
  const dated = message("d5");
  assert.match(dated, /The placeholder stays neutral/u);
});

void test("a failed window reveals a retryable failure instead of an empty room", () => {
  const failed = timeline({ ...mockChatState(), failure: "open", windowLoading: false }, en, "en").value;
  assert.match(failed, /role="alert"/u);
  assert.match(failed, /Could not load this conversation/u);
  assert.doesNotMatch(failed, /No messages yet/u);
});

void test("a shared location links to its map", () => {
  const state = { ...mockChatState(), roomId: "roadmap" };
  const locationMarkup = timeline(state, en, "en").value;
  assert.match(
    markup,
    /class="message-location"[\s\S]{0,40}href="https:\/\/www\.openstreetmap\.org\/\?mlat=35\.0116&amp;mlon=135\.7681"/u,
  );
  assert.match(markup, /Meet at the venue\./u);
});
