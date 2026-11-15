# Advice for the next agent

`AGENTS.md` is the contract. This file is the evidence log: what is actually true in the working tree, which past
attempts produced the contract, and which traps are still loaded. It is deliberately not a second specification.
When a defect below is fixed, delete or rewrite its paragraph; do not append a “this round” section.

Snapshot: working tree after commit `906117e`, 2026-11-15. The tree is dirty and mid-refactor. Re-measure before
quoting any number here.

---

## 0. How to use this file

1. Run the gate before believing Part 4 of `AGENTS.md`.
2. Read the owning module and the relevant `spec/` section before changing a boundary.
3. Treat `AGENTS.md` Part 2 as the user's voice. Only the user changes it. If code and Part 2 disagree, the code is
   wrong, but the fix is a discussion, not a quiet edit.
4. Do not copy code from `past/` or `git/`. `git/sable-next` is AGPL; reading behavior is allowed, copying is not.
5. A claim needs its rung (pure → worker → surface → scriptless → real server → Firefox/Safari). “It looked fine”
   is not evidence.

---

## 1. Ground truth in this tree

### 1.1 The gate is red

Measured in this working tree:

```text
npm run types
  src/client/surfaces.ts(277,48): error TS6133: 'c' is declared but its value is never read.

node --test "test/*.test.ts"
  tests 122 · pass 120 · fail 2

npx prettier --check "src/**/*.{ts,css}"
  [warn] src/client/dom.ts
  [warn] src/client/regions/composer.ts
  [warn] src/client/surfaces.ts
```

The two failing tests are both the same missing rule: `.message.is-own .message-media.is-sticker .media-footer`
does not set `inset-inline-start: 0` (`test/style.test.ts:182,203`). This is Part 2.10's sticker-time rule; the
stylesheet has the opponent-right rule only (`src/styles/timeline.css:754-758`).

`AGENTS.md` Part 4 currently says the check is green with 122 tests. That sentence is false for this checkout.
A future agent must not repeat it. First make the gate green on a coherent change, then correct the paragraph.

### 1.2 The tree is uncommitted and mid-refactor

- `git diff --stat` reports 66 changed files, and `git status` reports 26 untracked paths. The untracked set
  includes `src/worker/`, `src/protocol/`, `src/client/matrixTransport.ts`, `src/client/workerSource.ts`, and
  several tests. `src/client/dom.ts` is untracked and is now imported by `surfaces.ts` and `composer.ts`. The
  current worker/protocol implementation is not committed.
- `src/client/surfaces.ts` has an unused parameter; `Prettier` disagrees with three files.
- `dist/`, `build/manifest.json` and `review-dist/` are generated. Never hand-edit them.

Do not “clean up” with `git checkout` or `git reset`; the user's uncommitted work is the current design. Read the
diff first. The previous credential removal is also uncommitted; see §5.6.

### 1.3 Built artifact sizes (reported, not gated)

```text
matrix-sdk-crypto-<hash>.wasm   7.5 MB
matrix-worker-<hash>.js         1.3 MB
review-client-<hash>.js         296 KB
client-<hash>.js                289 KB
style-<hash>.css                 83 KB
watermark-<hash>.svg            257 KB   (not in build/manifest.json)
```

C6 is still deferred. The watermark is larger than every budget the project talks about and is not even listed in
the manifest; the audit walks CSS `url()` references but checks no size (`scripts/audit.ts`). “An asset over 8 KB has
a budget” is currently a wish, not a check.

---

## 2. Blockers present now

These are ordered by consequence, not by file size.

### 2.1 Two owners of the session and the key gate

The worker has a real session record and a real `keyStatus` command. The main thread has a second session model in
`localStorage`, and the gate is decided there:

- `src/client/auth.ts:99-100` writes `setAccount()` and **unconditionally** `setKeyReady()` after login.
- `src/client/session.ts:27-47` reads `maski.server`, `maski.account`, `maski.registered`, `maski.key`.
- `src/client/chat.ts:20` scopes every UI preference (sections, drafts, recents) by `mockSession().account`, not by
  the worker's session; a cleared or stale hint silently changes the account scope.
- `src/client/guard.ts:44-70` redirects from those hints, not from the worker.
- `src/client/auth.ts:145-166` makes the key page's “unlock” and “reset” forms fake: they only call `setKeyReady()`.
- `src/client/auth.ts:122-143` makes registration fake: it writes an MXID built from the server URL and never
  contacts a homeserver.
- `src/worker/matrix.ts:101-113` returns `key: "unknown"` even after a successful restore, and collapses every
  restore failure into `session: null`.
- `src/client/workerSource.ts:37-55` **ignores `data.key` entirely** and emits `phase: "ready"` whenever a session
  exists. `MatrixTransport.keyStatus()` exists (`src/client/matrixTransport.ts:66`) but no caller uses it.
- `src/worker/matrix.ts:386` computes `keyReady` once from `isSecretStorageReady()`, before sync.
  `isSecretStorageReady()` only checks that the cross-signing and backup secrets are present in secret storage
  (`node_modules/matrix-js-sdk/lib/rust-crypto/rust-crypto.js:695-720`); it is not device verification and not the
  product's undecided gate predicate. The value can be false before sync and is never corrected afterwards.
- `src/worker/matrix.ts:181-193` sets `keyReady = true` even when `bootstrapSecretStorage()` failed.

Consequence: the key gate is bypassed end to end. Any string opens the key page; encrypted rooms render
“This message cannot be decrypted.”; a user can be sent to the login page while a valid worker session exists, or
shown the chat shell while the worker reports signed out. The “two owners” failure that killed the past attempts
is live in the current tree.

Fix direction: one authority. The worker returns the session and gate state; the main thread stores only UI
preferences. Delete `maski.key`, `maski.registered`, `setKeyReady()` and the fake unlock/reset/register handlers.
Until the real gate exists, the key page must be absent or must say the feature is not available, not pretend.

### 2.2 Production `ChatSource` is a mock facade

`ChatSource` has 28 methods. The worker protocol has 10 commands. `WorkerSource` leaves 18 methods empty, returns
`[]` from `search()`, and fails every media send:

- `src/client/workerSource.ts:92-113`: `react`, `edit`, `redact`, `forward`, `typing`, `memberAction`, `inviteUser`,
  `addRoom`, `leaveRoom`, `setRoomState`, `setRoomTag`, `setNotification`, `resetRecoveryKey`, `resetIdentity`,
  `signOutDevice`, `signOutOthers`, `answerInvite`, `saveNotifications` are empty; `search` returns `[]`.
- `src/client/workerSource.ts:66-78`: a row with `media !== null` emits `outbox: failed, error: null` locally and
  never reaches the worker.
- `src/client/mockSource.ts` implements all of them, and `src/core/mock.ts` is 681 lines of fixture data.
- `src/client/actions.ts` still performs the optimistic half of the missing commands: `react` (387-396), `edit`
  (398-408), `redact` (410-418), `toggleFavorite` (243-246), `toggleMute` (248-251), `leaveRoom` (253-257),
  `createRoom` (275-286), `forward` (427-468), `acceptInvite` (515-519), `signOutOthers` (549-551).
- Room settings writes call `source.setRoomState` and never update the local room, so the form silently does
  nothing (329, 349, 354, 359).
- `src/protocol/index.ts` has no command for any of those; `src/client/source.ts` has no matching transport path.

Consequence: the `/review/` page demonstrates a complete product. A real login demonstrates only room rows, a
timeline window, text send, receipt and members. Reactions, edits, deletes, favorites, mutes, invites, spaces,
room settings, device sessions, notifications and search appear to work and then either do nothing or are
overwritten by the next worker projection. This is the exact “mock replaced the runtime” failure in AGENTS 1.5.

Fix direction: either implement the command end to end (protocol → parser → `SessionPort` → worker handler →
transport → source → action) or hide the control. Do not add another optimistic branch for an unimplemented
command. A parity test should fail when a `ChatSource` method used by `actions.ts` has no protocol command.

### 2.3 There is no projection store and no bounded read model

The worker projects directly from the in-memory SDK room:

- `src/worker/project.ts:113-134` walks the entire live timeline plus pending events on every window request.
- `src/worker/project.ts:137-152` scans backwards through the entire live timeline for a room preview.
- `src/worker/project.ts:194-225` derives `readReceipt` and `fullyRead` from the same SDK receipt and takes
  `unread`/`highlight` from the server notification count.
- `src/worker/matrix.ts:325-335` re-projects the whole active window on every timeline event.
- `src/worker/matrix.ts:354-357` re-projects the whole active window on every `MatrixEventEvent.Decrypted`.
- `src/worker/matrix.ts:303-313` re-projects every room on every timeline event, coalesced only by a microtask.
- `src/worker/matrix.ts:392` enables `threadSupport: true`, so SDK unread counts include thread notifications that
  the UI never renders.

Consequence: a 1,000-event room costs O(n) work per message, and the decryption path costs O(n²) during initial sync.
There is no projection database (only the worker session record and the SDK event cache), no window cursor, no
“oldest stored id”, no gap table. `AGENTS.md` §3.2 names
`projectionDb.ts`; it does not exist. The SDK `IndexedDBStore` is a cache of SDK events, not a projection the client
owns. Cached-first painting therefore depends on SDK startup, not on the client's own data.

Fix direction: add the worker projection DB and a bounded window. Store rows once; project only the changed event
and the room summary fields that event touches; read a page by an id cursor. Keep the pure projection functions and
test them with 1, 30, 1,000 and 10,000 events. Delete the `getLiveTimeline().getEvents()` scans.

### 2.4 Pagination is a window dump, and gaps are ignored

- The protocol carries `older: { roomId }` only (`src/protocol/index.ts:24`). There is no “before this event” id.
- `src/worker/matrix.ts:213-229` calls `paginateEventTimeline()` on the **live** timeline, then re-projects the
  whole timeline and sends it.
- `src/worker/project.ts:133` sets `hasOlder` from the live timeline's backward token. With `timeline.limited`
  gaps, older events live in other timelines; this token can be null while history is still reachable, or point
  into the wrong segment.
- `src/client/actions.ts:584-599` prepends only rows whose ids are not already stored. That accidentally avoids
  duplicates, but it still receives the whole window on every page.
- No code listens to `RoomEvent.TimelineReset` or iterates `room.getTimelines()`.

Consequence: history can silently stop at a gap; “load older” can re-send the same window; scroll anchors are
patched by hand; there is no test for the backward direction against the worker. This is the same defect as
`past/backup2` `want: number` and `past/backup3` `keep: number`.

Fix direction: read §“Syncing” in `spec/content/client-server-api/_index.md` (the `limited` / `prev_batch` rule).
Store each segment and its token. A page request names the oldest stored event id; the reply is one page. Never
clear a segment because a sync was gappy.

### 2.5 The worker does not own the outbox

- The UI creates the row and appends it to `messages` (`src/client/actions.ts:181-200`, `appendRows`).
- The worker sends over HTTP (`src/worker/matrix.ts:231-276`) and emits `outbox`; it never stores the queued row.
- `wireSources` replaces the whole `messages` array on any non-older `window` event (`src/client/actions.ts:584-589`).
  If a timeline event arrives while a text send is in flight, the local row is dropped before the echo.
- `PendingEventOrdering.Detached` (`src/worker/matrix.ts:390`) means the SDK does not put a pending event into the
  timeline, so the worker has nothing to project in the meantime.
- Failure emits `status: "failed"` with `error: null` and throws `network`; the transport discards the rejection
  (`src/client/matrixTransport.ts:88`). There is no retry.

Consequence: a message can vanish while sending, then reappear on echo; a failed send has no actionable copy; an
attachment never leaves the browser. This violates Part 2's “the local row is not dropped before the echo” and
“errors say what to do”.

Fix direction: the worker owns the queued row and its status; the main thread renders `outbox` events. Keep the row
until the echo (or a user cancel), keyed by transaction id. Add a real failure code and copy.

### 2.6 First paint is not final, and the first wait is invisible

- `src/worker/matrix.ts:363-397` awaits `store.startup()`, `initAsync(wasmUrl)`, `initRustCrypto()` and
  `startClient()` before it emits rooms. Cached rooms cannot paint before crypto; the start reply is only sent after
  that chain.
- `src/client/workerSource.ts:37-55` starts with the empty store and never sets `roomsLoading: true`.
  `emptyChatState()` has `roomsLoading: false` (`src/core/state.ts:8`).
- `src/components/nav.ts:79-84` only renders skeleton rows when `roomsLoading`; otherwise it draws empty sections.
- `src/components/timeline.ts:124-127` has notes only for `signedOut`/`locked`; `phase: "boot"` draws a blank
  timeline with no status.
- `src/components/nav.ts:81` hides section counts until `phase !== "boot"`, so counts appear after rows.
- The account card is empty until the worker session event arrives; no cached identity is painted.
- `src/worker/matrix.ts:386` runs `isSecretStorageReady()` before sync. It may be false before the secret storage
  account data is loaded, so the cached gate cannot be painted truthfully either.

Consequence: a 10-second start is a blank shell; rooms, counts and identity arrive late and shift the layout.
The requirement “cached rooms paint before crypto; only an uncached list shows skeletons” is not implemented.

Fix direction: `start` answers from the worker record and the projection DB first (session summary, cached rooms,
cached gate), then starts crypto/sync in the background and emits corrections. The main thread shows skeleton rows
only for an uncached list. The boot state must say it is loading and must be cancellable.

### 2.7 One tab is not one client

- No `navigator.locks`, no `BroadcastChannel`, no account lock (`grep` finds none).
- `start()` can create a client; `login()` creates another (`src/worker/matrix.ts:137-144`); neither tears down the
  previous client before assigning `this.client` (`:377`).
- The login page always calls `transport.start()` before `transport.login()` (`src/client/auth.ts:90-100`), so a
  stale worker session plus a click on “Sign in” starts a second client against the same crypto prefix.
- `matrix-js-sdk` warns: multiple `MatrixClient` instances on the same IndexedDB corrupt crypto state
  (`node_modules/matrix-js-sdk/lib/client.js` §initRustCrypto).

Consequence: two tabs, or a double submit, can corrupt the crypto store or produce duplicate devices and split
sync loops. The worker cannot recover because it does not detect the conflict.

Fix direction: hold `navigator.locks.request("maski:account:<id>")` across client startup and crypto; serialize
`start`/`login`/`logout` in one queue; report `locked` instead of opening the same store. A second tab must be a
visible state, not a second client.

### 2.8 Auth lifecycle: no refresh, no soft logout, no error mapping

- `loginRequest()` omits `refresh_token: true` (`src/worker/matrix.ts:122-130`). Per the spec, a client that wants
  refresh tokens must ask for them on `/login`.
- `createClient()` omits both `refreshToken` and `onTokenRefresh` (`src/worker/matrix.ts:365-377`). The refresh
  token is stored (`sessionDb.ts:6,60`) and then unused.
- No code handles `M_UNKNOWN_TOKEN`, `M_FORBIDDEN`, `M_USER_DEACTIVATED`, `M_LIMIT_EXCEEDED`, `soft_logout`, or
  network failure as distinct cases (`grep` finds none). Discovery failure and bad password both become `auth`
  (`src/worker/matrix.ts:116-133`); the form shows one generic sentence (`auth.login.failed`).
- `start()` catches every restore error and returns `session: null` (`:111`), so the UI cannot distinguish “token
  revoked” from “crypto store busy” from “disk unavailable”.
- The password stays in the form on failure; it is not cleared.

Consequence: the first expired access token leaves sync failing with no refresh path; a rate-limited login looks
like a wrong password; a failed restore is presented as signed out while the record and crypto store remain.

Fix direction: request and use refresh tokens; wire `onTokenRefresh` to the worker session DB; map spec error
codes to catalog copy; keep the server's raw error out of the UI. Return a typed start failure, not a fake empty
session.

### 2.9 Media is not implemented

- There is no upload or download command. `src/worker/` has no `media.ts`; `AGENTS.md` §3.2 names one.
- The composer re-encodes images to WebP (`src/client/imageSanitizer.ts`) but cannot upload them; `WorkerSource`
  rejects media (`workerSource.ts:66-78`).
- `safeMediaUrl()` accepts only local paths, `blob:` and raster data URLs (`src/lib/safeUrl.ts:26-37`); it rejects
  `mxc://`. Avatars are always `null` (`src/worker/project.ts:195`, `summary()` in `matrix.ts`).
- `mxc` media must be fetched through the authenticated endpoints; URL credentials are deprecated
  (`spec/content/client-server-api/modules/content_repo.md` “Client behaviour”).
- There is no cache, no size limit, no MIME check in the client path; the main thread can only receive a blob/object
  URL from the worker once that command exists.
- `src/components/surfaces.ts:53-210` renders an Images/Files/Links surface from the **current message window
  only**, not the room; `uniqueLinks()` therefore sees a fraction of history.

Consequence: every media row is a placeholder; the “media” and “attachments” claims are false. Implementing upload
in the main thread would also violate the token boundary and the EXIF rule.

Fix direction: add `media` (download, thumbnail, upload) commands in the worker, content-addressed cache, MIME and
size limits, blob URLs to the main thread. The main thread never fetches the homeserver directly. Keep `mxc` out of
the DOM and out of `safeMediaUrl`.

### 2.10 Read receipts: read position is wrong and can be written in a loop

- `src/worker/project.ts:194,218` sets `fullyRead` equal to `readReceipt`. `m.fully_read` is room account data, not a
  receipt; the spec requires reading it from account data and changing it only through `/read_markers`
  (`spec/content/client-server-api/modules/read_markers.md`).
- `getEventReadUpTo()` returns null when the receipt points at an event that is not loaded
  (`node_modules/matrix-js-sdk/lib/models/read-receipt.js:80-90`). After a reload with a window that does not contain
  the receipt, `projectRoom` reports no read position.
- `src/worker/matrix.ts:278-285` calls `setRoomReadMarkersHttpRequest(roomId, eventId, eventId)`, which sends
  `m.fully_read` and public `m.read`; the product has not chosen public vs private receipts.
- `src/client/regions/timeline.ts:326-328` calls `markRead` **after** injecting rows, and
  `:164-169,332,342` calls `markAtBottom()` on every render near the bottom. `wireSources` then accepts the server's
  push-rule `unread` again (`actions.ts:568-582`), so the next rooms event can trigger another receipt write.

Consequence: “jump to last read” is wrong after reload; receipts can be sent repeatedly (rate limit); a user who
reads at the bottom can generate receipt traffic for every sync; the privacy choice is decided silently.

Fix direction: read `m.fully_read` from room account data and the chosen receipt type explicitly. Mark read once,
before or at injection, and only when the read position actually advances. Decide public/private with the user.
Do not equate `notification_count` with “messages since read”.

---

## 3. Problems that will surface next

These are not hypothetical style preferences. Each has a concrete trigger.

| Trigger | What will break | Why |
|---|---|---|
| Enforcing the gate from `StartData.key` | Every user is locked out | `start` hardcodes `key: "unknown"`; the worker never returns `ready` on restore. |
| Implementing `resetIdentity` UI | The one-time key is lost or mismatched | `ChatSource.resetIdentity()` takes no password; `MatrixTransport` has no command; the worker sets `keyReady = true` even if bootstrap failed. |
| Adding reaction/edit/delete commands without projection | The local change disappears on the next window event | `projectMessage` emits `reactions: []`, `reply: null`; only `edited` is derived. |
| Implementing search in the main thread | Cross-room search is incomplete and the DB is opened twice | `WorkerSource.search` is `[]`; the past attempts failed twice at exactly this boundary. |
| Implementing media in the main thread | Token leakage and EXIF retention | Media endpoints need the access token; the image sanitizer exists but the upload does not. |
| Adding a service worker naively | Authenticated media or `/sync` enters the HTTP cache | The product requires shell/hashed assets only; no worker cache policy exists. |
| Fixing first paint by showing `roomsLoading` earlier | Rows still cannot paint before crypto | `start` awaits crypto before it emits cached rooms. |
| Adding a second database for settings/drafts | Two writers return | Drafts already live in `localStorage`; the worker already owns the session DB. |
| Running two tabs | Crypto corruption / duplicate devices | No lock and no serialized startup. |
| Refreshing `rooms` on every timeline event | CPU grows quadratically with history | `emitRooms` re-projects all rooms; previews scan the whole timeline. |
| Adding `m.mentions` | Mentions still render as plain text | The contenteditable token is local only; no `m.mentions` in the send content or projection. |
| Relying on `closedby` | Backdrop click does not close on Safari | `features.md` records Safari 27.0 lacking it; there is no JS fallback. |
| Adding `beforeunload` cleanup | The page loses bfcache | `src/client/chat.ts:71-83` already registers a `beforeunload` listener. |
| Relying on browser storage eviction | Offline data and drafts vanish | No `navigator.storage.persist()`; no user-facing refusal. |
| Claiming CSS/DOM pass because markup tests pass | Focus, caret and media state are lost | Surfaces/rows are replaced wholesale; tests only inspect strings. |

---

## 4. What the three past attempts taught, with evidence

`past/backup`, `past/backup2` and `past/backup3` are not different products; they repeat the same boundary errors at
increasing levels of polish. `past/docs` is not a record of `past/`: it describes `past/backup2` and disagrees with
the tree beside it (`DB_VERSION` 2 in the doc, 1 in `past/src/worker/db.ts:3`).

### 4.1 Ranked root causes

1. **One fact, several owners.** `past/backup` wrote queued rows from the main thread.
   `past/backup2` wrote the same `events` row in `store/db.ts:117-129`, `app.ts:467-471,550`, and
   `worker/api.ts:485,861,870`. `AGENTS.md` now records the result (“two database writers, a mock row log beside
   `ChatState`”), and the current tree repeats it with `localStorage` session hints beside the worker session and
   optimistic room/message writes beside the worker projection.
2. **The mock became the acceptance surface.** `past/backup` had no `test/` directory while claiming a passing
   `vitest` suite. `past/backup2` had four helper tests and a screenshot flow that could not assert outcomes.
   `past/backup3` had ~44 assertions on generated HTML. Current `test/source.test.ts` and `test/review.test.ts`
   still take their state from `MockSource`/`mockChatState`; the real worker is exercised only by a fake `SessionPort`
   in `test/worker-api.test.ts`.
3. **Whole-region replacement with signature strings or `innerHTML`.** `past/backup`'s `app.ts:1583-1630`;
   `past/backup2`'s `ui/timeline.ts:255-261` (`dataset["signature"]` + `replaceChildren`); `past/backup3`'s
   `client/timeline.ts:124-128` (re-insert every row on order change). Current code uses
   `DOMParser().parseFromString(...)` and `replaceChildren` in `src/client/regions/navigation.ts:106-113` and the
   timeline, and `replaceHtml()` over whole surface bodies. The names changed; the mechanism did not.
4. **Pagination shaped by the UI, not by a stored cursor.** `past/backup2` protocol `want: number`, worker
   `db.roomWindow(roomId, Math.max(want, 80))`; `past/backup3` `keep: number`, reverse-from-newest window. Current
   protocol has no cursor at all. Every attempt re-sends the newest window and patches scroll by hand.
5. **Two markup producers joined by class/id strings.** `past/backup` had `scripts/shells.ts` plus `app.ts` building
   the same boot screen; `past/backup3` had build-time `html` and runtime `el()` joined by `chat.ts` selectors. The
   current tree has `components/*` markup and inline markup in `src/client/surfaces.ts` (`showViewer` at 86-134,
   `showProfile` at 588-604). `replaceHtml()` is one step better than `innerHTML = other.innerHTML`, but it is still
   a second producer when the markup does not come from `components/`.
6. **A deep module owns the composition root.** `past/backup` `app.ts` = 3,432 lines; `runtime.ts` = 1,243;
   `style.css` = 2,476. Current `src/client/surfaces.ts` = 1,666, `src/components/surfaces.ts` = 1,080,
   `src/client/regions/composer.ts` = 844, `src/core/mock.ts` = 681. The 400-line rule is not enforced.
7. **A claim one rung above its evidence.** `past/AGENTS.md:271-274` claims SAS, media progress/cancel and search
   were “verified against a real homeserver”; `past/docs/testing.md:43` says SAS was not covered and
   `past/docs/roadmap.md:11` lists media progress/cancel as remaining. Current Part 4 still says the gate is green
   while `npm run types` fails.
8. **The design record grew instead of the data shape settling.** `past/backup` had a 1,214-line `AGENTS.md` plus 15
   docs, with sections already marked “superseded”; `past/backup2` and `past/backup3` had no record at all. Current
   `AGENTS.md` contains append blocks (“本轮追加”) that contradict 1.5's “a correction rewrites the owning paragraph”.
   Keep the single record current; do not add a round section.
9. **Budgets and checks arrived late, and never gated the thing they described.** `past/backup` had no size check;
   `past/backup3` had built-byte budgets bolted onto a second markup pipeline; current C6 is deferred and the 257 KB
   watermark is outside the manifest.

### 4.2 What those attempts got right and the current tree should keep

- SDK confined to one layer. Current `test/boundaries.test.ts` passes; keep it.
- Stable DTOs instead of SDK objects. `src/core/types.ts` is the right seam; do not pass `Room`/`MatrixEvent` across
  `postMessage`.
- Pure projection functions. Keep them pure; add the DB around them, not inside them.
- One sanitizer choke point (`src/client/sanitize.ts`) and one URL policy (`src/lib/safeUrl.ts`). Keep both.
- Per-key store subscriptions (`src/client/store.ts`). The store is not the problem; the regions that rebuild
  whole bodies are.
- Hashed assets, CSP in the generated shell, and the contracts/audit idea. Keep the idea; fix the false confidence
  by adding behavioral tests.

---

## 5. Matrix spec and SDK traps

Check these before touching the worker.

### 5.1 Access-token refresh and soft logout

Spec: `/login` must be told `refresh_token: true` when the client wants refresh tokens; a client with a refresh
token must refresh on `M_UNKNOWN_TOKEN` and retry; `soft_logout` means “offer re-login, keep local data”
(`spec/content/client-server-api/_index.md` “Refreshing access tokens”;
`spec/data/api/client-server/login.yaml:173-205`).

Current: asks for nothing, passes nothing to `createClient`, stores the token unused. The first expiry is a silent
logout. Wire `refreshToken`/`onTokenRefresh` and persist rotated tokens atomically; otherwise do not store a refresh
token you cannot use.

### 5.2 The 64 KiB event limit is not a body limit

Spec: the complete event, including signatures, must be at most 65,536 bytes
(`spec/content/client-server-api/_index.md:3361`). Current protocol accepts 65,536 **UTF-16 code units** for `body`
and another 65,536 for `html` (`src/protocol/index.ts:189-190`). A non-ASCII body can pass validation and be rejected
by the server. Count bytes with `TextEncoder` and leave room for the envelope, or let the worker enforce the real
limit. Do not silently truncate.

### 5.3 Read markers are account data

`m.fully_read` is room account data; clients must change it through `/read_markers`, not by writing the event
directly (`spec/content/client-server-api/modules/read_markers.md`). `m.read.private` is supported by `/read_markers`.
Current code equates `fullyRead` with `readReceipt` and derives both from a loaded-event receipt. Read
`room.getAccountData("m.fully_read")` and choose a receipt type explicitly.

### 5.4 Sync gaps are first-class

A `limited: true` timeline carries `prev_batch`; older history is not necessarily in the live timeline
(`spec/content/client-server-api/_index.md:3452-3504`). Current code paginates only
`room.getLiveTimeline()` and takes `hasOlder` from its token. Store segments and tokens; handle
`RoomEvent.TimelineReset`.

### 5.5 Lazy-loaded members are not all members

`lazyLoadMembers: true` (`src/worker/matrix.ts:389`) means `room.getMembers()` is partial until the room is loaded.
`members()` projects it directly (`src/worker/matrix.ts:287-292`; `src/worker/project.ts:230-237`). Await
`room.loadMembersIfNeeded()` before projecting, or label the list as partial. The room settings member tab currently
shows an incomplete list with no explanation.

### 5.6 `getEventReadUpTo` is not a stored read position

It returns null when the receipt event is not loaded
(`node_modules/matrix-js-sdk/lib/models/read-receipt.js:80-90`). `projectRoom` uses it as the journal
(`src/worker/project.ts:194`), so a reload can lose the read position. Store the marker in the projection DB; use the
SDK only as an update source.

### 5.7 Notification count is not unread

`room.getUnreadNotificationCount(Total/Highlight)` is push-rule based and includes threads
(`node_modules/matrix-js-sdk/lib/models/room.js:1256-1261`). Current projection uses it as the badge and as the
“jump to first unread” index (`src/client/regions/timeline.ts:313-314`). Decide the unread policy; do not index a
message array with a notification count.

### 5.8 Starting a client does not await the first sync — and clearing stores requires a stopped client

`startClient()` starts `SyncApi.sync()` without awaiting it (`node_modules/matrix-js-sdk/lib/client.js:652-658`).
`clearStores()` throws if `clientRunning` (`:724-727`). `teardown()` relies on `logout(true)` stopping the client
before clearing; test offline logout and a failed startup, where `clientRunning` may differ. Verify that
`clearStores({cryptoDatabasePrefix})` deletes the same database name that `initRustCrypto` opens; the prefix is
passed straight to `StoreHandle.open` while `clearStores` appends `::matrix-sdk-crypto`. Treat this as a check to
run, not an assumed bug.

### 5.9 Reset encryption is destructive and asynchronous

`resetEncryption(auth)` deletes all backup versions, deletes secret storage, bootstraps new cross-signing keys and
resets the key backup (`node_modules/matrix-js-sdk/lib/rust-crypto/rust-crypto.js:1284-1303`). It is not a “show
recovery key” operation. Current `resetIdentity` calls it, then creates a new key, then bootstraps secret storage,
and sets `keyReady = true` even if the bootstrap failed. Before exposing it: decide the UIA flow for password and
SSO, verify the returned key matches the stored secret storage key, and test with a second device. Never reset
another test account through a debug path.

### 5.10 Media endpoints and `mxc`

Upload remains `/_matrix/media/v3/upload` (authenticated by the access token); download/thumbnail are the
authenticated `/_matrix/client/v1/media/...` endpoints; the old unauthenticated download endpoints are
frozen/deprecated (`spec/content/client-server-api/modules/content_repo.md` “Client behaviour”). The worker must
resolve `mxc` and hand the main thread a blob/object URL. The main thread must not request homeserver media;
`img-src`/`media-src` deliberately exclude `https:`.

### 5.11 Threads, relations and edits

`threadSupport: true` splits thread events out of the live timeline and adds thread notifications. The product does
not show threads. Either set it false until threads exist, or project thread roots/replies and their counts
deliberately. `projectMessage` currently returns `reply: null`, `reactions: []`, `mentions: []`; an edit's body is
read through the SDK's replaced event, but there is no test for it. A reply relation is loaded into `content` but
never projected, so replies do not render after reload.

### 5.12 Internal SDK imports

`src/worker/matrix.ts:14` imports `RoomMessageTextEventContent` from `matrix-js-sdk/lib/@types/events.js`. It is a
deep internal path; a minor SDK upgrade can move it. Prefer the public type or a local content shape. The same applies
to `matrix-js-sdk/lib/logger.js` in `src/worker/entry.ts`. Pinning `45.1.0` is not a substitute for a boundary.

### 5.13 Discovery and login flows

The spec's discovery flow distinguishes a 404 `.well-known` (ignore) from a non-200 or unparsable body (prompt the
user), validates the discovered `base_url`'s `/versions` response shape, and preserves a path in `base_url`
(`spec/content/client-server-api/_index.md:419-464`). `discoverHomeserver()` (`src/worker/matrix.ts:36-76`) always
requests `.well-known` even when the user typed an explicit URL, silently accepts a missing/invalid body, overrides
the entered URL with the discovered origin, validates only that `/versions` returned `ok`, and normalises a URL to
its origin (dropping any path). A homeserver mounted under a path or a server with a broken well-known file fails
with `auth`, which the UI reports as a bad password.

Similarly, `/login` advertises which flows are available (`GET /_matrix/client/v3/login`); the current page always
shows password + an SSO button that says it is unavailable, and registration is local-only. Fetch the flows, offer
only what the server advertises, and give OAuth-only servers an explicit unsupported state.

---

## 6. Security and privacy traps

### 6.1 The worker is a convention, not a capability boundary

IndexedDB is origin-wide. The main thread can open `maski:matrix` and read the access token stored by
`src/worker/sessionDb.ts`, and can open the SDK/crypto databases. “Token lives only in the worker” is a coding rule,
not a browser guarantee. An XSS in the main thread can read the token. Do not claim capability isolation; state the
threat model honestly. Keep the sanitizer and CSP strong because they are the actual defense.

### 6.2 CSP is a meta tag with a broad connect list

`src/layouts/base.ts:20-21` writes CSP as `<meta http-equiv>`, with
`connect-src 'self' https: wss:`. That allows any HTTPS origin from the page if script execution is achieved, and a
meta CSP cannot set `frame-ancestors`, `report-uri` or `sandbox`. The product says no third-party requests; the CSP
does not enforce that. A serving layer with a per-homeserver header is the real fix; until then, document the gap
and do not add a third-party fetch “just for a preview”.

### 6.3 Drafts are message text in `localStorage`

`src/client/prefs.ts:47-60` stores drafts under `maski.draft.<account>.<roomId>`. Part 2 and §3.6 require drafts in
the account-scoped UI DB, never `localStorage`, and cleared on logout. Any future settings/draft feature must not
extend this. A quota failure is swallowed (`src/client/storage.ts:38-46`), so the draft disappears silently.

### 6.4 Credentials in history

The old credential in `past/org4.mjs` was removed from the working file but remains in git history. Treat it as
compromised and rotate it. Never add another credential, test password, token or message body to the tree, a
fixture, a URL, a log or a screenshot. Use environment variables and a throwaway account.

### 6.5 Platform support is not “three engines”

`features.md` itself records `closedby` as missing in Safari 27.0, with “no JS fallback”. The product rule says use a
feature only when Chrome, Firefox and Safari support it. Either add the JS fallback (a deliberate exception) or do
not use `closedby`. The same discipline applies to every new CSS/JS feature: run `npm run features -- <id> --require 2026`
and record it.

### 6.6 `beforeunload` and bfcache

`src/client/chat.ts:71-83` tears down the worker on `beforeunload`. `beforeunload` listeners commonly disable
back-forward cache; the page then re-boots the worker on Back. Use `pagehide`/`pageshow` or accept the cost
explicitly. Do not add a second unload path.

### 6.7 Offline is absent

There is no service worker (`grep` finds none), no `navigator.storage.persist()`, and no cache policy for
`/_matrix/`. The product promise “load the page and use it offline” is not implemented. When added: precache the
shell and hashed assets only; never cache authenticated media, `/sync` or the worker's token database.

---

## 7. DOM and performance traps

### 7.1 Rows are re-attached, not patched

`src/client/regions/navigation.ts:30-72` compares `outerHTML`, clones changed rows and calls
`replaceChildren(fragment)`. Appending an existing node to a fragment already detaches it from the list, so even
“unchanged” rows are removed and re-inserted on every render. Focus is restored only to `.room-main`.
`src/client/regions/timeline.ts:240-299` does the same with a `DocumentFragment`; `rendered` identity prevents new
markup, but not detachment. `src/client/surfaces.ts:485-500` replaces an entire dialog body and restores focus only
for a settings action button.

Consequence: caret/selection/IME state, scroll anchoring, lazy media and focus are fragile; a search input or select
list inside a rebuilt body can lose its state. The fix is field-level patches on keyed nodes, one region per key.

### 7.2 Every message wakes every region

`timeline` watches `["phase", "roomId", "rooms", "messages", "hasOlder", "olderLoading"]`
(`src/client/regions/timeline.ts:438`). `navigation` watches rooms/phase/session/etc. and parses the whole nav with
`DOMParser` on each change (`navigation.ts:106-113`). `composer` watches rooms and rewrites its controls
(`composer.ts:208`). A single incoming message therefore re-renders nav, header, timeline and composer. Combine this
with the O(n) projections in §2.3 and the cost is not linear.

`fitReactionWidths()` (`timeline.ts:260-270`) reads every reaction width, then writes styles in the same frame; this
is a layout read/write loop. Measure with a 1,000-row fixture before adding more.

### 7.3 Two markup producers still exist

`components/*` owns most markup. `src/client/surfaces.ts:86-134` (`showViewer`) and `:588-604` (`showProfile`) build
markup inline. `components/surfaces.ts` contains placeholder profile/viewer bodies. `replaceHtml()` is now the
choke point for replacement, which is an improvement; it does not make the client the markup owner. Move the
inline shapes into `components/` and let the client patch fields.

### 7.4 The contract tests can pass while the UI is wrong

`scripts/contracts.ts` C1 checks that every catalog key appears as a quoted string somewhere outside the catalogs;
that is not “every key is read”. `test/pages.test.ts` checks structure, not behavior. `test/style.test.ts` checks
regexes, not the rendered browser. Keep them, but do not treat them as the UI rung. Add a browser protocol run and a
first-paint comparison.

---

## 8. Rules for the next AI contributor

### Do

- Run `git status`, `npm run types`, `npm run test` and the build before changing behavior. Report the actual state.
- Read the owning module, the owning `AGENTS.md` paragraph, and the relevant `spec/` section first.
- Keep one writer per fact. If a fact needs a second writer, redesign the boundary.
- Implement a command end to end, or hide the control. No third path.
- Patch keyed nodes by field. Reuse `components/` markup. No `innerHTML = other.innerHTML`, no `outerHTML` compare.
- Make every wait visible and cancellable. A failed request must clear the spinner and say what to do.
- Measure before claiming speed. Name viewport, scheme, cache state and measurement point.
- Test the real worker path in Chromium for sync, crypto, echo and receipts. Pure tests are not a substitute.
- Correct the owning paragraph when a design changes. Delete dead code in the same change.
- Commit one coherent change with the reason in the body, and only when the gate is green.

### Do not

- Do not trust `AGENTS.md` Part 4's status. It says 122 tests are green; the current tree fails `tsc`.
- Do not add a new `ChatSource` method without a protocol command and a worker test.
- Do not add optimistic local state for an unimplemented command. That is how the mock became the product.
- Do not add a second store, gate flag, DB writer, markup producer or worker.
- Do not put message text, tokens, recovery keys or passwords in `localStorage`, a URL, a log, a fixture or a test.
- Do not put `mxc://` in the DOM or fetch homeserver media from the main thread.
- Do not reset another account's crypto identity through a debug path. The one-time key surface does not exist.
- Do not weaken a failing test, a budget or a contract to get green.
- Do not edit `dist/`, `build/manifest.json`, `review-dist/` or `src/styles/watermark.svg` by hand. Change the
  generator.
- Do not copy from `git/sable-next` (AGPL) or any AGPL client. Read behavior, write your own code.
- Do not claim “works” from `/review/`. It is a mock surface; it is not the production runtime.

---

## 9. Recommended order of work

This order minimizes wasted UI work and keeps every step verifiable.

1. **Make the gate green.** Fix the unused parameter and the sticker-footer rule; run `npm run check`. Correct
   Part 4's status to the measured result. Commit a coherent baseline.
2. **Collapse session authority.** One worker `bootstrap` reply: session summary, connection, key status, cached
   room summaries. Delete `maski.key`/`maski.registered`/`setKeyReady` and the fake key/register handlers. The main
   thread stores only UI preferences.
3. **Add the projection DB and cursors.** Store rooms, events, receipts, members and segment tokens in the worker.
   Bounded window; both directions; gap handling; pure tests at 1/30/1,000/10,000 events. Paint cached rows before
   crypto.
4. **Make the worker own the outbox.** Queued row, status, retry/cancel, echo replacement. Then wire reactions,
   edits, redactions and replies through the same projection.
5. **Implement media in the worker.** Upload with EXIF-stripping for images, authenticated download, content-
   addressed cache, MIME/size limits, blob URLs. Then enable the composer attachments and the media surfaces.
6. **Implement search in the worker.** Account-scoped query over the projection DB; media/file filters; results
   stable while the timeline is open. Do not search the current window only.
7. **Real key gate.** Secret storage, recovery key, SAS, backup, reset, device list, typed failure codes. The gate
   predicate is a user decision; until it is made, do not show a gate that cannot decide.
8. **Auth lifecycle.** Refresh tokens, soft logout, error mapping, serialized start/login/logout, account lock,
   worker restart once.
9. **Settings/invites/spaces/notifications.** Only after each has a record in `types.ts`, a command, a projection
   and a test. Delete mock-only surfaces until then.
10. **Offline and budgets.** Service worker for shell/hashed assets only; persistence request; worker/wasm budgets;
    watermark in the manifest and under a budget.
11. **Committed browser harness.** start → login → initial sync → open window → send → echo → receipt, plus decrypt
    success/failure and a two-tab lock case. This is the P1 exit; pure tests do not replace it.

---

## 10. Verification protocol

Minimum before claiming a change:

```text
npm run types
npm run format:check
npm run lint
node --test "test/*.test.ts"
npm run bundle
npm run audit
npm run contracts
```

Do not run only the last one. The build is a chain; a failure earlier is not covered by a later pass.

For behavior:

- **Pure** for parsers, projection, permissions, grouping, URL policy, catalogs, CSS invariants.
- **Worker** in Chromium: `start`, login against a fake homeserver, initial sync, open, older, send, echo, receipt,
  decrypt success/failure, malformed command.
- **Surface** in Chromium at 390/856/1280, light/dark, scriptless, RTL, keyboard, reduced motion. Screenshot at load
  and after data; compare the boxes of the topbar, nav, timeline and composer.
- **Real server** only for a product claim. Record the account, server, viewport, scheme, cache state and timestamp;
  never record the password or token.
- **Other engines** for a browser claim. Until then say Chromium.

A screenshot is not proof of first paint if it was taken after an arbitrary wait. A mock cannot prove a worker
command. A green style regex cannot prove focus or scroll.

---

## 11. User-owned decisions

Do not silently decide these. Ask, then record the answer in the owning paragraph of Part 2/Part 3.

- Read receipt privacy: public `m.read`, private `m.read.private`, or both? What is “jump to last read”?
- Unread badge: push-rule notification count, local unread after decrypt, or both?
- Key-gate predicate: device keys, cross-signing, secret storage, backup, or all? What does “recovery key” name?
- Device identity: reuse `device_id` or create a new device per login?
- Room-list order when a room is both a DM and a favourite; where invites live.
- Old-room behavior after upgrade: replaced section, hidden, or merged.
- CSP for arbitrary homeserver origins: per-homeserver response header vs broad `https:` connect source.
- OAuth-only homeservers: unsupported message, OAuth implementation, or out of scope?
- Scope cut for the first usable release.

---

## 12. One-line summary for the next agent

The UI is ahead of the runtime: the mock is the de facto specification, the session and key gate have two owners,
the worker has no projection DB, and the gate is red. Read the code and the spec, implement one boundary at a time,
and do not present a mock surface as a finished feature.
