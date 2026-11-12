# Decisions

## Why the projection, not SDK objects

The SDK keeps the truth about a room, but it keeps it in memory, in its own shape, and it
mutates events in place. Rendering from it means every view depends on SDK internals and
nothing survives a reload without a full sync. A projection row is a stable, serializable
record that the interface can render offline and search locally. The cost is a
translation layer; the benefit is that the interface never blocks on the network.

## Why a queued message is a message

The previous design had three representations of "not yet sent": an outbox record, a
pending list, and the remote echo. They had to agree, and every disagreement was a bug —
duplicate rows, rows that never left, retries that sent twice. One record with a `status`,
written before the command and deleted by the echo, removes the class of defect rather than
patching an instance of it. Two writers on one store is a real cost; it is bounded by the
fact that the main thread only ever writes a transaction-id key it created.

## Why relations are read, not replayed

Storing edits and reactions separately and applying them to a target means solving ordering
(a relation can arrive before its parent), deduplication, withdrawal and re-application
after a rebuild. The SDK already aggregates: the parent event in a room knows its
annotations and its last replacement. Reading that aggregate at projection time is one
function instead of a subsystem. The limit is honest: a relation to a message that has left
the SDK's window cannot be recomputed, so the projection re-reads the last thirty rows each
pass and accepts that older history settles when it is next touched.

The same asymmetry decides pagination. A backward pass cannot use the cursor, and clearing
the cursor to force a re-read only re-projects a fixed window from the end, so every page
after the first would fall off the start. `olderEvents` walks from the start of the live
timeline and stops at the first stored id: one page costs one page of writes.

## Why the worker

Encryption, sync and uploads are long, blocking and secret-bearing. On the main thread they
fight the interface for the same thread and put the token where the DOM can reach it. A
dedicated worker gives the interface a message boundary: it asks, the worker answers, and
the projection is the shared state. The cost is a protocol; the protocol is one file of
types.

## Why two HTML entries

Serving a translated shell needs a real document with the right `lang`, title and
description. A single document rewritten by script flashes the wrong language and breaks
without JavaScript. Two Vite entries cost one extra build target and give a static,
auditable shell per language.

## Rejected

- A virtualized timeline: a bounded window with keyed rows is enough at 800 rows and keeps
  scroll anchoring simple and deterministic.
- A second pending model, a relation store, a client-side search index and a state library:
  each is a parallel truth that has to be kept in sync with the first one.
- `contenteditable` for styled text: native undo, selection and IME break, and the caret
  drifts from the stored text. A range model over a textarea keeps the platform behaviour.
- Width media queries: one container query on `body` covers both screens.
