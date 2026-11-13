import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { REGION, SURFACE } from "../pages/regions.ts";
import { icons, surfaceTrigger } from "./surface.ts";

const ACTIONS = [
  { surface: SURFACE.search, key: "nav.search", icon: icons.search },
  { surface: SURFACE.newMessage, key: "nav.newMessage", icon: icons.compose },
  { surface: SURFACE.invite, key: "nav.invite", icon: icons.invite },
  { surface: SURFACE.join, key: "nav.join", icon: icons.join },
  { surface: SURFACE.create, key: "nav.create", icon: icons.create },
  { surface: SURFACE.settings, key: "nav.settings", icon: icons.settings },
] as const;

const SECTIONS = [
  { id: "favorites", key: "sections.favorites" },
  { id: "rooms", key: "sections.rooms" },
  { id: "direct", key: "sections.direct" },
  { id: "channels", key: "sections.channels" },
] as const;

export function navMenu(c: Catalog): Html {
  return html`<nav class="nav-menu" data-region="${REGION.menu}" aria-label="${t(c, "nav.label")}">
${ACTIONS.map((action) => surfaceTrigger(action.surface, t(c, action.key), action.icon))}
</nav>`;
}

/** Four closed sections; a script fills them, so the empty markup is the whole of the no-JS state. */
export function navSections(c: Catalog): Html {
  return html`<div class="nav-sections" data-region="${REGION.sections}" aria-label="${t(c, "nav.roomsLabel")}">
${SECTIONS.map(
  (section) => html`<details class="section" data-section="${section.id}">
  <summary class="section-head">
    <span class="section-name">${t(c, section.key)}</span>
    <span class="section-count" data-count="${section.id}"></span>
    <span class="section-chevron">${icons.chevron}</span>
  </summary>
  <ul class="section-rows" data-rows="${section.id}"></ul>
  ${section.id === "rooms" ? html`<p class="section-empty" data-empty="${section.id}">${t(c, "sections.empty")}</p>` : html``}
</details>`,
)}
</div>`;
}

export function nav(c: Catalog): Html {
  return html`<aside class="nav" data-region="${REGION.nav}">
${navMenu(c)}
${navSections(c)}
</aside>`;
}
