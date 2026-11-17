import type {
  BackupState,
  DeviceSession,
  MessageKind,
  MessageRow,
  RoomStatePatch,
  SasState,
  SessionSummary,
} from "../core/types.ts";
import type { CommandMap, Event, KeyStatus, MediaReply, StartData } from "../protocol/index.ts";

export interface SessionPort {
  start(input: CommandMap["start"]): Promise<StartData>;
  login(input: CommandMap["login"]): Promise<SessionSummary>;
  logout(): Promise<null>;
  keyStatus(): Promise<KeyStatus>;
  recover(input: CommandMap["recover"]): Promise<KeyStatus>;
  open(roomId: string): Promise<null>;
  older(roomId: string): Promise<null>;
  send(
    roomId: string,
    body: string,
    html: string | null,
    replyTo: string | null,
    transactionId: string,
    messageId: string,
    kind: CommandMap["send"]["kind"],
    media: CommandMap["send"]["media"],
  ): Promise<MessageRow>;
  retrySend(roomId: string, messageId: string): Promise<MessageRow>;
  discardSend(roomId: string, messageId: string): Promise<null>;
  sendMedia(input: CommandMap["sendMedia"]): Promise<MessageRow>;
  sendSticker(input: CommandMap["sendSticker"]): Promise<MessageRow>;
  media(input: CommandMap["media"]): Promise<MediaReply>;
  markRead(roomId: string, eventId: string): Promise<null>;
  members(roomId: string): Promise<null>;
  devices(): Promise<readonly DeviceSession[]>;
  backupStatus(): Promise<BackupState>;
  backupSetup(): Promise<BackupState>;
  sasStart(deviceId: string | null): Promise<SasState>;
  sasAccept(id: string): Promise<null>;
  sasConfirm(id: string): Promise<null>;
  sasMismatch(id: string): Promise<null>;
  sasCancel(id: string): Promise<null>;
  resetIdentity(password: string): Promise<string | null>;
  react(roomId: string, eventId: string, key: string): Promise<null>;
  edit(roomId: string, eventId: string, body: string, html: string | null): Promise<null>;
  redact(roomId: string, eventId: string): Promise<null>;
  typing(roomId: string, typing: boolean): Promise<null>;
  search(
    roomIds: readonly string[],
    query: string,
    mediaKinds: readonly MessageKind[],
    limit: number,
  ): Promise<readonly MessageRow[]>;
  leaveRoom(roomId: string): Promise<null>;
  setRoomTag(roomId: string, tag: CommandMap["setRoomTag"]["tag"], enabled: boolean): Promise<null>;
  setNotification(roomId: string, mode: CommandMap["setNotification"]["mode"]): Promise<null>;
  setRoomState(roomId: string, patch: RoomStatePatch): Promise<null>;
  inviteUser(roomId: string, userId: string): Promise<null>;
  joinRoom(roomIdOrAlias: string): Promise<string>;
  answerInvite(roomId: string, accept: boolean): Promise<string | null>;
  createRoom(name: string, topic: string, directUserId: string | null): Promise<string>;
  forward(
    targetRoomId: string,
    sources: readonly { readonly roomId: string; readonly eventId: string }[],
  ): Promise<null>;
  memberAction(roomId: string, userId: string, action: "kick" | "ban" | "unban"): Promise<null>;
  onEvent(listener: (event: Event) => void): () => void;
}
