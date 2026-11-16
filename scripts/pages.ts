import { join } from "node:path";
import type { Assets } from "../src/lib/assets.ts";
import { locales } from "../src/catalogs/index.ts";
import { t } from "../src/lib/catalog.ts";
import { base } from "../src/layouts/base.ts";
import { chatView } from "../src/pages/chat.ts";
import { keyView } from "../src/pages/key.ts";
import { loginView } from "../src/pages/login.ts";
import { routerView } from "../src/pages/router.ts";
import { serverView } from "../src/pages/server.ts";
import type { Alternate, PageContext, PageView } from "../src/pages/kit.ts";
import type { Locale } from "../src/catalogs/index.ts";

interface Page {
  readonly id: string;
  readonly path: string;
  readonly view: (context: PageContext) => PageView;
}

export const PAGES: readonly Page[] = [
  { id: "chat", path: "/", view: chatView },
  { id: "server", path: "/server/", view: serverView },
  { id: "login", path: "/login/", view: loginView },
  { id: "key", path: "/key/", view: keyView },
];

export const ROUTER: Page = { id: "router", path: "/", view: routerView };

export interface Emit {
  readonly file: string;
  readonly content: string;
}

export interface GeneratedPage {
  readonly id: string;
  readonly file: string;
  readonly url: string;
  readonly locale: string;
}

function address(locale: Locale, path: string): string {
  return `${locale.path}${path.replace(/^\//u, "")}`;
}

function alternates(page: Page, locale: Locale): Alternate[] {
  return locales
    .filter((entry) => entry.id !== locale.id)
    .map((entry) => ({ lang: entry.id, href: address(entry, page.path) }));
}

function documentFor(
  view: PageView,
  page: Page,
  locale: Locale,
  path: string,
  alternatesForPage: Alternate[],
  assets: Assets,
): string {
  return base({
    c: locale.catalog,
    page: page.id,
    lang: locale.id,
    title: view.title,
    description: view.description ?? t(locale.catalog, "app.description"),
    canonical: path,
    alternates: alternatesForPage,
    assets,
    body: view.body,
  }).value;
}

function pageUrl(file: string): string {
  const normalized = file.replaceAll("\\", "/");
  return `/${normalized.replace(/index\.html$/u, "").replace(/^\/+/u, "")}`;
}

export function generatedPages(): GeneratedPage[] {
  return [
    { id: ROUTER.id, file: "index.html", url: pageUrl("index.html"), locale: "en" },
    ...locales.flatMap((locale) =>
      PAGES.map((page) => {
        const file = join(address(locale, page.path).replace(/^\//u, ""), "index.html");
        return {
          id: page.id,
          file,
          url: pageUrl(file),
          locale: locale.id,
        };
      }),
    ),
  ];
}

export function renderPages(assets: Assets): Emit[] {
  const routerLocale = locales.find((locale) => locale.id === "en");
  if (routerLocale === undefined) throw new Error("the English locale is missing");

  const rootAlternates: Alternate[] = locales.map((locale) => ({ lang: locale.id, href: locale.path }));
  const routerContext: PageContext = {
    locale: routerLocale,
    assets,
    path: ROUTER.path,
    localePath: routerLocale.path,
    alternates: rootAlternates,
  };
  const routerPage = ROUTER.view(routerContext);
  const pages: Emit[] = [
    {
      file: "index.html",
      content: documentFor(routerPage, ROUTER, routerLocale, ROUTER.path, rootAlternates, assets),
    },
  ];

  for (const locale of locales) {
    for (const page of PAGES) {
      const path = address(locale, page.path);
      const siblings = alternates(page, locale);
      const view = page.view({
        locale,
        assets,
        path,
        localePath: locale.path,
        alternates: siblings,
      });
      pages.push({
        file: join(path.replace(/^\//u, ""), "index.html"),
        content: documentFor(view, page, locale, path, siblings, assets),
      });
    }
  }
  return pages;
}
