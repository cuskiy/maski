import { join } from "node:path";
import type { Assets } from "../src/lib/assets.ts";
import { locales, type Locale } from "../src/catalogs/index.ts";
import { t } from "../src/lib/catalog.ts";
import { base } from "../src/layouts/base.ts";
import { chatView } from "../src/pages/chat.ts";
import { keyView } from "../src/pages/key.ts";
import { loginView } from "../src/pages/login.ts";
import { oauthView } from "../src/pages/oauth.ts";
import { registerView } from "../src/pages/register.ts";
import { routerView } from "../src/pages/router.ts";
import { serverView } from "../src/pages/server.ts";
import type { Alternate, PageContext, PageView } from "../src/pages/kit.ts";

interface Page {
  readonly id: string;
  readonly path: string;
  readonly view: (context: PageContext) => PageView;
}

/** Every page, once. A page's address is its path here, so the two cannot drift. */
export const PAGES: readonly Page[] = [
  { id: "router", path: "/", view: routerView },
  { id: "chat", path: "/chat/", view: chatView },
  { id: "server", path: "/server/", view: serverView },
  { id: "login", path: "/login/", view: loginView },
  { id: "oauth", path: "/login-oauth/", view: oauthView },
  { id: "register", path: "/register/", view: registerView },
  { id: "key", path: "/key/", view: keyView },
];

export interface Emit {
  readonly file: string;
  readonly content: string;
}

function address(locale: Locale, path: string): string {
  return `${locale.path}${path.replace(/^\//u, "")}`;
}

function alternates(page: Page, locale: Locale): Alternate[] {
  return locales
    .filter((other) => other.id !== locale.id)
    .map((other) => ({ lang: other.id, label: other.label, href: address(other, page.path) }));
}

/** Every page, for every locale, composed with the same base layout. */
export function renderPages(assets: Assets): Emit[] {
  const pages: Emit[] = [];
  for (const locale of locales) {
    for (const page of PAGES) {
      const path = address(locale, page.path);
      const siblings = alternates(page, locale);
      const view = page.view({ locale, assets, path, localePath: locale.path, alternates: siblings });
      const document = base({
        c: locale.catalog,
        page: page.id,
        lang: locale.id,
        title: view.title,
        description: view.description ?? t(locale.catalog, "app.description"),
        canonical: path,
        alternates: siblings,
        assets,
        body: view.body,
      });
      pages.push({ file: join(path.replace(/^\//u, ""), "index.html"), content: document.value });
    }
  }
  return pages;
}
