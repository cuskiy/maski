import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { languageTrigger } from "../components/language.ts";

export interface AuthInput {
  readonly c: Catalog;
  readonly title: string;
  readonly hint?: string;
  readonly body: Html;
  readonly footer?: Html;
  readonly note: string;
}

export function authLayout({ c, title, hint, body, footer, note }: AuthInput): Html {
  return html`<main class="auth">
    <section class="auth-panel" aria-labelledby="auth-title">
      <p class="auth-mark">${t(c, "app.name")}</p>
      <h1 class="auth-title" id="auth-title">${title}</h1>
      ${hint === undefined ? html`` : html`<p class="auth-hint" id="auth-hint">${hint}</p>`} ${body}
      <noscript><p class="note">${note}</p></noscript>
      ${footer ?? html``}
      <div class="auth-language">${languageTrigger(c, "quiet")}</div>
    </section>
  </main>`;
}
