# State

State has one owner per fact. The AppStore is a render snapshot, not a second database.

## Source of truth

| Fact | Source | Writer | Reader |
| --- | --- | --- | --- |
| Route, locale, dialog, search query | URL | router | UI, store |
| Session, token, device keys | worker session/crypto store | worker | worker |
| Sync token, SDK room model | SDK store | worker | worker |
| Projection rooms/events/members/relations/packs/media | account DB | worker | main read layer |
| Outbox and attachment blobs | account DB | main | worker (read), main |
| Drafts, scroll, local settings | UI DB | main | main |
| Render snapshot | AppStore | main | UI |
| Object URLs | media cache | main | UI |
| Notification permission/preview | main local settings + OS | main | main |

The URL owns navigation. The worker owns Matrix. The main owns local UI and outbox. No store writes Matrix data to the projection.

## AppStore

One root `AppStore` composed of slice modules. Each slice owns a named part of the snapshot and exposes explicit mutation functions. The root exposes only:

- `getSnapshot(): AppSnapshot`
- `subscribe(listener): () => void`
- action methods grouped by slice (`session.*`, `rooms.*`, `timeline.*`, `outbox.*`, `packs.*`, `security.*`, `profile.*`, `ui.*`)

Slices:

| Slice | Data |
| --- | --- |
| `session` | auth status, worker/sync state, online, key-gate phase, account summary |
| `rooms` | room map, section/order view input, unread/mention/mute/tags |
| `timeline` | active room, loaded events, display window, read/new markers, typing |
| `outbox` | pending rows for the active room, status/error |
| `packs` | pack list, images, enabled global packs, recent/favorite local ids |
| `security` | device list, verification phase/SAS, recovery/backup status |
| `profile` | open profile card, verification state, profile data |
| `ui` | locale, dialogs, drafts, scroll snapshots, search query/results |

Rules:

- Mutations replace only changed records. Unchanged records keep their references.
- Views never mutate a snapshot. They call actions.
- A slice does not read another slice's mutable state. The root composes inputs.
- Derived data lives in `selectors.ts`: sorted room list, timeline display items, pack groups, search rows. Do not store derived copies.
- No observable graph, proxy, or implicit dependency tracking. One explicit subscription and one render scheduler.

## Rendering

- Any mutation schedules one `requestAnimationFrame` render.
- Multiple worker messages in one frame coalesce.
- A hidden document skips render and renders once on visibility.
- Region renderers update their own DOM: shell, room list, header, timeline, composer, dialog.
- The composer and an open dialog keep local DOM/selection state and are not re-rendered on unrelated changes.
- A delta whose revision is not the previous revision + 1 triggers a projection re-read, not a partial apply.

## URL state

- Locale is a path prefix (`/`, `/zh-CN/`).
- Room is a route (`/room/:id` or hash equivalent).
- Dialogs are query state (`?dialog=settings`, `search&q=...`, `join`, `create`, `new-message`, `room-settings`).
- Search query lives in `q`; typing uses replace, not a history entry per keystroke.
- Back closes the dialog before the route changes; a deep-linked dialog closes with replace.
- The URL is the only source for open dialog and search query. No duplicate boolean in the store.

## Startup

1. Open the UI DB; read settings, drafts, scroll, and `lastAccountHash`.
2. If a last account exists, open its projection read-only and read `meta.revision`, rooms, the active window, and outbox in one transaction into memory. Do not mount room content yet.
3. Acquire the Web Lock; if unavailable, enter read-only and skip worker startup.
4. Start the adapter/worker; show boot/connecting, not auth.
5. On `ready`, compare revisions; re-read on mismatch; call `recoveryStatus`.
6. No session -> auth; session with an incomplete gate -> `key-gate`; completed -> mount shell/rooms/timeline from the local snapshot.
7. Apply deltas and render. Sync runs during the gate for device lists and SAS; only the shell is gated.

In the owning tab, no shell or room content mounts before the gate result; a stored session never flashes auth or cached messages. A read-only tab shows cached data with a banner and no composer; it has no worker.

## Projection reads

- `store/db.ts` opens the account DB read-only and exposes typed reads:
  - room list
  - event window by `[roomId, ts, eventId]`
  - event by id
  - members by room
  - packs
  - media by key
  - search by tokens
  - outbox by room/status
- Reads for a snapshot happen in one transaction.
- A read after a revision gap replaces the snapshot; do not merge partial data.
- No cross-thread write to projection stores from the main thread.

## Outbox

- A send action writes an outbox record and optional blob before posting `send(txnId)`.
- The row is visible immediately as a local pending message.
- The worker reads it and sends with the same `txnId`; retries reuse it.
- Status events update the outbox record; the main is the only writer.
- A remote event with `unsigned.transaction_id` removes the row.
- One in-flight message per room preserves order. A failed row exposes retry; later rows wait. Cancel aborts where the worker can and removes the row.
- The outbox survives reloads; the worker retries when online.

## Drafts and scroll

- Draft: text, marks, custom-emoji tokens, reply/edit target, updated time. Per account and room.
- Scroll: event id, offset, at-bottom flag. Per account and room.
- Drafts and scroll are local UI data; cleared on send/cancel or when the room is left.
- Undo history is in memory only; it does not persist and resets on room switch.

## Media cache

- Key: `mxc` | `width x height` | method | encrypted file hash.
- Value: blob/array buffer; ref count; object URL map in main.
- Object URLs are created lazily and revoked at zero references.
- LRU cap; the worker may evict persisted media; the main drops URLs on room switch.
- Video may bypass the blob cache through the media service worker.

## Security and devices

- The worker owns session, keys, crypto store, and device keys.
- The `security` slice receives device/user verification phases from worker events and device list responses.
- The main never reads `session` or crypto stores.
- A key-gate path completion is a worker event; the store leaves `key-gate` only after it.
- Logout is coordinated: main closes its account DB connection; worker clears SDK/crypto/account DB; main clears UI drafts/scroll and the last-account pointer, then resets AppStore after the reply. The worker never writes the UI DB.
- One tab holds the Web Lock; other tabs are read-only and show why.

## Concurrency

- One `MatrixClient` per worker.
- One worker per active tab.
- One rAF render loop.
- One writer per store: worker projection/media; main outbox/UI.
- No UI handler awaits network; actions update local state and enqueue.
- No blocking dialog; native `<dialog>` only.
- No long synchronous work; batch/chunk projections and reads.

## Testability

- Slice mutations are pure functions over records.
- Selectors are pure.
- The adapter is an interface with a fake implementation for store/UI tests.
- DB reads/writes use a typed fake in unit tests.
- Keyed list, scroll anchor, composer history, and normalizer are independently testable.
- E2EE and worker behavior are tested in the browser, not mocked at the unit boundary.

## References

- AGENTS.md 0.6 E1/E4, sections 20-22, 30-31.
- matrix-js-sdk `src/store/indexeddb.ts`, `src/client.ts` at `14a114e`.
- MDN IndexedDB, Web Locks, Page Visibility, requestAnimationFrame.
- See `references.md`.
