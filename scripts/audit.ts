import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "html-minifier-terser";
import type { Assets } from "../src/lib/assets.ts";
import { minifyOptions } from "./build.ts";
import { renderPages } from "./pages.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

function isAssets(value: unknown): value is Assets {
  return (
    typeof value === "object" &&
    value !== null &&
    "stylesheet" in value &&
    typeof value.stylesheet === "string" &&
    "icon" in value &&
    typeof value.icon === "string" &&
    "guard" in value &&
    typeof value.guard === "string" &&
    "prepaint" in value &&
    typeof value.prepaint === "string" &&
    "client" in value &&
    typeof value.client === "string" &&
    "reviewClient" in value &&
    typeof value.reviewClient === "string" &&
    "imageWorker" in value &&
    typeof value.imageWorker === "string" &&
    "matrixWorker" in value &&
    typeof value.matrixWorker === "string" &&
    "cryptoWasm" in value &&
    typeof value.cryptoWasm === "string"
  );
}

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
  parsed.imageWorker,
  parsed.matrixWorker,
  parsed.cryptoWasm,
]) {
  try {
    await stat(join(dist, asset));
  } catch {
    failures.push(`${asset} is missing`);
  }
}

for (const [asset, budget] of [
  [parsed.stylesheet, 96 * 1024],
  [parsed.client, 320 * 1024],
  [parsed.matrixWorker, 1.5 * 1024 * 1024],
  [parsed.cryptoWasm, 8.5 * 1024 * 1024],
] as const) {
  try {
    const size = (await stat(join(dist, asset))).size;
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
  parsed.imageWorker,
  parsed.matrixWorker,
]) {
  const source = await readFile(join(dist, asset), "utf8");
  if (/console\.(?:log|debug|info|warn|error)\s*\(/u.test(source)) {
    failures.push(`${asset} contains a console call`);
  }
  if (/\bdebugger\b/u.test(source)) failures.push(`${asset} contains a debugger statement`);
  if (/sourceMappingURL/u.test(source)) failures.push(`${asset} contains a source map reference`);
}

const stylesheetPath = join(dist, parsed.stylesheet);
const stylesheet = await readFile(stylesheetPath, "utf8");
for (const match of stylesheet.matchAll(/url\(\s*["']?([^"')]+)/gu)) {
  const asset = match[1];
  if (asset === undefined || asset.startsWith("data:") || asset.startsWith("blob:") || asset.startsWith("#")) {
    continue;
  }
  const file = asset.startsWith("/") ? join(dist, asset) : join(dirname(stylesheetPath), asset);
  try {
    await stat(file);
  } catch {
    failures.push(`${asset} is missing`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exit(1);
}
process.stdout.write(`audit passed (${String(renderPages(parsed).length)} pages)\n`);
