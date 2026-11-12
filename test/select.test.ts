import { beforeEach, describe, expect, it } from "vitest";
import type { Member, Message, RoomSummary } from "../src/core/types.ts";
import { canModerate, roomPreview, sectionOf, sections, timelineItems } from "../src/store/select.ts";
import { state } from "../src/store/state.ts";

const room = (overrides: Partial<RoomSummary>): RoomSummary => ({
  roomId: "!room",
  name: "Room",
  avatar: null,
  topic: "",
  alias: null,
  membership: "join",
  isDirect: false,
  encrypted: false,
  lastTs: 0,
  last: null,
  unread: 0,
  highlight: 0,
  muted: false,
  favorite: false,
  lowPriority: false,
  inviter: null,
  joined: 2,
  myPower: 0,
  hasOlder: false,
  canSend: true,
  ...overrides,
});

const message = (overrides: Partial<Message>): Message => ({
  id: "$event",
  roomId: "!room",
  sender: "@a:example.org",
  name: "A",
  avatar: null,
  ts: 0,
  kind: "text",
  body: "hello",
  html: null,
  media: null,
  reply: null,
  mentions: [],
  edited: false,
  reactions: [],
  status: "sent",
  error: null,
  encrypted: false,
  search: [],
  ...overrides,
});

beforeEach(() => {
  state.rooms.clear();
  state.session = { userId: "@me:example.org", deviceId: "D", displayName: "Me", avatar: null, baseUrl: "", accountHash: "" };
});

describe("sectionOf", () => {
  it("orders invites, favourites, direct messages, low priority and rooms", () => {
    expect(sectionOf(room({ membership: "invite" }))).toBe("invites");
    expect(sectionOf(room({ favorite: true }))).toBe("favorites");
    expect(sectionOf(room({ isDirect: true }))).toBe("direct");
    expect(sectionOf(room({ lowPriority: true }))).toBe("low");
    expect(sectionOf(room({}))).toBe("rooms");
  });
});

describe("sections", () => {
  it("groups and sorts each section by the newest message", () => {
    state.rooms.set("!a", room({ roomId: "!a", lastTs: 10 }));
    state.rooms.set("!b", room({ roomId: "!b", lastTs: 30 }));
    state.rooms.set("!c", room({ roomId: "!c", lastTs: 20, isDirect: true }));
    const grouped = sections();
    expect(grouped.map((section) => section.id)).toEqual(["invites", "favorites", "direct", "rooms", "low"]);
    expect(grouped.find((section) => section.id === "rooms")?.rooms.map((entry) => entry.roomId)).toEqual(["!b", "!a"]);
    expect(grouped.find((section) => section.id === "direct")?.rooms.map((entry) => entry.roomId)).toEqual(["!c"]);
  });
});

describe("timelineItems", () => {
  it("adds a day separator and groups a burst from one sender", () => {
    const items = timelineItems([
      message({ id: "$1", ts: 1000 }),
      message({ id: "$2", ts: 2000 }),
      message({ id: "$3", ts: 400_000 }),
    ]);
    expect(items[0]?.kind).toBe("day");
    const messages = items.filter((item) => item.kind === "message");
    expect(messages.map((item) => item.kind === "message" && item.groupStart)).toEqual([true, false, true]);
  });

  it("marks the current user's messages", () => {
    const items = timelineItems([message({ sender: "@me:example.org" }), message({ id: "$other", sender: "@a:example.org" })]);
    const messages = items.filter((item) => item.kind === "message");
    expect(messages.map((item) => item.kind === "message" && item.own)).toEqual([true, false]);
  });

  it("starts a group when the day changes", () => {
    const items = timelineItems([message({ id: "$1", ts: 0 }), message({ id: "$2", ts: 86_400_000 * 2 })]);
    expect(items.filter((item) => item.kind === "day")).toHaveLength(2);
  });
});

describe("roomPreview", () => {
  it("prefixes another sender's message with nothing and the user's own with You", () => {
    expect(roomPreview(room({ last: { kind: "text", body: "hi", name: "A", own: false } }))).toBe("hi");
    expect(roomPreview(room({ last: { kind: "text", body: "hi", name: "Me", own: true } }))).toBe("You: hi");
  });

  it("names the kind when there is no text", () => {
    expect(roomPreview(room({ last: { kind: "image", body: "", name: "A", own: false } }))).toBe("Image");
    expect(roomPreview(room({ last: { kind: "error", body: "", name: "A", own: false } }))).toBe("Encrypted message");
  });

  it("says what happened for a membership change", () => {
    expect(roomPreview(room({ last: { kind: "state", body: "join", name: "A", own: false } }))).toBe("joined");
  });

  it("is empty without a last message", () => {
    expect(roomPreview(room({}))).toBe("");
  });
});

describe("canModerate", () => {
  const member = (overrides: Partial<Member>): Member => ({
    roomId: "!room",
    userId: "@b:example.org",
    name: "B",
    avatar: null,
    membership: "join",
    power: 0,
    ...overrides,
  });

  it("needs the power to act and a member below it", () => {
    expect(canModerate(room({ myPower: 100 }), member({}), "@me:example.org")).toBe(true);
    expect(canModerate(room({ myPower: 50 }), member({ power: 50 }), "@me:example.org")).toBe(false);
    expect(canModerate(room({ myPower: 0 }), member({}), "@me:example.org")).toBe(false);
  });

  it("never acts on the user themself", () => {
    expect(canModerate(room({ myPower: 100 }), member({ userId: "@me:example.org" }), "@me:example.org")).toBe(false);
  });

  it("needs a room the user is in", () => {
    expect(canModerate(room({ myPower: 100, membership: "invite" }), member({}), "@me:example.org")).toBe(false);
  });
});
