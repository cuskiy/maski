import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { emptyChatState } from "../src/core/state.ts";
import { SURFACE } from "../src/core/regions.ts";
import { CHAT_SURFACES } from "../src/core/surfaces.ts";
import { surfaceBodyFor } from "../src/components/surfaces.ts";
import { surfaceHead } from "../src/components/surface.ts";
import { reactionsView } from "../src/components/timeline.ts";
import { timeline } from "../src/components/timeline.ts";
import { ALL_EMOJI, emojiPickerBody } from "../src/components/emoji.ts";
import { LICENSES } from "../src/core/licenses.ts";
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
    [SURFACE.messageMenu, SURFACE.reaction, SURFACE.roomMenu, SURFACE.selectionMenu, SURFACE.sendMenu].toSorted(),
  );
  for (const surface of CHAT_SURFACES) {
    if (surface.kind === "modal") assert.equal(surface.popover, undefined, surface.id);
  }
});

void test("window close controls use the shared icon", () => {
  const markup = surfaceHead(en, "surface-test", "settings.about").value;
  assert.match(markup, /class="surface-close"[^>]*><svg class="icon"/u);
  assert.doesNotMatch(markup, /×/u);
});

void test("the selection menu offers copy, forward and delete", () => {
  const markup = surfaceBodyFor(en, SURFACE.selectionMenu, emptyChatState()).value;
  const actions = [...markup.matchAll(/data-action="(selection\.[^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(actions, ["selection.copy", "selection.forward", "selection.delete"]);
  assert.doesNotMatch(markup, /selection\.share/u);
});

void test("the reaction picker reuses the full emoji panel in its own mode", () => {
  const markup = emojiPickerBody(en, [], "reaction").value;
  assert.match(markup, /data-emoji-mode="reaction"/u);
  const choices = new Set([...markup.matchAll(/data-react-choice="([^"]+)"/gu)].map((match) => match[1]));
  assert.deepEqual(choices, new Set(ALL_EMOJI));
  assert.equal((markup.match(/data-emoji-section=/gu) ?? []).length, 8);
});

void test("reactions sort by count and fold the tail", () => {
  const base = mockChatState().messages.find((message) => message.reactions.length > 0);
  assert.ok(base);
  const keys = ["😀", "😂", "❤️", "👍", "🎉", "🔥", "👀", "💔"];
  const counts = [1, 7, 2, 6, 3, 5, 4, 8];
  const message = {
    ...base,
    reactions: keys.map((key, index) => ({ key, count: counts[index] ?? 0, mine: false })),
  };
  const markup = reactionsView(message, en).value;
  const order = [...markup.matchAll(/data-reaction="([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(order, ["💔", "😂", "👍", "🔥", "👀", "🎉", "❤️", "😀"]);
  assert.equal((markup.match(/data-reaction-extra/gu) ?? []).length, 2);
  assert.match(markup, /data-reaction-more/u);
  assert.match(markup, /data-reaction-count="2"/u);
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
  assert.match(markup, /id="sticker-tab-emoji"[\s\S]{0,180}aria-selected="true"/u);
  assert.match(markup, /id="sticker-tab-surface\.sticker\.pack1"[\s\S]{0,180}aria-selected="false"/u);
  assert.match(markup, /data-sticker-panel="emoji"/u);
  assert.doesNotMatch(markup, /data-sticker-panel="emoji"\s+hidden/u);
  assert.match(markup, /sticker-recent-grid/u);
  assert.equal((markup.match(/data-emoji=/gu) ?? []).length, ALL_EMOJI.length);
});

void test("the message menu offers source and forwarding offers rooms", () => {
  const state = mockChatState();
  const menu = surfaceBodyFor(en, SURFACE.messageMenu, state).value;
  const actions = [...menu.matchAll(/data-action="(messageMenu\.[^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(actions, [
    "messageMenu.reply",
    "messageMenu.react",
    "messageMenu.edit",
    "messageMenu.delete",
    "messageMenu.copy",
    "messageMenu.source",
    "messageMenu.select",
    "messageMenu.cancel",
  ]);
  assert.doesNotMatch(menu, /messageMenu\.retry/u);
  const forward = surfaceBodyFor(en, SURFACE.forward, state).value;
  assert.match(forward, /data-forward-room="design"/u);
});

void test("invites expose the inviter profile and the two decisions", () => {
  const markup = surfaceBodyFor(en, SURFACE.invite, mockChatState()).value;
  assert.match(markup, /data-profile="Alice"/u);
  assert.match(markup, /data-profile-id="@alice:matrix\.org"/u);
  assert.match(markup, /class="invite-id" dir="ltr">@alice:matrix\.org/u);
  assert.match(markup, /data-invite-action="accept"/u);
  assert.match(markup, /data-invite-action="decline"/u);
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
  assert.match(media, /data-media-files-tab="links"/u);
});

void test("settings expose notification levels, keys, devices, reset and licenses", () => {
  const markup = surfaceBodyFor(en, SURFACE.settings, mockChatState()).value;
  assert.match(markup, /data-select-name="notification-level"/u);
  assert.match(markup, /data-setting="desktop"/u);
  assert.match(markup, /data-settings-action="reset-key"/u);
  assert.match(markup, /data-settings-action="reset-identity"/u);
  assert.match(markup, /id="reset-key-dialog"/u);
  assert.match(markup, /commandfor="reset-key-dialog"/u);
  assert.match(markup, /data-reset-key-value/u);
  assert.doesNotMatch(markup, /data-settings-action="sign-out-all"/u);
  assert.match(markup, /data-settings-action="sign-out-others"/u);
  assert.match(markup, /data-settings-action="verify-device"/u);
  assert.match(markup, /id="device-sas-dialog"/u);
  assert.match(markup, /Verification needs the Matrix sync worker/u);
  assert.doesNotMatch(markup, /data-sas-match/u);
  assert.match(markup, /commandfor="surface-licenses"/u);
  assert.doesNotMatch(markup, /No analytics/u);
  const desktop = markup.indexOf('data-setting="desktop"');
  const badge = markup.indexOf('data-setting="badge"');
  const title = markup.indexOf('data-setting="titleTotal"');
  const preview = markup.indexOf('data-setting="preview"');
  const level = markup.indexOf('data-select-name="notification-level"');
  assert.ok(desktop < badge && badge < title && title < preview && preview < level);
});

void test("room access controls are disabled without management permission", () => {
  const state = mockChatState();
  const markup = surfaceBodyFor(en, SURFACE.roomSettings, { ...state, roomId: "lobby" }).value;
  assert.match(markup, /data-select-name="room-join"[\s\S]{0,420}disabled/u);
  assert.doesNotMatch(markup, /data-room-name-input/u);
});

void test("the older control becomes a busy spinner while loading", () => {
  const state = { ...mockChatState(), hasOlder: true, olderLoading: true };
  const markup = timeline(state, en, "en").value;
  assert.match(markup, /class="load-older is-loading"/u);
  assert.match(markup, /aria-busy="true"/u);
  assert.match(markup, /class="router-spinner"/u);
});

void test("room invite uses its own dialog rather than the incoming inbox", () => {
  const state = mockChatState();
  const invite = surfaceBodyFor(en, SURFACE.roomInvite, state).value;
  assert.match(invite, /data-surface="room-invite"/u);
  assert.match(invite, /id="room-invite-field"/u);
  assert.match(surfaceBodyFor(en, SURFACE.invite, state).value, /data-profile="Alice"/u);
});

void test("room settings expose editable overview, member tabs and moderation", () => {
  const markup = surfaceBodyFor(en, SURFACE.roomSettings, mockChatState()).value;
  assert.match(markup, /data-room-name-input/u);
  assert.match(markup, /data-room-topic-input/u);
  assert.match(markup, /data-room-address-input/u);
  assert.match(markup, /data-room-address-remove="#design:matrix.org"/u);
  assert.match(markup, /class="address-value"[^>]*>#design:matrix\.org/u);
  assert.match(markup, /data-room-address-remove="#design:matrix\.org"[\s\S]{0,420}M3 6h18/u);
  assert.match(markup, /data-member-group="join"/u);
  assert.match(markup, /data-member-group="invite"/u);
  assert.match(markup, /data-member-group="ban"/u);
  assert.match(markup, /data-member-action="kick"/u);
  assert.match(markup, /data-select-name="room-notifications"/u);
  assert.match(markup, /data-select-name="room-join"/u);
  assert.match(markup, /data-select-name="room-guest"/u);
  assert.match(markup, /data-select-name="room-history"/u);
  assert.match(markup, /data-select-name="room-directory"/u);
  assert.match(markup, /<code dir="ltr">design<\/code>/u);
});

void test("the licenses surface lists the shipped runtime dependencies", () => {
  const markup = surfaceBodyFor(en, SURFACE.licenses, mockChatState()).value;
  for (const name of ["matrix-js-sdk", "dompurify", "marked", "Lucide"]) assert.match(markup, new RegExp(name, "u"));
  assert.match(markup, /Apache-2\.0/u);
  assert.match(markup, /MIT/u);
  assert.match(markup, /ISC/u);
});

void test("runtime license versions match the manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    dependencies: Record<string, string>;
  };
  for (const entry of LICENSES) {
    const range = manifest.dependencies[entry.name];
    assert.ok(range !== undefined, entry.name);
    assert.equal(range.replace(/^[~^]/u, ""), entry.version, entry.name);
  }
});
