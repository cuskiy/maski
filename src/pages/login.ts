import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, submit } from "../components/form.ts";
import { config } from "../config.ts";
import type { PageContext, PageView } from "./kit.ts";

export function loginView({ locale, localePath }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.login.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.login.title"),
      body: html`<div class="auth-server">
          <span>${t(c, "auth.login.server")}: <span data-auth-server dir="ltr">${config.homeserver.default}</span></span>
          <a class="link" href="${localePath}server/">${t(c, "auth.login.changeServer")}</a>
        </div>
        <form class="form" method="post" data-flow="login">
        ${field({ id: "username", label: t(c, "auth.username"), type: "text", autocomplete: "username", required: true })}
        ${field({ id: "password", label: t(c, "auth.password"), type: "password", autocomplete: "current-password", required: true })}
        ${submit(t(c, "auth.login.submit"))}
      </form>`,
      note: t(c, "noscript.auth"),
    }),
  };
}
