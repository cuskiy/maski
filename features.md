# Features

Only features this client can use are listed. The cutoff is Chromium 156, Firefox 157 and
**Safari 27.0** (2026-11-13). The dataset is `web-features` (2026-11-13), with
`@mdn/browser-compat-data` for entries the dataset does not name or where its record lags the engines;
anchor positioning and `anchor-size()` are recorded from MDN.

## Overlays

| feature | Baseline | Chrome / Firefox / Safari | use |
|---|---|---|---|
| `<dialog>` | 2022-03 | 37 / 98 / 15.4 | modal surfaces |
| invoker commands (`commandfor`) | 2025-12 | 135 / 144 / 26.2 | declarative dialog open |
| `popover` | 2025-01 | 116 / 125 / 17 | floating menus, pickers, profile |
| `closedby` | — | 134 / 141 / 27.3 | backdrop/Escape close; Safari 27.0 lacks it, no JS fallback |
| anchor positioning (`anchor-name`, `position-anchor`, `position-area`, `position-try`, `anchor-size`) | — | 125 / 147 / 26 | popover placement and width from the invoker; no JS |
| popover implicit anchor reference | — | 133 / 147 / 26 | `popovertarget` supplies the anchor |
| `backdrop-filter` | 2024-09 | 76 / 103 / 18 | modal backdrop blur |
| `@starting-style` | 2024-08 | 117 / 129 / 17.5 | overlay entrances |

## Layout, theme, timeline

| feature | Baseline | Chrome / Firefox / Safari | use |
|---|---|---|---|
| `light-dark()` | 2024-05 | 123 / 120 / 17.5 | the two ink/paper schemes |
| `color-mix()` | 2023-05 | 111 / 113 / 16.2 | surface ladder and text tones |
| `:has()` | 2023 | 105 / 121 / 15.4 | state selectors and scroll lock |
| container queries | 2023 | 105 / 110 / 16 | the narrow/wide shell and nav density |
| `scrollbar-gutter` | 2024-12 | 94 / 97 / 18.2 | stable timeline gutter |
| `field-sizing` | 2026-06 | 123 / 152 / 26.2 | composer growth |
| `text-wrap` | 2024-10 | 130 / 124 / 17.5 | headings and labels |

## Data, routing, forms

| feature | Baseline | Chrome / Firefox / Safari | use |
|---|---|---|---|
| `:user-invalid` | — | 119 / 88 / 16.5 | form errors |
| async clipboard | 2024-06 | 76 / 127 / 13.1 | copy text and links |
| `crypto.randomUUID` | — | 92 / 95 / 15.4 | local mock message ids |

## Text direction

| feature | Baseline | Chrome / Firefox / Safari | use |
|---|---|---|---|
| `bdi` | 2020-01 | 16 / 10 / 6 | isolate searched message text |
| `dir` (`auto`) | 2015-07 | 1 / 1 / 3 | direction of user content and fields |
| `:dir()` | 2023-12 | 120 / 49 / 16.4 | RTL anchor and icon overrides |

## Scripting

| feature | Baseline | Chrome / Firefox / Safari | use |
|---|---|---|---|
| `scripting` media feature | 2023-12 | 120 / 113 / 17 | hide the router spinner when JavaScript is off |

## Runtime

| feature | Baseline | Chrome / Firefox / Safari | use |
|---|---|---|---|
| dedicated workers | 2015-07 | 4 / 4 / 4 | the Matrix worker |
| JavaScript modules in workers | 2023-06 | 80 / 114 / 15 | ESM Matrix worker with rust crypto wasm |
| IndexedDB | 2021-09 | 58 / 51 / 15 | worker-owned account/sync stores and the account-scoped UI draft store |
| WebAssembly | 2017-03 | 57 / 52 / 11 | `@matrix-org/matrix-sdk-crypto-wasm` |
| service workers | 2018-04 | 45 / 44 / 11.1 | generated shell worker, `updateViaCache: "none"` |
| `CacheStorage` / `Cache` | — | 43 / 41 / 11.1 | installed shell precache and navigation revalidation |
| `StorageManager.persist()` | — | 55 / 57 / 15.2 | post-load persistence request |
| OffscreenCanvas | 2023-03 | 69 / 105 / 16.4 | worker image re-encode/EXIF strip |
| `createImageBitmap` | 2023-12 | 59 / 98 / 17.2 | decode and orient untrusted images in the worker |
| Web Cryptography | 2017-09 | 37 / 34 / 11 | AES-CTR media encryption and SHA-256 hashes |
