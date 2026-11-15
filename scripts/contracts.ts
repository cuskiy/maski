import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { en } from "../src/catalogs/en.ts";
import { zhCN } from "../src/catalogs/zh-CN.ts";
import { locales } from "../src/catalogs/index.ts";
import { isAssets } from "../src/lib/assets.ts";
import { REGION, SURFACE } from "../src/core/regions.ts";
import { generatedPages } from "./pages.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures: string[] = [];

function fail(contract: string, message: string): void {
  failures.push(`${contract}: ${message}`);
}

function sources(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".css") ? [path] : [];
  });
}

const sourceFiles = sources("src");
const scriptFiles = sources("scripts");
const code = [...sourceFiles.filter((file) => !file.startsWith("src/catalogs/")), ...scriptFiles]
  .map((file) => readFileSync(join(root, file), "utf8"))
  .join("\n");

const enKeys = Object.keys(en);
if (JSON.stringify(enKeys.toSorted()) !== JSON.stringify(Object.keys(zhCN).toSorted())) fail("C1", "catalogs disagree");
for (const [key, value] of Object.entries(en)) {
  if (!code.includes(`"${key}"`)) fail("C1", `nobody reads ${key}`);
  if (value.length === 0) fail("C1", `empty entry ${key}`);
}

const generated = generatedPages();

for (const page of generated) {
  const file = join(root, "dist", page.file);
  let html = "";
  try {
    html = readFileSync(file, "utf8");
  } catch {
    fail("C4", `${page.id} was not generated`);
    continue;
  }
  const language = /<html(?=[^>]*\slang="([^"]+)")/u.exec(html)?.[1];
  if (language !== page.locale) fail("C4", `${page.id} declares lang ${language ?? "none"}, expected ${page.locale}`);
  if ([...html.matchAll(/<h1[\s>]/gu)].length !== 1) fail("C4", `${page.id} does not have exactly one h1`);
  if (!/<noscript>/u.test(html)) fail("C4", `${page.id} has no note for a script-free reader`);
  if (page.id === "chat") {
    for (const id of Object.values(REGION)) {
      if (!html.includes(`data-region="${id}"`)) fail("C4", `region ${id} is missing`);
    }
    for (const id of Object.values(SURFACE)) if (!html.includes(`id="${id}"`)) fail("C4", `surface ${id} is missing`);
  }
}

const parsedManifest: unknown = JSON.parse(readFileSync(join(root, "build", "manifest.json"), "utf8"));
if (!isAssets(parsedManifest)) throw new Error("the build manifest is malformed");
const manifest = parsedManifest;
const manifestNames: Readonly<Record<string, { readonly prefix: string; readonly extension: string }>> = {
  stylesheet: { prefix: "style-", extension: ".css" },
  icon: { prefix: "icon-", extension: ".svg" },
  guard: { prefix: "guard-", extension: ".js" },
  prepaint: { prefix: "prepaint-", extension: ".js" },
  client: { prefix: "client-", extension: ".js" },
  reviewClient: { prefix: "review-client-", extension: ".js" },
  matrixWorker: { prefix: "matrix-worker-", extension: ".js" },
  cryptoWasm: { prefix: "matrix-sdk-crypto-", extension: ".wasm" },
};
for (const [key, value] of Object.entries(manifest)) {
  const expected = manifestNames[key];
  const name = basename(value);
  const hash =
    expected === undefined ? "" : name.slice(expected.prefix.length, name.length - expected.extension.length);
  if (
    expected === undefined ||
    !value.startsWith("/assets/") ||
    !name.startsWith(expected.prefix) ||
    !name.endsWith(expected.extension) ||
    !/^[A-Za-z0-9_-]{6,}$/u.test(hash)
  ) {
    fail("C5", `${key} is not hashed`);
    continue;
  }
  try {
    statSync(join(root, "dist", value));
  } catch {
    fail("C5", `${key} is missing from dist`);
  }
  if (key === "icon") {
    const source = readFileSync(join(root, "src/assets/icon.svg"));
    const expectedHash = createHash("sha256").update(source).digest("hex").slice(0, 10);
    if (hash !== expectedHash) fail("C5", "the icon name does not match its bytes");
  }
}

for (const file of [...sourceFiles, ...scriptFiles]) {
  const text = readFileSync(join(root, file), "utf8");
  if (file !== "scripts/contracts.ts" && /\b(TODO|FIXME|XXX)\b/u.test(text)) {
    fail("C7", `a marker is left in ${file}`);
  }
  if (/\bconsole\s*\./u.test(text)) fail("C7", `console output in ${file}`);
  if (file.includes("zh-CN")) continue;
  if (/[\u4e00-\u9fff]/u.test(text)) fail("C7", `Chinese in code: ${file}`);
}

for (const page of generated) {
  try {
    statSync(join(root, "dist", page.file));
  } catch {
    fail("C8", `${page.file} was not generated`);
  }
}

const english = locales.find((locale) => locale.id === "en");
if (english?.path !== "/en/") fail("C8", "English is not at /en/");
const rootPage = readFileSync(join(root, "dist", "index.html"), "utf8");
if (!rootPage.includes('data-page="router"')) fail("C8", "the root document is not the language entry");
if (!rootPage.includes('href="/"')) fail("C8", "the root document has no canonical root");

process.stdout.write(
  `contracts checked: ${String(enKeys.length)} keys, ${String(generated.length)} pages, ${String(locales.length)} languages\n`,
);
for (const failure of failures) process.stderr.write(`${failure}\n`);
process.exit(failures.length === 0 ? 0 : 1);
