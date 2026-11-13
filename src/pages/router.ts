import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import type { PageContext, PageView } from "./kit.ts";

export function routerView({ locale }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "app.name")} · ${t(c, "app.tagline")}`,
    body: html`<main class="router">
  <h1 class="router-mark">${t(c, "app.name")}</h1>
  <span class="router-spinner" aria-hidden="true"></span>
  <p class="visually-hidden" role="status">${t(c, "router.opening")}</p>
  <noscript>
    <p class="note">${t(c, "noscript.router")}</p>
    <p class="note"><a class="link" href="./chat/">${t(c, "router.open")}</a></p>
  </noscript>
</main>`,
  };
}
