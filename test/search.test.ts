import assert from "node:assert/strict";
import test from "node:test";
import { messageMatches } from "../src/core/search.ts";
import { toggledReactions } from "../src/core/reactions.ts";
import { mockMessagesFor } from "../src/core/mock.ts";

void test("search matches body, sender, filename and media kind filters", () => {
  const image = mockMessagesFor("design").find((message) => message.media?.kind === "image");
  assert.ok(image);
  assert.equal(messageMatches(image, "new layout"), true);
  assert.equal(messageMatches(image, "layout.png"), true);
  assert.equal(messageMatches(image, "bob"), true);
  assert.equal(messageMatches(image, "no-such-token"), false);
  assert.equal(messageMatches(image, "图片", new Set(["image"])), true);
  assert.equal(messageMatches(image, "图片", new Set(["video"])), false);
});

void test("reaction toggling is symmetric and one per sender", () => {
  const added = toggledReactions([], "👍");
  assert.deepEqual(added, [{ key: "👍", count: 1, mine: true }]);
  assert.deepEqual(toggledReactions(added, "👍"), []);
  const other = [{ key: "👍", count: 2, mine: false }] as const;
  assert.deepEqual(toggledReactions(other, "👍"), [{ key: "👍", count: 3, mine: true }]);
});
