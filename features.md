# Features

Only features this client can use are listed. The cutoff is the three browsers as of
**2026-10-31**: Chrome 146, Firefox 157, Safari 27.0. The dataset is `web-features`
(2026-11-13, 1240 entries), with `@mdn/browser-compat-data` for the entries the dataset does not name.

## Overlays

| feature | Baseline | Chrome / Firefox / Safari | use |
|---|---|---|---|
| `<dialog>` | 2022-03 | 37 / 98 / 15.4 | modal surfaces: settings, search, new message, invite, join, create |
| invoker commands (`commandfor`) | 2025-12 | 135 / 144 / 26.2 | declarative open/close of those dialogs, focus return |
| `popover` | 2025-01 | 116 / 125 / 17 | floating surfaces: room menu, language menu, emoji/sticker picker |
| `closedby` | — | 134 / 141 / 27.3 | backdrop/Escape close on the dialogs; no JS fallback |
| `dialog.requestClose()` | 2025-05 | 134 / 139 / 18.4 | close requests without losing the dialog's cancel path |
| `backdrop-filter` | 2024-09 | 76 / 103 / 18 | `::backdrop` blur behind the dialogs |
| `@starting-style` | 2024-08 | 117 / 129 / 17.5 | dialog and popover entrance |
| `transition-behavior` | 2024-08 | 117 / 129 / 17.4 | `allow-discrete` for the same entrance |

## Layout, theme, timeline

| feature | Baseline | Chrome / Firefox / Safari | use |
|---|---|---|---|
| `light-dark()` | 2024-05 | 123 / 120 / 17.5 | the two ink/paper schemes |
| `color-mix()` | 2023-05 | 111 / 113 / 16.2 | surface ladder and text tones |
| nesting | 2023 | 120 / 117 / 17.2 | component-scoped rules |
| `:has()` | 2023 | 105 / 121 / 15.4 | state selectors |
| container queries | 2023 | 105 / 110 / 16 | the narrow/wide shell |
| container style queries | 2026-05 | 111 / 151 / 18 | theme/density branches |
| `scrollbar-gutter` | 2024-12 | 94 / 97 / 18.2 | stable timeline gutter |
| `field-sizing` | 2026-06 | 123 / 152 / 26.2 | composer growth |
| `text-wrap` | 2024-10 | 130 / 124 / 17.5 | headings and labels |
| `::details-content` | 2025-09 | 131 / 143 / 18.4 | navigation sections |
| `@scope` | 2026-03 | 143 / 146 / 26.4 | message markup containment |
| view transitions | 2025-10 | 111 / 144 / 18 | room and page changes |
| `content-visibility` | 2025-09 | 108 / 130 / 26 | long timeline rows |
| `scrollend` | 2025-12 | 114 / 109 / 26.2 | read receipts after a scroll settles |

## Data, routing, forms

| feature | Baseline | Chrome / Firefox / Safari | use |
|---|---|---|---|
| `Promise.withResolvers` | 2024-03 | 119 / 121 / 17.4 | worker and client request promises |
| `Object.groupBy` / `Map.groupBy` | 2024-03 | 117 / 119 / 17.4 | navigation sections |
| Set methods | 2024-06 | 122 / 127 / 17 | store and list differences |
| `AbortSignal.timeout` | 2024-04 | 124 / 100 / 16 | request timeouts |
| Navigation API | 2026-01 | 102 / 147 / 26.2 | the chat router |
| URLPattern | 2025-09 | 95 / 142 / 26 | route matching |
| `:user-invalid` | — | 119 / 88 / 16.5 | form errors |
| `Intl.Segmenter` | 2024-04 | 87 / 125 / 14.1 | local search tokens |
| async clipboard | 2024-06 | 76 / 127 / 13.1 | copy actions |
