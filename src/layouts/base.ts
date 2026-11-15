import { SERVICE_WORKER_PATH, type Assets } from "../lib/assets.ts";
import type { Catalog } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import { html, raw, type Html } from "../lib/html.ts";
import { metaContentSecurityPolicy } from "../lib/csp.ts";
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
  readonly robots?: string;
}

const csp = raw(metaContentSecurityPolicy);

export function base(input: BaseInput): Html {
  const alternates = input.alternates.map(
    (alternate) => html`<link rel="alternate" hreflang="${alternate.lang}" href="${alternate.href}" /> `,
  );
  const clientScript = input.page === "review" ? input.assets.reviewClient : input.assets.client;
  return html`<!doctype html>
    <html lang="${input.lang}" data-page="${input.page}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta http-equiv="Content-Security-Policy" content="${csp}" />
        <meta name="referrer" content="no-referrer" />
        <meta http-equiv="x-dns-prefetch-control" content="off" />
        <meta name="image-worker" content="${input.assets.imageWorker}" />
        <meta name="matrix-worker" content="${input.assets.matrixWorker}" />
        <meta name="crypto-wasm" content="${input.assets.cryptoWasm}" />
        <meta name="service-worker" content="${SERVICE_WORKER_PATH}" />
        <title>${input.title}</title>
        <meta name="description" content="${input.description}" />
        ${input.robots === undefined ? html`` : html`<meta name="robots" content="${input.robots}" />`}
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
        <script src="${clientScript}"></script>
      </body>
    </html>`;
}
