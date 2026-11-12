# maski

A Matrix client that keeps the interface on local data: the worker owns the protocol,
the main thread reads a projection and renders plain DOM.

## 0. Rules

These come from the user and outrank everything below.

1. Discuss the approach before writing code. Read the current Matrix specification, the
   `matrix-js-sdk` source and the reference checkouts in `git/` before choosing an API.
   Do not present an unchecked API as settled.
2. The stack is Vite and TypeScript. No UI framework, component library, CSS framework,
   state library, router library, i18n library or date library. `matrix-js-sdk` owns the
   protocol, sync and crypto. DOMPurify is the only other runtime dependency.
3. Code, identifiers, comments and commit messages are English. A comment states one fact
   the code cannot: a protocol quirk, a security boundary, a browser behaviour, an
   invariant. No banner comments, no commented-out code, no JSDoc that repeats a signature.
4. No non-ASCII in code. User-facing copy lives in `src/i18n/`, never in a view.
5. The HTML files carry no CSS and no JavaScript beyond one external module script.
6. All design values come from the token ladder in `:root`. No literal colour, size,
   radius or duration in a rule. No `!important`, no vendor prefix, no `outline: none`.
7. A feature is added by extending an existing boundary. A second implementation of a
   concern that already has one is a defect, even when it works.
8. Nothing is a placeholder: every control does what it says, and a missing feature is
   absent from the interface rather than present and dead.
9. A check that did not run is not a check that passed. Report what was verified and what
   was not.

## 1. Shape

```
src/
  core/        types, ids, IndexedDB schema, guards, text escaping
  protocol/    the command and event unions between the threads
  worker/      SDK, sync, crypto, projection, media, delivery
  client/      the main-thread worker adapter
  store/       application state, selectors, local database reads
  ui/          DOM helpers, views, composer, picker, dialogs, screens
  i18n/        catalogs and formatters
  styles/      one stylesheet
  app/         configuration, composition root
scripts/       the output audit
test/          unit tests and the browser flow
```

The dependency direction is one way: `app -> ui -> store -> core`, and
`worker -> core`, `protocol`. The UI never imports `matrix-js-sdk`; the worker never
touches the DOM or the UI store. `docs/code-organization.md` lists the boundaries that
matter and why.

## 2. Ownership

| Fact | Owner | Readers |
| --- | --- | --- |
| Route, open room, open dialog | URL hash | app, shell |
| Client, sync, crypto, tokens | worker | worker |
| Rooms, messages, members, packs, media | account database, written by the worker | store |
| Queued message | account database, written by the main thread, replaced by the worker on echo | both |
| Drafts, settings, last account | `maski-ui` database, main thread | main thread |
| Render state | `state` in `store/state.ts` | UI |
| Object URLs | `ui/media.ts` | UI |

One writer per store. The one shared store is `events`: the main thread writes a queued
row keyed by its transaction id, and the worker deletes that key when the remote echo
arrives. The two never write the same row, and the queue is written before the command
is sent, so the delete can never miss.

## 3. What is settled

| ID | Decision |
| --- | --- |
| U1 | Enter inserts a newline; only the send button or Ctrl/Cmd+Enter sends. |
| U2 | A key is required before the shell is interactive: unlock with a recovery key or passphrase, or start over. |
| U3 | One account. The interface language is switchable, English is the source catalog and the fallback. |
| U4 | Settings stay minimal: Account, Notifications, Security, About. No theme or density switch. |
| U5 | Composer: attachment, field with an emoji control, send. With an empty field the third control offers stickers. |
| U6 | Styled text renders in place when the field is not focused; clicking it returns to editing at that character. |
| U7 | Right-click and long-press open the same action menu. No hover-only control, no desktop and mobile split. |
| U8 | Images and stickers carry no bubble; their time is a chip on the picture. |
| U9 | The navigation is the home screen on a narrow window; a room is the next screen with a back control. |
| U10 | Dialogs are URL state (`?d=`) over the hash route, one at a time, native `<dialog>`. |
| E1 | The projection is the interface's only source. The SDK store and the crypto store stay separate and are never read by the main thread. |
| E2 | A queued message is an ordinary message record with a status; there is no second pending model. |
| E3 | Relations are read from the room aggregate, not replayed from a relation store. |
| E4 | One projection pass per sync covers the rooms the sync touched, keyed by a per-room cursor plus the last rows, so an edit, a reaction or a redaction applies without a new timeline event. |
| E5 | Search runs in the worker against the database index. |
| E6 | Media is fetched with the access token in the worker, decrypted there, and cached in the account database. |
| E7 | The output audit fails a build with inline script, inline style, `!important`, a vendor prefix or the SDK in the main bundle. |

## 4. Known gaps

Absent on purpose, so they are not dead controls: threads, spaces, calls, push gateway,
SSO, password reset, moderation, pack authoring, multi-account, device verification by
SAS, and notifications for a closed page. `docs/roadmap.md` orders the work that is next.

## 5. Verifying

```
npm run code     # tsc --noEmit
npm run lint     # Oxlint type-aware, then Stylelint
npm test         # Vitest
npm run build    # code check, then Vite
npm run verify   # output audit
npm run check    # all of the above
```

`test/browser/flow.mjs` drives a real server; it needs the dev server and a homeserver
reachable from the browser. Read `docs/testing.md` before running it.

## 6. Working notes

Facts that took a second pass to get right, recorded so the next change does not reopen
them.

**One activation path.** Login, a restored session and the end of the key gate all end in
`App.applySession`. It opens the account database, reads the rooms, asks for the key status,
decides the phase and mounts. A second path that mounted the shell itself is how the last
version ended up with a screen that never left the gate.

**Two writers, disjoint keys.** The main thread writes a queued message under its
transaction id; the worker deletes that key when the echo lands. The queue row is written
before the command is dispatched, so the delete cannot arrive first. Nothing else is
written by two threads.

**Only the first projection writes a row.** A projection pass writes records, never clears
them: the SDK window holds the last pages, and a clear would delete history that a rebuild
cannot recreate. A room disappears only when the user leaves it.

**A keyed row is updated in place.** `keyed` calls `update`, and the timeline's `update`
rebuilds the row's children while keeping the node. Without it an edit, a reaction or a
status change would leave the old row on screen, which is the defect the previous
implementation shipped.

**The composer is not store state.** A keystroke writes a debounced draft and nothing else.
`setState` schedules a frame; putting the text there would repaint the navigation, the
header and the timeline on every character.

**The gate has codes, not one message.** `no-keys`, `invalid`, `restore`, `uia`. A vague
"the key does not work" hides a missing secret storage from the user and from us.

**Copy is checked.** `scripts/audit.ts` fails on a key the interface does not use, a `t()`
call whose key does not exist, an interface file that imports the SDK or the worker, and a
worker file that imports the interface. Dead copy and a broken boundary are build failures,
not code review notes.
