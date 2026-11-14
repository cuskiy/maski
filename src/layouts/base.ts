import type { Assets } from "../lib/assets.ts";
import type { Catalog } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import { html, raw, type Html } from "../lib/html.ts";
import { languageMenu } from "../components/language.ts";

export interface BaseInput {
  readonly c: Catalog;
  readonly page: string;
  readonly lang: string;
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly alternates: ReadonlyArray<{ lang: string; href: string }>;
  readonly assets: Assets;
  readonly body: Html;
}

const csp = raw(
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https:; worker-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
);

export function base(input: BaseInput): Html {
  const alternates = input.alternates.map(
    (alternate) => html`<link rel="alternate" hreflang="${alternate.lang}" href="${alternate.href}" /> `,
  );
  return html`<!doctype html>
    <html lang="${input.lang}" data-page="${input.page}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta http-equiv="Content-Security-Policy" content="${csp}" />
        <title>${input.title}</title>
        <meta name="description" content="${input.description}" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#181715" media="(prefers-color-scheme: dark)" />
        <link rel="icon" href="${input.assets.icon}" type="image/svg+xml" />
        <link rel="canonical" href="${input.canonical}" />
        ${alternates}
        <link rel="stylesheet" href="${input.assets.stylesheet}" />
        <script src="${input.assets.guard}"></script>
      </head>
      <body>
        <p class="note" data-storage-note hidden>${t(input.c, "storage.unavailable")}</p>
        ${input.body} ${languageMenu(input.c, input.canonical, input.lang)}
        <script src="${input.assets.prepaint}"></script>
        <script src="${input.assets.client}"></script>
      </body>
    </html>`;
}
