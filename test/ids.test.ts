import { describe, expect, it } from "vitest";
import { accountDbName, mediaCacheKey } from "../src/data";

describe("identifiers", () => {
  it("namespaces account databases", () => {
    expect(accountDbName("abc")).toBe("maski-abc");
  });

  it("includes dimensions and encrypted hash in media keys", () => {
    expect(mediaCacheKey("mxc://example/a", 32, 48, "crop", "hash")).toBe(
      "mxc://example/a|32x48|crop|hash",
    );
  });
});
