import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, submit } from "../components/form.ts";
import { languageSwitch } from "../components/language.ts";
import type { PageContext, PageView } from "./kit.ts";

export function keyView({ locale, languages }: PageContext): PageView {
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
  </form>
  <form class="form" data-flow="reset">
    <p class="field-hint">${t(c, "auth.key.resetHint")}</p>
    ${field({ id: "reset-password", label: t(c, "auth.password"), type: "password", autocomplete: "current-password" })}
    <button class="button-quiet" type="submit">${t(c, "auth.key.reset")}</button>
  </form>
  <p class="key-out" data-region="key-out" hidden></p>`,
      language: languageSwitch(languages, t(c, "lang.label")),
      note: t(c, "noscript.key"),
    }),
  };
}
