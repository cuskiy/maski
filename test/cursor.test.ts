import { describe, expect, it } from "vitest";
import { selectFresh } from "../src/worker/project.ts";

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
