import { describe, expect, it } from "vitest";
import { olderEvents, selectFresh } from "../src/worker/project.ts";

const ids = ["$a", "$b", "$c", "$d", "$e"];

describe("selectFresh", () => {
  it("takes every event after the cursor", () => {
    expect(selectFresh(ids, "$c", 0)).toEqual([3, 4]);
  });

  it("takes everything when the room has no cursor yet", () => {
    expect(selectFresh(ids, undefined, 0)).toEqual([0, 1, 2, 3, 4]);
  });

  it("revisits the tail even when the cursor is at the end", () => {
    expect(selectFresh(ids, "$e", 2)).toEqual([3, 4]);
  });

  it("includes an older event that is both in the tail and after the cursor once", () => {
    expect(selectFresh(ids, "$a", 3)).toEqual([1, 2, 3, 4]);
  });

  it("stops after the limit", () => {
    expect(selectFresh(ids, undefined, 0, 2)).toEqual([3, 4]);
  });
});

describe("olderEvents", () => {
  const stored = new Set(["$c"]);
  const db = { get: (_store: string, key: string) => Promise.resolve(stored.has(key) ? { id: key } : undefined) };
  const events = ["$a", "$b", "$c", "$d"].map((id) => ({ getId: () => id }));

  it("takes the events before the oldest stored row", async () => {
    const list = await olderEvents(db, events);
    expect(list.map((event) => event.getId())).toEqual(["$a", "$b"]);
  });

  it("stops at a local echo", async () => {
    const echo = [{ getId: () => "$x" }, { getId: () => "~r:1" }, { getId: () => "$y" }];
    const list = await olderEvents({ get: () => Promise.resolve(undefined) }, echo);
    expect(list.map((event) => event.getId())).toEqual(["$x"]);
  });
});
