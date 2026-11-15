import assert from "node:assert/strict";
import test from "node:test";
import { isProductionOrigin } from "../src/client/shell.ts";
import { generatedPages } from "../scripts/pages.ts";
import {
  parseServiceWorkerManifest,
  precacheUrls,
  serviceWorkerSource,
  type ServiceWorkerManifest,
} from "../src/service-worker.ts";

const shellPages = generatedPages().map((page) => page.url);
const shellAssets = [
  "/assets/style-abc1234567.css",
  "/assets/icon-abc1234567.svg",
  "/assets/guard-abc1234567.js",
  "/assets/prepaint-abc1234567.js",
  "/assets/client-abc1234567.js",
  "/assets/image-worker-abc1234567.js",
  "/assets/matrix-worker-abc1234567.js",
  "/assets/matrix-sdk-crypto-abc1234567.wasm",
  "/assets/watermark-abc1234567.svg",
];

const manifest: ServiceWorkerManifest = {
  version: "abc123456789",
  pages: shellPages.toSorted(),
  assets: shellAssets.toSorted(),
};

const source = serviceWorkerSource(manifest);

void test("the generated service worker inlines its shell manifest", () => {
  assert.deepEqual(parseServiceWorkerManifest(source), manifest);
  assert.deepEqual(precacheUrls(manifest), [...manifest.pages, ...manifest.assets]);
});

void test("the precache holds the generated pages and hashed shell assets only", () => {
  const pages = new Set(generatedPages().map((page) => page.url));
  const hashedAsset = /^\/assets\/[a-z0-9-]+-[A-Za-z0-9_-]{6,}\.(?:css|js|svg|wasm)$/u;

  for (const page of generatedPages()) assert.ok(shellPages.includes(page.url));
  for (const url of precacheUrls(manifest)) {
    assert.ok(pages.has(url) || hashedAsset.test(url), `not a shell page or hashed asset: ${url}`);
    assert.equal(url.includes("?"), false);
    assert.equal(url.includes("#"), false);
    assert.equal(url.includes("@"), false);
  }
});

void test("the precache never holds authenticated endpoints or the review mock", () => {
  const urls = precacheUrls(manifest);
  assert.equal(urls.includes("/login"), false);
  assert.equal(urls.includes("/sync"), false);
  assert.equal(urls.includes("/media"), false);
  assert.equal(
    urls.some((url) => url.startsWith("/login/")),
    false,
  );
  assert.equal(
    urls.some((url) => url.startsWith("/sync")),
    false,
  );
  assert.equal(
    urls.some((url) => url.startsWith("/media")),
    false,
  );
  assert.equal(
    urls.some((url) => url.startsWith("/api")),
    false,
  );
  assert.equal(
    urls.some((url) => url.startsWith("/_matrix")),
    false,
  );
  assert.equal(
    urls.some((url) => url.startsWith("/review")),
    false,
  );
  assert.equal(
    urls.some((url) => url.includes("matrix-client")),
    false,
  );

  // The locale login page is generated shell, not the authenticated `/login` endpoint.
  assert.ok(urls.includes("/en/login/"));
  assert.ok(source.includes("SHELL_PAGES.has(url.pathname)"));
  assert.ok(source.includes("SHELL_ASSETS.has(url.pathname)"));
});

void test("registration is production-only", () => {
  assert.equal(isProductionOrigin("https:", "maski.invalid"), true);
  assert.equal(isProductionOrigin("http:", "maski.invalid"), false);
  assert.equal(isProductionOrigin("https:", "localhost"), false);
  assert.equal(isProductionOrigin("https:", "127.0.0.1"), false);
  assert.equal(isProductionOrigin("https:", "[::1]"), false);
});
