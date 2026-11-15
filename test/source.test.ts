import assert from "node:assert/strict";
import test from "node:test";
import { createRoom } from "../src/core/rooms.ts";
import type { RoomSummary } from "../src/core/types.ts";
import { MockSource } from "../src/client/mockSource.ts";

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
