import assert from "node:assert/strict";
import test from "node:test";
import { messagePosition, messagePositions, type MessageGroupRow } from "../src/core/messageGroups.ts";
import type { Media } from "../src/core/types.ts";

const DAY = Date.UTC(2026, 10, 13, 9, 0);
const NEXT_DAY = Date.UTC(2026, 10, 14, 9, 0);
const image: Media = { kind: "image", name: "image.png", width: null, height: null, size: null, url: null };

function row(
  sender: string,
  ts: number,
  options: Partial<Pick<MessageGroupRow, "own" | "media" | "system">> = {},
): MessageGroupRow {
  return {
    sender,
    ts,
    own: options.own ?? false,
    media: options.media ?? null,
    system: options.system ?? false,
  };
}

void test("a sender group keeps the name on the first text and the avatar position on the end", () => {
  const messages = [row("alice", DAY), row("alice", DAY + 1), row("bob", DAY + 2)];
  assert.deepEqual(messagePosition(messages, 0), {
    dayStart: true,
    groupStart: true,
    groupEnd: false,
    showSender: true,
  });
  assert.deepEqual(messagePosition(messages, 1), {
    dayStart: false,
    groupStart: false,
    groupEnd: true,
    showSender: false,
  });
  assert.equal(messagePosition(messages, 2).showSender, true);
});

void test("media never receives the sender name and the first text receives it", () => {
  const messages = [row("alice", DAY, { media: image }), row("alice", DAY + 1)];
  assert.equal(messagePosition(messages, 0).groupStart, true);
  assert.equal(messagePosition(messages, 0).groupEnd, false);
  assert.equal(messagePosition(messages, 1).groupEnd, true);
  assert.equal(messagePosition(messages, 1).showSender, true);
});

void test("own and system messages never receive the sender name", () => {
  const messages = [row("you", DAY, { own: true }), row("system", DAY + 1, { system: true })];
  assert.equal(messagePosition(messages, 0).showSender, false);
  assert.equal(messagePosition(messages, 1).showSender, false);
});

void test("a date change starts a new group for the same sender", () => {
  const messages = [row("alice", DAY), row("alice", NEXT_DAY)];
  assert.equal(messagePosition(messages, 1).dayStart, true);
  assert.equal(messagePosition(messages, 1).groupStart, true);
  assert.equal(messagePosition(messages, 0).groupEnd, true);
  assert.equal(messagePosition(messages, 1).showSender, true);
});

void test("local midnight starts a new day group", () => {
  const messages = [
    row("alice", new Date(2026, 10, 13, 23, 59).getTime()),
    row("alice", new Date(2026, 10, 14, 0, 1).getTime()),
  ];
  assert.equal(messagePosition(messages, 1).dayStart, true);
  assert.equal(messagePosition(messages, 1).groupStart, true);
  assert.equal(messagePosition(messages, 0).groupEnd, true);
});

void test("the batch grouping matches every indexed lookup", () => {
  const messages = [
    row("alice", DAY),
    row("alice", DAY + 1, { media: image }),
    row("alice", DAY + 2),
    row("bob", DAY + 3),
    row("bob", NEXT_DAY),
  ];
  const positions = messagePositions(messages);
  for (let index = 0; index < messages.length; index += 1) {
    assert.deepEqual(messagePosition(messages, index), positions[index]);
  }
  assert.equal(positions[0]?.showSender, true);
  assert.equal(positions[2]?.showSender, false);
  assert.equal(positions[3]?.showSender, true);
});
