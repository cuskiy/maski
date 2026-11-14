import type {
  DeltaPayload,
  DeviceRecord,
  EventRecord,
  MemberRecord,
  OutboxStatus,
  PackRecord,
  ProfileRecord,
  RoomRecord,
  VerificationState,
} from "../data/records";

export interface SessionSummary {
  userId: string;
  deviceId: string;
  displayName: string;
  avatarMxc: string | null;
  accountHash: string;
}

export interface ErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
}

export interface CommandRequest {
  id: string;
  type: string;
  payload: unknown;
}

export interface CommandReply {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: ErrorInfo;
}

export interface AckMessage {
  type: "ack";
  revision: number;
}

export interface UiaAnswer {
  type: "uia";
  requestId: string;
  auth: Record<string, unknown> | null;
}

export interface UiaCancel {
  type: "uiaCancel";
  requestId: string;
}

export type ClientToWorker = CommandRequest | AckMessage | UiaAnswer | UiaCancel;

export interface SsoTarget {
  loginType: "sso" | "cas";
  idpId: string | null;
  name: string;
}

export interface DiscoveryResult {
  baseUrl: string;
  loginFlows: string[];
  ssoTargets: SsoTarget[];
  registration: boolean;
}

export interface LoginPayload {
  baseUrl: string;
  identifier: string;
  password: string;
}

export interface RegisterPayload {
  baseUrl: string;
  username: string;
  password: string;
}

export interface SsoPayload {
  baseUrl: string;
  redirectUrl: string;
}

export interface LoginTokenPayload {
  baseUrl: string;
  token: string;
  deviceId?: string;
}

export interface PaginatePayload {
  roomId: string;
  direction: "b" | "f";
  limit: number;
}

export interface JumpPayload {
  roomId: string;
  eventId: string;
}

export interface MarkReadPayload {
  roomId: string;
  eventId: string;
}

export interface TypingPayload {
  roomId: string;
  typing: boolean;
}

export interface SendPayload {
  txnId: string;
}

export interface CancelSendPayload {
  txnId: string;
}

export interface CreateRoomPayload {
  name: string;
  topic: string;
  visibility: "public" | "private";
  invite: string[];
  encrypted: boolean;
}

export interface JoinRoomPayload {
  roomIdOrAlias: string;
}

export interface LeaveRoomPayload {
  roomId: string;
}

export interface InvitePayload {
  roomId: string;
  userId: string;
}

export interface CreateDmPayload {
  userId: string;
}

export interface SetRoomStatePayload {
  roomId: string;
  eventType: string;
  content: Record<string, unknown>;
  stateKey?: string;
}

export interface SetRoomTagPayload {
  roomId: string;
  tag: string;
  value: Record<string, unknown> | null;
}

export interface SetNotificationModePayload {
  roomId: string;
  mode: "all" | "mentions" | "mute";
}

export interface UploadRoomAvatarPayload {
  roomId: string;
  buffer: ArrayBuffer;
  mime: string;
}

export interface SetPackGlobalPayload {
  packId: string;
  enabled: boolean;
}

export interface DeleteDevicePayload {
  deviceId: string;
}

export interface DeleteDevicesPayload {
  deviceIds: string[];
}

export interface VerifyDevicePayload {
  deviceId: string;
}

export interface VerifyUserPayload {
  userId: string;
}

export interface VerificationRequestPayload {
  requestId: string;
}

export interface GetProfilePayload {
  userId: string;
}

export interface SetDisplayNamePayload {
  displayName: string;
}

export interface UploadAvatarPayload {
  buffer: ArrayBuffer;
  mime: string;
}

export interface RecoveryStatus {
  secretStorage: boolean;
  backup: boolean;
  crossSigning: boolean;
  deviceVerified: boolean;
  hasRecoveryKey: boolean;
}

export interface SetupRecoveryPayload {
  passphrase?: string;
}

export interface UnlockRecoveryPayload {
  recoveryKey?: string;
  passphrase?: string;
}

export interface MediaPayload {
  mediaKey: string;
  mxc: string;
  width: number;
  height: number;
  method: string;
  file?: import("../data/records").EncryptedFile;
}

export interface MediaResult {
  buffer: ArrayBuffer;
  mime: string;
}

export interface PaginateResult {
  added: number;
  reachedStart: boolean;
}

export interface JumpResult {
  found: boolean;
}

export interface DeviceListResult {
  devices: DeviceRecord[];
}

export interface ProfileResult {
  profile: ProfileRecord;
}

export interface RecoveryResult {
  status: RecoveryStatus;
}

export interface SetupRecoveryResult {
  recoveryKey: string;
  status: RecoveryStatus;
}

export interface OutboxEvent {
  type: "outbox";
  txnId: string;
  status: OutboxStatus;
  progress?: number;
  eventId?: string;
  error?: string;
  attempts?: number;
}

export interface SessionEvent {
  type: "session";
  session: SessionSummary;
}

export interface ReadyEvent {
  type: "ready";
  session: SessionSummary | null;
  revision: number;
  syncState: string;
}

export interface DeltaEvent {
  type: "delta";
  delta: DeltaPayload;
}

export interface ReloadEvent {
  type: "reload";
  revision: number;
}

export interface TypingEvent {
  type: "typing";
  roomId: string;
  userIds: string[];
}

export interface SyncEvent {
  type: "sync";
  state: string;
}

export interface ProgressEvent {
  type: "progress";
  phase: string;
  done: number;
  total: number;
}

export interface VerificationEvent {
  type: "verification";
  state: VerificationState;
}

export interface UiaEvent {
  type: "uia";
  requestId: string;
  stages: string[];
  params: Record<string, unknown>;
}

export interface FatalEvent {
  type: "fatal";
  code: string;
  message: string;
}

export interface LogEvent {
  type: "log";
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

export interface ToastEvent {
  type: "toast";
  message: string;
}

export type WorkerToClient =
  | ReadyEvent
  | DeltaEvent
  | ReloadEvent
  | OutboxEvent
  | SessionEvent
  | TypingEvent
  | SyncEvent
  | ProgressEvent
  | VerificationEvent
  | UiaEvent
  | FatalEvent
  | LogEvent
  | ToastEvent;

export type RoomDelta = RoomRecord;
export type EventDelta = EventRecord;
export type MemberDelta = MemberRecord;
export type PackDelta = PackRecord;

export interface UiaState {
  requestId: string;
  stages: string[];
  params: Record<string, unknown>;
}

export interface VerificationResult {
  requestId: string;
}
