import type {
  Connection,
  DeviceSession,
  Invite,
  Member,
  MessageRow,
  MessageStatus,
  NotificationPrefs,
  Phase,
  RecoveryKey,
  RoomSummary,
  SessionSummary,
} from "../core/types.ts";

export interface SourceEvents {
  readonly session: SessionSummary | null;
  readonly rooms: { readonly rooms: readonly RoomSummary[]; readonly loading: boolean };
  readonly window: {
    readonly roomId: string;
    readonly messages: readonly MessageRow[];
    readonly hasOlder: boolean;
    readonly older: boolean;
  };
  readonly phase: Phase;
  readonly devices: readonly DeviceSession[];
  readonly invites: readonly Invite[];
  readonly members: readonly Member[];
  readonly connection: Connection;
  readonly recoveryKey: RecoveryKey | null;
  readonly outbox: {
    readonly roomId: string;
    readonly messageId: string;
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
  markRead(roomId: string): void;
  react(roomId: string, messageId: string, key: string): void;
  edit(roomId: string, messageId: string, body: string, html: string | null): void;
  redact(roomId: string, messageId: string): void;
  search(roomIds: readonly string[], query: string): readonly MessageRow[];
  forward(roomId: string, rows: readonly MessageRow[]): void;
  typing(roomId: string): void;
  setNotification(roomId: string, mode: RoomSummary["notification"]): void;
  revealRecoveryKey(): void;
  verifyDevice(deviceId: string): void;
  signOutDevice(deviceId: string): void;
  signOutOthers(): void;
  answerInvite(roomId: string, accept: boolean): void;
  saveNotifications(prefs: NotificationPrefs): void;
  logout(): void;
  on<K extends SourceEvent>(event: K, listener: (payload: SourceEvents[K]) => void): () => void;
  dispose(): void;
}
