import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { REGION, SURFACE } from "../pages/regions.ts";
import { composer } from "../components/composer.ts";
import { header } from "../components/header.ts";
import { nav } from "../components/nav.ts";
import { surface } from "../components/surface.ts";
import { timeline } from "../components/timeline.ts";

export interface AppShellInput {
  readonly c: Catalog;
  readonly backHref: string;
}

/** The chat frame: navigation, content pane and the surfaces the two areas open. */
export function appShell({ c, backHref }: AppShellInput): Html {
  return html`<div class="shell" id="${REGION.shell}" data-room="false">
  ${nav(c)}
  <main class="content" data-region="${REGION.content}">
    <h1 class="visually-hidden">${t(c, "chat.title")}</h1>
    ${header(c, backHref)}
    ${timeline(c)}
    ${composer(c)}
  </main>
</div>
${surfaces(c)}`;
}

function surfaces(c: Catalog): Html {
  const list: ReadonlyArray<{ id: string; key: string; body?: Html }> = [
    { id: SURFACE.search, key: "surface.search" },
    { id: SURFACE.newMessage, key: "surface.newMessage" },
    { id: SURFACE.invite, key: "surface.invite" },
    { id: SURFACE.join, key: "surface.join" },
    { id: SURFACE.create, key: "surface.create" },
    { id: SURFACE.settings, key: "surface.settings", body: html`<div data-region="settings-body"></div>` },
    { id: SURFACE.attach, key: "surface.attach" },
    { id: SURFACE.sticker, key: "surface.sticker" },
    { id: SURFACE.emoji, key: "surface.emoji" },
  ];
  return html`${list.map((entry) => surface({ c, id: entry.id, titleKey: entry.key, ...(entry.body === undefined ? {} : { body: entry.body }) }))}`;
}
