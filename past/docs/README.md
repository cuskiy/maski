# Engineering design

`AGENTS.md` holds the user's rules and the settled decisions. This directory explains how
the code is put together and why each boundary sits where it does. When the two disagree,
`AGENTS.md` wins on intent and this directory wins on detail; when either disagrees with
the code, the code and its tests win and the document is updated.

| Document | Covers |
| --- | --- |
| `code-organization.md` | the tree, the boundaries, and the single implementation of each concern |
| `data.md` | IndexedDB shape, the projection, the queue, migrations |
| `worker.md` | the SDK session, sync, crypto, the key gate, media, delivery |
| `state.md` | application state, selectors, the URL as state, rendering |
| `ui.md` | the shell, the timeline, the composer, the picker, dialogs |
| `i18n.md` | catalogs, locale paths, formatters |
| `security.md` | sanitizer, CSP, tokens, media, privacy |
| `build.md` | the two HTML entries, the audit, hosting |
| `testing.md` | unit tests, the browser flow, what is not covered |
| `decisions.md` | why the rejected alternatives were rejected |
| `roadmap.md` | what is next, in order |
| `references.md` | the sources this design was checked against |

Principles:

1. One implementation per concern. A new feature extends a boundary instead of adding a
   parallel path.
2. The interface reads local data. Network work happens in the worker.
3. Content, configuration, tokens and code stay apart.
4. The platform first. A dependency needs a reason that survives a second look.
