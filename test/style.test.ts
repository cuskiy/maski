import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const styles = new URL("../src/styles/", import.meta.url);
const css = readdirSync(styles)
  .filter((file) => file.endsWith(".css"))
  .map((file) => readFileSync(new URL(file, styles), "utf8"))
  .join("\n");

void test("every declared custom property is used", () => {
  const definitions = [...css.matchAll(/^\s*(--[a-z0-9-]+):/gmu)].map((match) => match[1]);
  const references = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gu)].map((match) => match[1]));
  assert.deepEqual(
    definitions.filter((name) => !references.has(name ?? "")),
    [],
  );
});

void test("color tokens are semantic roles, not numbered or component aliases", () => {
  assert.doesNotMatch(css, /--(?:bg|text)-\d+\s*:/u);
  assert.doesNotMatch(css, /var\(--(?:bg|text)-\d+\)/u);
  assert.doesNotMatch(css, /^\s*--[a-z0-9-]+-text\s*:/gmu);
});

void test("there is no vendor-prefixed selector or literal text colour", () => {
  assert.doesNotMatch(css, /::-webkit-/u);
  assert.doesNotMatch(css, /color:\s*(?:#[0-9a-f]{3,8}|rgba?\()/iu);
  assert.doesNotMatch(css, /background(?:-color)?:\s*(?:#[0-9a-f]{3,8}|rgba?\()/iu);
  assert.doesNotMatch(css, /text-wrap:\s*pretty/u);
  assert.match(css, /\.composer-input:focus-visible\s*\{\s*outline:\s*none;\s*\}/u);
  assert.equal([...css.matchAll(/outline:\s*none/gu)].length, 1);
});

void test("layout responds to containers, not viewport width media queries", () => {
  assert.doesNotMatch(css, /@media\s*\([^)]*(?:min-|max-)?width/u);
});

void test("the color palette keeps the backup values", () => {
  const definitions = new Map(
    [...css.matchAll(/^\s*(--[a-z0-9-]+):\s*(.+);$/gmu)].map((match) => [match[1], match[2]]),
  );
  const palette = {
    "--page": "light-dark(rgb(255 255 255), rgb(24 23 21))",
    "--ink": "light-dark(rgb(20 20 20), rgb(228 225 220))",
    "--ink-2": "light-dark(rgb(77 77 77), rgb(169 166 161))",
    "--ink-3": "light-dark(rgb(102 102 102), rgb(137 134 129))",
    "--ink-4": "light-dark(rgb(130 130 130), rgb(105 102 98))",
    "--surface": "light-dark(rgb(244 244 244), rgb(32 31 29))",
    "--surface-hover": "light-dark(rgb(236 236 236), rgb(41 39 37))",
    "--surface-active": "light-dark(rgb(226 226 226), rgb(49 47 44))",
    "--bubble": "light-dark(rgb(241 241 241), rgb(34 33 31))",
    "--bubble-hover": "light-dark(rgb(233 233 233), rgb(42 40 38))",
    "--bubble-ink": "light-dark(rgb(20 20 20), rgb(222 218 210))",
    "--menu-hover": "light-dark(rgb(238 238 238), rgb(41 39 37))",
    "--menu-active": "light-dark(rgb(228 228 228), rgb(49 47 44))",
    "--float": "light-dark(rgb(253 253 253 / 88%), rgb(32 31 29 / 88%))",
    "--chrome": "light-dark(rgb(251 251 251 / 82%), rgb(29 28 26 / 82%))",
    "--nav": "light-dark(rgb(241 241 241 / 94%), rgb(30 29 27 / 94%))",
    "--focus": "light-dark(rgb(102 102 102), rgb(137 134 129))",
    "--danger": "light-dark(rgb(150 97 92), rgb(217 167 161))",
    "--danger-soft": "light-dark(rgb(150 97 92 / 10%), rgb(217 167 161 / 14%))",
    "--mark": "light-dark(rgb(232 232 232), rgb(64 62 59))",
    "--selection": "light-dark(rgb(20 20 20 / 14%), rgb(228 225 220 / 16%))",
    "--scrim": "rgb(0 0 0 / 46%)",
    "--scrollbar": "light-dark(rgb(20 20 20 / 22%), rgb(228 225 220 / 20%))",
    "--code": "light-dark(rgb(20 20 20 / 6%), rgb(228 225 220 / 8%))",
    "--media-ink": "rgb(255 255 255)",
    "--media-bg": "light-dark(rgb(78 78 78 / 62%), rgb(88 87 84 / 62%))",
  };
  for (const [name, value] of Object.entries(palette)) {
    assert.equal(definitions.get(name), value, name);
  }
});

void test("the topbar and navigation keep their papers and floating surfaces share one blur", () => {
  assert.match(css, /\.nav\s*\{[^}]*background:\s*var\(--nav\)/u);
  assert.match(css, /\.room-header\s*\{[^}]*background:\s*var\(--chrome\)/u);
  assert.match(
    css,
    /\.surface\.floating\s*\{[^}]*background:\s*var\(--menu-bg\)[^}]*color:\s*var\(--menu-ink\)[^}]*backdrop-filter:\s*blur\(var\(--float-blur\)\)/u,
  );
});

void test("grouped bubbles chain their inner corners and keep the avatars on the end", () => {
  assert.match(
    css,
    /\.message:not\(\.is-own\)\.is-group-start:not\(\.is-group-end\)\s*\{[^}]*--bubble-end-start:\s*var\(--bubble-inner\);[^}]*\}/u,
  );
  assert.match(
    css,
    /\.message:not\(\.is-own, \.is-group-start, \.is-group-end\)\s*\{[^}]*--bubble-start-start:\s*var\(--bubble-inner\);[^}]*--bubble-end-start:\s*var\(--bubble-inner\);/u,
  );
  assert.match(
    css,
    /\.message:not\(\.is-own\)\.is-group-end:not\(\.is-group-start\)\s*\{[^}]*--bubble-start-start:\s*var\(--bubble-inner\);[^}]*\}/u,
  );
  assert.match(
    css,
    /\.message\.is-own\.is-group-start:not\(\.is-group-end\)\s*\{[^}]*--bubble-end-end:\s*var\(--bubble-inner\);[^}]*\}/u,
  );
  assert.match(
    css,
    /\.message\.is-own:not\(\.is-group-start, \.is-group-end\)\s*\{[^}]*--bubble-start-end:\s*var\(--bubble-inner\);[^}]*--bubble-end-end:\s*var\(--bubble-inner\);/u,
  );
  assert.match(
    css,
    /\.message\.is-own\.is-group-end:not\(\.is-group-start\)\s*\{[^}]*--bubble-start-end:\s*var\(--bubble-inner\);[^}]*\}/u,
  );
  assert.match(css, /\.message:not\(\.is-group-end\)\s+\.message-avatar\s*\{[^}]*visibility:\s*hidden;/u);
  assert.match(css, /\.message-avatar\s*\{[^}]*align-self:\s*end;/u);
});

void test("each paper declares its own text and state roles", () => {
  for (const token of [
    "--nav-ink",
    "--nav-muted",
    "--nav-faint",
    "--nav-hover-bg",
    "--nav-active-bg",
    "--nav-active-ink",
    "--nav-active-muted",
    "--account-bg",
    "--account-ink",
    "--account-muted",
    "--topbar-title-ink",
    "--topbar-topic-ink",
    "--topbar-control-ink",
    "--bubble-bg",
    "--bubble-meta-ink",
    "--menu-bg",
    "--menu-ink",
    "--menu-muted",
    "--dialog-bg",
    "--dialog-ink",
    "--dialog-muted",
    "--field-bg",
    "--field-ink",
    "--field-placeholder",
    "--composer-ink",
    "--composer-muted",
    "--card-bg",
    "--card-ink",
    "--card-muted",
  ]) {
    assert.match(css, new RegExp(`${token}:`, "u"), token);
  }
  assert.match(css, /\.room\.is-active \.room-name\s*\{[^}]*color:\s*var\(--nav-active-ink\)/u);
  assert.match(css, /\.bubble-meta\s*\{[^}]*color:\s*var\(--bubble-meta-ink\)/u);
  assert.match(css, /\.surface-item\s*\{[^}]*color:\s*var\(--menu-ink\)/u);
  assert.match(css, /\.setting-line\s*\{[^}]*color:\s*var\(--dialog-ink\)/u);
  assert.match(css, /\.composer-field\s*\{[^}]*background:\s*var\(--field-bg\)/u);
});

void test("the scriptless shell lays out both frames", () => {
  assert.match(css, /\.app\[data-view="shell"\]\s*\{/u);
  assert.match(css, /\.app\[data-view="shell"\] > \.nav\s*\{/u);
  assert.match(css, /\.app\[data-view="shell"\] > \.content\s*\{/u);
});

void test("the switch knob starts left and the dialog has a weaker blur", () => {
  assert.match(
    css,
    /\.setting-row:has\(> input\[type="checkbox"\]\)::after\s*\{[^}]*inset-inline-end:\s*calc\(var\(--space-2\) \+ 2rem - 0\.875rem - 0\.125rem\);[^}]*\}/u,
  );
  assert.match(css, /\.surface\.modal\s*\{[^}]*backdrop-filter:\s*blur\(var\(--dialog-blur\)\)/u);
});

void test("media previews stay compact and the viewer can zoom", () => {
  assert.match(css, /\.message-media\.is-video\s*\{[^}]*var\(--media-video-width\)/u);
  assert.match(css, /\.viewer-zoom\.is-zoomed\s*\{/u);
  assert.match(css, /\.message-media\.is-sticker \.media-footer\s*\{[^}]*position:\s*static/u);
  assert.match(css, /#surface-viewer\s*\{[^}]*56rem/u);
  assert.match(css, /#surface-viewer \.surface-head\s*\{[^}]*position:\s*absolute/u);
  assert.match(css, /#surface-viewer \.surface-head h2\s*\{[^}]*clip-path:\s*inset\(50%\)/u);
});
