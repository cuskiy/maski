import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { REGION } from "../pages/regions.ts";
import { icons } from "./surface.ts";

/** Empty until a room is open: with no room there is no header, and no control that needs one. */
export function header(c: Catalog, backHref: string): Html {
  return html`<header class="room-header" data-region="${REGION.header}">
  <a class="room-back" href="${backHref}" aria-label="${t(c, "chat.back")}">${icons.back}</a>
  <div class="room-head-text"></div>
</header>`;
}
