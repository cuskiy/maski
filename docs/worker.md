# Worker

The worker owns everything that touches the network, the encryption stack and the
projection. One `MatrixClient` per worker, one worker per tab.

## Session lifecycle

`start` opens the account database named by the hash the main thread passes, reads the
session record, answers `ready` and then starts the client in the background:

1. `createClient` with the stored token, user and device.
2. `initRustCrypto({ cryptoDatabasePrefix })` — an IndexedDB store, unencrypted, because
   the token and the keys already share this origin.
3. `startClient({ initialSyncLimit: 20 })` — the SDK event store is in memory; the
   projection is what persists.
4. `recoverQueue` marks a message that was being sent when the tab closed as failed, so it
   offers a retry instead of hanging.
5. `keyStatus` decides whether the shell may open.

Commands that need encryption await the startup promise, so a click during boot waits for
the crypto stack rather than reporting a false "not set up".

## Sync

Every `ClientEvent.Sync` in `Prepared` or `Syncing` records the rooms in the response and
schedules one pass after 60 ms. The pass touches:

- rooms from the sync response;
- rooms that emitted a timeline, state, membership, receipt, tag or account-data change.

`RoomMemberEvent.Typing` posts a `typing` event instead of a pass; typing is not state.

## The key gate

Opening an existing account without keys shows the gate. Unlocking follows the same order
as Element's `accessSecretStorage`, which is the sequence the SDK expects:

1. `secretStorage.hasKey()` and `secretStorage.getKey()` give the description of the
   default key — including the passphrase salt, when the account has one.
2. The input is decoded (`decodeRecoveryKey`) or derived
   (`deriveRecoveryKeyFromPassphrase`) and cached for the duration of the operation.
3. `bootstrapCrossSigning({})` imports the cross-signing keys from secret storage and
   signs this device, which is what makes the other sessions trust it.
4. `bootstrapSecretStorage({})` records the backup key again.
5. `loadSessionBackupPrivateKeyFromSecretStorage()` and `checkKeyBackupAndEnable()` restore
   history.
6. The cached key is dropped.

The cache is the `getSecretStorageKey` callback's only source; it returns nothing outside
an operation, so a background request can never silently use a stale key.

Starting over generates a key with `createRecoveryKeyFromPassphrase`, passes it through
`bootstrapSecretStorage({ setupNewSecretStorage: true, setupNewKeyBackup: true })`, then
`bootstrapCrossSigning({ setupNewCrossSigning: true })` with the password for the UIA
prompt. The encoded key is returned once for display and never stored.

Failures carry a code — `no-keys`, `invalid`, `restore`, `uia` — and the gate shows a
sentence per code instead of one vague error.

## Verifying a device

`worker/verify.ts` holds one SAS verification. An incoming request is tracked from
`CryptoEvent.VerificationRequestReceived`; a request from this side starts with
`crypto.requestDeviceVerification(userId, deviceId)`. Once the request is `Ready` the side
that asked for it calls `startVerification("m.sas.v1")`. A client that only answered the
request starts SAS itself after a pause, because some clients never send the start and the
two sides would otherwise wait for each other. Seven emoji arrive through `VerifierEvent.ShowSas`, the user compares
them and confirms with `sas.confirm()`; the SDK completes the MAC exchange and signs the
device, which is what lets senders share room keys with it.

The update is posted as one `verify` event with a state — `requested`, `ready`, `sas`,
`done`, `cancelled` — and the interface renders it inside Settings, so a live flow stays in
the dialog that owns it.

## Sessions

`devices` lists the account's sessions with `getDevices` and
`crypto.getDeviceVerificationStatus`. `signOutOthers` and `signOutDevice` delete through
`deleteMultipleDevices`: the first request asks the server for a user-interactive auth
session, and the second carries that session with the password. The current device is never
in the list to delete.

## Members

The client starts with `lazyLoadMembers`, so a large room does not download its member list
before the timeline. Opening a room asks for the list in the background and projects the
room again when it arrives, which fills in the names of senders already on screen.

## Sending

The main thread writes the queued row, then sends `text`, `sticker` or `sendFile` with its
transaction id. The worker:

- builds the content; a reply adds `m.relates_to`, an `m.mentions` entry for the replied-to
  sender, and the `> <@user> …` fallback together with an `mx-reply` block in the
  formatted body;
- uploads media first, encrypting it with `Attachment.encrypt` when the room is encrypted,
  so an encrypted room never receives a plaintext upload;
- sends through `sendEvent` with the same transaction id, which is what makes a retry
  idempotent;
- posts `outbox` for the failure case and leaves the row to the echo for the success case.

## Media

`media` fetches `/_matrix/client/v1/media/thumbnail` or `/download` with the access token,
decrypts with `Attachment.decrypt` when the record carries a `file` object, caches the
blob under `mxc@size/method` and returns it. An encrypted original has no usable thumbnail,
so the media element asks for the original when `file` is present.

Every send goes through `deliver`, which posts the `outbox` status and rethrows, so the
three send paths share one failure behaviour.

## Uploads

An attachment is encrypted first when the room is, uploaded with a progress handler and an
abort signal, and the queued row is rewritten with the resulting media before the event is
sent. Discarding the row aborts the upload, so a cancelled file never lands on the server.

## A dead session

`/sync` answering `M_UNKNOWN_TOKEN` means the device was signed out elsewhere. The worker
stops the client and posts an empty session; the interface returns to the sign-in page
instead of showing a shell that can never sync again.

## Errors

`dispatch` rejects with an `Error`; `worker.ts` maps it to `{ ok: false, error }`. A gate
failure keeps its code so the interface can explain it. Nothing logs a token, a key or a
message body: the logger is a no-op and diagnostics go through `fatal`.
