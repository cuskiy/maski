import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";

export interface SurfaceInput {
  readonly c: Catalog;
  readonly id: string;
  readonly titleKey: string;
  readonly body?: Html;
}

/** A popover surface: it opens without a script, and says so when it has nothing else to show. */
export function surface({ c, id, titleKey, body }: SurfaceInput): Html {
  return html`<section class="surface" id="${id}" popover="auto" aria-labelledby="${id}-title">
  <header class="surface-head">
    <h2 class="surface-title" id="${id}-title">${t(c, titleKey)}</h2>
    <button class="surface-close" type="button" popovertarget="${id}" popovertargetaction="hide" aria-label="${t(c, "surface.close")}"></button>
  </header>
  <div class="surface-body" data-region="${id}-body">${body ?? html`<p class="note">${t(c, "noscript.surface")}</p>`}</div>
</section>`;
}

export function surfaceTrigger(id: string, label: string, icon: Html, extra?: Html): Html {
  return html`<button class="action" type="button" popovertarget="${id}"${extra ?? ""}>${icon}<span class="action-label">${label}</span></button>`;
}

export const icons = {
  search: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg>`,
  compose: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"></path></svg>`,
  invite: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"></path><path d="m4 7 8 6 8-6"></path></svg>`,
  join: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H4v16h6"></path><path d="M14 8l4 4-4 4"></path><path d="M8 12h10"></path></svg>`,
  create: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>`,
  settings: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"></circle><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"></path></svg>`,
  attach: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5 12 19.5a4.5 4.5 0 0 1-6.4-6.4l8-8a3 3 0 0 1 4.2 4.2l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3"></path></svg>`,
  sticker: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v10l-5 6H5z"></path><path d="M19 14h-5v6"></path></svg>`,
  emoji: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M9 10h.01M15 10h.01M8.5 14a4 4 0 0 0 7 0"></path></svg>`,
  send: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"></path><path d="m6 11 6-6 6 6"></path></svg>`,
  back: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6"></path></svg>`,
  chevron: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>`,
  older: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="m6 13 6 6 6-6"></path></svg>`,
};
