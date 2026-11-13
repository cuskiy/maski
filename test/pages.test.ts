import { describe, expect, it } from "vitest";
import { en } from "../src/catalogs/en.ts";
import { zhCN } from "../src/catalogs/zh-CN.ts";
import { locales } from "../src/catalogs/index.ts";
import { chatPage } from "../src/pages/chat.ts";
import { routerPage } from "../src/pages/router.ts";
import { REGION, SURFACE } from "../src/pages/regions.ts";

const assets = { stylesheet: "/assets/style-x.css", script: "/assets/client-x.js", worker: "/assets/worker-x.js", wasm: "/assets/crypto-x.wasm", icon: "/assets/icon-x.svg" };

function pages(): Array<{ name: string; html: string }> {
  const list: Array<{ name: string; html: string }> = [];
  for (const locale of locales) {
    const shared = { locale, assets, origin: "", page: "x", alternates: [] };
    list.push({ name: `${locale.id}/chat`, html: chatPage(shared) });
    list.push({ name: `${locale.id}/router`, html: routerPage(shared) });
  }
  return list;
}

describe("catalog", () => {
  it("has the same keys in every language", () => {
    expect(Object.keys(zhCN).toSorted()).toEqual(Object.keys(en).toSorted());
  });

  it("has no empty entry", () => {
    for (const catalog of [en, zhCN]) {
      for (const [key, value] of Object.entries(catalog)) expect(value, key).not.toBe("");
    }
  });
});

describe("pages", () => {
  for (const page of pages()) {
    it(`${page.name}: one h1, a locale, no inline code`, () => {
      expect([...page.html.matchAll(/<h1[\s>]/gu)]).toHaveLength(1);
      expect(page.html).toMatch(/<html lang="[A-Za-z-]+"/u);
      expect(page.html).not.toMatch(/<style[\s>]/u);
      expect(page.html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/u);
      expect(page.html).not.toMatch(/\sstyle="/u);
      expect(page.html).toMatch(/<noscript>/u);
    });
  }

  it("writes every region and surface of the chat page", () => {
    const chat = pages()[0]?.html ?? "";
    for (const id of Object.values(REGION)) expect(chat).toContain(id);
    for (const id of Object.values(SURFACE)) expect(chat).toContain(`id="${id}"`);
  });

  it("renders copy from the catalog, not from the component", () => {
    const zh = pages()[2]?.html ?? "";
    expect(zh).toContain(zhCN["composer.placeholder"]);
    expect(zh).not.toContain(en["composer.placeholder"]);
  });
});

const minifyOptions = { collapseWhitespace: true, removeComments: true } as const;

function textRuns(markup: string): string[] {
  return [...markup.matchAll(/>([^<]+)</gu)]
    .map((match) => (match[1] ?? "").replace(/\s+/gu, " ").trim())
    .filter((run) => run.length > 0);
}

describe("minification", () => {
  for (const page of pages()) {
    it(`${page.name}: keeps its visible text when minified`, async () => {
      const { minify } = await import("html-minifier-terser");
      const minified = await minify(page.html, minifyOptions);
      expect(textRuns(minified)).toEqual(textRuns(page.html));
    });
  }
});
