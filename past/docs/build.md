# Build

`index.html` and `zh-CN/index.html` are the two static entries; each is a real Vite entry,
so the build hashes assets, rewrites the stylesheet link and emits both pages without a
post-processing step.

`vite.config.ts` sets `target: es2025` and `cssTarget: esnext`: no downlevelling, and
therefore no vendor prefix the source does not contain. `base` comes from `MASKI_BASE` so a
sub-path deployment works; the default is `/`. The worker is emitted as its own chunk.

The main bundle is 107 kB; it contains no part of the SDK. The worker chunk and the 7.8 MB
crypto wasm load after first paint, which is why the shell paints from the projection
first.

`npm run build` type-checks and then builds. `npm run verify` audits `dist/`:

- each shell has the expected `lang`, a content security policy, a stylesheet link, one
  `h1`, a `noscript` overlay, and no inline style, script or handler;
- no built file contains `!important`, `outline: none` or a vendor prefix;
- the main bundle does not mention the SDK.

A failure fails the check, so the audit is a gate rather than advice.

## Hosting

A static directory. Hash routing means no rewrite rule is needed; a sub-path deployment
sets `MASKI_BASE` and the locale shells keep working because the router reads the hash and
the assets are relative to the base.
