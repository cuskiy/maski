import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, links, submit } from "../components/form.ts";
import type { PageContext, PageView } from "./kit.ts";

export function registerView({ locale, localePath }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.register.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.register.title"),
      body: html`<form class="form" method="post" data-flow="register">
        ${field({ id: "username", label: t(c, "auth.username"), type: "text", autocomplete: "username", required: true })}
        ${field({ id: "password", label: t(c, "auth.password"), type: "password", autocomplete: "new-password", required: true })}
        ${field({ id: "confirm", label: t(c, "auth.register.confirm"), type: "password", autocomplete: "new-password", required: true })}
        ${submit(t(c, "auth.register.submit"))}
      </form>`,
      footer: links([{ label: t(c, "auth.register.existing"), href: `${localePath}login/` }], t(c, "auth.links")),
      note: t(c, "noscript.auth"),
    }),
  };
}
