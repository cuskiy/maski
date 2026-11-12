import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { config } from "../src/app/config";

const dist = join(process.cwd(), "dist");
const base = config.app.basePath.endsWith("/") ? config.app.basePath : `${config.app.basePath}/`;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function fail(message: string): never {
  throw new Error(`Output audit failed: ${message}`);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function localAsset(src: string): string {
  const clean = src.startsWith(base) ? src.slice(base.length) : src.replace(/^\//, "");
  return join(dist, clean);
}

function checkShell(locale: "en" | "zh-CN", file: string): string {
  if (!statSync(file, { throwIfNoEntry: false })) fail(`missing ${file}`);
  const html = read(file);
  if (!html.includes(`<html lang="${locale}"`)) fail(`${file}: lang`);
  if (!html.includes('rel="canonical"')) fail(`${file}: canonical`);
  if (!html.includes('hreflang="x-default"')) fail(`${file}: x-default`);
  for (const alt of config.app.locales) {
    if (!html.includes(`hreflang="${alt}"`)) fail(`${file}: hreflang ${alt}`);
  }
  if (!html.includes('rel="manifest"')) fail(`${file}: manifest`);
  if (!html.includes("<noscript>")) fail(`${file}: noscript`);
  if (!html.includes("nojs-card")) fail(`${file}: nojs card`);
  if (!html.includes("<h1>")) fail(`${file}: noscript h1`);
  if (!html.includes("app-frame")) fail(`${file}: boot frame`);
  if (/<style[\s>]/i.test(html)) fail(`${file}: inline style`);
  if (/\sstyle\s*=\s*["']/i.test(html)) fail(`${file}: style attribute`);
  if (/\son[a-z]+\s*=\s*["']/i.test(html)) fail(`${file}: inline event handler`);
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) fail(`${file}: inline script`);
  if (!/<script[^>]+src="[^"]+"/.test(html)) fail(`${file}: module script`);
  if (!/<link[^>]+rel="stylesheet"[^>]+href="[^"]+"/.test(html)) fail(`${file}: stylesheet`);
  if (!html.includes("Content-Security-Policy")) fail(`${file}: CSP`);
  if (!html.includes("connect-src *")) fail(`${file}: connect-src exception`);
  if (!html.includes("nojs")) fail(`${file}: nojs`);
  const script = /<script[^>]+src="([^"]+)"/.exec(html)?.[1];
  if (!script) fail(`${file}: script src`);
  const scriptPath = localAsset(script);
  if (!statSync(scriptPath, { throwIfNoEntry: false })) fail(`${file}: missing script ${script}`);
  const css = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/.exec(html)?.[1];
  if (!css) fail(`${file}: css href`);
  const cssPath = localAsset(css);
  if (!statSync(cssPath, { throwIfNoEntry: false })) fail(`${file}: missing css ${css}`);
  const main = read(scriptPath);
  if (main.includes("matrix-js-sdk")) fail(`${file}: main chunk imports matrix-js-sdk`);
  return cssPath;
}

export async function verify(): Promise<void> {
  if (!statSync(dist, { throwIfNoEntry: false })) fail("dist/ is missing");
  const en = checkShell("en", join(dist, "index.html"));
  checkShell("zh-CN", join(dist, "zh-CN", "index.html"));
  if (!statSync(join(dist, "manifest.webmanifest"), { throwIfNoEntry: false })) {
    fail("manifest.webmanifest is missing");
  }
  if (!statSync(join(dist, "icon.svg"), { throwIfNoEntry: false })) fail("icon.svg is missing");
  if (config.app.routerMode === "history") {
    if (!statSync(join(dist, "404.html"), { throwIfNoEntry: false })) fail("404.html is missing");
  }
  const files = walk(dist);
  if (!files.some((file) => file.endsWith(".css"))) fail("no CSS output");
  const css = read(en);
  if (css.includes("!important")) fail("CSS uses !important");
  if (css.includes("-webkit-")) fail("CSS uses a vendor prefix");
  if (css.includes("outline: none")) fail("CSS hides the focus outline");
  const assets = files.filter((file) => file.endsWith(".js"));
  if (assets.length < 2) fail("expected a main and worker JavaScript chunk");
  const worker = assets.find((file) => !file.endsWith("index.js") && read(file).includes("MatrixClient"));
  if (!worker) fail("worker chunk does not contain the SDK");
  const rel = files.map((file) => relative(dist, file)).join("\n");
  if (!rel.includes("assets/")) fail("no hashed assets");
  process.stdout.write(`Output audit passed (${files.length} files).\n`);
}

const entry = process.argv[1];
if (entry && entry.endsWith("verify.ts")) {
  await verify();
}
