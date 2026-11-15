import assert from "node:assert/strict";
import test from "node:test";
import { requestPersistentStorage } from "../src/client/persist.ts";

void test("persistent storage is requested only when it is not already granted", async () => {
  let requested = 0;
  assert.equal(
    await requestPersistentStorage({
      persisted: () => Promise.resolve(true),
      persist: () => {
        requested += 1;
        return Promise.resolve(true);
      },
    }),
    true,
  );
  assert.equal(requested, 0);
  assert.equal(
    await requestPersistentStorage({
      persisted: () => Promise.resolve(false),
      persist: () => {
        requested += 1;
        return Promise.resolve(false);
      },
    }),
    false,
  );
  assert.equal(requested, 1);
  assert.equal(await requestPersistentStorage(undefined), false);
});
