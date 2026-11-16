import assert from "node:assert/strict";
import test from "node:test";
import { parseGlobalPackReferences, parsePackContent, parseUserPack } from "../src/worker/imagePacks.ts";

void test("parses the account's legacy user pack", () => {
  const pack = parseUserPack({
    pack: { display_name: " Favourites " },
    images: {
      wave: {
        url: "mxc://example.org/wave",
        body: "A waving cat",
        info: { w: 512, h: 512, size: 1200, mimetype: "image/png" },
      },
      ":bad:": { url: "https://example.org/no", body: "rejected" },
    },
  });
  assert.deepEqual(pack, {
    id: "user:legacy",
    name: "Favourites",
    images: [
      {
        shortcode: "wave",
        body: "A waving cat",
        url: "mxc://example.org/wave",
        width: 512,
        height: 512,
        size: 1200,
        mime: "image/png",
      },
    ],
  });
});

void test("parses a stable room pack and honors sticker usage", () => {
  const pack = parsePackContent(
    {
      pack: { display_name: "Cats", usage: ["sticker"] },
      images: {
        cat_wave: { url: "mxc://example.org/cat", body: "Waving cat" },
        cat_emote: { url: "mxc://example.org/emote", usage: ["emoticon"] },
        no_url: { body: "missing" },
      },
    },
    "room:!room:example.org:stickers",
    "Fallback",
  );
  assert.equal(pack?.name, "Cats");
  assert.deepEqual(
    pack?.images.map((image) => image.shortcode),
    ["cat_wave"],
  );
});

void test("uses the room fallback name and includes unnamed usage packs", () => {
  const pack = parsePackContent(
    { images: { wave: { url: "mxc://example.org/wave" } } },
    "room:!room:example.org:",
    "Room name",
  );
  assert.equal(pack?.name, "Room name");
  assert.equal(pack?.images[0]?.body, "wave");
});

void test("stable global references take precedence, including an empty list", () => {
  const legacy = { rooms: { "!legacy:example.org": { old: {} } } };
  assert.deepEqual(parseGlobalPackReferences(null, legacy), [{ roomId: "!legacy:example.org", stateKey: "old" }]);
  assert.deepEqual(parseGlobalPackReferences({ rooms: {} }, legacy), []);
  assert.deepEqual(parseGlobalPackReferences({ rooms: { "!stable:example.org": { cats: {}, other: {} } } }, legacy), [
    { roomId: "!stable:example.org", stateKey: "cats" },
    { roomId: "!stable:example.org", stateKey: "other" },
  ]);
});

void test("a malformed image does not discard the rest of the pack", () => {
  const pack = parsePackContent(
    {
      images: {
        broken: { url: "javascript:alert(1)" },
        missing: { body: "no url" },
        good: { url: "mxc://example.org/good", body: "Good" },
      },
    },
    "room:!a:example.org:pack",
    "Pack",
  );
  assert.deepEqual(
    pack?.images.map((image) => image.shortcode),
    ["good"],
  );
});

void test("image and reference counts are bounded", () => {
  const images = Object.fromEntries(
    Array.from({ length: 120 }, (_, index) => [
      `image-${String(index)}`,
      { url: `mxc://example.org/${String(index)}` },
    ]),
  );
  assert.equal(parsePackContent({ images }, "room:!a:example.org:pack", "Pack")?.images.length, 100);
  const rooms = Object.fromEntries(
    Array.from({ length: 80 }, (_, index) => [
      `!room${String(index)}:example.org`,
      Object.fromEntries(Array.from({ length: 8 }, (_unused, key) => [`key${String(key)}`, {}])),
    ]),
  );
  assert.equal(parseGlobalPackReferences({ rooms }, null).length, 64);
});

void test("no account data means no packs", () => {
  assert.equal(parseUserPack(null), null);
  assert.deepEqual(parseGlobalPackReferences({}, {}), []);
});
