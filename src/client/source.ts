import type {
  Connection,
  DeviceSession,
  GuestAccess,
  Invite,
  Member,
  MessageRow,
  MessageStatus,
  NotificationPrefs,
  Phase,
  RecoveryKey,
  RoomHistoryVisibility,
  RoomJoinRule,
  RoomSummary,
  SessionSummary,
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
  readonly rooms: { readonly rooms: readonly RoomSummary[]; readonly loading: boolean };
  readonly window: {
    readonly roomId: string;
    readonly messages: readonly MessageRow[];
    readonly hasOlder: boolean;
    readonly older: boolean;
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
    readonly eventId: string | null;
    readonly status: MessageStatus;
    readonly error: string | null;
  };
}

export type SourceEvent = keyof SourceEvents;

export interface ChatSource {
  start(): void;
  open(roomId: string): void;
  older(roomId: string): void;
  send(roomId: string, row: MessageRow): void;
  markRead(roomId: string, eventId: string | null): void;
  react(roomId: string, eventId: string, key: string): void;
  edit(roomId: string, eventId: string, body: string, html: string | null): void;
  redact(roomId: string, eventId: string): void;
  search(roomIds: readonly string[], query: string, mediaKinds?: ReadonlySet<string>): readonly MessageRow[];
  forward(roomId: string, rows: readonly MessageRow[]): void;
  typing(roomId: string): void;
  members(roomId: string): void;
  memberAction(roomId: string, userId: string, action: "kick" | "ban" | "unban"): void;
  inviteUser(roomId: string, userId: string): void;
  addRoom(room: RoomSummary): void;
  leaveRoom(roomId: string): void;
  setRoomState(roomId: string, patch: RoomStatePatch): void;
  setRoomTag(roomId: string, tag: "m.favourite" | "m.lowpriority", enabled: boolean): void;
  setNotification(roomId: string, mode: RoomSummary["notification"]): void;
  resetRecoveryKey(): void;
  resetIdentity(): void;
  signOutDevice(deviceId: string): void;
  signOutOthers(): void;
  answerInvite(roomId: string, accept: boolean): void;
  saveNotifications(prefs: NotificationPrefs): void;
  logout(): Promise<void>;
  on<K extends SourceEvent>(event: K, listener: (payload: SourceEvents[K]) => void): () => void;
  dispose(): void;
}
