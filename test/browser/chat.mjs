import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const PORT = 4300;
const user = process.env["MASKI_USER"] ?? "";
const password = process.env["MASKI_PASSWORD"] ?? "";
const base = process.env["MASKI_BASE"] ?? "https://matrix.unredacted.org";
if (!user || !password) {
  process.stderr.write("set MASKI_USER and MASKI_PASSWORD\n");
  process.exit(2);
}

const server = await serve(new URL("../../dist", import.meta.url).pathname, PORT);
const browser = await chromium.launch({
  executablePath: process.env["MASKI_CHROMIUM"] ?? "/nix/store/bjjswgpm41wpy2mzdf8d688p39fpbp4d-chromium-156.0.8078.47/bin/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text().slice(0, 200));
});

await page.goto(`http://localhost:${String(PORT)}/chat/`);

const login = await page.evaluate(
  async ({ user: name, password: secret, baseUrl }) => {
    const worker = new Worker(document.querySelector('meta[name="maski:worker"]').content, { type: "module" });
    const wasm = document.querySelector('meta[name="maski:wasm"]').content;
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
    const started = await ask({ type: "start", accountHash: null, wasm });
    if (!started.ok) return { error: started.error };
    const reply = await ask({ type: "login", baseUrl, user: name, password: secret });
    if (!reply.ok) return { error: reply.error };
    const session = reply.data.session;
    localStorage.setItem("maski:account", JSON.stringify({ hash: session.accountHash, userId: session.userId, name: session.name, baseUrl: session.baseUrl }));
    worker.terminate();
    return { userId: session.userId, hash: session.accountHash };
  },
  { user, password, baseUrl: base },
);
if (login.error !== undefined) throw new Error(login.error);

await page.reload();
await page.waitForSelector(".room-row", { timeout: 60000 });
const rooms = await page.locator(".room-row").count();
await page.locator(".room-row .room-link").first().click();
await page.waitForTimeout(4000);
const bubbles = await page.locator(".bubble").count();
const header = await page.locator(".room-title").innerText().catch(() => "");
await page.screenshot({ path: "/tmp/p0/chat-data.png" });

const box = await page.locator(".composer textarea").boundingBox();
await page.fill(".composer textarea", "P3 check from the page");
await page.locator(".composer-send").click();
await page.waitForTimeout(3000);
const sent = await page.locator(".bubble-text", { hasText: "P3 check from the page" }).count();
await page.screenshot({ path: "/tmp/p0/chat-sent.png" });

await browser.close();
server.close();
console.log(JSON.stringify({ user: login.userId, rooms, header, bubbles, sent, hasBox: box !== null, errors: errors.slice(0, 3) }, null, 1));
process.exit(rooms > 0 && bubbles > 0 && sent === 1 && errors.length === 0 ? 0 : 1);
