# Testing

Unit tests exist in `test/`; browser checks were run manually against a local Synapse. The rest is the verification plan.

## Gates

| Gate | Must pass |
| --- | --- |
| Unit | Store slices, selectors, normalizer, keyed list, composer model, i18n, protocol guards, search tokens, shell generator |
| Browser | Auth, key gate, sync, rooms, timeline, send/outbox, media, stickers, search, notifications, settings, sessions, profile, no-JS, locales |
| E2EE | Recovery, reset, wait/SAS, backup restore, encrypted media, device verification |
| Offline | After a loaded page: room list, timeline, search, settings, queued send, retry |
| Visual | Overflow, overlap, contrast, focus, narrow/wide, both schemes, reduced motion |
| Build | Output audit and GitHub Pages subpath |
| Performance | Main-thread long tasks, timeline window, memory, media cache |

## Lint and types

`npm run code` is `tsc --noEmit` with the strict options in `tsconfig.json`. `npm run lint` is:

```
oxlint --type-aware --deny-warnings --import-plugin --promise-plugin src scripts test
stylelint "src/**/*.css" --max-warnings=0
```

Oxlint enables the `correctness`, `suspicious` and `perf` categories, the import, promise, unicorn, typescript and oxc plugins, and type-aware rules through `oxlint-tsgolint`. Warnings fail the run, so a rule is either satisfied or turned off in `.oxlintrc.json` with a reason.

Off, with reasons:

| Rule | Reason |
| --- | --- |
| `promise/always-return` | The project writes explicit chains; a bare `.then` is intentional |
| `eslint/no-await-in-loop` | IndexedDB transactions and ordered sends are sequential by design |
| `typescript/no-unsafe-enum-comparison` | TypeScript string enums compared with the SDK's plain string event types |
| `typescript/no-unsafe-type-assertion` | SDK generic boundaries; record validation is the next design task |
| `typescript/no-unnecessary-type-parameters` | Two IndexedDB helpers keep a type parameter for call-site inference |
| `unicorn/require-post-message-target-origin` | Worker and MessagePort posts have no target origin |

## Unit

- Store slices: apply delta, outbox merge, room sort, read/unread, draft/scroll, key-gate transitions.
- Selectors: display items, grouping flags, room sections, search rows.
- Normalizer: every event kind, edit/redaction/reaction, decryption failure, sticker, pack, membership.
- Keyed list: create/update/move/remove; focus/selection preserved; ref cleanup.
- Composer: marks, emoji tokens, insertion/deletion, undo/redo, IME snapshot, serialization to body/formatted_body.
- i18n: key coverage, fallback, plural/date/number, locale switch, static shell strings.
- Protocol guards: malformed commands/events, ids, errors, ack/coalesce.
- Search: NFKC, diacritics, CJK segmentation, token intersection, edit/redaction updates.
- Shell generator: locale paths, lang/title, alternates, boot, noscript, no inline.
- Config: locale list vs catalogs, route/dialog keys, limits.

Use Vitest. Tests assert behavior and structure, not private implementation.

## Browser

Playwright, against a local homeserver.

### Auth and key gate

- Discover a domain and a URL; bad server.
- Password login; wrong password; rate limit; SSO (mock or test IdP).
- Registration: dummy, terms, token; disabled; unsupported captcha/email/msisdn message.
- Session restore; soft logout; explicit logout warning.
- Stored session: completed gate goes to the shell; incomplete gate stays on the gate; no auth or cached-message flash.
- New-account key creation; recovery key display; saved confirmation.
- Existing key: recovery, wrong key, no backup.
- Wait for another device: SAS on both sides; cancel; timeout.
- Sync during the gate: device lists and SAS are available while the shell is not interactive.
- Reset key warning; new key; old history unavailable.
- Gate cannot be skipped; app is not interactive before completion.
- Language switch before and after login; `/` and `/zh-CN/`.

### Rooms and timeline

- Room list sections, collapse memory, order, unread/mention/mute, active state.
- Invite accept/decline; join; create public/private/encrypted; DM create/reuse.
- Timeline grouping, media/sticker/membership/state/redaction/decryption failure rows.
- Reply/jump, edit, redact, react; permission cases.
- Typing, read receipt, new-message pill, load older, scroll anchor, room switch.
- Room settings general/members/invite/notifications/encryption status/leave.
- Tombstone banner; composer disabled.

### Composer and media

- Enter newline; Ctrl/Cmd+Enter send; send icon; IME composition Enter does not send.
- Empty/whitespace disabled; attachment-only enabled.
- Marks, custom emoji tokens, preview, undo/redo, paste plain text.
- Attach multiple files; progress/cancel/retry; offline queue; image/video/audio/file rendering.
- Encrypted attachment send/receive; thumbnail/poster; authenticated media; media error.
- Stickers: pack tabs, search, recent/favorites, click send, reply target, editing disabled.
- Custom emoji insert, preview, send, fallback; incoming custom emoji.
- Pack management: enable global, remove, legacy pack read, unencrypted warning.

### Search, notifications, settings, sessions

- Search local/offline; room filter; results; jump; 50 cap; no results; broken index.
- Notification permission denied/unsupported; preview toggle; hidden/unfocused only; own/edit/reaction excluded; click opens room.
- Settings sections; profile edit name/avatar; About links; logout.
- Sessions list; verify; sign out one; sign out all; UIA; current device stays; data-remains wording.
- User profile: Message, Verify SAS, Copy MXID, identity changed.
- Language switch; reload; deep link.

### Static and no-JS

- `index.html` and `/zh-CN/index.html` have correct lang/title/description/canonical/alternates.
- With JS disabled: full-page noscript, one h1, explanation, language link; no app.
- Boot remains if the app fails to mount.
- No inline CSS/JS; external assets; base subpath.

## E2EE

Use two browser contexts and a local homeserver.

- New account: create secret storage/cross-signing/backup; show key once.
- Second device: recovery key restores history and verifies; wrong key.
- Wait path: request from new device, accept on existing, SAS emoji match on both, confirm; keys/backup sync.
- Reset: warning, new keys, old history unavailable, contacts see change.
- Key backup: no backup, create, restore, mismatch.
- Encrypted room: send/receive text, edit, reaction, redaction, attachment, sticker.
- Device list: verify, sign out one, bulk sign out, UIA; kicked device loses session.
- Key gate cannot be bypassed; reload returns to gate if incomplete.

## Offline and failure

- Cold offline start is out of v1: no shell service worker. A reload while offline is not a gate; if the browser cache serves the shell, it may work, but do not rely on it.
- Load online, go offline: room list/timeline/search/settings from local.
- Send text and attachments offline; outbox markers; reconnect; retry; duplicate txnId.
- Worker crash/restart; projection re-read; degraded state; outbox survives.
- Worker cannot start: fatal/degraded with reload; no main-thread SDK fallback.
- Second tab read-only; lock; refresh after close.
- Media error, sync error, invalid event, missing field: visible errors, no blank.

## Visual and accessibility

- Widths: 320, 480, 768, 1024, 1440, 1920; 200% zoom.
- Long CJK/English words, URLs, code blocks, media; no overflow/overlap.
- Light/dark; contrast; focus ring; keyboard only; screen-reader names.
- Reduced motion: no transitions, animated stickers static.
- Dialog focus/Escape/backdrop; no stacked dialogs; scroll lock.
- Touch targets >= 24px; text selectable.

Measure computed styles/sizes; do not eyeball. Use Playwright assertions for `scrollWidth <= clientWidth`, overlap, focus, and visible h1.

## Local homeserver

Plan, not verified in the sandbox:

- Run Synapse or Continuwuity as a user process from a Nix dev shell; no systemd/root.
- Seed two accounts, a DM, a public/private encrypted room, an image pack, a sticker pack, and an invited account.
- Enable registration and a test IdP for SSO; disable captcha.
- Use two browser contexts for E2EE/SAS.
- Reset data between suites; never point tests at a public homeserver.

If a local server is not feasible, the E2EE gates are not considered passed.

## CI

- `npm run check` on every change.
- Playwright desktop and mobile-sized viewports; both color schemes; reduced motion.
- A separate E2EE job with the local homeserver.
- The output audit and no-JS/locale checks run before deploy.
- Failures report the viewport, locale, scheme, room, and step.

## Reporting

State what was tested and what was not. A skipped E2EE, offline, or no-JS check is not a pass.

## References

- Vitest and Playwright docs; Matrix spec client-server/E2EE; AGENTS.md 0.6 E9, 14-15, 22-33.
- Cinny `RoomTimeline.tsx` and device verification tests as behavior references; not copied.
- See `references.md`.
