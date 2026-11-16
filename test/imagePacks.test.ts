import assert from "node:assert/strict";
import test from "node:test";
import { parseUserImagePacks } from "../src/worker/imagePacks.ts";

void test("parses stable and legacy user image packs", () => {
  const stable = {
    pack: { display_name: " Favourites " },
    images: {
      wave: {
        url: "mxc://example.org/wave",
        body: "A waving cat",
        info: { w: 512, h: 512, size: 1200, mimetype: "image/png" },
      },
      ":bad:": { url: "https://example.org/no", body: "rejected" },
    },
  };
  const legacy = {
    images: {
      party: { url: "mxc://example.org/party" },
    },
  };
  const packs = parseUserImagePacks(stable, legacy);
  assert.deepEqual(
    packs.map((pack) => [pack.id, pack.name]),
    [
      ["user:stable", "Favourites"],
      ["user:legacy", "My stickers"],
    ],
  );
  assert.deepEqual(packs[0]?.images, [
    {
      shortcode: "wave",
      body: "A waving cat",
      url: "mxc://example.org/wave",
      width: 512,
      height: 512,
      size: 1200,
      mime: "image/png",
    },
  ]);
  assert.equal(packs[1]?.images[0]?.body, "party");
});

void test("a malformed image does not discard the rest of the pack", () => {
  const packs = parseUserImagePacks(
    {
      images: {
        broken: { url: "javascript:alert(1)" },
        missing: { body: "no url" },
        good: { url: "mxc://example.org/good", body: "Good" },
      },
    },
    null,
  );
  assert.deepEqual(
    packs[0]?.images.map((image) => image.shortcode),
    ["good"],
  );
});

void test("user packs are bounded", () => {
  const images = Object.fromEntries(
    Array.from({ length: 120 }, (_, index) => [
      `image-${String(index)}`,
      { url: `mxc://example.org/${String(index)}` },
    ]),
  );
  const packs = parseUserImagePacks({ images }, null);
  assert.equal(packs[0]?.images.length, 100);
});

void test("no account data means no packs", () => {
  assert.deepEqual(parseUserImagePacks(null, undefined), []);
  assert.deepEqual(parseUserImagePacks({}, {}), []);
});
