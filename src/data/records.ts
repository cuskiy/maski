export type Membership = "join" | "invite" | "leave" | "ban" | "knock";

export type EventKind =
  | "text"
  | "emote"
  | "notice"
  | "image"
  | "file"
  | "audio"
  | "video"
  | "sticker"
  | "membership"
  | "state"
  | "redacted"
  | "encrypted"
  | "unsupported";

export type PackUsage = "emoticon" | "sticker";
export type PackSource = "room" | "global" | "user" | "legacy";

export interface LastEventPreview {
  eventId: string;
  senderId: string;
  ts: number;
  kind: EventKind;
  preview: string;
}

export interface RoomRecord {
  roomId: string;
  kind: "room" | "space";
  children: string[];
  name: string;
  topic: string;
  avatarMxc: string | null;
  canonicalAlias: string | null;
  isDirect: boolean;
  membership: Membership;
  selfMembership: Membership;
  selfPowerLevel: number;
  memberCount: number;
  isEncrypted: boolean;
  joinRule: string;
  lastTs: number;
  lastEvent: LastEventPreview | null;
  unreadTotal: number;
  unreadHighlight: number;
  muted?: boolean;
  readUpToEventId: string | null;
  tags: string[];
  order: number;
  hasOlder: boolean;
  updatedAt: number;
}

export interface MediaDescriptor {
  mxc: string;
  mimetype: string;
  filename: string;
  size: number;
  width: number;
  height: number;
  encrypted: EncryptedFile | null;
  thumbnail: MediaDescriptor | null;
}

export interface EncryptedFile {
  url: string;
  key: {
    kty: string;
    key_ops: string[];
    alg: string;
    k: string;
    ext: boolean;
  };
  iv: string;
  hashes: Record<string, string>;
  v: string;
  mimetype?: string;
}

export interface ReplyPreview {
  eventId: string;
  senderId: string;
  body: string;
  kind: EventKind;
}

export interface ReactionSummary {
  count: number;
  me: boolean;
  myReaction: string | null;
}

export interface EventRecord {
  eventId: string;
  roomId: string;
  senderId: string;
  ts: number;
  type: string;
  kind: EventKind;
  body: string;
  formattedBody: string | null;
  msgtype: string | null;
  media: MediaDescriptor | null;
  replyTo: ReplyPreview | null;
  mentions: string[];
  edited: boolean;
  redacted: boolean;
  encrypted: boolean;
  decryptionError: string | null;
  decrypting: boolean;
  reactions: Record<string, ReactionSummary>;
  txnId: string | null;
  searchText: string;
  tokens: string[];
  stateKey: string | null;
  membership: Membership | null;
}

export interface MemberRecord {
  roomId: string;
  userId: string;
  displayName: string;
  avatarMxc: string | null;
  membership: Membership;
  powerLevel: number;
  updatedAt: number;
}

export type RelationType = "annotation" | "replace" | "redaction";

export interface RelationRecord {
  relationEventId: string;
  roomId: string;
  targetEventId: string;
  type: RelationType;
  key: string | null;
  senderId: string;
  ts: number;
  content: Record<string, unknown>;
  redacts: string | null;
}

export interface PackImage {
  shortcode: string;
  url: string;
  body: string;
  info: Record<string, unknown>;
}

export interface PackRecord {
  packId: string;
  roomId: string | null;
  stateKey: string | null;
  displayName: string;
  avatarMxc: string | null;
  usage: PackUsage;
  attribution: string | null;
  images: Record<string, PackImage>;
  source: PackSource;
  enabledGlobal: boolean;
  updatedAt: number;
}

export interface MediaRecord {
  mediaKey: string;
  mxc: string;
  mimetype: string;
  size: number;
  blob: Blob | null;
  cachedAt: number;
  lastUsedAt: number;
}

export type OutboxStatus = "pending" | "sending" | "failed" | "sent";

export interface OutboxRecord {
  txnId: string;
  roomId: string;
  eventType: string;
  content: Record<string, unknown>;
  blob: Blob | null;
  media: MediaDescriptor | null;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: OutboxStatus;
  error: string | null;
  eventId: string | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  deviceId: string;
  accessToken: string;
  refreshToken: string | null;
  baseUrl: string;
}

export interface MetaRecord {
  key: string;
  value: string | number | boolean | null | string[];
}

export interface DraftRecord {
  accountHash: string;
  roomId: string;
  text: string;
  marks: TextMark[];
  emoji: EmojiToken[];
  replyTo: string | null;
  editTarget: string | null;
  updatedAt: number;
}

export interface ScrollRecord {
  accountHash: string;
  roomId: string;
  eventId: string | null;
  offset: number;
  atBottom: boolean;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export type MarkKind = "bold" | "italic" | "underline" | "strike" | "code" | "heading" | "quote" | "codeBlock";

export interface TextMark {
  type: MarkKind;
  start: number;
  end: number;
}

export interface EmojiToken {
  shortcode: string;
  start: number;
  end: number;
  url: string;
  body: string;
  info: Record<string, unknown>;
}

export interface DeviceRecord {
  deviceId: string;
  displayName: string;
  lastSeenIp: string | null;
  lastSeenTs: number | null;
  verified: boolean;
  current: boolean;
}

export interface ProfileRecord {
  userId: string;
  displayName: string;
  avatarMxc: string | null;
  verified: boolean;
  identityChanged: boolean;
}

export interface VerificationSas {
  emoji: Array<[string, string]>;
  decimal: [number, number, number] | null;
}

export interface VerificationState {
  requestId: string;
  phase: string;
  userId: string;
  deviceId: string | null;
  initiatedByMe: boolean;
  sas: VerificationSas | null;
  error: string | null;
}

export interface DeltaPayload {
  revision: number;
  rooms: RoomRecord[];
  events: EventRecord[];
  members: MemberRecord[];
  packs: PackRecord[];
  removedRooms: string[];
  removedPacks: string[];
  syncState: string;
}
