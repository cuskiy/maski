import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, submit } from "../components/form.ts";
import { sasDialog } from "../components/sas.ts";
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
            ${field({ id: "recovery", label: t(c, "auth.key.recovery"), type: "text", autocomplete: "off", required: true })}
            ${field({ id: "recovery-password", label: t(c, "auth.key.password"), type: "password", autocomplete: "current-password" })}
            ${submit(t(c, "auth.key.unlock"))}
          </form>
          <button class="button-quiet" type="button" commandfor="sas-dialog" command="show-modal">
            ${t(c, "auth.key.verify")}
          </button>
        </div>
        <p class="field-hint" data-key-new hidden>${t(c, "auth.key.newAccount")}</p>
        <form class="form" method="post" data-flow="reset">
          <p class="field-hint">${t(c, "auth.key.resetHint")}</p>
          ${field({ id: "reset-password", label: t(c, "auth.password"), type: "password", autocomplete: "current-password", required: true })}
          <button class="button-quiet" type="submit">${t(c, "auth.key.reset")}</button>
        </form>
        ${sasDialog(c, "sas-dialog")}`,
      note: t(c, "noscript.key"),
    }),
  };
}
