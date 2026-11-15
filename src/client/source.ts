import type {
  Connection,
  DeviceSession,
  GuestAccess,
  KeyGate,
  Invite,
  Member,
  MessageRow,
  NotificationPrefs,
  Phase,
  RecoveryKey,
  RoomHistoryVisibility,
  RoomJoinRule,
  RoomSummary,
  SessionSummary,
  SourceCapabilities,
} from "../core/types.ts";

export interface RoomStatePatch {
  readonly name?: string;
  readonly topic?: string;
  readonly aliases?: readonly string[];
  readonly joinRule?: RoomJoinRule;
  readonly guestAccess?: GuestAccess;
  readonly historyVisibility?: RoomHistoryVisibility;
  readonly directoryPublished?: boolean;
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
  readonly phase: Phase;
  readonly devices: readonly DeviceSession[];
  readonly invites: readonly Invite[];
  readonly connection: Connection;
  readonly recoveryKey: RecoveryKey | null;
  readonly outbox: {
    readonly roomId: string;
    readonly messageId: string;
    readonly row: MessageRow | null;
    readonly retryable: boolean;
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
    phase: new Set(),
    devices: new Set(),
    invites: new Set(),
    connection: new Set(),
    recoveryKey: new Set(),
    outbox: new Set(),
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
  retrySend(roomId: string, messageId: string): Promise<MessageRow>;
  discardSend(roomId: string, messageId: string): void;
  markRead(roomId: string, eventId: string): void;
  /** A command the production worker does not implement is absent here and hidden by capability. */
  react?(roomId: string, eventId: string, key: string): void;
  edit?(roomId: string, eventId: string, body: string, html: string | null): void;
  redact?(roomId: string, eventId: string): void;
  search?(roomIds: readonly string[], query: string, mediaKinds?: ReadonlySet<string>): readonly MessageRow[];
  forward?(roomId: string, rows: readonly MessageRow[]): void;
  typing?(roomId: string): void;
  members(roomId: string): void;
  memberAction?(roomId: string, userId: string, action: "kick" | "ban" | "unban"): void;
  inviteUser?(roomId: string, userId: string): void;
  addRoom?(room: RoomSummary): void;
  leaveRoom?(roomId: string): void;
  setRoomState?(roomId: string, patch: RoomStatePatch): void;
  setRoomTag?(roomId: string, tag: "m.favourite" | "m.lowpriority", enabled: boolean): void;
  setNotification?(roomId: string, mode: RoomSummary["notification"]): void;
  resetRecoveryKey?(): void;
  resetIdentity?(password: string): void;
  signOutDevice?(deviceId: string): void;
  signOutOthers?(): void;
  answerInvite?(roomId: string, accept: boolean): void;
  saveNotifications?(prefs: NotificationPrefs): void;
  logout(): Promise<void>;
  on<K extends SourceEvent>(event: K, listener: (payload: SourceEvents[K]) => void): () => void;
  dispose(): void;
}
