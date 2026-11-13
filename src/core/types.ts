export interface Session {
  userId: string;
  deviceId: string;
  name: string;
  avatar: string | null;
  baseUrl: string;
  accountHash: string;
}

export interface Media {
  url: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  name: string;
  file: Record<string, unknown> | null;
}

export interface Reaction {
  key: string;
  count: number;
  me: boolean;
}

export interface Reply {
  id: string;
  name: string;
  body: string;
}

export type Kind = "text" | "emote" | "notice" | "image" | "video" | "audio" | "file" | "sticker" | "state" | "error";

export type Status = "queued" | "sending" | "sent" | "failed";

export interface Message {
  id: string;
  roomId: string;
  sender: string;
  name: string;
  avatar: string | null;
  ts: number;
  kind: Kind;
  body: string;
  html: string | null;
  media: Media | null;
  reply: Reply | null;
  edited: boolean;
  reactions: Reaction[];
  mentions: string[];
  status: Status;
  error: string | null;
  encrypted: boolean;
  membership: string | null;
  tokens: string[];
}

export interface Preview {
  body: string;
  name: string;
  own: boolean;
  kind: Kind;
}

export interface Room {
  roomId: string;
  name: string;
  avatar: string | null;
  topic: string;
  encrypted: boolean;
  lastTs: number;
  preview: Preview | null;
  unread: number;
  highlight: number;
  membership: string;
  isDirect: boolean;
  favorite: boolean;
  muted: boolean;
  readUpTo: string | null;
  hasOlder: boolean;
  canSend: boolean;
}

export interface Window {
  roomId: string;
  messages: Message[];
  hasOlder: boolean;
}

export interface Discovery {
  baseUrl: string;
  serverName: string;
  password: boolean;
  registration: boolean;
}

export interface Keys {
  ready: boolean;
}

export interface Outbox {
  txnId: string;
  status: Status;
  error: string;
}
