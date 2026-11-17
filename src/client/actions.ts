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
  SourceCapabilities,
} from "../core/types.ts";
import type { CommandMap, MediaVariant } from "../protocol/index.ts";
import { isFailureCode } from "../protocol/index.ts";
import { createRoom, hasTag, roomFromInvite } from "../core/rooms.ts";
import { memberPermissions, messagePermissions, roomPermissions } from "../core/permissions.ts";
import type { Store } from "./store.ts";
import * as prefs from "./prefs.ts";
import { clearSession } from "./session.ts";
import { clearDrafts } from "./uiDb.ts";

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
  readonly capabilities: SourceCapabilities;
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
  typing(roomId: string, typing: boolean): void;
  createRoom(name: string, topic: string): Promise<void>;
  joinRoom(value: string): Promise<"ok" | "notFound">;
  startDirect(userId: string): Promise<"ok" | "invalid" | "exists">;
  setNotification(roomId: string, mode: RoomSummary["notification"]): void;
  setNotificationLevel(level: NotificationLevel): void;
  react(messageId: string, key: string): void;
  edit(messageId: string, body: string, html: string | null): void;
  redact(messageId: string): void;
  search(roomIds: readonly string[], query: string, mediaKinds?: ReadonlySet<string>): Promise<readonly MessageRow[]>;
  forward(messageIds: readonly string[], targetRoomId: string): void;
  /** Sends one attachment through the worker; no client-side row is created. */
  sendMedia(
    roomId: string,
    file: File,
    kind: CommandMap["sendMedia"]["kind"],
    caption: string,
    html: string | null,
    replyTo: string | null,
  ): Promise<void>;
  /** Sends an image already stored in a pack; no bytes cross the main thread. */
  sendSticker(roomId: string, packId: string, shortcode: string): Promise<void>;
  /** Fire-and-forget preview resolution; the row is patched when the worker answers. */
  media(roomId: string, messageId: string, variant: MediaVariant): void;
  /** Resolves for the viewer or a download and patches the row; null means no URL. */
  resolveMedia(roomId: string, messageId: string, variant: MediaVariant): Promise<string | null>;
  retryMessage(messageId: string): void;
  discardMessage(messageId: string): void;
  recordEmoji(emoji: string): void;
  recordReaction(emoji: string): void;
  recordSticker(sticker: string): void;
  acceptInvite(roomId: string): void;
  declineInvite(roomId: string): void;
  setPref(key: "badge" | "titleTotal" | "desktop" | "preview", value: boolean): void;
  setStickers(enabled: boolean): void;
  backupSetup(): void;
  resetRecoveryKey(): void;
  clearRecoveryKey(): void;
  resetIdentity(password: string): void;
  setAvatar(file: Blob): Promise<void>;
  pat(roomId: string, userId: string): Promise<void>;
  startSas(deviceId: string | null): Promise<void>;
  acceptSas(id: string): Promise<void>;
  confirmSas(id: string): Promise<void>;
  mismatchSas(id: string): Promise<void>;
  cancelSas(id: string): Promise<void>;
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

function withReadReceipt(room: RoomSummary, eventId: string): RoomSummary {
  return { ...room, readReceipt: eventId, unread: 0, highlight: 0 };
}

function cleanRow(row: MessageRow): MessageRow {
  return row.html === null ? row : { ...row, html: sanitizeMessageHtml(row.html) };
}

/** The one writer of a resolved media URL on a visible row. */
function patchMediaUrl(store: Store, roomId: string, messageId: string, url: string | null): void {
  if (store.read("roomId") !== roomId) return;
  const messages = store.read("messages");
  const index = messages.findIndex((message) => message.id === messageId || message.eventId === messageId);
  const row = messages[index];
  if (row === undefined || row.media === null || row.media.url === url) return;
  const next = messages.slice();
  next[index] = { ...row, media: { ...row.media, url } };
  store.write("messages", next);
}

function visibleRowIndex(store: Store, roomId: string, messageId: string): number {
  if (store.read("roomId") !== roomId) return -1;
  return store.read("messages").findIndex((message) => message.id === messageId || message.eventId === messageId);
}

function patchVisibleRow(store: Store, roomId: string, row: MessageRow): void {
  const index = visibleRowIndex(store, roomId, row.id);
  if (index === -1) return;
  const messages = store.read("messages");
  const existing = messages[index];
  if (existing === undefined) return;
  const next = messages.slice();
  next[index] = row;
  store.write("messages", next);
}

function appendVisibleRow(store: Store, row: MessageRow): void {
  if (store.read("roomId") !== row.roomId) return;
  const messages = store.read("messages");
  if (messages.some((message) => message.id === row.id || message.transactionId === row.transactionId)) return;
  store.write("messages", [...messages, row]);
}

export function createActions({ store, source, c, account }: Context): Actions {
  const userId = (): string | null => store.read("session")?.userId ?? null;
  const caps = source.capabilities;
  const permissionsFor = (room: RoomSummary) => roomPermissions(room, userId());

  function openLocalRoom(room: RoomSummary): void {
    source.addRoom?.(room);
    store.batch(() => {
      store.write("roomId", room.roomId);
      store.write("messages", []);
      store.write("windowLoading", true);
      store.write("failure", null);
      store.write("members", []);
      store.write("membersLoading", true);
    });
    setRootView(true);
    source.open(room.roomId);
    source.members(room.roomId);
  }

  function openCreatedRoom(roomId: string): void {
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
  }

  function markRead(roomId: string): void {
    const room = store.read("rooms").find((entry) => entry.roomId === roomId);
    if (room === undefined || room.latestEventId === null) return;
    if (room.readReceipt === room.latestEventId) return;
    const eventId = room.latestEventId;
    const previous = room;
    store.write(
      "rooms",
      store.read("rooms").map((entry) => (entry.roomId === roomId ? withReadReceipt(entry, eventId) : entry)),
    );
    const restore = (): void => {
      store.write(
        "rooms",
        store
          .read("rooms")
          .map((entry) => (entry.roomId === roomId && entry.readReceipt === eventId ? previous : entry)),
      );
    };
    try {
      void Promise.resolve(source.markRead(roomId, eventId)).catch(restore);
    } catch {
      restore();
    }
  }

  /** Replaces only the resolved URL; the row identity and everything else stay put. */
  async function resolveMedia(roomId: string, messageId: string, variant: MediaVariant): Promise<string | null> {
    if (source.media === undefined) return null;
    try {
      const reply = await source.media(roomId, messageId, variant);
      patchMediaUrl(store, roomId, messageId, reply.url);
      return reply.url;
    } catch {
      // A typed worker failure leaves the row as a placeholder; the caller shows that state.
      return null;
    }
  }

  return {
    capabilities: caps,
    selectRoom(roomId) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined) return;
      if (store.read("roomId") === roomId && (store.read("windowLoading") || store.read("messages").length > 0)) {
        setRootView(true);
        return;
      }
      store.batch(() => {
        store.write("roomId", roomId);
        store.write("messages", []);
        store.write("windowLoading", true);
        store.write("hasOlder", false);
        store.write("failure", null);
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
        store.write("failure", null);
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
      for (const raw of rawRows) {
        const row = cleanRow({ ...raw, status: "sending" });
        appendVisibleRow(store, row);
        void source.send(roomId, row).catch((error: unknown) => {
          // The worker's code says what happened; a failed send is not always a network failure.
          const code = error instanceof Error && isFailureCode(error.message) ? error.message : "unavailable";
          patchVisibleRow(store, roomId, {
            ...row,
            status: "failed",
            error: code,
            retryable: code === "network" || code === "unavailable",
          });
        });
      }
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
        retryable: true,
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
      if (room === undefined || !caps.setRoomTag || !permissionsFor(room).favorite) return;
      source.setRoomTag?.(roomId, "m.favourite", !hasTag(room, "m.favourite"));
    },
    toggleMute(roomId) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !caps.setNotification || !permissionsFor(room).mute) return;
      source.setNotification?.(roomId, room.notification === "mute" ? "default" : "mute");
    },
    leaveRoom(roomId) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !caps.leaveRoom || !permissionsFor(room).leave) return;
      const wasActive = store.read("roomId") === roomId;
      source.leaveRoom?.(roomId);
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
    typing(roomId, typing) {
      if (!caps.typing) return;
      source.typing?.(roomId, typing);
    },
    async createRoom(name, topic) {
      if (!caps.addRoom) return;
      if (source.createRoom !== undefined) {
        try {
          const roomId = await source.createRoom(name, topic, null);
          openCreatedRoom(roomId);
        } catch {
          // The room list stays the server's answer; a failed create adds no local row.
        }
        return;
      }
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
    async joinRoom(value) {
      if (!caps.addRoom) return "notFound";
      const wanted = value.trim();
      const known = store.read("rooms").find((entry) => entry.roomId === wanted || entry.aliases.includes(wanted));
      if (known !== undefined && known.membership === "join") {
        this.selectRoom(known.roomId);
        return "ok";
      }
      if (source.joinRoom !== undefined) {
        if (!/^[!#][^:\s]+:[^:\s]+$/u.test(wanted)) return "notFound";
        try {
          const roomId = await source.joinRoom(wanted);
          openCreatedRoom(roomId);
          return "ok";
        } catch {
          return "notFound";
        }
      }
      if (known === undefined) return "notFound";
      this.selectRoom(known.roomId);
      return "ok";
    },
    async startDirect(targetUserId) {
      if (!caps.addRoom || !caps.inviteUser) return "invalid";
      if (!/^@[^:\s]+:[^:\s]+$/u.test(targetUserId) || targetUserId === store.read("session")?.userId) {
        return "invalid";
      }
      const existing = store.read("rooms").find((entry) => entry.directUserId === targetUserId);
      if (existing !== undefined) {
        this.selectRoom(existing.roomId);
        return "exists";
      }
      const localpart = targetUserId.slice(1).split(":")[0] ?? targetUserId;
      if (source.createRoom !== undefined) {
        try {
          const roomId = await source.createRoom(localpart, t(c, "room.directTopic"), targetUserId);
          openCreatedRoom(roomId);
          return "ok";
        } catch {
          return "invalid";
        }
      }
      const self = store.read("session")?.userId ?? null;
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
      source.inviteUser?.(roomId, targetUserId);
      return "ok";
    },
    updateRoomDetails(roomId, patch) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !caps.setRoomState) return;
      const permissions = permissionsFor(room);
      const next: { name?: string; topic?: string } = {};
      if (permissions.name && patch.name !== undefined && patch.name.trim() !== "") {
        next.name = patch.name.trim();
      }
      if (permissions.topic && patch.topic !== undefined) next.topic = patch.topic.trim();
      if (Object.keys(next).length > 0) source.setRoomState?.(roomId, next);
    },
    updateRoomAccess(roomId, patch) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !caps.setRoomState) return;
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
      if (Object.keys(next).length > 0) source.setRoomState?.(roomId, next);
    },
    addRoomAddress(roomId, address) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !caps.setRoomState || !permissionsFor(room).aliases || room.aliases.includes(address))
        return;
      source.setRoomState?.(roomId, { aliases: [...room.aliases, address] });
    },
    removeRoomAddress(roomId, address) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !caps.setRoomState || !permissionsFor(room).aliases) return;
      source.setRoomState?.(roomId, { aliases: room.aliases.filter((entry) => entry !== address) });
    },
    memberAction(roomId, userIdToChange, action) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      const member = store.read("members").find((entry) => entry.userId === userIdToChange);
      if (room === undefined || member === undefined || !caps.memberAction) return;
      if (!memberPermissions(room, member, userId())[action]) return;
      source.memberAction?.(roomId, userIdToChange, action);
    },
    inviteUser(roomId, invitee) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !caps.inviteUser || !permissionsFor(room).invite) return "invalid";
      if (!/^@[^:\s]+:[^:\s]+$/u.test(invitee) || invitee === store.read("session")?.userId) return "invalid";
      if (store.read("members").some((member) => member.userId === invitee)) return "exists";
      source.inviteUser?.(roomId, invitee);
      return "ok";
    },
    setNotification(roomId, mode) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !caps.setNotification || !permissionsFor(room).notifications) return;
      source.setNotification?.(roomId, mode);
    },
    setNotificationLevel(level) {
      const next = { ...store.read("notifications"), level };
      store.write("notifications", next);
      prefs.saveNotifications(account, next);
      source.saveNotifications?.(next);
    },
    react(messageId, key) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      const room = store.read("rooms").find((entry) => entry.roomId === message?.roomId) ?? null;
      if (message === undefined || !caps.react || !messagePermissions(message, room, userId()).react) return;
      if (message.eventId === null || source.react === undefined) return;
      const existing = message.reactions.find((reaction) => reaction.key === key);
      const reactions = (
        existing === undefined
          ? [...message.reactions, { key, count: 1, mine: true }]
          : existing.mine
            ? existing.count <= 1
              ? message.reactions.filter((reaction) => reaction.key !== key)
              : message.reactions.map((reaction) =>
                  reaction.key === key ? { ...reaction, count: reaction.count - 1, mine: false } : reaction,
                )
            : message.reactions.map((reaction) =>
                reaction.key === key ? { ...reaction, count: reaction.count + 1, mine: true } : reaction,
              )
      ).toSorted((left, right) => right.count - left.count);
      const optimistic: MessageRow = { ...message, reactions };
      patchVisibleRow(store, message.roomId, optimistic);
      const restore = (): void => patchVisibleRow(store, message.roomId, message);
      try {
        void Promise.resolve(source.react(message.roomId, message.eventId, key)).catch(restore);
      } catch {
        restore();
      }
    },
    edit(messageId, body, html) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      const room = store.read("rooms").find((entry) => entry.roomId === message?.roomId) ?? null;
      if (message === undefined || !caps.edit || !messagePermissions(message, room, userId()).edit) return;
      if (message.eventId === null || source.edit === undefined) return;
      const cleanHtml = html === null ? null : sanitizeMessageHtml(html);
      const optimistic: MessageRow = {
        ...message,
        body,
        html: cleanHtml,
        edited: true,
      };
      patchVisibleRow(store, message.roomId, optimistic);
      const restore = (): void => patchVisibleRow(store, message.roomId, message);
      try {
        void Promise.resolve(source.edit?.(message.roomId, message.eventId, body, cleanHtml)).catch(restore);
      } catch {
        restore();
      }
    },
    redact(messageId) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      const room = store.read("rooms").find((entry) => entry.roomId === message?.roomId) ?? null;
      if (message === undefined || !caps.redact || !messagePermissions(message, room, userId()).redact) return;
      if (message.eventId === null || source.redact === undefined) return;
      const optimistic: MessageRow = {
        ...message,
        body: "",
        html: null,
        media: null,
        reactions: [],
        reply: null,
        mentions: [],
        redacted: true,
      };
      patchVisibleRow(store, message.roomId, optimistic);
      const restore = (): void => patchVisibleRow(store, message.roomId, message);
      try {
        void Promise.resolve(source.redact(message.roomId, message.eventId)).catch(restore);
      } catch {
        restore();
      }
    },
    async search(roomIds, query, mediaKinds) {
      if (!caps.search || source.search === undefined) return [];
      return source.search(roomIds, query, mediaKinds);
    },
    forward(messageIds, targetRoomId) {
      if (!caps.forward || messageIds.length === 0) return;
      const target = store.read("rooms").find((entry) => entry.roomId === targetRoomId);
      if (target === undefined) return;
      const wanted = new Set(messageIds);
      const sources = store
        .read("messages")
        .filter((message) => wanted.has(message.id) && !message.redacted && message.eventId !== null)
        .map((message) => ({ roomId: message.roomId, eventId: message.eventId ?? "" }))
        .filter((entry) => entry.eventId !== "");
      if (sources.length > 0) source.forward?.(targetRoomId, sources);
    },
    async sendMedia(roomId, file, kind, caption, html, replyTo) {
      if (!caps.media || source.sendMedia === undefined) return;
      const id = `local-${crypto.randomUUID()}`;
      await source.sendMedia(
        roomId,
        id,
        `txn-${id}`,
        caption,
        html,
        replyTo,
        kind,
        file.name === "" ? kind : file.name,
        file,
      );
    },
    async sendSticker(roomId, packId, shortcode) {
      if (!caps.stickers || source.sendSticker === undefined) return;
      const id = `local-${crypto.randomUUID()}`;
      await source.sendSticker(roomId, id, `txn-${id}`, packId, shortcode);
    },
    media(roomId, messageId, variant) {
      if (!caps.media) return;
      void resolveMedia(roomId, messageId, variant);
    },
    resolveMedia(roomId, messageId, variant) {
      if (!caps.media) return Promise.resolve(null);
      return resolveMedia(roomId, messageId, variant);
    },
    retryMessage(messageId) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      if (message === undefined || message.status !== "failed" || !message.retryable) return;
      void source.retrySend(message.roomId, message.id).catch(() => undefined);
    },
    discardMessage(messageId) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      if (message === undefined || message.eventId !== null) return;
      source.discardSend(message.roomId, message.id);
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
      if (invite === undefined || !caps.answerInvite || !invite.capabilities.accept) return;
      const room = roomFromInvite(invite);
      source.addRoom?.(room);
      store.batch(() => {
        store.write(
          "invites",
          store.read("invites").filter((entry) => entry.roomId !== roomId),
        );
        store.write("roomId", room.roomId);
        store.write("messages", []);
        store.write("windowLoading", true);
        store.write("hasOlder", false);
        store.write("failure", null);
        store.write("typing", []);
        store.write("members", []);
        store.write("membersLoading", true);
      });
      source.answerInvite?.(roomId, true);
      setRootView(true);
      source.open(room.roomId);
      source.members(room.roomId);
    },
    declineInvite(roomId) {
      if (!caps.answerInvite) return;
      store.write(
        "invites",
        store.read("invites").filter((entry) => entry.roomId !== roomId),
      );
      source.answerInvite?.(roomId, false);
    },
    setPref(key, value) {
      const next = { ...store.read("notifications"), [key]: value };
      store.write("notifications", next);
      prefs.saveNotifications(account, next);
      source.saveNotifications?.(next);
    },
    setStickers(enabled) {
      store.write("stickersEnabled", enabled);
      prefs.saveStickers(account, enabled);
    },
    backupSetup() {
      if (!caps.backupSetup || source.backupSetup === undefined) return;
      source.backupSetup();
    },
    resetRecoveryKey() {
      if (!caps.resetRecoveryKey) return;
      source.resetRecoveryKey?.();
    },
    clearRecoveryKey() {
      store.write("recoveryKey", null);
    },
    pat(roomId, target) {
      if (!caps.pat) return Promise.reject(new Error("unsupported"));
      return source.pat?.(roomId, target) ?? Promise.reject(new Error("unsupported"));
    },
    setAvatar(file) {
      if (!caps.setAvatar) return Promise.reject(new Error("unsupported"));
      return source.setAvatar?.(file) ?? Promise.reject(new Error("unsupported"));
    },
    resetIdentity(password) {
      if (!caps.resetIdentity) return;
      source.resetIdentity?.(password);
    },
    startSas(deviceId) {
      if (source.startSas === undefined) return Promise.reject(new Error("unavailable"));
      return source.startSas(deviceId);
    },
    acceptSas(id) {
      if (source.acceptSas === undefined) return Promise.reject(new Error("unavailable"));
      return source.acceptSas(id);
    },
    confirmSas(id) {
      if (source.confirmSas === undefined) return Promise.reject(new Error("unavailable"));
      return source.confirmSas(id);
    },
    mismatchSas(id) {
      if (source.mismatchSas === undefined) return Promise.reject(new Error("unavailable"));
      return source.mismatchSas(id);
    },
    cancelSas(id) {
      if (source.cancelSas === undefined) return Promise.reject(new Error("unavailable"));
      return source.cancelSas(id);
    },
    signOutDevice(deviceId) {
      if (!caps.signOutDevice) return;
      source.signOutDevice?.(deviceId);
    },
    signOutOthers() {
      if (!caps.signOutOthers) return;
      source.signOutOthers?.();
    },
    async logout() {
      await source.logout();
      try {
        await clearDrafts(account);
      } catch {
        // The account is already signed out; a local draft store failure cannot keep it alive.
      }
      prefs.clearAccount(account);
      clearSession();
    },
  };
}

export function wireSources(store: Store, source: ChatSource): () => void {
  const subscriptions = [
    source.on("session", (session) => store.write("session", session)),
    source.on("phase", (phase) => store.write("phase", phase)),
    source.on("connection", (connection) => {
      store.write("connection", connection);
      if (connection === "offline" && store.read("rooms").length === 0) store.write("roomsLoading", false);
    }),
    source.on("rooms", ({ rooms, loading }) => {
      store.batch(() => {
        store.write("rooms", rooms);
        store.write("roomsLoading", loading);
      });
    }),
    source.on("window", ({ roomId, messages, hasOlder, older, patch }) => {
      if (!patch && !older && store.read("roomId") === null) {
        store.write("roomId", roomId);
        source.open(roomId);
      }
      if (roomId !== store.read("roomId")) return;
      store.batch(() => {
        store.write("failure", null);
        if (patch) {
          const current = store.read("messages");
          const next = [...current];
          for (const message of messages.map(cleanRow)) {
            const index = next.findIndex(
              (entry) =>
                entry.id === message.id ||
                (message.transactionId !== null && entry.transactionId === message.transactionId),
            );
            if (index === -1) next.push(message);
            else next[index] = message;
          }
          store.write("messages", next);
        } else if (older) {
          if (messages.length > 0) {
            const current = store.read("messages");
            const existing = new Set(
              current.flatMap((message) =>
                message.transactionId === null ? [message.id] : [message.id, message.transactionId],
              ),
            );
            const olderRows = messages
              .map(cleanRow)
              .filter(
                (message) =>
                  !existing.has(message.id) && (message.transactionId === null || !existing.has(message.transactionId)),
              );
            if (olderRows.length > 0) store.write("messages", [...olderRows, ...current]);
          }
        } else {
          store.write("messages", messages.map(cleanRow));
        }
        store.write("hasOlder", hasOlder);
        if (!patch) {
          store.write("olderLoading", false);
          store.write("windowLoading", false);
        }
      });
    }),
    source.on("devices", ({ devices, error }) =>
      store.batch(() => {
        if (devices !== null) store.write("devices", devices);
        store.write("devicesError", error);
      }),
    ),
    source.on("backup", (backup) =>
      store.batch(() => {
        store.write("backupReady", backup.enabled && backup.trusted);
        store.write("backupError", backup.error);
      }),
    ),
    source.on("invites", (invites) => store.write("invites", invites)),
    source.on("members", ({ roomId, members }) => {
      if (roomId !== store.read("roomId")) return;
      store.batch(() => {
        store.write("members", members);
        store.write("membersLoading", false);
        store.write("failure", null);
      });
    }),
    source.on("failure", ({ command }) => {
      store.batch(() => {
        store.write("failure", command);
        if (command === "open") {
          store.write("windowLoading", false);
        } else if (command === "older") {
          store.write("olderLoading", false);
        } else {
          store.write("membersLoading", false);
        }
      });
    }),
    source.on("typing", ({ roomId, userIds }) => {
      if (roomId !== store.read("roomId")) return;
      store.write("typing", userIds);
    }),
    source.on("recoveryKey", (recoveryKey) => store.write("recoveryKey", recoveryKey)),
    source.on("sas", (sas) => store.write("sas", sas)),
    source.on("media", ({ roomId, messageId, url }) => patchMediaUrl(store, roomId, messageId, url)),
    source.on("outbox", ({ roomId, messageId, row }) => {
      if (roomId !== store.read("roomId")) return;
      if (row === null) {
        store.write(
          "messages",
          store.read("messages").filter((message) => message.id !== messageId && message.transactionId !== messageId),
        );
        return;
      }
      const clean = cleanRow(row);
      const current = store.read("messages");
      const index = current.findIndex(
        (message) =>
          message.id === clean.id ||
          message.id === messageId ||
          (clean.transactionId !== null && message.transactionId === clean.transactionId),
      );
      store.write(
        "messages",
        index === -1 ? [...current, clean] : current.map((message, position) => (position === index ? clean : message)),
      );
    }),
  ];
  return () => {
    for (const unsubscribe of subscriptions) unsubscribe();
  };
}
