import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { context, type BuildResult } from "esbuild";
import { minify } from "html-minifier-terser";
import { renderPages } from "./pages.ts";

export const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const buildDir = join(root, "build");

const watch = process.argv.includes("--watch");

interface Assets {
  stylesheet: string;
  script: string;
}

function assetsOf(result: BuildResult): Assets {
  let stylesheet = "";
  let script = "";
  for (const [file, entry] of Object.entries(result.metafile?.outputs ?? {})) {
    const name = file.replace(/^dist\//u, "/");
    if (entry.entryPoint === "src/styles/style.css") stylesheet = name;
    if (entry.entryPoint === "src/client/main.ts") script = name;
  }
  if (!stylesheet || !script) throw new Error("the bundle did not produce a stylesheet and a script");
  return { stylesheet, script };
}

/** Every page is written from its function, minified, and compared by the audit afterwards. */
async function emitPages(assets: Assets): Promise<number> {
  const pages = renderPages({ stylesheet: assets.stylesheet, script: assets.script });
  for (const page of pages) {
    const target = join(dist, page.file);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, await minify(page.content, { collapseWhitespace: true, removeComments: true }), "utf8");
  }
  return pages.length;
}

async function onBundle(result: BuildResult): Promise<void> {
  const assets = assetsOf(result);
  await cp(join(root, "static"), dist, { recursive: true });
  await mkdir(buildDir, { recursive: true });
  await writeFile(join(buildDir, "manifest.json"), JSON.stringify(assets, null, 2), "utf8");
  const count = await emitPages(assets);
  process.stdout.write(`built ${String(count)} pages · ${assets.stylesheet} · ${assets.script}\n`);
}

const bundler = await context({
  absWorkingDir: root,
  entryPoints: { client: "src/client/main.ts", style: "src/styles/style.css" },
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
