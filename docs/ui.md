# Interface

The visual language is in `AGENTS.md` §1. This document says how the interface is built from
it: which element owns which region, and which rule a new piece reuses.

## Shell

```
.shell                     100dvh grid: navigation, content
  .nav                     quick actions, sections, account row
  .content                 header, timeline, composer
  .connection-banner       appears only while the client cannot sync
```

One container query on `body` at `44rem` switches `data-view` between `home` and `room`; a
room shows the back control. Nothing else changes with width.

`Shell.render()` runs on a state change and rebuilds the navigation, the header, the invite
panel, the intro panel and the timeline. The composer, the picker and an open dialog are not
rebuilt by it.

## Regions

| Region | Built by | Notes |
| --- | --- | --- |
| Quick actions | `shell.ts` | five rows in two columns, always visible |
| Sections | `shell.ts` | one `<details>`-like pair of a header and a body; the open state is stored |
| Room row | `shell.ts` | avatar, name, time, preview, badge; a menu on right-click and long press |
| Room header | `shell.ts` | back control, the room name centred, typing when it happens, room settings |
| Invite panel | `shell.ts` | replaces the timeline until the invitation is answered |
| Intro panel | `shell.ts` | shown for a joined room with no messages |
| Timeline | `timeline.ts` | keyed `<ol>` of day separators and rows |
| Composer | `composer.ts` | attach, field with emoji, send; the tray sits above |
| Picker | `picker.ts` | popover above the composer, fixed height, tabs per pack |
| Dialogs | `dialog-kit.ts` + `dialogs/` | one frame, one dialog at a time |
| Menu, toast, viewer | `overlay.ts`, `media.ts` | fixed layers outside the shell |

## Timeline rows

A row is an `<li>` with `data-id`. Its class carries three facts: `row-own` or `row-other`,
`row-start` when it opens a group, `row-state` for a membership line. The row is focusable
so the message menu has a keyboard path as well as a pointer one.

Inside: an avatar slot (empty until the group starts), a column with the sender name at a
group start, the bubble, an optional status line and the reactions.

The bubble owns its content: an optional quote, the text or the media, and the time. A media
message has no bubble surface; the time becomes `.bubble-time-chip` over the picture.

The list is keyed by message id; an update rebuilds the row's children and keeps the node, so
a reaction or an edit never removes what the reader is looking at. A signature string decides
whether the rebuild is needed at all.

## Composer

Three parts in one row: attach, the field group (textarea plus emoji control), send. The field
grows to `--composer-max` and then scrolls; the text is a plain textarea, and marks are kept
beside it (`ui/marks.ts`).

When the field is not focused and the draft has a mark, the formatted draft is rendered in
place; a pointer on that rendering maps back to a plain offset and returns to editing there.

The tray holds attachments with a preview each; an upload reports progress in the row, not in
the composer.

## Picker

A popover anchored above the composer: a search field and a close control, a tab per pack, a
fixed-height grid. Switching a pack never moves the controls underneath. The emoji surface
lists recently used pictures first, then Unicode emoji; the sticker surface sends on click.

## Dialogs

`dialog-kit.ts` owns the frame: title, scrolling body, optional footer, the close control and
Escape. Opening replaces the previous dialog. `dialogs.ts` maps a name from the URL to a
builder; `dialogs/` holds settings, room settings, a person's card and the four action
dialogs.

Settings is one scroll of sections separated by hairlines: account, notifications, security
(sessions and verification), about. Room settings is general, encryption, members, mute,
leave; the member list offers moderation only when the account has the power for it.

## Feedback

One toast host, one menu host, one media viewer. A toast is the only confirmation surface. A
failure inside a dialog is text in that dialog, not a toast.
