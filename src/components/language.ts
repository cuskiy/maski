import { html, type Html } from "../lib/html.ts";
import type { Alternate } from "../pages/kit.ts";

/**
 * One control, not a row of links: a button naming the current language, a popover with the rest.
 * Each choice is a real link to that locale's document, so a script is not needed to switch.
 */
export function languageSwitch(languages: readonly Alternate[], label: string, currentLabel: string): Html {
  return html`<div class="lang">
  <button class="lang-button" type="button" popovertarget="lang-menu" aria-label="${label}">${currentLabel}</button>
  <nav class="lang-menu" id="lang-menu" popover="auto">
${languages.map(
  (language) => html`    <a class="lang-item" href="${language.href}" hreflang="${language.lang}"${language.current ? html` aria-current="page"` : html``}>${language.label}</a>
`,
)}
  </nav>
</div>`;
}
