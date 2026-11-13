import { html, type Html } from "../lib/html.ts";
import type { Alternate } from "../pages/kit.ts";

/** The language switch is a set of real links, one per generated locale. */
export function languageSwitch(current: string, alternates: readonly Alternate[]): Html {
  return html`<nav class="lang">${alternates.map(
    (alternate) =>
      html`<a class="lang-item" href="${alternate.href}" hreflang="${alternate.lang}"${alternate.lang === current ? html` aria-current="page"` : html``}>${alternate.label}</a>`,
  )}</nav>`;
}
