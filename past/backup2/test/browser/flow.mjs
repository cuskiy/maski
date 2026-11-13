import { chromium } from "playwright";

const SERVER = process.env.MASKI_SERVER ?? "http://localhost:8008";
const USER = process.env.MASKI_USER ?? "maski";
const PASSWORD = process.env.MASKI_PASSWORD ?? "";
const RECOVERY = process.env.MASKI_RECOVERY ?? "";
const PROFILE = process.env.MASKI_PROFILE ?? "/tmp/maski-browser";
const URL = process.env.MASKI_URL ?? "http://localhost:5173/";
const shots = process.env.MASKI_SHOTS ?? "/tmp/maski-check";

// One device: the profile is kept between runs, so the account sees the same device and
// the same keys instead of a new one on every run.
const context = await chromium.launchPersistentContext(PROFILE, {
  viewport: { width: 1280, height: 860 },
  executablePath: "/nix/store/bjjswgpm41wpy2mzdf8d688p39fpbp4d-chromium-156.0.8078.47/bin/chromium",
});
const page = context.pages()[0] ?? (await context.newPage());
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${String(error).slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text().slice(0, 200)}`);
});

const step = async (name, action) => {
  try {
    await action();
    console.log("OK  ", name);
  } catch (error) {
    console.log("FAIL", name, "-", String(error).split("\n")[0].slice(0, 160));
  }
};

await page.goto(URL, { waitUntil: "domcontentloaded" });

await step("sign in", async () => {
  if ((await page.locator(".auth-form").count()) === 0) return;
  if (!PASSWORD) throw new Error("MASKI_PASSWORD is not set");
  await page.fill('input[name="server"]', SERVER);
  await page.fill('input[name="username"]', USER);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('form button[type="submit"]');
  await page.waitForSelector("text=Unlock your messages", { timeout: 60000 });
  if (!RECOVERY) throw new Error("MASKI_RECOVERY is not set, open the gate once to create a key");
  await page.fill('input[name="key"]', RECOVERY);
  await page.click('button:has-text("Unlock")');
});

await step("shell", async () => {
  await page.waitForSelector(".shell", { timeout: 60000 });
  await page.waitForTimeout(2000);
  const rooms = await page.locator(".room-row").allTextContents();
  console.log("     rooms:", rooms.length, rooms[0]?.replace(/\n/g, " | ").slice(0, 60) ?? "");
  await page.screenshot({ path: `${shots}/B1-shell.png` });
});

await step("send and echo", async () => {
  await page.locator(".room-row").first().click();
  await page.waitForTimeout(1500);
  const text = `flow ${Date.now()}`;
  await page.fill(".composer-field", text);
  await page.click(".composer-send");
  await page.waitForFunction((value) => [...document.querySelectorAll(".bubble-text")].some((node) => node.textContent === value), text, { timeout: 20000 });
  await page.waitForTimeout(4000);
  const copies = await page.evaluate((value) => [...document.querySelectorAll(".bubble-text")].filter((node) => node.textContent === value).length, text);
  if (copies !== 1) throw new Error(`the message appears ${copies} times`);
  await page.screenshot({ path: `${shots}/B2-sent.png` });
});

await step("reload keeps the message", async () => {
  const before = await page.locator(".bubble-text").count();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".shell", { timeout: 60000 });
  await page.waitForTimeout(3000);
  const after = await page.locator(".bubble-text").count();
  if (after < before) throw new Error(`before ${before}, after ${after}`);
});

await step("picker", async () => {
  await page.click('.composer button[aria-label="Emoji and stickers"]');
  await page.waitForTimeout(500);
  const cells = await page.locator(".picker .emoji-cell").count();
  if (cells === 0) throw new Error("the picker is empty");
  await page.screenshot({ path: `${shots}/B3-picker.png` });
  await page.keyboard.press("Escape");
  await page.click(".room-header button:has-text('Room settings'), .room-header .icon-button");
});

await step("settings and search", async () => {
  await page.keyboard.press("Escape");
  await page.click('.nav-action:has-text("Settings")');
  await page.waitForSelector(".dialog");
  await page.screenshot({ path: `${shots}/B4-settings.png` });
  await page.keyboard.press("Escape");
  await page.click('.nav-action:has-text("Search")');
  await page.fill('.dialog input[type="search"]', "flow");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/B5-search.png` });
  await page.keyboard.press("Escape");
});

await step("dark", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/B6-dark.png` });
});

await step("narrow", async () => {
  await page.setViewportSize({ width: 420, height: 820 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/B7-narrow-room.png` });
  await page.locator(".back-button").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/B8-narrow-home.png` });
  await page.locator(".room-row").first().click();
  await page.waitForTimeout(500);
});

await step("no horizontal overflow", async () => {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    wide: [...document.querySelectorAll("*")].filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1).length,
  }));
  if (overflow.document > 0 || overflow.wide > 0) throw new Error(JSON.stringify(overflow));
});

console.log("errors:", errors.slice(0, 6));
await context.close();
