# maski conventions

## Language

English for code, identifiers, comments, commits and docs. Chinese only in conversation, user-facing
copy and the Chinese catalog / `AGENTS.md` Part 2. C7 rejects Chinese in code.

## Source

TypeScript is strict; imports use `.ts` suffixes; no `any`, no unused names. Use the `html` tagged
builder for markup: text is escaped, and `raw` is only for project-controlled SVG, CSP or trusted
attributes. No inline style or script. Prefer native browser behavior; do not add a second spelling
for the same job.

## CSS

One stylesheet, imported as layers. Use tokens only: no literal colors, spacing, radii or durations.
No visible borders or dividers; surfaces, whitespace and type carry grouping. No shadow, gradient,
glass or card kit. No width media query; use container queries and fluid `clamp()`/`minmax()`. Focus
stays visible, and reduced motion removes animation. The frontend-design skill owns visual review.

## Copy and comments

Copy lives in the typed catalog; both languages have the same keys, every key is read, and no entry
is empty. One sentence per note, saying only what the reader cannot see. An error says what happened
and the next step. A comment states a non-obvious why or invariant in one line; no narration and no
long JSDoc.

## Formatting and gate

Prettier formats `src`, `scripts`, `test` and the root JSON/YAML (`npm run format`). Embedded HTML
inside the `html` tagged templates is left alone; its whitespace is significant. `npm run
format:check` is part of `npm run check`, together with tsc, Oxlint, Stylelint, tests, build, audit
and contracts. Never hand-edit generated files, and never raise a budget to make a gate pass.
