import type {
  ChatState,
  DeviceSession,
  Invite,
  Media,
  MessageEncryption,
  MessageKind,
  MessageRow,
  MessageStatus,
  Reaction,
  ReplyRef,
  RoomSummary,
  SessionSummary,
} from "./types.ts";
import { emptyChatState } from "./state.ts";

function at(day: number, hour: number, minute: number): number {
  return Date.UTC(2026, 10, day, hour, minute);
}

const roomSeeds: ReadonlyArray<Omit<RoomSummary, "notification" | "encryption" | "capabilities">> = [
  {
    roomId: "design",
    name: "Design",
    topic: "Interface, motion and the quiet shell",
    avatar: null,
    preview: { kind: "text", body: "The borderless pass is ready." },
    lastTs: at(13, 10, 2),
    unread: 3,
    highlight: 1,
    muted: false,
    membership: "join",
    isDirect: false,
    isSpace: false,
    favorite: false,
    spaceId: null,
  },
  {
    roomId: "nix",
    name: "Nix",
    topic: "Packaging and shell setups",
    avatar: null,
    preview: { kind: "text", body: "The flake is smaller now." },
    lastTs: at(13, 9, 55),
    unread: 0,
    highlight: 0,
    muted: false,
    membership: "join",
    isDirect: false,
    isSpace: false,
    favorite: true,
    spaceId: null,
  },
  {
    roomId: "alice",
    name: "Alice",
    topic: "Direct messages",
    avatar: null,
    preview: { kind: "text", body: "Can you look at the key screen?" },
    lastTs: at(13, 9, 48),
    unread: 1,
    highlight: 0,
    muted: false,
    membership: "join",
    isDirect: true,
    isSpace: false,
    favorite: false,
    spaceId: null,
  },
  {
    roomId: "product",
    name: "Product",
    topic: "Spaces and plans",
    avatar: null,
    preview: { kind: "text", body: "2 rooms" },
    lastTs: at(13, 9, 40),
    unread: 0,
    highlight: 0,
    muted: false,
    membership: "join",
    isDirect: false,
    isSpace: true,
    favorite: false,
    spaceId: null,
  },
  {
    roomId: "roadmap",
    name: "Roadmap",
    topic: "The next release",
    avatar: null,
    preview: { kind: "text", body: "Q1 priorities are set." },
    lastTs: at(13, 9, 38),
    unread: 0,
    highlight: 0,
    muted: false,
    membership: "join",
    isDirect: false,
    isSpace: false,
    favorite: false,
    spaceId: "product",
  },
  {
    roomId: "specs",
    name: "Specs",
    topic: "Protocol notes",
    avatar: null,
    preview: { kind: "text", body: "The projection is two passes." },
    lastTs: at(13, 9, 36),
    unread: 0,
    highlight: 0,
    muted: false,
    membership: "join",
    isDirect: false,
    isSpace: false,
    favorite: false,
    spaceId: "product",
  },
  {
    roomId: "lobby",
    name: "Lobby",
    topic: "General",
    avatar: null,
    preview: { kind: "text", body: "Morning." },
    lastTs: at(13, 9, 30),
    unread: 0,
    highlight: 0,
    muted: false,
    membership: "join",
    isDirect: false,
    isSpace: false,
    favorite: false,
    spaceId: null,
  },
  {
    roomId: "ops",
    name: "Ops",
    topic: "Deployments",
    avatar: null,
    preview: { kind: "text", body: "Build 412 is green." },
    lastTs: at(13, 9, 20),
    unread: 0,
    highlight: 0,
    muted: true,
    membership: "join",
    isDirect: false,
    isSpace: false,
    favorite: false,
    spaceId: null,
  },
];

const rooms: readonly RoomSummary[] = roomSeeds.map((room) =>
  Object.assign({}, room, {
    notification: room.muted ? ("mute" as const) : ("all" as const),
    encryption: room.isSpace ? ("none" as const) : ("encrypted" as const),
    capabilities: {
      invite: !room.isSpace && room.membership === "join",
      manage: room.roomId === "design" || room.roomId === "product",
      notifications: room.membership === "join",
      leave: room.membership === "join",
      markRead: true,
      favorite: !room.isSpace,
      mute: !room.isSpace,
    },
  }),
);

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
  readonly edited?: boolean;
  readonly status?: MessageStatus;
  readonly error?: string;
  readonly system?: boolean;
  readonly encryption?: MessageEncryption;
}

function row(input: RowInput): MessageRow {
  return {
    id: input.id,
    roomId: input.roomId,
    sender: input.sender,
    senderName: input.senderName,
    senderAvatar: null,
    ts: input.ts,
    own: input.own,
    kind: input.kind,
    body: input.body,
    html: input.html ?? null,
    media: input.media ?? null,
    reactions: input.reactions ?? [],
    reply: input.reply ?? null,
    edited: input.edited ?? false,
    status: input.status ?? "sent",
    error: input.error ?? null,
    system: input.system ?? false,
    encryption: input.encryption ?? { state: "ok" },
    capabilities: {
      reply: input.encryption?.state !== "undecryptable",
      react: input.encryption?.state !== "undecryptable",
      edit: input.own && input.encryption?.state !== "undecryptable",
      redact: input.own,
      copy: input.encryption?.state !== "undecryptable" && input.body !== "",
      copyLink: true,
    },
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
    sender: "@you:matrix.org",
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
    sender: "@you:matrix.org",
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
    sender: "@you:matrix.org",
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
    sender: "@you:matrix.org",
    senderName: "You",
    ts: at(13, 10, 3),
    own: true,
    kind: "text",
    body: "Testing the queued state.",
    status: "sending",
  }),
  row({
    id: "d12",
    roomId: "design",
    sender: "@you:matrix.org",
    senderName: "You",
    ts: at(13, 10, 4),
    own: true,
    kind: "text",
    body: "This one did not send.",
    status: "failed",
    error: "No connection.",
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
    sender: "@you:matrix.org",
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
    sender: "@you:matrix.org",
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
    sender: "@you:matrix.org",
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

export const mockSession: SessionSummary = {
  userId: "@you:matrix.org",
  displayName: "You",
  avatar: null,
  capabilities: {
    verify: true,
    recoveryKey: true,
    backup: true,
    reset: true,
    signOut: true,
    signOutOthers: true,
  },
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
    capabilities: { verify: true, signOut: true },
  },
];

export const mockInvites: readonly Invite[] = [
  {
    roomId: "garden",
    name: "Garden",
    topic: "Weekend plans",
    inviter: "Alice",
    capabilities: { accept: true, decline: true },
  },
];

export const mockRecoveryKey = {
  value: "maski-recovery-key-4f7c-9a2e-6b1d",
  copy: true,
  download: true,
} as const;

export const mockMembers = [
  { userId: "@alice:matrix.org", displayName: "Alice", avatar: null, profile: true },
  { userId: "@bob:matrix.org", displayName: "Bob", avatar: null, profile: true },
  { userId: "@carol:matrix.org", displayName: "Carol", avatar: null, profile: true },
  { userId: "@dave:matrix.org", displayName: "Dave", avatar: null, profile: true },
  { userId: "@you:matrix.org", displayName: "You", avatar: null, profile: true },
] as const;

export function mockChatState(): ChatState {
  const roomId = "design";
  return {
    ...emptyChatState(),
    phase: "ready",
    connection: "online",
    session: mockSession,
    rooms,
    roomId,
    messages: mockMessagesFor(roomId),
    hasOlder: true,
    openSpaces: ["product"],
    devices: mockDevices,
    invites: mockInvites,
    members: mockMembers,
  };
}
