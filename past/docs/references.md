# References

Checked while writing this implementation, current as of the rewrite.

| Source | Used for |
| --- | --- |
| Matrix Client-Server API v1.11+ (spec.matrix.org) | media endpoints, `m.mentions`, `m.relates_to`, replies, secret storage, key backup, read markers, push rules, tags, `m.direct` |
| `matrix-js-sdk` 45.1.0, `git/matrix-js-sdk` | `CryptoApi` (`bootstrapSecretStorage`, `bootstrapCrossSigning`, `loadSessionBackupPrivateKeyFromSecretStorage`, `checkKeyBackupAndEnable`), `ServerSideSecretStorage.getKey`, `Room.relations.getChildEventsForEvent`, `MatrixEvent.isRedactionEvent`, `RoomEvent` names, `Attachment.encrypt`/`decrypt` |
| Element Web `git/element-web` (`f92fed5`) | the order of the secret-storage access steps (`SecurityManager.accessSecretStorage`) and the shape of the recovery flow (`SetupEncryptionStore`) |
| Cinny `git/cinny` | the legacy pack identifiers (`im.ponies.room_emotes`), the timeline window behaviour |
| MDN | `dialog`, container queries, `light-dark()`, `color-mix()`, `Intl`, Pointer Events, IndexedDB, Web Workers |
| `blog/` | the token table and the visual language |

No code is copied from these projects. Their behaviour and their protocol details are, and
where our design differs the difference is recorded in `decisions.md`.
