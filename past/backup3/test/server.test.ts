import { test } from "node:test";
import assert from "node:assert/strict";
import { readServer } from "../src/core/server.ts";

void test("a bare host is a server name to resolve", () => {
  assert.deepEqual(readServer("unredacted.org"), { kind: "name", serverName: "unredacted.org" });
});

void test("a port is part of the name", () => {
  assert.deepEqual(readServer("matrix.example.org:8448"), { kind: "name", serverName: "matrix.example.org:8448" });
});

void test("an explicit scheme is a client-server base as given", () => {
  assert.deepEqual(readServer("http://localhost:8008"), { kind: "url", baseUrl: "http://localhost:8008" });
  assert.deepEqual(readServer("https://matrix.unredacted.org/"), { kind: "url", baseUrl: "https://matrix.unredacted.org" });
});

void test("a path survives, because a homeserver may live under one", () => {
  assert.deepEqual(readServer("https://example.org/matrix"), { kind: "url", baseUrl: "https://example.org/matrix" });
});

void test("surrounding whitespace is ignored", () => {
  assert.deepEqual(readServer("  matrix.org  "), { kind: "name", serverName: "matrix.org" });
});

void test("empty and unusable input is refused", () => {
  assert.equal(readServer(""), null);
  assert.equal(readServer("   "), null);
  assert.equal(readServer("ftp://example.org"), null);
  assert.equal(readServer("two words"), null);
});
