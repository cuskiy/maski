import { t } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import { appShell } from "../layouts/app.ts";
import { emptyChatState } from "../core/state.ts";
import type { ChatState } from "../core/types.ts";
import type { PageContext, PageView } from "./kit.ts";

export function chatView({ locale }: PageContext, state: ChatState = emptyChatState()): PageView {
  const c = locale.catalog;
  return {
    title: `${t(c, "chat.title")} · ${t(c, "app.name")}`,
    body: html`${appShell(state, c, locale.id)}`,
  };
}
