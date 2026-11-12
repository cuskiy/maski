# Decisions

`AGENTS.md` 0.6 is the authoritative register. This document records rationale and consequences. When a decision changes, update both.

## Settled

| ID | Decision | Rationale | Consequence |
| --- | --- | --- | --- |
| E1 | Projection store separate from SDK store | SDK store is an in-memory/eager cache, not a UI query layer; offline/search need stable records | Worker writes projection; main reads; rebuild path |
| E2 | Dedicated worker required | Keep sync/decrypt/projection off the main thread; token/keys off the UI thread; sync may run during the key gate, but the shell stays gated | Worker spike is a gate; no main-thread SDK/token; no SDK client in a service worker |
| E3 | Request/response + delta/ack | Correlated commands, idempotent deltas, bounded message queue | One adapter; revision/reload; 8-delta window |
| E4 | One AppStore with slices; one rAF; keyed timeline | Explicit state, no framework, bounded DOM | Slice modules; reference equality; 300/2000/50 window |
| E5 | Textarea + marks/tokens + preview | Native undo/IME/paste; no contenteditable/execCommand/EditContext | Custom history; preview; no WYSIWYG textarea |
| E6 | Static per-locale shells; boot; no-JS | Default English; localized first paint; explain JS requirement | Shell generator; `/zh-CN/`; language path; no meta redirect |
| E7 | One config + catalogs + tokens | Change deployment/content/style in one place | `config.ts`, i18n, CSS `:root`; no literals |
| E8 | Plaintext projection/search; worker secrets | Offline/search require plaintext; profile attacker has keys anyway | Security notice; preview toggle; no remote search |
| E9 | Vitest + Playwright + local homeserver | Units for logic; browser for E2EE/offline/visual | E2EE and no-JS are gates, not mocks |
| E10 | Reference checkouts, no copied code | Correct behavior without inheriting architecture | Cite paths/commits; adapt |
| E11 | Media-only service worker candidate | Authenticated video range requests need a same-origin proxy | Spike; blob fallback; not a shell cache |
| E12 | Fixed style/usage; no Appearance | User request; fewer settings; one visual language | No theme/membership/events/density/Enter toggles; images/videos are click-to-preview |
| U1 | Enter newline; send icon/Ctrl+Enter | No accidental sends on phone | Textarea behavior; `enterkeyhint=enter` |
| U2 | Mandatory key gate; three paths | Every login has a key; no silent unverified state | Gate blocks app; SAS wait; reset warning |
| U3 | Sessions list; kick one/all others | Security control for lost devices | UIA; current device stays; not remote wipe |
| U4 | Switchable language; English source/fallback | International open-source product | `/` en; `/zh-CN/`; catalogs; no runtime fetch |
| U5 | Minimal Settings | Fixed client, fewer decisions | Account/Notifications/Security/About only |
| U6 | Left More / middle text / right send, outside the input surface | One compact composer | More menu; transient format strip |
| U7 | Attachments/stickers/custom emoji in scope | Mainstream parity, especially packs | Media pipeline; pack picker; pack media warning |
| U8 | Comfortable settings | No squeeze on common screens | Single scroll, `--modal-max`, near-full narrow |
| U9 | Code organization before implementation | Avoid duplicated features | Tree, boundaries, dependency checks |
| U10 | Docs first; task brief; no code/tests during design | Correct engineering and review | Design docs completed; implementation followed review |
| U11 | Images and videos do not load until the preview is clicked | User request; avoid unrequested downloads | Click-to-preview; image viewer after load |
| U12 | Direct rooms use the peer avatar when the room has none | Private chats often have no room avatar | Peer member/profile fallback in the room list and header |
| U13 | Top-aligned avatars; one per sender group | User request | Left for others, right for own; pending rows add none |
| U14 | App fills the viewport | User request; app-like | 100% width and 100dvh; no outer margins |
| U15 | Composer focus uses the field border | Remove the extra inner rectangle | No `outline` on the textarea; `.composer-field:focus-within` |
| U16 | One shared action menu for right-click, long-press, and keyboard | One behavior at every width; no hover-only controls | `ActionMenu`; no desktop/mobile split |
| U17 | Sign-in is landing, then server, then the methods that server advertises | Servers differ; password, SSO, and CAS must not be guessed | Four auth steps; SSO buttons per identity provider; registration only when allowed |
| U18 | Room settings stay in the room header; the encryption state moves into that dialog | The header badge repeated what the dialog already says | Header keeps the avatar, name, topic, and the settings entry |
| E13 | A completed session renders from the local projection before the worker starts | Fast reload; no gate flash and no wait for the network | `lastSession` and `keyGate:<hash>` in the UI DB; background gate re-check |
| E14 | Layout breakpoint is a container query on `body` | Dialogs live outside the shell and must respond too | One `@container (width <= 44rem)`; no width media query |
| E15 | No inline script, no hash or nonce in the CSP | The app emits one external module; the audit rejects inline scripts | A foreign inline script stays blocked |
| E17 | Worker owns outbox delivery | Retry, ordering and cancellation need the client, which lives in the worker | `OutboxSender`; backoff; one in-flight per room |
| E18 | One rendered feedback region | `toast` and `error` were written and never shown | `Toaster`; internal state stays internal |
| E19 | Client commands wait for readiness | Fast load renders the shell before the worker is ready | `whenReady`; session commands bypass it |
| E20 | Outgoing content assembled once | The protocol shape was spread across the app | `matrix/compose.ts`; reply mentions; edit fallback; SDK redaction |

## Open

| ID | Decision | Current constraint |
| --- | --- | --- |
| O1 | Auto language redirect from `/` | V1 English + visible switch; if added, JS-only, no meta refresh, no redirect for explicit paths |
| O2 | Worker spike | Pass import/crypto/login/decrypt/key gate on three browsers; no main-thread fallback |
| O3 | Authenticated video | Media-only service worker or blob download; size/memory cap |
| O4 | Pack authoring/editing | Read/manage packs in v1; authoring later |
| O5 | Member kick/ban | Members/invite only in v1; moderation later |
| O6 | Encryption on existing rooms | Status only; encryption at creation; later |
| O7 | Password reset/account deactivation | Out of v1; server handles |
| O8 | Push gateway | Local-only notifications; closed page gets nothing |
| O9 | Project license | About does not claim one; dependency licenses shown |

## Exceptions

| Exception | Reason |
| --- | --- |
| `connect-src *` | User-supplied homeservers |
| Media-only service worker | Auth video; not shell cache |
| No shell service worker | Cold offline start out of v1 |
| Plaintext projection/search | Offline read/search; keys in same profile |
| Pack media unencrypted | MSC2545; warning |
| `execCommand` not used | Textarea model avoids it |
| One shell breakpoint | Home/room on narrow; recorded |
| App requires JS | Full-page noscript explains |
| No inline script allowance | An unknown or foreign script must stay blocked |
| No record validation at the IndexedDB boundary | Casts at that boundary are documented; validation is the next design task |
| `no-unsafe-type-assertion` off | SDK generic boundaries; record validation tracked in the roadmap |
| `no-await-in-loop` off | IndexedDB transactions and ordered sends are sequential by design |
| `promise/always-return` off | Explicit promise chains, no implicit returns |

## Superseded notes

- `AGENTS.md` 20-22 are earlier code-level notes. `docs/data.md`, `docs/worker.md`, `docs/ui.md` are current.
- `AGENTS.md` 20 `senderName` in events is dropped; members are the single source. Room last-event preview keeps sender ID.
- The earlier "media upload later" is superseded; media upload is in scope.
- The earlier "SAS v1.1" is superseded; SAS is in the key gate and sessions/user verification.
- The earlier "main-thread worker fallback" is removed; the worker is required and keys stay off the main thread.
- The earlier "zh-CN default" is superseded; English is the source and fallback.

## Change protocol

1. Add or change a row here and in `AGENTS.md` 0.6.
2. Update the domain doc and the thematic AGENTS section.
3. Update tests/acceptance criteria.
4. Do not add a parallel implementation; extend the boundary.

## References

- AGENTS.md 0.5-0.7, 17, 20-33.
- `docs/architecture.md`, `code-organization.md`, `state.md`, `worker.md`.
- Matrix spec/MSC sources; MDN; reference code paths in `references.md`.
