import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { languageSwitch } from "../components/language.ts";
import type { PageContext, PageView } from "./kit.ts";

/** Only the server knows which flows it offers, so its buttons are the script's work. */
export function oauthView({ locale, localePath, languages }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.oauth.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.oauth.title"),
      hint: t(c, "auth.oauth.hint"),
      body: html`<div class="auth-methods" data-flow="oauth"></div>`,
      footer: html`<nav class="auth-links"><a class="link" href="${localePath}login/">${t(c, "auth.login.submit")}</a></nav>`,
      language: languageSwitch(languages, t(c, "lang.label")),
      note: t(c, "noscript.auth"),
    }),
  };
}
