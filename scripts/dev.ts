import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.ts";
import { serve } from "./static.ts";

const root = fileURLToPath(new URL("../dist", import.meta.url));
const port = Number(process.env["PORT"] ?? config.serve.port);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/** The same gates `npm run check` uses, so a broken type or a stray marker shows up immediately. */
function gate(args: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(npm, args, { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

for (const task of [["run", "code"], ["run", "lint"]]) {
  const code = await gate(task);
  if (code !== 0) {
    process.stderr.write(`dev stopped: ${task.join(" ")} failed\n`);
    process.exit(code);
  }
}

const child = (command: string, args: readonly string[]): ReturnType<typeof spawn> =>
  spawn(command, args, { stdio: "inherit" });

const builder = child(npm, ["run", "build:only", "--", "--watch"]);
const typecheck = child(npm, ["run", "code", "--", "--watch", "--preserveWatchOutput"]);
const server = await serve(root, port, { reload: true });
process.stdout.write(`dev on http://${config.serve.host}:${String(port)}/ — types are checked on save, the page reloads after each build\n`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    builder.kill();
    typecheck.kill();
    server.close();
    process.exit(0);
  });
}
