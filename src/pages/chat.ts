import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { PRODUCTION_CAPABILITIES, REVIEW_CAPABILITIES } from "../core/types.ts";
import { appShell } from "../layouts/app.ts";
import type { PageContext, PageView } from "./kit.ts";

export function chatView({ locale, path }: PageContext): PageView {
  const c = locale.catalog;
  const capabilities = path.startsWith("/review/") ? REVIEW_CAPABILITIES : PRODUCTION_CAPABILITIES;
  return {
    title: `${t(c, "chat.title")} · ${t(c, "app.name")}`,
    body: html`${appShell(c, locale.id, capabilities)}`,
  };
}
