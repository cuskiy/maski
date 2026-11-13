import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const problems: string[] = [];

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

const files = (await walk("src")).filter((file) => file.endsWith(".ts") || file.endsWith(".mjs"));
const sources = new Map<string, string>();
for (const file of files) sources.set(file, await readFile(file, "utf8"));

// Every catalog key is used, and every t() key exists.
const catalog = await readFile("src/i18n/en.ts", "utf8");
const keys = new Set([...catalog.matchAll(/^ {2}"([^"]+)":/gmu)].map((match) => match[1] ?? ""));
const used = new Set<string>();
for (const [file, text] of sources) {
  if (file.endsWith("i18n/en.ts") || file.endsWith("i18n/zh-CN.ts")) continue;
  for (const key of keys) if (text.includes(`"${key}"`)) used.add(key);
  for (const match of text.matchAll(/\bt\("([^"]+)"/g)) {
    if (!keys.has(match[1] ?? "")) problems.push(`${file}: unknown catalog key ${match[1]}`);
  }
}
for (const key of keys) if (!used.has(key)) problems.push(`src/i18n/en.ts: unused key ${key}`);

// The worker owns the SDK; the interface owns the DOM.
for (const [file, text] of sources) {
  const imports = [...text.matchAll(/from "([^"]+)"/g)].map((match) => match[1] ?? "");
  const user = file.startsWith("src/ui/") || file.startsWith("src/store/") || file.startsWith("src/i18n/");
  const worker = file.startsWith("src/worker/");
  for (const target of imports) {
    if (user && target.includes("matrix-js-sdk")) problems.push(`${file}: the interface imports the SDK`);
    if (user && target.includes("worker/")) problems.push(`${file}: the interface imports the worker`);
    if (worker && /(\.\.\/ui\/|\.\.\/store\/)/.test(target)) problems.push(`${file}: the worker imports the interface`);
    if (target.startsWith("../ui/") && !file.startsWith("src/app/")) problems.push(`${file}: only the app may compose the interface`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Source audit passed (${files.length} files, ${keys.size} keys).`);
