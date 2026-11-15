import { test } from "node:test";
import assert from "node:assert/strict";
import { en } from "../src/catalogs/en.ts";
import { zhCN } from "../src/catalogs/zh-CN.ts";
import { t } from "../src/lib/catalog.ts";

void test("every language has the same keys", () => {
  assert.deepEqual(Object.keys(en).toSorted(), Object.keys(zhCN).toSorted());
});

void test("no catalog entry is empty", () => {
  for (const value of Object.values(en)) assert.ok(value.length > 0);
  for (const value of Object.values(zhCN)) assert.ok(value.length > 0);
});

const placeholders = (value: string): readonly string[] =>
  [...value.matchAll(/\{([a-z]+)\}/gu)].map((match) => match[1] ?? "").toSorted();

void test("every language uses the same placeholders per key", () => {
  const zhEntries = new Map(Object.entries(zhCN));
  for (const [key, value] of Object.entries(en)) {
    assert.deepEqual(placeholders(value), placeholders(zhEntries.get(key) ?? ""), key);
  }
});

void test("placeholders are substituted", () => {
  assert.equal(t({ ...en, "app.description": "Hello {name}" }, "app.description", { name: "Ada" }), "Hello Ada");
});
