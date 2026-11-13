import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, submit } from "../components/form.ts";
import { languageSwitch } from "../components/language.ts";
import type { PageContext, PageView } from "./kit.ts";

export function keyView({ locale, alternates }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.key.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.key.title"),
      hint: t(c, "auth.key.hint"),
      body: html`<form class="form" data-flow="unlock">
    ${field({ id: "recovery", label: t(c, "auth.key.recovery"), type: "text", autocomplete: "off" })}
    ${submit(t(c, "auth.key.unlock"))}
  </form>`,
      language: languageSwitch(locale.id, alternates),
      note: t(c, "noscript.key"),
    }),
  };
}
