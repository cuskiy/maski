import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, submit } from "../components/form.ts";
import { surfaceHead } from "../components/surface.ts";
import type { PageContext, PageView } from "./kit.ts";

export function keyView({ locale }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.key.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.key.title"),
      hint: t(c, "auth.key.hint"),
      body: html`<p class="field-hint" data-key-status hidden></p>
        <div class="key-paths" data-key-paths>
          <form class="form" method="post" data-flow="unlock">
            ${field({ id: "recovery", label: t(c, "auth.key.recovery"), type: "text", autocomplete: "off" })}
            ${field({ id: "recovery-password", label: t(c, "auth.key.password"), type: "password", autocomplete: "current-password" })}
            ${submit(t(c, "auth.key.unlock"))}
          </form>
          <form class="form" method="post" data-flow="reset">
            <p class="field-hint">${t(c, "settings.resetIdentityConfirm")}</p>
            ${field({ id: "reset-password", label: t(c, "auth.password"), type: "password", autocomplete: "current-password", required: true })}
            <button class="button-quiet is-danger" type="submit">${t(c, "settings.resetIdentity")}</button>
          </form>
        </div>
        <button class="button-primary" type="button" data-key-verify hidden>${t(c, "auth.key.sasTitle")}</button>
        <button class="button-primary" type="button" data-key-continue hidden>${t(c, "auth.key.continue")}</button>
        <dialog
          id="key-sas-dialog"
          class="surface modal sas"
          closedby="any"
          aria-labelledby="key-sas-dialog-title"
        >
          ${surfaceHead(c, "key-sas-dialog", "auth.key.sasTitle")}
          <div class="surface-body" data-region="key-sas-dialog-body"></div>
        </dialog>
        <dialog
          id="key-reset-dialog"
          class="surface modal reset-key-dialog"
          closedby="none"
          aria-labelledby="key-reset-dialog-title"
        >
          ${surfaceHead(c, "key-reset-dialog", "settings.newRecoveryKey")}
          <div class="surface-body">
            <p class="note">${t(c, "settings.recoveryOnce")}</p>
            <p class="key-out" data-key-reset-value></p>
            <div class="key-actions">
              <button class="button-quiet" type="button" data-key-reset-copy>${t(c, "settings.copy")}</button>
              <button class="button-quiet" type="button" data-key-reset-download>${t(c, "settings.download")}</button>
            </div>
            <div class="confirm-actions">
              <button class="button-primary" type="button" data-key-reset-continue>${t(c, "settings.done")}</button>
            </div>
          </div>
        </dialog>`,
      note: t(c, "noscript.key"),
    }),
  };
}
