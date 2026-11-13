import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, links, submit } from "../components/form.ts";
import { languageSwitch } from "../components/language.ts";
import type { PageContext, PageView } from "./kit.ts";

/** The server comes from `?server=`, so this page names it only once the script has read it. */
export function loginView({ locale, localePath, languages }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.login.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.login.title"),
      body: html`<form class="form" data-flow="login">
    ${field({ id: "username", label: t(c, "auth.username"), type: "text", autocomplete: "username" })}
    ${field({ id: "password", label: t(c, "auth.password"), type: "password", autocomplete: "current-password" })}
    ${submit(t(c, "auth.login.submit"))}
  </form>`,
      footer: links([
        { label: t(c, "auth.login.register"), href: `${localePath}register/` },
        { label: t(c, "auth.login.other"), href: `${localePath}login-oauth/` },
      ]),
      language: languageSwitch(languages, t(c, "lang.label"), t(c, "lang.short")),
      note: t(c, "noscript.auth"),
    }),
  };
}
