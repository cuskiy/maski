import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "html-minifier-terser";
import { SERVICE_WORKER_PATH, isAssets } from "../src/lib/assets.ts";
import { parseServiceWorkerManifest } from "../src/service-worker.ts";
import { minifyOptions } from "./build.ts";
import { generatedPages, renderPages } from "./pages.ts";
import { WATERMARK_BUDGET } from "./watermark.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

const parsed: unknown = JSON.parse(await readFile(join(root, "build", "manifest.json"), "utf8"));
if (!isAssets(parsed)) throw new Error("the build manifest is malformed");
const failures: string[] = [];

for (const page of renderPages(parsed)) {
  let actual = "";
  try {
    actual = await readFile(join(dist, page.file), "utf8");
  } catch {
    failures.push(`${page.file} is missing`);
    continue;
  }
  const expected = await minify(page.content, minifyOptions);
  if (actual !== expected) failures.push(`${page.file} differs from its generator`);
}

for (const asset of [
  parsed.stylesheet,
  parsed.icon,
  parsed.guard,
  parsed.prepaint,
  parsed.client,
  parsed.reviewClient,
  parsed.matrixWorker,
  parsed.cryptoWasm,
]) {
  try {
    await stat(join(dist, asset));
  } catch {
    failures.push(`${asset} is missing`);
  }
}

const stylesheetPath = join(dist, parsed.stylesheet);
const stylesheet = await readFile(stylesheetPath, "utf8");
let watermark: string | null = null;
for (const match of stylesheet.matchAll(/url\(\s*["']?([^"')]+)/gu)) {
  const asset = match[1];
  if (asset === undefined || asset.startsWith("data:") || asset.startsWith("blob:") || asset.startsWith("#")) {
    continue;
  }
  const url = new URL(asset, `https://maski.invalid${parsed.stylesheet}`).pathname;
  if (/^\/assets\/watermark-[A-Za-z0-9_-]+\.svg$/u.test(url)) watermark = url;
  try {
    await stat(join(dist, url));
  } catch {
    failures.push(`${asset} is missing`);
  }
}
if (watermark === null) failures.push("the stylesheet has no generated watermark asset");

const budgetAssets: Array<{ readonly asset: string; readonly budget: number }> = [
  { asset: parsed.stylesheet, budget: 96 * 1024 },
  { asset: parsed.client, budget: 320 * 1024 },
  { asset: parsed.matrixWorker, budget: 1.5 * 1024 * 1024 },
  { asset: parsed.cryptoWasm, budget: 8.5 * 1024 * 1024 },
];
if (watermark !== null) budgetAssets.push({ asset: watermark, budget: WATERMARK_BUDGET });

const budgetReport: string[] = [];
for (const { asset, budget } of budgetAssets) {
  try {
    const size = (await stat(join(dist, asset))).size;
    budgetReport.push(`budget ${asset}: ${String(size)} / ${String(budget)} bytes`);
    if (size > budget) failures.push(`${asset} is ${String(size)} bytes, over ${String(budget)}`);
  } catch {
    // The missing-asset pass above reports this once.
  }
}

for (const asset of [
  parsed.guard,
  parsed.prepaint,
  parsed.client,
  parsed.reviewClient,
  parsed.matrixWorker,
  SERVICE_WORKER_PATH,
]) {
  let source = "";
  try {
    source = await readFile(join(dist, asset), "utf8");
  } catch {
    continue;
  }
  if (/console\.(?:log|debug|info|warn|error)\s*\(/u.test(source)) {
    failures.push(`${asset} contains a console call`);
  }
  if (/\bdebugger\b/u.test(source)) failures.push(`${asset} contains a debugger statement`);
  if (/sourceMappingURL/u.test(source)) failures.push(`${asset} contains a source map reference`);
}

const serviceWorkerSource = await readFile(join(dist, SERVICE_WORKER_PATH), "utf8").catch(() => "");
if (serviceWorkerSource === "") {
  failures.push(`${SERVICE_WORKER_PATH} is missing`);
} else {
  const manifest = parseServiceWorkerManifest(serviceWorkerSource);
  if (manifest === null) {
    failures.push("the service worker manifest is malformed");
  } else {
    const expectedPages = generatedPages()
      .map((page) => page.url)
      .toSorted();
    const expectedAssets = [
      parsed.stylesheet,
      parsed.icon,
      parsed.guard,
      parsed.prepaint,
      parsed.client,
      parsed.matrixWorker,
      parsed.cryptoWasm,
      ...(watermark === null ? [] : [watermark]),
    ].toSorted();
    if (JSON.stringify(manifest.pages) !== JSON.stringify(expectedPages)) {
      failures.push("the service worker does not precache the generated pages");
    }
    if (JSON.stringify(manifest.assets) !== JSON.stringify(expectedAssets)) {
      failures.push("the service worker does not precache the shell assets");
    }
    const version = createHash("sha256")
      .update(JSON.stringify({ pages: expectedPages, assets: expectedAssets }))
      .digest("hex")
      .slice(0, 12);
    if (manifest.version !== version) failures.push("the service worker cache version does not match its manifest");
    for (const url of [...manifest.pages, ...manifest.assets]) {
      if (
        url === "/login" ||
        url.startsWith("/login/") ||
        url.startsWith("/sync") ||
        url.startsWith("/media") ||
        url.startsWith("/api") ||
        url.startsWith("/_matrix") ||
        url.includes("?") ||
        url.includes("#")
      ) {
        failures.push(`the service worker precaches a non-shell path: ${url}`);
      }
    }
    if (!serviceWorkerSource.includes("self.skipWaiting()")) {
      failures.push("the service worker does not call skipWaiting");
    }
    if (!serviceWorkerSource.includes("self.clients.claim()")) {
      failures.push("the service worker does not claim clients");
    }
  }
}

for (const line of budgetReport) process.stdout.write(`${line}\n`);
if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exit(1);
}
process.stdout.write(`audit passed (${String(renderPages(parsed).length)} pages)\n`);
