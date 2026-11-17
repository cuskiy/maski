import type {
  ChatState,
  DeviceSession,
  Invite,
  Media,
  Member,
  MessageEncryption,
  MessageLocation,
  MessageKind,
  MessageRow,
  MessageStatus,
  PowerLevels,
  Reaction,
  ReplyRef,
  RoomSummary,
  SessionSummary,
} from "./types.ts";
import { emptyChatState } from "./state.ts";
import { createRoom } from "./rooms.ts";
import { DEFAULT_POWER_LEVELS } from "./permissions.ts";

const SELF = "@you:matrix.org";

function at(day: number, hour: number, minute: number): number {
  return Date.UTC(2026, 10, day, hour, minute);
}

function power(users: Readonly<Record<string, number>> = {}): PowerLevels {
  return { ...DEFAULT_POWER_LEVELS, users };
}

function room(
  input: Parameters<typeof createRoom>[0] & {
    readonly preview: RoomSummary["preview"];
    readonly lastTs: number;
    readonly latestEventId: string | null;
    readonly readReceipt: string | null;
    readonly fullyRead?: string | null;
    readonly unread: number;
    readonly highlight: number;
  },
): RoomSummary {
  return {
    ...createRoom(input),
    preview: input.preview,
    lastTs: input.lastTs,
    latestEventId: input.latestEventId,
    readReceipt: input.readReceipt,
    fullyRead: input.fullyRead ?? input.readReceipt,
    unread: input.unread,
    highlight: input.highlight,
  };
}

const rooms: readonly RoomSummary[] = [
  room({
    roomId: "design",
    name: "Design",
    topic: "Interface, motion and the quiet shell",
    preview: { kind: "text", body: "The borderless pass is ready." },
    lastTs: at(13, 10, 2),
    latestEventId: "d13",
    readReceipt: "d10",
    unread: 1,
    highlight: 1,
    joinRule: "public",
    historyVisibility: "shared",
    directoryPublished: true,
    aliases: ["#design:matrix.org"],
    creatorIds: [SELF, "@alice:matrix.org"],
    encryption: "none",
    powerLevels: power(),
  }),
  room({
    roomId: "nix",
    name: "Nix",
    topic: "Packaging and shell setups",
    preview: { kind: "text", body: "The flake is smaller now." },
    lastTs: at(13, 9, 55),
    latestEventId: "n1",
    readReceipt: "n1",
    unread: 0,
    highlight: 0,
    tags: { "m.favourite": { order: "0.1" } },
    joinRule: "invite",
    historyVisibility: "shared",
    creatorIds: ["@alice:matrix.org"],
    powerLevels: power(),
  }),
  room({
    roomId: "alice",
    name: "Alice",
    topic: "Direct messages",
    preview: { kind: "text", body: "Can you look at the key screen?" },
    lastTs: at(13, 9, 48),
    latestEventId: "a2",
    readReceipt: "a2",
    unread: 0,
    highlight: 0,
    directUserId: "@alice:matrix.org",
    joinRule: "invite",
    historyVisibility: "shared",
    creatorIds: [SELF],
    powerLevels: power(),
  }),
  room({
    roomId: "product",
    name: "Product",
    topic: "Spaces and plans",
    preview: { kind: "text", body: "2 rooms" },
    lastTs: at(13, 9, 40),
    latestEventId: null,
    readReceipt: null,
    unread: 0,
    highlight: 0,
    roomType: "m.space",
    joinRule: "invite",
    historyVisibility: "invited",
    encryption: "none",
    creatorIds: [SELF],
    powerLevels: power(),
  }),
  room({
    roomId: "roadmap",
    name: "Roadmap",
    topic: "The next release",
    preview: { kind: "text", body: "Q1 priorities are set." },
    lastTs: at(13, 9, 38),
    latestEventId: "r2",
    readReceipt: "r2",
    unread: 0,
    highlight: 0,
    tags: { "m.lowpriority": {} },
    spaceId: "product",
    joinRule: "invite",
    historyVisibility: "shared",
    creatorIds: [SELF],
    powerLevels: power(),
  }),
  room({
    roomId: "specs",
    name: "Specs",
    topic: "Protocol notes",
    preview: { kind: "text", body: "The projection is two passes." },
    lastTs: at(13, 9, 36),
    latestEventId: "s2",
    readReceipt: "s2",
    unread: 0,
    highlight: 0,
    spaceId: "product",
    joinRule: "invite",
    historyVisibility: "shared",
    creatorIds: [SELF],
    powerLevels: power(),
  }),
  room({
    roomId: "lobby",
    name: "Lobby",
    topic: "General",
    preview: { kind: "text", body: "Morning." },
    lastTs: at(13, 9, 30),
    latestEventId: "l1",
    readReceipt: null,
    unread: 1,
    highlight: 0,
    joinRule: "public",
    historyVisibility: "shared",
    creatorIds: ["@alice:matrix.org"],
    powerLevels: power(),
  }),
  room({
    roomId: "ops",
    name: "Ops",
    topic: "Deployments",
    preview: { kind: "text", body: "Build 412 is green." },
    lastTs: at(13, 9, 20),
    latestEventId: "o1",
    readReceipt: "o1",
    unread: 0,
    highlight: 0,
    notification: "mute",
    joinRule: "invite",
    historyVisibility: "shared",
    creatorIds: ["@carol:matrix.org"],
    powerLevels: power(),
  }),
];

interface RowInput {
  readonly id: string;
  readonly roomId: string;
  readonly sender: string;
  readonly senderName: string;
  readonly ts: number;
  readonly own: boolean;
  readonly kind: MessageKind;
  readonly body: string;
  readonly html?: string;
  readonly media?: Media;
  readonly reactions?: readonly Reaction[];
  readonly reply?: ReplyRef;
  readonly mentions?: readonly string[];
  readonly edited?: boolean;
  readonly redacted?: boolean;
  readonly location?: MessageLocation | null;
  readonly status?: MessageStatus;
  readonly error?: string;
  readonly system?: boolean;
  readonly encryption?: MessageEncryption;
  readonly eventId?: string | null;
  readonly transactionId?: string | null;
}

function row(input: RowInput): MessageRow {
  const sent = input.status === undefined || input.status === "sent";
  return {
    id: input.id,
    eventId: input.eventId === undefined ? (sent ? input.id : null) : input.eventId,
    transactionId: input.transactionId ?? null,
    roomId: input.roomId,
    sender: input.sender,
    senderName: input.senderName,
    senderAvatar: null,
    ts: input.ts,
    own: input.own,
    kind: input.kind,
    effect: null,
    poll: null,
    location: input.location ?? null,
    body: input.body,
    html: input.html ?? null,
    media: input.media ?? null,
    reactions: input.reactions ?? [],
    reply: input.reply ?? null,
    mentions: input.mentions ?? [],
    edited: input.edited ?? false,
    redacted: input.redacted ?? false,
    status: input.status ?? "sent",
    error: input.error ?? null,
    retryable: false,
    system: input.system ?? false,
    encryption: input.encryption ?? { state: "ok" },
  };
}

const image: Media = {
  kind: "image",
  name: "layout.png",
  width: 1200,
  height: 800,
  size: 184_000,
  url: null,
};

const video: Media = {
  kind: "video",
  name: "motion.mp4",
  width: 1280,
  height: 720,
  size: 3_400_000,
  url: null,
};

const file: Media = {
  kind: "file",
  name: "specification.pdf",
  width: null,
  height: null,
  size: 240_000,
  url: null,
};

const sticker: Media = {
  kind: "sticker",
  name: "wave",
  width: 256,
  height: 256,
  size: null,
  url: null,
};

const designMessages: readonly MessageRow[] = [
  row({
    id: "d1",
    roomId: "design",
    sender: "@alice:matrix.org",
    senderName: "Alice",
    ts: at(13, 9, 28),
    own: false,
    kind: "text",
    body: "The borderless pass is ready.",
  }),
  row({
    id: "d2",
    roomId: "design",
    sender: "@alice:matrix.org",
    senderName: "Alice",
    ts: at(13, 9, 29),
    own: false,
    kind: "text",
    body: "I moved the room list to keyed rows. It should not move under the pointer.",
  }),
  row({
    id: "d3",
    roomId: "design",
    sender: SELF,
    senderName: "You",
    ts: at(13, 9, 31),
    own: true,
    kind: "text",
    body: "Looks calm. The topbar no longer moves.",
  }),
  row({
    id: "d4",
    roomId: "design",
    sender: "@bob:matrix.org",
    senderName: "Bob",
    ts: at(13, 9, 35),
    own: false,
    kind: "image",
    body: "The new layout",
    media: image,
    reactions: [
      { key: "👍", count: 2, mine: true },
      { key: "🎉", count: 1, mine: false },
    ],
  }),
  row({
    id: "d5",
    roomId: "design",
    sender: "@bob:matrix.org",
    senderName: "Bob",
    ts: at(13, 9, 36),
    own: false,
    kind: "text",
    body: "The placeholder stays neutral. No fake photo.",
  }),
  row({
    id: "d6",
    roomId: "design",
    sender: "@carol:matrix.org",
    senderName: "Carol",
    ts: at(13, 9, 42),
    own: false,
    kind: "file",
    body: "",
    media: file,
    reply: { messageId: "d3", senderName: "You", body: "Looks calm. The topbar no longer moves." },
  }),
  row({
    id: "d7",
    roomId: "design",
    sender: SELF,
    senderName: "You",
    ts: at(13, 9, 44),
    own: true,
    kind: "text",
    body: "Ready for review.",
    html: "Ready for <strong>review</strong>. The <code>@scope</code> block is in place.",
    edited: true,
    reactions: [{ key: "🎉", count: 3, mine: true }],
  }),
  row({
    id: "d8",
    roomId: "design",
    sender: "@dave:matrix.org",
    senderName: "Dave",
    ts: at(13, 9, 50),
    own: false,
    kind: "sticker",
    body: "👋",
    media: sticker,
  }),
  row({
    id: "d9",
    roomId: "design",
    sender: SELF,
    senderName: "You",
    ts: at(13, 9, 52),
    own: true,
    kind: "video",
    body: "Motion pass",
    media: video,
  }),
  row({
    id: "d10",
    roomId: "design",
    sender: "@alice:matrix.org",
    senderName: "Alice",
    ts: at(13, 10, 2),
    own: false,
    kind: "text",
    body: "Pushed the spacing pass. The next refresh should look the same.",
  }),
  row({
    id: "d11",
    roomId: "design",
    sender: SELF,
    senderName: "You",
    ts: at(13, 10, 3),
    own: true,
    kind: "text",
    body: "Testing the queued state.",
    status: "sending",
    eventId: null,
    transactionId: "txn-d11",
  }),
  row({
    id: "d12",
    roomId: "design",
    sender: SELF,
    senderName: "You",
    ts: at(13, 10, 4),
    own: true,
    kind: "text",
    body: "This one did not send.",
    status: "failed",
    error: "network",
    eventId: null,
    transactionId: "txn-d12",
  }),
  row({
    id: "d13",
    roomId: "design",
    sender: "@alice:matrix.org",
    senderName: "Alice",
    ts: at(13, 10, 5),
    own: false,
    kind: "text",
    body: "",
    encryption: { state: "undecryptable", reason: "missing-key" },
  }),
  row({
    id: "d-loc",
    roomId: "design",
    sender: "@alice:matrix.org",
    senderName: "Alice",
    ts: at(13, 9, 6),
    own: false,
    kind: "text",
    body: "Meet at the venue.",
    location: { geoUri: "geo:35.0116,135.7681;u=35", description: "Meet at the venue." },
  }),
];

const aliceMessages: readonly MessageRow[] = [
  row({
    id: "a1",
    roomId: "alice",
    sender: "@alice:matrix.org",
    senderName: "Alice",
    ts: at(13, 9, 40),
    own: false,
    kind: "text",
    body: "Can you look at the key screen?",
  }),
  row({
    id: "a2",
    roomId: "alice",
    sender: SELF,
    senderName: "You",
    ts: at(13, 9, 46),
    own: true,
    kind: "text",
    body: "Yes. The recovery path is first now.",
  }),
];

const roadmapMessages: readonly MessageRow[] = [
  row({
    id: "r1",
    roomId: "roadmap",
    sender: "@alice:matrix.org",
    senderName: "Alice",
    ts: at(13, 9, 20),
    own: false,
    kind: "text",
    body: "Q1 priorities are set.",
  }),
  row({
    id: "r2",
    roomId: "roadmap",
    sender: SELF,
    senderName: "You",
    ts: at(13, 9, 38),
    own: true,
    kind: "text",
    body: "The UI pass comes first.",
  }),
];

const specMessages: readonly MessageRow[] = [
  row({
    id: "s1",
    roomId: "specs",
    sender: "@carol:matrix.org",
    senderName: "Carol",
    ts: at(13, 9, 16),
    own: false,
    kind: "text",
    body: "The projection is two passes, forward and backward.",
  }),
  row({
    id: "s2",
    roomId: "specs",
    sender: SELF,
    senderName: "You",
    ts: at(13, 9, 36),
    own: true,
    kind: "text",
    body: "The cursor marks the newest row, so backward starts from the live window.",
  }),
];

const lobbyMessages: readonly MessageRow[] = [
  row({
    id: "l1",
    roomId: "lobby",
    sender: "@dave:matrix.org",
    senderName: "Dave",
    ts: at(13, 9, 30),
    own: false,
    kind: "text",
    body: "Morning.",
  }),
];

const nixMessages: readonly MessageRow[] = [
  row({
    id: "n1",
    roomId: "nix",
    sender: "@bob:matrix.org",
    senderName: "Bob",
    ts: at(13, 9, 55),
    own: false,
    kind: "text",
    body: "The flake is smaller now.",
  }),
];

const opsMessages: readonly MessageRow[] = [
  row({
    id: "o1",
    roomId: "ops",
    sender: "@carol:matrix.org",
    senderName: "Carol",
    ts: at(13, 9, 20),
    own: false,
    kind: "text",
    body: "Build 412 is green.",
  }),
];

const messagesByRoom: Readonly<Record<string, readonly MessageRow[]>> = {
  design: designMessages,
  alice: aliceMessages,
  roadmap: roadmapMessages,
  specs: specMessages,
  lobby: lobbyMessages,
  nix: nixMessages,
  ops: opsMessages,
};

export function mockMessagesFor(roomId: string): readonly MessageRow[] {
  return messagesByRoom[roomId] ?? [];
}

const MOCK_STICKER_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const MOCK_STICKER_URL = URL.createObjectURL(
  new Blob([Uint8Array.from(atob(MOCK_STICKER_PNG), (value) => value.charCodeAt(0))], {
    type: "image/png",
  }),
);

export const mockSession: SessionSummary = {
  userId: SELF,
  displayName: "You",
  avatar: null,
  capabilities: {
    recoveryKey: true,
    backup: true,
    signOut: true,
    signOutOthers: true,
  },
  stickerPacks: [
    {
      id: "user:legacy",
      name: "Demo stickers",
      images: [
        {
          shortcode: "demo",
          body: "Demo sticker",
          url: MOCK_STICKER_URL,
          width: 1,
          height: 1,
          mime: "image/png",
        },
      ],
    },
  ],
};

export const mockDevices: readonly DeviceSession[] = [
  {
    id: "this",
    name: "This browser",
    lastSeen: "Now",
    verified: true,
    current: true,
    capabilities: { verify: false, signOut: false },
  },
  {
    id: "phone",
    name: "Phone",
    lastSeen: "2 hours ago",
    verified: false,
    current: false,
    capabilities: { verify: false, signOut: true },
  },
  {
    id: "laptop",
    name: "Work laptop",
    lastSeen: "Yesterday",
    verified: false,
    current: false,
    capabilities: { verify: false, signOut: true },
  },
  {
    id: "tablet",
    name: "Tablet",
    lastSeen: "3 days ago",
    verified: true,
    current: false,
    capabilities: { verify: false, signOut: true },
  },
];

export const mockInvites: readonly Invite[] = [
  {
    roomId: "garden",
    name: "Garden",
    topic: "Weekend plans",
    avatar: null,
    inviter: "Alice",
    inviterId: "@alice:matrix.org",
    directUserId: null,
    roomType: null,
    joinRule: "invite",
    guestAccess: "forbidden",
    historyVisibility: "shared",
    encryption: "encrypted",
    roomVersion: "12",
    federated: true,
    capabilities: { accept: true, decline: true },
  },
];

const member = (userId: string, displayName: string, membership: Member["membership"]): Member => ({
  userId,
  displayName,
  avatar: null,
  profile: true,
  membership,
});

const membersByRoom: Readonly<Record<string, readonly Member[]>> = {
  design: [
    member("@alice:matrix.org", "Alice", "join"),
    member("@bob:matrix.org", "Bob", "join"),
    member("@carol:matrix.org", "Carol", "join"),
    member("@dave:matrix.org", "Dave", "invite"),
    member("@mallory:matrix.org", "Mallory", "ban"),
    member(SELF, "You", "join"),
  ],
  alice: [member("@alice:matrix.org", "Alice", "join"), member(SELF, "You", "join")],
  lobby: [
    member("@alice:matrix.org", "Alice", "join"),
    member("@dave:matrix.org", "Dave", "join"),
    member(SELF, "You", "join"),
  ],
  nix: [member("@bob:matrix.org", "Bob", "join"), member(SELF, "You", "join")],
  ops: [member("@carol:matrix.org", "Carol", "join"), member(SELF, "You", "join")],
  roadmap: [member("@alice:matrix.org", "Alice", "join"), member(SELF, "You", "join")],
  specs: [member("@carol:matrix.org", "Carol", "join"), member(SELF, "You", "join")],
  product: [member(SELF, "You", "join")],
};

export function mockMembersFor(roomId: string): readonly Member[] {
  return membersByRoom[roomId] ?? [];
}

export function mockChatState(): ChatState {
  const roomId = "design";
  const messages = mockMessagesFor(roomId);
  const readReceipt = messages[messages.length - 1]?.eventId ?? null;
  const readRooms = rooms.map((entry) =>
    entry.roomId === roomId
      ? Object.assign({}, entry, {
          readReceipt,
          fullyRead: readReceipt,
          unread: 0,
          highlight: 0,
        })
      : entry,
  );
  return {
    ...emptyChatState(),
    phase: "ready",
    connection: "online",
    session: mockSession,
    rooms: readRooms,
    roomId,
    messages,
    hasOlder: true,
    openSpaces: ["product"],
    recentReactions: ["🎉", "👍"],
    recentStickers: ["👋", "🐱", "✨"],
    devices: mockDevices,
    invites: mockInvites,
    members: mockMembersFor(roomId),
  };
}
