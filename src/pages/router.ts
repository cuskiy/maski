import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { LOCALE_KEYS } from "../components/language.ts";
import type { LocaleId } from "../core/locales.ts";
import type { PageContext, PageView } from "./kit.ts";

export function routerView({ locale, localePath, alternates }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: t(c, "app.name"),
    body: html`<main class="router">
      <h1 class="router-mark">${t(c, "app.name")}</h1>
      <span class="router-spinner" aria-hidden="true"></span>
      <p class="visually-hidden" role="status">${t(c, "router.opening")}</p>
      <noscript>
        <p class="note">${t(c, "noscript.router")}</p>
        <nav class="auth-links" aria-label="${t(c, "router.languages")}">
          ${alternates.map(
            (alternate) =>
              html`<a class="link" href="${alternate.href}">${t(c, LOCALE_KEYS[alternate.lang as LocaleId] ?? "language.en")}</a>`,
          )}
        </nav>
        <a class="link" href="${localePath}server/">${t(c, "router.open")}</a>
      </noscript>
    </main>`,
  };
}
