import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { en } from "../src/catalogs/en.ts";
import { zhCN } from "../src/catalogs/zh-CN.ts";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") && entry.name !== "en.ts" && entry.name !== "zh-CN.ts" ? [readFileSync(path, "utf8")] : [];
  });
}

const used = [...sources(join("src")), ...sources(join("scripts"))].join("\n");

void test("every language has the same keys", () => {
  assert.deepEqual(Object.keys(zhCN).toSorted(), Object.keys(en).toSorted());
});

void test("no entry is empty", () => {
  for (const [key, value] of Object.entries(en)) assert.notEqual(value, "", key);
  for (const [key, value] of Object.entries(zhCN)) assert.notEqual(value, "", key);
});

void test("no key that the code does not read", () => {
  const unused = Object.keys(en).filter((key) => !used.includes(`"${key}"`));
  assert.deepEqual(unused, []);
});
