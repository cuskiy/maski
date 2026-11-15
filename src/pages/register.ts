import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, links, submit } from "../components/form.ts";
import { surfaceHead } from "../components/surface.ts";
import type { PageContext, PageView } from "./kit.ts";

export function registerView({ locale, localePath }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.register.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.register.title"),
      body: html`<form class="form" method="post" data-flow="register">
          ${field({ id: "username", label: t(c, "auth.username"), type: "text", autocomplete: "username", required: true })}
          ${field({ id: "password", label: t(c, "auth.password"), type: "password", autocomplete: "new-password", required: true })}
          ${field({ id: "confirm", label: t(c, "auth.register.confirm"), type: "password", autocomplete: "new-password", required: true })}
          ${submit(t(c, "auth.register.submit"))}
        </form>
        <dialog
          id="register-key-dialog"
          class="surface modal reset-key-dialog"
          closedby="none"
          aria-labelledby="register-key-dialog-title"
        >
          ${surfaceHead(c, "register-key-dialog", "settings.newRecoveryKey")}
          <div class="surface-body">
            <p class="note">${t(c, "settings.recoveryOnce")}</p>
            <p class="key-out" data-register-key></p>
            <div class="key-actions">
              <button class="button-quiet" type="button" data-register-copy>${t(c, "settings.copy")}</button>
              <button class="button-quiet" type="button" data-register-download>${t(c, "settings.download")}</button>
            </div>
            <div class="confirm-actions">
              <button class="button-primary" type="button" data-register-continue>${t(c, "settings.done")}</button>
            </div>
          </div>
        </dialog>`,
      footer: links([{ label: t(c, "auth.register.existing"), href: `${localePath}login/` }], t(c, "auth.links")),
      note: t(c, "noscript.auth"),
    }),
  };
}
