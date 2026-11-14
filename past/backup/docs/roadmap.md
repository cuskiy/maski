# Roadmap

The implementation is in progress. The phases below are the order and gates, not dates.

Current: Phase 0 passed on Chromium; Phase 1 and the core of Phases 2-3 are implemented and locally exercised. The unverified items in `testing.md` remain gates.

## Phase 0 — spikes

Do not build the app until these are answered.

| Spike | Pass condition |
| --- | --- |
| Vite worker + SDK | A module worker imports matrix-js-sdk, logs in, syncs, and decrypts a message with rust crypto wasm |
| Worker CSP/wasm | The built worker loads wasm under the chosen CSP on Chrome/Firefox/Safari |
| Projection | A sync delta writes rooms/events/members and the main reads a consistent window |
| Static shells | `/` and `/zh-CN/` build, no-JS shows the overlay, hashed assets resolve under a subpath |
| Media | Authenticated image fetch/decrypt works; video proxy or blob fallback decided |
| Local homeserver | Synapse/Continuwuity runs as a user process with two accounts and a key backup |

The worker spike is a gate. If it fails, stop and revisit the architecture; do not move the SDK or keys to the main thread.

## Phase 1 — shell, auth, key gate

- Static shell generator, locale paths, boot, no-JS, manifest, base path, output audit.
- Worker client, session store, auth page, discovery, password/SSO/register.
- Key gate: recovery, wait/SAS, reset; recovery key display; UIA.
- AppStore/session slice, router, dialogs, settings shell.
- Gate: a new account and an existing account reach the app; no skip; reload restores.

## Phase 2 — rooms and timeline

- Sync/projection, room list sections, invites, unread/mute/tag.
- Room header, timeline grouping, pagination, scroll anchor, read marker, typing.
- Composer text/marks/tokens/preview/history; send/outbox; Enter newline.
- Room settings general/members/invite/notifications/leave; join/create/DM.
- Gate: send/receive/edit/redact/react/reply; offline queue; reload.

## Phase 3 — media, packs, search, notifications, settings

- Attachments, thumbnails, encrypted media, video/audio/file viewers.
- Image/sticker packs, custom emoji, picker, pack management.
- Local search index, dialog, jump.
- Notifications permission/preview/modes/click.
- Settings Account/Notifications/Security/About, profile edit, user SAS, sessions.
- Gate: all v1 scope flows; E2EE media; no-JS/locales.

## Phase 4 — hardening

- Performance: timeline window, memory, media cache, long tasks.
- Accessibility: keyboard, focus, screen reader, contrast, reduced motion.
- Security: sanitizer fuzz, CSP, token/key review, logout, device sessions.
- Build: GitHub Pages subpath, 404, audit, deterministic output.
- Documentation: update docs/decisions and AGENTS 0.6; version/About/license decision.
- Gate: full check + E2EE + offline + visual + subpath.

## V1 scope

Auth (password, SSO, registration with dummy/terms/token), mandatory key gate (recovery/wait/reset), rooms/DMs/invites, timeline/composer, edits/redactions/replies/reactions, attachments/images/video/audio/files, stickers/custom emoji/packs, local search, local notifications, settings/profile/about, sessions/kick, language shells, offline after load, outbox retry with backoff, second-tab read-only.

Next structural work, in order:

1. Split the UI layer into the view modules `docs/code-organization.md` names: auth, key gate, shell, picker, dialogs. `App` is still the orchestrator plus every view, and its string render keys stand in for missing view boundaries.
2. Validate records read from IndexedDB instead of casting them, and drop the remaining boundary casts.
3. Keyed room rows with in-place updates, so a focused row survives a delta.
4. Reaction counts per sender, withdrawing a reaction, and own-reaction detection: a chip sent from this device renders with `aria-pressed` false, so `me` is not resolved and the chip cannot toggle off. The annotation relation keeps its sender, the fix is to fold sender ids into the summary and resolve ownership where the session id is known.

## Out of scope

Calls, spaces, threads, polls, room directory, moderation kick/ban, enabling encryption on existing rooms, pack authoring, password reset, account deactivation, multi-account, push gateway, cold offline shell, message edit history, custom notifications/sounds, theme/media/density/Enter toggles.

## Risks

| Risk | Mitigation |
| --- | --- |
| SDK in a worker is undocumented | Phase 0 spike; pin SDK; no main-thread fallback; stop and revisit if it fails |
| Rust crypto wasm + CSP | Spike all three browsers; serve wasm hashed; verify |
| E2EE key gate UX is hard | Test every path; no skip; visible errors; recovery key drill |
| Authenticated video | Media proxy spike; blob fallback; size cap |
| Local homeserver for E2EE | Nix user process; seed fixtures; do not fake pass |
| IndexedDB eviction | Request persistent storage; rebuild from SDK; outbox warning |
| Pack compatibility | Stable + legacy read; write both for global enable; test |
| Scope creep | Out-of-scope list; AGENTS 0.6; phases |
| Duplicate paths | Code organization + dependency checks; one adapter/store/pipeline |

## Definition of done

A flow is done when it runs in a browser against a real homeserver, has unit/browser coverage, works offline where specified, has visible failure states, passes the output audit, and the docs are updated.

## References

- AGENTS.md 0.6, 0.7, 26-33.
- `docs/testing.md`, `docs/build.md`, `docs/security.md`.
- Phase 0 references: Vite Workers, SDK README, rust crypto wasm examples; see `references.md`.
