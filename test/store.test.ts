import assert from "node:assert/strict";
import test from "node:test";
import { emptyChatState } from "../src/core/state.ts";
import { createStore } from "../src/client/store.ts";

void test("the store notifies only watchers of keys that changed", () => {
  const store = createStore(emptyChatState());
  const changes: string[][] = [];
  const unwatch = store.watch(["roomId", "messages"], (changed) => {
    changes.push([...changed].toSorted());
  });

  store.write("roomId", "room-a");
  store.write("typing", []);
  assert.deepEqual(changes, [["roomId"]]);

  store.write("roomId", "room-a");
  assert.deepEqual(changes, [["roomId"]]);

  unwatch();
  store.write("roomId", "room-b");
  assert.deepEqual(changes, [["roomId"]]);
});

void test("a batch produces one notification containing every changed key", () => {
  const store = createStore(emptyChatState());
  const changes: string[][] = [];
  store.watch(["roomId", "messages", "hasOlder"], (changed) => {
    changes.push([...changed].toSorted());
  });

  store.batch(() => {
    store.write("roomId", "room-a");
    store.write("messages", []);
    store.write("hasOlder", true);
  });

  assert.deepEqual(changes, [["hasOlder", "messages", "roomId"]]);
});
