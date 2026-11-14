# UI

The UI is native DOM. There is no framework, no virtual DOM, no observables, and no component library. `docs/state.md` owns data; this document owns rendering and interaction.

UX behavior is specified in `AGENTS.md` 9-11, 23-33. This document defines the engineering shape that implements it.

## Render model

- One `requestAnimationFrame` loop after any store change.
- Region renderers: shell, room list, header, timeline, composer, dialog.
- A region updates its own DOM; it does not re-render siblings.
- The composer and an open dialog keep local state/selection and update only on room switch, draft load, or dialog open.
- Views read an immutable snapshot. They call actions; they never mutate state.
- Reference equality is the diff: unchanged records keep references; selectors reuse them.
- A hidden document skips render; on visibility it renders once.

## DOM helpers

`ui/dom.ts` is the only element construction helper:

- `el(tag, props?, children?)`
- `text(value)`
- `attr(node, name, value)`
- `classNames`
- `fragment(children)`

Rules:

- `textContent` for text. `innerHTML` only through the sanitized message renderer.
- No `style` attributes; classes and tokens only.
- No inline event handlers; events are delegated or attached explicitly.
- No `document.querySelector` in views outside the mount root; use refs passed by composition.

## Keyed list

`ui/keyed-list.ts`:

```
render(container, items, { key, create, update, remove }) -> void
```

- Keeps `Map<key, { node, item }>`.
- Creates missing nodes in a `DocumentFragment`.
- Updates changed items in place (`item !== previousItem`).
- Moves only when order changes; appends/prepends stay cheap.
- Removes missing nodes and calls `remove` for cleanup (object URLs, media).
- Never replaces a node the user is selecting or focusing.
- Used by room rows, timeline rows, reaction chips, member rows, pack grids, search results.

The timeline and room list share this implementation; search results reuse row builders, not a second list.

## Timeline

### Display items

A pure selector builds display items from events, outbox rows, read marker, and new-marker:

- `event:<id>` — message, media, sticker, membership, state, encrypted, redacted.
- `day:<YYYY-MM-DD>` — day separator.
- `read:<id>` — read marker.
- `new:<id>` — new-message divider.
- `older` — pagination sentinel.
- `pending:<txnId>` — outbox row.

Grouping flags (show avatar/name, group start/end) are computed from neighbors: same sender, same day, and within `limits.groupGapMs`. Avatars sit at the top of the group, left for others and right for own; one avatar per consecutive group.

### Window

- Store holds up to `limits.loadedMax` (2000) loaded events for the active room.
- DOM renders a contiguous window of `limits.timelineWindow` (300) display items.
- Near the top/bottom, shift the window by `limits.timelinePage` (50); compensate scroll.
- Reaching the loaded start with `hasOlder` sends `paginate`.
- Rows keep natural height; no absolute-positioned virtualization.
- No `content-visibility` on timeline rows; the bounded window makes it unnecessary and it complicates anchoring.
- Room switch drops the previous DOM window and reads the new room from the projection.

### Scroll

- `overflow-anchor: none`; manual anchoring.
- Before a prepend/shift, record the first visible row key and `getBoundingClientRect().top`; after DOM writes, adjust `scrollTop` by the delta.
- At bottom: new event keeps the bottom. Scrolled up: increment new-message count and show the pill.
- `ResizeObserver` and image load use the same anchor rule when not at bottom; at bottom stay pinned.
- `overscroll-behavior: contain`; no smooth scrolling.
- On room switch, restore `{ eventId, offset }` from the UI DB; if absent, bottom.
- Jump to event: load around it, scroll, highlight briefly; keep focus and announce.

## Room list

- Sections: invites, favorites, DMs, rooms, low priority. `<details>` open state is stored in UI settings on toggle and restored on render.
- A room row toggles mute through the shared menu, labelled by the current state.
- Keyed rows; sort by last activity within a section; active `aria-current`; unread/mention/mute flags.
- Shared `ActionMenu` on the row: mark read, favorite, mute, leave, copy link; opened by right-click, long-press, or keyboard.
- Invite rows have accept/decline; no nested dialog.
- No hover-only row controls; the same menu exists at every width.
- Room settings stays in the room header; no duplicate row action.
- A room with no local window reads from the projection; no second cache.

## Action menu

- One `ActionMenu` for messages, room rows, and member rows. Right-click, long-press, `ContextMenu`, or `Shift+F10` opens it.
- Long-press is cancelled by movement or scroll; click after a long press is suppressed.
- Native menus are kept for links, inputs, textareas, and selects.
- Keyboard: Arrow keys, Home/End, Escape, Tab; focus returns to the trigger.
- Message actions: Reply, React, Copy text, Select text, Open media, Profile, Edit, Delete.
- Room actions: Mark read, Favorite, Mute, Copy link, Leave, and invite Accept/Decline.
- No hover-only action strip and no separate mobile/desktop menu.

## Composer

`ui/views/composer.ts` owns the three-part bar and the tray/preview regions. The More and Send controls sit outside the bordered `.composer-field`; the textarea model lives in the composer model.

### Editor model

- Plain text string.
- Marks: non-overlapping ranges for bold, italic, underline, strikethrough, inline code.
- Custom-emoji tokens: text range + shortcode + image URL/body/info.
- History: snapshots of text, marks, tokens, selection; text and marks undo together; IME composition snapshots at composition end.
- Marks anchor to characters; insertion inherits the preceding marked run; deletion shrinks/removes.
- The textarea shows literal text and shortcodes; the preview shows formatting and custom emoji.
- No contenteditable, `execCommand`, EditContext, or editor framework.

### Serialization

- `body` = exact text.
- `formatted_body` only when marks/tokens exist: `strong`, `em`, `u`, `del`, `code`, `br`, custom-emoji `img`.
- Escape text; newlines to `br`; no markdown parser.
- Preview uses the same renderer and sanitizer as the timeline.

### Block styles

`heading`, `quote`, and `codeBlock` are line marks. Applying one covers every selected line, replaces another block style on those lines, and toggling it again with the same selection removes it. Inline marks stay inside a block. The context menu reports the active state of every style and offers "Clear formatting". Serialization emits `h3`, `blockquote`, and `pre`; the sanitizer allows `h1`-`h6` because the client produces them.

### Channels

A room whose create type is `m.space` is a channel. It is projected like a room, listed in the Channels section, and opened in the content pane as a channel page: name, topic, the settings entry, and the subgroups from `m.space.child`. A child is opened directly when it is known, otherwise it is joined first. Channels carry no timeline and no composer. The active marker is `aria-current="page"` on the row whose room is open, so the navigation and the content pane never disagree.

### Bar and menu

- Left: attach, which opens the file picker directly.
- Middle: the field, with an emoji control inside its right edge. The textarea is the editor; when it loses focus and the draft carries styles, the field renders the formatted text instead. A click on that rendering returns to editing at the clicked character.
- Right: send while the draft has text or an attachment, otherwise the sticker control, which opens the panel on the emoji tab. Clicking a sticker sends it; clicking an emoji inserts it at the caret.
- There is no More menu and no format strip. Styles come from the selection menu and the B/I/U and Shift+X shortcuts.
- A transient formatting strip appears for a non-collapsed selection; right-click opens the same menu; shortcuts B/I/U/Shift+X.
- Send button disabled when no text and no attachment; Ctrl/Cmd+Enter sends; Enter always newline.

## Pickers and attachments

- `picker.ts` renders the emoji/sticker panel from `store/packs`: the emoji button and search share the head, Emoji and Stickers are tabs, then the pack strip and grid in a scrollable body.
- Sticker click sends; emoji click inserts a character or a custom-emoji token; the panel stays open for emoji, closes for sticker.
- The picker reuses keyed list and media cache; pack images load lazily.
- `attachments.ts` renders the tray above the composer: thumbnails/cards, remove, progress, cancel, retry.
- Files queue in the outbox with blobs; the worker uploads; the send icon sends the tray then the text.
- A pending row has a close control at its top left. While the sender backs off it says "Retrying… (n)", and a failed row shows the reason and a retry. Rows resume when the worker starts and when the connection returns.
- A pending attachment previews from its local blob: an image shows the picture, anything else shows a file card with the name. A reaction or a redaction never creates a pending row.
- A sticker opens the image viewer; the viewer image zooms on double click and restores on the next.
- The reaction entry opens the emoji picker with the sticker tab hidden and sends the chosen emoji as an annotation.
- Viewers: image lightbox, native video player with poster, native audio, file card with download.

## Router

`ui/router.ts`:

- Locale prefix: `/` English, `/<locale>/` translation.
- Route table from config: home, room, login, register.
- Hash or history mode from config; hash default.
- Dialog and search are query state on the current route.
- Opening a dialog pushes one history entry; back closes it; deep links close with replace.
- The router updates `lang`, title, and the active locale path.
- History mode uses the generated 404 fallback; hash mode does not need one.
- No path literals in views; use config route keys.

## Auth and boot

The auth page is a page, not a dialog, and it has four steps held in `App`: `landing`, `server`, `methods`, `register`.

- `landing`: the wordmark as the page `h1`, one line of description, and two choices, sign in and create account.
- `server`: a homeserver field and one continue action. Discovery runs on submit and fills `baseUrl`, `loginFlows`, `ssoTargets`, and `registration`.
- `methods`: the methods that server advertises. The password form comes first when `m.login.password` is present; SSO buttons follow, one per identity provider, labelled by the provider name. With no password flow the buttons stand alone and the page says so. Create account appears only when the server allows registration.
- `register`: username, password, confirmation, and the same discovery result. A server that disallows registration shows the reason instead of a form.

Each step keeps its own back control; the entered server stays in `authFields` across steps, the password does not.

A UIA prompt can arrive before the shell exists, so the dialog host lives on `body`, not inside the shell. A stage with no input is answered by the worker; the prompt only appears for password, registration token, and terms with policy links.

### Boot

- The static shell shows the boot state until the first render replaces it.
- A stored session with a completed key gate renders the shell from the projection before the worker is started: `lastAccountHash`, the cached `lastSession` summary, and `keyGate:<hash>` decide it.
- The worker starts in the background; sync, gate re-check, and deltas update the already-rendered shell. The shell is not rebuilt unless the locale, session, or gate state changes.
- A gate check that fails in the background downgrades to the gate; it never leaves an unverified shell interactive.
- No cached session, or an incomplete gate: boot spinner, then auth or gate. Offline is not an error state, so a worker that cannot reach the server keeps the local shell and shows the connection state.

## Sidebar

- Head: the brand only.
- Body: room sections; leaving the collapsing to `<details>`, with the chevron at the end of the summary.
- Foot: connection state, then one user button that opens the action menu for search, new message, join, create, settings, profile, and sign out.
- No row of icons at the top and no border between navigation and content; the two regions differ by surface.

## Dialogs

`ui/dialogs.ts`:

- One native `<dialog>` at a time; `showModal()` for focus/inert; no custom focus trap.
- Open state from URL query; one controller opens/closes based on route changes.
- Shell: title bar, scrollable body, footer; fluid width `--modal-max`; no shadow.
- Forms keep drafts local; requests do not block open/close.
- Destructive actions use an inline confirmation, never a stacked dialog.
- Auth/key gate are pages, not dialogs; settings/search/join/create/new-message/room-settings are dialogs.
- Profile and image preview are a popover/small dialog only when no other dialog is open.

## Media

- `ui/media-cache.ts` maps `mediaKey` to blob URL, ref-counted by visible rows.
- Image and video rows show a click-to-preview control; media is not requested until the user activates it. After loading, an image opens in the viewer and a video uses native controls.
- Avatars, custom emoji, and stickers may load eagerly; message images and videos do not.
- Object URLs are revoked at zero references and on room switch.
- Images use `loading="lazy"`, `decoding="async"`, and dimensions/aspect ratio to avoid layout shift.
- Video may use the media service worker URL; otherwise a blob. No autoplay.
- Media errors show alt/placeholder and retry; never a blank.

## Views

| View | Notes |
| --- | --- |
| `shell.ts` | nav/content grid, header, focus/landmarks |
| `auth.ts` | landing, server, methods, register; SSO targets; language switch; inline errors |
| `key-gate.ts` | three paths, recovery key display, SAS, no skip |
| `settings.ts` | Account, Notifications, Security, About; single scroll |
| `profile.ts` | Message/Verify/Copy MXID, verification status |
| `search.ts` | input, room filter, result rows, jump |
| `join.ts` | room ID/alias form, errors |
| `create.ts` | name/topic/visibility/invite/encryption |
| `new-message.ts` | user ID search, start DM |
| `room-settings.ts` | general/members/invite/notifications/encryption/leave |
| `about.ts` | version/source/credits/privacy |
| `media.ts` | image/video/audio/file rows and viewers |

## Boot and first paint

The static shell is a single full-screen loading state: the mark, a line and a spinner. The app keeps it while it opens the account database and reads the projection, and replaces it with the shell only when rooms, avatars and the open timeline can be drawn. Nothing is drawn twice, so a reload has no empty list and no letter-to-avatar swap.

Avatars and cached pictures come from the media store on the main thread; the worker is asked only when a blob is missing.

## Stability

One anchor keeps the reader in place. A message row is recorded with its offset before the DOM changes and restored after: a page of history, a window shift, a decoded picture or a row that stops decrypting. Media boxes reserve their size and retry twice before a failure is reported. The sentinel row shows a spinner while a page loads; there is no button.

## Media rows

An image, video or sticker carries no bubble. Its time is a chip on the bottom right corner of the picture. A file keeps its card, because a name needs a surface.

## Navigation surfaces

Three surfaces, each with one owner and one close path:

- The account card unfolds under the account row inside the navigation. It holds the client actions as a two-column grid and sign out at the end. Escape, an outside press, or any action closes it.
- The emoji panel is a single instance mounted on the document, above the button that opened it and aligned to its left edge. It is placed before it paints. One scrolling surface holds emoticons first and stickers below. A second press on the same trigger closes it; a press anywhere else, including the composer field, closes it; Escape closes it and returns focus.
- The action menu opens at the pointer beside its trigger, below when there is no room above. Arrow keys, Home and End traverse menu items and checkboxes alike.

A room section is a `<details>` whose rows live in a `.room-section-body` box. The box is `display: none` when the section is closed, because a row with an explicit display would otherwise keep its layout and intercept clicks.

## Mentions, names and time

- A row whose `m.mentions` names the current user gets the mark tone; the room list badge stays strong.
- Display names come from the member record; when two members of a room share one, the MXID is appended so a name cannot be spoofed.
- The timestamp sits in the bubble's bottom right and is not selectable. An emoji-only message takes the next type step.

## Feedback

- One `Toaster` live region lives on `body`, so a message survives a shell re-render and is announced once.
- Every user-visible failure and confirmation goes through it: command errors, copy results, saves, permission denial.
- Internal state (connection enum, worker errors) never reaches the text; the connection is shown in the sidebar only.
- Session verification shows the seven emoji with their names; the names are part of what the two devices compare.

## Notifications

- `ui/notifications.ts` owns permission, preview, hidden/unfocused policy, and OS notification construction.
- One notification per room; tag by room; click focuses and navigates.
- No own messages, edits, reactions, redactions, or membership changes.
- The app remains usable if the API is unavailable; in-app badges are the fallback.
- No push gateway; a closed page gets nothing.

## Accessibility and performance

- Timeline `<ol>`; room list labeled; nav landmarks; one visible `h1`.
- Action menus, reactions, pickers, and format strip are keyboard reachable; focus returns.
- New messages use a separate live region; not the whole timeline.
- Text is selectable; no `user-select: none` on message text.
- Focus ring always visible; targets >= 24px; reduced motion zeroes transitions.
- No layout thrash: read before write; batch; rAF; keyed updates.
- The UI never awaits network; local actions are immediate.

## References

- AGENTS.md 0.6 E4/E5, 9-11, 22-33.
- Cinny `src/app/features/room/RoomTimeline.tsx` for pagination/decryption behavior; `src/app/components/editor` for editor behavior (not Slate).
- MDN IndexedDB, IntersectionObserver, ResizeObserver, requestAnimationFrame, dialog, Selection.
- See `references.md`.
