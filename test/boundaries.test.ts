import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../src/", import.meta.url);

function files(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    return entry.isDirectory() ? files(child) : entry.name.endsWith(".ts") ? [child] : [];
  });
}

void test("the static and UI layers do not import client code or the SDK", () => {
  const staticRoots = ["pages", "layouts", "components", "lib", "catalogs", "core"];
  for (const rootName of staticRoots) {
    for (const file of files(new URL(`${rootName}/`, root))) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /from\s+["'][^"']*\/client\//u, file.pathname);
      assert.doesNotMatch(source, /from\s+["']matrix-js-sdk["']/u, file.pathname);
      assert.doesNotMatch(source, /from\s+["']@matrix-org\/matrix-sdk-crypto-wasm["']/u, file.pathname);
    }
  }
});

void test("the client never imports the Matrix SDK", () => {
  for (const file of files(new URL("client/", root))) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from\s+["']matrix-js-sdk["']/u, file.pathname);
    assert.doesNotMatch(source, /from\s+["']@matrix-org\/matrix-sdk-crypto-wasm["']/u, file.pathname);
  }
});

void test("only the worker imports the Matrix SDK", () => {
  for (const rootName of ["client", "protocol", "core", "components", "pages", "layouts", "lib", "catalogs"]) {
    for (const file of files(new URL(`${rootName}/`, root))) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /from\s+["']matrix-js-sdk(?:\/[^"']*)?["']/u, file.pathname);
      assert.doesNotMatch(source, /from\s+["']@matrix-org\/matrix-sdk-crypto-wasm(?:\/[^"']*)?["']/u, file.pathname);
    }
  }
});

void test("the protocol imports neither client nor worker code", () => {
  for (const file of files(new URL("protocol/", root))) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*\/(?:client|worker)\//u, file.pathname);
  }
});

void test("the client and worker do not import each other", () => {
  for (const file of files(new URL("client/", root))) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*\/worker\//u, file.pathname);
  }
  for (const file of files(new URL("worker/", root))) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*\/client\//u, file.pathname);
  }
});

void test("the client never assigns serialized markup", () => {
  for (const file of files(new URL("client/", root))) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\.(?:inner|outer)HTML\b/u, file.pathname);
  }
});
