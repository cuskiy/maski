import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve } from "./static.ts";

const root = fileURLToPath(new URL("../dist", import.meta.url));
const port = Number(process.env["PORT"] ?? 5173);

const builder = spawn(process.execPath, ["scripts/build.ts", "--watch"], { stdio: "inherit" });
const server = await serve(root, port, { reload: true });
process.stdout.write(`dev on http://localhost:${String(port)}/ — the page reloads after each build\n`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    builder.kill();
    server.close();
    process.exit(0);
  });
}
