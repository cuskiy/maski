export type Phase = "boot" | "auth" | "gate" | "ready";

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
  | "error";

export type SendStatus = "queued" | "sending" | "sent" | "failed";

export interface Session {
  userId: string;
  deviceId: string;
  name: string;
  avatar: string | null;
  baseUrl: string;
  accountHash: string;
}

export interface MediaRef {
  url: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  name: string;
  /** Present when the media is encrypted: the key and hash the bytes need. */
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
  edited: boolean;
  reactions: Reaction[];
  mentions: string[];
  status: SendStatus;
  error: string | null;
  encrypted: boolean;
  /** The membership word for a membership event, otherwise null. */
  membership: Membership | null;
  tokens: string[];
}

export interface RoomPreview {
  body: string;
  name: string;
  own: boolean;
  kind: MessageKind;
}

export interface Room {
  roomId: string;
  name: string;
  avatar: string | null;
  topic: string;
  membership: Membership;
  isDirect: boolean;
  encrypted: boolean;
  lastTs: number;
  preview: RoomPreview | null;
  unread: number;
  highlight: number;
  muted: boolean;
  favorite: boolean;
  lowPriority: boolean;
  inviter: string | null;
  readUpTo: string | null;
  members: number;
  canSend: boolean;
  hasOlder: boolean;
  myPower: number;
}

export interface Member {
  roomId: string;
  userId: string;
  name: string;
  avatar: string | null;
  membership: Membership;
  power: number;
}

export interface Window {
  roomId: string;
  messages: Message[];
  hasOlder: boolean;
}

export interface KeyStatus {
  ready: boolean;
}

export interface Discovery {
  baseUrl: string;
  password: boolean;
  registration: boolean;
}

export interface Account {
  hash: string;
  userId: string;
  name: string;
  avatar: string | null;
  baseUrl: string;
}

export interface StoredSession {
  session: Session;
  token: string;
}

export type SectionId = "invites" | "favorites" | "direct" | "rooms" | "low";

export type GateCode = "no-keys" | "invalid" | "restore" | "uia";
