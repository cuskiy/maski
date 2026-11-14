import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { SURFACE } from "../core/regions.ts";
import { icons } from "./icons.ts";

const LOCALES = [
  { id: "en", key: "language.en" },
  { id: "zh-CN", key: "language.zh" },
] as const;

function target(path: string, locale: string): string {
  if (path.startsWith("/review/")) return locale === "en" ? "/review/" : "/review/zh-CN/";
  if (path === "/") return `/${locale}/`;
  return path.replace(/^\/(?:en|zh-CN)(?=\/|$)/u, `/${locale}`);
}

export function languageMenu(c: Catalog, path: string, current: string): Html {
  return html`<section
    class="surface floating language"
    id="${SURFACE.language}"
    popover="auto"
    aria-label="${t(c, "language.label")}"
  >
    <div class="surface-body">
      <div class="surface-menu">
        ${LOCALES.map(
          (locale) => html`<a
            class="surface-item"
            href="${target(path, locale.id)}"
            hreflang="${locale.id}"
            ${locale.id === current ? html` aria-current="true"` : html``}
          >
            ${t(c, locale.key)}
          </a>`,
        )}
      </div>
    </div>
  </section>`;
}

export function languageTrigger(c: Catalog, kind: "action" | "quiet"): Html {
  const label = t(c, "language.label");
  if (kind === "action") {
    return html`<button
      class="surface-item"
      type="button"
      popovertarget="${SURFACE.language}"
      aria-haspopup="menu"
    >
      ${icons.globe}<span>${label}</span>
    </button>`;
  }
  return html`<button class="button-quiet" type="button" popovertarget="${SURFACE.language}" aria-haspopup="menu">
    ${label}
  </button>`;
}
