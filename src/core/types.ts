export type SectionId = "favorites" | "rooms" | "direct" | "spaces";

export type MessageKind = "text" | "notice" | "emote" | "image" | "sticker" | "file" | "audio" | "video";

export type MessageStatus = "sent" | "queued" | "sending" | "failed";

export type Phase = "boot" | "signedOut" | "locked" | "verifying" | "ready";

export type KeyGate = "ready" | "missing" | "unknown" | "needs-recovery" | "needs-verification";

export type Connection = "connecting" | "online" | "offline" | "degraded";

export type RoomEncryption = "none" | "encrypted" | "unknown";
export type NotificationLevel = "all" | "mentions" | "mute";
export type RoomJoinRule = "public" | "invite" | "knock" | "restricted" | "knock_restricted";
export type RoomHistoryVisibility = "world_readable" | "shared" | "invited" | "joined";
export type GuestAccess = "can_join" | "forbidden";
export type Membership = "join" | "invite" | "leave" | "ban" | "knock";

export type UndecryptableReason = "missing-key" | "corrupt";

export type MessageEncryption =
  { readonly state: "ok" } | { readonly state: "undecryptable"; readonly reason: UndecryptableReason };

export interface PowerLevels {
  readonly users: Readonly<Record<string, number>>;
  readonly usersDefault: number;
  readonly events: Readonly<Record<string, number>>;
  readonly eventsDefault: number;
  readonly stateDefault: number;
  readonly invite: number;
  readonly kick: number;
  readonly ban: number;
  readonly redact: number;
  readonly notificationsRoom: number;
}

export interface RoomTag {
  readonly order?: string;
}

/** The room fields a reader may change; one field per command is the normal shape. */
export interface RoomStatePatch {
  readonly name?: string;
  readonly topic?: string;
  readonly aliases?: readonly string[];
  readonly joinRule?: RoomJoinRule;
  readonly guestAccess?: GuestAccess;
  readonly historyVisibility?: RoomHistoryVisibility;
  readonly directoryPublished?: boolean;
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
  readonly latestEventId: string | null;
  readonly readReceipt: string | null;
  readonly fullyRead: string | null;
  readonly unread: number;
  readonly highlight: number;
  readonly membership: Membership;
  readonly roomType: string | null;
  readonly directUserId: string | null;
  readonly spaceId: string | null;
  readonly tags: Readonly<Record<string, RoomTag>>;
  readonly aliases: readonly string[];
  readonly joinRule: RoomJoinRule;
  readonly guestAccess: GuestAccess;
  readonly historyVisibility: RoomHistoryVisibility;
  readonly directoryPublished: boolean;
  readonly roomVersion: string;
  readonly federated: boolean;
  readonly notification: NotificationLevel | "default";
  readonly encryption: RoomEncryption;
  readonly creatorIds: readonly string[];
  readonly powerLevels: PowerLevels;
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
  readonly eventId: string | null;
  readonly transactionId: string | null;
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
  readonly mentions: readonly string[];
  readonly edited: boolean;
  readonly redacted: boolean;
  readonly status: MessageStatus;
  readonly error: string | null;
  readonly retryable: boolean;
  readonly system: boolean;
  readonly encryption: MessageEncryption;
}

export interface SectionState {
  readonly open: boolean;
}

export interface StickerImage {
  readonly shortcode: string;
  readonly body: string;
  readonly url: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly mime: string | null;
}

export interface StickerPack {
  readonly id: string;
  readonly name: string;
  readonly images: readonly StickerImage[];
}

export interface SessionSummary {
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly capabilities: SessionCapabilities;
  readonly stickerPacks: readonly StickerPack[];
}

export interface SessionCapabilities {
  readonly recoveryKey: boolean;
  readonly backup: boolean;
  readonly signOut: boolean;
  readonly signOutOthers: boolean;
}

/** Every optional chat command. A source advertises exactly the ones it can issue. */
export type SourceCapability =
  | "media"
  | "stickers"
  | "search"
  | "react"
  | "edit"
  | "redact"
  | "forward"
  | "typing"
  | "memberAction"
  | "inviteUser"
  | "addRoom"
  | "leaveRoom"
  | "setRoomState"
  | "setRoomTag"
  | "setNotification"
  | "resetRecoveryKey"
  | "setAvatar"
  | "resetIdentity"
  | "signOutDevice"
  | "signOutOthers"
  | "answerInvite"
  | "saveNotifications"
  | "backupSetup";

export type SourceCapabilities = Readonly<Record<SourceCapability, boolean>>;

/** The review surface: every command the mock fixture implements. */
export const REVIEW_CAPABILITIES: SourceCapabilities = {
  media: true,
  setAvatar: true,
  stickers: true,
  search: true,
  react: true,
  edit: true,
  redact: true,
  forward: true,
  typing: true,
  memberAction: true,
  inviteUser: true,
  addRoom: true,
  leaveRoom: true,
  setRoomState: true,
  setRoomTag: true,
  setNotification: true,
  resetRecoveryKey: true,
  resetIdentity: true,
  signOutDevice: true,
  signOutOthers: true,
  answerInvite: true,
  saveNotifications: true,
  backupSetup: true,
};

/** The worker conversation: only the commands the worker protocol implements. */
export const PRODUCTION_CAPABILITIES: SourceCapabilities = {
  media: true,
  setAvatar: true,
  stickers: true,
  search: true,
  react: true,
  edit: true,
  redact: true,
  forward: true,
  typing: true,
  memberAction: true,
  inviteUser: true,
  addRoom: true,
  leaveRoom: true,
  setRoomState: true,
  setRoomTag: true,
  // Only mute is a room push rule; all/mentions are not fake choices in the surface.
  setNotification: true,
  resetRecoveryKey: false,
  resetIdentity: true,
  signOutDevice: false,
  signOutOthers: false,
  answerInvite: true,
  saveNotifications: false,
  backupSetup: true,
};

export interface DeviceCapabilities {
  readonly verify: boolean;
  readonly signOut: boolean;
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
  readonly avatar: string | null;
  readonly inviter: string;
  readonly inviterId: string;
  readonly directUserId: string | null;
  readonly roomType: string | null;
  readonly joinRule: RoomJoinRule;
  readonly guestAccess: GuestAccess;
  readonly historyVisibility: RoomHistoryVisibility;
  readonly encryption: RoomEncryption;
  readonly roomVersion: string;
  readonly federated: boolean;
  readonly capabilities: InviteCapabilities;
}

export interface NotificationPrefs {
  readonly badge: boolean;
  readonly titleTotal: boolean;
  readonly desktop: boolean;
  readonly preview: boolean;
  readonly level: NotificationLevel;
}

export interface RecoveryKey {
  readonly value: string;
  readonly copy: boolean;
  readonly download: boolean;
}

export interface BackupState {
  readonly version: string | null;
  readonly trusted: boolean;
  readonly matchesDecryptionKey: boolean;
  readonly enabled: boolean;
  readonly error: string | null;
}

export interface Member {
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly profile: boolean;
  readonly membership: Membership;
}

/** A verification request as the reader sees it; `needs-accept` waits for this user's decision. */
export type SasPhase = "needs-accept" | "requested" | "ready" | "started" | "cancelled" | "done";

/** The only SAS shape the main thread may receive; the request and verifier objects stay in the worker. */
export interface SasState {
  readonly id: string;
  readonly otherUserId: string;
  readonly otherDeviceId: string | null;
  readonly isSelfVerification: boolean;
  readonly phase: SasPhase;
  readonly emoji: readonly string[] | null;
  readonly decimal: readonly [number, number, number] | null;
  readonly cancellationCode: string | null;
}

export interface ChatState {
  readonly phase: Phase;
  readonly connection: Connection;
  readonly roomsLoading: boolean;
  readonly session: SessionSummary | null;
  readonly rooms: readonly RoomSummary[];
  readonly roomId: string | null;
  readonly messages: readonly MessageRow[];
  readonly windowLoading: boolean;
  readonly hasOlder: boolean;
  readonly olderLoading: boolean;
  readonly failure: "open" | "older" | "members" | null;
  readonly typing: readonly string[];
  readonly recentEmoji: readonly string[];
  readonly recentReactions: readonly string[];
  readonly recentStickers: readonly string[];
  readonly stickersEnabled: boolean;
  readonly openSpaces: readonly string[];
  readonly sections: Readonly<Record<SectionId, SectionState>>;
  readonly notifications: NotificationPrefs;
  readonly devices: readonly DeviceSession[];
  readonly devicesError: string | null;
  readonly invites: readonly Invite[];
  readonly members: readonly Member[];
  readonly membersLoading: boolean;
  readonly recoveryKey: RecoveryKey | null;
  readonly backupReady: boolean;
  readonly backupError: string | null;
  readonly sas: SasState | null;
}
