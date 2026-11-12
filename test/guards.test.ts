import { describe, expect, it } from "vitest";
import {
  isAck,
  isCommandRequest,
  isRecord,
  readBooleanField,
  readNumberField,
  readStringField,
  readStringArray,
} from "../src/protocol/guards";

describe("protocol guards", () => {
  it("recognizes command envelopes", () => {
    expect(isCommandRequest({ id: "1", type: "start", payload: {} })).toBe(true);
    expect(isCommandRequest({ type: "start", payload: {} })).toBe(false);
    expect(isAck({ type: "ack", revision: 3 })).toBe(true);
  });

  it("reads typed fields without coercion", () => {
    expect(readStringField({ name: "maski" }, "name")).toBe("maski");
    expect(readNumberField({ count: 3 }, "count")).toBe(3);
    expect(readBooleanField({ ready: true }, "ready")).toBe(true);
    expect(readStringArray(["a", "b"], "items")).toEqual(["a", "b"]);
  });

  it("rejects wrong field types", () => {
    expect(() => readStringField({ name: 3 }, "name")).toThrow();
    expect(() => readNumberField({ count: "3" }, "count")).toThrow();
    expect(() => readBooleanField({ ready: 1 }, "ready")).toThrow();
  });

  it("distinguishes records from arrays", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });
});
