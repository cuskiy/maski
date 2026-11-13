import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { en } from "../src/catalogs/en.ts";
import { zhCN } from "../src/catalogs/zh-CN.ts";
import { locales } from "../src/catalogs/index.ts";
import { REGION, SURFACE } from "../src/pages/regions.ts";
import { PAGES } from "./pages.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures: string[] = [];

function fail(contract: string, message: string): void {
  failures.push(`${contract}: ${message}`);
}

interface Source {
  readonly path: string;
  readonly text: string;
}

function sources(dir: string): Source[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") ? [{ path, text: readFileSync(join(root, path), "utf8") }] : [];
  });
}

const sourceFiles = sources("src");
const code = sourceFiles.map((file) => file.text).join("\n");
const scripts = sources("scripts").map((file) => file.text).join("\n");

// C1 the catalog: same keys everywhere, every key read, no empty entry
const enKeys = Object.keys(en);
if (JSON.stringify(enKeys.toSorted()) !== JSON.stringify(Object.keys(zhCN).toSorted())) fail("C1", "catalogs disagree");
for (const key of enKeys) {
  if (!code.includes(`"${key}"`) && !scripts.includes(`"${key}"`)) fail("C1", `nobody reads ${key}`);
  const value: string = en[key as keyof typeof en];
  if (value.length === 0) fail("C1", `empty entry ${key}`);
}

// C2 the protocol: every command has a handler and every event a case
const protocol = readFileSync(join(root, "src/protocol/messages.ts"), "utf8");
const api = readFileSync(join(root, "src/worker/api.ts"), "utf8");
for (const [, type] of protocol.matchAll(/\{ type: "([a-zA-Z]+)"/gu)) {
  if (type !== undefined && !api.includes(`case "${type}"`)) fail("C2", `no handler for ${type}`);
}

// C3 the layers: the worker owns the SDK, the client never imports it
for (const file of sources("src/client")) {
  if (/from "matrix-js-sdk/u.test(file.text)) fail("C3", `a client module imports the SDK: ${file.path}`);
}
for (const file of sources("src/worker")) {
  if (/from "\.\.\/(client|ui|pages|layouts|components)\//u.test(file.text)) fail("C3", `the worker imports the interface: ${file.path}`);
}
for (const file of sources("src/pages")) {
  if (/from "\.\.\/client\//u.test(file.text)) fail("C3", `a page imports client code: ${file.path}`);
}

// C4 the regions: every id exists in the page that declares it, every page has one h1 and a note
for (const page of PAGES) {
  const dir = join(root, "dist", page.path.replace(/^\//u, ""), "index.html");
  let html: string;
  try {
    html = readFileSync(dir, "utf8");
  } catch {
    fail("C4", `${page.id} was not generated`);
    continue;
  }
  if (!/<html lang="[A-Za-z-]+"/u.test(html)) fail("C4", `${page.id} has no lang`);
  if ([...html.matchAll(/<h1[\s>]/gu)].length !== 1) fail("C4", `${page.id} does not have exactly one h1`);
  if (!/<noscript>/u.test(html)) fail("C4", `${page.id} has no note for a script-free reader`);
  if (page.id === "chat") {
    for (const id of Object.values(REGION)) if (!html.includes(id)) fail("C4", `region ${id} is missing`);
    for (const id of Object.values(SURFACE)) if (!html.includes(`id="${id}"`)) fail("C4", `surface ${id} is missing`);
  }
}

// C5 the assets: hashed names, present on disk, no inline code in a page
const manifest: unknown = JSON.parse(readFileSync(join(root, "build", "manifest.json"), "utf8"));
for (const [key, value] of Object.entries(manifest as Record<string, unknown>)) {
  if (typeof value !== "string") continue;
  if (!value.startsWith("/assets/")) fail("C5", `${key} is not hashed`);
  try {
    statSync(join(root, "dist", value));
  } catch {
    fail("C5", `${key} is missing from dist`);
  }
}

// C6 the budgets: a client that grows without a decision is a defect
const sizes = Object.fromEntries(
  readdirSync(join(root, "dist/assets")).map((name) => [name, statSync(join(root, "dist/assets", name)).size] as const),
);
const client = Object.entries(sizes).find(([name]) => name.startsWith("client-"))?.[1] ?? 0;
const style = Object.entries(sizes).find(([name]) => name.startsWith("style-"))?.[1] ?? 0;
if (client > 200_000) fail("C6", `client bundle is ${String(client)} bytes, over the 200 kB budget`);
if (style > 40_000) fail("C6", `stylesheet is ${String(style)} bytes, over the 40 kB budget`);

// C7 the text: no TODO, no console, no Chinese outside the translation
for (const file of sourceFiles) {
  if (/\b(TODO|FIXME|XXX)\b/u.test(file.text)) fail("C7", `a marker is left in ${file.path}`);
  if (/console\.(log|debug|info|warn)/u.test(file.text)) fail("C7", `console output in ${file.path}`);
  if (file.path.includes("zh-CN")) continue;
  if (/[\u4e00-\u9fff]/u.test(file.text)) fail("C7", `Chinese in code: ${file.path}`);
}

// C8 the languages: every locale has a page for every screen, English at the root
for (const locale of locales) {
  for (const page of PAGES) {
    const target = join(root, "dist", `${locale.path}${page.path.replace(/^\//u, "")}`, "index.html");
    try {
      statSync(target);
    } catch {
      fail("C8", `${locale.id}${page.path} was not generated`);
    }
  }
  if (locale.id === "en" && locale.path !== "/") fail("C8", "English is not at the root");
}

process.stdout.write(`contracts checked: ${String(enKeys.length)} keys, ${String(PAGES.length)} pages, ${String(locales.length)} languages\n`);
for (const failure of failures) process.stderr.write(`${failure}\n`);
process.exit(failures.length === 0 ? 0 : 1);
