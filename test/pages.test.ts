import { test } from "node:test";
import assert from "node:assert/strict";
import { minify } from "html-minifier-terser";
import { locales } from "../src/catalogs/index.ts";
import { base } from "../src/layouts/base.ts";
import { chatView } from "../src/pages/chat.ts";
import { keyView } from "../src/pages/key.ts";
import { loginView } from "../src/pages/login.ts";
import { registerView } from "../src/pages/register.ts";
import { routerView } from "../src/pages/router.ts";
import { serverView } from "../src/pages/server.ts";
import { REGION, SURFACE } from "../src/core/regions.ts";
import { renderPages } from "../scripts/pages.ts";
import type { PageContext } from "../src/pages/kit.ts";

const assets = {
  stylesheet: "/assets/style-x.css",
  icon: "/assets/icon-x.svg",
  guard: "/assets/guard-x.js",
  prepaint: "/assets/prepaint-x.js",
  client: "/assets/client-x.js",
};

const views = {
  router: routerView,
  chat: chatView,
  server: serverView,
  login: loginView,
  register: registerView,
  key: keyView,
};

function pages(): Array<{ name: string; html: string }> {
  return locales.flatMap((locale) =>
    Object.entries(views).map(([name, view]) => {
      const context: PageContext = { locale, assets, path: `/${name}/`, localePath: "/", alternates: [] };
      const page = view(context);
      const document = base({
        c: locale.catalog,
        page: name,
        lang: locale.id,
        title: page.title,
        description: "x",
        canonical: "/",
        alternates: [],
        assets,
        body: page.body,
      });
      return { name: `${locale.id}/${name}`, html: document.value };
    }),
  );
}

for (const page of pages()) {
  void test(`${page.name}: one h1, a locale, no inline code, a note`, () => {
    assert.equal([...page.html.matchAll(/<h1[\s>]/gu)].length, 1);
    assert.match(page.html, /<html lang="[A-Za-z-]+"/u);
    assert.doesNotMatch(page.html, /<style[\s>]/u);
    assert.doesNotMatch(page.html, /<script(?![^>]*\ssrc=)[^>]*>/u);
    assert.doesNotMatch(page.html, /\sstyle="/u);
    assert.doesNotMatch(page.html, /\son[a-z]+=/u);
    assert.doesNotMatch(page.html, /javascript:/u);
    assert.match(page.html, /<noscript>/u);
  });
}

void test("chat carries every region and surface", () => {
  const chat = pages().find((page) => page.name === "en/chat")?.html ?? "";
  for (const id of Object.values(REGION)) assert.ok(chat.includes(`data-region="${id}"`), id);
  for (const id of Object.values(SURFACE)) assert.ok(chat.includes(`id="${id}"`), id);
});

void test("chat context menus are manual popovers", () => {
  const chat = pages().find((page) => page.name === "en/chat")?.html ?? "";
  for (const id of [SURFACE.roomMenu, SURFACE.messageMenu, SURFACE.sendMenu]) {
    const section = new RegExp(`<section[^>]*id="${id}"[^>]*>`, "u").exec(chat)?.[0] ?? "";
    assert.match(section, /popover="manual"/u, id);
  }
});

void test("generated locale pages carry their real addresses", () => {
  const emitted = renderPages(assets);
  const register = emitted.find((page) => page.file === "zh-CN/register/index.html");
  assert.ok(register !== undefined);
  assert.match(register.content, /<link rel="canonical" href="\/zh-CN\/register\/"/u);
  assert.match(register.content, /<link rel="alternate" hreflang="en" href="\/en\/register\/"/u);
});

void test("surfaces have a close control and an accessible title", () => {
  for (const page of pages()) {
    if (page.html.includes('class="surface modal')) {
      assert.match(page.html, /class="surface-head"/u, page.name);
      assert.match(page.html, /class="surface-close"/u, page.name);
      assert.match(page.html, /class="surface modal[^"]*"[^>]*aria-labelledby="/u, page.name);
    }
  }
});

void test("chat rows have no ellipsis menu trigger", () => {
  const chat = pages().find((page) => page.name === "en/chat")?.html ?? "";
  assert.doesNotMatch(chat, /class="(?:message-more|room-more)"/u);
  assert.match(chat, /aria-haspopup="menu"/u);
});

for (const page of pages()) {
  void test(`${page.name}: forms post so secrets never enter the URL`, () => {
    for (const match of page.html.matchAll(/<form\b[^>]*>/gu)) {
      assert.match(match[0], /method="post"/u);
    }
  });
}

const minifyOptions = { collapseWhitespace: true, removeComments: true } as const;

function textRuns(markup: string): string[] {
  return [...markup.matchAll(/>([^<]+)</gu)]
    .map((match) => (match[1] ?? "").replace(/\s+/gu, " ").trim())
    .filter((run) => run.length > 0);
}

for (const page of pages()) {
  void test(`${page.name}: keeps its visible text when minified`, async () => {
    assert.deepEqual(textRuns(await minify(page.html, minifyOptions)), textRuns(page.html));
  });
}
