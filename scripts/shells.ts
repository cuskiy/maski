import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../src/app/config";
import { catalogs, localePath, translate, type MessageKey } from "../src/i18n";
import type { Locale } from "../src/app/config";

const root = process.cwd();
const base = config.app.basePath.endsWith("/") ? config.app.basePath : `${config.app.basePath}/`;
const origin = config.app.origin.replace(/\/$/, "");

function absolute(path: string): string {
  return `${origin}${base}${path.replace(/^\//, "")}`;
}

function hrefForLocale(locale: Locale): string {
  return `${base}${locale === config.app.defaultLocale ? "" : `${locale}/`}`;
}

function shell(locale: Locale): string {
  const lang = locale;
  const title = translate(locale, "app.title", { app: config.app.name });
  const description = translate(locale, "app.description");
  const boot = translate(locale, "boot.loading", { app: config.app.name });
  const nojsTitle = translate(locale, "nojs.title");
  const nojsBody = translate(locale, "nojs.body", { app: config.app.name });
  const nojsEnable = translate(locale, "nojs.enable");
  const other = locale === "en" ? "zh-CN" : "en";
  const nojsLanguage = translate(locale, other === "zh-CN" ? "nojs.languageZh" : "nojs.languageEn");
  const alternates = config.app.locales
    .map(
      (alternate) =>
        `<link rel="alternate" hreflang="${alternate}" href="${absolute(localePath(alternate))}">`,
    )
    .join("\n    ");
  return `<!doctype html>
<html lang="${lang}" dir="ltr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#141414" media="(prefers-color-scheme: dark)">
    <meta name="description" content="${escapeHtml(description)}">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; connect-src *">
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${absolute(localePath(locale))}">
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${absolute("/")}">
    <link rel="manifest" href="${base}manifest.webmanifest">
    <link rel="icon" href="${base}icon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/src/styles/style.css">
    <script type="module" src="/src/app/main.ts"></script>
</head>
<body>
    <div id="app" data-locale="${escapeHtml(lang)}">
        <div class="app-frame" aria-busy="true" aria-label="${escapeHtml(boot)}">
            <nav class="app-frame-nav">
                <p class="brand">${escapeHtml(config.app.name)}</p>
                <div class="app-frame-rows">
                    <span class="app-frame-avatar"></span>
                    <span class="app-frame-avatar"></span>
                    <span class="app-frame-avatar"></span>
                </div>
            </nav>
            <div class="app-frame-content">
                <div class="app-frame-head"><span class="app-frame-line short"></span></div>
                <div class="app-frame-body"></div>
                <div class="app-frame-composer"></div>
            </div>
        </div>
    </div>
    <noscript>
        <div class="nojs">
            <div class="nojs-card">
                <p class="brand">${escapeHtml(config.app.name)}</p>
                <h1>${escapeHtml(nojsTitle)}</h1>
                <p>${escapeHtml(nojsBody)}</p>
                <p>${escapeHtml(nojsEnable)}</p>
                <a href="${hrefForLocale(other)}">${escapeHtml(nojsLanguage)}</a>
            </div>
        </div>
    </noscript>
</body>
</html>
`;
}

function manifest(): string {
  const name = config.app.name;
  const description = translate(config.app.defaultLocale, "app.description");
  return JSON.stringify(
    {
      name,
      short_name: name,
      description,
      start_url: base,
      scope: base,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#ffffff",
      icons: [
        {
          src: `${base}icon.svg`,
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
    },
    null,
    2,
  );
}

function icon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#141414"/>
  <path d="M16 44V20h7l9 13 9-13h7v24h-7V31l-9 12-9-12v13z" fill="#fff"/>
</svg>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function generateShells(): void {
  mkdirSync(join(root, "public"), { recursive: true });
  mkdirSync(join(root, "zh-CN"), { recursive: true });
  writeFileSync(join(root, "index.html"), shell("en"), "utf8");
  writeFileSync(join(root, "zh-CN", "index.html"), shell("zh-CN"), "utf8");
  writeFileSync(join(root, "public", "manifest.webmanifest"), manifest(), "utf8");
  writeFileSync(join(root, "public", "icon.svg"), icon(), "utf8");
  writeFileSync(join(root, "public", ".nojekyll"), "", "utf8");
  if (config.app.routerMode === "history") {
    writeFileSync(join(root, "404.html"), shell("en"), "utf8");
  }
}

const entry = process.argv[1];
if (entry && entry.endsWith("shells.ts")) {
  generateShells();
  const keys = Object.keys(catalogs.en) as MessageKey[];
  const missing = config.app.locales.filter((locale) =>
    keys.some((key) => catalogs[locale][key] === undefined),
  );
  if (missing.length > 0) throw new Error(`Missing catalog entries for ${missing.join(", ")}`);
}
