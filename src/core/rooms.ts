import type { Invite, RoomCapabilities, RoomEncryption, RoomSummary } from "./types.ts";

const ALL_CAPABILITIES: RoomCapabilities = {
  invite: true,
  manage: true,
  notifications: true,
  leave: true,
  markRead: true,
  favorite: true,
  mute: true,
};

export interface RoomInput {
  readonly roomId: string;
  readonly name: string;
  readonly topic: string;
  readonly direct?: boolean;
  readonly isSpace?: boolean;
  readonly spaceId?: string | null;
  readonly favorite?: boolean;
  readonly muted?: boolean;
  readonly encryption?: RoomEncryption;
  readonly readReceipt?: string | null;
  readonly capabilities?: Partial<RoomCapabilities>;
}

export function createRoom(input: RoomInput): RoomSummary {
  const muted = input.muted ?? false;
  return {
    roomId: input.roomId,
    name: input.name,
    topic: input.topic,
    avatar: null,
    preview: null,
    lastTs: Date.now(),
    readReceipt: input.readReceipt ?? null,
    unread: 0,
    highlight: 0,
    muted,
    membership: "join",
    isDirect: input.direct ?? false,
    isSpace: input.isSpace ?? false,
    favorite: input.favorite ?? false,
    spaceId: input.spaceId ?? null,
    notification: muted ? "mute" : "all",
    encryption: input.encryption ?? "encrypted",
    capabilities: { ...ALL_CAPABILITIES, ...input.capabilities },
  };
}

export function roomFromInvite(invite: Invite): RoomSummary {
  return createRoom({
    roomId: invite.roomId,
    name: invite.name,
    topic: invite.topic,
    capabilities: { manage: false },
  });
}
