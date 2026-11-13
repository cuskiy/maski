import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../src/catalogs/en.ts";
import { zhCN } from "../src/catalogs/zh-CN.ts";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") && entry.name !== "en.ts" && entry.name !== "zh-CN.ts" ? [readFileSync(path, "utf8")] : [];
  });
}

const used = [sources(join("src")), sources(join("scripts"))].flat().join("\n");

describe("catalog", () => {
  it("has the same keys in every language", () => {
    expect(Object.keys(zhCN).toSorted()).toEqual(Object.keys(en).toSorted());
  });

  it("has no empty entry", () => {
    for (const [key, value] of Object.entries(en)) expect(value, key).not.toBe("");
    for (const [key, value] of Object.entries(zhCN)) expect(value, key).not.toBe("");
  });

  /** A key nothing reads is copy somebody wrote and forgot; it is deleted, not kept for later. */
  it("has no key that the code does not read", () => {
    const unused = Object.keys(en).filter((key) => !used.includes(`"${key}"`));
    expect(unused).toEqual([]);
  });
});
