import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./static.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const buildScript = fileURLToPath(new URL("./build.ts", import.meta.url));
const reviewScript = fileURLToPath(new URL("./review.ts", import.meta.url));

function runScript(script: string): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const child = spawn(process.execPath, [script], { stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`${script} exited with code ${String(code)}`));
  });
  return promise;
}

const runBuild = (): Promise<void> => runScript(buildScript);
const runReview = (): Promise<void> => runScript(reviewScript);

await runBuild();
await runReview();
const live = serve({ reload: true });

let building = false;
let queued = false;
let timer: NodeJS.Timeout | undefined;

async function rebuild(): Promise<void> {
  if (building) {
    queued = true;
    return;
  }

  building = true;
  try {
    await runBuild();
    await runReview();
    live.notify();
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
  } finally {
    building = false;
    if (queued) {
      queued = false;
      await rebuild();
    }
  }
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void rebuild();
  }, 80);
}

for (const dir of ["src", "scripts"]) watch(join(root, dir), { recursive: true }, schedule);
