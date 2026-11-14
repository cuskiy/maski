# References

Read the official source before changing a protocol, browser API, or SDK behavior. Cite the path and commit in reviews and docs.

## Matrix protocol

| Source | Used for | Checked |
| --- | --- | --- |
| Matrix spec v1.19 client-server API | Rooms, events, sync, media, transactions, membership, push rules | 2026-11-11 |
| Matrix spec v1.19 E2EE / crypto | Device keys, Olm/Megolm, secret storage, key backup, SAS | 2026-11-11 |
| Matrix v1.19 changelog | Image packs (`m.room.image_pack`, `m.image_pack.rooms`) | 2026-11-11 |
| MSC2545 `proposals/2545-emotes.md` | Pack/image schema, shortcode grammar, `data-mx-emoticon`, pack priority, unencrypted pack media | 2026-11-11 |
| MSC3916 / Matrix 1.11 media | Authenticated media headers | 2026-11-11 |
| Matrix spec transaction identifiers | `txnId` scope and idempotency | 2026-11-11 |

Stable image-pack identifiers: `m.room.image_pack` state and `m.image_pack.rooms` account data. Unstable: `im.ponies.room_emotes`, `im.ponies.emote_rooms`. The client reads both; global enable writes both.

## matrix-js-sdk

Checkout: `git/matrix-js-sdk`, 45.1.0, `14a114e` (shallow). Read-only.

| Path | Used for |
| --- | --- |
| `src/client.ts` | Client lifecycle, login/register, devices, room state, timeline APIs |
| `src/sync.ts` | Sync loop, `retryImmediately`, online/offline handling |
| `src/store/indexeddb.ts` | Store is an in-memory cache; eager startup; 5-minute save throttle; degrade to memory |
| `src/store/indexeddb-remote-backend.ts` | Worker request/response shape (`seq`, `cmd_success`, `cmd_fail`) |
| `src/store/indexeddb-store-worker.ts` | IDB worker pattern; plain error objects |
| `src/models/event.ts` | `getEffectiveEvent`, `getUnsigned`, `isRedacted`, `isDecryptionFailure`, relations |
| `src/models/room.ts` | Room name/avatar, unread counts, read markers, local echo |
| `src/models/compare-event-ordering.ts` | Timeline ordering limitations |
| `src/crypto-api/index.ts` | Secret storage, backup, device/user verification, SAS |
| `src/crypto-api/recovery-key.ts` | Recovery key decoding |
| `src/crypto-api/key-passphrase.ts` | Passphrase derivation |
| `src/rust-crypto/` | Rust crypto, key backup, cross-signing, verification |
| `src/http-api/index.ts` | Fetch HTTP, upload XHR fallback |
| `src/browser-index.ts` | Browser entry; IndexedDB crypto store factory |
| `src/matrix.ts` | `createClient` default store uses `globalThis.localStorage` |

Do not copy code. Use behavior and API shapes.

## Cinny

Checkout: `git/cinny`, 4.12.8, `474400c` (shallow). Read-only.

| Path | Used for |
| --- | --- |
| `src/client/initMatrix.ts` | `IndexedDBStore`, `IndexedDBCryptoStore`, `initRustCrypto`, `startClient` |
| `src/app/features/room/RoomTimeline.tsx` | Timeline pagination, linked timelines, decrypt before render |
| `src/app/plugins/custom-emoji` | Legacy image-pack schema, usage, global packs, user pack |
| `src/app/components/emoji-board` | Picker tabs, recent, pack groups, sticker/custom emoji selection |
| `src/app/components/DeviceVerification.tsx` | Verification phases, SAS emoji, received request |
| `src/app/components/SecretStorage.tsx` | Recovery key/passphrase validation |
| `src/app/components/ManualVerification.tsx` | Manual verify and backup restore |
| `src/app/features/settings/devices/OtherDevices.tsx` | Device list, bulk delete, UIA |
| `src/app/pages/auth` | Login/register, discovery, errors |
| `src/app/components/editor` | Editor behavior reference; uses Slate, which maski does not use |

Cinny is a behavior reference, not an architecture template. maski uses native DOM and a textarea composer.

## Element Web

| Source | Used for |
| --- | --- |
| `element-hq/element-web` `apps/web/src/serviceworker/index.ts` | Media service worker pattern for authenticated media |
| Element Web media/auth behavior | Context only; not copied |

Element is not cloned in `git/`; path checked 2026-11-11. Do not copy React/MatrixReactSDK structure.

## MDN

| Page | Used for |
| --- | --- |
| IndexedDB, `IDBIndex.getAll`, `IDBKeyRange` | Projection reads/windows |
| Web Locks | One-tab ownership |
| Notification, Page Visibility | Local notifications, hidden/unfocused policy |
| Transferable objects | `ArrayBuffer` media transfer |
| `contenteditable`, `execCommand`, `EditContext`, `beforeinput` | Why the composer uses a textarea |
| Selection, Clipboard | Textarea selection/paste |
| `light-dark()`, container queries, `overflow-anchor`, `content-visibility` | Visual system and scroll |
| `requestAnimationFrame`, IntersectionObserver, ResizeObserver | Render scheduling, lazy media, anchoring |
| `Intl` / `Intl.Segmenter` | Formatting and search |
| CSP, Service Worker, `wasm-unsafe-eval` | Security/build |

Notification API is marked limited availability; feature-detect and keep in-app indicators. Web Locks and Page Visibility are baseline.

## Vite

| Page | Used for |
| --- | --- |
| Web Workers | `new Worker(new URL(...), { type: "module" })`, separate chunks |
| Static build, HTML entry points, `base` | Locale shells, GitHub Pages |
| WASM assets | Rust crypto wasm handling |

The worker/wasm build remains a Phase 0 spike.

## Project references

| Source | Used for |
| --- | --- |
| `blog/AGENTS.md` | Visual/fluid/Gestalt rules, code shape, verification |
| `blog/src/assets/style.css` | Token table, surfaces, text tones, type/space ladder |
| `blog/src/pages/search.ts`, `music.ts`, `about.ts` | `noscript` note tone |
| `blog/AGENTS.md` 1.6/2.6 | No-JS and interaction rules |

`blog/` is a separate project; keep its `AGENTS.md` and files untouched.

## Testing references

- Vitest and Playwright official docs.
- Synapse/Continuwuity documentation for a user-process test homeserver.
- Matrix spec test vectors and SDK test fixtures where available.

## Citation format

```
matrix-js-sdk@14a114e src/client.ts
Cinny@474400c src/app/features/room/RoomTimeline.tsx
Matrix spec v1.19 client-server API
MDN IndexedDB (checked 2026-11-11)
```

Refreshing `git/` checkouts: `git -C git/<name> pull --ff-only`. Update the commit in `AGENTS.md` 19 and in this file when the reference is used.
