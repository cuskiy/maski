import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, links, submit } from "../components/form.ts";
import { languageSwitch } from "../components/language.ts";
import type { PageContext, PageView } from "./kit.ts";

export function registerView({ locale, localePath, languages }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.register.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.register.title"),
      body: html`<form class="form" data-flow="register">
    ${field({ id: "username", label: t(c, "auth.username"), type: "text", autocomplete: "username" })}
    ${field({ id: "password", label: t(c, "auth.password"), type: "password", autocomplete: "new-password" })}
    ${field({ id: "confirm", label: t(c, "auth.register.confirm"), type: "password", autocomplete: "new-password" })}
    ${submit(t(c, "auth.register.submit"))}
  </form>`,
      footer: links([{ label: t(c, "auth.register.existing"), href: `${localePath}login/` }]),
      language: languageSwitch(languages, t(c, "lang.label"), t(c, "lang.short")),
      note: t(c, "noscript.auth"),
    }),
  };
}
