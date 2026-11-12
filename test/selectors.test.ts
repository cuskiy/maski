import { describe, expect, it } from "vitest";
import { displayName, roomSections, timelineItems } from "../src/store/selectors";
import type { AppSnapshot } from "../src/store/app-store";
import type { EventRecord, MemberRecord, RoomRecord } from "../src/data/records";

function room(roomId: string, kind: "room" | "space", ts = 0): RoomRecord {
  return {
    roomId,
    kind,
    children: [],
    name: roomId,
    topic: "",
    avatarMxc: null,
    canonicalAlias: null,
    isDirect: false,
    membership: "join",
    selfMembership: "join",
    selfPowerLevel: 100,
    memberCount: 1,
    isEncrypted: false,
    joinRule: "invite",
    lastTs: ts,
    lastEvent: null,
    unreadTotal: 0,
    unreadHighlight: 0,
    readUpToEventId: null,
    tags: [],
    order: 0,
    hasOlder: false,
    updatedAt: 0,
  };
}

function snapshot(overrides: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    session: null,
    connection: "ready",
    keyGate: "complete",
    recovery: null,
    revision: 1,
    rooms: [],
    activeRoomId: null,
    events: [],
    members: [],
    packs: [],
    outbox: [],
    typing: {},
    devices: [],
    verification: null,
    ui: {
      locale: "en",
      toast: null,
      notificationsPreview: true,
      notificationPermission: "unsupported",
    },
    ...overrides,
  };
}

function member(userId: string, name: string): MemberRecord {
  return {
    roomId: "!a",
    userId,
    displayName: name,
    avatarMxc: null,
    membership: "join",
    powerLevel: 0,
    updatedAt: 0,
  };
}

function eventRecord(eventId: string, ts: number, body: string): EventRecord {
  return {
    eventId,
    roomId: "!a",
    senderId: "@me:x",
    ts,
    type: "m.room.message",
    msgtype: "m.text",
    kind: "text",
    body,
    formattedBody: null,
    media: null,
    replyTo: null,
    mentions: [],
    edited: false,
    redacted: false,
    encrypted: false,
    decryptionError: null,
    decrypting: false,
    reactions: {},
    txnId: null,
    searchText: "",
    tokens: [],
    stateKey: null,
    membership: null,
  };
}

describe("room sections", () => {
  it("lists a space as a channel and keeps it out of rooms", () => {
    const sections = roomSections(
      snapshot({ rooms: [room("!a", "room", 2), room("!b", "space", 1)] }),
    );
    const channels = sections.find((section) => section.key === "channels");
    const rooms = sections.find((section) => section.key === "rooms");
    expect(channels?.rooms.map((entry) => entry.roomId)).toEqual(["!b"]);
    expect(rooms?.rooms.map((entry) => entry.roomId)).toEqual(["!a"]);
  });
});

describe("display names", () => {
  it("appends the user id when two members share a name", () => {
    const state = snapshot({
      members: [member("@a:x", "Alice"), member("@b:x", "Alice"), member("@c:x", "Carol")],
    });
    expect(displayName(state, "!a", "@a:x")).toBe("Alice (@a:x)");
    expect(displayName(state, "!a", "@c:x")).toBe("Carol");
  });

  it("falls back to the localpart", () => {
    expect(displayName(snapshot(), "!a", "@nobody:x")).toBe("nobody");
  });
});

describe("timeline composition", () => {
  it("hides a message whose redaction is still in the outbox", () => {
    const event = eventRecord("$e1", 1, "gone");
    const state = snapshot({
      activeRoomId: "!a",
      rooms: [room("!a", "room")],
      events: [event],
      outbox: [
        {
          txnId: "t1",
          roomId: "!a",
          eventType: "m.room.redaction",
          content: { redacts: "$e1" },
          blob: null,
          media: null,
          createdAt: 2,
          attempts: 0,
          nextAttemptAt: 0,
          status: "pending",
          error: null,
          eventId: null,
        },
      ],
    });
    const items = timelineItems(state, "!a", 300);
    expect(items.some((item) => item.type === "event")).toBe(false);
  });

  it("applies a queued edit and marks the row as pending", () => {
    const event = eventRecord("$e1", 1, "before");
    const state = snapshot({
      activeRoomId: "!a",
      rooms: [room("!a", "room")],
      events: [event],
      outbox: [
        {
          txnId: "t2",
          roomId: "!a",
          eventType: "m.room.message",
          content: {
            "m.relates_to": { rel_type: "m.replace", event_id: "$e1" },
            "m.new_content": { body: "after", msgtype: "m.text" },
          },
          blob: null,
          media: null,
          createdAt: 2,
          attempts: 0,
          nextAttemptAt: 0,
          status: "pending",
          error: null,
          eventId: null,
        },
      ],
    });
    const item = timelineItems(state, "!a", 300).find((entry) => entry.type === "event");
    expect(item?.type).toBe("event");
    if (item?.type === "event") {
      expect(item.event.body).toBe("after");
      expect(item.pending).toBe(true);
    }
  });
});
