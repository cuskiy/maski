import assert from "node:assert/strict";
import test from "node:test";
import { emptyChatState } from "../src/core/state.ts";
import { SURFACE } from "../src/core/regions.ts";
import { CHAT_SURFACES } from "../src/core/surfaces.ts";
import { surfaceBodyFor } from "../src/components/surfaces.ts";
import { en } from "../src/catalogs/en.ts";

void test("chat surfaces are unique and come from the shared id registry", () => {
  const ids = CHAT_SURFACES.map((surface) => surface.id);
  assert.equal(new Set(ids).size, ids.length);
  const known = new Set<string>(Object.values(SURFACE));
  for (const id of ids) assert.ok(known.has(id), id);
  assert.deepEqual(
    [...known].filter((id) => !ids.includes(id)).toSorted(),
    [SURFACE.language, SURFACE.navMenu].toSorted(),
  );
});

void test("only context menus opt out of automatic popover dismissal", () => {
  assert.deepEqual(
    CHAT_SURFACES.filter((surface) => surface.popover === "manual")
      .map((surface) => surface.id)
      .toSorted(),
    [SURFACE.messageMenu, SURFACE.reaction, SURFACE.roomMenu, SURFACE.sendMenu].toSorted(),
  );
  for (const surface of CHAT_SURFACES) {
    if (surface.kind === "modal") assert.equal(surface.popover, undefined, surface.id);
  }
});

void test("the reaction picker offers a useful choice set", () => {
  const markup = surfaceBodyFor(en, SURFACE.reaction, emptyChatState()).value;
  assert.equal((markup.match(/data-react-choice=/gu) ?? []).length, 12);
});

void test("the booted sticker picker is filled by the client, not the shell", () => {
  const markup = surfaceBodyFor(en, SURFACE.sticker, emptyChatState()).value;
  assert.doesNotMatch(markup, /data-sticker=/u);
});
