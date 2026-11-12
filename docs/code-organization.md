# Code organization

The tree is fixed before implementation. A new feature extends one of these boundaries; it does not add a parallel path.

## Tree

```
/
  index.html                  generated English shell
  zh-CN/index.html            generated Chinese shell
  404.html                    generated history fallback when enabled
  public/                     favicon, icons, static non-code assets
  src/
    app/
      main.ts                 composition root; imports CSS; starts app
      app.ts                  lifecycle, mounts shell/router/store/worker client
      config.ts               the only configuration surface
    protocol/
      index.ts                public message/event types
      messages.ts             command/event shapes
      guards.ts               runtime guards for postMessage
    data/
      index.ts                public record types
      records.ts              projection and outbox records
      schema.ts               DB names, versions, store/index constants
      ids.ts                  account hash, media keys, pack addresses
    matrix/
      worker.ts               worker entry; SDK, sync, crypto, projection
      client.ts               main-thread adapter; protocol only, no SDK
      session.ts              worker session store
      sync.ts                 sync lifecycle and batching
      normalize.ts            Matrix event -> records; the only normalizer
      projection.ts           projection reader/writer; worker-only
      rooms.ts                join/create/invite/state/tag/notification/DM
      devices.ts              device list, delete, SAS verification
      profile.ts              profile get/set/avatar
      recovery.ts             secret storage and key backup
      media.ts                authenticated fetch/decrypt/cache
    store/
      app-store.ts            root store composition and subscriptions
      session.ts              auth, connection, key-gate state
      rooms.ts                room list snapshot
      timeline.ts             active timeline, outbox merge, display window
      packs.ts                pack list, recent/favorites, enabled state
      security.ts             devices, verification, recovery status
      profile.ts              profile cards
      ui.ts                   locale, dialogs, drafts, scroll, search state
      selectors.ts            derived room list/timeline/display items
      db.ts                   main-side reads and UI/outbox writes
    ui/
      dom.ts                  element/text/attribute helpers
      render.ts               one rAF scheduler, region dispatch
      keyed-list.ts           keyed DOM list
      scroll.ts               anchor, window, stick-to-bottom
      router.ts               locale-aware hash/history router
      dialogs.ts              one native dialog at a time
      media-cache.ts          object URLs and ref counts
      notifications.ts        permission, preview, OS policy
      views/
        shell.ts              nav/content/header composition
        room-list.ts
        room.ts
        timeline.ts
        composer.ts
        composer-editor.ts    text/marks/emoji tokens/history/preview
        picker.ts             emoji and sticker panel
        attachments.ts        tray, upload/queue UI
        auth.ts
        key-gate.ts
        search.ts
        join.ts                join by ID/alias
        create.ts              create room
        new-message.ts         start DM
        settings.ts
        room-settings.ts       general/members/invite/notifications/encryption/leave
        profile.ts
        about.ts
        media.ts              image/video/audio/file rows and viewer
    i18n/
      index.ts                t(), locale resolution, formatters
      en.ts                   source catalog
      zh-CN.ts                translation
    styles/
      style.css               tokens in :root and all rules
  scripts/
    dev.ts                    dev server/watch
    build.ts                  Vite build, hashes, assets
    shells.ts                 static shell, boot, noscript, manifest
    verify.ts                 output audit
  docs/                       engineering design
  git/                        read-only reference checkouts
  blog/                       visual reference only
```

## Responsibilities

| Area | Owns | Must not |
| --- | --- | --- |
| `app/config.ts` | app identity, homeserver, locales, routes, dialogs, limits, links, build flags | UI copy, colors, Matrix event types |
| `protocol` | worker message/event shapes, guards | SDK imports, DOM, storage |
| `data` | record types, DB/schema constants, IDs | SDK imports, DOM, fetch |
| `matrix/client.ts` | request/response correlation, worker lifecycle, acks | SDK imports, DOM, store |
| `matrix/worker` | SDK, sync, crypto, normalization, projection writes, media | DOM, AppStore, UI DB |
| `store` | AppStore, slice mutations, selectors, main DB reads, outbox/UI writes | SDK, worker runtime, DOM |
| `ui` | DOM, views, keyed lists, scroll, dialogs, router, composer, pickers | SDK, direct Matrix HTTP, projection writes |
| `i18n` | catalogs, lookup, interpolation, locale/format helpers | UI or store imports |
| `styles` | tokens and rules | inline styles, JS colors |
| `scripts` | build-time shell generation, hashing, audit | runtime app imports |

## Dependency direction

```
app -> ui, store, matrix/client, i18n, styles
ui -> store, protocol, data (types), i18n, app/config
store -> data, protocol, app/config
matrix/client -> protocol
matrix/worker -> protocol, data, app/config, matrix-js-sdk
i18n -> app/config
data -> none
protocol -> data (types only, if needed)
scripts -> app/config, i18n, shell template
```

Rules:

- No UI or store file imports `matrix-js-sdk`.
- No worker file imports `ui` or `store`.
- No file constructs or imports `matrix/worker` except `matrix/client.ts` via `new Worker(new URL(...))`; `app` owns the adapter.
- No file imports `matrix/client` except `app`.
- No store file imports `ui`.
- No i18n file imports store/UI.
- No data/protocol file imports runtime modules.
- No cross-feature deep import; import the folder's `index.ts` or the documented module entry.
- No `utils/`, `helpers/`, `common/`, or `services/` dumping grounds.
- No barrel that re-exports the world; each public entry is intentional.

Enforce with ESLint `no-restricted-imports` per path group and a dependency test that scans imports. A violation fails the code check.

## State ownership

| Fact | Owner | Readers |
| --- | --- | --- |
| Route, locale path, dialog, search query | URL + router | UI, store |
| SDK/client/sync/crypto | worker | worker only |
| Projection rooms/events/members/relations/packs/media/meta | account DB, worker writes | store/main reads |
| Outbox, drafts, scroll, local settings | main, main writes | store/UI, worker reads outbox |
| Render snapshot | AppStore | UI |
| Object URLs | media cache | UI |
| Notifications | OS + main | none |
| Static shell copy | catalogs at build time | shell generator |

No fact is stored twice. Derived data lives in selectors, not in a second record.

## Content and code separation

- UI copy: `src/i18n/en.ts` and `zh-CN.ts`; components call `t(key, params)`. No literal user-facing string in a view.
- Static shell copy: the shell generator reads the same catalogs.
- App identity, homeserver, locales, routes, dialogs, limits, links: `src/app/config.ts`.
- Colors, type steps, spacing, radii, durations, sizes: `src/styles/style.css` `:root`.
- Matrix event types, command names, store names, DB versions: `src/data` and `src/protocol`.
- Content from Matrix events lives in the projection; it is not hardcoded in views.
- No HTML with copy in TS except the shell template; the shell template reads catalog keys.

To customize a deployment, change `src/app/config.ts`, the matching catalog, and the CSS tokens. No view or worker edit is required for name, homeserver, locales, links, limits, or colors.

## Duplication guards

These are single implementations. A new feature must reuse them:

| Concern | Single implementation |
| --- | --- |
| Worker transport | `matrix/client.ts` |
| Sync/send/crypto | `matrix/worker` with SDK |
| Event normalization | `matrix/normalize.ts` |
| Projection writes | `matrix/projection.ts` |
| Main DB reads | `store/db.ts` |
| Outbox | `store/timeline.ts` + outbox records |
| App state | `store/app-store.ts` + slices |
| Derived view data | `store/selectors.ts` |
| DOM construction | `ui/dom.ts` |
| Keyed list | `ui/keyed-list.ts` |
| Scroll/anchoring | `ui/scroll.ts` |
| Dialog lifecycle | `ui/dialogs.ts` |
| Routing | `ui/router.ts` |
| Composer model/history/serialization | `ui/views/composer-editor.ts` |
| Emoji/sticker picker | `ui/views/picker.ts` |
| Media fetch/cache | `matrix/media.ts` + `ui/media-cache.ts` |
| Sanitizer/render HTML | `security` boundary, one function |
| i18n/format | `i18n/index.ts` |
| Room/message/search rows | shared row builders, not copies |
| Pack resolution | `store/packs.ts` / worker projection, one resolver |
| Notification policy | `ui/notifications.ts`, one policy |
| Device/session actions | `matrix/devices.ts`, one command path |
| Profile actions | `matrix/profile.ts`, one command path |

A second implementation is a defect even if it works.

## File shape

- One reason to change per file. A file that mixes transport, state, and DOM is wrong.
- View files may build DOM; they do not fetch, decrypt, normalize, or write DB.
- Store slice files are pure data transitions; no DOM.
- Worker modules may call the SDK; no DOM.
- Prefer functions to classes when there is no lifecycle. The worker client, media cache, and store root may be classes or closures with explicit lifecycle.
- Keep public types in `data`/`protocol`; do not duplicate them in views.
- No default exports; named exports only.
- File names are lower-case, hyphenated, domain-specific.
- A file approaching several hundred lines is split by responsibility, not by arbitrary line count.

## Build-time and runtime

- Build-time: static shells, locale catalogs into the bundle, manifest, hashes, 404, output audit.
- Runtime: AppStore, router, views, worker, projection, media.
- The shell generator is the only code that writes HTML files; no view writes an HTML document.
- Build scripts may import `config` and catalogs; they must not import runtime UI or worker code.

## Documentation

- This file, `state.md`, `config.md`, and `architecture.md` are required reading before code.
- Domain docs define the internals of each area.
- Update the matching doc and `AGENTS.md` 0.6 when a boundary changes.

## References

- Cinny `src/client/initMatrix.ts` and `src/app/features/room/RoomTimeline.tsx` for SDK lifecycle and timeline pagination patterns, not structure.
- matrix-js-sdk `src/store/indexeddb.ts`, `src/client.ts`, `src/models/room.ts` at `14a114e`.
- See `references.md`.
