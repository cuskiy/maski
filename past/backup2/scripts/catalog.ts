import { readFile, writeFile } from "node:fs/promises";

const ENTRY = /^\s*"[a-zA-Z]+\.[A-Za-z]+":/u;

for (const path of ["src/i18n/en.ts", "src/i18n/zh-CN.ts"]) {
  const text = await readFile(path, "utf8");
  const lines = text.split("\n").map((line) => (ENTRY.test(line) ? `  ${line.trim()}` : line));
  await writeFile(path, lines.join("\n"));
}
