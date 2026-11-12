# maski

A fast, local-first Matrix client. The main thread reads a local projection; a dedicated worker owns `matrix-js-sdk`, sync, crypto, network, and projection writes. The UI is native DOM, with no framework, component library, CSS framework, state library, router library, i18n library, or date library.

`AGENTS.md` is the project brief and decision register. `docs/` is the engineering design.

## Status

The core client is implemented and checked with `npm run check`.

Verified locally against Synapse on Chromium:

- registration and password login, mandatory key gate, recovery-key setup and unlock
- encrypted text and image messages
- re-login on a new device with key-backup restore
- no-JavaScript shells in English and Chinese
- worker/SDK/rust-crypto WASM in a module worker
- output audit and static build

Not yet verified: Firefox and Safari, SSO, notifications, two-device SAS, offline reload, GitHub Pages subpath, and video/audio playback. Those remain gates in `docs/testing.md`.

## Requirements

- Node.js 24 or newer
- npm
- A Matrix homeserver for real use; `matrix.org` is the default suggestion

Nix users get the same Node and formatter from the flake:

```sh
nix develop
```

## Commands

```sh
npm install
npm run dev       # Vite dev server on http://localhost:5173
npm run code      # strict TypeScript
npm run lint      # type-aware Oxlint and Stylelint
npm test          # Vitest unit tests
npm run build     # generated shells, Vite build, output audit
npm run verify    # audit dist/
npm run check     # code + lint + tests + build + verify
```

`npm run dev` generates `index.html`, `zh-CN/index.html`, the manifest, and the icon before starting Vite. Generated HTML is not edited by hand.

## Configuration

Deployment values live in `src/app/config.ts`: app identity, default homeserver, locales, routes, dialog names, limits, source URL, base path, and origin. Copy lives in `src/i18n/`; design tokens live in `src/styles/style.css` `:root`.

## Security model

- The access token, crypto keys, and crypto store live in the worker.
- The main thread never imports `matrix-js-sdk`.
- A key is required before the app is interactive: recovery key, wait/SAS, or reset.
- `formatted_body` is sanitized with DOMPurify at render.
- The projection and local search are plaintext for offline use; the browser profile is the boundary.
- No analytics, external fonts, third-party scripts, or push gateway.

## Documentation

- `docs/README.md` — index and principles
- `docs/architecture.md` — processes and data flow
- `docs/code-organization.md` — tree, boundaries, duplication guards
- `docs/worker.md` — protocol
- `docs/security.md` — threat model, E2EE, CSP, sanitizer
- `docs/testing.md` — gates and local homeserver plan
- `docs/roadmap.md` — phases and scope
- `docs/decisions.md` — settled and open decisions
- `docs/references.md` — sources and commits

`blog/` is a separate reference project and is not part of the application.

## License

No project license has been chosen yet. Dependency licenses remain with their packages.
