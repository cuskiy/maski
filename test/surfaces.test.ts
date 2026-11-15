import assert from "node:assert/strict";
import test from "node:test";
import { emptyChatState } from "../src/core/state.ts";
import { SURFACE } from "../src/core/regions.ts";
import { CHAT_SURFACES } from "../src/core/surfaces.ts";
import { surfaceBodyFor } from "../src/components/surfaces.ts";
import { ALL_EMOJI } from "../src/components/emoji.ts";
import { en } from "../src/catalogs/en.ts";
import { mockChatState } from "../src/core/mock.ts";

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

void test("the sticker picker includes every emoji and the recent stickers", () => {
  const state = {
    ...emptyChatState(),
    phase: "ready" as const,
    recentStickers: ["👋", "🐱"],
  };
  const markup = surfaceBodyFor(en, SURFACE.sticker, state).value;
  assert.match(markup, /data-sticker-tab="emoji"/u);
  assert.match(markup, /data-sticker-tab="surface.sticker.pack1"/u);
  assert.match(markup, /data-sticker-panel="emoji"/u);
  assert.match(markup, /sticker-recent-grid/u);
  assert.equal((markup.match(/data-emoji=/gu) ?? []).length, ALL_EMOJI.length);
});

void test("the message menu supports selection and forwarding offers rooms", () => {
  const state = mockChatState();
  const menu = surfaceBodyFor(en, SURFACE.messageMenu, state).value;
  assert.match(menu, /data-action="messageMenu.select"/u);
  const forward = surfaceBodyFor(en, SURFACE.forward, state).value;
  assert.match(forward, /data-forward-room="design"/u);
});

void test("room menus, scoped search, and media files expose the new controls", () => {
  const state = mockChatState();
  const roomMenu = surfaceBodyFor(en, SURFACE.roomMenu, state).value;
  assert.match(roomMenu, /data-menu-key="roomMenu.mediaFiles"/u);
  assert.match(roomMenu, /data-menu-key="roomMenu.search"/u);
  assert.match(roomMenu, /data-menu-key="roomMenu.invite"/u);
  const search = surfaceBodyFor(en, SURFACE.search, state).value;
  assert.match(search, /data-search-scope-option="all"/u);
  assert.match(search, /data-search-scope-option="design"/u);
  assert.ok(search.indexOf('data-search-scope-option="all"') < search.indexOf('data-search-scope-option="design"'));
  const media = surfaceBodyFor(en, SURFACE.mediaFiles, state).value;
  assert.match(media, /data-media-files-tab="media"/u);
  assert.match(media, /data-media-files-tab="files"/u);
});
