# Architecture

## Goals

- A local-first Matrix client that reads only local data on the main thread.
- Offline viewing after the page has loaded, local search, local settings, and an outbox that survives reloads.
- End-to-end encryption with a mandatory key gate.
- One static deployment that works on GitHub Pages.
- No backend, no server rendering, no UI framework.

## Non-goals

Calls, spaces, threads, push gateway, multi-account, native shells, server-side search, server-side rendering, and cold offline start are out of v1.

## System context

```
browser
  main thread
    static shell, UI, router, dialogs, AppStore, media object URLs
    IndexedDB reads (projection, outbox, UI settings)
  dedicated worker (target)
    matrix-js-sdk, sync, rust crypto, SDK store, projection writes, media fetch
  optional media-only service worker
    same-origin authenticated video proxy
  IndexedDB
    account DB: session, meta, rooms, events, members, relations, packs, media, outbox
    UI DB: settings, drafts, scroll
homeserver
  client-server API, media repository, key backup
static host
  GitHub Pages or any static host
OS
  Notification API
```

The worker is required. The main thread never imports `matrix-js-sdk` and never owns the token or keys. If the worker cannot start, the app shows a fatal/degraded state with reload; there is no main-thread SDK fallback.

## Processes and ownership

| Process | Owns | Does not own |
| --- | --- | --- |
| Main thread | DOM, render, router, dialogs, AppStore, UI DB, outbox writes, media URLs, notifications | SDK, crypto, network, projection writes |
| Worker | MatrixClient, sync, crypto, session, SDK store, projection DB writes, media fetch/decrypt, room/device/profile/recovery commands | DOM, AppStore, UI DB |
| Media service worker | authenticated video streaming, if enabled | application state, tokens beyond an in-memory handoff |
| Static host | HTML shells, hashed assets, manifest | data, sessions |

The main thread never imports `matrix-js-sdk` at runtime. Only `src/matrix/worker.ts` and its worker-only modules do.

## Layers

1. **Static shell** — localized HTML, boot state, full-page no-JS overlay, external CSS/JS.
2. **App composition** — `src/app/main.ts` and `app.ts`; creates the adapter, store, router, renderer, and views.
3. **UI** — views, keyed lists, scroll controller, dialogs, router, composer, pickers, media presentation.
4. **Store** — one `AppStore` composition with slice modules; reads projection and outbox; no network.
5. **Adapter boundary** — `src/matrix/client.ts` request/response and event handling; no SDK types in the UI.
6. **Worker** — `src/matrix/worker.ts` and worker-only modules; SDK, crypto, sync, projection, media.
7. **Shared leaves** — `src/protocol` (messages), `src/data` (records/schema), `src/app/config.ts`, `src/i18n`, `src/styles`.

## Data flow

### Sync

```
homeserver /sync
  -> worker SDK
  -> normalize event/room/member/relation/pack records
  -> projection transaction + meta.revision
  -> delta message (records)
  -> main AppStore applyDelta
  -> one rAF render
  -> keyed views update changed rows
```

The main thread can read the projection directly for startup, pagination, search, and gap recovery. The delta is an optimization and a notification, not a second database.

### Send

```
UI action
  -> main writes outbox row and optional blob
  -> post send(txnId)
  -> worker reads outbox
  -> SDK send with txnId
  -> outbox status event
  -> remote echo delta
  -> main removes the outbox row by unsigned.transaction_id
```

A message is visible immediately from the outbox row. No UI handler awaits the network.

### Auth and key gate

```
discover -> login/register/SSO -> session summary
  -> worker starts: SDK, rust crypto, sync, projection (device lists/SAS available)
  -> secret storage status
  -> key gate path: recovery | wait/SAS | reset
  -> app shell becomes interactive
```

Sync may run while the gate is open so device lists and SAS work. The gate blocks the shell, not the worker.

The access token, keys, and crypto store stay in the worker. The main thread sees session summaries, verification phases, and the one-time recovery key display.

### Media

```
main checks account media DB
  -> hit: blob -> object URL
  -> miss: worker media command
     -> SDK/crypto fetch, decrypt, cache, return ArrayBuffer
  -> main creates object URL and ref-counts it
```

Pack images, avatars, images, audio, and files use the same cache path. Video may use the media service worker for streaming instead of a full blob.

## Runtime states

| State | Meaning | UI |
| --- | --- | --- |
| `boot` | static shell, no app | localized boot text |
| `no-js` | scripts disabled | full-page noscript overlay |
| `auth` | no session | auth page, language switch |
| `key-gate` | session but no key path complete | mandatory gate, three paths |
| `ready` | projection loaded, worker syncing | app shell |
| `offline` | no network or sync failure | local data, queued sends, status |
| `degraded` | worker failed or unavailable | local projection, outbox queues, reload; no SDK fallback |
| `read-only` | another tab holds the lock | cached data, no sending |
| `fatal` | unrecoverable worker/projection error | visible error, retry/reload, no silent blank |

## Failure boundaries

- Worker fatal: main keeps the projection, shows a degraded state, restarts once; if restart fails, fatal with reload; outbox persists. If the worker cannot start, show fatal with reload; no SDK fallback.
- Projection schema mismatch: rebuild derived stores from the SDK store; keep outbox/session; show progress.
- Sync error: retry with backoff; offline mode; no blocking dialog.
- Media error: placeholder with retry/alt; no blank row.
- Crypto/key error: gate stays open with an inline error; no skip.
- No silent fallbacks: a missing asset, record, or field is an error or a visible state.

## Deployment

- Static directory with `index.html` (English), `/<locale>/index.html`, hashed assets, manifest, optional `404.html`.
- Hash routing is the default; history routing needs a per-locale or root fallback.
- A media-only service worker is optional and must not cache user data or act as the app shell.
- GitHub Pages base path is configurable; no absolute `/` asset assumptions.

## References

- matrix-js-sdk `src/store/indexeddb.ts`, `src/client.ts`, `src/models/room.ts`, `src/rust-crypto/`, `src/crypto-api/index.ts` at `14a114e`.
- Cinny `src/client/initMatrix.ts`, `src/app/features/room/RoomTimeline.tsx`, `src/app/plugins/custom-emoji`, `src/app/components/DeviceVerification.tsx` at `474400c`.
- Matrix spec v1.19; MDN IndexedDB/Web Locks/Notification/Page Visibility.
- See `references.md` for dates and exact paths.
