import { describe, expect, it } from "vitest";
import { asNumber, asString, isRecord, pick } from "../src/core/guard.ts";
import { mediaCacheKey } from "../src/core/id.ts";
import { searchTokens } from "../src/worker/normalize.ts";
import { escapeText } from "../src/core/text.ts";
import { t } from "../src/i18n/index.ts";

describe("guards", () => {
  it("recognises records only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });

  it("falls back on wrong types", () => {
    expect(asString(3)).toBe("");
    expect(asNumber("3")).toBe(0);
    expect(pick({ a: 1 }, "a")).toBe(1);
  });
});

describe("ids", () => {
  it("keys a media variant by size and method", () => {
    expect(mediaCacheKey("mxc://a/b", 64, "crop")).toBe("mxc://a/b@64/crop");
  });
});

describe("search", () => {
  it("normalises case, diacritics and punctuation", () => {
    expect(searchTokens("Héllo, WORLD!")).toEqual(["hello", "world"]);
  });
});

describe("sanitizer", () => {
  it("escapes text", () => {
    expect(escapeText("<b>&")).toBe("&lt;b&gt;&amp;");
  });

});

describe("i18n", () => {
  it("interpolates parameters and falls back to english", () => {
    expect(t("room.joined", { n: 3 })).toBe("3 members");
  });
});
