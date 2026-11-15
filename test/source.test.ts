import assert from "node:assert/strict";
import test from "node:test";
import { createRoom } from "../src/core/rooms.ts";
import type { RoomSummary } from "../src/core/types.ts";
import { MockSource } from "../src/client/mockSource.ts";
import { mockMessagesFor } from "../src/core/mock.ts";
import type { SourceEvents } from "../src/client/source.ts";

void test("the source owns room state and emits the room projection", () => {
  const source = new MockSource(false);
  const events: (readonly RoomSummary[])[] = [];
  source.on("rooms", ({ rooms }) => events.push(rooms));
  source.addRoom(createRoom({ roomId: "!room:matrix.org", name: "Room", topic: "Before" }));
  source.setRoomTag("!room:matrix.org", "m.favourite", true);
  source.setRoomState("!room:matrix.org", { name: "Renamed", topic: "After" });
  source.setNotification("!room:matrix.org", "mute");

  assert.equal(events.length, 4);
  const last = events[events.length - 1] ?? [];
  assert.equal(last[0]?.name, "Renamed");
  assert.deepEqual(last[0]?.tags["m.favourite"], {});
  assert.equal(last[0]?.notification, "mute");

  source.leaveRoom("!room:matrix.org");
  assert.equal(events[events.length - 1]?.length, 0);
});

void test("the mock source re-projects message actions as window patches", () => {
  const source = new MockSource(true);
  const windows: SourceEvents["window"][] = [];
  source.on("window", (payload) => windows.push(payload));
  const row = mockMessagesFor("design").find((message) => message.eventId !== null);
  assert.ok(row?.eventId);

  source.react("design", row.eventId, "🎉");
  const reacted = windows.findLast((payload) => payload.patch)?.messages[0];
  assert.deepEqual(
    reacted?.reactions.find((entry) => entry.key === "🎉"),
    { key: "🎉", count: 1, mine: true },
  );

  source.edit("design", row.eventId, "edited body", null);
  const edited = windows.findLast((payload) => payload.patch)?.messages[0];
  assert.equal(edited?.body, "edited body");
  assert.equal(edited?.edited, true);

  source.redact("design", row.eventId);
  const redacted = windows.findLast((payload) => payload.patch)?.messages[0];
  assert.equal(redacted?.redacted, true);
  assert.equal(redacted?.body, "");
  assert.deepEqual(redacted?.reactions, []);
});
