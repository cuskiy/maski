import { config } from "../config.ts";
import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { authLayout } from "../layouts/auth.ts";
import { field, nextStep, submit } from "../components/form.ts";
import type { PageContext, PageView } from "./kit.ts";

export function serverView({ locale, localePath }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "auth.server.title")} · ${t(c, "app.name")}`,
    body: authLayout({
      c,
      title: t(c, "auth.server.title"),
      hint: t(c, "auth.server.hint"),
      body: html`<form class="form" method="post" data-flow="server" aria-describedby="auth-hint">
        ${field({
          id: "homeserver",
          label: t(c, "auth.server.label"),
          type: "text",
          autocomplete: "url",
          inputmode: "url",
          autocapitalize: "none",
          enterkeyhint: "go",
          required: true,
          value: config.homeserver.default,
        })}
        ${submit(t(c, "auth.server.submit"))}
      </form>
      ${nextStep({
        id: "login",
        text: t(c, "auth.next.login"),
        href: `${localePath}login/`,
        link: t(c, "auth.login.submit"),
      })}`,
      note: t(c, "noscript.auth"),
    }),
  };
}
