import assert from "node:assert/strict";
import test from "node:test";
import { safeAvatarUrl, safeMediaUrl } from "../src/lib/safeUrl.ts";
import { mockChatState } from "../src/core/mock.ts";
import { en } from "../src/catalogs/en.ts";
import { timeline } from "../src/components/timeline.ts";
import { phaseFor, startPhase } from "../src/client/workerSource.ts";

void test("avatars and media only accept local, blob, or raster data URLs", () => {
  assert.equal(safeAvatarUrl("/assets/avatar.png"), "/assets/avatar.png");
  assert.equal(safeAvatarUrl("blob:https://maski.invalid/1"), "blob:https://maski.invalid/1");
  assert.equal(safeAvatarUrl("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(safeAvatarUrl("https://tracker.invalid/avatar.png"), null);
  assert.equal(safeAvatarUrl("//tracker.invalid/avatar.png"), null);
  assert.equal(safeAvatarUrl("javascript:alert(1)"), null);
  assert.equal(safeAvatarUrl("data:image/svg+xml;base64,AAAA"), null);
  assert.equal(safeMediaUrl("https://tracker.invalid/photo.jpg", "image"), null);
  assert.equal(safeMediaUrl("data:image/png;base64,AAAA", "image"), "data:image/png;base64,AAAA");
  assert.equal(safeMediaUrl("data:image/svg+xml;base64,AAAA", "sticker"), null);
  assert.equal(safeMediaUrl("data:video/mp4;base64,AAAA", "video"), "data:video/mp4;base64,AAAA");
  assert.equal(safeMediaUrl("data:video/mp4;base64,AAAA", "image"), null);
});

void test("remote media URLs render as placeholders, not image sources", () => {
  const state = mockChatState();
  const source = state.messages.find((message) => message.media?.kind === "image");
  assert.ok(source?.media);
  const markup = timeline(
    {
      ...state,
      messages: [
        {
          ...source,
          media: { ...source.media, url: "https://tracker.invalid/photo.png" },
        },
      ],
    },
    en,
    "en",
  ).value;
  assert.doesNotMatch(markup, /tracker\.invalid/u);
  assert.match(markup, /media-placeholder/u);
});

void test("an unknown or incomplete gate never opens chat", () => {
  assert.equal(phaseFor("ready"), "ready");
  assert.equal(phaseFor("missing"), "signedOut");
  assert.equal(phaseFor("unknown"), "locked");
  assert.equal(phaseFor("needs-recovery"), "locked");
  assert.equal(phaseFor("needs-verification"), "locked");
});

void test("a cached ready gate paints but stays non-interactive until verified", () => {
  assert.equal(startPhase("unknown", "ready"), "verifying");
  assert.equal(startPhase("unknown", "needs-recovery"), null);
  assert.equal(startPhase("unknown", "missing"), null);
  assert.equal(startPhase("ready", "needs-recovery"), "ready");
  assert.equal(startPhase("needs-recovery", "ready"), "locked");
});
