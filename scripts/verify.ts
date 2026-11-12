import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const problems: string[] = [];

async function read(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

for (const [file, lang] of [
  ["index.html", "en"],
  ["zh-CN/index.html", "zh-CN"],
] as const) {
  const html = await read(file);
  if (!html.includes(`<html lang="${lang}">`)) problems.push(`${file}: lang is not ${lang}`);
  if (!html.includes("Content-Security-Policy")) problems.push(`${file}: no content security policy`);
  if (!html.includes("<noscript>")) problems.push(`${file}: no noscript overlay`);
  if (!/<h1/u.test(html)) problems.push(`${file}: no h1`);
  if (/\sstyle="/u.test(html)) problems.push(`${file}: inline style`);
  if (/<script(?![^>]*src=)/u.test(html)) problems.push(`${file}: inline script`);
  if (/\son[a-z]+="/u.test(html)) problems.push(`${file}: inline event handler`);
  if (!html.includes('rel="stylesheet"')) problems.push(`${file}: stylesheet is not linked`);
}

const files = await walk("dist");
const assets = files.filter((file) => file.endsWith(".js"));
for (const file of assets) {
  const text = await read(file);
  if (/!important/u.test(text)) problems.push(`${file}: !important`);
  if (/outline:\s*none/u.test(text)) problems.push(`${file}: outline none`);
  if (/-webkit-/u.test(text)) problems.push(`${file}: vendor prefix`);
}
const entry = files.find((file) => /assets\/main-.*\.js$/u.test(file));
if (!entry) problems.push("dist: no main bundle");
else {
  const text = await read(entry);
  for (const marker of ["MatrixClient", "@matrix-org", "matrix-sdk-crypto"]) {
    if (text.includes(marker)) problems.push(`${entry}: main bundle imports the SDK (${marker})`);
  }
}

const css = files.filter((file) => file.endsWith(".css"));
if (css.length === 0) problems.push("dist: no stylesheet");
for (const file of css) {
  const text = await read(file);
  if (/!important/u.test(text)) problems.push(`${file}: !important`);
  if (/outline:\s*none/u.test(text)) problems.push(`${file}: outline none`);
  if (/-webkit-|-moz-|-ms-/u.test(text)) problems.push(`${file}: vendor prefix`);
}

const distSize = await stat("dist").then(() => true).catch(() => false);
if (!distSize) problems.push("dist: missing");

if (problems.length > 0) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Output audit passed (${files.length} files).`);
