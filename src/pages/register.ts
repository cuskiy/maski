import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { links } from "../components/form.ts";
import type { PageContext, PageView } from "./kit.ts";

export function registerView({ locale, localePath }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.register.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.register.title"),
      body: html`<p class="note">${t(c, "auth.register.unavailable")}</p>`,
      footer: links([{ label: t(c, "auth.register.existing"), href: `${localePath}login/` }], t(c, "auth.links")),
      note: t(c, "noscript.auth"),
    }),
  };
}
