# maski engineering design

Status: implementation. `src/` is the app; `test/` holds unit tests. The design set is current; `npm run check` passes. The worker command dispatcher is currently `src/matrix/runtime.ts`; the tree in `code-organization.md` is the target split.

`AGENTS.md` is the project brief and the user-facing design. This directory is the engineering design: how the code is organized, what owns each piece of state, and how the pieces connect. If a rule here conflicts with `AGENTS.md`, `AGENTS.md` wins. The earlier code-level notes in `AGENTS.md` sections 20-22 are superseded by these documents.

## Index

| Document | Covers |
| --- | --- |
| `architecture.md` | System context, processes, layers, data flow, failure states |
| `code-organization.md` | File tree, module boundaries, dependency direction, duplication guards |
| `state.md` | State ownership, AppStore slices, URL state, persistence, concurrency |
| `config.md` | The single configuration surface and content/code separation |
| `data.md` | Projection schema, indexes, normalization, migrations, search, outbox |
| `worker.md` | Main/worker protocol, auth, sync, rooms, devices, recovery, media |
| `ui.md` | Render model, keyed timeline, scroll, room list, composer, dialogs, media |
| `i18n.md` | Catalogs, locale paths, static shells, boot, no-JS, language switching |
| `security.md` | Threat model, E2EE, sessions, media, sanitizer, CSP, privacy |
| `build.md` | Vite build, static shells, hashes, GitHub Pages, output audit |
| `testing.md` | Unit, browser, E2EE, offline, visual, test homeserver, CI |
| `roadmap.md` | Phases, gates, v1 scope, risks |
| `decisions.md` | Resolved decisions, open decisions, exceptions |
| `references.md` | Sources and reference code with commits and dates |

## Principles

- One source of truth per concern. A fact is stored once and derived everywhere else.
- The main thread reads local data. The worker owns network, sync, crypto, and profile/room writes.
- Content, configuration, design tokens, and code stay separate.
- Platform APIs before dependencies. No UI framework, no state library, no router library.
- A feature is added by extending an existing boundary, not by adding a parallel implementation.
- Every non-obvious claim is checked against the Matrix spec, the SDK source, a maintained client, or MDN. See `references.md`.

## How to use this set

1. Read `architecture.md`, `code-organization.md`, and `state.md` before writing code.
2. Read the document for the area being changed. Keep the change inside that area's boundary.
3. When a decision changes, update the document, `AGENTS.md` if it is a user-facing rule, and `decisions.md`.
4. Do not copy code from a reference client. Reference behavior and protocol details only.
5. Keep `blog/` untouched. It is a separate reference project.

## Verification status

- Implemented and locally verified: worker/SDK/rust wasm on Chromium, registration, recovery, encrypted text/image, backup restore, no-JS shells, and a local Synapse.
- Still planned or unverified: Firefox/Safari, SSO, notifications, two-device SAS, offline reload, GitHub Pages subpath, video/audio.
- Reference commits: matrix-js-sdk `14a114e` (45.1.0), Cinny `474400c` (4.12.8).
- Sources checked 2026-11-11.

## Non-goals

- Server rendering, a backend, server-side search, push gateway, calls, spaces, threads, multi-account, native shells, and cold offline start are out of v1.
- A design-system package shared with the blog. The blog is a visual reference, not a dependency.
