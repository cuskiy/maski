import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type ConsoleMessage } from "playwright";
import { writeReview } from "./review.ts";
import { serve } from "./static.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const widths = [390, 856, 1280] as const;

function chromiumPath(): string | undefined {
  const configured = process.env["CHROMIUM_PATH"];
  if (configured !== undefined && configured !== "") return configured;
  for (const name of ["chromium", "chromium-browser", "google-chrome"]) {
    try {
      const path = execFileSync("which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (path !== "") return path;
    } catch {
      // Try the next installed browser name.
    }
  }
  return undefined;
}

function isConsoleError(message: ConsoleMessage): boolean {
  return message.type() === "error";
}

async function main(): Promise<void> {
  if (!existsSync(join(root, "dist", "index.html"))) throw new Error("dist is missing; run npm run bundle first");
  if (!existsSync(join(root, "review-dist", "review", "index.html"))) await writeReview();

  const served = serve({ port: 0, host: "127.0.0.1" });
  try {
    let base = "";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (served.port > 0) {
        base = `http://127.0.0.1:${String(served.port)}`;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.notEqual(base, "", "the smoke server did not bind a port");

    const executablePath = chromiumPath();
    const browser = await chromium.launch(
      executablePath === undefined
        ? { headless: true, args: ["--no-sandbox"] }
        : { headless: true, args: ["--no-sandbox"], executablePath },
    );
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors: string[] = [];
      page.on("console", (message) => {
        if (isConsoleError(message)) errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      const response = await page.goto(`${base}/en/`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200);
      const headers = response?.headers() ?? {};
      assert.match(headers["content-security-policy"] ?? "", /script-src 'self'/u);
      assert.doesNotMatch(headers["content-security-policy"] ?? "", /unsafe-inline/u);
      assert.equal(await page.locator("html").getAttribute("lang"), "en");

      await page.goto(`${base}/en/key/`, { waitUntil: "networkidle" });
      assert.match(page.url(), /\/en\/server\/$/u);

      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/review/`, { waitUntil: "networkidle" });
        await page.evaluate(() => {
          document.querySelector<HTMLElement>('#surface-nav-menu [commandfor="surface-settings"]')?.click();
        });
        await page.waitForSelector("#surface-settings[open]");
        await page.keyboard.press("Escape");
        await page.waitForSelector("#surface-settings:not([open])");
        if (width < 704) {
          await page.evaluate(() => document.querySelector<HTMLElement>("[data-room] button")?.click());
        }
        await page.waitForSelector('[data-region="composer"]');
        const layout = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          const composer = document.querySelector<HTMLElement>('[data-region="composer"]');
          return {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            scrollWidth: doc.scrollWidth,
            scrollHeight: body.scrollHeight,
            composerHeight: composer?.getBoundingClientRect().height ?? 0,
          };
        });
        assert.ok(layout.scrollWidth <= layout.innerWidth + 1, `horizontal overflow at ${String(width)}`);
        assert.ok(layout.scrollHeight >= layout.innerHeight - 1, `page does not fill the viewport at ${String(width)}`);
        assert.ok(layout.composerHeight > 0, `composer is missing at ${String(width)}`);
      }

      assert.deepEqual(errors, []);
      process.stdout.write(`smoke passed: ${String(widths.length)} widths, no console errors\n`);
    } finally {
      await browser.close();
    }
  } finally {
    await served.close();
  }
}

await main();
