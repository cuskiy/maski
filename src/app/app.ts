import type { DeviceEntry, Draft, KeyStatus, Mark, Message, RoomSummary, Session } from "../core/types.ts";
import { WorkerClient } from "../client/worker-client.ts";
import { LocalDb } from "../store/db.ts";
import { activeRoom, roomPreview } from "../store/select.ts";
import { EMPTY_DRAFT, setState, state, touch } from "../store/state.ts";
import { MediaCache } from "../ui/media.ts";
import { Shell } from "../ui/shell.ts";
import { copyText, toast } from "../ui/overlay.ts";
import { closeDialog, showDialog } from "../ui/dialogs.ts";
import { authScreen, gateScreen } from "../ui/screens.ts";
import type { UiContext } from "../ui/context.ts";
import { localeFromPath, setLocale, t } from "../i18n/index.ts";
import type { RoomWindow } from "../protocol/messages.ts";
import { config } from "./config.ts";
import type { Event as WorkerEvent } from "../protocol/messages.ts";

const MAX_WINDOW = 80;

export class App implements UiContext {
  readonly local = new LocalDb();
  readonly worker = new WorkerClient();
  readonly media: MediaCache;
  private readonly root: HTMLElement;
  private readonly shell: Shell;
  private draftState: Draft = EMPTY_DRAFT;
  private typingTimer = 0;
  private typingSent = false;
  private lastRead = "";
  private dialogPushed = false;
  private activating: Promise<void> | null = null;
  private draftTimer = 0;
  private loadingRoom: string | null = null;
  private seen = new Map<string, number>();
  private started = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.media = new MediaCache(this.local, this.worker);
    this.shell = new Shell(this);
  }

  async boot(): Promise<void> {
    const settings = await this.local.settings();
    const locale = settings.locale ?? localeFromPath(location.pathname);
    setLocale(locale);
    setState({ settings, locale });
    this.worker.start();
    this.worker.onEvent((event) => void this.onWorkerEvent(event));
    this.listen();

    const last = settings.lastAccount;
    if (last) {
      try {
        await this.local.openAccount(last.hash);
        const rooms = await this.local.rooms();
        this.remember(rooms);
        setState({
          rooms: new Map(rooms.map((room) => [room.roomId, room])),
          session: { userId: last.userId, deviceId: "", displayName: last.name, avatar: last.avatar, baseUrl: last.baseUrl, accountHash: last.hash },
          phase: settings.keysReady ? "ready" : "gate",
        });
        this.mount();
      } catch {
        await this.local.saveSettings({ lastAccount: null });
      }
    }

    try {
      const result = await this.worker.send<{ session: Session | null }>({ type: "start", accountHash: last?.hash ?? null });
      if (!result.session) {
        setState({ phase: "auth" });
        this.mount();
        return;
      }
      if (state.phase === "boot") await this.applySession(result.session, settings.keysReady);
    } catch (error) {
      setState({ phase: "auth", notice: error instanceof Error ? error.message : "" });
      this.mount();
    }
  }

  private listen(): void {
    window.addEventListener("popstate", () => this.applyRoute());
    window.addEventListener("hashchange", () => this.applyRoute());
    window.addEventListener("offline", () => setState({ connection: "offline" }));
    window.addEventListener("online", () => void this.worker.send({ type: "retrySync" }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.markRead();
    });
  }

  private async applySession(session: Session, keysReady: boolean): Promise<void> {
    if (this.activating) return this.activating;
    this.activating = this.activate(session, keysReady).finally(() => {
      this.activating = null;
    });
    return this.activating;
  }

  private async activate(session: Session, keysReady: boolean): Promise<void> {
    if (state.session?.accountHash === session.accountHash && state.phase === "ready") return;
    await this.local.openAccount(session.accountHash);
    const rooms = await this.local.rooms();
    this.remember(rooms);
    setState({ session, rooms: new Map(rooms.map((room) => [room.roomId, room])), phase: keysReady ? "ready" : "gate" });
    await this.local.saveSettings({
      keysReady,
      lastAccount: {
        hash: session.accountHash,
        userId: session.userId,
        name: session.displayName,
        avatar: session.avatar,
        baseUrl: session.baseUrl,
      },
    });
    this.mount();
    void this.settleKeys();
  }

  private async settleKeys(): Promise<void> {
    const session = state.session;
    if (!session) return;
    let status: KeyStatus;
    try {
      status = await this.worker.send<KeyStatus>({ type: "keyStatus" });
    } catch {
      return;
    }
    if (state.session?.accountHash !== session.accountHash) return;
    setState({ keys: status });
    await this.local.saveSettings({ keysReady: status.ready });
    if (status.ready === (state.phase === "ready")) return;
    setState({ phase: status.ready ? "ready" : "gate" });
    this.mount();
  }

  async loadDevices(): Promise<void> {
    try {
      const result = await this.worker.send<{ devices: DeviceEntry[] }>({ type: "devices" });
      setState({ devices: result.devices });
    } catch {
      setState({ devices: [] });
    }
  }

  async enter(): Promise<void> {
    const session = state.session;
    if (!session) return;
    setState({ phase: "boot" });
    await this.local.saveSettings({ keysReady: true });
    await this.applySession(session, true);
  }

  private remember(rooms: RoomSummary[]): void {
    for (const room of rooms) this.seen.set(room.roomId, room.lastTs);
  }

  private mount(): void {
    if (state.phase === "boot") return;
    this.root.replaceChildren();
    if (state.phase === "auth") {
      this.root.append(authScreen(this));
      return;
    }
    if (state.phase === "gate") {
      this.root.append(gateScreen(this));
      return;
    }
    this.root.append(this.shell.root);
    this.started = true;
    this.shell.render();
    this.applyRoute();
    void this.reloadPacks();
  }

  private async onWorkerEvent(event: WorkerEvent): Promise<void> {
    switch (event.event) {
      case "ready":
        if (event.session) await this.applySession(event.session, false);
        else {
          setState({ phase: "auth" });
          this.mount();
        }
        return;
      case "session":
        if (!event.session) {
          this.local.forgetAccount();
          setState({ phase: "auth", session: null, rooms: new Map() });
          this.mount();
        } else {
          setState({ session: event.session });
          if (this.started) this.shell.render();
        }
        return;
      case "connection":
        setState({ connection: event.connection, notice: event.message });
        this.setTitle();
        if (this.started) this.shell.render();
        return;
      case "sync":
        await this.resync(event.rooms, event.removed, event.active);
        return;
      case "outbox":
        this.applyOutbox(event.txnId, event.status);
        return;
      case "keys":
        setState({ keys: event.status });
        return;
      case "verify":
        setState({ verify: event.update });
        if (event.update.state === "requested") {
          this.toast(t("profile.verifyRequest"));
          if (!state.dialog) this.openDialog("settings");
        }
        return;
      case "typing":
        if (event.roomId === state.activeRoomId) {
          setState({ typing: event.users.filter((user) => user.userId !== state.session?.userId) });
          if (this.started) this.shell.render();
        }
        return;
      case "fatal":
        setState({ notice: event.message, connection: "error" });
        toast(event.message);
        if (state.phase === "auth") this.mount();
        return;
      default:
        return;
    }
  }

  private setTitle(): void {
    const unread = [...state.rooms.values()].reduce((total, room) => total + (room.muted ? 0 : room.unread), 0);
    document.title = unread > 0 ? `(${unread}) ${config.app.name}` : config.app.name;
  }

  private async resync(rooms: string[], removed: string[], active: string | null): Promise<void> {
    for (const roomId of removed) {
      state.rooms.delete(roomId);
      this.seen.delete(roomId);
    }
    if (state.activeRoomId && removed.includes(state.activeRoomId)) {
      this.route(null, null, true);
      setState({ activeRoomId: null, messages: [], typing: [] });
    }
    for (const roomId of rooms) {
      const room = await this.local.room(roomId);
      if (room) state.rooms.set(roomId, room);
      else state.rooms.delete(roomId);
    }
    if (active && active === state.activeRoomId) {
      state.messages = await this.local.window(active, Math.max(MAX_WINDOW, state.messages.length));
      this.markRead();
    }
    touch();
    this.setTitle();
    this.notify(rooms);
  }

  private notify(rooms: string[]): void {
    for (const roomId of rooms) {
      const room = state.rooms.get(roomId);
      if (!room) continue;
      const previous = this.seen.get(roomId) ?? room.lastTs;
      this.seen.set(roomId, room.lastTs);
      if (!state.settings.desktop || room.lastTs <= previous || roomId === state.activeRoomId) continue;
      if (document.visibilityState === "visible" || room.muted || room.membership !== "join") continue;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") continue;
      const notification = new Notification(room.name, {
        body: state.settings.preview ? roomPreview(room) : t("room.encryptedPreview"),
        tag: roomId,
      });
      notification.onclick = () => {
        window.focus();
        this.openRoom(roomId);
        notification.close();
      };
    }
  }

  private applyOutbox(txnId: string, status: "sent" | "queued" | "sending" | "failed"): void {
    if (status === "sent") return;
    const message = state.messages.find((entry) => entry.id === txnId);
    if (!message) return;
    message.status = status;
    touch();
  }

  private markRead(): void {
    const room = activeRoom();
    const last = state.messages.findLast((message) => message.status === "sent" && message.id.startsWith("$"));
    if (!room || !last || this.lastRead === last.id) return;
    if (document.visibilityState !== "visible") return;
    this.lastRead = last.id;
    void this.worker.send({ type: "markRead", roomId: room.roomId, eventId: last.id });
  }

  private async reloadPacks(): Promise<void> {
    try {
      this.shell.picker.load(await this.local.packs());
    } catch {
      this.shell.picker.load([]);
    }
  }

  private get routeRoom(): string | null {
    const match = /^#\/room\/([^?]+)/.exec(location.hash);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }

  private get routeDialog(): string | null {
    const index = location.hash.indexOf("?");
    if (index < 0) return null;
    return new URLSearchParams(location.hash.slice(index + 1)).get("d");
  }

  private route(roomId: string | null, dialog: string | null, replace = false): void {
    const path = roomId ? `#/room/${encodeURIComponent(roomId)}` : "#/";
    const url = `${location.pathname}${path}${dialog ? `?d=${dialog}` : ""}`;
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  }

  private applyRoute(): void {
    if (state.phase !== "ready") return;
    const roomId = this.routeRoom;
    if (roomId && roomId !== state.activeRoomId) void this.loadRoom(roomId, false);
    if (!roomId && state.activeRoomId) setState({ activeRoomId: null, messages: [], typing: [] });
    const dialog = this.routeDialog;
    if (dialog && dialog !== state.dialog) {
      showDialog(this, dialog);
    } else if (!dialog && state.dialog) {
      closeDialog();
      setState({ dialog: null });
    }
    this.shell.render();
  }

  openRoom(roomId: string, revealId?: string): void {
    if (!roomId) {
      this.route(null, null);
      setState({ activeRoomId: null, messages: [], typing: [] });
      this.shell.render();
      return;
    }
    void this.loadRoom(roomId, true).then(() => {
      if (!revealId) return;
      requestAnimationFrame(() => requestAnimationFrame(() => this.shell.timeline.reveal(revealId)));
    });
  }

  private async loadRoom(roomId: string, updateRoute: boolean): Promise<void> {
    if (this.loadingRoom === roomId) return;
    this.loadingRoom = roomId;
    try {
      if (updateRoute) this.route(roomId, null);
      const draft = (await this.local.draft(state.session?.accountHash ?? "", roomId)) ?? EMPTY_DRAFT;
      this.draftState = draft;
      setState({ activeRoomId: roomId, messages: [], draft });
      const window = await this.worker.send<RoomWindow>({ type: "openRoom", roomId });
      if (window.room) state.rooms.set(roomId, window.room);
      setState({ messages: window.messages, hasOlder: window.hasOlder });
      this.shell.composer.load(draft, activeRoom());
      this.shell.render();
      requestAnimationFrame(() => this.shell.timeline.scrollToBottom());
      this.markRead();
      this.shell.composer.focus();
    } finally {
      this.loadingRoom = null;
    }
  }

  openDialog(name: string, roomId?: string): void {
    this.route(state.activeRoomId, name);
    this.dialogPushed = true;
    showDialog(this, name, roomId);
  }

  closeDialog(): void {
    if (this.dialogPushed) {
      // The entry belongs to the dialog, so going back is what removes it.
      this.dialogPushed = false;
      history.back();
      return;
    }
    closeDialog();
    setState({ dialog: null });
    this.route(state.activeRoomId, null, true);
  }

  setDraft(patch: Partial<Draft>): void {
    this.draftState = { ...this.draftState, ...patch };
    const room = activeRoom();
    if (!room) return;
    const draft = this.draftState;
    window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => void this.local.saveDraft(state.session?.accountHash ?? "", room.roomId, draft), 250);
  }

  draft(): Draft {
    return this.draftState;
  }

  draftMarks(): Mark[] {
    return this.draftState.marks;
  }

  private pending(room: RoomSummary, kind: Message["kind"], body: string, extra: Partial<Message>): Message {
    return {
      id: `t${Date.now()}${Math.random().toString(16).slice(2, 8)}`,
      roomId: room.roomId,
      sender: state.session?.userId ?? "",
      name: state.session?.displayName ?? "",
      avatar: state.session?.avatar ?? null,
      ts: Date.now(),
      kind,
      body,
      html: null,
      media: null,
      reply: null,
      mentions: [],
      edited: false,
      reactions: [],
      status: "queued",
      error: null,
      encrypted: room.encrypted,
      search: [],
      ...extra,
    };
  }

  private async queue(message: Message): Promise<void> {
    await this.local.putMessage(message);
    if (message.roomId === state.activeRoomId) {
      state.messages = [...state.messages, message].toSorted((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
      this.shell.render();
    }
  }

  startReply(message: Message): void {
    this.setDraft({ reply: { id: message.id, name: message.name, body: message.body }, edit: null });
    this.shell.composer.updateBanner();
    this.shell.composer.focus();
  }

  startEdit(message: Message): void {
    this.setDraft({ edit: { id: message.id, body: message.body }, reply: null, text: message.body });
    this.shell.composer.load(this.draftState, activeRoom());
    this.shell.composer.focus();
  }

  async submitText(body: string, html: string | null, replyTo: string | null): Promise<void> {
    const room = activeRoom();
    if (!room) return;
    const reply = replyTo ? (this.draftState.reply ?? null) : null;
    const message = this.pending(room, "text", body, { html, reply });
    await this.queue(message);
    void this.worker
      .send({ type: "text", roomId: room.roomId, txnId: message.id, body, html, replyTo })
      .catch((error: unknown) => this.failSend(message, error));
  }

  async submitEdit(eventId: string, body: string, html: string | null): Promise<void> {
    const room = activeRoom();
    if (!room) return;
    await this.worker.send({ type: "edit", roomId: room.roomId, eventId, body, html });
  }

  async submitFile(file: File): Promise<void> {
    const room = activeRoom();
    if (!room) return;
    const message = this.pending(room, kindOf(file.type), file.name, {});
    await this.queue(message);
    const data = await file.arrayBuffer();
    void this.worker
      .send({ type: "sendFile", roomId: room.roomId, txnId: message.id, name: file.name, mime: file.type || "application/octet-stream", data })
      .catch((error: unknown) => this.failSend(message, error));
  }

  sendSticker(url: string, body: string): void {
    const room = activeRoom();
    if (!room) return;
    const message = this.pending(room, "sticker", body, {
      media: { mxc: url, mime: "image/png", size: 0, width: null, height: null, duration: null, name: body, file: null },
    });
    void this.queue(message);
    void this.worker.send({ type: "sticker", roomId: room.roomId, txnId: message.id, body, url, replyTo: null }).catch((error: unknown) => this.failSend(message, error));
  }

  private failSend(message: Message, error: unknown): void {
    message.status = "failed";
    message.error = error instanceof Error ? error.message : null;
    touch();
    this.toast(message.error ?? t("error.unknown"));
  }

  react(message: Message, key: string): void {
    const mine = message.reactions.find((reaction) => reaction.key === key)?.me ?? false;
    void this.worker.send({ type: "react", roomId: message.roomId, eventId: message.id, key, on: !mine });
  }

  redact(message: Message): void {
    void this.worker.send({ type: "redact", roomId: message.roomId, eventId: message.id });
    setState({ messages: state.messages.filter((entry) => entry.id !== message.id) });
    this.shell.render();
  }

  retry(message: Message): void {
    message.status = "queued";
    touch();
    void this.worker.send({ type: "retry", txnId: message.id });
  }

  removePending(message: Message): void {
    void this.local.deleteMessage(message.id);
    void this.worker.send({ type: "cancel", txnId: message.id });
    setState({ messages: state.messages.filter((entry) => entry.id !== message.id) });
    this.shell.render();
  }

  profile(userId: string): void {
    this.openDialog("profile", userId);
  }

  copy(text: string, done: string): void {
    void copyText(text, done);
  }

  toast(message: string): void {
    toast(message);
  }

  typing(on: boolean): void {
    const room = activeRoom();
    if (!room) return;
    if (on === this.typingSent) return;
    this.typingSent = on;
    void this.worker.send({ type: "typing", roomId: room.roomId, on });
    window.clearTimeout(this.typingTimer);
    if (on) this.typingTimer = window.setTimeout(() => this.typing(false), 20000);
  }

  togglePicker(mode: "emoji" | "sticker"): void {
    this.shell.picker.toggle(mode);
  }

  reactPicker(message: Message): void {
    this.shell.picker.openReact((key) => this.react(message, key));
  }

  reveal(eventId: string): void {
    this.shell.timeline.reveal(eventId);
  }

  activeRoom(): RoomSummary | null {
    return activeRoom();
  }
}

function kindOf(mime: string): Message["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}
