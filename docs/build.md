# Build

## Output

A static directory:

```
/index.html                 English shell
/zh-CN/index.html           Chinese shell
/404.html                   history fallback when enabled
/manifest.webmanifest
/assets/<hash>.css
/assets/<hash>.js           main entry
/assets/<hash>.js           worker entry and chunks
/assets/...                 icons, favicon, static media
```

Hash routing is the default, so GitHub Pages needs no rewrite. History mode needs a 404 fallback; see below.

## Vite

- `src/app/main.ts` is the single app entry; it imports `src/styles/style.css`.
- The adapter (`matrix/client.ts`) creates the worker with `new Worker(new URL("./matrix.worker.ts", import.meta.url), { type: "module" })`; Vite emits it as a separate chunk. Do not inline the worker.
- The main entry must not import `matrix-js-sdk`; only the worker entry does. The build verifies the main chunk graph.
- Vite hashes JS/CSS. Icons and manifest-referenced assets keep stable names because the manifest addresses them.
- `base` comes from `config.app.basePath`; no absolute `/` assumption in source. Shell links use the same base.
- Target current Chrome/Firefox/Safari; no legacy polyfills.

## Static shells

`scripts/shells.ts` runs before Vite and generates `index.html` and `zh-CN/index.html` from one template plus `config` and catalogs. Vite takes both HTML files as inputs and rewrites their external CSS/JS references to hashed assets.

Each shell has:

- `<!doctype html>`, `lang`, charset, viewport, color-scheme, theme-color.
- Localized title/description, canonical from `config.app.origin` + `basePath`, `hreflang` alternates, `x-default`.
- Manifest link and icons.
- External stylesheet and module script; no inline CSS/JS.
- Boot state (brand/loading) in the app root.
- Full-page `<noscript>` with brand, one `h1`, JS explanation, enable/reload, and a static language link.
- A CSP meta tag; `connect-src *` is the documented exception.

The generated HTML is not hand-edited. A locale in config without a catalog/shell fails the build.

## 404 and history mode

- Hash mode: no rewrite needed.
- History mode: generate a per-locale `404.html` or a root fallback that serves the matching shell and preserves the path/locale. The fallback must not lose the room route.
- GitHub Pages serves `404.html` for unknown paths; this is the only rewrite mechanism. Verify deep links under a base path.

## Service workers

Two different things:

- **Shell cache**: not in v1. Cold offline start is out of scope; offline applies only after the page has loaded.
- **Media proxy**: optional. A same-origin service worker can add `Authorization` and stream authenticated video/range requests. It must not cache the app shell or user data beyond the media cache; the token is handed in memory, not stored. Its CSP is separate from the document meta; verify in the spike.

The media proxy is a candidate (AGENTS.md 0.6 E11/O3), not settled. The fallback is a full blob download.

## Manifest and icons

- Generated from `config` and the locale list; name/short name from app config.
- `start_url`/`scope` respect `basePath`.
- Icons are stable files; theme/background colors come from the paper tokens.
- A single manifest is enough; the shell language is in the HTML.

## Output audit

`scripts/verify.ts` checks:

- Every configured locale has a shell and catalog; every route/dialog key exists.
- Each shell has `lang`, localized title/description, canonical, alternates, boot, noscript, external CSS/JS.
- No inline `<style>`, `style=`, `on*=`, or inline `<script>`.
- One visible `h1` in each active static state; noscript/app headings do not both render.
- All local `href`/`src` targets exist; hashed assets match.
- The main JS chunk graph does not include `matrix-js-sdk`; the worker chunk does.
- CSS parses, tokens are in `:root`, no `!important`, no vendor prefixes, no unused selectors/tokens.
- No source `data:` scripts, no external scripts/fonts, no analytics.
- No secret/token strings in output.
- The no-JS overlay and language links are present.
- History-mode fallback exists if enabled.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | generate dev shells, Vite dev, worker/watch |
| `npm run code` | Prettier, ESLint, Stylelint, `tsc --noEmit` |
| `npm test` | Vitest units |
| `npm run build` | shells, Vite build, manifest |
| `npm run verify` | output audit against `dist/` |
| `npm run check` | code, tests, build, verify |
| `npm run e2e` | Playwright against a local homeserver |

The build is deterministic apart from hashes; compare normalized output when changing the build.

## GitHub Pages

- Deploy `dist/`; include `.nojekyll`.
- Set the repository base path in config; test a subpath deployment, not only the origin root.
- Hash routing is the default and avoids server rewrite.
- History mode needs the 404 fallback and a subpath test.
- HTTPS is required for crypto, Web Locks, notifications, and service workers; GitHub Pages provides it.

## Release

1. `npm run check` passes.
2. Worker/media spikes have a recorded result.
3. Static shells and language links verified with scripts disabled.
4. Browser tests cover offline, key gate, E2EE, media, and sessions.
5. Version from the build is shown in About.
6. Source link and dependency licenses are current; project license is not claimed until chosen.

## References

- Vite static build, HTML entry points, Web Workers; checked 2026-11-11.
- Element Web `apps/web/src/serviceworker/index.ts` for the media service worker pattern; behavior reference only.
- MDN CSP, Service Worker, `Authorization`, `wasm-unsafe-eval`.
- See `references.md`.
