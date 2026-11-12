# Testing

## Unit tests

`npm test` runs Vitest over `test/`: runtime guards, id helpers, the search tokenizer, the
HTML escaping, and the catalogs. These are pure functions; nothing needs a browser.

A new pure function gets a test when a wrong answer would be silent: parsing, ordering,
normalization, serialization. A test that repeats the implementation is not a test.

## Browser flow

`test/browser/flow.mjs` drives Chromium against a running dev server and a live homeserver:

```
npm run dev
node test/browser/flow.mjs                  # first run creates a recovery key, prints it
MASKI_RECOVERY="…" node test/browser/flow.mjs   # second run unlocks with that key
```

It covers login, the key gate, creating a key, the shell, creating a room, sending, the
echo, a reload, the picker, settings, search, dark mode and the narrow layout, and reports
the horizontal overflow of every element. It is a flow check, not a replacement for
looking at the screen.

Run it when a boundary changed, not after every edit: a login costs a round trip and a
rate-limit budget.

## What the checks do not cover

- Firefox and Safari.
- SSO against a real identity provider.
- Device verification by SAS between two devices.
- Notifications for a closed page (there is no push gateway).
- Video and audio playback across browsers.
- A homeserver with lazy-loaded members beyond the first page.

Each of these is listed in `roadmap.md`; none of them is claimed as working.

## Conventions

- A check that did not run is not a check that passed; the report says which ran.
- One browser run per change to a boundary, not per edit.
- Measurements come from the DOM (`getBoundingClientRect`, `getComputedStyle`), not from
  looking at a screenshot.
