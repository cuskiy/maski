import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { minify } from "html-minifier-terser";
import { fileURLToPath } from "node:url";
import { renderPages } from "./pages.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

interface Problem {
  file: string;
  message: string;
}

function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))].length;
}

function checkPage(file: string, html: string): Problem[] {
  const problems: Problem[] = [];
  const fail = (message: string): void => void problems.push({ file, message });
  if (!/<html lang="[a-zA-Z-]+"/u.test(html)) fail("no lang on <html>");
  if (count(html, /<h1[\s>]/u) !== 1) fail("expected exactly one h1");
  if (/<style[\s>]/u.test(html)) fail("inline style element");
  if (/\sstyle="/u.test(html)) fail("inline style attribute");
  if (/<script(?![^>]*\ssrc=)[^>]*>/u.test(html)) fail("inline script");
  if (!/<noscript>/u.test(html)) fail("no noscript note");
  if (/href="#"/u.test(html)) fail("placeholder link");
  return problems;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const manifest: unknown = JSON.parse(await readFile(join(root, "build", "manifest.json"), "utf8"));
if (typeof manifest !== "object" || manifest === null) throw new Error("manifest is missing");
const record = manifest as Record<string, unknown>;
const names = (key: string): string => (typeof record[key] === "string" ? record[key] : "");
const stylesheet = names("stylesheet");
const script = names("script");
const worker = names("worker");
const wasm = names("wasm");
const icon = names("icon");
const problems: Problem[] = [];

for (const asset of [stylesheet, script, worker, wasm, icon]) {
  if (!asset.startsWith("/assets/")) problems.push({ file: "manifest", message: `asset is not hashed: ${asset}` });
  if (!(await exists(join(dist, asset)))) problems.push({ file: "manifest", message: `asset is missing: ${asset}` });
}

const pages = renderPages({ stylesheet, script, worker, wasm, icon });
for (const page of pages) {
  const target = join(dist, page.file);
  if (!(await exists(target))) {
    problems.push({ file: page.file, message: "page is missing" });
    continue;
  }
  const written = await readFile(target, "utf8");
  const expected = await minify(page.content, { collapseWhitespace: true, removeComments: true });
  if (written !== expected) problems.push({ file: page.file, message: "written page differs from the generator" });
  problems.push(...checkPage(page.file, written));
}

for (const page of pages) {
  const html = await readFile(join(dist, page.file), "utf8");
  for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"]+)"/gu)) {
    if (url === undefined) continue;
    if (url.startsWith("/assets/") && !(await exists(join(dist, url)))) {
      problems.push({ file: page.file, message: `referenced asset is missing: ${url}` });
    }
  }
}

const staticFiles = await readdir(join(dist)).catch(() => [] as string[]);
if (!staticFiles.includes("robots.txt")) problems.push({ file: "robots.txt", message: "static copy is missing" });

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`${problem.file}: ${problem.message}\n`);
  process.exit(1);
}
process.stdout.write(`audit passed (${String(pages.length)} pages)\n`);
