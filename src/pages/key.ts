import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, submit } from "../components/form.ts";
import { surfaceHead } from "../components/surface.ts";
import type { PageContext, PageView } from "./kit.ts";

const sasEmoji = ["🐶", "🐱", "🦊", "🐻", "🐼", "🐨", "🐯"] as const;

export function keyView({ locale }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.key.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.key.title"),
      hint: t(c, "auth.key.hint"),
      body: html`<form class="form" method="post" data-flow="unlock">
          ${field({ id: "recovery", label: t(c, "auth.key.recovery"), type: "text", autocomplete: "off", required: true })}
          ${field({ id: "recovery-password", label: t(c, "auth.key.password"), type: "password", autocomplete: "current-password" })}
          ${submit(t(c, "auth.key.unlock"))}
        </form>
        <button class="button-quiet" type="button" commandfor="sas-dialog" command="show-modal">
          ${t(c, "auth.key.verify")}
        </button>
        <form class="form" method="post" data-flow="reset">
          <p class="field-hint">${t(c, "auth.key.resetHint")}</p>
          ${field({ id: "reset-password", label: t(c, "auth.password"), type: "password", autocomplete: "current-password", required: true })}
          <button class="button-quiet" type="submit">${t(c, "auth.key.reset")}</button>
        </form>
        <dialog class="surface modal sas" id="sas-dialog" closedby="any" aria-labelledby="sas-dialog-title">
          ${surfaceHead(c, "sas-dialog", "auth.key.sasTitle")}
          <div class="surface-body">
            <p class="note">${t(c, "auth.key.sasNote")}</p>
            <ol class="sas-grid" role="list">
              ${sasEmoji.map(
                (emoji, index) =>
                  html`<li class="sas-emoji">
                    <span role="img" aria-label="${t(c, "auth.key.sasEmoji", { number: String(index + 1) })}"
                      >${emoji}</span
                    >
                  </li>`,
              )}
            </ol>
            <div class="sas-actions">
              <button class="button-primary" type="button" data-sas-match>${t(c, "auth.key.verifyMatch")}</button>
              <button
                class="button-quiet"
                type="button"
                commandfor="sas-dialog"
                command="close"
              >
                ${t(c, "auth.key.verifyMismatch")}
              </button>
            </div>
          </div>
        </dialog>`,
      note: t(c, "noscript.key"),
    }),
  };
}
