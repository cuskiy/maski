import type { Assets } from "../lib/assets.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, raw, type Html } from "../lib/html.ts";

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

/** The document shell. Its body is a slot: every page fills it, none inherits content from here. */
export function base(input: BaseInput): Html {
  const alternates = input.alternates.map(
    (alternate) => html`<link rel="alternate" hreflang="${alternate.lang}" href="${alternate.href}">
`,
  );
  return html`<!doctype html>
<html lang="${input.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="${raw("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; connect-src *")}">
<title>${input.title}</title>
<meta name="description" content="${input.description}">
<meta name="theme-color" content="#f6f5f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16191c" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${input.assets.icon}" type="image/svg+xml">
<link rel="canonical" href="${input.canonical}">
${alternates}<link rel="stylesheet" href="${input.assets.stylesheet}">
<meta name="maski:worker" content="${input.assets.worker}">
<meta name="maski:wasm" content="${input.assets.wasm}">
</head>
<body data-page="${input.page}">
${input.body}\n<script type="module" src="${input.assets.script}"></script>
</body>
</html>`;
}
