import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { base } from "../layouts/base.ts";
import type { PageInput } from "./chat.ts";

export function routerPage(input: PageInput): string {
  const { locale } = input;
  const c = locale.catalog;
  return base({
    c,
    page: input.page,
    lang: locale.id,
    title: `${t(c, "app.name")} · ${t(c, "app.tagline")}`,
    description: t(c, "app.description"),
    canonical: `${input.origin}${locale.path}`,
    alternates: input.alternates,
    assets: input.assets,
    body: html`<main class="router" data-page="router">
  <h1 class="router-mark">${t(c, "app.name")}</h1>
  <span class="router-spinner" aria-hidden="true"></span>
  <p class="visually-hidden" role="status">${t(c, "router.opening")}</p>
  <noscript>
    <p class="note">${t(c, "noscript.router")}</p>
    <p class="note"><a class="link" href="./chat/">${t(c, "router.open")}</a></p>
  </noscript>
</main>`,
  }).value;
}
