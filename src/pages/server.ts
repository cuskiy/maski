import { config } from "../config.ts";
import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, submit } from "../components/form.ts";
import { languageSwitch } from "../components/language.ts";
import type { PageContext, PageView } from "./kit.ts";

export function serverView({ locale, languages }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.server.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.server.title"),
      hint: t(c, "auth.server.hint"),
      body: html`<form class="form" data-flow="server">
    ${field({ id: "homeserver", label: t(c, "auth.server.label"), type: "text", autocomplete: "url", value: config.homeserver.default })}
    ${submit(t(c, "auth.server.submit"))}
  </form>`,
      language: languageSwitch(languages, t(c, "lang.label")),
      note: t(c, "noscript.auth"),
    }),
  };
}
