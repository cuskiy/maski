import assert from "node:assert/strict";
import test from "node:test";
import { SURFACE } from "../src/core/regions.ts";
import { CHAT_SURFACES } from "../src/core/surfaces.ts";

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
    [SURFACE.messageMenu, SURFACE.roomMenu, SURFACE.sendMenu].toSorted(),
  );
  for (const surface of CHAT_SURFACES) {
    if (surface.kind === "modal") assert.equal(surface.popover, undefined, surface.id);
  }
});
