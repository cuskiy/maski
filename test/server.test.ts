import { test } from "node:test";
import assert from "node:assert/strict";
import { readServer } from "../src/core/server.ts";

void test("a bare host gets https", () => {
  assert.deepEqual(readServer("unredacted.org"), { baseUrl: "https://unredacted.org", host: "unredacted.org" });
});

void test("an explicit scheme is kept", () => {
  assert.deepEqual(readServer("http://localhost:8008"), { baseUrl: "http://localhost:8008", host: "localhost:8008" });
});

void test("a path and trailing slash are dropped", () => {
  assert.equal(readServer("https://matrix.unredacted.org/")?.baseUrl, "https://matrix.unredacted.org");
  assert.equal(readServer("https://example.org/some/path")?.baseUrl, "https://example.org");
});

void test("surrounding whitespace is ignored", () => {
  assert.equal(readServer("  matrix.org  ")?.host, "matrix.org");
});

void test("empty and unusable input is refused", () => {
  assert.equal(readServer(""), null);
  assert.equal(readServer("   "), null);
  assert.equal(readServer("ftp://example.org"), null);
});
