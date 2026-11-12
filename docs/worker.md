# Worker protocol

The worker is the only place that touches `matrix-js-sdk`, the network, crypto, and the projection DB. The main thread talks to it through one adapter (`src/matrix/client.ts`). Adding a feature means adding a command or event here, not a second HTTP client.

The worker is required; there is no main-thread SDK fallback. The main never imports `matrix-js-sdk` and never owns the token or keys. The worker spike must pass before implementation; if it fails, stop and revisit the architecture (`AGENTS.md` 0.6 O2 and `decisions.md`).

## Envelope

Main to worker:

- Commands: `{ id, type, payload }`.
- Ack: `{ type: "ack", revision }`.
- UIA answer: `{ type: "uia", requestId, auth }`.
- Cancel UIA: `{ type: "uiaCancel", requestId }`.

Worker to main:

- Reply: `{ id, ok: true, data }` or `{ id, ok: false, error: { code, message, retryable } }`.
- Events: `{ type, ... }`, no `id`.

Rules:

- Plain error objects; no `Error` instances.
- Validate both directions; a malformed command returns `bad_request`; a malformed event is logged and ignored.
- Unknown messages do not throw.
- Commands that hit the network default to a 30s timeout; `start` and sync have no timeout.
- One pending request per `id`; the worker echoes the id.
- The adapter wraps `postMessage`; clone failures become errors.

Error codes: `bad_request`, `not_logged_in`, `network`, `rate_limited`, `crypto`, `uia`, `verification`, `unsupported`, `internal`.

## Handshake

1. Main opens the last account DB read-only, reads local data, and acquires the Web Lock; it does not mount the shell.
2. The adapter (`matrix/client.ts`) constructs the worker with `new Worker(new URL("./matrix.worker.ts", import.meta.url), { type: "module" })`.
3. The adapter sends `start` with `{ accountHash }` from `maski-ui.lastAccountHash`.
4. Worker opens the account DB, restores `session`, initializes rust crypto, starts sync, posts `ready`.
5. `ready` carries `{ session, revision, syncState }`; the session summary includes `accountHash`.
6. Main compares revision; a mismatch re-reads the projection.
7. No session: `ready.session = null`; the main shows auth. A session without a completed key gate returns the gate; after `ready`, the main calls `recoveryStatus`.

Sync runs during the key gate so device lists and SAS work. The gate blocks the shell, not the worker.

## Commands

### Session and auth

| Command | Payload | Reply | Notes |
| --- | --- | --- | --- |
| `start` | `{ accountHash? }` | `{ started: true }` | `ready` follows |
| `discover` | `{ server }` | `{ baseUrl, loginFlows, ssoTargets, registration }` | `.well-known`; `ssoTargets` carries `loginType`, `idpId`, `name` |
| `login` | `{ baseUrl, identifier, password }` | `{ session }` | password once |
| `ssoUrl` | `{ baseUrl, redirectUrl, loginType, idpId? }` | `{ url }` | main navigates; `loginType` is `sso` or `cas` |
| `loginToken` | `{ baseUrl, token, deviceId? }` | `{ session }` | SSO callback |
| `register` | `{ baseUrl, username, password }` | `{ session }` or UIA | UIA via event |
| `logout` | `{}` | `{}` | clears SDK/crypto/account DB; main clears UI drafts/scroll and last account |
| `retrySync` | `{}` | `{}` | `retryImmediately()` |
| `setOnline` | `{ online }` | `{}` | retry on true |

`session` summary: `{ userId, deviceId, displayName, avatarMxc, accountHash }`. The main never receives the access token or keys.

### Sync and read

| Command | Payload | Reply | Notes |
| --- | --- | --- | --- |
| `paginate` | `{ roomId, direction, limit }` | `{ added, reachedStart }` | delta follows |
| `jump` | `{ roomId, eventId }` | `{ found }` | delta follows |
| `markRead` | `{ roomId, eventId }` | `{}` | receipt in background |
| `typing` | `{ roomId, typing }` | `{}` | debounced by main |

### Send

| Command | Payload | Reply | Notes |
| --- | --- | --- | --- |
| `send` | `{ txnId }` | `{ queued: true }` | worker reads outbox |
| `retry` | `{ txnId }` | `{ queued: true }` | resets attempts |
| `cancelSend` | `{ txnId }` | `{ cancelled: true }` | abort/remove where possible |

One in-flight message per room. The worker uploads/encrypts attachment blobs from the outbox before sending.

### Rooms and packs

| Command | Payload | Reply | Notes |
| --- | --- | --- | --- |
| `createRoom` | `{ name, topic, visibility, invite, encrypted }` | `{ roomId }` | opens room |
| `joinRoom` | `{ roomIdOrAlias }` | `{ roomId }` | errors visible |
| `leaveRoom` | `{ roomId }` | `{}` | clears local room cache |
| `invite` | `{ roomId, userId }` | `{}` | members section |
| `createDm` | `{ userId }` | `{ roomId }` | reuse or create, encrypted |
| `setRoomState` | `{ roomId, eventType, content, stateKey? }` | `{}` | name/topic/avatar |
| `setRoomTag` | `{ roomId, tag, value? }` | `{}` | favourite/lowpriority |
| `setNotificationMode` | `{ roomId, mode }` | `{}` | all/mentions/mute |
| `uploadRoomAvatar` | `{ roomId, buffer, mime }` | `{}` | transfer buffer |
| `setPackGlobal` | `{ packId, enabled }` | `{}` | stable + legacy account data |

### Devices and verification

| Command | Payload | Reply | Notes |
| --- | --- | --- | --- |
| `getDevices` | `{}` | `{ devices }` | name, id, last seen, verification |
| `deleteDevice` | `{ deviceId }` | `{}` | UIA if required |
| `deleteDevices` | `{ deviceIds }` | `{}` | bulk sign-out |
| `verifyOwnDevice` | `{}` | `{ requestId }` | key-gate wait path |
| `verifyDevice` | `{ deviceId }` | `{ requestId }` | settings SAS |
| `verifyUser` | `{ userId }` | `{ requestId }` | DM SAS |
| `acceptVerification` | `{ requestId }` | `{}` | other side |
| `startSas` | `{ requestId }` | `{}` | start SAS |
| `confirmSas` | `{ requestId }` | `{}` | emoji match |
| `cancelVerification` | `{ requestId }` | `{}` | cancel |

Verification phases arrive as events, not replies. Both sides compare the same emoji and confirm.

### Profile

| Command | Payload | Reply | Notes |
| --- | --- | --- | --- |
| `getProfile` | `{ userId }` | `{ displayName, avatarMxc, verification }` | current/other |
| `setDisplayName` | `{ displayName }` | `{}` | account |
| `uploadAvatar` | `{ buffer, mime }` | `{ avatarMxc }` | transfer buffer |

### Key gate and recovery

| Command | Payload | Reply | Notes |
| --- | --- | --- | --- |
| `recoveryStatus` | `{}` | `{ secretStorage, backup, crossSigning, deviceVerified }` | gate |
| `setupRecovery` | `{ passphrase? }` | `{ recoveryKey }` | one-time display |
| `unlockRecovery` | `{ recoveryKey? , passphrase? }` | `{}` | key gate |
| `resetRecovery` | `{}` | `{ recoveryKey }` | destructive |
| `restoreBackup` | `{}` | `{}` | progress |
| `createBackup` | `{}` | `{}` | no backup |

UIA prompts are events. The recovery key is the only secret that crosses to the main thread for display; it is never persisted there.

### Media

| Command | Payload | Reply | Notes |
| --- | --- | --- | --- |
| `media` | `{ mediaKey, mxc, width, height, method, file? }` | `{ buffer, mime }` | transfer `ArrayBuffer` |
| `uploadRoomAvatar` / `uploadAvatar` | buffer | mxc | used by profile/room settings |

The main checks the media DB first. A miss sends `media`. The worker fetches with `Authorization`, decrypts if needed, caches, and returns the buffer.

### UIA

Some commands need user-interactive auth (register, cross-signing bootstrap, reset, bulk delete). The worker posts:

```
{ type: "uia", requestId, stages, params }
```

The main prompts, then sends `{ type: "uia", requestId, auth }` or `{ type: "uiaCancel", requestId }`. The original command stays pending. Only one UIA request is active.

### Outbox delivery

The worker delivers the main thread's outbox rows, because the client lives here.

- `send` and `retry` enqueue a `txnId`; the row is read from the account database when the send starts.
- One message is in flight per room; the rest wait in order.
- A transport failure, `M_LIMIT_EXCEEDED`, `M_UNKNOWN` or a resource limit is retried with exponential backoff (1s to 30s) up to 8 attempts. A rejected event fails immediately.
- `cancelSend` drops a row that is still queued or waiting for a retry; a row already on the wire is not recalled, and its remote echo clears it.
- `setOnline { online: true }` and `retrySync` flush pending backoff timers.
- Events: `outbox` with `pending` (retrying), `sent`, or `failed`.

### Media size

A thumbnail is requested only when a width and height are known and the media is not encrypted. The SDK treats the presence of a resize method alone as a thumbnail request, and a homeserver without a video thumbnailer answers 404 for a video thumbnail, which is why video messages showed a load failure.

### Spaces

`projectAll` includes spaces in the room records, because the channel list and its subgroups come from the projection, while members, events, and packs stay limited to chat rooms.

### Outbox on start

`start` resumes every row still in the outbox after the projection is ready, and `setOnline true` does the same after a reconnect, so a send made before a reload is delivered without a new user action.

### Relations and decryption

The SDK does not put a relation on the timeline: it aggregates the event into its parent, and an encrypted relation is readable only after decryption. The worker therefore reads every event the sync emits, decrypts it when needed, and applies it through one relation handler. An annotation is stored in `relations` so a later redaction finds it again, and a repeated delivery is dropped by checking the stored relation id. A reaction chip is a toggle: pressing your own reaction redacts its annotation, or cancels the queued send while it is still in the outbox.

### Projection reads

The main thread reads the open room only, newest 2000 rows through the `roomTs` index. Every other room is a summary in `rooms`. A delta is applied when its revision is the next one; a gap re-reads the projection, and a delta for another room contributes its room summary but not its events.

### Read state

`markRead` calls `setRoomReadMarkers`, which moves the read receipt and the fully read marker in one request. The marker is what the timeline draws as the line between read and unread.

### Readiness

A command that needs the client waits for the worker to finish starting, up to the 30s command timeout instead of failing with an internal error during the boot window. `start`, `discover`, `login`, `loginToken`, `register`, `ssoUrl` and `logout` never wait.

A stage that needs no user input (`m.login.dummy`) is answered inside the worker without a prompt. Password, registration token, and terms prompt. An unsupported stage fails the request instead of waiting.

## Events

| Event | Payload | Notes |
| --- | --- | --- |
| `ready` | `{ session, revision, syncState }` | after start/login |
| `delta` | `{ revision, rooms, events, members, relations, packs, removedRooms, removedPacks, syncState }` | changed records |
| `reload` | `{ revision }` | initial/rebuild; main re-reads |
| `outbox` | `{ txnId, status, progress?, eventId?, error?, attempts? }` | main writes outbox |
| `typing` | `{ roomId, userIds }` | ephemeral |
| `sync` | `{ state }` | connecting/syncing/error |
| `progress` | `{ phase, done, total }` | sync/rebuild/backup |
| `verification` | `{ requestId, phase, sas?, deviceId?, userId?, error? }` | SAS UI |
| `uia` | `{ requestId, stages, params }` | pending auth |
| `fatal` | `{ code, message }` | worker unusable |
| `log` | `{ level, message }` | no secrets |

## Backpressure

- Main acks every applied delta with `{ type: "ack", revision }`.
- Worker keeps at most 8 unacked deltas; when full, it coalesces changed records by key and sends one merged delta after an ack.
- `reload` is acked after the main re-reads.
- Initial sync and schema rebuild use `reload`, not thousands of deltas.
- The worker keeps writing the projection while the UI catches up; no lost records.

## Session and security

- The worker owns session, access token, refresh token, keys, crypto store.
- Credentials and UIA passwords go to the worker once; the main does not persist them.
- SSO tokens are consumed once and removed from the URL by the main before sending.
- Recovery key display is one-time; no logs.
- The main never reads `session` or crypto stores.
- Logout: main closes its account DB connection, then worker clears SDK, crypto, and the account DB; after the reply, main clears UI drafts/scroll and the last-account pointer, then resets AppStore. The worker never writes the UI DB.

## Concurrency and failure

- One `MatrixClient` per worker; one worker per active tab.
- Web Lock on the main thread for the tab lifetime; a second tab is read-only.
- Worker crash: `fatal`/`onerror`; main keeps the projection, restarts once, shows degraded; if restart fails, fatal with reload; outbox persists.
- If the worker cannot start, show a fatal/degraded state with reload; no main-thread SDK, no blank.
- Worker logs go through `log`; no tokens, keys, or message bodies.

## Vite and CSP

- Use `new Worker(new URL("./matrix.worker.ts", import.meta.url), { type: "module" })`; Vite emits a separate chunk.
- Do not inline the worker.
- Main bundle must not import `matrix-js-sdk`; only the worker does.
- CSP needs `worker-src 'self'`; wasm and `connect-src` are checked in the spike because the document meta CSP does not automatically govern the worker.
- A media-only service worker, if used, has its own CSP and token handoff; see `build.md` and `security.md`.

## References

- AGENTS.md 0.6 E2/E3/E11, 21, 26, 31.
- matrix-js-sdk `src/store/indexeddb-remote-backend.ts`, `indexeddb-store-worker.ts`, `src/client.ts`, `src/sync.ts`, `src/crypto-api/index.ts`, `src/rust-crypto/` at `14a114e`.
- Cinny `src/client/initMatrix.ts`, `src/app/components/DeviceVerification.tsx`, `src/app/components/SecretStorage.tsx`, `src/app/features/settings/devices/OtherDevices.tsx` at `474400c`.
- MDN Worker/Transferable/Web Locks; Vite Web Workers.
