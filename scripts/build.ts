import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { context, type BuildResult } from "esbuild";
import { minify } from "html-minifier-terser";
import type { Assets } from "../src/lib/assets.ts";
import { renderPages } from "./pages.ts";

export const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const buildDir = join(root, "build");

const watch = process.argv.includes("--watch");

function assetsOf(result: BuildResult): Assets {
  let stylesheet = "";
  let script = "";
  let worker = "";
  for (const [file, entry] of Object.entries(result.metafile?.outputs ?? {})) {
    const name = file.replace(/^dist\//u, "/");
    if (entry.entryPoint === "src/styles/style.css") stylesheet = name;
    if (entry.entryPoint === "src/client/main.ts") script = name;
    if (entry.entryPoint === "src/worker/worker.ts") worker = name;
  }
  if (!stylesheet || !script || !worker) throw new Error("the bundle did not produce a stylesheet, a script and a worker");
  return { stylesheet, script, worker, wasm: "" };
}

/** The crypto wasm is a file esbuild leaves alone, so the build hashes and copies it. */
async function emitWasm(): Promise<string> {
  const source = join(root, "node_modules", "@matrix-org", "matrix-sdk-crypto-wasm", "pkg", "matrix_sdk_crypto_wasm_bg.wasm");
  const bytes = await readFile(source);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const name = `/assets/crypto-${hash}.wasm`;
  await mkdir(join(dist, "assets"), { recursive: true });
  await writeFile(join(dist, name), bytes);
  return name;
}

/** Every page is written from its function, minified, and compared by the audit afterwards. */
async function emitPages(assets: Assets): Promise<number> {
  const pages = renderPages(assets);
  for (const page of pages) {
    const target = join(dist, page.file);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, await minify(page.content, { collapseWhitespace: true, removeComments: true }), "utf8");
  }
  return pages.length;
}

async function onBundle(result: BuildResult): Promise<void> {
  const assets = { ...assetsOf(result), wasm: await emitWasm() };
  await cp(join(root, "static"), dist, { recursive: true });
  await mkdir(buildDir, { recursive: true });
  await writeFile(join(buildDir, "manifest.json"), JSON.stringify(assets, null, 2), "utf8");
  const count = await emitPages(assets);
  process.stdout.write(`built ${String(count)} pages · ${assets.script} · ${assets.worker} · ${assets.wasm}\n`);
}

const bundler = await context({
  absWorkingDir: root,
  entryPoints: { client: "src/client/main.ts", worker: "src/worker/worker.ts", style: "src/styles/style.css" },
  outdir: dist,
  entryNames: "assets/[name]-[hash]",
  assetNames: "assets/[name]-[hash]",
  bundle: true,
  format: "esm",
  target: ["chrome120", "firefox128", "safari18"],
  minify: true,
  metafile: true,
  logLevel: "warning",
  plugins: [
    {
      name: "pages",
      setup(build) {
        build.onEnd((result) => (result.errors.length === 0 ? onBundle(result) : Promise.resolve()));
      },
    },
  ],
});

await rm(dist, { recursive: true, force: true });

if (watch) {
  await bundler.watch();
  process.stdout.write("watching\n");
} else {
  await bundler.rebuild();
  await bundler.dispose();
}
