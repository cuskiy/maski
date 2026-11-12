# Data

The projection is the UI's database. The SDK store is the protocol archive. They are not the same database.

This document supersedes the earlier data note in `AGENTS.md` section 20. `AGENTS.md` 0.6 E1/E8 and the UX documents remain authoritative.

## Databases

| DB | Name | Writer | Purpose |
| --- | --- | --- | --- |
| Account | `maski-<hash(userId)>` | worker for Matrix data; main for outbox | projection, media, packs, session, meta |
| UI | `maski-ui` | main | settings, drafts, scroll |
| SDK | SDK's IndexedDB store | worker | sync/session protocol state |
| Crypto | rust crypto IndexedDB | worker | keys, Olm/Megolm state |

The UI DB is global; settings are local. Account data is namespaced by user ID so multi-account can be added later without migration.

## Account stores

| Store | Key | Indexes | Contents |
| --- | --- | --- | --- |
| `session` | `id` | | access token, refresh token, user ID, device ID, base URL |
| `meta` | `key` | | schema/projection version, revision, sync token, sync state, last projected time |
| `rooms` | `roomId` | `lastTs` | room summary |
| `events` | `eventId` | `[roomId, ts, eventId]`, `byToken` multiEntry, `roomId` | normalized timeline row |
| `members` | `[roomId, userId]` | `roomId` | display name, avatar, membership, power |
| `relations` | `relationEventId` | `targetEventId` | edits, reactions, redactions |
| `packs` | `packId` | `roomId`, `global` | image/emoji/sticker packs |
| `media` | `mediaKey` | `lastUsedAt` | cached blobs |
| `outbox` | `txnId` | `[roomId, createdAt]`, `status` | pending sends and blobs |

## Records

### Room

`roomId`, `name`, `topic`, `avatarMxc`, `canonicalAlias`, `isDirect`, `membership`, `selfMembership`, `selfPowerLevel`, `isEncrypted`, `joinRule`, `lastTs`, `lastEvent` (`eventId`, `senderId`, `ts`, `kind`, `preview`), `unreadTotal`, `unreadHighlight`, `muted?`, `readUpToEventId`, `tags` (`m.favourite`, `m.lowpriority`), `order`, `hasOlder`, `updatedAt`.

`lastEvent.preview` is display-ready text: message text, `Image`, `Video`, `File`, `Sticker`, `Encrypted message`, `Message deleted`, or a membership line. It contains no HTML.

Muted is derived from push rules; it is not a room field. The room summary may cache a `muted` flag for rendering, but push rules are the source.

### Event

`eventId`, `roomId`, `senderId`, `ts`, `type`, `kind`, `body`, `formattedBody`, `msgtype`, `media`, `replyTo`, `mentions`, `edited`, `redacted`, `encrypted`, `decryptionError`, `reactions`, `txnId`, `searchText`, `tokens`, `stateKey`, `membership`.

- `kind`: `text`, `emote`, `notice`, `image`, `file`, `audio`, `video`, `sticker`, `membership`, `state`, `redacted`, `encrypted`, `unsupported`.
- `formattedBody` is raw HTML; sanitize at render, never in the store.
- `senderId` resolves to `members`; there is no stored `senderName`/avatar duplicate.
- `media`: `mxc`, `mimetype`, `filename`, `size`, `width`, `height`, `encrypted`, `file` (JSON), `thumbnail`.
- `replyTo`: `eventId`, `senderId`, `body`, `kind`.
- `mentions`: `userIds`, `room`.
- `reactions`: `{ [key]: { count, me } }`.
- `txnId` from `unsigned.transaction_id` or local echo; reconciles outbox.
- `tokens` from normalized body; used by local search.
- State events keep `stateKey`; membership keeps `membership`.
- Redacted events keep the row, clear content, and set `redacted`.
- Decryption failure keeps the row with a visible reason; a later `Decrypted` event updates it.

There is no raw event JSON. The SDK store is the archive. If the projection is lost, the worker rebuilds from the SDK store or resyncs.

### Member

`[roomId, userId]`, `displayName`, `avatarMxc`, `membership`, `powerLevel`, `updatedAt`.

Lazy-loaded members may be absent; the UI falls back to the localpart and a default avatar. A member event updates the record; the timeline resolves names from this store.

### Relation

`relationEventId`, `roomId`, `targetEventId`, `type` (`annotation`, `replace`, `redaction`), `key`, `senderId`, `ts`, `content`, `redacts`.

Relations may arrive before the target. Keep them pending and apply when the target lands. The event row holds the final display state; the relation log allows replay.

### Pack

`packId` is a stable address: `room:<roomId>:<stateKey>`, `user:<userId>`, or `legacy:<...>`. Fields: `packId`, `roomId?`, `stateKey?`, `displayName`, `avatarMxc`, `usage` (`emoticon`/`sticker`), `attribution`, `images` (shortcode -> `{ url, body, info }`), `source` (`room`, `global`, `user`, `legacy`), `enabledGlobal`, `updatedAt`.

The stable events are `m.room.image_pack` and `m.image_pack.rooms`; legacy `im.ponies.room_emotes` and `im.ponies.emote_rooms` are read for compatibility. Global enable writes both stable and legacy account data.

### Media

`mediaKey` = `mxc | width x height | method | encrypted hash`. Fields: `mediaKey`, `mxc`, `mimetype`, `size`, `blob`, `cachedAt`, `lastUsedAt`.

The worker writes media; the main reads and creates object URLs. The cache is an LRU and can be evicted; media errors are visible.

### Outbox

`txnId`, `roomId`, `eventType`, `content`, `blob?` (attachment), `media` metadata, `createdAt`, `attempts`, `nextAttemptAt`, `status` (`pending`, `sending`, `failed`, `sent`), `error`, `eventId`.

The main writes. The worker reads and sends. A remote event with `unsigned.transaction_id` removes the row. One in-flight message per room; retries reuse the txnId; `txn_id` is scoped to a device and endpoint.

## Normalization

`matrix/normalize.ts` is the only event normalizer. It handles:

- `m.room.message` msgtypes: text, emote, notice, image, file, audio, video.
- `m.sticker`.
- `m.room.encrypted` after decryption; decryption failure.
- `m.room.member`, `m.room.name`, `m.room.topic`, `m.room.avatar`, `m.room.canonical_alias`, `m.room.encryption`, `m.room.create`, `m.room.tombstone`.
- `m.room.redaction`, `m.reaction`, `m.replace` relations.
- `m.mentions`, `m.in_reply_to`.
- `unsigned.transaction_id`, `origin_server_ts`, `state_key`.
- Unknown events become `unsupported` only if they belong in the timeline; otherwise they are ignored.

The normalizer emits plain records. Views never parse raw Matrix content.

## Ordering

- Timeline index `[roomId, ts, eventId]`.
- The SDK uses timeline order and falls back to timestamps across timelines; our display order is an approximation. Do not claim exact server order.
- Edits/reactions/redactions do not reorder a room; they update the target and the room preview if the target is the last row.
- Local outbox rows sort after remote events by `createdAt`; the remote echo replaces them.

## Room list

`rooms` provides name, avatar, membership, unread counts, tags, DM flag, last-event preview, and `hasOlder`. Sorting is a selector, not a stored order. Section membership:

- invites: `membership = invite`
- favorites: `m.favourite` tag
- DMs: `m.direct` account data
- rooms: joined, not favorite, not DM
- low priority: `m.lowpriority` tag

Muted comes from push rules.

## Search

- `searchText` is normalized body text.
- `tokens` is produced by NFKC, lowercase, diacritic removal, and `Intl.Segmenter`.
- The multiEntry index `byToken` serves prefix ranges; results intersect tokens, sort by `ts` desc, cap at the configured limit.
- Edits replace tokens; redactions remove them; membership/state events are not indexed.
- The index is local plaintext. No server search.

## Sync and rebuild

- `meta.revision` increments per projection batch.
- `meta.syncToken` is the projected sync token.
- If it differs from the SDK store's saved token after a crash, project the missing SDK timelines and dedupe by event ID; if the projection is inconsistent, rebuild derived stores from the SDK store.
- A projection rebuild keeps `outbox` and `session`; the UI shows progress.
- The SDK store and crypto store have separate lifecycles; a projection rebuild does not delete them.

## Migrations

- Bump the account DB version for schema changes.
- Recreate derived stores (`rooms`, `events`, `members`, `relations`, `packs`, `media`) and `meta` projection fields.
- Keep `session` and `outbox`.
- A rebuild is visible, not silent.
- If the SDK store is also lost, resync; the outbox remains.

## Writer split

| Store | Writer | Reader |
| --- | --- | --- |
| `session` | worker | worker |
| `meta` | worker | main (revision/read), worker |
| `rooms`/`events`/`members`/`relations`/`packs`/`media` | worker | main |
| `outbox` | main | main, worker (read) |
| UI settings/drafts/scroll | main | main |

No store has two writers. A cross-store transaction is owned by one writer. Logout is a lifecycle exception: main closes its account DB connection; worker deletes the account DB; main clears UI drafts/scroll and the last-account pointer. Normal writes still have one writer.

## Privacy

- The projection stores decrypted message text and cached media for offline read and search.
- Device keys sit in the same profile; a profile attacker could decrypt anyway. XSS is the real boundary: CSP, sanitization, and no token in the main thread.
- The search index is plaintext; notification previews can expose decrypted text; both are explicit in the UI.
- Profile names/avatars and pack images are server-visible and not encrypted.

## References

- AGENTS.md 0.6 E1/E8, 12, 20, 25, 30.
- matrix-js-sdk `src/store/indexeddb.ts`, `src/models/event.ts`, `src/models/room.ts`, `src/sync.ts` at `14a114e`.
- Cinny `src/client/initMatrix.ts`, `src/app/features/room/RoomTimeline.tsx`, `src/app/plugins/custom-emoji` at `474400c`.
- Matrix spec v1.19; MSC2545; MDN IndexedDB/Intl.Segmenter.
