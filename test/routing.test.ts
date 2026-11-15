import assert from "node:assert/strict";
import test from "node:test";
import { roomHash, roomIdFromHash } from "../src/client/roomRoute.ts";

void test("a room hash round-trips a matrix room id", () => {
  const id = "!room:example.org";
  assert.equal(roomHash(id), "#/room/!room%3Aexample.org");
  assert.equal(roomIdFromHash(roomHash(id)), id);
  assert.equal(roomIdFromHash("#/room/%E0%A4%A"), null);
  assert.equal(roomIdFromHash("#/room/not-a-room"), null);
  assert.equal(roomIdFromHash("#settings-account"), null);
});
