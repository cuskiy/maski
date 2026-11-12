import type { Draft, Mark, Message, RoomSummary, SectionId } from "../core/types.ts";
import { WorkerClient } from "../client/worker-client.ts";
import { LocalDb } from "../store/db.ts";
import { activeRoom } from "../store/select.ts";
import { EMPTY_DRAFT, setState, state, touch } from "../store/state.ts";
import { MediaCache } from "../ui/media.ts";
import { Shell } from "../ui/shell.ts";
import { copyText, toast } from "../ui/overlay.ts";
import { closeDialog, showDialog } from "../ui/dialogs.ts";
import { authScreen, gateScreen } from "../ui/screens.ts";
import type { UiContext } from "../ui/context.ts";
import { getLocale, setLocale, t } from "../i18n/index.ts";
import type { Event, RoomWindow } from "../protocol/messages.ts";


export class App implements UiContext {
  readonly local = new LocalDb();
  readonly worker = new WorkerClient();
  readonly media: MediaCache;
  private shell: Shell;
  private draftState: Draft = EMPTY_DRAFT;
  private typingTimer = 0;
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.media = new MediaCache(this.local, this.worker);
    this.shell = new Shell(this);
  }

  async boot(): Promise<void> {
    const settings = await this.local.settings();
    const locale = settings.locale ?? (location.pathname.startsWith("/zh-CN/") ? "zh-CN" : "en");
    setLocale(locale);
    setState({ settings, locale });
    this.worker.start();
    this.worker.onEvent((event) => this.onWorkerEvent(event));
    window.addEventListener("popstate", () => this.applyRoute());
    window.addEventListener("hashchange", () => this.applyRoute());
    window.addEventListener("offline", () => setState({ connection: "offline" }));
    window.addEventListener("online", () => {
      void this.worker.send({ type: "retrySync" });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.markReadSoon();
    });

    const last = settings.lastAccount;
    if (last) {
      try {
        await this.local.openAccount(last.hash);
        const rooms = await this.local.rooms();
        setState({
          rooms: new Map(rooms.map((room) => [room.roomId, room])),
          session: {
            userId: last.userId,
            deviceId: "",
            displayName: last.name,
            avatar: last.avatar,
            baseUrl: last.baseUrl,
            accountHash: last.hash,
          },
          phase: settings.keysReady ? "ready" : "gate",
        });
        this.mount();
      } catch {
        await this.local.saveSettings({ lastAccount: null });
      }
    }

    try {
      const result = await this.worker.send<{ session: { accountHash: string } | null }>({
        type: "start",
        accountHash: last?.hash ?? null,
      });
      if (!result.session) {
        setState({ phase: "auth" });
        this.mount();
        return;
      }
      this.local.closeAccount();
      await this.local.openAccount(result.session.accountHash);
      const rooms = await this.local.rooms();
      setState({ rooms: new Map(rooms.map((room) => [room.roomId, room])), phase: settings.keysReady ? "ready" : "gate" });
      const status = await this.worker.send<{ ready: boolean }>({ type: "keyStatus" });
      setState({ keys: { ready: status.ready, backup: false, hasOtherDevices: false }, phase: status.ready ? "ready" : "gate" });
      await this.local.saveSettings({ keysReady: status.ready });
      this.mount();
      this.applyRoute();
    } catch (error) {
      setState({ phase: "auth", notice: error instanceof Error ? error.message : "" });
      this.mount();
    }
  }

  private get routeRoom(): string | null {
    const match = /^#\/room\/([^?]+)/.exec(location.hash);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }

  private get routeDialog(): string | null {
    const query = location.hash.includes("?") ? location.hash.slice(location.hash.indexOf("?") + 1) : "";
    return new URLSearchParams(query).get("d");
  }

  async enter(): Promise<void> {
    const session = state.session;
    if (!session) return;
    this.local.closeAccount();
    await this.local.openAccount(session.accountHash);
    const rooms = await this.local.rooms();
    setState({ rooms: new Map(rooms.map((room) => [room.roomId, room])), phase: "ready" });
    await this.local.saveSettings({ keysReady: true });
    this.mount();
    this.applyRoute();
  }

  private mount(): void {
    this.root.replaceChildren();
    if (state.phase === "auth") {
      this.root.appendChild(authScreen(this));
      return;
    }
    if (state.phase === "gate") {
      this.root.appendChild(gateScreen(this));
      return;
    }
    if (state.phase === "boot") {
      this.root.appendChild(document.createElement("div"));
      return;
    }
    this.root.appendChild(this.shell.root);
    touch();
    this.applyRoute();
    void this.refreshPacks();
  }

  private applyRoute(): void {
    if (state.phase !== "ready") return;
    const roomId = this.routeRoom;
    if (roomId && roomId !== state.activeRoomId) void this.loadRoom(roomId, false);
    if (!roomId && state.activeRoomId) {
      setState({ activeRoomId: null, messages: [], typing: [] });
    }
    const dialog = this.routeDialog;
    if (dialog !== state.dialog) {
      if (dialog) showDialog(this, dialog);
      else closeDialog();
    }
    this.shell.render();
  }

  private route(roomId: string | null, dialog: string | null, replace = false): void {
    const base = location.pathname;
    const path = roomId ? `#/room/${encodeURIComponent(roomId)}` : "#/";
    const query = dialog ? `?d=${dialog}` : "";
    const url = `${base}${path}${query}`;
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  }

  private async onWorkerEvent(event: Event): Promise<void> {
    switch (event.event) {
      case "ready": {
        if (!event.session) {
          setState({ phase: "auth" });
          this.mount();
          return;
        }
        setState({ session: event.session });
        const status = await this.worker.send<{ ready: boolean; backup: boolean; hasOtherDevices: boolean }>({ type: "keyStatus" });
        setState({
          keys: status,
          phase: status.ready ? "ready" : "gate",
          settings: {
            ...state.settings,
            lastAccount: {
              hash: event.session.accountHash,
              userId: event.session.userId,
              name: event.session.displayName,
              avatar: event.session.avatar,
              baseUrl: event.session.baseUrl,
            },
          },
        });
        await this.local.saveSettings({ lastAccount: state.settings.lastAccount, keysReady: status.ready });
        if (state.phase === "ready") {
          this.local.closeAccount();
          await this.local.openAccount(event.session.accountHash);
          const rooms = await this.local.rooms();
          setState({ rooms: new Map(rooms.map((room) => [room.roomId, room])), phase: "ready" });
          this.mount();
        } else {
          this.mount();
        }
        return;
      }
      case "session":
        if (!event.session) {
          setState({ phase: "auth", session: null, rooms: new Map() });
          await this.local.saveSettings({ lastAccount: null, keysReady: false });
          this.mount();
        }
        return;
      case "connection":
        setState({ connection: event.connection, notice: event.message });
        this.shell.render();
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
      case "fatal":
        setState({ notice: event.message, connection: "error" });
        this.shell.render();
        return;
      default:
        return;
    }
  }

  private async resync(rooms: string[], removed: string[], active: string | null): Promise<void> {
    for (const roomId of removed) state.rooms.delete(roomId);
    for (const roomId of rooms) {
      const room = await this.local.room(roomId);
      if (room) state.rooms.set(roomId, room);
      else state.rooms.delete(roomId);
    }
    if (active && active === state.activeRoomId) {
      const before = state.messages.length;
      state.messages = await this.local.window(active, 80);
      if (state.messages.length > before && document.visibilityState === "visible") this.markReadSoon();
    }
    touch();
    this.detectNotifications(rooms);
  }

  private lastSeen = new Map<string, number>();

  private detectNotifications(rooms: string[]): void {
    const enabled = state.settings.desktop;
    for (const roomId of rooms) {
      const room = state.rooms.get(roomId);
      if (!room) continue;
      const previous = this.lastSeen.get(roomId) ?? 0;
      this.lastSeen.set(roomId, room.lastTs);
      if (!enabled || document.visibilityState === "visible" || room.muted || room.membership !== "join") continue;
      if (room.lastTs <= previous || roomId === state.activeRoomId) continue;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") continue;
      const body = state.settings.preview ? room.preview : t("room.encryptedPreview");
      new Notification(room.name, { body, tag: roomId });
    }
  }

  private applyOutbox(txnId: string, status: "sent" | "queued" | "sending" | "failed"): void {
    const message = state.messages.find((entry) => entry.id === txnId);
    if (!message) return;
    if (status === "sent") return;
    message.status = status;
    touch();
  }

  private markReadSoon(): void {
    const room = activeRoom();
    const last = state.messages.findLast((message) => message.status === "sent");
    if (!room || !last) return;
    void this.worker.send({ type: "markRead", roomId: room.roomId, eventId: last.id });
  }

  private async refreshPacks(): Promise<void> {
    try {
      const packs = await this.local.packs();
      this.shell.picker.load(packs);
    } catch {
      this.shell.picker.load([]);
    }
  }

  openRoom(roomId: string): void {
    if (!roomId) {
      this.route(null, null);
      setState({ activeRoomId: null, messages: [], typing: [] });
      return;
    }
    void this.loadRoom(roomId);
  }

  private async loadRoom(roomId: string, updateRoute = true): Promise<void> {
    if (updateRoute) this.route(roomId, null);
    const draft = (await this.local.draft(state.session?.accountHash ?? "", roomId)) ?? EMPTY_DRAFT;
    this.draftState = draft;
    setState({ activeRoomId: roomId, messages: [], draft });
    this.draftState = draft;;
    const window = await this.worker.send<RoomWindow>({ type: "openRoom", roomId });
    setState({ messages: window.messages, hasOlder: window.hasOlder });
    this.shell.composer.load(draft, activeRoom());
    this.shell.render();
    requestAnimationFrame(() => this.shell.timeline.root.scrollTo({ top: this.shell.timeline.root.scrollHeight }));
    this.markReadSoon();
    this.shell.composer.focus();
  }

  openDialog(name: string, roomId?: string): void {
    if (name === "picker") return;
    this.route(state.activeRoomId, name);
    showDialog(this, name, roomId);
  }

  closeDialog(): void {
    closeDialog();
    this.route(state.activeRoomId, null, true);
  }

  setDraft(patch: Partial<Draft>): void {
    this.draftState = { ...this.draftState, ...patch };
    setState({ draft: this.draftState });
    const room = activeRoom();
    if (room) void this.local.saveDraft(state.session?.accountHash ?? "", room.roomId, this.draftState);
  }

  draft(): Draft {
    return this.draftState;
  }

  draftMarks(): Mark[] {
    return this.draftState.marks;
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
    const txnId = `m${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
    const pending: Message = {
      id: txnId,
      roomId: room.roomId,
      sender: state.session?.userId ?? "",
      name: state.session?.displayName ?? "",
      avatar: state.session?.avatar ?? null,
      ts: Date.now(),
      kind: "text",
      body,
      html,
      media: null,
      reply: replyTo ? (this.draftState.reply ?? null) : null,
      mentions: [],
      edited: false,
      reactions: [],
      status: "queued",
      error: null,
      encrypted: room.encrypted,
      search: [],
    };
    await this.local.putMessage(pending);
    setState({ messages: [...state.messages, pending] });
    this.shell.render();
    void this.worker.send({ type: "text", roomId: room.roomId, txnId, body, html, replyTo }).catch((error: unknown) => {
      this.toast(error instanceof Error ? error.message : t("error.unknown"));
    });
  }

  async submitEdit(eventId: string, body: string, html: string | null): Promise<void> {
    const room = activeRoom();
    if (!room) return;
    await this.worker.send({ type: "edit", roomId: room.roomId, eventId, body, html });
  }

  async submitFile(file: File): Promise<void> {
    const room = activeRoom();
    if (!room) return;
    const txnId = `f${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
    const pending: Message = {
      id: txnId,
      roomId: room.roomId,
      sender: state.session?.userId ?? "",
      name: state.session?.displayName ?? "",
      avatar: state.session?.avatar ?? null,
      ts: Date.now(),
      kind: file.type.startsWith("image/") ? "image" : "file",
      body: file.name,
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
    };
    await this.local.putMessage(pending);
    setState({ messages: [...state.messages, pending] });
    this.shell.render();
    const data = await file.arrayBuffer();
    void this.worker.send({ type: "sendFile", roomId: room.roomId, txnId, name: file.name, mime: file.type || "application/octet-stream", data }).catch(() => undefined);
  }

  sendSticker(url: string, body: string): void {
    const room = activeRoom();
    if (!room) return;
    const txnId = `s${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
    const pending: Message = {
      id: txnId,
      roomId: room.roomId,
      sender: state.session?.userId ?? "",
      name: state.session?.displayName ?? "",
      avatar: state.session?.avatar ?? null,
      ts: Date.now(),
      kind: "sticker",
      body,
      html: null,
      media: { mxc: url, mime: "image/png", size: 0, width: null, height: null, duration: null, name: body, file: null },
      reply: null,
      mentions: [],
      edited: false,
      reactions: [],
      status: "queued",
      error: null,
      encrypted: room.encrypted,
      search: [],
    };
    void this.local.putMessage(pending).then(() => {
      setState({ messages: [...state.messages, pending] });
      this.shell.render();
    });
    void this.worker.send({ type: "sticker", roomId: room.roomId, txnId, body, url, replyTo: null }).catch(() => undefined);
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
    window.clearTimeout(this.typingTimer);
    void this.worker.send({ type: "typing", roomId: room.roomId, on });
    if (on) this.typingTimer = window.setTimeout(() => this.typing(false), 15000);
  }

  togglePicker(mode: "emoji" | "sticker"): void {
    this.shell.picker.toggle(mode);
  }

  activeRoom(): RoomSummary | null {
    return activeRoom();
  }

  sections(): Record<SectionId, boolean> {
    return state.settings.sections;
  }

  async refreshRooms(): Promise<void> {
    const rooms = await this.local.rooms();
    setState({ rooms: new Map(rooms.map((room) => [room.roomId, room])) });
  }

  get locale(): string {
    return getLocale();
  }
}
