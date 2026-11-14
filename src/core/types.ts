export type SectionId = "favorites" | "rooms" | "direct" | "channels";

export type MessageKind = "text" | "image" | "sticker" | "file" | "audio" | "video";

export type MessageStatus = "sent" | "queued" | "sending" | "failed";

export type Phase = "boot" | "signedOut" | "locked" | "ready";

export type Connection = "connecting" | "online" | "offline" | "degraded";

export type RoomEncryption = "none" | "encrypted" | "unknown";

export type UndecryptableReason = "missing-key" | "corrupt";

export type MessageEncryption =
  { readonly state: "ok" } | { readonly state: "undecryptable"; readonly reason: UndecryptableReason };

export interface MessageCapabilities {
  readonly reply: boolean;
  readonly react: boolean;
  readonly edit: boolean;
  readonly redact: boolean;
  readonly copy: boolean;
  readonly copyLink: boolean;
}

export interface RoomCapabilities {
  readonly invite: boolean;
  readonly manage: boolean;
  readonly notifications: boolean;
  readonly leave: boolean;
  readonly markRead: boolean;
  readonly favorite: boolean;
  readonly mute: boolean;
}

export interface SessionCapabilities {
  readonly verify: boolean;
  readonly recoveryKey: boolean;
  readonly backup: boolean;
  readonly reset: boolean;
  readonly signOut: boolean;
  readonly signOutOthers: boolean;
}

export interface DeviceCapabilities {
  readonly verify: boolean;
  readonly signOut: boolean;
}

export interface Preview {
  readonly kind: MessageKind | "error";
  readonly body: string;
}

export interface RoomSummary {
  readonly roomId: string;
  readonly name: string;
  readonly topic: string;
  readonly avatar: string | null;
  readonly preview: Preview | null;
  readonly lastTs: number;
  readonly unread: number;
  readonly highlight: number;
  readonly muted: boolean;
  readonly membership: "join" | "invite";
  readonly isDirect: boolean;
  readonly isSpace: boolean;
  readonly favorite: boolean;
  readonly spaceId: string | null;
  readonly notification: "all" | "mentions" | "mute";
  readonly encryption: RoomEncryption;
  readonly capabilities: RoomCapabilities;
}

export interface Media {
  readonly kind: "image" | "video" | "file" | "audio" | "sticker";
  readonly name: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly size: number | null;
  readonly url: string | null;
}

export interface Reaction {
  readonly key: string;
  readonly count: number;
  readonly mine: boolean;
}

export interface ReplyRef {
  readonly messageId: string;
  readonly senderName: string;
  readonly body: string;
}

export interface MessageRow {
  readonly id: string;
  readonly roomId: string;
  readonly sender: string;
  readonly senderName: string;
  readonly senderAvatar: string | null;
  readonly ts: number;
  readonly own: boolean;
  readonly kind: MessageKind;
  readonly body: string;
  readonly html: string | null;
  readonly media: Media | null;
  readonly reactions: readonly Reaction[];
  readonly reply: ReplyRef | null;
  readonly edited: boolean;
  readonly status: MessageStatus;
  readonly error: string | null;
  readonly system?: boolean;
  readonly encryption: MessageEncryption;
  readonly capabilities: MessageCapabilities;
}

export interface SectionState {
  readonly open: boolean;
}

export interface SessionSummary {
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly capabilities: SessionCapabilities;
}

export interface DeviceSession {
  readonly id: string;
  readonly name: string;
  readonly lastSeen: string;
  readonly verified: boolean;
  readonly current: boolean;
  readonly capabilities: DeviceCapabilities;
}

export interface InviteCapabilities {
  readonly accept: boolean;
  readonly decline: boolean;
}

export interface Invite {
  readonly roomId: string;
  readonly name: string;
  readonly topic: string;
  readonly inviter: string;
  readonly capabilities: InviteCapabilities;
}

export interface NotificationPrefs {
  readonly badge: boolean;
  readonly titleTotal: boolean;
  readonly desktop: boolean;
  readonly preview: boolean;
}

export interface RecoveryKey {
  readonly value: string;
  readonly copy: boolean;
  readonly download: boolean;
}

export interface Member {
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly profile: boolean;
}

export interface ChatState {
  readonly phase: Phase;
  readonly connection: Connection;
  readonly roomsLoading: boolean;
  readonly session: SessionSummary | null;
  readonly rooms: readonly RoomSummary[];
  readonly roomId: string | null;
  readonly messages: readonly MessageRow[];
  readonly hasOlder: boolean;
  readonly typing: readonly string[];
  readonly openSpaces: readonly string[];
  readonly sections: Readonly<Record<SectionId, SectionState>>;
  readonly notifications: NotificationPrefs;
  readonly devices: readonly DeviceSession[];
  readonly invites: readonly Invite[];
  readonly members: readonly Member[];
  readonly recoveryKey: RecoveryKey | null;
}
