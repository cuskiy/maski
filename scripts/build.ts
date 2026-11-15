import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type BuildResult } from "esbuild";
import { minify } from "html-minifier-terser";
import type { Assets } from "../src/lib/assets.ts";
import { renderPages } from "./pages.ts";

export const minifyOptions = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  sortAttributes: true,
  sortClassName: true,
  useShortDoctype: true,
} as const;

const browserTarget = ["chrome156", "firefox157", "safari27"];
const jsBuildOptions = {
  target: browserTarget,
  charset: "utf8" as const,
  treeShaking: true,
  sourcemap: false,
  drop: ["debugger", "console"] as Array<"debugger" | "console">,
};

function emittedAsset(result: BuildResult, extension: string): string {
  const metafile = result.metafile;
  if (metafile === undefined) throw new Error("the build did not emit a metafile");
  const output = Object.keys(metafile.outputs).find((path) => path.endsWith(extension));
  if (output === undefined) throw new Error(`the ${extension} bundle was not emitted`);
  return `/assets/${basename(output)}`;
}

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const buildDir = join(root, "build");
const reviewDir = join(root, "review-dist");

export async function buildSite(): Promise<void> {
  await rm(dist, { recursive: true, force: true });
  await rm(buildDir, { recursive: true, force: true });
  await rm(reviewDir, { recursive: true, force: true });
  await mkdir(join(dist, "assets"), { recursive: true });
  await mkdir(buildDir, { recursive: true });

  const result = await build({
    entryPoints: [join(root, "src/styles/style.css")],
    bundle: true,
    minify: true,
    target: browserTarget,
    charset: "utf8",
    outdir: join(dist, "assets"),
    entryNames: "style-[hash]",
    assetNames: "[name]-[hash]",
    loader: { ".svg": "file" },
    metafile: true,
    logLevel: "silent",
  });

  const stylesheet = emittedAsset(result, ".css");

  const guardResult = await build({
    ...jsBuildOptions,
    entryPoints: [join(root, "src/client/guard.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    outdir: join(dist, "assets"),
    entryNames: "guard-[hash]",
    metafile: true,
    logLevel: "silent",
  });
  const guard = emittedAsset(guardResult, ".js");

  const prepaintResult = await build({
    ...jsBuildOptions,
    entryPoints: [join(root, "src/client/prepaint.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    outdir: join(dist, "assets"),
    entryNames: "prepaint-[hash]",
    metafile: true,
    logLevel: "silent",
  });
  const prepaint = emittedAsset(prepaintResult, ".js");

  const clientResult = await build({
    ...jsBuildOptions,
    entryPoints: [join(root, "src/client/main.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    outdir: join(dist, "assets"),
    entryNames: "client-[hash]",
    metafile: true,
    logLevel: "silent",
  });
  const client = emittedAsset(clientResult, ".js");

  const reviewClientResult = await build({
    ...jsBuildOptions,
    entryPoints: [join(root, "src/client/review.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    outdir: join(dist, "assets"),
    entryNames: "review-client-[hash]",
    metafile: true,
    logLevel: "silent",
  });
  const reviewClient = emittedAsset(reviewClientResult, ".js");

  const imageWorkerResult = await build({
    ...jsBuildOptions,
    entryPoints: [join(root, "src/client/imageWorker.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    outdir: join(dist, "assets"),
    entryNames: "image-worker-[hash]",
    metafile: true,
    logLevel: "silent",
  });
  const imageWorker = emittedAsset(imageWorkerResult, ".js");

  const wasmSource = await readFile(
    join(root, "node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm"),
  );
  const wasmHash = createHash("sha256").update(wasmSource).digest("hex").slice(0, 10);
  const cryptoWasm = `/assets/matrix-sdk-crypto-${wasmHash}.wasm`;
  await writeFile(join(dist, cryptoWasm), wasmSource);

  const matrixWorkerResult = await build({
    ...jsBuildOptions,
    entryPoints: [join(root, "src/worker/entry.ts")],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    outdir: join(dist, "assets"),
    entryNames: "matrix-worker-[hash]",
    metafile: true,
    logLevel: "silent",
  });
  const matrixWorker = emittedAsset(matrixWorkerResult, ".js");

  const iconSource = await readFile(join(root, "src/assets/icon.svg"));
  const iconHash = createHash("sha256").update(iconSource).digest("hex").slice(0, 10);
  const icon = `/assets/icon-${iconHash}.svg`;
  await writeFile(join(dist, icon), iconSource);

  const assets: Assets = {
    stylesheet,
    icon,
    guard,
    prepaint,
    client,
    reviewClient,
    imageWorker,
    matrixWorker,
    cryptoWasm,
  };
  const pages = renderPages(assets);
  for (const page of pages) {
    const target = join(dist, page.file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await minify(page.content, minifyOptions));
  }
  await writeFile(join(buildDir, "manifest.json"), `${JSON.stringify(assets, null, 2)}\n`);

  const sizes: string[] = [];
  for (const asset of [stylesheet, client, matrixWorker, cryptoWasm]) {
    sizes.push(`${asset} ${String((await stat(join(dist, asset))).size)}B`);
  }
  process.stdout.write(`built ${String(pages.length)} pages · ${icon}\n${sizes.join("\n")}\n`);
}

if (import.meta.main) await buildSite();
