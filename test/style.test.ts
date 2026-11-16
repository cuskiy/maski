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
    "--float": "light-dark(rgb(252 252 251 / 92%), rgb(32 31 29 / 88%))",
    "--chrome": "light-dark(rgb(251 251 251 / 82%), rgb(29 28 26 / 82%))",
    "--nav": "light-dark(rgb(245 245 245 / 94%), rgb(30 29 27 / 94%))",
    "--focus": "light-dark(rgb(120 120 120), rgb(120 120 120))",
    "--danger": "light-dark(rgb(150 97 92), rgb(217 167 161))",
    "--danger-soft": "light-dark(rgb(150 97 92 / 10%), rgb(217 167 161 / 14%))",
    "--mark": "light-dark(rgb(232 232 232), rgb(64 62 59))",
    "--selection": "light-dark(rgb(99 113 133 / 16%), rgb(167 181 200 / 18%))",
    "--scrim": "rgb(0 0 0 / 46%)",
    "--scrollbar": "light-dark(rgb(20 20 20 / 22%), rgb(228 225 220 / 20%))",
    "--code": "light-dark(rgb(20 20 20 / 6%), rgb(228 225 220 / 8%))",
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
  assert.match(
    css,
    /\.bubble\s*\{[^}]*border-radius:\s*var\(--bubble-start-start\)\s+var\(--bubble-start-end\)\s+var\(--bubble-end-end\)\s+var\(--bubble-end-start\)/u,
  );
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

void test("the scriptless list lays out both frames", () => {
  assert.match(css, /@media \(scripting: none\)\s*\{[^}]*\.app\[data-view="list"\]\s*\{/u);
  assert.match(css, /\.app\[data-view="list"\] > \.nav\s*\{/u);
  assert.match(css, /\.app\[data-view="list"\] > \.content\s*\{/u);
});

void test("the switch knob starts left and the dialog has a weaker blur", () => {
  assert.match(
    css,
    /\.setting-row:has\(> input\[type="checkbox"\]\)::after\s*\{[^}]*inset-inline-end:\s*calc\(var\(--space-2\) \+ 2rem - 0\.875rem - 0\.125rem\);[^}]*\}/u,
  );
  assert.match(css, /\.surface\.modal\s*\{[^}]*backdrop-filter:\s*blur\(var\(--dialog-blur\)\)/u);
  assert.match(css, /#surface-viewer\s*\{[^}]*backdrop-filter:\s*blur\(var\(--dialog-blur\)\)/u);
  assert.match(css, /#surface-viewer::backdrop\s*\{[^}]*blur\(var\(--scrim-blur\)\)/u);
});

void test("media previews stay compact and the viewer can zoom", () => {
  assert.match(css, /\.message-media\.is-video\s*\{[^}]*var\(--media-video-width\)/u);
  assert.match(css, /\.viewer-zoom\.is-zoomed\s*\{/u);
  assert.match(css, /\.media-footer\s*\{[^}]*position:\s*absolute/u);
  assert.match(css, /\.media-footer \.bubble-meta\s*\{[^}]*var\(--media-watermark-bg\)/u);
  assert.match(css, /\.media-element\s*\{[^}]*object-fit:\s*contain/u);
  assert.match(css, /\.reactions\s*\{[^}]*grid-row:\s*2/u);
  assert.match(css, /\.tray-item\.has-thumb \.tray-remove\s*\{[^}]*position:\s*absolute/u);
  assert.match(css, /#surface-viewer \.surface-close:hover,[\s\S]*?background:\s*color-mix\(/u);
  assert.match(css, /\.message-media\.is-sticker \.media-footer\s*\{[^}]*position:\s*absolute/u);
  assert.match(css, /\.message-media\.is-sticker \.media-frame\s*\{[^}]*padding-block-end:\s*1\.15rem/u);
  assert.doesNotMatch(css, /\.message\.is-own \.message-media\.is-sticker \.media-footer/u);
  assert.match(css, /#surface-viewer\s*\{[^}]*30rem/u);
  assert.match(css, /#surface-viewer:has\(\.viewer-preview\.is-image\)\s*\{[^}]*inline-size:\s*fit-content/u);
  assert.match(css, /#surface-viewer \.surface-head\s*\{[^}]*position:\s*absolute/u);
  assert.match(css, /#surface-viewer \.surface-head h2\s*\{[^}]*clip-path:\s*inset\(50%\)/u);
});

void test("the account card uses its rest and hover roles semantically", () => {
  assert.match(css, /\.nav-account\s*\{[^}]*background:\s*var\(--account-bg\)/u);
  assert.match(css, /\.nav-account:hover\s*\{[^}]*background:\s*var\(--account-hover-bg\)/u);
});

void test("light dialog fields and form spacing use the corrected rhythm", () => {
  assert.match(css, /--dialog-field-bg: light-dark\(rgb\(246 246 246\)/u);
  assert.match(css, /--switch-on-bg: color-mix\(/u);
  assert.match(css, /\.form\s*\{[^}]*gap:\s*var\(--space-4\)/u);
  assert.match(css, /\.form > \.button-primary\s*\{[^}]*margin-block-start:\s*var\(--space-1\)/u);
  assert.match(css, /\.field\s*\{[^}]*gap:\s*var\(--space-2\)/u);
  assert.match(css, /\.surface \.button-primary\s*\{[^}]*background:\s*var\(--dialog-action-bg\)/u);
  assert.match(css, /\.address-row \.address-value\s*\{[^}]*background:\s*var\(--dialog-field-bg\)/u);
  assert.match(css, /\.message-media\.is-sticker \.media-footer\s*\{[^}]*position:\s*absolute/u);
  assert.doesNotMatch(css, /\.message\.is-own \.message-media\.is-sticker \.media-footer/u);
});

void test("the first unread row adds no background reveal", () => {
  assert.doesNotMatch(css, /is-unread-reveal/u);
});

void test("window close, select, member and input controls keep their corrected shapes", () => {
  assert.match(css, /\.surface-close\s*\{[^}]*inline-size:\s*1\.5rem;[^}]*block-size:\s*1\.5rem;/u);
  assert.match(css, /\.surface-close \.icon\s*\{[^}]*inline-size:\s*0\.625rem;/u);
  assert.match(css, /\.member-list\s*\{[^}]*align-content:\s*start;[^}]*grid-auto-rows:\s*min-content;/u);
  assert.match(
    css,
    /\.member-more\s*\{[^}]*inline-size:\s*2rem;[^}]*margin-inline-end:\s*var\(--space-1\);[^}]*border-radius:\s*50%;/u,
  );
  assert.match(css, /\.select-popover\s*\{[^}]*background:\s*var\(--menu-bg\)/u);
  assert.match(css, /\.select-trigger\[aria-expanded="true"\] \.icon\s*\{[^}]*rotate:\s*90deg/u);
  assert.match(css, /#surface-room-settings \.address-row \.button-icon\s*\{[^}]*background:\s*transparent/u);
  assert.match(
    css,
    /#surface-room-settings \.address-row \.button-icon:hover,[^}]*background:\s*var\(--dialog-hover-bg\)/u,
  );
  assert.match(css, /\.search-scope\s*\{[^}]*background:\s*var\(--menu-bg\)/u);
});

void test("enabled controls keep readable ink and inputs use the soft focus", () => {
  assert.match(css, /\.button-quiet\s*\{[^}]*color:\s*var\(--ink\)/u);
  assert.match(css, /\.surface \.button-quiet:not\(\.is-danger\)\s*\{[^}]*color:\s*var\(--dialog-ink\)/u);
  assert.match(css, /\.section-head\s*\{[^}]*color:\s*var\(--nav-ink\)/u);
  assert.match(css, /--nav-badge-bg:\s*color-mix\(in srgb, var\(--nav\) 88%, var\(--ink\) 12%\)/u);
  assert.match(css, /\.input:focus-visible\s*\{[^}]*outline:\s*var\(--outline-width\) solid var\(--field-focus\)/u);
  assert.match(css, /\.composer-input\[data-empty="true"\]::before\s*\{[^}]*position:\s*absolute/u);
});
