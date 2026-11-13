import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { appShell } from "../layouts/app.ts";
import type { PageContext, PageView } from "./kit.ts";

export function chatView({ locale }: PageContext): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "chat.title")} · ${t(c, "app.name")}`,
    body: html`${appShell({ c, backHref: "./" })}`,
  };
}
