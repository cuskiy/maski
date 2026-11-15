// Every user intent and its optimistic store transition lives at this boundary.
import type { ChatSource } from "./source.ts";
import { sanitizeMessageHtml } from "./sanitize.ts";
import type { Catalog } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import type {
  GuestAccess,
  Media,
  MessageKind,
  MessageRow,
  NotificationLevel,
  ReplyRef,
  RoomHistoryVisibility,
  RoomJoinRule,
  RoomSummary,
  SectionId,
} from "../core/types.ts";
import { createRoom, hasTag, roomFromInvite } from "../core/rooms.ts";
import { messageMatches } from "../core/search.ts";
import { memberPermissions, messagePermissions, roomPermissions } from "../core/permissions.ts";
import { toggledReactions } from "../core/reactions.ts";
import { redactRow } from "../core/message.ts";
import type { Store } from "./store.ts";
import * as prefs from "./prefs.ts";
import { clearSession } from "./session.ts";

export interface MessageOptions {
  readonly kind?: MessageKind;
  readonly html?: string | null;
  readonly media?: Media | null;
  readonly reply?: ReplyRef | null;
  readonly ts?: number;
  readonly status?: MessageRow["status"];
  readonly error?: string | null;
}

export interface Actions {
  selectRoom(roomId: string): void;
  back(): void;
  markRead(roomId: string): void;
  loadOlder(): void;
  appendRows(roomId: string, rows: readonly MessageRow[]): void;
  createRow(roomId: string, body: string, options?: MessageOptions): MessageRow;
  toggleSection(id: SectionId, open: boolean): void;
  toggleSpace(roomId: string): void;
  toggleFavorite(roomId: string): void;
  toggleMute(roomId: string): void;
  leaveRoom(roomId: string): void;
  updateRoomDetails(roomId: string, patch: { readonly name?: string; readonly topic?: string }): void;
  updateRoomAccess(
    roomId: string,
    patch: {
      readonly joinRule?: RoomJoinRule;
      readonly guestAccess?: GuestAccess;
      readonly historyVisibility?: RoomHistoryVisibility;
      readonly directoryPublished?: boolean;
    },
  ): void;
  addRoomAddress(roomId: string, address: string): void;
  removeRoomAddress(roomId: string, address: string): void;
  memberAction(roomId: string, userId: string, action: "kick" | "ban" | "unban"): void;
  inviteUser(roomId: string, userId: string): "ok" | "invalid" | "exists";
  loadMembers(roomId: string): void;
  createRoom(name: string, topic: string): void;
  joinRoom(value: string): "ok" | "notFound";
  startDirect(userId: string): "ok" | "invalid" | "exists";
  setNotification(roomId: string, mode: RoomSummary["notification"]): void;
  setNotificationLevel(level: NotificationLevel): void;
  react(messageId: string, key: string): void;
  edit(messageId: string, body: string, html: string | null): void;
  redact(messageId: string): void;
  search(roomIds: readonly string[], query: string, mediaKinds?: ReadonlySet<string>): readonly MessageRow[];
  forward(messageIds: readonly string[], targetRoomId: string): void;
  discardMessage(messageId: string): void;
  recordEmoji(emoji: string): void;
  recordReaction(emoji: string): void;
  recordSticker(sticker: string): void;
  acceptInvite(roomId: string): void;
  declineInvite(roomId: string): void;
  setPref(key: "badge" | "titleTotal" | "desktop" | "preview", value: boolean): void;
  setBackupReady(): void;
  resetRecoveryKey(): void;
  clearRecoveryKey(): void;
  resetIdentity(): void;
  signOutDevice(deviceId: string): void;
  signOutOthers(): void;
  logout(): Promise<void>;
}

interface Context {
  readonly store: Store;
  readonly source: ChatSource;
  readonly c: Catalog;
  readonly account: string;
}

function setRootView(open: boolean): void {
  document.querySelector(".app")?.setAttribute("data-view", open ? "room" : "list");
}

function cleanRow(row: MessageRow): MessageRow {
  return row.html === null ? row : { ...row, html: sanitizeMessageHtml(row.html) };
}

export function createActions({ store, source, c, account }: Context): Actions {
  function updateRoom(roomId: string, patch: Partial<RoomSummary>): void {
    store.write(
      "rooms",
      store.read("rooms").map((room) => (room.roomId === roomId ? Object.assign({}, room, patch) : room)),
    );
  }

  const userId = (): string | null => store.read("session")?.userId ?? null;
  const permissionsFor = (room: RoomSummary) => roomPermissions(room, userId());

  function openLocalRoom(room: RoomSummary): void {
    source.addRoom(room);
    store.batch(() => {
      store.write("roomId", room.roomId);
      store.write("messages", []);
      store.write("windowLoading", true);
      store.write("members", []);
      store.write("membersLoading", true);
    });
    setRootView(true);
    source.open(room.roomId);
    source.members(room.roomId);
  }

  function markRead(roomId: string): void {
    const room = store.read("rooms").find((entry) => entry.roomId === roomId);
    if (room === undefined) return;
    const local = store.read("roomId") === roomId ? store.read("messages") : [];
    const fromWindow = local.toReversed().find((message) => message.eventId !== null)?.eventId ?? null;
    const eventId = fromWindow ?? room.latestEventId;
    updateRoom(roomId, {
      unread: 0,
      highlight: 0,
      latestEventId: eventId ?? room.latestEventId,
      readReceipt: eventId ?? room.readReceipt,
      fullyRead: eventId ?? room.fullyRead,
    });
    source.markRead(roomId, eventId);
  }

  return {
    selectRoom(roomId) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined) return;
      store.batch(() => {
        store.write("roomId", roomId);
        store.write("messages", []);
        store.write("windowLoading", true);
        store.write("hasOlder", false);
        store.write("typing", []);
        store.write("members", []);
        store.write("membersLoading", true);
      });
      setRootView(true);
      source.open(roomId);
      source.members(roomId);
    },
    back() {
      store.batch(() => {
        store.write("roomId", null);
        store.write("messages", []);
        store.write("windowLoading", false);
        store.write("hasOlder", false);
        store.write("members", []);
        store.write("membersLoading", false);
      });
      setRootView(false);
    },
    markRead,
    loadOlder() {
      const roomId = store.read("roomId");
      if (roomId === null || store.read("olderLoading")) return;
      store.write("olderLoading", true);
      source.older(roomId);
    },
    appendRows(roomId, rawRows) {
      if (rawRows.length === 0) return;
      if (!store.read("rooms").some((room) => room.roomId === roomId)) return;
      const rows = rawRows.map(cleanRow);
      const last = rows[rows.length - 1];
      if (last === undefined) return;
      const preview = {
        kind: last.status === "failed" ? ("error" as const) : last.kind,
        body: last.body === "" ? (last.media?.name ?? "") : last.body,
      };
      store.batch(() => {
        if (store.read("roomId") === roomId) store.write("messages", [...store.read("messages"), ...rows]);
        updateRoom(roomId, {
          preview,
          lastTs: last.ts,
          ...(last.eventId === null ? {} : { latestEventId: last.eventId }),
        });
      });
      for (const row of rows) source.send(roomId, row);
    },
    createRow(roomId, body, options = {}) {
      const session = store.read("session");
      const id = `local-${crypto.randomUUID()}`;
      return {
        id,
        eventId: null,
        transactionId: `txn-${id}`,
        roomId,
        sender: session?.userId ?? "",
        senderName: session?.displayName ?? t(c, "chat.you"),
        senderAvatar: session?.avatar ?? null,
        ts: options.ts ?? Date.now(),
        own: true,
        kind: options.kind ?? "text",
        body,
        html: options.html === undefined || options.html === null ? null : sanitizeMessageHtml(options.html),
        media: options.media ?? null,
        reactions: [],
        reply: options.reply ?? null,
        mentions: [],
        edited: false,
        redacted: false,
        status: options.status ?? "sending",
        error: options.error ?? null,
        system: false,
        encryption: { state: "ok" },
      };
    },
    toggleSection(id, open) {
      const sections = {
        ...store.read("sections"),
        [id]: { open },
      };
      store.write("sections", sections);
      prefs.saveSections(account, sections);
    },
    toggleSpace(roomId) {
      const open = store.read("openSpaces");
      const next = open.includes(roomId) ? open.filter((id) => id !== roomId) : [...open, roomId];
      store.write("openSpaces", next);
      prefs.saveSpaces(account, next);
    },
    toggleFavorite(roomId) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !permissionsFor(room).favorite) return;
      source.setRoomTag(roomId, "m.favourite", !hasTag(room, "m.favourite"));
    },
    toggleMute(roomId) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !permissionsFor(room).mute) return;
      source.setNotification(roomId, room.notification === "mute" ? "default" : "mute");
    },
    leaveRoom(roomId) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !permissionsFor(room).leave) return;
      const wasActive = store.read("roomId") === roomId;
      source.leaveRoom(roomId);
      if (wasActive) {
        store.batch(() => {
          store.write("roomId", null);
          store.write("messages", []);
          store.write("members", []);
          store.write("membersLoading", false);
        });
        setRootView(false);
      }
    },
    loadMembers(roomId) {
      store.batch(() => {
        store.write("members", []);
        store.write("membersLoading", true);
      });
      source.members(roomId);
    },
    createRoom(name, topic) {
      const self = userId();
      const roomId = `local-${crypto.randomUUID()}`;
      const room = createRoom({
        roomId,
        name,
        topic,
        joinRule: "invite",
        historyVisibility: "shared",
        creatorIds: self === null ? [] : [self],
      });
      openLocalRoom(room);
    },
    joinRoom(value) {
      const wanted = value.trim();
      const room = store.read("rooms").find((entry) => entry.roomId === wanted || entry.aliases.includes(wanted));
      if (room === undefined) return "notFound";
      this.selectRoom(room.roomId);
      return "ok";
    },
    startDirect(targetUserId) {
      if (!/^@[^:\s]+:[^:\s]+$/u.test(targetUserId) || targetUserId === store.read("session")?.userId) {
        return "invalid";
      }
      const existing = store.read("rooms").find((entry) => entry.directUserId === targetUserId);
      if (existing !== undefined) {
        this.selectRoom(existing.roomId);
        return "exists";
      }
      const self = store.read("session")?.userId ?? null;
      const localpart = targetUserId.slice(1).split(":")[0] ?? targetUserId;
      const roomId = `local-${crypto.randomUUID()}`;
      const room = createRoom({
        roomId,
        name: localpart,
        topic: t(c, "room.directTopic"),
        directUserId: targetUserId,
        joinRule: "invite",
        historyVisibility: "shared",
        creatorIds: self === null ? [] : [self],
      });
      openLocalRoom(room);
      source.inviteUser(roomId, targetUserId);
      return "ok";
    },
    updateRoomDetails(roomId, patch) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined) return;
      const permissions = permissionsFor(room);
      const next: { name?: string; topic?: string } = {};
      if (permissions.name && patch.name !== undefined && patch.name.trim() !== "") {
        next.name = patch.name.trim();
      }
      if (permissions.topic && patch.topic !== undefined) next.topic = patch.topic.trim();
      if (Object.keys(next).length > 0) source.setRoomState(roomId, next);
    },
    updateRoomAccess(roomId, patch) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined) return;
      const permissions = permissionsFor(room);
      const next: {
        joinRule?: RoomJoinRule;
        guestAccess?: GuestAccess;
        historyVisibility?: RoomHistoryVisibility;
        directoryPublished?: boolean;
      } = {};
      if (permissions.access && patch.joinRule !== undefined) next.joinRule = patch.joinRule;
      if (permissions.access && patch.guestAccess !== undefined) next.guestAccess = patch.guestAccess;
      if (permissions.access && patch.historyVisibility !== undefined) {
        next.historyVisibility = patch.historyVisibility;
      }
      if (permissions.directory && patch.directoryPublished !== undefined) {
        next.directoryPublished = patch.directoryPublished;
      }
      if (Object.keys(next).length > 0) source.setRoomState(roomId, next);
    },
    addRoomAddress(roomId, address) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !permissionsFor(room).aliases || room.aliases.includes(address)) return;
      source.setRoomState(roomId, { aliases: [...room.aliases, address] });
    },
    removeRoomAddress(roomId, address) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !permissionsFor(room).aliases) return;
      source.setRoomState(roomId, { aliases: room.aliases.filter((entry) => entry !== address) });
    },
    memberAction(roomId, userIdToChange, action) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      const member = store.read("members").find((entry) => entry.userId === userIdToChange);
      if (room === undefined || member === undefined) return;
      if (!memberPermissions(room, member, userId())[action]) return;
      source.memberAction(roomId, userIdToChange, action);
    },
    inviteUser(roomId, invitee) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !permissionsFor(room).invite) return "invalid";
      if (!/^@[^:\s]+:[^:\s]+$/u.test(invitee) || invitee === store.read("session")?.userId) return "invalid";
      if (store.read("members").some((member) => member.userId === invitee)) return "exists";
      source.inviteUser(roomId, invitee);
      return "ok";
    },
    setNotification(roomId, mode) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !permissionsFor(room).notifications) return;
      source.setNotification(roomId, mode);
    },
    setNotificationLevel(level) {
      const next = { ...store.read("notifications"), level };
      store.write("notifications", next);
      prefs.saveNotifications(account, next);
      source.saveNotifications(next);
    },
    react(messageId, key) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      const room = store.read("rooms").find((entry) => entry.roomId === message?.roomId) ?? null;
      if (message === undefined || !messagePermissions(message, room, userId()).react) return;
      const updated = { ...message, reactions: toggledReactions(message.reactions, key) };
      store.write(
        "messages",
        store.read("messages").map((entry) => (entry.id === messageId ? updated : entry)),
      );
      if (message.eventId !== null) source.react(message.roomId, message.eventId, key);
    },
    edit(messageId, body, html) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      const room = store.read("rooms").find((entry) => entry.roomId === message?.roomId) ?? null;
      if (message === undefined || !messagePermissions(message, room, userId()).edit) return;
      const cleanHtml = html === null ? null : sanitizeMessageHtml(html);
      const updated = { ...message, body, html: cleanHtml, edited: true, status: "sent" as const, error: null };
      store.write(
        "messages",
        store.read("messages").map((entry) => (entry.id === messageId ? updated : entry)),
      );
      if (message.eventId !== null) source.edit(message.roomId, message.eventId, body, cleanHtml);
    },
    redact(messageId) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      const room = store.read("rooms").find((entry) => entry.roomId === message?.roomId) ?? null;
      if (message === undefined || !messagePermissions(message, room, userId()).redact) return;
      store.write(
        "messages",
        store.read("messages").map((entry) => (entry.id === messageId ? redactRow(entry) : entry)),
      );
      if (message.eventId !== null) source.redact(message.roomId, message.eventId);
    },
    search(roomIds, query, mediaKinds) {
      const remote = source.search(roomIds, query, mediaKinds);
      const local = store
        .read("messages")
        .filter((message) => roomIds.includes(message.roomId) && messageMatches(message, query, mediaKinds));
      return [...new Map([...remote, ...local].map((message) => [message.id, message])).values()];
    },
    forward(messageIds, targetRoomId) {
      if (messageIds.length === 0) return;
      const target = store.read("rooms").find((entry) => entry.roomId === targetRoomId);
      if (target === undefined) return;
      const session = store.read("session");
      const wanted = new Set(messageIds);
      const rows = store
        .read("messages")
        .filter((message) => wanted.has(message.id) && !message.redacted)
        .map((message) => {
          const id = `local-forward-${crypto.randomUUID()}`;
          return Object.assign({}, message, {
            id,
            eventId: null,
            transactionId: `txn-${id}`,
            roomId: targetRoomId,
            sender: session?.userId ?? "",
            senderName: session?.displayName ?? t(c, "chat.you"),
            senderAvatar: session?.avatar ?? null,
            own: true,
            reactions: [],
            reply: null,
            mentions: [],
            edited: false,
            redacted: false,
            status: "sending" as const,
            error: null,
          });
        });
      const last = rows[rows.length - 1];
      if (last === undefined) return;
      source.forward(targetRoomId, rows);
      for (const row of rows) source.send(targetRoomId, row);
      updateRoom(targetRoomId, {
        preview: {
          kind: last.kind,
          body: last.body === "" ? (last.media?.name ?? "") : last.body,
        },
        lastTs: last.ts,
      });
      if (store.read("roomId") === targetRoomId) {
        store.write("messages", [...store.read("messages"), ...rows]);
      }
    },
    discardMessage(messageId) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      if (message === undefined || message.eventId !== null) return;
      store.write(
        "messages",
        store.read("messages").filter((entry) => entry.id !== messageId),
      );
    },
    recordEmoji(emoji) {
      if (emoji === "") return;
      const next = [emoji, ...store.read("recentEmoji").filter((entry) => entry !== emoji)].slice(0, 18);
      store.write("recentEmoji", next);
      prefs.saveRecentEmoji(account, next);
    },
    recordReaction(emoji) {
      if (emoji === "") return;
      const next = [emoji, ...store.read("recentReactions").filter((entry) => entry !== emoji)].slice(0, 18);
      store.write("recentReactions", next);
      prefs.saveRecentReactions(account, next);
    },
    recordSticker(sticker) {
      if (sticker === "") return;
      const next = [sticker, ...store.read("recentStickers").filter((entry) => entry !== sticker)].slice(0, 6);
      store.write("recentStickers", next);
      prefs.saveRecentStickers(account, next);
    },
    acceptInvite(roomId) {
      const invite = store.read("invites").find((entry) => entry.roomId === roomId);
      if (invite === undefined || !invite.capabilities.accept) return;
      const room = roomFromInvite(invite);
      source.addRoom(room);
      store.batch(() => {
        store.write(
          "invites",
          store.read("invites").filter((entry) => entry.roomId !== roomId),
        );
        store.write("roomId", room.roomId);
        store.write("messages", []);
        store.write("windowLoading", true);
        store.write("hasOlder", false);
        store.write("typing", []);
        store.write("members", []);
        store.write("membersLoading", true);
      });
      source.answerInvite(roomId, true);
      setRootView(true);
      source.open(room.roomId);
      source.members(room.roomId);
    },
    declineInvite(roomId) {
      store.write(
        "invites",
        store.read("invites").filter((entry) => entry.roomId !== roomId),
      );
      source.answerInvite(roomId, false);
    },
    setPref(key, value) {
      const next = { ...store.read("notifications"), [key]: value };
      store.write("notifications", next);
      prefs.saveNotifications(account, next);
      source.saveNotifications(next);
    },
    setBackupReady() {
      store.write("backupReady", true);
      prefs.saveBackup(account, true);
    },
    resetRecoveryKey() {
      source.resetRecoveryKey();
    },
    clearRecoveryKey() {
      store.write("recoveryKey", null);
    },
    resetIdentity() {
      source.resetIdentity();
    },
    signOutDevice(deviceId) {
      source.signOutDevice(deviceId);
    },
    signOutOthers() {
      source.signOutOthers();
    },
    async logout() {
      try {
        await source.logout();
      } finally {
        clearSession();
        location.assign("/");
      }
    },
  };
}

export function wireSources(store: Store, source: ChatSource): () => void {
  const subscriptions = [
    source.on("session", (session) => store.write("session", session)),
    source.on("phase", (phase) => store.write("phase", phase)),
    source.on("connection", (connection) => store.write("connection", connection)),
    source.on("rooms", ({ rooms, loading }) => {
      const previous = new Map(store.read("rooms").map((room) => [room.roomId, room]));
      const merged = rooms.map((room) => {
        const old = previous.get(room.roomId);
        return old === undefined
          ? room
          : Object.assign({}, room, {
              readReceipt: old.readReceipt,
              fullyRead: old.fullyRead,
            });
      });
      store.batch(() => {
        store.write("rooms", merged);
        store.write("roomsLoading", loading);
      });
    }),
    source.on("window", ({ roomId, messages, hasOlder, older }) => {
      if (roomId !== store.read("roomId")) return;
      store.batch(() => {
        if (!older) {
          store.write("messages", messages.map(cleanRow));
        } else if (messages.length > 0) {
          const current = store.read("messages");
          const existing = new Set(current.map((message) => message.id));
          const olderRows = messages.map(cleanRow).filter((message) => !existing.has(message.id));
          if (olderRows.length > 0) store.write("messages", [...olderRows, ...current]);
        }
        store.write("hasOlder", hasOlder);
        store.write("olderLoading", false);
        store.write("windowLoading", false);
      });
    }),
    source.on("devices", (devices) => store.write("devices", devices)),
    source.on("invites", (invites) => store.write("invites", invites)),
    source.on("members", ({ roomId, members }) => {
      if (roomId !== store.read("roomId")) return;
      store.batch(() => {
        store.write("members", members);
        store.write("membersLoading", false);
      });
    }),
    source.on("recoveryKey", (recoveryKey) => store.write("recoveryKey", recoveryKey)),
    source.on("outbox", ({ roomId, messageId, eventId, status, error }) => {
      if (roomId !== store.read("roomId")) {
        if (eventId !== null) {
          store.write(
            "rooms",
            store
              .read("rooms")
              .map((room) => (room.roomId === roomId ? Object.assign({}, room, { latestEventId: eventId }) : room)),
          );
        }
        return;
      }
      store.batch(() => {
        store.write(
          "messages",
          store
            .read("messages")
            .map((message) =>
              message.id === messageId ? Object.assign({}, message, { eventId, status, error }) : message,
            ),
        );
        if (eventId !== null) {
          store.write(
            "rooms",
            store
              .read("rooms")
              .map((room) => (room.roomId === roomId ? Object.assign({}, room, { latestEventId: eventId }) : room)),
          );
        }
      });
    }),
  ];
  return () => {
    for (const unsubscribe of subscriptions) unsubscribe();
  };
}
