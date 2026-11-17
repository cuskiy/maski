import assert from "node:assert/strict";
import test from "node:test";
import type { MessageRow, RoomSummary } from "../src/core/types.ts";
import {
  advanceMarker,
  markTimelineReset,
  mergeRows,
  olderPage,
  projectRoomState,
  readState,
  rowCursor,
  searchRows,
  WINDOW_LIMIT,
  windowSlice,
  type Segment,
} from "../src/worker/projection.ts";

const ROOM = "!room:example.org";
const OWN = "@alice:example.org";

function event(index: number): MessageRow {
  const own = index % 10 === 0;
  const mention = index % 50 === 0;
  return {
    id: `$e${String(index)}:example.org`,
    eventId: `$e${String(index)}:example.org`,
    transactionId: null,
    roomId: ROOM,
    sender: own ? OWN : "@bob:example.org",
    senderName: own ? "Alice" : "Bob",
    senderAvatar: null,
    ts: 1_000 + index,
    own,
    kind: "text",
    effect: null,
    poll: null,
    location: null,
    body: mention ? `${OWN} hello ${String(index)}` : `hello ${String(index)}`,
    html: null,
    media: null,
    reactions: [],
    reply: null,
    mentions: mention ? [OWN] : [],
    edited: false,
    redacted: false,
    status: "sent",
    error: null,
    retryable: false,
    system: false,
    encryption: { state: "ok" },
  };
}

function events(count: number): MessageRow[] {
  return Array.from({ length: count }, (_value, index) => event(index));
}

const EMPTY_SEGMENT: Segment = {
  roomId: ROOM,
  beforeEventId: null,
  token: null,
  readable: false,
  gapped: false,
};

const SIZES = [1, 30, 1_000, 10_000] as const;

void test("the visible window is bounded and starts at the stored cursor", () => {
  for (const count of SIZES) {
    const rows = events(count);
    const slice = windowSlice(rows, [], EMPTY_SEGMENT);
    assert.equal(slice.messages.length, Math.min(count, WINDOW_LIMIT), `window at ${String(count)}`);
    assert.equal(slice.messages.at(-1)?.id, rows.at(-1)?.id);
    assert.equal(slice.hasOlder, count > WINDOW_LIMIT, `hasOlder at ${String(count)}`);
    if (slice.messages.length > 1) {
      const first = slice.messages[0];
      const last = slice.messages.at(-1);
      assert.ok(first !== undefined && last !== undefined && first.ts < last.ts);
    }
    if (slice.before !== null) {
      assert.equal(slice.before, rowCursor(slice.messages[0] ?? rows[0]!));
    }
  }
});

void test("unread and highlight derive from rows after the advancing marker", () => {
  for (const count of SIZES) {
    const rows = events(count);
    const all = readState(rows, null, OWN);
    assert.equal(all.unread, rows.filter((row) => !row.own).length, `unread at ${String(count)}`);
    assert.equal(
      all.highlight,
      rows.filter((row) => !row.own && row.mentions.includes(OWN)).length,
      `highlight at ${String(count)}`,
    );
    const marker = advanceMarker(null, rowCursor(rows[Math.floor(count / 2)]!), rows);
    assert.ok(marker !== null);
    const after = readState(rows, marker, OWN);
    assert.ok(after.unread <= all.unread);
    assert.ok(after.highlight <= all.highlight);
    const stale = advanceMarker(marker, rowCursor(rows[0]!), rows);
    assert.equal(stale?.eventId, marker.eventId);
  }
});

void test("before-cursor pages never overlap and always move older", () => {
  for (const count of SIZES) {
    const rows = events(count);
    let cursor = rowCursor(windowSlice(rows, [], EMPTY_SEGMENT).messages[0] ?? rows[0]!);
    const seen = new Set<string>();
    let pages = 0;
    for (;;) {
      const page = olderPage(rows, cursor, WINDOW_LIMIT);
      if (page.length === 0) break;
      for (const row of page) {
        const key = rowCursor(row);
        assert.equal(seen.has(key), false, `duplicate ${key}`);
        seen.add(key);
      }
      const next = page[0];
      assert.ok(next !== undefined);
      assert.ok(next.ts <= rows.find((row) => rowCursor(row) === cursor)!.ts);
      cursor = rowCursor(next);
      pages += 1;
      assert.ok(pages < count);
    }
    const window = windowSlice(rows, [], EMPTY_SEGMENT).messages.length;
    assert.equal(seen.size + window, count, `pages cover ${String(count)}`);
  }
  const big = events(10_000);
  const first = olderPage(big, rowCursor(big[9_970]!), WINDOW_LIMIT);
  assert.equal(first.length, WINDOW_LIMIT);
  assert.equal(rowCursor(first.at(-1)!), rowCursor(big[9_969]!));
  const second = olderPage(big, rowCursor(first[0]!), WINDOW_LIMIT);
  assert.equal(second.length, WINDOW_LIMIT);
  assert.ok(second.at(-1)!.ts < first[0]!.ts);
});

void test("a timeline reset keeps a readable segment and its rows", () => {
  const segment: Segment = {
    roomId: ROOM,
    beforeEventId: "$e10:example.org",
    token: "backfill-token",
    readable: true,
    gapped: false,
  };
  const reset = markTimelineReset(segment, ROOM);
  assert.equal(reset.readable, true);
  assert.equal(reset.token, "backfill-token");
  assert.equal(reset.beforeEventId, "$e10:example.org");
  assert.equal(reset.gapped, true);
  assert.equal(markTimelineReset(null, ROOM).readable, false);
});

void test("search merges the outbox, drops hidden rows and honours scope and media filters", () => {
  const rows = events(6);
  const image: MessageRow = {
    ...event(100),
    kind: "image",
    body: "",
    media: { kind: "image", name: "layout.png", width: 10, height: 10, size: 100, url: null },
  };
  const redacted = { ...event(101), redacted: true };
  const system = { ...event(102), system: true };
  const undecryptable: MessageRow = {
    ...event(103),
    body: "",
    encryption: { state: "undecryptable", reason: "missing-key" },
  };
  const otherRoom = { ...event(104), roomId: "!other:example.org", body: "hello other" };
  const selected = [...rows, image, redacted, system, undecryptable];

  const matches = searchRows(selected, [], "hello", [], 40);
  assert.equal(
    matches.some((row) => row.redacted || row.system),
    false,
  );
  assert.equal(
    matches.some((row) => row.encryption.state !== "ok"),
    false,
  );
  assert.equal(matches.length, rows.length);

  const scoped = searchRows(
    selected.filter((row) => row.roomId === ROOM),
    [],
    "hello",
    [],
    40,
  );
  assert.equal(
    scoped.some((row) => row.roomId === "!other:example.org"),
    false,
  );

  const byKind = searchRows([...selected, otherRoom], [], "image", ["image"], 40);
  assert.deepEqual(
    byKind.map((row) => row.id),
    [image.id],
  );
  assert.deepEqual(searchRows(selected, [], "image", ["video"], 40), []);

  const echoed = { ...event(5), body: "hello edited" };
  const merged = searchRows([event(5)], [echoed], "edited", [], 40);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.body, "hello edited");

  const newest = searchRows(events(10), [], "hello", [], 3);
  assert.deepEqual(
    newest.map((row) => row.id),
    [9, 8, 7].map((index) => `$e${String(index)}:example.org`),
  );
});

void test("an echo replaces the queued row by transaction id without duplicating it", () => {
  const queued: MessageRow = {
    ...event(0),
    id: "local-1",
    eventId: null,
    transactionId: "txn-1",
    own: true,
    status: "queued",
    retryable: true,
  };
  const rows = [event(1), queued];
  const echo: MessageRow = {
    ...queued,
    id: "$echo:example.org",
    eventId: "$echo:example.org",
    status: "sent",
    retryable: false,
  };
  const merged = mergeRows(rows, [echo]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((row) => row.transactionId === "txn-1")?.id, "$echo:example.org");
  assert.equal(merged.filter((row) => row.transactionId === "txn-1").length, 1);
});

void test("the room projection takes unread, preview and latest from projected rows", () => {
  const rows = events(40);
  const marker = advanceMarker(null, rowCursor(rows[19]!), rows);
  const base = {
    roomId: ROOM,
    name: "Room",
    topic: "",
    avatar: null,
    preview: null,
    lastTs: 0,
    latestEventId: null,
    readReceipt: null,
    fullyRead: null,
    unread: 999,
    highlight: 999,
    membership: "join",
    roomType: null,
    directUserId: null,
    spaceId: null,
    tags: {},
    aliases: [],
    joinRule: "invite",
    guestAccess: "forbidden",
    historyVisibility: "shared",
    directoryPublished: false,
    roomVersion: "10",
    federated: true,
    notification: "default",
    encryption: "none",
    creatorIds: [],
    powerLevels: {
      users: {},
      usersDefault: 0,
      events: {},
      eventsDefault: 0,
      stateDefault: 0,
      invite: 0,
      kick: 0,
      ban: 0,
      redact: 0,
      notificationsRoom: 0,
    },
  } as const satisfies RoomSummary;
  const projected = projectRoomState(base, rows, [], marker, OWN);
  const expected = readState(rows, marker, OWN);
  assert.equal(projected.unread, expected.unread);
  assert.equal(projected.highlight, expected.highlight);
  assert.equal(projected.lastTs, rows.at(-1)?.ts);
  assert.equal(projected.latestEventId, rows.at(-1)?.eventId);
  assert.equal(projected.readReceipt, marker?.eventId);
  assert.equal(projected.preview?.body, rows.at(-1)?.body);
});

void test("a server backfill token keeps the older control available for a full local window", () => {
  const rows = events(WINDOW_LIMIT);
  const segment: Segment = { ...EMPTY_SEGMENT, token: "backfill-token", readable: true };
  assert.equal(windowSlice(rows, [], segment).hasOlder, true);
});
