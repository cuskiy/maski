import assert from "node:assert/strict";
import test from "node:test";
import { queuedRow } from "../src/core/message.ts";
import type { MessageRow, SessionSummary } from "../src/core/types.ts";
import type { CommandMap, KeyStatus, Reply, StartData } from "../src/protocol/index.ts";
import { createWorkerApi, type WorkerApi } from "../src/worker/api.ts";
import { WorkerFailure } from "../src/worker/failure.ts";
import type { Outbox, OutboxBackend, OutboxEvent, OutboxRecord } from "../src/worker/outbox.ts";
import { createOutbox } from "../src/worker/outbox.ts";
import type { SessionPort } from "../src/worker/ports.ts";

const ROOM = "!room:example.org";
const SESSION: SessionSummary = {
  userId: "@alice:example.org",
  displayName: "Alice",
  avatar: null,
  capabilities: { recoveryKey: false, backup: false, signOut: true, signOutOthers: true },
  stickerPacks: [],
};
const START: StartData = { session: null, connection: "offline", key: "missing" };

class MemoryBackend implements OutboxBackend {
  private readonly records = new Map<string, OutboxRecord>();
  readonly events = new Map<string, MessageRow>();
  readonly log: string[] = [];

  put(record: OutboxRecord): Promise<void> {
    this.records.set(record.transactionId, record);
    this.log.push(`put:${record.messageId}:${record.row.status}`);
    return Promise.resolve();
  }

  read(messageId: string): Promise<OutboxRecord | null> {
    for (const record of this.records.values()) {
      if (record.messageId === messageId) return Promise.resolve(record);
    }
    return Promise.resolve(null);
  }

  readByTransaction(transactionId: string): Promise<OutboxRecord | null> {
    return Promise.resolve(this.records.get(transactionId) ?? null);
  }

  list(roomId?: string): Promise<readonly OutboxRecord[]> {
    return Promise.resolve(
      [...this.records.values()].filter((record) => roomId === undefined || record.roomId === roomId),
    );
  }

  remove(transactionId: string): Promise<void> {
    this.records.delete(transactionId);
    this.log.push(`remove:${transactionId}`);
    return Promise.resolve();
  }

  complete(record: OutboxRecord, row: MessageRow): Promise<void> {
    this.records.delete(record.transactionId);
    this.events.set(row.id, row);
    this.log.push(`complete:${record.messageId}:${row.eventId ?? "none"}`);
    return Promise.resolve();
  }

  queued(): readonly OutboxRecord[] {
    return [...this.records.values()];
  }
}

interface Harness {
  readonly api: WorkerApi;
  readonly outbox: Outbox;
  readonly backend: MemoryBackend;
  readonly emitted: OutboxEvent[];
  readonly requests: MessageRow[];
  readonly deferred: Array<{
    readonly resolve: (eventId: string) => void;
    readonly reject: (error: Error) => void;
  }>;
}

function harness(): Harness {
  const backend = new MemoryBackend();
  const emitted: OutboxEvent[] = [];
  const requests: MessageRow[] = [];
  const deferred: Harness["deferred"] = [];
  const outbox: Outbox = createOutbox({
    backend,
    identity: () => ({ userId: SESSION.userId, displayName: SESSION.displayName }),
    emit: (event) => emitted.push(event),
    upload: () => Promise.resolve({ source: { kind: "mxc", url: "mxc://example.org/media" } }),
    deliver: (record) => {
      requests.push(record.row);
      const pending = Promise.withResolvers<string>();
      deferred.push(pending);
      return pending.promise;
    },
    now: () => 1_000,
  });
  const port: SessionPort = {
    start: () => Promise.resolve(START),
    login: () => Promise.resolve(SESSION),
    loginToken: () => Promise.resolve(SESSION),
    ssoUrl: () => Promise.resolve("https://example.org/sso"),
    register: () => Promise.resolve({ session: SESSION, recoveryKey: null, key: "needs-recovery" }),
    logout: () => Promise.resolve(null),
    keyStatus: () => Promise.resolve<KeyStatus>("missing"),
    recover: () => Promise.resolve<KeyStatus>("missing"),
    open: () => Promise.resolve(null),
    older: () => Promise.resolve(null),
    async send(
      roomId: string,
      body: string,
      html: string | null,
      replyTo: string | null,
      transactionId: string,
      messageId: string,
      kind: CommandMap["send"]["kind"],
      _media: CommandMap["send"]["media"],
    ) {
      const row = await outbox.queue({ roomId, messageId, transactionId, body, html, replyTo, kind, media: null });
      void outbox.deliver(messageId).catch(() => undefined);
      return row;
    },
    async retrySend(_roomId: string, messageId: string) {
      const row = await outbox.retry(messageId);
      if (row === null) throw new WorkerFailure("unavailable");
      void outbox.deliver(messageId).catch(() => undefined);
      return row;
    },
    async discardSend(_roomId: string, messageId: string) {
      await outbox.discard(messageId);
      return null;
    },
    markRead: () => Promise.resolve(null),
    members: () => Promise.resolve(null),
    devices: () => Promise.resolve([]),
    backupStatus: () =>
      Promise.resolve({
        version: null,
        trusted: false,
        matchesDecryptionKey: false,
        enabled: false,
        error: null,
      }),
    backupSetup: () =>
      Promise.resolve({ version: "1", trusted: true, matchesDecryptionKey: true, enabled: true, error: null }),
    sasStart: () => Promise.reject(new WorkerFailure("unavailable")),
    sasAccept: () => Promise.resolve(null),
    sasConfirm: () => Promise.resolve(null),
    sasMismatch: () => Promise.resolve(null),
    sasCancel: () => Promise.resolve(null),
    resetIdentity: () => Promise.resolve(null),
    react: () => Promise.resolve(null),
    edit: () => Promise.resolve(null),
    redact: () => Promise.resolve(null),
    typing: () => Promise.resolve(null),
    search: () => Promise.resolve([]),
    leaveRoom: () => Promise.resolve(null),
    setRoomTag: () => Promise.resolve(null),
    setNotification: () => Promise.resolve(null),
    setRoomState: () => Promise.resolve(null),
    inviteUser: () => Promise.resolve(null),
    joinRoom: () => Promise.resolve(ROOM),
    answerInvite: () => Promise.resolve(null),
    createRoom: () => Promise.resolve(ROOM),
    forward: () => Promise.resolve(null),
    memberAction: () => Promise.resolve(null),
    sendMedia: () =>
      Promise.resolve(
        queuedRow({
          roomId: ROOM,
          messageId: "m-media",
          transactionId: "txn-m-media",
          body: "",
          html: null,
          kind: "image",
          media: null,
          reply: null,
          ownUserId: SESSION.userId,
          ownName: SESSION.displayName,
          ts: 1,
        }),
      ),
    sendSticker: () =>
      Promise.resolve(
        queuedRow({
          roomId: ROOM,
          messageId: "m-sticker",
          transactionId: "txn-m-sticker",
          body: "sticker",
          html: null,
          kind: "sticker",
          media: null,
          reply: null,
          ownUserId: SESSION.userId,
          ownName: SESSION.displayName,
          ts: 1,
        }),
      ),
    media: () => Promise.resolve({ url: "blob:https://example.org/1", mime: "image/webp", width: 1, height: 1 }),
    onEvent: () => () => {},
  };
  return { api: createWorkerApi(port), outbox, backend, emitted, requests, deferred };
}

function replyRow(reply: Reply): MessageRow {
  if (!reply.ok || typeof reply.data !== "object" || reply.data === null || !("transactionId" in reply.data)) {
    throw new Error("expected a message row reply");
  }
  return reply.data;
}

function sendPayload(messageId: string) {
  return {
    roomId: ROOM,
    body: "hello",
    html: null,
    replyTo: null,
    transactionId: `txn-${messageId}`,
    messageId,
    kind: "text" as const,
    media: null,
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

void test("the worker outbox writes a queued row before the request and replaces it on echo", async () => {
  const { api, backend, emitted, requests, deferred } = harness();
  const reply = await api.handle({ id: 1, type: "send", payload: sendPayload("m1") });
  assert.equal(reply.ok, true);
  if (!reply.ok) return;
  assert.equal(replyRow(reply).status, "queued");
  assert.equal(replyRow(reply).transactionId, "txn-m1");
  assert.equal(backend.queued()[0]?.row.id, "m1");
  assert.equal(backend.log[0], "put:m1:queued");
  await flush();
  assert.equal(requests.length, 1);
  assert.equal(emitted[0]?.row?.status, "queued");
  assert.equal(emitted[1]?.row?.status, "sending");

  const echo: MessageRow = {
    ...replyRow(reply),
    eventId: "$e1",
    status: "sent",
    retryable: false,
  };
  assert.equal(echo.transactionId, "txn-m1");
  deferred[0]?.resolve("$e1");
  await flush();
  assert.equal(backend.events.get("m1")?.eventId, "$e1");
  assert.equal(emitted.at(-1)?.row?.status, "sent");
});

void test("an echo with the same transaction id replaces the queued row and removes it", async () => {
  const { api, outbox, backend, emitted, deferred } = harness();
  const reply = await api.handle({ id: 1, type: "send", payload: sendPayload("m2") });
  assert.equal(reply.ok, true);
  if (!reply.ok) return;
  await flush();
  const echo: MessageRow = { ...replyRow(reply), eventId: "$e2", status: "sent", retryable: false };
  assert.equal(backend.queued()[0]?.transactionId, "txn-m2");
  assert.equal(await outbox.reconcile(echo), true);
  assert.equal(backend.queued().length, 0);
  assert.equal(backend.events.get("m2")?.eventId, "$e2");
  assert.equal(emitted.at(-1)?.row?.id, "m2");
  assert.equal(emitted.at(-1)?.row?.status, "sent");
  deferred[0]?.resolve("$e2");
  await flush();
  assert.equal(backend.events.size, 1);
});

void test("a failed send keeps a retryable row, retry resets it and discard removes it", async () => {
  const { api, backend, emitted, deferred } = harness();
  const first = await api.handle({ id: 1, type: "send", payload: sendPayload("m3") });
  assert.equal(first.ok, true);
  await flush();
  deferred[0]?.reject(new WorkerFailure("network"));
  await flush();
  const failed = backend.queued()[0];
  assert.equal(failed?.row.status, "failed");
  assert.equal(failed?.retryable, true);
  assert.equal(emitted.at(-1)?.row?.status, "failed");

  const retried = await api.handle({
    id: 2,
    type: "retrySend",
    payload: { roomId: ROOM, messageId: "m3" },
  });
  assert.equal(retried.ok, true);
  if (!retried.ok) return;
  assert.equal(replyRow(retried).status, "queued");
  await flush();
  assert.equal(deferred.length, 2);
  deferred[1]?.resolve("$e3");
  await flush();
  assert.equal(backend.events.get("m3")?.eventId, "$e3");

  const second = await api.handle({ id: 3, type: "send", payload: sendPayload("m4") });
  assert.equal(second.ok, true);
  await flush();
  deferred[2]?.reject(new WorkerFailure("network"));
  await flush();
  assert.equal(backend.queued()[0]?.messageId, "m4");
  const discarded = await api.handle({
    id: 4,
    type: "discardSend",
    payload: { roomId: ROOM, messageId: "m4" },
  });
  assert.deepEqual(discarded, { id: 4, ok: true, data: null });
  assert.equal(backend.queued().length, 0);
  assert.equal(emitted.at(-1)?.row, null);
});

void test("a send that cannot run is a stored failed row with no request", async () => {
  const { api, backend, emitted, requests } = harness();
  const reply = await api.handle({
    id: 1,
    type: "send",
    payload: {
      ...sendPayload("m5"),
      body: "",
      kind: "file",
      media: { kind: "file", name: "a.pdf", width: null, height: null, size: 10, url: "blob:x" },
    },
  });
  assert.equal(reply.ok, true);
  if (!reply.ok) return;
  assert.equal(replyRow(reply).status, "failed");
  assert.equal(replyRow(reply).retryable, false);
  await flush();
  assert.equal(requests.length, 0);
  assert.equal(backend.queued()[0]?.row.error, "unavailable");
  assert.equal(emitted.length, 1);
});

void test("a queued row interrupted by a restart uses a typed failure", async () => {
  const { backend, outbox, emitted } = harness();
  const row = queuedRow({
    roomId: ROOM,
    messageId: "m6",
    transactionId: "t6",
    body: "interrupted",
    html: null,
    kind: "text",
    media: null,
    reply: null,
    ownUserId: SESSION.userId,
    ownName: SESSION.displayName,
    ts: 1,
    status: "sending",
  });
  await backend.put({
    roomId: ROOM,
    transactionId: "t6",
    messageId: "m6",
    replyTo: null,
    row,
    retryable: true,
    media: null,
    uploaded: null,
  });
  await outbox.resume();
  assert.equal(backend.queued()[0]?.row.status, "failed");
  assert.equal(backend.queued()[0]?.row.error, "restart");
  assert.equal(emitted.at(-1)?.row?.error, "restart");
});

void test("a pack sticker is queued and delivered without uploading bytes", async () => {
  const backend = new MemoryBackend();
  let uploads = 0;
  const delivered: { record: OutboxRecord | null } = { record: null };
  const outbox = createOutbox({
    backend,
    identity: () => ({ userId: SESSION.userId, displayName: SESSION.displayName }),
    emit: () => {},
    upload: () => {
      uploads += 1;
      throw new Error("pack stickers must not upload");
    },
    deliver: (record) => {
      delivered.record = record;
      return Promise.resolve("$pack");
    },
    now: () => 1_000,
  });
  const row = await outbox.queue({
    roomId: ROOM,
    messageId: "m-pack",
    transactionId: "txn-pack",
    body: "cat",
    html: null,
    kind: "sticker",
    media: null,
    replyTo: null,
    pack: {
      source: { kind: "mxc", url: "mxc://example.org/cat" },
      body: "cat",
      info: { w: 512, h: 512, mimetype: "image/png" },
      width: 512,
      height: 512,
      size: 100,
      mime: "image/png",
    },
  });
  assert.equal(row.media?.url, null);
  await outbox.deliver("m-pack");
  assert.equal(uploads, 0);
  assert.equal(delivered.record?.pack?.source.url, "mxc://example.org/cat");
  assert.equal(delivered.record?.pack?.body, "cat");
  assert.equal(backend.queued().length, 0);
  assert.equal(backend.events.get("m-pack")?.status, "sent");
});
