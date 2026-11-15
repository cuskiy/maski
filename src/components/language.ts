import { t } from "../lib/catalog.ts";
import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import type { LocaleId } from "../core/locales.ts";
import { LOCALE_DEFS, localeRoot } from "../core/locales.ts";
import { SURFACE } from "../core/regions.ts";
import { icons } from "./icons.ts";

const LOCALE_KEYS: Readonly<Record<LocaleId, CatalogKey>> = {
  en: "language.en",
  "zh-CN": "language.zh",
};

const LOCALE_PREFIX = new RegExp(`^/(?:${LOCALE_DEFS.map((entry) => entry.id).join("|")})(?=/|$)`, "u");

function target(path: string, locale: LocaleId): string {
  if (path.startsWith("/review/")) return locale === "en" ? "/review/" : "/review/zh-CN/";
  if (path === "/") return localeRoot(locale);
  return path.replace(LOCALE_PREFIX, `/${locale}`);
}

export function languageMenu(c: Catalog, path: string, current: string): Html {
  return html`<section
    class="surface floating language"
    id="${SURFACE.language}"
    popover="auto"
    aria-label="${t(c, "language.label")}"
  >
    <div class="surface-body">
      <div class="surface-menu" role="menu" aria-label="${t(c, "language.label")}">
        ${LOCALE_DEFS.map(
          (locale) => html`<a
            class="surface-item"
            href="${target(path, locale.id)}"
            hreflang="${locale.id}"
            role="menuitem"
            ${locale.id === current ? html` aria-current="true"` : html``}
          >
            ${t(c, LOCALE_KEYS[locale.id])}
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
      role="menuitem"
      popovertarget="${SURFACE.language}"
    >
      ${icons.globe}<span>${label}</span>
    </button>`;
  }
  return html`<button class="button-quiet" type="button" popovertarget="${SURFACE.language}">
    ${label}
  </button>`;
}
