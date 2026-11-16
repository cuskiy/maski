# AGENTS.md

This file is the contract for the project. It is the design, the security model, the visual language,
the working method, and the current migration plan. The tree is an attempt at this contract, not its
definition.

Read the file in order. Part 1 is authority over Part 2. Part 2 is authority over Part 3. Part 3 is
authority over Parts 4 and 6. A change that needs a contradiction between Parts 1, 2 and 3 is a
discussion, not an edit. Only the user can change Part 2. If code and this file disagree, the code is
wrong; if the file and the user disagree, the user is right.

The document is written in English. Product copy still lives in typed catalogs, including the Chinese
catalog. English here is not permission to put English user-facing copy in code.

---

# Part 1 - Rules

## 1.1 The first principle

The reader's time and trust outrank every technical preference.

- No white flash in a dark room. No layout shift while data arrives. No click lost because a node was
  replaced under the pointer. No error hidden in a console.
- Every wait is visible, and every visible wait can be cancelled.
- A control that appears works. A control that cannot work is absent or says why.
- An error names what happened and what the reader can do next. Internal state is not the reader's
  business.
- One extra step is a cost. One extra second is a cost. Slow is rude.
- Security is part of trust. Unsafe HTML, leaked credentials, third-party requests, and silent storage
  writes are product defects, not implementation details.

Every rule below exists to make this principle enforceable. A rule without a check is a wish; 1.9
names the owner of each promise.

### The excellence gate

A green check is evidence about the check, not permission to keep a known weaker design. When a stronger
correct implementation is available inside the boundary, take it in the same change. Do not leave a
"later" path, a compatibility shim, a second writer, or a known-bad fallback because it already passes.

No compromise is accepted at these boundaries:

- one writer per fact; one cache/store owner; one protocol path;
- untrusted data through one sanitizer and one URL policy;
- no fake control, fake gate, fake registration, no-op command, or optimistic row without a command;
- no unowned async wait, no swallowed unexpected failure, no second path that can outlive its step;
- first paint, focus, caret, selection, scroll and media state survive the change;
- a test may not pass while the surface is visibly wrong.

A user-owned product decision can choose behavior. It cannot choose a known security, storage or
ownership defect. If the better design changes a product promise, a budget or a user decision, stop and
ask with a recommendation; otherwise implement the better design now and delete the weaker one.

## 1.2 Precedence

1. These rules.
2. Part 2, the product promises. These are the user's requirements; only the user changes them.
3. Part 3, the architecture, security model and engineering design.
4. The Matrix specification and the public SDK surface, read from disk for the pinned version.
5. The current tree, including `advice.md` as evidence. The tree is never authority over the design.

`past/` and `git/` are evidence only. They are never shipped and their code is never copied.
`git/sable-next` is AGPL; behavior may be studied, code may not be copied.

## 1.3 Security invariants

These are release blockers. A change that violates one is rejected even if it looks correct.

1. **Every Matrix event, profile, room name, topic, `formatted_body`, media name, URL, and sticker is
   untrusted.** It must cross one sanitizer and one URL policy. No component may trust a field because
   it came from the SDK.
2. **No unsafe DOM sink.** `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
   `javascript:` URLs, inline event handlers, and inline `<script>` are forbidden. Generated markup is
   admitted only through one inert parser that rejects executable constructs. Data is inserted as
   text, attributes, or typed `Html`, never concatenated into a sink.
3. **No dynamic code execution.** No `eval`, `new Function`, string timers, or JavaScript protocol.
   No third-party script, font, stylesheet, image, analytics, or telemetry.
4. **CSP is a serving policy, not decoration.** Production uses a response-header CSP built from one
   exact allowlist: the shell origin, the chosen homeserver origin, and the websocket origin. A
   wildcard `https:`/`wss:` connection policy is a temporary migration defect, not the design.
5. **The worker owns credentials and crypto.** Access tokens, refresh tokens, recovery keys, secret
   storage, device keys, and decrypted media stay in the worker. The main thread receives a session
   summary, a one-time recovery key when explicitly requested, and `blob:` URLs or typed rows.
   IndexedDB is origin-wide: the worker is an ownership boundary, not a capability boundary against
   XSS. The sanitizer, CSP, and minimal DOM surface are the real XSS defense.
6. **Never persist secrets or message text in the wrong store.** No token, password, recovery key,
   message body, draft, or attachment in `localStorage`, a URL, a log, a fixture, a screenshot, or a
   commit. Drafts belong to the account-scoped UI database and are cleared on logout.
7. **The main thread never talks to a homeserver.** No `fetch`, `XMLHttpRequest`, `EventSource`, or
   `WebSocket` to the homeserver from a region, store, action, or composer. Network I/O belongs to the
   worker; media is authenticated and resolved to a blob there.
8. **No authenticated data in the HTTP cache or service worker cache.** Only the shell and hashed
   assets are precached. `/sync`, media, avatars, API responses, and tokens are never cached by the
   service worker.
9. **No secrets in diagnostics.** Logger names and error codes are allowed; payloads, tokens, message
   text, and user identifiers in logs are not. A release build has no console output.
10. **A security check is not weakened to make the gate green.** If the check is wrong, change the
    check and the rule together; if the code is wrong, fix the code.

## 1.4 The working loop

One step is short and complete.

1. **Read.** Read the owning module, the owning paragraph of this file, and the relevant specification
   section. Read the actual diff; never plan against a file nobody read.
2. **Model the boundary.** Name the fact, its one writer, its readers, its failure modes, and the
   verification rung. If two layers can write the fact, stop and redesign the boundary.
3. **Plan.** Name the approach and the smaller alternative. A decision the user owns stops here and
   becomes a question. A plan that adds a second path is not a plan.
4. **Implement.** Leave the tree coherent after every file. One job per module; one implementation per
   boundary. Delete the path the change replaces.
5. **Run it.** The real page in a browser, the worker protocol from a browser, or a pure test for a
   rule that can be pure. A static read is not a run.
6. **Verify at the rung claimed.** A claim one rung above its evidence is a reporting defect.
7. **Record.** A defect goes to the open-defect section with symptom, known facts, ruled out, and next
   step. A decision rewrites its owning paragraph; it never creates a second description.
8. **Commit and push** one coherent change, the reason in the body. History is never rewritten.

Before a step is complete, `npm run check` passes. A budget is never raised to hide a defect. The
stylesheet, client, worker, wasm and watermark budgets are decisions; raising one is a change to this
file with the reason.

### A bug report is its own loop

Reproduce it in the browser. Find the root cause. Fix the cause. Re-run the same reproduction. Commit
with the cause named. Two failed fixes on one symptom mean the boundary is wrong (1.8).

### What a step leaves behind

| a change that | also leaves |
|---|---|
| fixes a defect | the reproduction that failed before and passes after, named in the commit |
| adds behavior | a pure test for the rule, or a browser run whose assertion is the behavior |
| adds or moves a rule | its contract row and the check |
| changes a decision | the rewritten paragraph, never a second description |
| adds a dependency | the reason, and the removal of one nothing imports |
| touches the protocol | the specification path it was checked against, quoted in the commit |
| touches storage, CSP or auth | a threat-model note and a negative test |

## 1.5 The verification ladder

A claim names its rung.

1. **Pure** - a unit test; no DOM, no network.
2. **Worker** - the protocol driven from a browser: start, login, sync, open, send, echo, receipt,
   decrypt success and failure, malformed command.
3. **Surface** - the page driven in Chromium: the control does what it says, focus and caret survive,
   computed styles are checked where appearance is the claim.
4. **Scriptless** - the same page with JavaScript disabled: the frame is complete and every visible
   control either works or says what it needs.
5. **Real server** - the whole flow against a homeserver on a real device.
6. **Other engines** - Firefox and Safari. Until this rung runs, a browser claim says Chromium.

The first paint has its own evidence: a screenshot at load, a screenshot after stored data arrives, and
the absence of a shift between them. A screenshot taken after an arbitrary wait is not first-paint
evidence. "It looked fine" is not evidence. A regex over CSS is not a browser run.

## 1.6 Defects, questions, and the record

A defect found and not fixed is written down with four fields: the symptom a reader sees, what is known,
what was ruled out, and the next concrete step. A defect whose cause is unknown after two attempts is a
boundary problem: the third attempt starts by redesigning the boundary.

A question carries a recommendation and what it rules out. Work continues on the parts that do not
depend on the answer. An answer the user gave replaces the design paragraph; it never lives in a second
place.

## 1.7 Writing floor

- Correctness first, then human readability: domain names, straight lines, early returns, explicit data,
  no abbreviation a newcomer must decode.
- One module, one job; the file name says it. Soft budget is 400 lines per module. A larger file names
  its reason in a header and has an owner; "it grew" is not a reason.
- No dead code, unused export, TODO, stub, placeholder, fake control, or copy for a feature that does
  not exist. A missing feature is absent.
- One implementation per boundary. A second way to do the same thing is a defect: the choke point grows,
  the workaround does not.
- A comment states what the code cannot: a protocol quirk, a browser behavior, a security boundary, an
  invariant. One line, English, no decoration. Code, identifiers, commits and docs are English.
- No vendor prefix, polyfill, engine-specific branch, or compatibility shim unless the platform check
  declares the exception and the user accepts it. One spelling per feature.
- A generated file is never hand-edited. The generator changes.
- A document line that describes an unverified implementation as current is a truth defect. Move it to
  6.4 with its rung, or remove it; never make the contract match a weaker tree.
- No `TODO`, "later", "temporary", "MVP", "phase 1", or compatibility comment. The defect record owns
  unfinished work; the code is absent, complete, or blocked with the missing prerequisite named.
- A `catch` states the expected failure. A catch that converts an unknown failure into success,
  `undefined`, or silence is a defect.
- Prefer the platform to a dependency. Prefer a typed function to a framework. Prefer a native control
  to a div with listeners.
- Public behavior is typed. `any`, unchecked assertions, and `@ts-ignore` are forbidden except at a
  validated parser boundary, where the assertion is adjacent to the guard and tested.
- Use modern JavaScript and TypeScript deliberately: ESM, strict types, `const`, `for...of`,
  optional chaining, nullish coalescing, `satisfies`, discriminated unions, `readonly`, `toSorted`,
  `AbortSignal.timeout`, `structuredClone`, `navigator.locks`, `crypto.randomUUID`, and native
  `dialog`/`popover` where the platform floor supports them. Every new web platform feature is checked
  with `npm run features` before use. Do not use `var`, `arguments`, `for...in` over arrays, string
  timers, `apply`, `document.write`, or `innerHTML`.
- CSS uses modern platform features only after a feature check; tokens first, logical properties,
  `light-dark`, `color-mix`, `:is`, `:where`, `:has`, container queries, `clamp`, `minmax`, `auto-fit`,
  `@starting-style`, and anchor positioning where they reduce code. No width media query, no literal
  color outside tokens, no shadow, no gradient, no vendor prefix, no numbered color token.
- A token names the object and state at its use site, not a value that happened to work. A rest selector
  uses a rest role; a hover selector uses a hover role; an open selector uses an open role. Reusing
  `--account-hover-bg` as the default background of `.nav-account` is a semantic defect even if the
  rendered color is acceptable. If a value is shared, keep distinct semantic roles rather than making
  the name lie. A token rename updates every use and its regression test.
- HTML is semantic first. A button is `<button type="button">`; a dialog is `<dialog>`; a popover is a
  popover; a label is `<label>`; a list is a list. No clickable div, positive `tabindex`, redundant ARIA,
  inline handler, inline style, or inline script.

## 1.8 When to stop and redo

These are exit conditions, not warnings.

1. The same boundary needs a third workaround: the boundary is wrong.
2. A defect returns after being fixed in two places: it has two owners; delete one.
3. A phase cannot exit with the tool it planned with: change the tool and record why.
4. A generated file must be edited by hand to work: the generator is wrong.
5. A "temporary" second path outlives its step: delete or promote it in the same change.
6. A test can pass while the UI is obviously wrong: the test is not testing the claim.
7. An agent claim is above its rung: remove the claim, run the rung, or fix the evidence.
8. A fix adds a token, state, writer, or markup producer to avoid understanding the existing one: discard
   the fix and redesign the boundary.

## 1.9 Checks and contracts

One command per intent. `npm run check` is the whole gate; a failing check names its contract and the
paragraph that owns it.

| id | contract | enforced by |
|---|---|---|
| C1 | one catalog key set per language; every key is read outside the catalogs; nothing empty | catalog test and contracts |
| C2 | every protocol command has a handler and every `ChatSource` method has a command or is absent | protocol/worker/source tests |
| C3 | the client never imports the SDK; the worker never imports the interface; a page never imports client code | boundary tests |
| C4 | every page has a language, one `h1`, a scriptless note, and the chat page carries its `data-region` regions | page tests and contracts |
| C5 | every manifest asset is hashed, present in the output, and found by the audit | audit and contracts |
| C6 | client, stylesheet, worker, crypto wasm and watermark meet declared budgets | build/audit |
| C7 | no TODO marker, no console output, no non-catalog user copy, no unused export | contracts and lint |
| C8 | every screen exists in every language; English at `/en/`, the root is the language entry | contracts |
| C9 | a new web feature is in `features.md` and passes the platform check | feature check and review |
| C10 | the first paint is final; only an uncached room list may show skeleton rows; no fade or layout shift | browser first-paint run |
| C11 | no page contains inline CSS, inline script, inline style, inline handler, or a `javascript:` URL | page tests |
| C12 | the static shell contains no room, message, unread, identity, draft or media state | review test |
| C13 | a grouped message carries its avatar on the last row and chains its inner bubble corners | timeline and style tests |
| C14 | no unsafe DOM sink, inline handler, `javascript:` URL, third-party request, or secret in local storage/logs | boundary/security tests and review |
| C15 | the worker owns the outbox and every visible wait clears on success, failure, cancel or timeout | worker tests and browser harness |
| C16 | the production capability set equals the implemented commands; an unsupported control is absent | capabilities test |
| C17 | the worker alone writes the account projection, read markers and outbox; the client writes only UI state | projection/worker tests |
| C18 | the gate has one worker owner; the cached gate is a hint, and no fake unlock/register exists | auth/worker tests and gate surface check |
| C19 | the service-worker cache contains only shell pages and hashed shell assets | service-worker test |
| C20 | crypto and sync stores are device-scoped, and one account lock is held across startup | worker browser harness |

Current budgets are declared in Part 3.10. C6 measures them; a change that exceeds a budget is a user
decision, not a refactor. C10, C15 and C20 need a committed browser harness before the product can claim
P1. C18's real-server recovery path is still a 6.4 item; the committed checks cover ownership and the
absence of a fake gate, not a successful recovery against a homeserver.

## 1.10 Deciding and asking

| the agent decides | the agent asks |
|---|---|
| module boundaries, names, file layout | what the product promises |
| which existing pattern to follow | anything a reader would notice as a behavior change |
| a cheaper implementation of the same promise | a rule in Part 2, a budget, a scope cut |
| deleting code it has just made dead | deleting code it did not write and cannot attribute |
| type shape inside a chosen boundary | storage format, CSP policy, read-receipt privacy, key-gate predicate |

Do not ask for information the repository, the specification, or a tool can answer. A question must
carry a recommendation and the consequence of the alternatives.

## 1.11 What the loop forbids

- Committing a tree that fails a gate, or leaving an unfinished change at the end of a turn.
- Silently weakening a check, a budget, or a test to get green.
- Reporting a feature as working when it was only wired, mocked, or visually plausible.
- Carrying a second implementation beside an existing one because the first was awkward.
- Adding optimistic UI for a command that has no protocol, handler, projection and test.
- Adding a new feature before its design question is answered.
- Treating `innerHTML`, `outerHTML`, a string signature, or a full-region `replaceChildren` as a
  convenient reconciliation mechanism.
- Calling a CSS regex, a mock screenshot, or a component string proof of a working product.
- Claiming "I fixed it" without reproducing the original symptom and checking the same path again.

---

# Part 2 - Product

This part is the product promise. It is written in English for the repository contract; user-facing copy
still lives in typed catalogs.

## 2.1 The product

A fast, frugal, local-first Matrix client. The page is usable offline after the first load. Reading
messages, scrolling history, searching, and sending must not wait for the network or an animation. Most
Matrix clients stutter; this one must not.

The output is a static directory: no backend, no server-side rendering. Protocol, sync, encryption and
media live in a dedicated worker; the main thread only draws and owns UI state. The stack is TypeScript
and esbuild, plus `matrix-js-sdk`, rust crypto wasm, and a sanitizer. There is no UI framework, component
library, CSS framework, state library, router library, i18n library, date library, icon font, or external
font.

The client is a product, not a demo. A mocked surface is never presented as a finished feature. A real
account and the real worker are the acceptance surface.

## 2.2 Speed and first paint

- The first thing the reader sees is the final composition. With a cached room list, paint it before
  crypto; without one, only the room area may show static skeleton rows while `roomsLoading`. The action
  card, topbar and composer keep their final boxes and every row replaces in place when data arrives.
- No white flash, no "placeholder then replacement", no layout shift.
- Local data first: rooms, section state, identity and gate hint come from cache without waiting for
  sync or crypto. A cached gate state may paint first; the worker corrects it in the background.
- The topbar, title and description have their final position and color on the first frame. Long titles
  and descriptions truncate, never wrap. With no room selected the topbar remains; the identity area is
  empty or shows one spinner, never a fade or a shimmer.
- Loading is visible and cancellable. There is no blank wait. No entrance animation on the first paint;
  later repaint may animate briefly and respects reduced motion.
- Section collapse is remembered per account. The list updates in place; nodes are not rebuilt under
  the pointer.
- A refresh is a quiet refresh: what belongs is already there; what changed changes once.
- The static HTML paints the shell only: language, `color-scheme`, navigation frame, topbar frame,
  timeline region, composer, and the scriptless note. Room rows, unread counts, members, identity,
  messages, drafts, media and picker content are injected once by the client.
- Injected state is already final: read position and scroll position are computed from the same snapshot;
  no `markRead` and no second scroll after injection.
- A room switch clears the old window and shows the real loading state for the new room. It never leaves
  the previous room's rows as a ghost.

## 2.3 Interface

- **HTML owns the skeleton, CSS owns the appearance, JavaScript owns behavior.** HTML contains no inline
  CSS or script; CSS and scripts are external.
- Without JavaScript the page is complete: navigation, topbar, timeline region and input are present,
  with no data. On a narrow screen the navigation and content stack; navigation still expands. A
  JavaScript-only capability is a `<button>` explained by the panel; never an `<a>` pretending to work.
  The router shows the note and language links without a spinner when scripting is unavailable.
- **Two inks, one paper.** A surface declares its paper and derives text color from it. Light and dark
  have one set; `light-dark()` is the switch. Every color, font, size, space, radius and duration is a
  token. Rules use tokens only. The selection blue-gray is the only approved non-ink/page color; danger
  and verified are the semantic state exceptions.
- Fluid layout with `clamp()`, `minmax()`, `auto-fit` and container queries. No width media query. Narrow
  and wide are two states of one layout.
- No shadow, gradient, dashboard card, or vendor-style chrome. Topbar, navigation and every dialog or
  floating menu may share one restrained translucent paper plus Gaussian blur. This is the only glass;
  no second glass language.
- Focus is always visible. A target is at least 24px. Motion is short, interruptible, and limited to
  transform, opacity, and color; reduced-motion turns it off.
- Copy states only what the reader needs. It does not explain what is visible and is not marketing or
  robot prose. Copy lives in a typed catalog; a missing key is a compile error.
- Enabled control text uses normal ink. Muted color is for metadata, previews, placeholders, and disabled
  controls. Never use muted text to make an enabled button look secondary.
- No inverted controls. Background steps go from the current paper one small step darker (light) or
  lighter (dark). A solid ink background with page-colored text is a dashboard button, not this system.
- Grouped controls have a normal outer radius and smaller inner radii. An internal row never inherits the
  outer card radius.
- A control that is inherently selectable text does not get a copy button. Native text selection is the
  affordance.

## 2.4 Dialogs and floating surfaces

Two classes, not one.

- **Dialog**: settings, search, new message, invite, join, create, room settings, message source, media
  viewer, confirmation. Use `<dialog>` with `showModal`, a `--scrim` backdrop and a weak blur, inert
  background, focus inside, and focus returning to the trigger. Backdrop, Escape, and the close control
  close it. Open with `commandfor`; dismiss with `closedby` where the target engine supports it. If an
  engine in the floor lacks it, one explicit fallback is allowed only after a platform decision; there
  is never a second dialog implementation.
- **Popover**: room menu, language menu, emoji/sticker picker, attachment picker, search scope, send menu,
  profile, context menus. Use `popover` with `popovertarget`, no backdrop, no focus trap, outside click
  closes. Use anchor positioning and implicit anchor. Menus and pickers use `auto`; room and message
  context menus use `manual` because Firefox light-dismisses an auto popover on right-click release.
  A trigger toggles its own popover; a second activation closes it. Opening a new floating trigger closes
  an open context menu first. Content-sized popovers shrink to their items. The topbar room menu is
  anchored at the topbar's bottom and right edges with equal small gaps.

Pointer context menus are measured with `visibility: hidden`, positioned at the pointer, then revealed
without an entrance transition. A non-empty text selection keeps the native menu. A touch long-press
suppresses `contextmenu` only when no text is selected. Keyboard context menus use the row/button
position. Focus returns to the originating row after close.

Dialogs and floating menus share one glass language. Dialog paper is opaque with `--dialog-blur`; topbar,
navigation, and floating menus use the translucent `--float-blur`; right-click menus use the slightly
stronger `--context-blur`. There is no second glass.

## 2.5 Chat

### Left navigation

- One raised surface card contains the action menu: new message, invites, join, create, settings. Below it
  are sections: favorites, rooms, direct messages, spaces. Default state: rooms open, others closed,
  remembered per account. Empty sections keep their collapsed header. Section labels are bold.
- A space expands its children in place without changing the right content. A room row has avatar, name,
  preview, unread/mention badge, mute state, and active highlight. It does not show time or an ellipsis
  button. The menu opens on right-click, long-press, or the keyboard context-menu key.
- The room context menu contains mark read, mute/unmute, favorite, and leave. The space menu contains
  space settings and leave. Low-priority rooms never enter navigation; they are listed in settings.
- Room cards use `space-2` left padding. The bottom account card has its own paper. The topbar room menu
  contains only room settings, media and files, search, and invite.
- Clicking a room selects it and focuses the composer immediately. The reader can type without a second
  click. The old room's rows are cleared before the new window paints.

### Search

Search is entered only from the room menu. It never searches left or unknown rooms. The left side is the
keyword field, the right side is the scope control, with a clear gap. The scope trigger has a chevron that
points down while its content-sized popover is open; activating it again closes it. The scope list starts
with all rooms, then the remaining order, defaults to the current room, and shrinks to content. Media and
files use two modes: media is images and videos; files are every other attachment. Results search body,
sender, filename, and image/video descriptions; media placeholders are `[image]` and `[video]`.

### Leaving and signing out

Leaving a room, leaving a space, and signing out (one device or all others) share one confirmation
surface.

### Right topbar

Back on narrow screens, room avatar, title over topic, room menu. Title and topic truncate, never wrap.
The bar remains when no room is selected. With no room, no room content is rendered. Signed-out and
gate-incomplete states are drawn by JavaScript after the session is known; the static shell does not
preload them.

### Timeline

- Own messages align right; others align left. In a sender group, the nickname is on the first row, the
  avatar is a complete circle on the last row, aligned to the group bottom. Inner bubble corners chain:
  first bottom-inline-start, middle both inline-start corners, last top-inline-start use
  `--bubble-inner`; mirror for own messages. Reactions sit below the message body so the avatar aligns
  with the message, not the reaction row.
- Text bubbles shrink to content up to `--bubble-max`, break at any character, and leave normal spacing
  between messages. Media cards sit slightly deeper than bubble paper. Images and videos do not show a
  filename. Their timestamp is a dense chip inside the media at the bottom right. A sticker has no bubble
  paper; its timestamp sits below the sticker art at the bottom right in a translucent watermark chip,
  never over the emoji. File/audio timestamps sit inside the card at the bottom right.
- Images load near the viewport with native lazy loading and async decoding. Videos are compact preview
  cards that open a centered player. Images open in a compact window, zoom inside the window, and close
  on backdrop or close control. The loading stage is darker than dialog paper, and the media does not
  flash.
- Undecryptable messages state the reason. Loading older and jump-to-newest never block scrolling.
  Backfill preserves the anchor; opening another room resets the anchor and pinned state. A new unread in
  the active room while away from the bottom shows a jump control with the count. Reaching the bottom or
  using the control marks read. Other rooms use navigation badges, not a toast.
- Reactions sort by count with stable ties, show at most six, wrap within the measured message content
  width, and fold the tail behind a final `+N` toggle.
- Clicking a room with unread positions at the read boundary without a permanent row highlight. The
  unread count clears once the position is actually read.
- The message menu contains reply, react, edit, delete, copy text, source, select, and cancel send at the
  bottom. Open it by right-click, long-press, or keyboard context menu, never an ellipsis.
- Multi-select starts from the message menu or a left swipe. The check appears opposite the avatar at the
  row bottom, absolutely positioned so no element moves. The whole row toggles it; selected message
  bodies, media and reactions dim together; the check stays outside the dimmed content. The selection
  toolbar is fixed below the topbar, aligned with the composer: cancel at inline start, count in the
  middle, select all at inline end, each its own pill-shaped glass bubble with normal bold text. Select
  all adds only rows intersecting the current timeline viewport to the existing selection; it never
  removes a selected row and never takes offscreen history. A selected-row menu offers copy, forward,
  delete; delete confirms. Escape, room switch, or cancel leaves selection.
- Room rows swipe right to mark read and left to mute; message rows swipe right to reply and left to
  select. Swipe binds only touch and pen; mouse keeps native text selection and copy. The action icon is
  revealed past a threshold and the row moves with the gesture.
- A grouped message has no sender name on later rows. Date separators are inline small elements.

### Composer

- Actions: attach, stickers, input, emoji, send. The attachment button opens the file manager and sends
  selected files immediately as file messages, not into the tray. Pasted files enter the tray as images
  and remain removable, progress-tracked, cancellable, and retryable. Enter inserts a newline; Ctrl/Cmd+Enter
  sends; IME composing never sends. The field grows to a limit, then scrolls internally. Drafts are per
  room. The send button's long-press or context menu offers normal text and Markdown and sends immediately.
  Only rich-text bubbles render Markdown; normal text stays plain. Tray order: files first, one message
  each, then text. The composer and timeline fill the content column; no `--content-max`.
- The sticker picker has one fixed frame: recent stickers, a horizontal row of emoji and sticker packs,
  and a vertically scrolling panel. The emoji panel carries every emoji. The reaction picker uses the
  same full emoji panel with its own recent list.
- Typing `@` at the start of a word opens a height-limited member list filtered by display name and MXID.
  Arrow keys move, Tab/Enter/click inserts one inline mention, Escape closes. The caret remains before
  the placeholder when the field is empty; the placeholder is decorative and never consumes the caret.
- The send flow is optimistic only through the worker-owned outbox. A queued row is written before the
  request, keeps its transaction id, shows progress below the time, and is replaced by the remote echo.
  A failure shows a small danger badge with actionable copy; retry resets it; discard deletes it.

## 2.6 Login, key gate, settings

- Server address, `.well-known`, `/versions`, `/login` flows; password login, SSO, registration including
  interactive auth. Password reset appears only when the reset flow exists.
- The key gate is enforced. Three paths: recovery key/passphrase, SAS from another device, and restart.
  After registration only restart. A new recovery key is shown once, monospaced, copyable, downloadable,
  never logged. Until the gate is complete the chat is not interactive and room data is not rendered.
- Settings is one dialog: account, notifications, security, about. Account has avatar, display name, MXID,
  sign out. Security has device verification, recovery key, backup, reset, session list with verify/sign
  out one/sign out others. Notifications has in-app badge, title total, desktop notifications (off by
  default, gesture request, closeable preview). About has version, source, licenses, no analytics. No
  language customization.
- Room settings from the room card menu: overview, members, notification mode, encryption state
  (read-only), leave. Read-only when the reader lacks permission. The avatar aligns with the top of the
  first field; access controls are full-row buttons; grouped device rows have a larger outer radius and
  smaller inner radii. Verified is a green mark after the device name; unverified has a Verify button.
- Profile opens from a sender, member row, or mention.

## 2.7 Platform and security

- Chrome, Firefox and Safari versions available in October 2026. Baseline 2026 is the floor, not a
  ceiling. Every new feature is checked with the command, never memory or an article. Only features
  supported by all three engines are used.
- Events, profiles, room names, topics and `formatted_body` are untrusted. Rich text goes through one
  allowlist sanitizer. CSP forbids inline script and style. No third-party request, no analytics.
- Tokens and keys live in the worker; the main thread sees a session summary and a one-time recovery key.
  Never log tokens, keys, or message bodies. State the threat model honestly: origin-wide storage means
  XSS is the real boundary; the sanitizer and CSP are load-bearing.
- Offline is normal: precache the shell; navigation cache-first with background revalidation; messages,
  rooms and avatars live in IndexedDB owned exclusively by the worker; homeserver requests never enter
  the HTTP cache.

## 2.8 Scope

- **Build first:** login and the key gate.
- **In scope:** rooms and timeline, send/receive, reply/edit/delete/reaction, media, stickers and emoji
  packs, local search, settings, sessions and device verification, channels, notifications, offline.
- **Out of scope:** calls and video rooms, threads, low-priority sections. Invites enter the menu.

## 2.9 Visual decisions that are not optional

- Active and hover in navigation are distinguishable; a selected room inside a space must not look like
  an unselected one.
- The bottom account card has its own paper. Its menu uses the account hover paper; light and dark each
  have independent role tokens.
- The topbar and left navigation share one translucent layer; both may be slightly transparent. The
  topbar's right menu keeps equal small gaps from the topbar bottom and the window edge.
- The chat area is full content width, not constrained by `--content-max`.
- Text bubbles shrink to content; gaps between messages are larger than inside a group; reaction
  backgrounds are faint by default and one step stronger after choice.
- Clicking an unread room goes to the last read position; no permanent first-unread row highlight.
- All icons are one 24px, rounded, 1.75-stroke system.
- Every dialog and the right topbar use Gaussian blur; strength is tiered. Settings close control and
  navigation positions do not move when tabs change.
- Component papers and text roles are independent: navigation, account, topbar, bubble, menu, dialog,
  field, composer and card each declare paper and ink.
- Settings switches: off knob at start, on knob at end; on track uses paper ink. Dialog blur is weaker
  than floating menu and topbar blur.
- Settings left navigation is one paper; the account row has exactly one background; right content does
  not add a second section card. Active tab uses a deeper card step; title and content share dialog paper.
  The settings sidebar is only slightly lighter/darker than dialog paper; active uses a very faint tint,
  no side bar, no bright fill.
- Room settings reuses the same left paper, right dialog paper, active tab and flat sections, with the same
  fixed size as settings. Switching tabs never moves the close control or navigation.
- Sticker panel has a fixed frame: recent row, horizontally scrolling emoji/pack tabs, vertically
  scrolling content. Switching packs never changes the frame. Default active tab is the first.
- Images and videos do not show filenames. Their time chip is inside the media at lower right, denser than
  the card. Before load, the media area is a soft, darker placeholder. Sticker time is in the same small
  translucent watermark chip below the art.
- Input placeholder stays one line, ellipsizes, and has no book-title punctuation. Focus outline uses the
  same soft focus color for every input, both schemes.
- Enabled button text is normal ink. Muted is only for metadata, preview, placeholder, or disabled.
  Backgrounds for actions are light and content-sized; switch is the only control without a button paper.
- Popovers and floating menus are visibly distinct from the chat page; do not reuse the page paper. The
  account active state and its menu are one small step darker in dark mode. Light menu hover is clearly
  distinguishable from the default.
- Grouped rows: outer radius normal, inner row radius smaller. Device rows are one group.
- Version is a stacked label/value, not a two-column setting line.
- Source text is selectable as one block; no copy button.
- Count bubbles are a small paper step from the navigation, never an ink/page inversion. Mention badges
  may use danger, with page-colored text.
- Mention chips have adequate inline padding, a complete circular avatar, and a truncated MXID.
- Empty composer shows the caret at the inline start, before the decorative placeholder.
- No control explains itself with a second visual language: same focus color, same disabled opacity, same
  hover step family.

## 2.10 User-owned decisions

These are the user's, not the agent's. Until answered, the conservative option is used and recorded in the
owning paragraph.

- Read receipt privacy: public `m.read`, private `m.read.private`, or both; what "last read" means.
  Until the user chooses, the worker advances only the public `m.read` receipt plus `m.fully_read`;
  `m.read.private` is never written. "Last read" is the event at the persisted advancing marker.
- Unread badge: server notification count, local unread after decrypt, or both.
- Key-gate predicate: device keys, cross-signing, secret storage, backup, or all; what "recovery key" names.
- Device identity: reuse `device_id` or create one device per login.
- Room order when a room is both a DM and a favorite; where invites live.
- Old room behavior after upgrade: replaced, hidden, or merged.
- CSP for arbitrary homeserver origins: per-homeserver response header, service-worker navigation policy,
  or a documented narrower product promise.
- OAuth-only homeservers: unsupported state, OAuth implementation, or out of scope.
- Scope cut for the first usable release.

---

# Part 3 - Architecture, security and design

## 3.1 Threat model and security architecture

1. **The XSS boundary is the real capability boundary.** The app runs one origin. A script that executes
   in the main thread can read IndexedDB, including the worker's token database. "The token is only in the
   worker" is an ownership rule that keeps the main thread from using it accidentally; it does not stop
   XSS. The defense is: no unsafe DOM sink, one sanitizer, exact CSP, no third-party code, no inline
   script/style, and a minimal DOM surface.
2. **Worker ownership is one writer per fact, not a sandbox.** The account database, SDK, crypto, media
   cache, outbox and projection are opened only by the worker. The main thread owns UI preferences and
   the render store. Each fact has exactly one writer; the other side reads a typed projection.
3. **CSP.** Production must deliver a response-header CSP from one policy builder. The allowlist is the
   shell origin, the chosen homeserver origin and its websocket origin. `connect-src https:` and
   `wss:` wildcards are a migration defect. `img-src`/`media-src` allow only `'self'`, `blob:` and
   allowlisted raster `data:`; no remote `https:`. `frame-ancestors 'none'`, `base-uri 'none'`,
   `object-src 'none'`, `form-action 'self'`, `worker-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`,
   `style-src 'self'`. The static server and the service worker consume the same policy builder.
4. **Sanitizer.** One allowlist sanitizer for rich message HTML, one URL policy for avatars and media, one
   inert runtime markup admission path. A component may emit typed `Html`; it may not build HTML from
   raw data. `DOMParser` output is inert and is filtered for executable tags, event attributes, style
   attributes and JavaScript URLs before adoption. Data is escaped by `html` at construction time.
5. **Storage.** Account data (session, cursor, rooms, events, members, receipts, media, outbox,
   projection) is worker-only IndexedDB. UI data (locale, section state, drafts, recent emoji) is the
   account-scoped UI database. No message text or secret in `localStorage`. Clear UI data on logout;
   delete the worker account database only after a successful logout or an explicit destructive reset.
6. **Media.** Upload and download happen in the worker. Validate MIME and size; strip EXIF for images;
   cache by content address; return a `blob:` URL. The main thread never receives `mxc://` or an access
   token. `safeMediaUrl` accepts only local/blob/raster data URLs; `mxc` is not a DOM URL.
7. **Networking.** The main thread has no homeserver connection. The worker uses `fetch` with an
   `AbortSignal`, maps `M_*` error codes to typed failures, refreshes access tokens, and never puts API
   responses in HTTP cache.
8. **Logging.** Production logs carry codes and route names only. Never tokens, keys, message text,
   filenames, raw event JSON, or full URLs with query credentials.
9. **Third parties.** None. No analytics, remote fonts, CDN, preview service, or embedded widget.
10. **Service worker.** Precache the shell and hashed assets only. Never cache `/sync`, `/media`, account
    API responses, authenticated avatars or token/IDB data. Navigation is cache-first with background
    revalidation; one version is live.

## 3.2 Modern language and platform rules

### TypeScript and JavaScript

- ESM, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `useUnknownInCatchVariables`. No `any`; use `unknown` plus a guard.
- `skipLibCheck` is true only because the pinned `matrix-js-sdk` 45.1.0 declaration references a missing
  internal `.d.ts`; every project file is still checked under the full strict set. Remove the exception
  when the public SDK fixes the declaration.
- `typescript/no-unsafe-type-assertion` is enabled and has no file-level or global exception. A parser or
  DOM boundary narrows with a real guard; an assertion is not a substitute for validation.
- Discriminated unions for commands, events, failures and rows. `readonly` on DTOs. `satisfies` for
  tables. Type-only imports. No runtime `enum`; use `as const` maps.
- `const` by default, `for...of`, early returns, one obvious happy path. Prefer pure functions at the
  projection and parser boundaries.
- Native modern APIs: `structuredClone`, `crypto.randomUUID`, `AbortSignal.timeout`, `Array#toSorted`,
  `Object.hasOwn`, `Promise.withResolvers`, `navigator.locks`, `URL`, `URLSearchParams`, `Intl.*`.
  Confirm each web platform API with `npm run features`; unsupported is not used.
- No `var`, `arguments`, `for...in` over arrays, `apply`, `new Function`, `eval`, `document.write`,
  string timers, implicit globals, promise polling, or floating promises. Every promise is awaited,
  returned, or explicitly handled with a typed outcome.
- A class is used only when it owns lifecycle or identity. Data shapes are plain readonly objects.
- Do not import private SDK paths such as `matrix-js-sdk/lib/...`. Use the pinned public API or define a
  local adapter shape. If the public API cannot express the need, record the gap and pin deliberately.

### HTML

- Semantic elements first. Native `<dialog>`, `popover`, `commandfor`, `<details>`, `<button>`,
  `<label>`, `<nav>`, `<main>`, `<ol>`, `<time>`, `<figure>`, `<img>`.
- No inline style, script, event handler, `javascript:`, positive `tabindex`, redundant ARIA, or clickable
  div. A native control carries its own semantics.
- Images have `width`/`height` (or aspect ratio), `alt` or empty decorative `alt`, `loading="lazy"` and
  `decoding="async"` unless they are above the fold and first-paint critical.
- Every page has one `h1`, a language, a scriptless note, and stable region IDs shared by generator and
  client.
- Scriptless behavior is part of markup, not a JS rescue. A control that needs JS is a button with a
  note; a link is a link only when it navigates.

### CSS

- Tokens first. A token names a paper and a role; numbered color tokens and component aliases are
  forbidden. Literal colors live only in the palette block. Rules use `var(--role)`.
- One entry, one layer order: tokens, reset, base, layout, components, surfaces, motion.
- Use `light-dark()`, `color-mix()`, `:is()`, `:where()`, `:has()`, `clamp()`, `minmax()`, `auto-fit`,
  container queries, logical properties, `@starting-style`, anchor positioning, and native nesting only
  when they reduce code and pass the feature check. No viewport width media query, vendor prefix, shadow,
  gradient, or third glass language.
- Focus is one shared `--focus` for keyboard targets and one softer `--field-focus` for fields. An input
  border is not a second focus system.
- Enabled text uses the paper's normal ink. Muted is only for metadata, preview, placeholder, disabled,
  or a genuinely secondary icon. A disabled control keeps its accessible name and uses opacity; it does
  not rely on color alone.
- Disabled, loading, hover, open and active are distinct states with tokens; hover/active stay in the same
  paper family. No inverted surface.
- A token name is an API. It must name the object and state where it is used. Rest, hover, open and active
  roles are separate even when their computed values coincide. A rest rule using a `*-hover-bg`, a nav
  role used on a dialog, or a generic role used for a specific paper is a defect. Audit with:
  `grep -R "background: var(--.*hover-bg)" src/styles` and verify every hit is inside a hover/open rule
  or a dedicated semantic rest role.
- Avatar roles follow their paper: `--chrome-avatar-*` for navigation/topbar chrome, `--avatar-bg` for
  content/dialog avatars, never a nav token on a generic profile row.
- Skeleton, quote, holding, tray thumbnail, dialog control, and dialog row each have a named role. If one
  is missing, add the role; do not borrow a hover role.
- Outer grouped card radius is larger than inner row radius. An inner row never inherits its parent's
  radius.
- A pseudo-element placeholder is decorative and absolutely positioned; it must not affect the caret or
  line box.
- Any new CSS feature is checked with `npm run features` before use and recorded in `features.md`.

## 3.3 The model

1. **One writer per fact.** The worker owns the account database, SDK, crypto, media cache, outbox and
   projection. The main thread owns the UI database and render state. A module asks another layer for a
   fact; it never reads that layer's storage directly.
2. **Local first.** The projection is the source of the interface. A sync, reload, or offline start reads
   the same rows. The network is an update, not a prerequisite.
3. **Deterministic restore.** On load, cached session, gate state and rooms paint; the worker verifies in
   the background and corrects. The reader never watches a blank shell while crypto initializes.
4. **One protocol.** Client and worker never import each other; they speak typed commands and events. A
   command has an id and a reply; an event has no id. Every payload crosses a parser.
5. **One markup producer.** Build-time components emit typed `Html`; the client mounts and patches those
   shapes. The client does not own a second copy of a surface. Runtime generated markup is admitted only
   through the one inert admission path.
6. **Every promise has a check.** A rule no check enforces is a wish; 1.9 names the owner.

## 3.4 Worker

One dedicated module worker per tab, created when the page needs data.

- `start` first opens the account projection and emits cached rooms plus the last-opened stored window,
  then initializes crypto and sync in the background. The reply carries a session summary, connection and
  `unknown` gate until the worker can decide. The cached gate hint belongs to the route guard, never to
  the worker predicate. The main thread never waits for crypto to paint.
- `login`, `logout`, `start` **must** be serialized by one queue. `navigator.locks` holds the account lock
  across startup and crypto; a second tab gets `locked`, not a second client. The serialization queue is
  still a 6.4 item; the lock is present.
- The worker owns the outbox: write the queued row before the request, keep it until echo or explicit
  discard, emit status, error code and retry availability.
- The worker owns the projection DB. Stores currently present: rooms, events by room/time, read markers,
  segments and outbox. The session record is separate; members and media are not yet persisted in this
  DB. Project only the changed event and the room fields it touches; read a page by a stable event-id
  cursor.
- Backfill names the oldest stored event id and returns one page. Preserve segments across `limited`
  sync gaps. Handle `TimelineReset` explicitly; never clear a readable segment because a sync was gappy.
- Read state reads `m.fully_read` account data and the public `m.read` receipt; the conservative interim
  choice is public only, never `m.read.private`. Mark read once when the persisted advancing marker moves,
  never on every render. The marker is stored per room and unread/highlight come from projected events
  after it, never from `getUnreadNotificationCount`.
- Unread is a product policy stored explicitly, not `getUnreadNotificationCount` used as an array index.
- The `members` command projects the SDK's current member state. A full preload
  (`loadMembersIfNeeded`) and an explicit partial-list label are not implemented yet; do not claim a
  complete member projection on a lazy-loaded room.
- Threads are out of scope in 2.8. The SDK starts with `threadSupport: false`; no thread surface exists,
  and thread notifications must not be claimed. Turning thread support on is a product decision with a
  projection, notification policy and tests.
- Media upload/download/thumbnail and search live here. Upload validates magic bytes and MIME, strips
  image metadata, encrypts with AES-CTR in encrypted rooms, uploads once and sends `m.image/m.file/
  m.video/m.audio/m.sticker` with txn ids. Download is authenticated, `cache: "no-store"`, hash-verified
  before decrypt, MIME-allowlisted, cached by content address and exposed only as a `blob:` URL. Search
  reads the account projection plus outbox, never the current window or server `/search`.
- The projected `MessageRow` never carries an mxc URI, token, encrypted file key or local file bytes.
  Worker-only `MediaSource` rows and the media cache live in the account DB; every emitted row is
  checked by the protocol guard.
- A worker error marks the connection offline. A bounded restart is not implemented yet; every command
  still has a timeout and must clear its visible wait on failure. There is no main-thread SDK fallback.

## 3.5 Data

The account database stores rooms, events (by room and room+time), read markers, segment tokens, outbox,
worker-only media sources and the verified media cache (blobs, usage/LRU). The session record lives in the
separate `maski:matrix` store. Members are not persisted in the projection DB. The account database is
worker-only.

A message row carries identity, room, sender, name, avatar, time, kind, body, HTML, media, reply, edited,
reactions, mentions, status, failure code, encrypted state and redaction. HTML is stored raw and crosses
the one sanitizer before it reaches the DOM; the DOM never receives it unsanitized. Search tokens are a
future field, not a current claim.

The projection has two directions. Forward: every event after the room cursor plus the last bounded
window, because an edit, reaction, or redaction can change an older row without adding one. Backward:
from the oldest stored id through the segment/token chain. A store is never cleared for a room except an
explicit leave.

The outbox is an ordinary row keyed by transaction id, written before the request. For media it carries
the sanitized Blob and upload metadata; the worker uploads once and persists the worker-only reference
before sending the event. The echo carries the same transaction id and replaces the row. A failed send
keeps the row with a typed code; retry repeats only the missing upload or send; discard deletes.

Reactions and replies are projected into the message row when the SDK aggregate provides them; there is no
second replay store. An annotation counts once per sender per key; `me` is the viewer. Production react,
edit and redact commands re-project the target row and emit a patch; the client never toggles the row
itself.

Read state is one advancing call that moves the public read receipt and `m.fully_read` together. The room
row stores the marker id so the timeline can draw where reading stopped.

Drafts are in the account-scoped UI IndexedDB. Locale, last account identifier, section open state, spaces,
notification preferences, backup hint and recent emoji/stickers remain account-scoped `localStorage` values;
none is a secret or message history. The split is deliberate: drafts and message text never enter
`localStorage`. Logout clears the UI draft rows and the account-scoped preferences.

## 3.6 Protocol

| command | reply | notes |
|---|---|---|
| `start` | cached session + gate + cached rooms | returns before crypto; sync follows |
| `login` | session | password login; credentials arrive once and never stay on the main thread |
| `loginToken` | session | one-time SSO `loginToken`; the URL query is stripped immediately |
| `ssoUrl` | URL | worker builds the homeserver SSO redirect, never holds the token |
| `register` | session + one-time key | password + dummy stage; the worker installs one session and attempts key setup |
| `logout` | empty | clears SDK/crypto/session; the account projection survives only until an explicit reset |
| `keyStatus` | typed gate | verified device + ready secret storage, not a boolean guess |
| `recover` | typed gate | recovery key/passphrase → secret storage → cross-signing signing |
| `open` | window | stored window first; ingest on miss |
| `older` | one page | before oldest stored id, segment-aware |
| `send` | queued row | text body, html, reply relation, transaction id; media bytes never use this path |
| `sendMedia` | queued row | Blob + caption + kind; worker validates/sanitizes/encrypts/upload once |
| `sendSticker` | queued row | pack id + shortcode; worker sends the pack image's original mxc + info, no upload |
| `media` | blob URL | worker-only source → verified, allowlisted blob; `thumbnail`/`full` |
| `devices` | device rows | read-only device list with verification state; no key material |
| `retrySend`, `discardSend` | row / empty | worker-owned outbox state |
| `markRead` | empty | one advancing public marker plus `m.fully_read` |
| `members` | members event | the SDK member projection |
| `resetIdentity` | recovery key once | destructive reset; the key is displayed once |
| `react` | empty | `m.reaction` annotation, or redaction of the viewer's own live reaction |
| `edit` | empty | `m.new_content` plus `m.relates_to` `m.replace`; the original event id is the target |
| `redact` | empty | `redactEvent`; the row stays as a redacted tombstone |
| `typing` | empty | `sendTyping` 30 s on, 0 off; nothing is persisted |
| `search` | rows | account projection plus outbox, deduped, bounded, one matcher |
| `leaveRoom` | empty | `leave`; the projection is deleted only after success |
| `setRoomTag` | empty | `setRoomTag`/`deleteRoomTag` with order 0.5 |
| `setNotification` | empty | room mute push rule only; `all`/`mentions` are unsupported |
| `setRoomState` | empty | name/topic/join rule/guest/history/aliases/directory, one field per command |
| `inviteUser` | empty | `invite` with the SDK permission check |
| `joinRoom` | room id | `joinRoom` for an id or alias |
| `answerInvite` | room id or empty | accept joins, decline leaves |
| `createRoom` | room id | private room or DM, with a merged `m.direct` entry for a DM |
| `forward` | empty | decrypted content re-sent without relations or mentions |
| `memberAction` | empty | `kick`/`ban`/`unban` with a worker power-level guard |

Events: `session`, `keys`, `rooms`, `window` (`patch` or page), `members`, `devices`, `invites`,
`typing`, `connection`, `outbox`, `media` (blob URL or revocation).
Payloads are bounded; a lost event costs one window, not a rebuild. Every inbound command and event
crosses a parser; a malformed command keeps its valid id and returns `invalid`. A reply that matches no
pending id is ignored and does not leak.

`ChatSource` cannot have a method without a protocol command, handler, projection and test. The production
source exposes only implemented commands and the client hides the rest by `SourceCapabilities`; the mock
source is a review fixture and advertises the whole surface. Hiding a control is better than a no-op.

## 3.7 UI

The store is a key table, not a render pass: phase, session, rooms, room id, messages, loading/cursor flags,
typing, recents, sections, notifications, members, devices, invites, recovery/backup state. `write`
compares each key by reference and notifies only changed keys. A region subscribes to keys it reads.

Regions are navigation, header, timeline, composer, surfaces. Each owns its DOM lifecycle. Timeline rows
are keyed and patched by field; navigation nodes move by room id; the topbar updates in place. No full-list
`replaceChildren` for the timeline, no `innerHTML`, no `outerHTML` comparison, no serialized signature
string. Focus, caret, selection, scroll anchor, lazy media and IME state survive a repaint.

Surface bodies are not yet field-patched: they still use the inert `replaceHtml` admission path, which
reparses a body. That is a 6.4 item and must not be described as reconciliation. The path is inert and
never owns data from a second producer.

The composer owns its draft, tray, height, selection, mention state and focus. A store change never
rebuilds it. Navigating to a room focuses the composer immediately when it is enabled.

## 3.8 First paint

The static document is the shell: markup, stylesheet, script tag, regions, scriptless note. It contains no
room data, no "not signed in" sentence, no loading placeholder and no identity.

On the chat page:

0. The account's last gate state selects the interface phase. If a cached room window exists, it paints
   before any skeleton. Without one, only the room area shows static skeleton rows while `roomsLoading`;
   the action card, topbar and composer keep their final boxes.
1. The topbar is part of the static shell at its final height. Avatar/title/topic appear when known; the
   bar does not move.
2. `start` is posted; the cached session/rooms event renders. The worker verifies the gate; `open` follows.
3. Nothing animates on this first pass. A sync changes rows in place.
4. A reload is the same path. A background sync is the quiet one.

The static shell carries no user state. The client paints the cached rooms/window first, then patches the
same regions from the start reply and sync; it does not replace the page or scroll twice. The first paint
does not mark read before the reader is positioned. A room switch may mark read once the read boundary is
positioned and visible, never on every render. `prepaint` sets only the interactive view and saved section
state; it writes no data, badge, draft or scroll position. With scripting disabled, the router shows its
note and language links without a spinner, and the navigation note sits inside scrollable sections so
labels keep their top position.

## 3.9 Visual system

The palette is the frozen sRGB set: page, ink scale, surface steps, bubble/menu/chrome/nav/float glass,
focus, danger, verified, mark, selection, media, scrim. Each paper declares its own text and state roles:
`--nav-*`, `--account-*`, `--topbar-*`, `--bubble-*`, `--menu-*`, `--dialog-*`, `--field-*`,
`--composer-*`, `--card-*`. A component never takes the page ink when its paper is a card, bubble or glass.
`color-mix` may derive a role from its own paper and ink; a literal color lives only in the palette.

Surfaces: page, chrome, navigation, account card, raised card, bubble, menu, dialog, field, composer.
Topbar/navigation/menu share one glass; right-click menus use a slightly stronger blur; dialogs use a
weaker blur so the card stays readable. No shadow, no gradient, no visible border.

Hierarchy is typography and paper step, not elevation: normal ink for controls and content; muted for
metadata, preview, placeholder and disabled; one title size per surface; labels are smaller and muted,
values are normal ink. A full-width select is one button row. A grouped list is one outer card with smaller
inner rows. An enabled button never uses disabled color.

Fluid geometry: navigation `clamp(15rem, 22vw, 19rem)`, chat full content width, bubbles/media `36rem`,
fixed space 1-7, radii, control sizes and ease. Container queries, not width media. Every control has
`appearance: none` before styling and a visible focus outline. A focused reaction hugs its card and sits
above adjacent rows. Reduced motion stops only functional loops.

## 3.10 Build, assets, CSP and offline

Four entries: guard, prepaint, client, stylesheet; bundled by esbuild, minified, content-hashed, with a
metafile the page generator reads. Worker and wasm entries are separate. Every JS bundle targets the same
three-engine floor, uses UTF-8 output, tree-shakes, emits no sourcemap, and drops `console`/`debugger`
calls in production. HTML uses the same minifier options in build and audit. Output is generated and
audited byte-for-byte; `dist/` and `build/` are owned by the build.

Assets are one of: a module import, a stylesheet `url()`, a page asset named in the generator and resolved
through the manifest, a fixed-name file declared in a `<meta>`, or a platform file copied verbatim. A
generated asset is never hand-edited. The worker never imports an asset. The generator never imports a
browser module.

The crypto wasm is copied by the build, hashed by bytes, served as `application/wasm`, and initialized
explicitly before rust crypto. The service worker is generated with the manifest inlined; install
precaches the locale pages and hashed assets; navigation is cache-first with a background revalidate;
`skipWaiting` and `clients.claim` keep one version live; registration is production-only with
`updateViaCache: "none"`.

CSP is generated from one policy builder, consumed by the static server and the service worker as a
response header. A meta CSP is a fallback only when no serving layer exists, and the limitation is
recorded in the open defects. No wildcard connect source when an exact origin can be known. The static
server also sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, and a restrictive
`Permissions-Policy`.

Budgets are measured by the build and enforced by C6. Values in this contract are ceilings, not targets:
client JS 336 KiB, stylesheet 96 KiB, matrix worker 1.5 MiB, crypto wasm 8.5 MiB, generated watermark
96 KiB, no unbudgeted asset above 8 KiB. The build prints every size. A budget increase is a user
decision, never a silent output of a refactor. The client ceiling changed from 320 to 336 KiB on
2026-11-16 at the user's request so user image packs fit; the input ceiling is unchanged. Audit enforces
client, stylesheet, worker, wasm and watermark and reports every measurement; the generated watermark is
packed under its ceiling.

## 3.11 Testing

The following is the required set. 6.3 records which rungs have actually run; a requirement is not a
current claim.

Pure tests: catalog parity and placeholder substitution, HTML escaping, one message grouping pass, store
notification granularity/batching, generated page structure and locale addresses, surface registry,
data-free shell, per-paper color roles, grouped avatars and bubble corners, CSS token/selector invariants,
watermark determinism, protocol parser, source capability parity, projection at 1/30/1,000/10,000 events,
permissions, URL policy, sanitizer allowlist, outbox state machine, cursor/gap rules, recovery key decode,
service-worker cache allowlist, the account-scoped UI draft store, media MIME sniffing, AES-CTR
encryption/decryption with ciphertext hash verification, upload-once/retry-send outbox state, and the
no-mxc/no-key media projection. Auth error mapping is not complete until the remaining `M_*` map exists.

Browser surface tests: live chat at 390/856/1280, light/dark, scriptless, RTL, keyboard, reduced motion;
dialogs and popovers; selection and focus; computed style where appearance is the claim; first-paint
screenshot pairs and box comparisons. Worker browser tests: start, login against a fake homeserver, initial
sync, open, older, send, echo, receipt, decrypt success/failure, malformed command, two-tab lock.

Real-server tests: the whole flow on a device whose state is real, including first paint and the timing of
rooms versus crypto. A mock cannot prove a worker command. A CSS regex cannot prove focus, caret, or
scroll. A screenshot after an arbitrary wait cannot prove first paint.

The feature check: every new web feature is looked up before it is written and recorded in `features.md`;
the check passes for the platform floor. No feature that only one engine supports.

## 3.12 Platform

The authority is the `web-features` dataset, with compatible MDN data for gaps, and `features.md` records
what the project uses. The floor is Chromium 156, Firefox 157 and Safari 27.0, reviewed for October 2026.

Before a feature: does the design need the behavior; does what exists already do it; is the feature larger
than the need; does it replace code or add a second spelling. Confirm with `npm run features`. Rejected
for the floor: scroll-driven animations, `interpolate-size`, `text-box`, cross-document view transitions,
Temporal, and any feature missing from one engine. Use native `dialog`/`popover`/`commandfor`/anchor
positioning/container queries/`light-dark`/`color-mix` only while the floor supports them. `closedby`
and other edge features need a recorded fallback or removal.

## 3.13 Phases

| phase | work | exit |
|---|---|---|
| P0 | pipeline: build, pages, audit, features, layouts, components, router, chat pages, stylesheet | generated locale pages, audit green, chat complete scriptless at both widths and schemes |
| P1 | worker skeleton: entry, hashed wasm, init, login, sync, projection DB, protocol parser, account lock, outbox | browser harness signs in, syncs, sends, reads the echo, reopens offline |
| P2 | every page and the stylesheet in full | no dead control, every page complete scriptless |
| P3 | data: database, both projections, cursors, gaps, store, sections, timeline, composer | a real account lists, reads, sends, keeps its place through backfill and reload |
| P4 | discovery, login, key gate, router, refresh/soft logout | login lands on the gate, the key opens it, the chat opens behind it, real server |
| P5a | message actions, room menu, room settings, join/create, media | a reader acts, a media row loads in the worker, a room is managed |
| P5b | local search, settings, sessions, verification | search finds and jumps; a session is listed, verified, signed out |
| P5c | spaces, packs, invites, profile | a space expands; a pack is kept; an invite is answered |
| P6 | service worker, offline, notifications, language, accessibility, budgets | offline reload works; every budget passes; measurements reported |

The project is done when every line of Part 2 is present and verified at rung 5, open defects are empty,
the gate is green with no budget raised, and a reader can start from this file alone.

---

# Part 4 - Visual language and aesthetic DNA

This part is the design critique, not optional taste. It explains why the interface looks the way it does
and what would be a regression.

## 4.1 What the interface is

This client is a **quiet reading and writing surface**, not a dashboard, a marketing page, or a chat toy.
Its visual model is paper and ink:

- A page is one paper. Chrome, navigation, bubble, menu and dialog are different papers laid on it.
- Hierarchy comes from paper steps, type size/weight, and one normal ink. It does not come from elevation,
  shadows, gradients, borders, accent colors, or many card shapes.
- Density is intentional. Rows are compact; the reader sees more conversation and control with less
  scrolling. Empty marketing space is a cost.
- The interface is calm but not low-contrast. Quiet means no decorative noise, not faint controls.
- The reader's content is the accent. The shell is neutral; media, names and messages carry color.

## 4.2 How this differs from mainstream clients

Mainstream SaaS and chat clients tend to use:

- a bright blue or violet primary action, a white card on a gray page, 16-24px shadows and gradients;
- large rounded cards inside larger cards, a dashboard header, oversized empty states, and a marketing
  hero;
- shimmer skeletons, entrance animations, toasts, and a settings surface that reinvents a form;
- an accent color for every icon, active tab, badge and count;
- a black/white inverted button pair.

This project rejects all of that. It prefers:

- one neutral paper family, near-black/near-white ink, and semantic color only for danger and verified;
- flat surfaces, no shadow, no gradient, no visible border; separation by a small paper step;
- compact density and truncation instead of wrapping or expanding the chrome;
- native affordances: text is selectable, links navigate, buttons are buttons, context menus are menus;
- quiet state changes: hover/active change the paper one step, not the hue;
- a single glass language for chrome and floating surfaces, with dialogs more opaque and less blurred;
- one accent-less hierarchy where the conversation is the visual subject.

A blue primary button, a shadow, a gradient, a `box-shadow` card, a dashed border, a bright filled tab,
or an ink-on-page inverted badge is a style regression.

## 4.3 The paper ladder

Use a small, ordered ladder. In light mode darkening is the direction; in dark mode lightening is the
direction; the span is deliberately narrow.

1. Page: the room behind content.
2. Navigation/chrome: a glass layer close to the page.
3. Account card: one step above or below navigation.
4. Raised card, bubble, field: a step that belongs to its content.
5. Menu/float: a visible floating paper, distinct from the page but not a second theme.
6. Dialog: opaque paper, weaker blur; readable for long forms.
7. Active/pressed: one further step in the same paper family.

A count badge is step 4, not a black/white inversion. A menu item hover is step 4, not the page color. An
active account row is step 4-5, not a bright accent block. A disabled control is opacity, not a different
hue. A verified mark is the only green; danger is the only red.

## 4.4 Typography and controls

- Titles are the same family, larger and heavier. Labels are smaller and muted. Values are normal ink.
- An enabled control never uses metadata color. A full-row select is one button with a label, value and
  chevron; the whole row is the target.
- Buttons have a light paper, fit content or fill the row when the design says so. A button is not a
  colored block unless it is destructive or a primary confirmation.
- Icons are one 24px, rounded, 1.75-stroke family and inherit the paper ink. An icon-only button has an
  accessible name and a visible hover/focus state.
- Text that can be selected does not get a copy button. Selection is the affordance.
- Placeholders are decorative, single-line and truncated; they never move the caret.

## 4.5 Grouping and geometry

- A group of rows is one card. Outer corners use the normal radius; inner rows use a smaller radius.
  There is no stack of four independent cards.
- A sender group is one visual block: name on first row, avatar on last, inner bubble corners chained.
- A bubble fits its content. A full-width bubble for two words is a regression. Media has its own card
  paper, slightly deeper than a bubble.
- A sticker is art without bubble paper. Its timestamp is a watermark chip below the art, never over it.
- A menu item hover is visible without becoming a selected tab. Active is deeper than hover; active and
  hover must be distinguishable.

## 4.6 Motion and feedback

- Motion is feedback, not decoration: a button press, a popover entrance, a loading spinner, a message
  status. It is short, interruptible, transform/opacity/color only.
- No entrance animation on first paint. No shimmer. No fade on a page load. A skeleton is static.
- A wait has a visible state and a cancel path. A spinner that can never clear is a defect.
- Reduced motion stops looping loaders and non-essential transitions.

## 4.7 Media and overlays

- Image/video cards are slightly deeper than the bubble; their time chip is inside at bottom right.
- The viewer is a compact window with a dark stage while loading, not a white full-screen page and not a
  generic attachment card.
- Emoji and sticker pickers are floating papers distinct from the chat page; their frame is fixed while
  content scrolls.
- Dialogs are opaque and weakly blurred; menus are translucent and more blurred. There is no second glass.
- A context menu is not a dialog: no backdrop, no focus trap, outside click closes.
- A dialog returns focus to the trigger; a context menu returns focus to the row.

## 4.8 The anti-pattern list

These are never a valid "improvement":

- `innerHTML`/`outerHTML` reconciliation, string signatures, or replacing a whole region to update one
  badge.
- Full-screen "loading" pages, skeleton shimmer, and content that shifts when data arrives.
- A second session model, a second gate flag, a second database writer, or a second markup producer.
- Optimistic state for a command that does not exist.
- A button whose text is muted, a badge that inverts ink and paper, a menu hover that matches its default.
- A design token used for the wrong object: `--ink` for a navigation badge, `--page` for an inverted
  button, `--account-hover-bg` as the default account paper, `--nav-avatar-*` on a dialog profile, or a
  component alias for a paper.
- A seven-color accent system, a gradient, a shadow, a glass layer on every surface, or a card inside a
  card inside a card.
- An icon button without an accessible name, a clickable div, a positive tabindex, or an inline handler.
- A "fixed" check that only searches source text while the rendered state is broken.

---

# Part 5 - Agent discipline and known failure modes

This project has repeatedly failed at boundaries, not at effort. The following patterns are known. An agent
that repeats them is not making progress.

## 5.1 The recurring failures

1. **The mock became the product.** `/review/` demonstrates every feature; the real worker supports a
   narrow slice. The UI is ahead of the runtime, and a screenshot of the mock is treated as acceptance.
2. **Two owners of one fact.** The main thread has session hints and optimistic rows beside the worker's
   session, projection and outbox. Two writers drift; one eventually wins unpredictably.
3. **Whole-region replacement.** `innerHTML`, `outerHTML`, string signatures and `replaceChildren` hide
   lost focus, caret, selection, lazy media and scroll positions. The tree is rewritten while the reader
   is using it.
4. **Pagination shaped by the UI.** A `want`/`keep` count instead of a stored cursor; a live-timeline dump
   instead of a segment chain. History stops at a gap and no one notices.
5. **A mock or a regex as evidence.** A green style regex, a generated HTML string, or a `/review/` click
   is reported as a product claim.
6. **A claim above its rung.** Part 4 says green while `tsc` fails; a screenshot after a wait is called
   first paint; a fake `SessionPort` is called a worker test.
7. **Append-only design.** New round sections contradict the owning paragraph; two descriptions of the
   same rule survive. The record grows instead of the data shape settling.
8. **A deep module owns the composition root.** A 1,600-line surface, a 1,000-line component module, a
   844-line composer. The 400-line rule is a wish.
9. **Security by convention.** "Token only in the worker" is stated as if it were a capability boundary;
   CSP allows every HTTPS origin; drafts sit in local storage; internal SDK paths are used.
10. **A fix that adds a token/state/writer instead of understanding the existing one.** The new variable
    is coupled to the wrong paper and the old path remains.
11. **Misreading the user's visual sentence.** "Buttons look faint" is fixed by a new color token instead
    of normal enabled ink; "placeholder caret" is fixed by hiding the placeholder instead of removing it
    from the caret's line box; "badge color" is fixed by inverting ink/page.
12. **Not deleting.** A replaced path, an unused export, a dead handler, a copy key, a second adapter and a
    temporary fallback survive the change.
13. **Unbounded async.** A request without timeout/cancel, a promise caught into `undefined`, a spinner
    that never clears, a worker error with no restart.
14. **Using the wrong SD layer.** A main-thread SDK import, an internal `matrix-js-sdk/lib/...` path, or
   a second `MatrixClient` on the same crypto prefix.
15. **A stale truth section.** Counts, build sizes, "done" claims and lines like "temporarily disabled"
   survive the tree that made them false. Part 6 is rewritten in the same change as the code.
16. **A capability boundary only in prose.** `SourceCapabilities` says a command is absent while a
   production control still exists or a method still no-ops. The set is tested against both sources.
17. **A fake gate hidden in local storage.** `maski.key`, `setKeyReady` or a fake unlock makes the gate
   green while the worker has no predicate. One worker owns the gate; the cache is only a hint.
18. **Green means done.** `npm run check` passes while 6.4 is non-empty, or a hidden feature is called
   complete because the control is invisible. Green is a gate, not the definition of done.
19. **A weaker proof for a stronger claim.** Declaration multisets, source regexes or pure tests are
   reported as computed layout, worker behavior or first paint. Name the rung; run it or remove the claim.

## 5.2 The required correction

For every non-trivial change:

1. Reproduce the current symptom in the real surface.
2. Name the owner of the fact and the boundary that is wrong.
3. Delete the second path before adding the first.
4. Implement one path end to end: type, parser, worker, projection, action, UI, test.
5. Verify at the claimed rung, not a lower one.
6. Record the evidence and the exact remaining gap.
7. If the user says it is still broken, do not patch the visible pixel blindly. Instrument the DOM,
   computed style, focus, selection, network and worker state, then find the cause.

A user report is ground truth about the symptom. A test that contradicts the report is not evidence that
the report is wrong; it is evidence that the test does not cover the symptom.

### The override duty

When the current code, a plan or an agent's own first draft is known to be weaker than a correct
implementation available inside the same boundary, do not preserve it to avoid churn. Name the risk,
replace the weaker path, and delete what it leaves behind in the same change. This is the default, not a
negotiation.

If the stronger change touches a Part 2 promise, a budget or a user-owned decision, stop and ask with the
recommendation and the consequence. If the user overrules, implement their decision, keep the defect
recorded, and never describe the weaker result as the best practice. "It works", "it is green" or "it was
already there" is not a reason to keep a known-bad boundary.

## 5.3 The anti-patterns table

| temptation | why it is wrong | replacement |
|---|---|---|
| "The component is in `components/`, so it is safe" | safety is about the sink and the data, not the file location | one typed `Html` builder and one inert admission path |
| "The token is in the worker, so XSS cannot read it" | IndexedDB is origin-wide | strong CSP, sanitizer, no unsafe sinks; honest threat model |
| "I added an optimistic state so it feels fast" | a second writer with no command | worker-owned outbox; hide the control until the command exists |
| "I rebuilt the region and restored focus" | caret, selection, IME and scroll are already lost | keyed rows patched by field |
| "A regex test proves the style" | it proves source text, not computed layout | browser run with computed values and a screenshot pair |
| "A mock screenshot proves the product" | it proves the fixture | worker rung and real-server rung |
| "The check is green, so the feature works" | the check may not cover the feature | name the check and its rung |
| "A little shadow/border makes it clearer" | it violates the paper system | use a paper step or type hierarchy |
| "A blue accent makes it look modern" | the product is ink-first and accent-less | use normal ink and one semantic color |
| "The CSS variable is reused, so the object is right" | coupling can be semantically wrong | name the role from its paper, e.g. `--nav-badge-bg` from `--nav`; `--account-bg` is the rest state, never `--account-hover-bg` |
| "The button is disabled-looking because it is quiet" | enabled controls must read as enabled | normal ink; disabled only when disabled |
| "A second fallback is harmless" | it becomes a permanent second path | one implementation, one platform decision |
| "The gate is green" | it checks only what the gate covers; 6.4 may still be full | finish 6.4, or name the defect and rung |
| "The command is hidden, so it is finished" | hiding a missing command is honest, not complete | implement the command end to end, or keep the scope cut explicit |
| "The source text says the capability is absent" | prose is not the rendered surface | capability test plus a browser visibility check |
| "The CSS multiset is identical, so the visual is identical" | cascade order can change computed values without changing declarations | browser computed styles / before-after crops |
| "The doc says 132 tests" | the tree has moved; stale truth is misinformation | measure and rewrite 6.3 in the same change |
| "The old path still works, keep it" | a second writer/path is a defect even when it works | delete the replaced path in the same change |

---

# Part 6 - Working tree, current truth, migration

6.3 and 6.4 are the only status. If another paragraph, `advice.md`, a screenshot or an old commit
conflicts with them, 6.3/6.4 win until the code and this file are corrected together.

## 6.1 Commands

```text
npm run check       # types, Prettier, lint, tests, build, audit, contracts; then review pages
npm run dev         # build, serve dist/ on 127.0.0.1:5172, watch and live reload
npm run serve       # serve an existing dist/ on 127.0.0.1:5172 (PORT/HOST override)
npm run types:watch # incremental type checking
npm run test:watch  # incremental pure tests
npm run format      # write Prettier across src, scripts, test and root JSON/YAML
npm run format:check
node --test test/catalog.test.ts
npm run features -- <web-features id> --require 2026
npm run features -- <web-features id> --floor chrome=156,firefox=157,safari=27
```

The toolchain is pinned: Node >= 24, npm >= 11, `packageManager` npm 11.19.0, and `@types/node` follows the
Node major. A dependency upgrade that changes the toolchain is a user decision, not a background update.

## 6.2 Map

- `src/protocol/` - command/reply/event types, failure codes, runtime parsers.
- `src/worker/` - entry, api, ports, failure, matrix, project, projection, account DB, outbox, recovery,
  media format/crypto/transport/resolver/cache, session DB. Only this layer imports the SDK and crypto
  wasm.
- `src/client/` - boot, guard, prepaint, real WorkerSource/MatrixTransport, auth, actions, store, regions,
  surfaces, inert DOM admission, shell registration, UI draft store. Production chat uses the worker.
  `review.ts`/`reviewChat.ts` are a separate review bundle; only that bundle imports `MockSource` and
  `core/mock.ts`.
- `src/service-worker.ts` - the shell precache generator; `scripts/build.ts` inlines the hashed manifest
  and writes `dist/service-worker.js`.
- `src/components/`, `src/layouts/`, `src/pages/`, `src/catalogs/`, `src/lib/`, `src/core/` - build-time
  shell and shared DTOs.
- `scripts/` - build, pages, audit, contracts, dev, static, review, features, watermark.
- `spec/` - Matrix specification; `git/` - reference repositories, read-only; `past/` - evidence only.

## 6.3 Current measured truth

Measured on 2026-11-16 on the working tree with user image packs, mentions and the current changes.
This is the only current-status section; counts and claims in `advice.md`, `past/`, browser history and
old commits are evidence, not status.

- `npm run check` is green: **205 tests**, 11 generated pages, 354 catalog keys, 2 languages.
- Build sizes: stylesheet 84.7 KiB, client 322.3 KiB, matrix worker 1.27 MiB, crypto wasm 7.43 MiB,
  watermark 68.2 KiB (was 257 KiB), generated service worker 2.7 KiB. All budgets pass; the client
  ceiling is 336 KiB by the user's 2026-11-16 decision.
- Worker tests cover the command dispatcher, projection at 1/30/1,000/10,000 events, before-cursor pages,
  read markers, timeline reset, queued row before request, echo replacement, retry, discard and a
  non-retryable failed send. Media tests cover MIME sniffing/scriptable rejection, unencrypted/encrypted/
  sticker content shapes, AES-CTR round-trip and hash mismatch, thumbnail dimensions, no-mxc projection,
  object URL revocation and upload-once/retry-send. SAS tests exercise the worker state machine's
  projection, ready/started transition, confirm, mismatch, user cancel, unknown id, incoming request and
  restart adoption; no real device or homeserver completed a SAS handshake. A real server and browser
  worker were run for password login, sync, key reset and chat load. Chromium runs verified that a
  second tab on the key page shows the visible lock note, a fresh key status waits for crypto instead
  of reporting `unknown`, the review media-files dialog opens the image by message id, and the topbar
  room menu hides mark-read. A real send, SAS handshake, backup setup and a reload with a non-empty
  stored window were not re-run after the latest changes. Chromium also measured the app filling
  `innerHeight` at 1333x778 and 1778x1111, and the settings dialog now exposes the Stickers tab with
  grouped security rows. A real stored account reload painted its first room row at 81 ms with 9 rooms
  and no skeleton rows, and the page stayed at full height with no console errors. User image packs
  have pure parser/picker/send tests, but no real account-data pack or room pack has been resolved in
  a browser; avatar resolution also waits on a real mxc avatar. The pack parser follows the official
  `m.room.image_pack` + `m.image_pack.rooms` model with the legacy `im.ponies` fallbacks and usage
  filtering. A pack send goes through the worker-owned outbox and sends the original mxc URI; only
  display blob URLs cross to the main thread, never the pack mxc URI or image bytes. Chromium also
  verified the real-session key page keeps its recovery form and has no Open-chat control, and that an
  encrypted review room shows the packs with the unencrypted-media warning and sends a selected sticker.
- Chromium measured a 10-room cached start at 57 ms for the worker `start` reply and 86 ms to the
  first navigation row; crypto continued in the background. The test account had no stored events, so
  message-window first paint was not measured.
- Persistent storage is requested once after the session is known (`navigator.storage.persisted()` then
  `persist()`, failure ignored), so the browser keeps the account IDB and the service-worker shell under
  storage pressure. It is not requested on the static landing and never blocks startup.
- Room history uses `#/room/<encoded-room-id>`; a valid cached room is selected after rooms arrive, an
  invalid id is dropped without opening anything, and browser back/forward drives the same selection.
  The worker persists the SDK backwards pagination token on open and after initial sync, so a full local
  window still exposes the older control and scrollback yields a page.
- Cached rooms painted under an unverified cached gate use the `verifying` phase: rows are visible, the
  composer is disabled, mark-read is blocked, and the key event either enters `ready` or redirects locked.
- Production stickers are enabled. User/room pack images render from worker-resolved blob previews and a
  send uses `sendSticker` with the pack id and shortcode, so the worker sends the original mxc URI and
  info without an upload. The built-in emoji demo pack still rasterizes a 512×512 PNG in the client and
  uses `sendMedia`; picker emoji does not enter the composer. Settings has a sticker-pack toggle and the
  built-in pack; disabling hides the sticker button. Encrypted rooms still expose packs with a visible
  warning: the `m.sticker` event is encrypted by the room, but the referenced image is not; the worker
  uploads built-in sticker bytes as plain media rather than pretending to seal them.
- Send appends the worker-visible row immediately with a sending spinner; the worker outbox echo replaces
  it and a failure marks it failed/retryable. Edit and reaction update the visible row immediately and
  restore it on a typed failure; redact shows the tombstone immediately and restores on failure. Mark-read
  clears the room badge and receipt immediately, restoring the prior room row if the worker command fails.
- The production command set includes password login, one-time SSO token exchange, SSO URL, password+dummy
  registration, react (add and own-reaction redaction), edit with `m.new_content` and `m.replace`, redact,
  typing, worker search, leave, room tag, room mute, room state, invite, join, answer-invite, room/DM
  create, forward, member actions, `sendMedia`, `sendSticker`, `media`, read-only `devices`, `backupStatus`,
  `backupSetup` and SAS (`sasStart`, `sasAccept`, `sasConfirm`, `sasMismatch`, `sasCancel`).
  Text delivery now computes the joined members named in the body and sends `m.mentions`; edit does the
  same for newly added names. Pure tests cover protocol shapes, reaction aggregation/removal,
  edit/redaction projection, search, the mock patch path and the dispatcher.
- `PRODUCTION_CAPABILITIES` is true for media, stickers, search, react, edit, redact, forward, typing,
  memberAction, inviteUser, addRoom, leaveRoom, setRoomState, setRoomTag, setNotification, answerInvite,
  resetIdentity and backupSetup. It stays false for resetRecoveryKey, signOutDevice, signOutOthers and
  saveNotifications.
- Media is worker-owned: upload validates/sanitizes/EXIF-strips, encrypts in encrypted rooms, uploads once,
  sends with a txn id, downloads authenticated with no-store, hash-verifies before decrypt, allowlists MIME,
  caches by content address and emits only `blob:` URLs. The projection never emits mxc/token/key.
  Room, account and sender avatars resolve in the worker; sender avatars patch already-painted rows
  instead of delaying the local window.
- Recovery key/passphrase derivation now uses PBKDF2-SHA-512 with a UTF-8 salt, validates the candidate
  against `secretStorage.checkKey`, and refuses to create a new cross-signing identity during recovery.
  The device list is read-only and reports `getDeviceVerificationStatus(...).isVerified()`.
  SAS is worker-owned: the state machine starts own-user or per-device verification, adopts an incoming
  `crypto.verificationRequestReceived` and `getVerificationRequestsToDeviceInProgress` after a restart,
  starts `m.sas.v1`, and projects only id, target, phase, emoji/decimal and cancellation code; request and
  verifier objects never cross the port. `crypto.devicesUpdated` and SAS completion recompute the gate and
  emit `keys` plus `devices`. The key page and settings device rows drive the same commands. Backup
  status/setup is worker-owned (`resetKeyBackup` + `checkKeyBackupAndEnable`) and emits version/trust/
  matches/enabled plus a typed failure; the settings button reflects it. Device sign-out remains absent.
  The SAS messages follow `spec/content/client-server-api/modules/end_to_end_encryption.md:671` and
  `:827`; backup follows the key-backup section of the same module. The accepted secret-storage key is
  persisted only in the worker's session database, tied to that account and device; startup validates it
  against secret storage before `ready`, loads the backup key, and retries cached undecryptable rows.
- The shell service worker is written at `/service-worker.js` with the hashed manifest inlined: install
  precaches the 11 generated pages and 9 shell assets, navigation is cache-first with background
  revalidation, and `/sync`, media, API, avatar, token and account responses never enter the cache. A real
  offline reload was not run.
- Chromium evidence: `/review/` loaded with no console errors and the composer rendered; an earlier
  production check reached `/en/key/` with one recovery form and no fake SAS/reset dialog. The SAS dialog
  and its worker commands have **not** been driven in a browser or between two real devices. Media upload,
  worker search, actions, room management, device list and the encrypted media path were **not** exercised
  in a browser or against a real account. The earlier production check used a synthetic session.
- CSS: `no-descending-specificity` is enabled. The reorder preserved the declaration multiset, but a
  computed-style before/after comparison and screenshot pair were not run; do not claim visual equivalence.
- `git` is clean at the baseline. The commit was not pushed: `git push origin main` failed with
  `git@github.com: Permission denied (publickey)`. Do not rewrite history; fix SSH and push.
- `/review/` is a mock surface and is not the product. No real login/sync/send/recovery has been re-run
  after this refactor.
- `AGENTS.md` is part of the deliverable: a code change that makes a paragraph false must rewrite it in the
  same change.

## 6.4 Current blockers

The UI is ahead of the runtime in the hidden surfaces. These are release blockers, not footnotes. Each has
a reader-visible symptom, known facts, ruled-out paths and the next concrete step.

1. **Key gate is incomplete.**
   - Symptom: a real SAS handshake, recovery and backup setup have not been proven against a homeserver;
     device sign-out and the settings "show existing key" entry are absent.
   - Known: recovery key/passphrase validates the candidate against secret storage, uses PBKDF2-SHA-512,
     imports cross-signing and signs this device. SAS is a worker state machine for own-user and per-device
     verification, including incoming and post-restart adoption, with confirm/mismatch/cancel and a
     projected state; the key page and settings device rows drive it. The gate is recomputed from crypto
     device events and SAS completion, never by the UI. Login always lands on the key page; an accepted
     key is persisted only in the worker session record and is validated against secret storage before
     `ready`; the key page then enters chat automatically, with no extra Open-chat control. A cached
     `ready` hint only routes; the chat worker recomputes and redirects when the key is absent. Startup
     loads the backup key and retries cached undecryptable rows. The device list is read-only and
     verification state comes from `getDeviceVerificationStatus(...).isVerified()`. Backup status/setup
     is wired; failures are surfaced and one-time keys are shown at registration and gate reset. A reset
     keeps the key page open until the one-time key dialog closes.
   - Ruled out: a local key flag, `setKeyReady`, fake unlock/register, a wrong KDF, treating the cached
     gate hint as authority, sending request/verifier objects over the port, and resetting the gate from
     the SAS UI. All were deleted or never added.
   - Next: complete a SAS handshake and backup setup between real devices/homeserver, then run recovery;
     add device sign-out with UIA and the settings "show existing key" entry if the product still needs
     it. The one-time key display exists on registration and the gate reset. Keep typed failures and a
     browser run. Do not re-add a gate that cannot decide.

2. **Registration and SSO are partial.**
   - Symptom: registration works only for password + `m.login.dummy`; terms/recaptcha/email/SSO stages
     fail; SSO login is implemented but not tested against an IdP.
   - Known: `/register/` sends one register request, auto-completes a dummy-only flow, installs the one
     session, attempts recovery-key setup and displays the key once. `ssoUrl` + `loginToken` implement the
     redirect/callback and strip the one-time query token.
   - Ruled out: creating a local account, keeping a token in the main thread, or a second session writer.
   - Next: drive the full `InteractiveAuth` state machine for advertised stages, test SSO against a real
     homeserver/IdP, and show the registration key even when recovery setup fails (the gate reset form is
     the current fallback).

3. **Auth lifecycle is incomplete.**
   - Symptom: some failures still collapse into one generic message; start/login/logout can overlap.
   - Known: password and token login request refresh tokens, which are persisted through `onTokenRefresh`;
     the account lock is acquired before a session is written and only reused for the same user; a
     startup generation stops an in-flight client from re-emitting after logout; `M_UNKNOWN_TOKEN`
     performs soft logout. Login returns after the session and account DB are open, before crypto; a
     cached ready gate routes to chat, otherwise the key page shows its waiting status while the account
     worker starts crypto.
   - Ruled out: an unlocked second tab, silent token loss, and redirecting a stale session into chat.
   - Next: map the remaining `M_*` codes, implement `/login` flow discovery, and serialize
     start/login/logout with a queue that has one outcome per command.

4. **Media has bounded residual gaps.**
   - Symptom: sticker sending is hidden; encrypted video/audio/file thumbnails show a placeholder; video/
     audio uploads carry no duration or dimensions; and no media path has run against a real server.
   - Known: unencrypted image/file/video/audio upload and download, encrypted image/file/video/audio full
     download, AES-CTR v2, ciphertext hash verification, content-addressed LRU cache, object URL
     revocation, MIME allowlist, EXIF stripping and upload-once/retry-send are implemented and pure-tested.
   - Ruled out: sending raw mxc/token/key across the port, main-thread upload/EXIF ownership, an optimistic
     media row, SVG/HTML/scriptable blobs, and a second media cache.
   - Next: add encrypted thumbnail generation (or a local downscale path), probe media dimensions/duration,
     enable sticker sending only with an image-backed picker, and exercise encrypted/unencrypted upload,
     download, cancel and real-server thumbnails in Chromium.

5. **Spaces and global notifications remain partial.**
   - Symptom: a space cannot be created or have children; the global notification level is local only.
   - Known: membership invites are projected into `invites`; room settings, member moderation,
     send-invite, join/leave, DM creation (`m.direct`), tags, mute push rules and local search are worker
     commands; `saveNotifications` is false.
   - Ruled out: enabling a no-op control, a fake notification mapping for `all`/`mentions`, or keeping a
     mock response in the production source.
   - Next: add space creation and `SpaceChild`/`SpaceParent`, then implement the notification preferences
     the product actually stores; each needs a record, command, projection and test before its control
     returns.

6. **CSP is broad.**
   - Symptom: `connect-src https: wss:` permits every origin.
   - Known: the exact allowlist is the shell origin, the chosen homeserver origin and its websocket origin;
     the response-header builder and service worker must consume the same policy.
   - Ruled out: treating the wildcard as the final design or weakening the rest of the policy.
   - Next: the user decides the arbitrary-homeserver policy in 2.10; then generate the exact response header
     and add a negative test.

7. **Review surfaces still replace whole bodies.**
   - Symptom: a surface update can lose focus, caret, selection or scroll.
   - Known: `replaceHtml` uses an inert DOMParser path, not `innerHTML`; production hides the unfinished
     surfaces, but the review fixture still reparses bodies.
   - Ruled out: accepting whole-body replacement as reconciliation.
   - Next: field-level patches for each surface, with a browser test that preserves focus/caret/scroll.

8. **Browser evidence is incomplete.**
   - Symptom: there is no committed worker harness, no first-paint screenshot pair at 390/856/1280 in both
     schemes and no two-tab lock test.
   - Known: pure tests cover projection/outbox/capability/cache rules; Chromium headless checked the gate
     redirect, the single recovery form and hidden controls, the visible two-tab lock note, the media-files
     dialog opening by message id, the topbar menu set, a room selection reusing the same navigation row
     while updating active/aria state, a sticker-picker emoji sending a sticker image without touching the
     composer, and the sticker setting hiding that picker.
   - Ruled out: calling source regexes, a mock screenshot or a pure fake `SessionPort` a browser proof.
   - Next: commit the Playwright harness for start, login against a fake homeserver, sync, open, older,
     send, echo, receipt, decrypt success/failure, malformed command and two-tab lock; capture first-paint
     pairs and run Firefox/Safari before claiming those engines. CSS reorder also needs a computed-style or
     before/after crop check.

9. **Command failure state is incomplete.**
   - Symptom: `open`, `older` and `members` can leave their visible loading state latched after a typed
     failure or timeout; several fire-and-forget actions still convert a failure into silence.
   - Known: the transport has timeouts and typed failure codes; `search`, media-file loading, sign-out,
     the key page and the device list now surface their failures. A typed source failure event clears the
     window, history and member loading flags and shows the conversation failure note; the device event
     carries either rows or a typed error and settings never renders an error as "No devices". Other
     fire-and-forget actions still have no per-command surface.
   - Ruled out: treating a timeout as an empty result, a successful sign-out or a successful edit.
   - Next: extend the typed failure event to the remaining commands, render a retry in the member and
     action surfaces, and cover a forced rejection in the browser harness.

10. **Space image packs and custom emotes are absent.**
    - Symptom: the picker now carries the account's legacy own pack, the current room's stable and
      legacy packs, and globally enabled `m.image_pack.rooms`/`im.ponies.emote_rooms` packs, but
      packs from the canonical space hierarchy never appear. Custom emotes cannot be sent as inline
      `<img>` content.
    - Known: stable `m.room.image_pack` takes precedence per room/state key over
      `im.ponies.room_emotes`; stable `m.image_pack.rooms` takes precedence over legacy
      `im.ponies.emote_rooms`; image `usage` filters `sticker` versus `emoticon`; media resolves to
      verified `blob:` URLs. Packs remain available in encrypted rooms with a visible warning because the
      event is encrypted but the image-pack media is not. The client ceiling is 336 KiB at the user's
      request; current use is below 323 KiB.
    - Ruled out: deriving packs from the visible message window, putting mxc URLs on the main
      thread, treating an emoji sticker as an image pack, or reading a non-spec user account-data pack.
    - Next: traverse the canonical space hierarchy with a depth/cycle bound, then add custom emote
      composition and a browser test; keep the encrypted-room restriction explicit.

## 6.5 Migration order

Work in this order. A step exits only when its 6.4 item is gone and its verification rung is recorded.
Do not pull a later UI surface forward to make the product look complete.

1. **Baseline gate and counts.** Done: the gate is green, the counts are measured, and the tree is committed.
2. **One session authority.** Done: `maski.key`, `maski.registered`, `setKeyReady` and fake unlock/register
   are gone. The cached gate hint is not authority; the worker recomputes verification and secret storage.
3. **Projection DB and cursors.** Done: worker-only rooms/events/outbox/markers/segments, bounded windows,
   before-cursor pages, reset gaps, and pure tests at 1/30/1,000/10,000 events.
4. **Worker-owned outbox.** Done: queued row before request, status, retry/discard, echo replacement and
   typed failures. The client has no optimistic row writer.
5. **Finish the key gate.** Run recovery, SAS and backup setup between real devices/server; add device
   sign-out with UIA and the settings "show existing key" entry if needed. The read-only device list,
   worker SAS state machine, backup state/setup, gate reset and one-time key display are done. Do not
   re-add a fake gate or a local unlock flag.
6. **Finish media residuals.** Encrypted thumbnail strategy, media dimensions/duration, image-backed
   sticker sending, cancel/progress, and real-server encrypted/unencrypted upload/download/thumbnail.
7. **Search in the worker.** Done: `search` reads the account projection plus the outbox, dedupes, filters
   redacted/system/undecryptable rows and uses one matcher. No search of the current window only.
8. **Auth lifecycle and registration.** Done: password login, one-time SSO token exchange, SSO URL,
   password+dummy registration, one session installer and the registration key display. Remaining: typed
   `M_*` mapping, `/login` flow discovery, serialized start/login/logout and the full interactive-auth
   stages.
9. **Settings/invites/spaces/notifications.** Done for room settings, member moderation, send/accept/
   decline invite with an `invites` projection, join/leave, DM creation, tags, room mute and local search.
   Remaining: space creation with `SpaceChild`/`SpaceParent`, and global notification prefs. Only after
   each has a record in `types.ts`, a command, a projection and a test; delete mock-only surfaces until
   then.
10. **CSP and field-level surfaces.** The user chooses the arbitrary-homeserver policy in 2.10; generate
    the exact response header and replace whole-body surface replacement with field-level patches.
11. **Committed browser harness.** start, login against a fake homeserver, sync, open, older, send, echo,
    receipt, decrypt success/failure, malformed command, two-tab lock, first-paint pairs and the three
    engines. This is the P1 exit.

## 6.6 Definition of done

Every line of Part 2 is present and verified at rung 5. **6.4 is empty.** `npm run check` is green with
every budget inside its declared ceiling (each ceiling change recorded as a user decision) and no browser
harness skipped. A reader can start from this file alone. A real account can
sign in, pass the gate, read, search, send, receive, react, edit, delete, load media, go offline, reload,
and keep its place without a white flash or a layout shift. A green gate with a non-empty 6.4 is not done.

## 6.7 Visual regression references

Every layout refactor re-checks these against the before crop.

| area | reference that must survive |
|---|---|
| grouped message | avatar on the last row; sender name on the first; inner bubble corners chain |
| bubble | content fit to `--bubble-max`, message spacing, faint reaction chip |
| page | watermark tile under chat, mask-rendered, unchanged opacity and placement |
| chrome | topbar/navigation glass, account card, popover and context-menu glass |
| selection | check opposite the avatar at the row bottom; fixed toolbar below the topbar, aligned with the composer |
| composer | action alignment, tray height, send button, input growth, caret before placeholder |
| sticker | art without bubble paper; time chip below at the bottom right |
| menus | enabled text normal ink; hover clearly different from default; menu paper distinct from page |
| device group | outer large radius, inner small radii; green verified mark after name; Verify only when unverified |
| viewer | compact window, dark loading stage, image zoom inside the window |

- **2026-11-15, surface contrast and caret pass.** Enabled `.button-quiet` and surface buttons use normal
  ink; section heads use nav ink; settings tabs are readable. The empty composer prompt is an absolute
  decorative pseudo-element, so the caret starts at the inline start. Input focus uses `--field-focus`;
  the unread badge derives from `--nav` and `--ink` at 12%; the watermark is painted through a mask, not
  a filter. Verified in Chromium `/review/` with computed colors and no console errors.

- **2026-11-15, token semantics pass.** `--account-bg` is the account rest paper, `--account-hover-bg`
  is hover, `--account-open-bg` is menu-open, and `--account-active-bg` is pressed. `--nav-avatar-*` was
  renamed to `--chrome-avatar-*`; profile rows use generic `--avatar-bg`. Skeleton, quote, holding,
  tray-thumbnail and dialog control/row roles replaced rest uses of `*-hover-bg` tokens. The style test
  now asserts the semantic account roles.

- **2026-11-15, specificity ordering pass.** `no-descending-specificity` is enabled. Selectors were
  reordered while preserving every declaration and equal-specificity order. A PostCSS multiset comparison
  is evidence that declarations survived; it is **not** evidence of computed visual equivalence. A computed
  style check or before/after crop at the claimed width is still required.

A layout refactor compares the before crop at the claimed width. A moved avatar anchor, closed gutter,
lost glass layer, lost watermark, muted enabled button, inverted badge or changed focus color is a
blocker, not a style preference.

---

# Closing rule

The tree is not the product. The mock is not the worker. The CSS regex is not the browser. The screenshot
after a wait is not first paint. The claim is not the rung.

Read the code and the specification. Keep one writer per fact. Delete the second path. Verify the same
symptom you claimed to fix. Then write the evidence down. A green gate is not a finished product: 6.4
must be empty, the rung must match the claim, and this document must describe the tree that exists.
