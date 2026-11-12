# Data

## Databases

`maski-<accountHash>` holds the projection of one account. `maski-ui` holds what belongs
to this browser: settings and drafts, keyed by account so a second account cannot collide.

| Store | Key | Indexes | Holds |
| --- | --- | --- | --- |
| `rooms` | `roomId` | | the room summary the navigation renders |
| `events` | `id` | `room`, `roomTs [roomId, ts, id]`, `search` multiEntry, `status` | messages, including the queued ones |
| `members` | `[roomId, userId]` | `room` | display name, avatar, membership, power |
| `packs` | `id` | | emoji and sticker packs resolved from room state and account data |
| `media` | `key` | `used` | cached blobs, keyed by `mxc@size/method` |
| `meta` | `key` | | session, revision, per-room cursor, `m.direct` |

`relations` still exists in the schema for a future that needs the raw relation events; the
current code reads relations from the room aggregate instead, so nothing writes it. It is
kept as a store rather than removed because removing a store needs another version bump.

## The message record

One record shape for every row in a timeline: text, media, sticker, state, and the message
you have just written. The differences are fields, not types.

- `kind` decides the element the row builds.
- `status` is `sent`, `queued`, `sending` or `failed`. A queued row is written by the main
  thread before the command is sent and deleted by the worker when the remote echo lands,
  so it never survives as a duplicate.
- `reactions` is a computed summary, not a relation list.
- `search` is a token array, maintained on write and on edit.
- `html` is the formatted body as received; it is sanitized at render, never before.

## Ordering

`[ts, id]`. The worker writes remote events with the server timestamp; the main thread
writes a queued row with the local clock. Both live in the same index, so a room window is
one backward cursor read. The user's own echo arrives with the server timestamp, so the
row moves to its final place once and only once.

## The projection pass

`worker/project.ts` runs after each sync for the rooms the sync touched:

1. read the per-room cursor from `meta`;
2. take every timeline event after the cursor, plus the last thirty rows, because an edit
   or a reaction changes an older event in place and never adds a timeline event;
3. normalize each event; a redacted event deletes its row instead of rewriting it;
4. resolve replies against the stored target;
5. write members, recompute the room summary, store the cursor.

A local echo (`~room:txn`) is skipped: it is the queued row the main thread wrote, and the
remote echo replaces that row by transaction id.

Writes are idempotent, so a pass that runs twice writes the same bytes. A rebuild never
clears the store: a room disappears only when the user leaves it.

## Migrations

`DB_VERSION` is 2. `upgradeAccount` creates each store only when it is missing, so an
upgrade between versions is a small addition rather than a rebuild. A store that changes
shape is emptied and filled again by the next sync; `session` and `meta` are never
dropped, because a rebuild must not sign the user out.

## Search

`db.search` takes the query tokens, intersects the primary keys of the `search` index for
each token, loads the rows and sorts by timestamp. The normalisation is NFKC, lowercase,
diacritics stripped, split on anything that is not a letter or a digit. The worker runs it
and returns the hits, so the main thread never scans a room.
