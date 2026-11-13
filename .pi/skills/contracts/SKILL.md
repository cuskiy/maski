---
name: maski-contracts
description: Check the contracts this project promises before claiming a change is done. Use when finishing a change, before committing, or when asked whether the project still satisfies its rules.
---

# maski contracts

`AGENTS.md` Part 1 holds the rules, Part 2 the requirements, Part 3 the design. A change is finished
only when every gate passes, and a gate that did not run is not a gate that passed.

```
npm run check      # tsc, Oxlint, Stylelint, node --test, build, output audit, contracts
npm run dev        # build in watch mode and serve dist/ on http://localhost:5173/
npm run features -- <web-features id> --require 2026
```

`scripts/contracts.ts` is the auditable half of the design. Each check is named, and a failure
prints `<contract>: <what broke>`:

| id | contract |
| --- | --- |
| C1 | the catalog: every language has the same keys, every key is read by code, nothing is empty |
| C2 | the protocol: every command type has a handler in the worker |
| C3 | the layers: the client never imports the SDK, the worker never imports the interface, a page never imports client code |
| C4 | the pages: `lang`, exactly one `h1`, a `<noscript>` note, and every region and surface on the chat page |
| C5 | the assets: every manifest name is hashed and exists in `dist/` |
| C6 | the budgets: client bundle ≤ 200 kB, stylesheet ≤ 40 kB |
| C7 | the text: no TODO or FIXME marker, no console output, no Chinese outside the Chinese catalog |
| C8 | the languages: every screen exists in every language, English at the root |

When a check fails, fix the cause. Never relax a budget or delete a check to make a change pass;
that is a decision for the user, recorded in `AGENTS.md` 0.8/1.x with the reason.
