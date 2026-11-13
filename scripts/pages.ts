import { join } from "node:path";
import type { Assets } from "../src/lib/assets.ts";
import { locales } from "../src/catalogs/index.ts";
import { chatPage } from "../src/pages/chat.ts";
import { routerPage } from "../src/pages/router.ts";

interface Emit {
  readonly file: string;
  readonly content: string;
}

/** Every page, for every locale. Nothing here is written by hand. */
export function renderPages(assets: Assets): Emit[] {
  const pages: Emit[] = [];
  for (const locale of locales) {
    const prefix = locale.path === "/" ? "" : locale.path;
    const alternates = [
      { lang: "en", href: "/chat/" },
      { lang: "zh-CN", href: "/zh-CN/chat/" },
    ];
    const shared = { locale, assets, origin: "", alternates };
    pages.push({ file: join(prefix, "index.html"), content: routerPage({ ...shared, page: "router" }) });
    pages.push({ file: join(prefix, "chat", "index.html"), content: chatPage({ ...shared, page: "chat" }) });
  }
  return pages;
}
