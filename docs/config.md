# Configuration

One module is the deployment configuration: `src/app/config.ts`. No other module reads environment variables, hardcodes the app name, default homeserver, locale list, route paths, dialog names, limits, or external links.

The settings screen is not this configuration. Settings are account/local preferences. The fixed style and usage described in `AGENTS.md` are not configurable.

## Config surface

| Field | Type | Example | Used by |
| --- | --- | --- | --- |
| `app.name` | string | `maski` | shell, brand, About, notification title |
| `app.defaultHomeserver` | string | `matrix.org` | auth form |
| `app.locales` | readonly string[] | `["en", "zh-CN"]` | shell generator, i18n, language switch |
| `app.defaultLocale` | string | `en` | `/` shell, initial locale |
| `app.fallbackLocale` | string | `en` | missing catalog entries |
| `app.routerMode` | `"hash" \| "history"` | `hash` | router, build |
| `app.basePath` | string | `/` or `/maski/` | Vite base, shell links, router |
| `app.origin` | string | `https://maski.example` | canonical, alternates, manifest |
| `app.links.source` | string | repository URL | About |
| `routes` | table | home, room, login, register | router, views, shell |
| `dialogs` | table | settings, search, new-message, join, create, room-settings | router, dialog controller |
| `limits.timelineWindow` | number | 300 | timeline DOM window |
| `limits.timelinePage` | number | 50 | pagination request |
| `limits.loadedMax` | number | 2000 | in-memory timeline cap |
| `limits.searchLimit` | number | 50 | search results |
| `limits.mediaCacheBytes` | number | 200 MiB | media cache eviction |
| `limits.outboxPerRoom` | number | 3 | in-flight/queued guard |
| `media.avatarSizes` | number[] | `[48, 96]` | avatar requests |

Rules:

- `as const`; no mutable config at runtime.
- Environment variables are read only here, and only for build/deploy values (`BASE_URL`, router mode if exposed).
- Locale codes must have a catalog and a generated shell. The build fails otherwise.
- Route and dialog names are keys; views never write a path literal.
- Limits are logic constants. CSS sizes stay in `:root`.
- External links are explicit; empty source link hides the About row.
- The default homeserver is a convenience, not an allowlist. Users may enter another server.

## Content

UI copy is not in the config:

- `src/i18n/en.ts` is the source catalog.
- `src/i18n/zh-CN.ts` translates it.
- Every catalog key is typed; a missing key is a build/type error or falls back to English, never to a key.
- Parameterized copy uses one entry, not string concatenation.
- The app name is a parameter; catalogs do not duplicate the literal.
- Static shell title/description/boot/noscript read the same catalogs at build time.

Matrix content is not in the config:

- Room names, messages, topics, profiles, packs, and media come from the projection.
- No view embeds sample Matrix data.
- Test fixtures live in tests, not in runtime content.

## Design tokens

- Colors, type steps, spacing, radii, borders, durations, and layout sizes live in `:root` in `src/styles/style.css`.
- No JS reads or writes color/layout values.
- A new surface declares an ink ratio and derives its text; no separate foreground constant.
- The app name and copy are not design tokens.

## Data and protocol constants

- DB names, versions, store names, indexes, record types: `src/data`.
- Worker command/event names and guards: `src/protocol`.
- Matrix event type strings and relationships are normalized in one worker normalizer; views do not compare raw event type strings.
- No duplicate constant in a view, store, script, or doc example.

## Build

- `scripts/shells.ts` imports `config` and catalogs; generates `/index.html`, `/<locale>/index.html`, `manifest.webmanifest`, alternate `hreflang` links, boot text, noscript overlay, and optional `404.html`.
- `scripts/build.ts` sets Vite `base` from `config.app.basePath`, builds the app and workers, and emits hashed assets.
- `scripts/verify.ts` checks that every locale in config has a shell/catalog, every route/dialog key exists, every static shell has `lang`/title/boot/noscript, and no inline CSS/JS exists.
- The default English shell is `/`; `/zh-CN/` is generated from the same template.
- Automatic language redirect is not enabled in v1; it is an open decision in `AGENTS.md` and `decisions.md`.

## Change-one-place matrix

| Change | Edit |
| --- | --- |
| App name | `config.app.name`; catalogs use the parameter; shell generator |
| Default homeserver | `config.app.defaultHomeserver` |
| Supported locales / default / fallback | `config.app` + catalogs; shell generator; build check |
| Base path or router mode | `config.app` / deploy env |
| Route or dialog names | `config.routes` / `config.dialogs` |
| Timeline/search/media limits | `config.limits` |
| Source link | `config.app.links.source` |
| Copy | `src/i18n/*` |
| Colors/type/spacing | `src/styles/style.css` `:root` |
| Event shape / DB schema | `src/data` |
| Worker commands/events | `src/protocol` |

## Not configurable

Theme, motion, media auto-load, membership rows, density, language auto-redirect, Enter-send, pack authoring, moderation, password reset, and push gateway. These are product decisions, not deployment settings.

## References

- AGENTS.md 0.5-0.7, 1, 2, 12, 17, 23, 32, 33.
- Vite `base` and static build behavior; MDN `import.meta`/URL.
- See `references.md`.
