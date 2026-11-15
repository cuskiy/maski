import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, submit } from "../components/form.ts";
import type { PageContext, PageView } from "./kit.ts";

export function keyView({ locale }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.key.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.key.title"),
      hint: t(c, "auth.key.hint"),
      body: html`<div class="key-paths" data-key-paths>
          <form class="form" method="post" data-flow="unlock">
            ${field({ id: "recovery", label: t(c, "auth.key.recovery"), type: "text", autocomplete: "off" })}
            ${field({ id: "recovery-password", label: t(c, "auth.key.password"), type: "password", autocomplete: "current-password" })}
            <p class="field-hint" data-key-status hidden></p>
            ${submit(t(c, "auth.key.unlock"))}
          </form>
        </div>`,
      note: t(c, "noscript.key"),
    }),
  };
}
