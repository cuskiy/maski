import { t } from "../lib/catalog.ts";
import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import type { SurfaceKind } from "../core/surfaces.ts";
import { icons } from "./icons.ts";

export type { SurfaceKind } from "../core/surfaces.ts";

export interface SurfaceInput {
  readonly c: Catalog;
  readonly id: string;
  readonly titleKey: CatalogKey;
  readonly kind: SurfaceKind;
  readonly manual?: boolean;
  readonly body: Html;
}

export function surfaceHead(c: Catalog, id: string, titleKey: CatalogKey): Html {
  return html`<header class="surface-head"><h2 id="${id}-title">${t(c, titleKey)}</h2><button class="surface-close" type="button" commandfor="${id}" command="close" aria-label="${t(c, "surface.close")}">${icons.close}</button></header>`;
}

export function surface({ c, id, titleKey, kind, manual = false, body }: SurfaceInput): Html {
  if (kind === "modal") {
    return html`<dialog class="surface modal" id="${id}" closedby="any" aria-labelledby="${id}-title">${surfaceHead(c, id, titleKey)}<div class="surface-body" data-region="${id}-body">${body}</div></dialog>`;
  }
  return html`<section
    class="surface floating"
    id="${id}"
    popover="${manual ? "manual" : "auto"}"
    aria-label="${t(c, titleKey)}"
  >
    <div class="surface-body" data-region="${id}-body">${body}</div>
  </section>`;
}

export function surfaceTrigger(id: string, label: string, icon: Html, kind: SurfaceKind): Html {
  const action = kind === "modal" ? html` commandfor="${id}" command="show-modal"` : html` popovertarget="${id}"`;
  return html`<button class="surface-item" type="button" role="menuitem" ${action}>
    ${icon}<span>${label}</span>
  </button>`;
}
