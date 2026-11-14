# Security

## Threat model

Assume:

- Matrix events, profiles, room names, formatted bodies, packs, and media are attacker-controlled.
- The browser profile may be read by a local attacker; the device keys are in the same profile, so profile access is equivalent to message access.
- XSS is the main web threat; CSP, sanitization, and a single render path are the defense.
- A malicious pack can change images after being enabled; pack media is server-visible and unencrypted.
- Notifications can expose decrypted text on a lock screen.
- Supply chain: SDK, sanitizer, Vite, and build tooling.

Non-goals: protection from a compromised OS/browser, remote wipe of another device, or hiding metadata from the homeserver.

## End-to-end encryption

- Rust crypto from matrix-js-sdk; keys and crypto store live in the worker. The worker is required; there is no main-thread SDK fallback.
- A key is required before the app is interactive.
- Three paths: use recovery key/passphrase, wait for another device with SAS, reset.
- Registration has no key; it only offers reset/create.
- Skipping is not allowed. The gate returns until a key path completes.
- Recovery key is shown once; copy/download; never logged or persisted in the main thread.
- Key backup is restored or created; reset warns that old history and verified contacts are affected.
- SAS verification: self-device wait, device sessions, and user verification in a DM. Both sides compare the same emoji and confirm.
- UIA passwords go to the worker once; the main does not persist them.

## Tokens and keys

- The access token, refresh token, device keys, secret storage key, and key backup key live in the worker and its IndexedDB.
- The main receives only session summaries, verification phases, UIA prompts, and the one-time recovery key display.
- SSO login tokens are consumed once and removed from the URL before the worker sees them.
- No token in a URL, log, notification, error message, or DOM beyond the one-time recovery display.
- Logout: main closes its account DB connection; worker clears SDK store, crypto store, and the account DB; after the reply, main clears UI drafts/scroll and the last-account pointer, then resets AppStore. The worker never writes the UI DB.

## Sessions

- One tab holds the Web Lock; other tabs are read-only and say why.
- The worker owns the crypto store; two clients on one store corrupt data.
- Settings > Security lists devices; the current device is marked.
- Sign out one or all other sessions; UIA if required; the current device stays.
- This invalidates server sessions. Data already downloaded on another device may remain; the UI says it is not a remote wipe.
- Key backup is unchanged by sign-out; the current device keeps its keys.

## Media

- Authenticated media uses `Authorization`; never put the token in a URL.
- The worker fetches/decrypts media and returns `ArrayBuffer`; the main creates blob URLs and revokes them.
- Encrypted attachments are encrypted before upload; the event carries `file`; thumbnails follow the same rule.
- Pack images are not encrypted by MSC2545; the UI warns. The sticker event is encrypted in an E2EE room, but the image media is server-visible.
- Inline images are not rendered; only custom-emoji `img` with `data-mx-emoticon` and an `mxc://` src.
- Video may use a media-only service worker for authenticated range requests. It must not cache user data beyond the media cache and must not act as the app shell.
- Media errors are visible; no silent blank.

## Sanitizer

`formatted_body` is untrusted. Allowlist:

- `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `del`, `s`, `code`, `pre`, `blockquote`, `ul`, `ol`, `li`, `a`, `hr`, `table`, `thead`, `tbody`, `tr`, `th`, `td`.
- `img` only with `data-mx-emoticon`, `src` starting `mxc://`, and `alt`/`title`/`height`/`width`.
- Strip scripts, event handlers, `style`, `class`, `id`, `javascript:`, ordinary images, headings, unknown tags.
- Strip `mx-reply` content entirely.
- Links only `http:`, `https:`, `matrix.to`; add `rel="noopener noreferrer"` and `target="_blank"` for external.
- Keep text when only a tag is dropped; if the sanitized fragment is empty, fall back to the plain body.
- Sanitize at render through one function. `innerHTML` only after sanitization.

## CSP

Static shell meta or host header:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self';
img-src 'self' blob: data:;
media-src 'self' blob:;
worker-src 'self';
object-src 'none';
base-uri 'none';
form-action 'self';
connect-src *
```

`connect-src *` is the documented exception because homeservers are user-supplied.

No inline script is allowed. The shell generator emits one external module script and the output audit rejects an inline script, so the policy needs no hash or nonce. A script injected by a browser extension or a tool is outside the app and stays blocked; an unknown hash is never allowlisted. The worker's CSP and the media service worker CSP are not governed by the document meta; verify in the spike. GitHub Pages cannot set headers, so the meta policy is the baseline.

## Local data

- The projection stores decrypted text and cached media for offline read/search.
- Device keys are in the same profile; a profile attacker could decrypt anyway.
- Search indexes are plaintext; notification previews can expose text.
- The UI makes both explicit: preview toggle, local-only notice, no remote search.
- Profile names/avatars and pack media are server-visible and not encrypted.
- No analytics, third-party requests, external fonts, or tracking.
- Logout clears local stores; a left room clears its local cache.

## Notifications

- Local only; no push gateway in v1.
- Permission is requested from a user gesture; denied/unsupported keeps in-app indicators.
- Preview toggle hides message content; default on with a privacy note.
- One notification per room, tagged by room; click focuses and opens.
- No own messages, edits, reactions, redactions, or membership changes.

## Supply chain

- `matrix-js-sdk` and DOMPurify are the only runtime dependencies; both are pinned in the lockfile.
- Vite/TS/ESLint/Prettier/Stylelint/Vitest/Playwright are dev/build.
- No external scripts, fonts, icons, or analytics.
- Check advisories and upgrade deliberately; a Worker/wasm SDK upgrade runs the worker spike.
- The app license is not claimed until chosen; dependency licenses are shown in About.

## Exceptions

| Exception | Reason |
| --- | --- |
| `connect-src *` | Homeservers are user-supplied |
| Media-only service worker | Authenticated video streaming; not a shell cache |
| No shell service worker | Cold offline start is out of v1 |
| Plaintext projection/search | Offline read/search; keys are in the same profile |
| Pack media unencrypted | MSC2545; warning in pack details |
| One device key gate | Matrix device model; no skip |
| No inline script, no hash or nonce | The app emits one external module; a foreign inline script must stay blocked |

## References

- AGENTS.md 0.6 E8, 12-14, 25-26, 31, 33.
- Matrix spec E2EE, MSC3916 authenticated media, MSC2545 image packs.
- matrix-js-sdk `src/rust-crypto/`, `src/crypto-api/index.ts`, `src/secret-storage.ts` at `14a114e`.
- MDN CSP, Notification, Web Locks; DOMPurify docs.
- See `references.md`.
