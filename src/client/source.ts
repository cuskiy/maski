import type {
  BackupState,
  Connection,
  DeviceSession,
  KeyGate,
  Invite,
  Member,
  MessageRow,
  NotificationPrefs,
  Phase,
  RecoveryKey,
  RoomStatePatch,
  RoomSummary,
  SasState,
  SessionSummary,
  SourceCapabilities,
} from "../core/types.ts";
import type { CommandMap, FailureCode, MediaReply, MediaVariant } from "../protocol/index.ts";

export type { RoomStatePatch };

export interface ForwardSource {
  readonly roomId: string;
  readonly eventId: string;
}

export interface SourceEvents {
  readonly session: SessionSummary | null;
  readonly keys: KeyGate;
  readonly rooms: { readonly rooms: readonly RoomSummary[]; readonly loading: boolean };
  readonly window: {
    readonly roomId: string;
    readonly messages: readonly MessageRow[];
    readonly hasOlder: boolean;
    readonly older: boolean;
    readonly patch: boolean;
  };
  readonly members: { readonly roomId: string; readonly members: readonly Member[] };
  readonly typing: { readonly roomId: string; readonly userIds: readonly string[] };
  readonly phase: Phase;
  readonly devices: {
    readonly devices: readonly DeviceSession[] | null;
    readonly error: FailureCode | null;
  };
  readonly backup: BackupState;
  readonly invites: readonly Invite[];
  readonly connection: Connection;
  readonly recoveryKey: RecoveryKey | null;
  readonly sas: SasState;
  readonly outbox: {
    readonly roomId: string;
    readonly messageId: string;
    readonly row: MessageRow | null;
    readonly retryable: boolean;
  };
  /** A worker-minted object URL was revoked; the row must resolve again. */
  readonly media: {
    readonly roomId: string;
    readonly messageId: string;
    readonly variant: MediaVariant;
    readonly url: string | null;
  };
  readonly failure: {
    readonly command: "open" | "older" | "members";
    readonly code: FailureCode;
  };
}

export type SourceEvent = keyof SourceEvents;

/** One channel per event, so a listener is stored with the payload type it was written for. */
export type SourceListeners = {
  readonly [K in SourceEvent]: Set<(payload: SourceEvents[K]) => void>;
};

export function createSourceListeners(): SourceListeners {
  return {
    session: new Set(),
    keys: new Set(),
    rooms: new Set(),
    window: new Set(),
    members: new Set(),
    typing: new Set(),
    phase: new Set(),
    devices: new Set(),
    backup: new Set(),
    invites: new Set(),
    connection: new Set(),
    recoveryKey: new Set(),
    sas: new Set(),
    outbox: new Set(),
    media: new Set(),
    failure: new Set(),
  };
}

export function clearSourceListeners(listeners: SourceListeners): void {
  for (const channel of Object.values(listeners)) channel.clear();
}

export interface ChatSource {
  /** One explicit contract: an absent command is an absent capability, never a fake call. */
  readonly capabilities: SourceCapabilities;
  start(): void;
  open(roomId: string): void;
  older(roomId: string): void;
  send(roomId: string, row: MessageRow): Promise<MessageRow>;
  /** Sends bytes through the worker; the queued row arrives as an `outbox` event. */
  sendMedia?(
    roomId: string,
    messageId: string,
    transactionId: string,
    caption: string,
    html: string | null,
    replyTo: string | null,
    kind: CommandMap["sendMedia"]["kind"],
    name: string,
    file: Blob,
  ): Promise<MessageRow>;
  /** Sends an image already stored in an image pack; no bytes cross the main thread. */
  sendSticker?(
    roomId: string,
    messageId: string,
    transactionId: string,
    packId: string,
    shortcode: string,
  ): Promise<MessageRow>;
  /** Resolves a worker-only source to a `blob:` URL; absent means the surface is hidden. */
  media?(roomId: string, messageId: string, variant: MediaVariant): Promise<MediaReply>;
  setAvatar?(file: Blob): Promise<void>;
  pat?(roomId: string, userId: string, effect: "pat" | "boop"): Promise<void>;
  retrySend(roomId: string, messageId: string): Promise<MessageRow>;
  discardSend(roomId: string, messageId: string): void;
  markRead(roomId: string, eventId: string): Promise<void> | void;
  /** A command the production worker does not implement is absent here and hidden by capability. */
  react?(roomId: string, eventId: string, key: string): Promise<void> | void;
  edit?(roomId: string, eventId: string, body: string, html: string | null): Promise<void> | void;
  redact?(roomId: string, eventId: string): Promise<void> | void;
  search?(roomIds: readonly string[], query: string, mediaKinds?: ReadonlySet<string>): Promise<readonly MessageRow[]>;
  forward?(targetRoomId: string, sources: readonly ForwardSource[]): void;
  typing?(roomId: string, typing: boolean): void;
  members(roomId: string): void;
  memberAction?(roomId: string, userId: string, action: "kick" | "ban" | "unban"): Promise<void>;
  inviteUser?(roomId: string, userId: string): void;
  /** The review fixture inserts a local room; production creates through `createRoom`. */
  addRoom?(room: RoomSummary): void;
  createRoom?(name: string, topic: string, directUserId: string | null): Promise<string>;
  joinRoom?(roomIdOrAlias: string): Promise<string>;
  leaveRoom?(roomId: string): void;
  setRoomState?(roomId: string, patch: RoomStatePatch): void;
  setRoomTag?(roomId: string, tag: "m.favourite" | "m.lowpriority", enabled: boolean): void;
  setNotification?(roomId: string, mode: RoomSummary["notification"]): void;
  resetRecoveryKey?(): void;
  resetIdentity?(password: string): void;
  /** SAS starts own-user verification when `deviceId` is null; events carry every transition. */
  startSas?(deviceId: string | null): Promise<void>;
  acceptSas?(id: string): Promise<void>;
  confirmSas?(id: string): Promise<void>;
  mismatchSas?(id: string): Promise<void>;
  cancelSas?(id: string): Promise<void>;
  signOutDevice?(deviceId: string): void;
  signOutOthers?(): void;
  answerInvite?(roomId: string, accept: boolean): void;
  saveNotifications?(prefs: NotificationPrefs): void;
  backupSetup?(): void;
  logout(): Promise<void>;
  on<K extends SourceEvent>(event: K, listener: (payload: SourceEvents[K]) => void): () => void;
  dispose(): void;
}
