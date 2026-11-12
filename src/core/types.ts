export type Locale = "en" | "zh-CN";

export type Membership = "join" | "invite" | "leave" | "ban" | "knock";

export type MessageKind =
  | "text"
  | "emote"
  | "notice"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "sticker"
  | "state"
  | "redacted"
  | "error";

export type SendStatus = "sent" | "queued" | "sending" | "failed";

export interface MediaRef {
  mxc: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  name: string;
  file: Record<string, unknown> | null;
}

export interface Reaction {
  key: string;
  count: number;
  me: boolean;
}

export interface ReplyRef {
  id: string;
  name: string;
  body: string;
}

export interface Message {
  id: string;
  roomId: string;
  sender: string;
  name: string;
  avatar: string | null;
  ts: number;
  kind: MessageKind;
  body: string;
  html: string | null;
  media: MediaRef | null;
  reply: ReplyRef | null;
  mentions: string[];
  edited: boolean;
  reactions: Reaction[];
  status: SendStatus;
  error: string | null;
  encrypted: boolean;
  search: string[];
}

export interface LastMessage {
  kind: MessageKind;
  body: string;
  name: string;
  own: boolean;
}

export interface RoomSummary {
  roomId: string;
  name: string;
  avatar: string | null;
  topic: string;
  alias: string | null;
  membership: Membership;
  isDirect: boolean;
  encrypted: boolean;
  lastTs: number;
  last: LastMessage | null;
  unread: number;
  highlight: number;
  muted: boolean;
  favorite: boolean;
  lowPriority: boolean;
  inviter: string | null;
  readUpTo: string | null;
  joined: number;
  myPower: number;
  hasOlder: boolean;
  canSend: boolean;
}

export interface Session {
  userId: string;
  deviceId: string;
  displayName: string;
  avatar: string | null;
  baseUrl: string;
  accountHash: string;
}

export interface Member {
  roomId: string;
  userId: string;
  name: string;
  avatar: string | null;
  membership: Membership;
  power: number;
}

export interface PackImage {
  shortcode: string;
  body: string;
  url: string;
  info: MediaRef | null;
}

export interface Pack {
  id: string;
  roomId: string | null;
  name: string;
  usage: "emoticon" | "sticker" | "both";
  avatar: string | null;
  attribution: string | null;
  images: PackImage[];
}

export interface Draft {
  text: string;
  marks: Mark[];
  reply: ReplyRef | null;
  edit: { id: string; body: string } | null;
}

export interface Mark {
  start: number;
  end: number;
  type: MarkType;
}

export type MarkType = "bold" | "italic" | "underline" | "strike" | "code";

export interface TypingUser {
  userId: string;
  name: string;
}

export type Connection = "idle" | "connecting" | "online" | "offline" | "error";

export type Phase = "boot" | "auth" | "gate" | "ready";

export type SectionId = "invites" | "favorites" | "direct" | "rooms" | "low";

export interface SasEmoji {
  symbol: string;
  name: string;
}

export type VerifyState =
  | { state: "requested"; from: string; deviceId: string | null }
  | { state: "ready" }
  | { state: "sas"; emoji: SasEmoji[] }
  | { state: "done" }
  | { state: "cancelled" };

export interface DeviceEntry {
  deviceId: string;
  name: string;
  lastSeenTs: number;
  current: boolean;
  verified: boolean;
}

export interface KeyStatus {
  ready: boolean;
  backup: boolean;
}

export type ErrorCode =
  | "bad_request"
  | "not_logged_in"
  | "network"
  | "rate_limited"
  | "crypto"
  | "internal";

export interface Failure {
  code: ErrorCode;
  message: string;
}
