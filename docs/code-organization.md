# Code organization

Thirty files, each with one reason to change. The count matters: the previous
implementation spread the same behaviour over forty-four, and the duplication that grew
between them was the main source of defects.

```
src/
  core/
    types.ts        every record the two threads share
    schema.ts       database names, versions, stores, indexes, upgrade
    guard.ts        isRecord, asString, asNumber, asArray, pick
    text.ts         escapeText, used by the composer and the worker
    id.ts           account hash, media cache key
  protocol/
    messages.ts     Command, Event, Reply and the reply payloads
  worker/
    worker.ts       message dispatch, error mapping
    api.ts          the dispatcher: lifecycle, gate, sending, reads
    rooms.ts        join, create, direct, tags, mute, profile, room state
    media.ts        authenticated fetch, decrypt, encrypt-then-upload
    verify.ts       one SAS verification and the device list
    db.ts           the account database, worker side
    normalize.ts    MatrixEvent -> record, the only normalizer
    project.ts      the sync pass and pack discovery
  client/
    worker-client.ts request ids, transfer lists, event fan-out
  store/
    state.ts        AppState, subscribe, one animation frame per change
    select.ts       room sections, timeline items, previews
    db.ts           the account database, main side, and the UI database
  ui/
    dom.ts          el, keyed, icons
    context.ts      the interface the shell talks to
    shell.ts        navigation, header, invite panel, composition
    timeline.ts     keyed rows, day separators, scroll anchoring
    marks.ts        the mark model: toggle, serialize, segments, offset
    composer.ts     the field, in-place rendering, attachments, sending
    picker.ts       emoji and sticker panel
    media.ts        object URLs, avatars, pictures, viewer
    dialogs.ts      one dialog host and every dialog
    screens.ts      auth and the key gate
    overlay.ts      menu, toast, copy
    sanitize.ts     the one HTML path
  i18n/             en.ts, zh-CN.ts, index.ts
  styles/style.css  tokens and every rule
  app/
    config.ts       identity, limits, locales, links
    app.ts          composition root, worker events, actions
    main.ts         entry
```

## Boundaries

| Area | Owns | Must not |
| --- | --- | --- |
| `core` | shared records and pure helpers | import anything, touch the DOM |
| `protocol` | the wire shape | import the SDK or the store |
| `worker` | SDK, sync, crypto, projection writes, media | touch the DOM or the UI store |
| `client` | request correlation | know about the SDK |
| `store` | state, selectors, main-side reads and the queue | import the SDK or the worker runtime |
| `ui` | DOM | write projection rows, fetch Matrix |
| `i18n` | copy and formatters | import the store or the UI |
| `app` | wiring | contain a second implementation of anything above |

## Single implementations

A feature reuses these; it does not grow its own.

| Concern | Implementation |
| --- | --- |
| Worker transport | `client/worker-client.ts` |
| Sync, send, crypto | `worker/api.ts` |
| Event to record | `worker/normalize.ts` |
| Projection writes | `worker/project.ts` |
| Main-side reads, queue writes | `store/db.ts` |
| Derived view data | `store/select.ts` |
| DOM construction and keyed lists | `ui/dom.ts` |
| Message rows | `ui/timeline.ts` |
| Mark model and serialization | `ui/marks.ts` |
| Draft lifecycle | `ui/composer.ts` |
| Media fetch, cache and elements | `ui/media.ts`, `worker/api.ts` |
| Dialog lifecycle | `ui/dialogs.ts` |
| HTML sanitizing | `ui/sanitize.ts` |
| Catalogs and formatters | `i18n/index.ts` |
| Design values | `styles/style.css` `:root` |
| Build audit | `scripts/verify.ts`, `scripts/audit.ts` |

## Shape rules

- A module with no state is a set of functions. A class is used where there is a
  lifecycle: the worker API, the database, the media cache, the composer, the shell.
- No default exports. Named exports only, so a rename is a compiler error everywhere.
- No barrel that re-exports a directory.
- A file approaching several hundred lines is split by responsibility. `api.ts` is the
  largest because it is one dispatcher; its sections are the commands.
- Public types live in `core/types.ts`; a view never declares its own copy.
