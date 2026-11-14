import { chromium } from "playwright";
import { serve } from "./serve.mjs";

const PORT = 4199;
const user = process.env["MASKI_USER"];
const password = process.env["MASKI_PASSWORD"];
const baseUrl = process.env["MASKI_BASE"] ?? "https://unredacted.org";

if (!user || !password) {
  process.stderr.write("set MASKI_USER and MASKI_PASSWORD\n");
  process.exit(2);
}

const server = await serve(new URL("../../dist", import.meta.url).pathname, PORT);
const browser = await chromium.launch({
  executablePath: process.env["MASKI_CHROMIUM"] ?? "/nix/store/bjjswgpm41wpy2mzdf8d688p39fpbp4d-chromium-156.0.8078.47/bin/chromium",
});
const page = await browser.newPage();
const failures = [];
page.on("pageerror", (error) => failures.push(String(error).slice(0, 160)));
await page.goto(`http://localhost:${String(PORT)}/chat/`);

const result = await page.evaluate(
  async ({ user: name, password: secret, baseUrl: serverUrl }) => {
    const worker = new Worker(document.querySelector('meta[name="maski:worker"]')?.content ?? "", { type: "module" });
    const events = [];
    let sequence = 0;
    const waiting = new Map();
    worker.addEventListener("message", (message) => {
      const data = message.data;
      if (typeof data.id === "number") {
        const entry = waiting.get(data.id);
        waiting.delete(data.id);
        entry?.(data);
        return;
      }
      events.push(data);
    });
    const send = (command) =>
      new Promise((resolve) => {
        sequence += 1;
        waiting.set(sequence, resolve);
        worker.postMessage({ id: sequence, command });
      });
    const waitForRooms = (ms) =>
      new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const hit = events.findLast((entry) => entry.event === "rooms");
          if ((hit?.rooms?.length ?? 0) > 0 || Date.now() - started > ms) resolve(hit ?? null);
          else setTimeout(tick, 150);
        };
        tick();
      });

    const startReply = await send({ type: "start", accountHash: null, wasm: document.querySelector('meta[name="maski:wasm"]')?.content ?? "" });
    const loggedIn = await send({ type: "login", baseUrl: serverUrl, user: name, password: secret });
    const rooms = await waitForRooms(40000);
    const keys = await send({ type: "keyStatus" });
    const target = (rooms?.rooms ?? []).find((room) => room.encrypted && room.membership === "join");
    const marker = `P1 check ${Date.now().toString(36)}`;
    if (target) await send({ type: "send", roomId: target.roomId, txnId: `txn-${Date.now().toString(36)}`, body: marker });
    const echo = target
      ? await new Promise((resolve) => {
          const since = Date.now();
          const tick = () => {
            const hit = events.findLast((entry) => entry.event === "rooms")?.rooms?.find((room) => room.roomId === target.roomId);
            if (hit?.preview?.body === marker) resolve(hit);
            else if (Date.now() - since > 20000) resolve(null);
            else setTimeout(tick, 200);
          };
          tick();
        })
      : null;
    const list = rooms?.rooms ?? [];
    const decrypted = list.filter((room) => (room.preview?.body ?? "").length > 0 && room.encrypted);
    return {
      startOk: startReply.ok === true,
      loginOk: loggedIn.ok === true,
      userId: loggedIn.ok ? loggedIn.data.session.userId : "",
      loginError: loggedIn.ok ? "" : loggedIn.error,
      keysOk: keys.ok === true,
      keysReady: keys.ok ? keys.data.ready : null,
      rooms: list.length,
      firstRoom: list[0]?.name ?? "",
      encryptedRooms: list.filter((room) => room.encrypted).length,
      decryptedBodies: decrypted.slice(0, 3).map((room) => `${room.name}: ${room.preview.body.slice(0, 50)}`),
      echoDecrypted: echo !== null,
      echoRoom: target?.name ?? "",
      connection: events.filter((entry) => entry.event === "connection").map((entry) => entry.state),
    };
  },
  { user, password: password, baseUrl },
);

await browser.close();
server.close();

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length > 0) process.stdout.write(`page errors: ${failures.join(" | ")}\n`);
const ok = result.startOk && result.loginOk && result.rooms > 0 && result.echoDecrypted && failures.length === 0;
process.stdout.write(ok ? "P1 verified\n" : "P1 failed\n");
process.exit(ok ? 0 : 1);
