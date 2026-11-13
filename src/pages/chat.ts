import { t } from "../lib/catalog.ts";
import type { Locale } from "../catalogs/index.ts";
import type { Assets } from "../lib/assets.ts";
import { html } from "../lib/html.ts";
import { appShell } from "../layouts/app.ts";
import { base } from "../layouts/base.ts";

export interface PageInput {
  readonly locale: Locale;
  readonly page: string;
  readonly assets: Assets;
  readonly origin: string;
  readonly alternates: ReadonlyArray<{ lang: string; href: string }>;
}

export function chatPage(input: PageInput): string {
  const { locale } = input;
  const c = locale.catalog;
  return base({
    c,
    page: input.page,
    lang: locale.id,
    title: `${t(c, "chat.title")} · ${t(c, "app.name")}`,
    description: t(c, "app.description"),
    canonical: `${input.origin}${locale.path === "/" ? "" : locale.path}chat/`,
    alternates: input.alternates,
    assets: input.assets,
    body: html`${appShell({ c, backHref: "./" })}`,
  }).value;
}
