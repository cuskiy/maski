import type { ChatSource } from "./source.ts";
import { sanitizeMessageHtml } from "./sanitize.ts";
import type { Catalog } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import type {
  Media,
  MessageKind,
  MessageRow,
  NotificationPrefs,
  ReplyRef,
  RoomSummary,
  SectionId,
} from "../core/types.ts";
import { REGION } from "../core/regions.ts";
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
  appendRows(rows: readonly MessageRow[]): void;
  createRow(body: string, options?: MessageOptions): MessageRow;
  toggleSection(id: SectionId, open: boolean): void;
  toggleSpace(roomId: string): void;
  toggleFavorite(roomId: string): void;
  toggleMute(roomId: string): void;
  leaveRoom(roomId: string): void;
  addRoom(name: string, topic: string, direct: boolean): void;
  setNotification(roomId: string, mode: RoomSummary["notification"]): void;
  react(messageId: string, key: string): void;
  edit(messageId: string, body: string, html: string | null): void;
  redact(messageId: string): void;
  setMessageStatus(messageId: string, status: MessageRow["status"], error?: string | null): void;
  discardMessage(messageId: string): void;
  acceptInvite(roomId: string): void;
  declineInvite(roomId: string): void;
  setPref(key: keyof NotificationPrefs, value: boolean): void;
  revealRecoveryKey(): void;
  verifyDevice(deviceId: string): void;
  signOutDevice(deviceId: string): void;
  signOutOthers(): void;
  logout(): void;
}

interface Context {
  readonly store: Store;
  readonly source: ChatSource;
  readonly c: Catalog;
  readonly account: string;
}

function setRootRoom(open: boolean): void {
  document.querySelector(".app")?.setAttribute("data-room", open ? "true" : "false");
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

  function markRead(roomId: string): void {
    updateRoom(roomId, { unread: 0, highlight: 0 });
    source.markRead(roomId);
  }

  return {
    selectRoom(roomId) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined) return;
      store.batch(() => {
        store.write("roomId", roomId);
        store.write("messages", []);
        store.write("hasOlder", false);
        store.write("typing", []);
      });
      setRootRoom(true);
      source.open(roomId);
    },
    back() {
      store.batch(() => {
        store.write("roomId", null);
        store.write("messages", []);
        store.write("hasOlder", false);
      });
      setRootRoom(false);
    },
    markRead,
    loadOlder() {
      const roomId = store.read("roomId");
      if (roomId !== null) source.older(roomId);
    },
    appendRows(rawRows) {
      if (rawRows.length === 0) return;
      const rows = rawRows.map(cleanRow);
      const roomId = store.read("roomId");
      if (roomId === null) return;
      const last = rows[rows.length - 1];
      if (last === undefined) return;
      const preview = {
        kind: last.status === "failed" ? ("error" as const) : last.kind,
        body: last.body === "" ? (last.media?.name ?? "") : last.body,
      };
      store.batch(() => {
        store.write("messages", [...store.read("messages"), ...rows]);
        updateRoom(roomId, { preview, lastTs: last.ts, unread: 0, highlight: 0 });
      });
      for (const row of rows) source.send(roomId, row);
    },
    createRow(body, options = {}) {
      const session = store.read("session");
      return {
        id: `local-${crypto.randomUUID()}`,
        roomId: store.read("roomId") ?? "",
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
        edited: false,
        status: options.status ?? "sent",
        error: options.error ?? null,
        system: false,
        encryption: { state: "ok" },
        capabilities: {
          reply: true,
          react: true,
          edit: true,
          redact: true,
          copy: body !== "",
          copyLink: true,
        },
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
      if (room === undefined || !room.capabilities.favorite) return;
      updateRoom(roomId, { favorite: !room.favorite });
    },
    toggleMute(roomId) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !room.capabilities.mute) return;
      const muted = !room.muted;
      const notification = room.notification === "mute" ? (muted ? "mute" : "all") : room.notification;
      updateRoom(roomId, { muted, notification });
      source.setNotification(roomId, muted ? "mute" : notification);
    },
    leaveRoom(roomId) {
      const room = store.read("rooms").find((entry) => entry.roomId === roomId);
      if (room === undefined || !room.capabilities.leave) return;
      const removed = new Set([roomId]);
      if (room.isSpace) {
        for (const entry of store.read("rooms")) if (entry.spaceId === roomId) removed.add(entry.roomId);
      }
      const rooms = store.read("rooms").filter((entry) => !removed.has(entry.roomId));
      const wasActive = store.read("roomId") !== null && removed.has(store.read("roomId") ?? "");
      store.batch(() => {
        store.write("rooms", rooms);
        if (wasActive) {
          store.write("roomId", null);
          store.write("messages", []);
        }
      });
      if (wasActive) setRootRoom(false);
    },
    addRoom(name, topic, direct) {
      const roomId = `local-${crypto.randomUUID()}`;
      const room: RoomSummary = {
        roomId,
        name,
        topic,
        avatar: null,
        preview: null,
        lastTs: Date.now(),
        unread: 0,
        highlight: 0,
        muted: false,
        membership: "join",
        isDirect: direct,
        isSpace: false,
        favorite: false,
        spaceId: null,
        notification: "all",
        encryption: "encrypted",
        capabilities: {
          invite: true,
          manage: true,
          notifications: true,
          leave: true,
          markRead: true,
          favorite: true,
          mute: true,
        },
      };
      store.write("rooms", [...store.read("rooms"), room]);
      store.write("roomId", roomId);
      store.write("messages", []);
      setRootRoom(true);
      source.open(roomId);
    },
    setNotification(roomId, mode) {
      updateRoom(roomId, { notification: mode, muted: mode === "mute" });
      source.setNotification(roomId, mode);
    },
    react(messageId, key) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      if (message === undefined || !message.capabilities.react) return;
      const reactions = [];
      let found = false;
      for (const reaction of message.reactions) {
        if (reaction.key !== key) {
          reactions.push(reaction);
          continue;
        }
        found = true;
        if (reaction.mine) {
          if (reaction.count > 1) reactions.push({ ...reaction, count: reaction.count - 1, mine: false });
        } else {
          reactions.push({ ...reaction, count: reaction.count + 1, mine: true });
        }
      }
      if (!found) reactions.push({ key, count: 1, mine: true });
      const updated = { ...message, reactions };
      store.write(
        "messages",
        store.read("messages").map((entry) => (entry.id === messageId ? updated : entry)),
      );
      source.react(message.roomId, messageId, key);
    },
    edit(messageId, body, html) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      if (message === undefined || !message.capabilities.edit) return;
      const cleanHtml = html === null ? null : sanitizeMessageHtml(html);
      const updated = { ...message, body, html: cleanHtml, edited: true, status: "sent" as const, error: null };
      store.write(
        "messages",
        store.read("messages").map((entry) => (entry.id === messageId ? updated : entry)),
      );
      source.edit(message.roomId, messageId, body, cleanHtml);
    },
    redact(messageId) {
      const message = store.read("messages").find((entry) => entry.id === messageId);
      if (message === undefined || !message.capabilities.redact) return;
      store.write(
        "messages",
        store.read("messages").filter((entry) => entry.id !== messageId),
      );
      source.redact(message.roomId, messageId);
    },
    setMessageStatus(messageId, status, error = null) {
      store.write(
        "messages",
        store
          .read("messages")
          .map((message) => (message.id === messageId ? Object.assign({}, message, { status, error }) : message)),
      );
    },
    discardMessage(messageId) {
      store.write(
        "messages",
        store.read("messages").filter((message) => message.id !== messageId),
      );
    },
    acceptInvite(roomId) {
      const invite = store.read("invites").find((entry) => entry.roomId === roomId);
      if (invite === undefined || !invite.capabilities.accept) return;
      const room: RoomSummary = {
        roomId: invite.roomId,
        name: invite.name,
        topic: invite.topic,
        avatar: null,
        preview: null,
        lastTs: Date.now(),
        unread: 0,
        highlight: 0,
        muted: false,
        membership: "join",
        isDirect: false,
        isSpace: false,
        favorite: false,
        spaceId: null,
        notification: "all",
        encryption: "encrypted",
        capabilities: {
          invite: true,
          manage: false,
          notifications: true,
          leave: true,
          markRead: true,
          favorite: true,
          mute: true,
        },
      };
      store.batch(() => {
        store.write(
          "invites",
          store.read("invites").filter((entry) => entry.roomId !== roomId),
        );
        store.write("rooms", [...store.read("rooms"), room]);
      });
      source.answerInvite(roomId, true);
      store.write("roomId", room.roomId);
      setRootRoom(true);
      source.open(room.roomId);
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
    revealRecoveryKey() {
      source.revealRecoveryKey();
    },
    verifyDevice(deviceId) {
      source.verifyDevice(deviceId);
    },
    signOutDevice(deviceId) {
      source.signOutDevice(deviceId);
    },
    signOutOthers() {
      source.signOutOthers();
    },
    logout() {
      clearSession();
      location.assign("/");
    },
  };
}

export function wireSources(store: Store, source: ChatSource): () => void {
  const subscriptions = [
    source.on("session", (session) => store.write("session", session)),
    source.on("phase", (phase) => store.write("phase", phase)),
    source.on("connection", (connection) => store.write("connection", connection)),
    source.on("rooms", ({ rooms, loading }) => {
      store.batch(() => {
        store.write("rooms", rooms);
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
      });
    }),
    source.on("devices", (devices) => store.write("devices", devices)),
    source.on("invites", (invites) => store.write("invites", invites)),
    source.on("members", (members) => store.write("members", members)),
    source.on("recoveryKey", (recoveryKey) => store.write("recoveryKey", recoveryKey)),
    source.on("outbox", ({ roomId, messageId, status, error }) => {
      if (roomId !== store.read("roomId")) return;
      store.write(
        "messages",
        store
          .read("messages")
          .map((message) => (message.id === messageId ? Object.assign({}, message, { status, error }) : message)),
      );
    }),
  ];
  return () => {
    for (const unsubscribe of subscriptions) unsubscribe();
  };
}

export function roomRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>(`[data-region="${REGION.content}"]`);
  if (region === null) throw new Error("the chat content region is missing");
  return region;
}
