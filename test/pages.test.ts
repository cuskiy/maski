import { test } from "node:test";
import assert from "node:assert/strict";
import { minify } from "html-minifier-terser";
import { en } from "../src/catalogs/en.ts";
import { zhCN } from "../src/catalogs/zh-CN.ts";
import { locales } from "../src/catalogs/index.ts";
import { base } from "../src/layouts/base.ts";
import { chatView } from "../src/pages/chat.ts";
import { keyView } from "../src/pages/key.ts";
import { loginView } from "../src/pages/login.ts";
import { oauthView } from "../src/pages/oauth.ts";
import { registerView } from "../src/pages/register.ts";
import { routerView } from "../src/pages/router.ts";
import { serverView } from "../src/pages/server.ts";
import { REGION, SURFACE } from "../src/pages/regions.ts";
import type { PageContext } from "../src/pages/kit.ts";

const assets = {
  stylesheet: "/assets/style-x.css",
  script: "/assets/client-x.js",
  worker: "/assets/worker-x.js",
  wasm: "/assets/crypto-x.wasm",
  icon: "/assets/icon-x.svg",
};

const views = { chat: chatView, router: routerView, server: serverView, login: loginView, oauth: oauthView, register: registerView, key: keyView };

function pages(): Array<{ name: string; html: string }> {
  return locales.flatMap((locale) =>
    Object.entries(views).map(([name, view]) => {
      const context: PageContext = { locale, assets, path: `/${name}/`, localePath: "/", languages: [], alternates: [] };
      const page = view(context);
      const document = base({ c: locale.catalog, page: name, lang: locale.id, title: page.title, description: "x", canonical: "/", alternates: [], assets, body: page.body });
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
    assert.match(page.html, /<noscript>/u);
  });
}

void test("the chat page carries every region and surface", () => {
  const chat = pages().find((page) => page.name === "en/chat")?.html ?? "";
  for (const id of Object.values(REGION)) assert.ok(chat.includes(id), id);
  for (const id of Object.values(SURFACE)) assert.ok(chat.includes(`id="${id}"`), id);
});

void test("copy comes from the catalog, not the component", () => {
  const zh = pages().find((page) => page.name === "zh-CN/chat")?.html ?? "";
  assert.ok(zh.includes(zhCN["composer.placeholder"]));
  assert.ok(!zh.includes(en["composer.placeholder"]));
});

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
