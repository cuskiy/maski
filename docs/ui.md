# Interface

## Shell

Two regions: navigation and content. `100dvh`, no page scroll. One container query at
`44rem` on `body` turns the shell into two screens — `data-view="home"` shows the
navigation, `data-view="room"` shows the content — and reveals the back control. There is
no second layout and no width media query.

Navigation: quick actions in two columns, then the sections from the selector, then the
account row. A section header toggles the section and the choice is stored. A room row is
avatar, name, time, preview and badge; right-click and long-press open the row menu.

Header: back control, room name, a subtitle that shows typing or the member count, and the
room settings entry. An invite shows the invite card in place of the timeline.

## Timeline

`<ol>` of rows. Display items are day separators and messages. A message row is avatar slot,
body, bubble. The bubble holds an optional quote, the content, the time, and the reactions.
Own rows mirror the layout and place the avatar on the right.

- Grouping: same sender, same day, within five minutes. The avatar and the name appear at
  the start of a group only.
- Media and stickers have no bubble; the time becomes a chip on the picture.
- A queued or failed row shows a status line under the bubble; a failed row is a button.
- Reactions are buttons; the current user's reactions are marked; a click toggles.

The list is keyed by message id. An update rebuilds the row in place, so an edit, a
reaction or a status change never removes a node the reader is looking at.

Scroll: at the bottom, a new row keeps the bottom. Scrolled away, the position is kept and
the older page loads when the top is reached, with the height difference added back.

## Composer

Attachment, field, send. The field is a `<textarea>`; the emoji control sits inside the same
surface and opens the picker; the send control is disabled only when there is neither text
nor an attachment.

Styled text is a range model over the plain text. The menu on a selection offers bold,
italic, underline, strikethrough, code and clear; Ctrl/Cmd+B, I, U and Shift+X apply the
same marks. When the field loses focus and a mark exists, the formatted text is rendered in
place; a pointer on that rendering maps back to the plain text offset and returns to
editing at that character. The caret can therefore never disagree with a styled copy.

`formatted_body` is generated from the marks, and a custom emoji shortcode that resolves to
a pack image becomes `<img data-mx-emoticon>` there while the body keeps the shortcode.

Enter inserts a newline, Ctrl/Cmd+Enter and the send button send. The field grows to the
composer cap and then scrolls. The tray holds files; a paste and a drop add to it.

## Picker

One panel above the composer with a search field, a tab per pack and a fixed height, so
switching a pack never moves the controls underneath. The emoji surface lists recently used
images first, then Unicode emoji; the sticker surface lists stickers and sends on click.
A pack that offers both appears on both surfaces.

## Dialogs

Native `<dialog>`, one at a time, opened from the URL. The browser owns the focus trap,
Escape and the return of focus. Settings, room settings, profile, search, join, create and
new message share the same frame: title, scrolling body, optional footer. The close control
and Escape both go through `app.closeDialog`, which also rewrites the URL.

## Feedback

One toast host, one menu host, one media viewer. A toast is the only visible error and
confirmation surface; internal state is never shown.
