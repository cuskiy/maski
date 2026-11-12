# State

## One object

`store/state.ts` holds one plain object and one `subscribe`. `setState` merges, then
schedules a single `requestAnimationFrame` that notifies every listener; twenty changes in
one frame paint once. There is no proxy, no observable graph, no per-field subscription.

```
phase        boot | auth | gate | ready
session      the summary the worker returned; never a token
connection   idle | connecting | online | offline | error
rooms        Map<roomId, RoomSummary>
activeRoomId the room whose window is loaded
messages     the loaded window of that room, ascending
draft        what the composer opened with
typing       who is typing in the active room
keys         whether secret storage and the backup are usable
settings     the local settings record
dialog       the open dialog name, mirrored in the URL
```

`notice` and `readOnly` are gone: nothing rendered them, and a field the interface cannot
show is a lie about the design.

## What is not state

- The composer's text, marks and attachment tray live in the composer. A keystroke is not a
  render: it writes a debounced draft and nothing else.
- An open dialog keeps its own form state.
- Object URLs live in the media cache.

## The URL is state

The hash carries the route and the dialog:

```
#/                      no room
#/room/<id>             a room
#/room/<id>?d=settings  a room and a dialog
#/?d=search             a dialog without a room
```

`popstate` and `hashchange` both call `applyRoute`, which is the only place that reads the
URL. `openRoom` and `openDialog` write it. A deep link is applied on mount; a room that is
not in the projection yet is kept in the URL and loaded when the sync brings it.

## Actions

`app.ts` is the composition root and the only caller of `worker.send`. It validates
nothing about Matrix; it moves records between the database and the state and asks the
worker for the rest.

A send writes the queued row, appends it to the window, then dispatches. A failure marks
the row and shows one toast. A retry resets the row and dispatches again with the same
transaction id.

A draft change never touches the store; it is debounced into `maski-ui` and mirrored in
`App.draftState`, which is what the composer and the reply banner read.

## Selectors

`store/select.ts` derives what the views need: sections from membership, tags and
`isDirect`; timeline items with day separators and grouping flags; the room preview as a
sentence in the current language. A selector never mutates and never awaits.

## Rendering

`Shell.render()` runs on a state change and rebuilds the navigation, the header and the
timeline. The navigation is small and rebuilt wholesale; the timeline is keyed, so a stable
row keeps its node and its media, and only a changed row is rebuilt in place. The
composer, the picker and an open dialog are untouched by a render.
