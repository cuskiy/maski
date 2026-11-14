# maski — project

A fast, local-first Matrix client. `AGENTS.md` Parts 1–3 are the full design; this file records only
the tree that exists now.

## Current boundary

The tree is build-time only: static pages, components, catalogs, styles and build scripts. There is
no `src/client`, `src/worker` or `src/protocol`; C2/C3 and the runtime design wait for them. The
installed `matrix-js-sdk` and crypto wasm dependencies are not imported.

## Entry points and flow

- `src/pages/` — one view per page; `scripts/pages.ts` expands `PAGES × locales`.
- `src/layouts/base.ts` — document shell; `src/layouts/app.ts` — chat shell.
- `src/components/` — markup returned as `Html`; `src/lib/html.ts` escapes by default and exposes
  `raw` only for project-controlled SVG/CSP/trusted attributes.
- `src/catalogs/` — typed copy; `src/styles/style.css` — token, reset, base, layout, components,
  surfaces, motion layers.
- `scripts/build.ts` — esbuild stylesheet, hashed icon, pages, `build/manifest.json`, `dist/`.
- `scripts/dev.ts` — one build, then `scripts/static.ts` on `127.0.0.1:5172` (no watch).
- `scripts/audit.ts` compares regenerated pages/assets; `scripts/contracts.ts` checks C1 and C4–C8.
- `scripts/features.ts` — the platform-floor feature check, recorded in `features.md`.

## Terms

Page, region, surface, catalog, token and surface ladder are the build-time terms. Room, timeline,
composer, gate, worker and projection are design terms until their layer exists. The chat page owns
the navigation, header, timeline, composer and overlay surfaces; a page never imports client code.

## Generated and read-only

- `dist/` and `build/manifest.json` are generated; the build and audit own them. Never hand-edit.
- `past/` is reference only; never ship it or borrow its implementation.
- `.omp/` holds context, skills, config and ignored worktrees.

The exact commands, current gate and verification rules are in `AGENTS.md` Part 4.
