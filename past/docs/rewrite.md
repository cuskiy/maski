# The third attempt, and what the first two taught

`backup/` is the first attempt, `backup2/` the second. Both are kept whole: a rewrite is
cheaper to judge when the thing it replaces is still readable.

## What went wrong in the first attempt

The code was written before the shape of the data was decided, so the shape changed under
it. The store, the projection and the interface each grew their own copy of the same facts:
a room's last message existed in three places and disagreed with itself. Bugs were not
localised, because a fact with two owners has two ways to be wrong.

## What went wrong in the second attempt

The second attempt had a shape, and it was a good shape. What it did not have was a budget
for the parts that touch the reader:

- **Every region re-rendered from one store.** A keystroke, a typing event and a sync all
  called the same `render`, so the navigation, the header, the timeline and the composer
  were rebuilt for a change that touched one of them. It worked, and it was always one
  timing bug away from a lost caret or a scroll jump.
- **Two writers on one database.** The main thread wrote the queued row and the worker
  deleted it. That is a rule a reviewer has to remember, not a property of the code.
- **The projection was designed forward only.** Backfill arrived later and had to be bolted
  on by clearing the cursor, which quietly lost every page after the first.
- **The interface grew before the data settled.** Dialogs, pickers, settings and verification
  were written while the message model was still moving, so the second attempt kept
  finding the same class of bug in a new file.
- **The stylesheet was written per component.** It had tokens, and then a rule per variant,
  until two rules disagreed about what a hovered row looks like.

## What the third attempt does differently

**One owner per fact.** The worker owns the account database and every row in it. The main
thread owns the interface state and the settings database. Nothing is written twice, and no
key has two writers.

**Subscribe to what you draw.** The store is a map of keys; a subscriber names the keys it
reads. A room list change does not repaint the timeline, and a keystroke does not repaint
the navigation. Every region keeps its own DOM and reconciles keyed rows in place.

**Snapshots in, commands out.** The worker pushes a room list and one room window; the main
thread renders exactly that. It never asks a second question about the same fact.

**Both directions of the timeline, from the start.** A sync appends after the room cursor
and revisits the tail; backfill prepends, where the cursor is blind, and stops at the first
stored id. Two passes, one rule.

**The vertical slice first.** Sign in, the gate, the room list, the timeline, a sent
message. Everything else is absent until it is written, never present and dead.
