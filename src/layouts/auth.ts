import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";

export interface AuthInput {
  readonly c: Catalog;
  readonly title: string;
  readonly hint?: string;
  readonly body: Html;
  readonly footer?: Html;
  readonly language: Html;
  readonly note: string;
}

/** The frame every sign-in page shares: one centred column, no card, no shadow. */
export function authLayout({ c, title, hint, body, footer, language, note }: AuthInput): Html {
  return html`<main class="auth">
  <div class="auth-panel">
    <p class="auth-mark">${t(c, "app.name")}</p>
    <h1 class="auth-title">${title}</h1>
    ${hint === undefined ? html`` : html`<p class="auth-hint">${hint}</p>`}
    ${body}
    <noscript><p class="note">${note}</p></noscript>
    ${footer ?? html``}
  </div>
  ${language}
</main>`;
}
