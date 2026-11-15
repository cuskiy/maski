import assert from "node:assert/strict";
import test from "node:test";
import type { MatrixEvent, Room } from "matrix-js-sdk";
import { projectMessage } from "../src/worker/project.ts";
import { buildMediaContent, safeMediaMime, sniffMime } from "../src/worker/mediaFormat.ts";
import { decryptAttachment, encryptAttachment, encryptedFile, fromBase64 } from "../src/worker/mediaCrypto.ts";
import { mxcDownloadUrl } from "../src/worker/mediaTransport.ts";
import { createMediaCache } from "../src/worker/mediaCache.ts";
import type { MediaCacheRecord, MediaCacheUsage } from "../src/worker/mediaTypes.ts";
import { WorkerFailure } from "../src/worker/failure.ts";
import { createOutbox, type OutboxBackend, type OutboxRecord } from "../src/worker/outbox.ts";
import { queuedRow } from "../src/core/message.ts";
import type { MessageRow } from "../src/core/types.ts";

const ROOM = "!r:example.org";

function cacheRecord(key: string, size: number): MediaCacheRecord {
  return {
    key,
    blob: new Blob([new Uint8Array(size)]),
    mime: "image/png",
    width: 1,
    height: 1,
    size,
    createdAt: 1,
    lastUsed: 1,
  };
}

function failureCode(error: unknown): string {
  return error instanceof WorkerFailure ? error.code : "none";
}

void test("the MIME allowlist rejects scriptable bytes and falls back for a plain file", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const html = new TextEncoder().encode("  <html><script>alert(1)</script>");
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal(sniffMime(png), "image/png");
  assert.equal(sniffMime(html), "text/html");
  assert.equal(sniffMime(svg), "text/html");
  assert.equal(safeMediaMime(png, "image/png", "image"), "image/png");
  for (const bytes of [html, svg]) {
    assert.match(
      (() => {
        try {
          safeMediaMime(bytes, "image/png", "image");
          return "accepted";
        } catch (error) {
          return failureCode(error);
        }
      })(),
      /unsupported/u,
    );
    assert.match(
      (() => {
        try {
          safeMediaMime(bytes, "image/svg+xml", "file");
          return "accepted";
        } catch (error) {
          return failureCode(error);
        }
      })(),
      /unsupported/u,
    );
  }
  const unknown = new TextEncoder().encode("hello");
  assert.equal(safeMediaMime(unknown, "application/octet-stream", "file"), "application/octet-stream");
  assert.throws(
    () => safeMediaMime(unknown, "application/octet-stream", "image"),
    (error: unknown) => {
      return failureCode(error) === "unsupported";
    },
  );
});

void test("upload content is one shape per reference and stickers carry no encrypted file", async () => {
  const plain = buildMediaContent({
    kind: "image",
    name: "photo.webp",
    caption: "a caption",
    html: null,
    mime: "image/webp",
    size: 12,
    width: 10,
    height: 20,
    duration: null,
    reference: { kind: "mxc", url: "mxc://example.org/image" },
  });
  assert.equal(plain.event, "message");
  assert.equal(plain.msgtype, "m.image");
  assert.equal(plain.body, "a caption");
  assert.equal(plain.info.mimetype, "image/webp");

  const sealed = await encryptAttachment(new Blob(["hello"]));
  const encrypted = buildMediaContent({
    kind: "video",
    name: "clip.mp4",
    caption: "",
    html: "x",
    mime: "video/mp4",
    size: 5,
    width: 10,
    height: 10,
    duration: 1000,
    reference: { kind: "encrypted", file: encryptedFile("mxc://example.org/cipher", sealed) },
  });
  assert.equal(encrypted.msgtype, "m.video");
  assert.equal(encrypted.body, "clip.mp4");
  assert.equal(encrypted.html, null);
  assert.notEqual(encrypted.reference.kind, undefined);

  const sticker = buildMediaContent({
    kind: "sticker",
    name: "wave",
    caption: "",
    html: null,
    mime: "image/webp",
    size: 5,
    width: 256,
    height: 256,
    duration: null,
    reference: { kind: "mxc", url: "mxc://example.org/sticker" },
  });
  assert.equal(sticker.event, "sticker");
  assert.equal(sticker.msgtype, null);
  assert.throws(
    () =>
      buildMediaContent({
        kind: "sticker",
        name: "wave",
        caption: "",
        html: null,
        mime: "image/webp",
        size: 5,
        width: 1,
        height: 1,
        duration: null,
        reference: { kind: "encrypted", file: encryptedFile("mxc://example.org/x", sealed) },
      }),
    (error: unknown) => failureCode(error) === "unsupported",
  );
});

void test("AES-CTR round-trips and a hash mismatch is a corrupt failure", async () => {
  const plaintext = new TextEncoder().encode("attachment bytes");
  const sealed = await encryptAttachment(new Blob([plaintext]));
  const file = encryptedFile("mxc://example.org/cipher", sealed);
  assert.equal(file.v, "v2");
  assert.equal(fromBase64(file.key.k)?.length, 32);
  assert.equal(fromBase64(file.iv)?.length, 16);
  assert.deepEqual(file.iv.slice(-12), sealed.iv.slice(-12));
  assert.equal(file.iv.endsWith("AAAAAAAAAAA"), true);
  const opened = await decryptAttachment(sealed.ciphertext, file);
  assert.deepEqual(new Uint8Array(await opened.arrayBuffer()), plaintext);

  const tampered = new Uint8Array(await sealed.ciphertext.arrayBuffer());
  tampered[0] = (tampered[0] ?? 0) ^ 0xff;
  await assert.rejects(
    decryptAttachment(new Blob([tampered]), file),
    (error: unknown) => failureCode(error) === "corrupt",
  );
});

void test("the authenticated thumbnail URL always carries both dimensions", () => {
  const full = mxcDownloadUrl("https://matrix.example.org", "mxc://example.org/abc", null);
  assert.match(full, /\/_matrix\/client\/v1\/media\/download\/example\.org\/abc/u);
  const thumb = mxcDownloadUrl("https://matrix.example.org", "mxc://example.org/abc", {
    width: 320,
    height: 240,
  });
  assert.match(thumb, /\/_matrix\/client\/v1\/media\/thumbnail\//u);
  assert.match(thumb, /width=320/u);
  assert.match(thumb, /height=240/u);
  assert.match(thumb, /method=scale/u);
  assert.throws(() => mxcDownloadUrl("https://matrix.example.org", "https://tracker.invalid/x", null));
});

void test("media projection keeps the caption on the row and the source out of it", () => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const event = {
    getType: () => "m.room.message",
    getContent: () => ({
      msgtype: "m.image",
      body: "A caption",
      filename: "photo.png",
      url: "mxc://example.org/secret",
      info: { mimetype: "image/png", w: 10, h: 20, size: 30 },
    }),
    getRelation: () => null,
    getId: () => "$e:example.org",
    getTs: () => 1,
    getSender: () => "@bob:example.org",
    getUnsigned: () => ({}),
    getTxnId: () => undefined,
    isEncrypted: () => false,
    isDecryptionFailure: () => false,
    decryptionFailureReason: undefined,
    isRedacted: () => false,
    replacingEvent: () => null,
    replyEventId: undefined,
  } as unknown as MatrixEvent;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const room = {
    roomId: ROOM,
    relations: { getAllChildEventsForEvent: () => [] },
    findEventById: () => undefined,
    getMember: (userId: string) => ({ userId, name: userId }),
  } as unknown as Room;
  const row = projectMessage(room, event, "@alice:example.org");
  assert.equal(row?.body, "A caption");
  assert.equal(row?.media?.name, "photo.png");
  assert.equal(row?.media?.url, null);
  assert.doesNotMatch(JSON.stringify(row), /mxc:\/\//u);
});

void test("the object URL cache mints once and revokes on eviction and dispose", async () => {
  const stored = new Map<string, MediaCacheRecord>();
  const usage = new Map<string, MediaCacheUsage>();
  const live = new Set<string>();
  let minted = 0;
  const revoked: string[] = [];
  const cache = createMediaCache({
    backend: {
      readMediaCache: (key) => Promise.resolve(stored.get(key) ?? null),
      writeMediaCache: (record) => {
        stored.set(record.key, record);
        usage.set(record.key, { key: record.key, size: record.size, lastUsed: record.lastUsed });
        return Promise.resolve();
      },
      removeMediaCache: (key) => {
        stored.delete(key);
        usage.delete(key);
        return Promise.resolve();
      },
      readMediaUsage: () => Promise.resolve([...usage.values()]),
    },
    createUrl: () => {
      minted += 1;
      const url = `blob:https://example.org/${String(minted)}`;
      live.add(url);
      return url;
    },
    revokeUrl: (url) => {
      live.delete(url);
      revoked.push(url);
    },
    now: () => 1,
    budget: 6,
  });
  const first = await cache.put(cacheRecord("a", 6));
  const again = await cache.put(cacheRecord("a", 6));
  assert.equal(again.url, first.url);
  assert.equal(minted, 1);
  const second = await cache.put(cacheRecord("b", 6));
  assert.deepEqual(second.evicted, ["a"]);
  assert.equal(revoked.length, 1);
  assert.equal(live.has(first.url), false);
  assert.deepEqual(cache.dispose(), ["b"]);
  assert.equal(live.size, 0);
});

void test("the outbox uploads an attachment once and retries only the send", async () => {
  const records = new Map<string, OutboxRecord>();
  const backend: OutboxBackend = {
    put: (record) => {
      records.set(record.transactionId, record);
      return Promise.resolve();
    },
    read: (messageId) =>
      Promise.resolve([...records.values()].find((record) => record.messageId === messageId) ?? null),
    readByTransaction: (transactionId) => Promise.resolve(records.get(transactionId) ?? null),
    list: () => Promise.resolve([...records.values()]),
    remove: (transactionId) => {
      records.delete(transactionId);
      return Promise.resolve();
    },
    complete: (record, row) => {
      records.delete(record.transactionId);
      records.set(row.transactionId ?? "sent", { ...record, row });
      return Promise.resolve();
    },
  };
  let uploads = 0;
  let sends = 0;
  const outbox = createOutbox({
    backend,
    identity: () => ({ userId: "@alice:example.org", displayName: "Alice" }),
    emit: () => undefined,
    upload: () => {
      uploads += 1;
      return Promise.resolve({ source: { kind: "mxc", url: "mxc://example.org/uploaded" } });
    },
    deliver: () => {
      sends += 1;
      if (sends === 1) return Promise.reject(new WorkerFailure("network"));
      return Promise.resolve("$sent");
    },
    now: () => 1,
  });
  const row: MessageRow = queuedRow({
    roomId: ROOM,
    messageId: "m-media",
    transactionId: "txn-media",
    body: "caption",
    html: null,
    kind: "image",
    media: null,
    reply: null,
    ownUserId: "@alice:example.org",
    ownName: "Alice",
    ts: 1,
  });
  await outbox.queue({
    roomId: ROOM,
    messageId: "m-media",
    transactionId: "txn-media",
    body: row.body,
    html: null,
    kind: "image",
    replyTo: null,
    media: {
      kind: "image",
      name: "photo.webp",
      mime: "image/webp",
      width: 1,
      height: 1,
      size: 4,
      duration: null,
      hash: "hash",
      blob: new Blob([new Uint8Array(4)]),
      previewUrl: null,
    },
  });
  await outbox.deliver("m-media");
  await outbox.retry("m-media");
  await outbox.deliver("m-media");
  assert.equal(uploads, 1);
  assert.equal(sends, 2);
  assert.equal([...records.values()][0]?.row.status, "sent");
});
