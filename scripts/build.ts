import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { minify } from "html-minifier-terser";
import type { Assets } from "../src/lib/assets.ts";
import { renderPages } from "./pages.ts";

export const minifyOptions = { collapseWhitespace: true, removeComments: true } as const;

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const buildDir = join(root, "build");

export async function buildSite(): Promise<void> {
  await rm(dist, { recursive: true, force: true });
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(join(dist, "assets"), { recursive: true });
  await mkdir(buildDir, { recursive: true });

  const result = await build({
    entryPoints: [join(root, "src/styles/style.css")],
    bundle: true,
    minify: true,
    outdir: join(dist, "assets"),
    entryNames: "style-[hash]",
    assetNames: "[name]-[hash]",
    loader: { ".svg": "file" },
    metafile: true,
    logLevel: "silent",
  });

  const cssOutput = Object.keys(result.metafile.outputs).find((path) => path.endsWith(".css"));
  if (cssOutput === undefined) throw new Error("the stylesheet was not emitted");
  const stylesheet = `/assets/${basename(cssOutput)}`;

  const guardResult = await build({
    entryPoints: [join(root, "src/client/guard.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    outdir: join(dist, "assets"),
    entryNames: "guard-[hash]",
    metafile: true,
    logLevel: "silent",
  });
  const guardOutput = Object.keys(guardResult.metafile.outputs).find((path) => path.endsWith(".js"));
  if (guardOutput === undefined) throw new Error("the guard bundle was not emitted");
  const guard = `/assets/${basename(guardOutput)}`;

  const prepaintResult = await build({
    entryPoints: [join(root, "src/client/prepaint.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    outdir: join(dist, "assets"),
    entryNames: "prepaint-[hash]",
    metafile: true,
    logLevel: "silent",
  });
  const prepaintOutput = Object.keys(prepaintResult.metafile.outputs).find((path) => path.endsWith(".js"));
  if (prepaintOutput === undefined) throw new Error("the prepaint bundle was not emitted");
  const prepaint = `/assets/${basename(prepaintOutput)}`;

  const clientResult = await build({
    entryPoints: [join(root, "src/client/main.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    outdir: join(dist, "assets"),
    entryNames: "client-[hash]",
    metafile: true,
    logLevel: "silent",
  });
  const clientOutput = Object.keys(clientResult.metafile.outputs).find((path) => path.endsWith(".js"));
  if (clientOutput === undefined) throw new Error("the client bundle was not emitted");
  const client = `/assets/${basename(clientOutput)}`;

  const iconSource = await readFile(join(root, "src/assets/icon.svg"));
  const iconHash = createHash("sha256").update(iconSource).digest("hex").slice(0, 10);
  const icon = `/assets/icon-${iconHash}.svg`;
  await writeFile(join(dist, icon), iconSource);

  const assets: Assets = { stylesheet, icon, guard, prepaint, client };
  const pages = renderPages(assets);
  for (const page of pages) {
    const target = join(dist, page.file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await minify(page.content, minifyOptions));
  }
  await writeFile(join(buildDir, "manifest.json"), `${JSON.stringify(assets, null, 2)}\n`);

  process.stdout.write(`built ${String(pages.length)} pages · ${stylesheet} · ${icon}\n`);
}

if (import.meta.main) await buildSite();
