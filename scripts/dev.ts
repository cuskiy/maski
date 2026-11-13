import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.ts";
import { serve } from "./static.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const bin = (name: string): string => join(root, "node_modules", ".bin", name);
const port = Number(process.env["PORT"] ?? config.serve.port);

/** A gate is one line: what ran, how long it took, and its output only when it fails. */
async function gate(label: string, command: string, args: readonly string[]): Promise<boolean> {
  const started = Date.now();
  const output: string[] = [];
  const code = await new Promise<number>((resolve) => {
    const child = spawn(command, [...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
    child.on("error", () => resolve(1));
    child.on("exit", (status) => resolve(status ?? 1));
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (code !== 0) {
    process.stderr.write(output.join(""));
    process.stderr.write(`✗ ${label}\n`);
    return false;
  }
  process.stdout.write(`✓ ${label} (${seconds}s)\n`);
  return true;
}

const gates: Array<[string, string, string[]]> = [
  ["types", bin("tsc"), ["--noEmit", "--pretty", "false"]],
  ["lint", bin("oxlint"), ["--type-aware", "--deny-warnings", "--import-plugin", "--promise-plugin", "src", "scripts", "test"]],
  ["style", bin("stylelint"), ["src/**/*.css", "static/**/*.css", "--max-warnings=0"]],
];

for (const [label, command, args] of gates) {
  if (!(await gate(label, command, args))) {
    process.stderr.write("dev stopped before starting\n");
    process.exit(1);
  }
}

const children: ChildProcess[] = [];
const start = (label: string, command: string, args: readonly string[]): void => {
  const child = spawn(command, [...args], { cwd: root, stdio: "inherit", env: { ...process.env, FORCE_COLOR: "1" } });
  child.on("error", () => process.stderr.write(`${label} could not start\n`));
  children.push(child);
};

start("bundle", process.execPath, ["scripts/build.ts", "--watch"]);
start("types", bin("tsc"), ["--noEmit", "--watch", "--preserveWatchOutput", "--pretty", "false"]);

const server = await serve(join(root, "dist"), port, { reload: true });
process.stdout.write(`\nmaski dev → http://${config.serve.host}:${String(port)}/  (ctrl-c stops)\n`);

const stop = (): void => {
  for (const child of children) child.kill();
  server.close();
  process.stdout.write("\nstopped\n");
  process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stop);
