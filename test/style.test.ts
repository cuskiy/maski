import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles/style.css", import.meta.url), "utf8");

void test("every declared custom property is used", () => {
  const definitions = [...css.matchAll(/^\s*(--[a-z0-9-]+):/gmu)].map((match) => match[1]);
  const references = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gu)].map((match) => match[1]));
  assert.deepEqual(
    definitions.filter((name) => !references.has(name ?? "")),
    [],
  );
});

void test("there is no vendor-prefixed selector or literal text colour", () => {
  assert.doesNotMatch(css, /::-webkit-/u);
  assert.doesNotMatch(css, /color:\s*(?:#[0-9a-f]{3,8}|rgba?\()/iu);
  assert.doesNotMatch(css, /text-wrap:\s*pretty/u);
  assert.match(css, /\.composer-input:focus-visible\s*\{\s*outline:\s*none;\s*\}/u);
  assert.equal([...css.matchAll(/outline:\s*none/gu)].length, 1);
});

void test("layout responds to containers, not viewport width media queries", () => {
  assert.doesNotMatch(css, /@media\s*\([^)]*(?:min-|max-)?width/u);
});
