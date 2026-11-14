import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { REGION } from "../pages/regions.ts";
import { icons } from "./surface.ts";

export function timeline(c: Catalog): Html {
  return html`<div class="timeline-wrap" data-region="${REGION.timeline}">
  <button class="load-older" type="button" hidden>${icons.older}<span>${t(c, "chat.loadOlder")}</span></button>
  <noscript><p class="note">${t(c, "noscript.chat")}</p></noscript>
  <ol class="timeline" aria-label="${t(c, "chat.title")}"></ol>
</div>`;
}
