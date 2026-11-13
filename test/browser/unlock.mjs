import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const PORT = 4450;
const user = process.env["MASKI_USER"];
const password = process.env["MASKI_PASSWORD"];
const recovery = process.env["MASKI_RECOVERY"];
const base = process.env["MASKI_BASE"] ?? "https://matrix.unredacted.org";
if (!user || !password || !recovery) {
  process.stderr.write("set MASKI_USER, MASKI_PASSWORD and MASKI_RECOVERY\n");
  process.exit(2);
}

const server = await serve(new URL("../../dist", import.meta.url).pathname, PORT);
const browser = await chromium.launch({
  executablePath: process.env["MASKI_CHROMIUM"] ?? "/nix/store/bjjswgpm41wpy2mzdf8d688p39fpbp4d-chromium-156.0.8078.47/bin/chromium",
});
const page = await browser.newPage();
await page.goto(`http://localhost:${String(PORT)}/chat/`);

const result = await page.evaluate(
  async ({ user: name, password: secret, recovery: key, baseUrl }) => {
    const worker = new Worker(document.querySelector('meta[name="maski:worker"]')?.content ?? "", { type: "module" });
    const ask = (command) =>
      new Promise((resolve) => {
        const id = Math.floor(Math.random() * 1e9);
        const listener = (message) => {
          if (message.data.id !== id) return;
          worker.removeEventListener("message", listener);
          resolve(message.data);
        };
        worker.addEventListener("message", listener);
        worker.postMessage({ id, command });
      });
    await ask({ type: "start", accountHash: null, wasm: document.querySelector('meta[name="maski:wasm"]')?.content ?? "" });
    const login = await ask({ type: "login", baseUrl, user: name, password: secret });
    if (!login.ok) return { step: "login", error: login.error };
    const before = await ask({ type: "keyStatus" });
    const unlock = await ask({ type: "unlock", input: key, password: secret });
    const after = await ask({ type: "keyStatus" });
    return { before: before.data, unlock: unlock.ok ? unlock.data : `failed: ${unlock.error}`, after: after.data };
  },
  { user, password, recovery, baseUrl: base },
);

await browser.close();
server.close();
process.stdout.write(`${JSON.stringify(result, null, 1)}\n`);
process.exit(0);
