import { html, type Html } from "../lib/html.ts";
import type { Alternate } from "../pages/kit.ts";

/**
 * One control, not a row of links: a button naming the current language, a popover with the rest.
 * Each choice is a real link to that locale's document, so a script is not needed to switch.
 */
export function languageSwitch(languages: readonly Alternate[], label: string): Html {
  return html`<div class="lang">
  <button class="lang-button" type="button" popovertarget="lang-menu" aria-label="${label}">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5Z"></path></svg>
  </button>
  <nav class="lang-menu" id="lang-menu" popover="auto">
${languages.map(
  (language) => html`    <a class="lang-item" href="${language.href}" hreflang="${language.lang}"${language.current ? html` aria-current="page"` : html``}>${language.label}</a>
`,
)}
  </nav>
</div>`;
}
