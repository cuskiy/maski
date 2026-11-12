import { chromium } from "playwright";

const SERVER = process.env.MASKI_SERVER ?? "http://localhost:8008";
const USER = process.env.MASKI_USER ?? "maski-rewrite-1";
const PASSWORD = process.env.MASKI_PASSWORD ?? "test-password-123";
let RECOVERY = process.env.MASKI_RECOVERY ?? "";
const shots = "/tmp/maski-check";
const browser = await chromium.launch({ executablePath: "/nix/store/bjjswgpm41wpy2mzdf8d688p39fpbp4d-chromium-156.0.8078.47/bin/chromium" });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${String(error).slice(0, 200)}`));
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text().slice(0, 200)}`); });

const step = async (name, action) => {
  try {
    await action();
    console.log("OK  ", name);
  } catch (error) {
    console.log("FAIL", name, "-", String(error).split("\n")[0].slice(0, 160));
  }
};

await step("login", async () => {
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.fill('input[name="server"]', SERVER);
  await page.fill('input[name="username"]', USER);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('form button[type="submit"]');
  await page.waitForSelector("text=Unlock your messages", { timeout: 40000 });
});

await step("unlock", async () => {
  // A fresh account has no key yet, so the first run creates one and the key is
  // kept for the second run, which exercises the unlock path.
  if (RECOVERY) {
    await page.fill('input[name="key"]', RECOVERY);
    await page.click('button:has-text("Unlock")');
    await page.waitForSelector(".shell", { timeout: 40000 });
    return;
  }
  await page.click('button:has-text("Start over with a new key")');
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Create a new key")');
  await page.waitForSelector(".recovery-key", { timeout: 60000 });
  RECOVERY = (await page.locator(".recovery-key").textContent()) ?? "";
  console.log("     key:", RECOVERY);
  await page.click('button:has-text("I saved my key")');
  await page.waitForSelector(".shell", { timeout: 40000 });
});

await step("first paint", async () => {
  const rooms = await page.locator(".room-row").count();
  console.log("     rooms:", rooms);
  await page.screenshot({ path: `${shots}/F1-shell.png` });
});

await step("create room", async () => {
  await page.click('.nav-action:has-text("Create room")');
  await page.waitForSelector(".dialog");
  await page.fill('.dialog input[aria-label="Name"]', "Rewrite room");
  await page.click('.dialog button:has-text("Create")');
  await page.waitForSelector(".composer-field", { timeout: 30000 });
});

await step("send message", async () => {
  await page.fill(".composer-field", "hello from the rewrite");
  await page.click(".composer-send");
  await page.waitForSelector("text=hello from the rewrite", { timeout: 20000 });
  await page.screenshot({ path: `${shots}/F2-sent.png` });
});

await step("own message has no duplicate", async () => {
  await page.waitForTimeout(4000);
  const count = await page.locator(".bubble-text:has-text('hello from the rewrite')").count();
  console.log("     bubbles:", count);
});

await step("reload keeps history", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".shell", { timeout: 40000 });
  await page.waitForSelector("text=hello from the rewrite", { timeout: 20000 });
  await page.screenshot({ path: `${shots}/F3-reload.png` });
});

await step("picker", async () => {
  await page.click('.composer button[aria-label="Emoji and stickers"]');
  await page.waitForTimeout(600);
  const cells = await page.locator(".picker .emoji-cell").count();
  console.log("     cells:", cells);
  await page.screenshot({ path: `${shots}/F4-picker.png` });
});

await step("settings", async () => {
  await page.keyboard.press("Escape");
  await page.click('.nav-action:has-text("Settings")');
  await page.waitForSelector(".dialog");
  await page.screenshot({ path: `${shots}/F5-settings.png` });
  await page.keyboard.press("Escape");
});

await step("search", async () => {
  await page.click('.nav-action:has-text("Search")');
  await page.fill('.dialog input[type="search"]', "rewrite");
  await page.waitForTimeout(900);
  const rows = await page.locator(".search-row").count();
  console.log("     hits:", rows);
  await page.keyboard.press("Escape");
});

await step("dark", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/F6-dark.png` });
});

await step("narrow", async () => {
  await page.setViewportSize({ width: 420, height: 820 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/F8-narrow-room.png` });
  await page.locator(".back-button").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/F7-narrow-home.png` });
  await page.locator(".room-row").first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/F8-narrow-room.png` });
});

await step("no horizontal scroll", async () => {
  const metrics = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
    wide: [...document.querySelectorAll("*")].filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1).length,
  }));
  console.log("     ", JSON.stringify(metrics));
});

console.log("errors:", errors.slice(0, 6));
await browser.close();
