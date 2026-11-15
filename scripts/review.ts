import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "html-minifier-terser";
import { base } from "../src/layouts/base.ts";
import { chatView } from "../src/pages/chat.ts";
import { en } from "../src/catalogs/en.ts";
import { zhCN } from "../src/catalogs/zh-CN.ts";
import { minifyOptions } from "./build.ts";
import type { Assets } from "../src/lib/assets.ts";
import type { Locale } from "../src/catalogs/index.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const reviewDist = join(root, "review-dist");

const REVIEW_LOCALES: ReadonlyArray<{ locale: Locale; path: string }> = [
  { locale: { id: "en", path: "/en/", catalog: en }, path: "/review/" },
  { locale: { id: "zh-CN", path: "/zh-CN/", catalog: zhCN }, path: "/review/zh-CN/" },
];

export async function writeReview(): Promise<void> {
  const assets = JSON.parse(await readFile(join(root, "build", "manifest.json"), "utf8")) as Assets;
  for (const { locale, path } of REVIEW_LOCALES) {
    const view = chatView({ locale, assets, path, localePath: locale.path, alternates: [] });
    const document = base({
      c: locale.catalog,
      page: "review",
      lang: locale.id,
      title: view.title,
      description: view.description ?? "",
      canonical: path,
      robots: "noindex, nofollow",
      alternates: [],
      assets,
      body: view.body,
    });
    const file = join(reviewDist, path.replace(/^\//u, ""), "index.html");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await minify(document.value, minifyOptions));
  }
}

if (import.meta.main) await writeReview();
