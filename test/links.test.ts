import assert from "node:assert/strict";
import test from "node:test";
import { messageLinks, uniqueLinks } from "../src/core/links.ts";

void test("message links are safe, unique, and cover body and HTML", () => {
  const links = messageLinks(
    "See https://example.org/a and https://example.org/a.",
    '<a href="https://matrix.org/client">client</a>',
  );
  assert.deepEqual(
    links.map((link) => link.url),
    ["https://example.org/a", "https://matrix.org/client"],
  );
  assert.equal(links[0]?.host, "example.org");
  assert.deepEqual(messageLinks("javascript:alert(1) file:///etc/passwd", null), []);
});

void test("unique links preserve first-seen order across messages", () => {
  assert.deepEqual(
    uniqueLinks([
      { body: "https://b.example/x", html: null },
      { body: "https://a.example/y https://b.example/x", html: null },
    ]).map((link) => link.url),
    ["https://b.example/x", "https://a.example/y"],
  );
});
