import { describe, expect, it } from "vitest";
import { matchesTokens, normalizeText, tokenize } from "../src/data/text";

describe("text normalization", () => {
  it("normalizes case, width, and diacritics", () => {
    expect(normalizeText("Café ＡＢＣ")).toBe("cafe abc");
  });

  it("segments Latin and CJK text", () => {
    expect(tokenize("Hello 世界")).toEqual(expect.arrayContaining(["hello", "世界"]));
  });

  it("drops punctuation", () => {
    expect(tokenize("hello, world!")).toEqual(expect.arrayContaining(["hello", "world"]));
  });

  it("matches every query token by prefix", () => {
    expect(matchesTokens(["hello", "world"], ["hel", "wor"])).toBe(true);
    expect(matchesTokens(["hello"], ["world"])).toBe(false);
  });
});
