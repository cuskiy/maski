import { config, type Locale } from "./config";
import { MainDb } from "../store/db";
import { AppStore, type AppSnapshot } from "../store/app-store";
import {
  activeRoom,
  displayName,
  roomById,
  roomSections,
  roomTitle,
  timelineItems,
  type SectionKey,
} from "../store/selectors";
import type {
  DeviceRecord,
  EventRecord,
  MediaDescriptor,
  OutboxRecord,
  RoomRecord,
  ScrollRecord,
  VerificationState,
} from "../data/records";
import type {
  DiscoveryResult,
  RecoveryResult,
  RecoveryStatus,
  SessionSummary,
  SetupRecoveryResult,
  SsoTarget,
  UiaEvent,
  VerificationResult,
  WorkerToClient,
} from "../protocol";
import { isRecord, isSessionSummary } from "../protocol";
import { WorkerClient, WorkerError } from "../matrix/client";
import { messageContent, redactionContent } from "../matrix/compose";
import { Router } from "../ui/router";
import { DialogHost } from "../ui/dialogs";
import { MediaCache } from "../ui/media-cache";
import { Notifier } from "../ui/notifications";
import { Toaster } from "../ui/toast";
import { confirmAction } from "../ui/confirm";
import { Composer, type ComposerMessage } from "../ui/views/composer";
import type { MarkType } from "../ui/composer-model";
import { TimelineView } from "../ui/views/timeline";
import { ActionMenu, bindActionTrigger, type ActionMenuItem, type ActionPosition } from "../ui/action-menu";
import { el, initial, type Child } from "../ui/dom";
import { icon, iconButton } from "../ui/icons";
import { formatNumber, setLocale, t } from "../i18n";

type View = "boot" | "auth" | "gate" | "shell" | "fatal";
type AuthStep = "server" | "methods" | "register";
type AuthIntent = "login" | "register";

interface AuthFields {
  server: string;
  identifier: string;
  password: string;
  confirm: string;
  username: string;
}

interface ShellRefs {
  app: HTMLElement;
  nav: HTMLElement;
  rooms: HTMLElement;
  userName: HTMLElement;
  userSub: HTMLElement;
  userAvatar: HTMLElement;
  content: HTMLElement;
  headerTitle: HTMLElement;
  headerSubtitle: HTMLElement;
  headerAvatar: HTMLElement;
  headerActions: HTMLElement;
  body: HTMLElement;
  typing: HTMLElement;
  composerHost: HTMLElement;
  accountButton: HTMLElement;
  accountCard: HTMLElement;
}

export class App {
  private readonly root: HTMLElement;
  private readonly adapter: WorkerClient;
  private readonly db = new MainDb();
  private readonly router = new Router();
  private readonly dialogs = new DialogHost();
  private readonly media: MediaCache;
  private readonly notifier = new Notifier();
  private readonly toaster = new Toaster();
  private readonly actionMenu = new ActionMenu();
  private readonly store = new AppStore(config.app.defaultLocale);
  private view: View = "boot";
  private shell: ShellRefs | null = null;
  private timeline: TimelineView | null = null;
  private composer: Composer | null = null;
  private picker: { element: HTMLElement; trigger: HTMLElement; close: () => void } | null = null;
  private renderQueued = false;
  private shellLocale: Locale | null = null;
  private authStep: AuthStep = "server";
  private authIntent: AuthIntent = "login";
  private discovery: DiscoveryResult | null = null;
  private authBusy = false;
  private authError: string | null = null;
  private authFields: AuthFields = {
    server: config.app.defaultHomeserver,
    identifier: "",
    password: "",
    confirm: "",
    username: "",
  };
  private authRenderKey = "";
  private gateBusy = false;
  private gateError: string | null = null;
  private recoveryKey: string | null = null;
  private gateRenderKey = "";
  private hash: string | null = null;
  private adopting: string | null = null;
  private settings: Record<string, unknown> = {};
  private dialogName: string | null = null;
  private uia: UiaEvent | null = null;
  private uiaAnswering = false;
  private pendingFocusEvent: string | null = null;
  private readOnly = false;
  private locksHeld = false;
  private activating: string | null = null;
  private roomListKey = "";
  private headerKey = "";
  private channelKey = "";
  private notificationPermission: NotificationPermission | "unsupported" = "unsupported";
  private settingsSection = "account";
  private searchTimer: number | null = null;
  private draftTimer: number | null = null;
  private draftRoom: string | null = null;
  private typingRoom: string | null = null;
  private typingAt = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.adapter = new WorkerClient();
    this.media = new MediaCache(this.adapter);
    document.body.appendChild(this.toaster.element);
  }

  private notify(message: string): void {
    this.toaster.show(message);
  }

  async start(): Promise<void> {
    await this.db.open();
    this.settings = await this.db.readSettings();
    // The static shell decides the locale; the stored setting follows it.
    const locale: Locale = this.router.route.locale;
    setLocale(locale);
    if (this.settings["locale"] !== locale) await this.db.writeSetting("locale", locale);
    this.store.patchUi({
      locale,
      notificationsPreview: this.settings["notificationsPreview"] !== false,
      notificationPermission:
        typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    });
    this.notificationPermission = this.store.getSnapshot().ui.notificationPermission;
    this.notifier.configure(
      {
        enabled: this.settings["notificationsEnabled"] === true,
        preview: this.settings["notificationsPreview"] !== false,
      },
      (roomId) => this.openRoom(roomId),
    );
    this.adapter.onEvent((event) => this.handleWorkerEvent(event));
    this.adapter.onFatal((error) => this.fatal(error.message));
    this.store.subscribe(() => this.requestRender());
    this.router.subscribe(() => this.requestRender());
    this.applyLocale();

    const token = new URLSearchParams(window.location.search).get("loginToken");
    if (token) {
      await this.loginWithSsoToken(token);
      return;
    }
    const last = await this.db.lastAccountHash();
    if (last) {
      await this.resume(last);
      return;
    }
    this.requestRender();
  }

  private async resume(hash: string): Promise<void> {
    const cached = isSessionSummary(this.settings["lastSession"]) ? this.settings["lastSession"] : null;
    const gateDone = this.settings[`keyGate:${hash}`] === true;
    this.hash = hash;
    this.store.setConnection(this.readOnly ? "readonly" : "connecting");
    if (cached && gateDone && cached.accountHash === hash) {
      this.store.setSession(cached);
      this.store.setKeyGate("complete");
      try {
        await this.db.openAccount(hash);
        await this.reloadProjection();
        await this.openInitialRoom();
      } catch (error) {
        this.authError = messageOf(error);
      }
    }
    this.requestRender();
    if (this.readOnly) {
      this.notify(t("session.readOnly"));
      return;
    }
    void this.startWorker(hash);
  }

  // The second tab reads the projection and never opens the SDK or crypto store.
  // A reload releases the lock a moment after the new document starts, so one retry
  // separates a reload from a real second tab.
  private async holdClientLock(): Promise<boolean> {
    if (this.locksHeld) return true;
    if (!("locks" in navigator)) return true;
    this.locksHeld = (await this.requestClientLock()) || (await this.requestClientLock(300));
    return this.locksHeld;
  }

  private async requestClientLock(delay = 0): Promise<boolean> {
    if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
    return new Promise<boolean>((resolve) => {
      void navigator.locks
        .request("maski-client", { ifAvailable: true }, (lock) => {
          resolve(lock !== null);
          return lock ? new Promise<void>(() => undefined) : undefined;
        })
        .catch(() => resolve(true));
    });
  }

  private async startWorker(hash: string): Promise<void> {
    if (!(await this.holdClientLock())) {
      this.readOnly = true;
      this.store.setConnection("readonly");
      this.notify(t("session.readOnly"));
      return;
    }
    try {
      await this.adapter.request("start", { accountHash: hash }, 0);
    } catch (error) {
      if (error instanceof WorkerError && error.code === "not_logged_in") {
        this.forgetSession();
        return;
      }
      this.store.setConnection("error");
      this.notify(messageOf(error));
    }
  }

  private handleWorkerEvent(event: WorkerToClient): void {
    switch (event.type) {
      case "ready":
        this.handleReady(event.session);
        break;
      case "session":
        this.store.setSession(event.session);
        break;
      case "reload":
        void this.reloadProjection();
        break;
      case "delta": {
        // The known ids have to be read before the delta lands, or every arriving
        // event already looks known and nothing is announced.
        const prior = new Set(this.store.getSnapshot().events.map((row) => row.eventId));
        if (!this.store.applyDelta(event.delta)) break;
        for (const row of event.delta.events) {
          if (prior.has(row.eventId)) continue;
          const room = roomById(this.store.getSnapshot(), row.roomId);
          if (room) this.notifier.notify(row, room, this.store.getSnapshot().session?.userId ?? "");
        }
        break;
      }
      case "outbox":
        void this.handleOutboxEvent(event.txnId, event.status, event.error, event.attempts);
        break;
      case "typing":
        this.store.setTyping(event.roomId, event.userIds);
        break;
      case "sync":
        if (event.state === "ERROR") this.store.setConnection("error");
        else if (event.state === "RECONNECTING") this.store.setConnection("offline");
        else if (event.state === "PREPARED" || event.state === "SYNCING") this.store.setConnection("ready");
        else if (event.state === "STOPPED") this.store.setConnection("boot");
        else this.store.setConnection("connecting");
        break;
      case "progress":
        break;
      case "verification":
        this.handleVerification(event.state);
        break;
      case "uia":
        this.openUia(event);
        break;
      case "fatal":
        this.fatal(event.message);
        break;
      case "log":
        if (event.level === "error") this.notify(event.message);
        break;
      case "toast":
        this.notify(event.message);
        break;
    }
  }

  private handleReady(session: SessionSummary | null): void {
    if (!session) {
      this.forgetSession();
      return;
    }
    void this.adoptSession(session);
  }

  private forgetSession(): void {
    this.hash = null;
    this.authStep = "server";
    this.discovery = null;
    this.authBusy = false;
    this.store.setSession(null);
    this.store.setKeyGate("checking");
    this.requestRender();
  }

  private async adoptSession(session: SessionSummary): Promise<void> {
    if (this.adopting === session.accountHash) return;
    this.adopting = session.accountHash;
    const keepShell = this.hash === session.accountHash && this.store.getSnapshot().keyGate === "complete";
    try {
      this.hash = session.accountHash;
      this.store.setSession(session);
      if (!keepShell) this.store.setKeyGate("checking");
      this.store.setConnection("connecting");
      this.authBusy = false;
      this.authError = null;
      await this.db.openAccount(session.accountHash);
      await this.db.writeSetting("lastAccountHash", session.accountHash);
      this.settings = await this.db.readSettings();
      await this.reloadProjection();
      await this.checkGate(keepShell);
    } catch (error) {
      if (keepShell) {
        this.store.setConnection("error");
        this.notify(messageOf(error));
      } else {
        this.hash = null;
        this.authError = messageOf(error);
      }
      this.requestRender();
    } finally {
      this.adopting = null;
    }
  }

  private async reloadProjection(): Promise<void> {
    if (!this.hash) return;
    await this.db.openAccount(this.hash);
    const projection = await this.db.readProjection(this.router.roomId());
    this.store.setProjection(projection);
    if (this.readOnly) this.store.setConnection("readonly");
    // A deep link is never rewritten from here: the first sync may still be adding
    // rooms, and an unknown room simply shows the empty panel.
  }

  private async persistGate(): Promise<void> {
    const session = this.store.getSnapshot().session;
    if (!session) return;
    await this.db.writeSetting("lastSession", session);
    await this.db.writeSetting(`keyGate:${session.accountHash}`, true);
  }

  private async checkGate(background = false): Promise<void> {
    const session = this.store.getSnapshot().session;
    if (!session) return;
    if (!background) {
      this.store.setKeyGate("checking");
      this.requestRender();
    }
    try {
      const result = await this.adapter.request<RecoveryResult>("recoveryStatus", {});
      this.store.setRecovery(result.status);
      if (gateComplete(result.status)) {
        await this.persistGate();
        this.store.setKeyGate("complete");
        if (!background) await this.openInitialRoom();
      } else {
        this.store.setKeyGate("required");
      }
    } catch (error) {
      // A background check that cannot reach the server says nothing about the key:
      // the shell keeps the state it already proved locally.
      if (background) {
        this.notify(t("errors.network"));
        return;
      }
      this.gateError = messageOf(error);
      this.store.setKeyGate("required");
    }
    this.requestRender();
  }

  private async openInitialRoom(): Promise<void> {
    const routeRoom = this.router.roomId();
    if (routeRoom) {
      await this.activateRoom(routeRoom, false);
      return;
    }
    this.store.setActiveRoom(null);
  }

  private async activateRoom(roomId: string, navigate = true): Promise<void> {
    const room = roomById(this.store.getSnapshot(), roomId);
    if (!room) return;
    // A render can request the same room while the first request is still reading,
    // which used to stack IndexedDB work and freeze the switch.
    if (this.activating === roomId) return;
    this.activating = roomId;
    this.closePicker();
    try {
      const snapshot = this.store.getSnapshot();
      const previous = snapshot.activeRoomId;
      // Switching rooms replaces the composer, so a draft still waiting on its
      // debounce is written first.
      if (this.draftTimer !== null) {
        window.clearTimeout(this.draftTimer);
        this.draftTimer = null;
        if (previous !== roomId) await this.saveDraft();
      }
      if (previous !== roomId) await this.storeScroll(previous);
      const scroll = previous === roomId ? null : await this.readScroll(roomId);
      const events = await this.db.readRoomEvents(roomId);
      this.store.setActiveRoom(roomId, events);
      const latest = events[events.length - 1];
      if (latest) void this.adapter.request("markRead", { roomId, eventId: latest.eventId }).catch(() => undefined);
      if (navigate && this.router.roomId() !== roomId) this.router.navigate(this.router.roomPath(roomId));
      await this.restoreDraft(roomId);
      if (scroll) this.timeline?.restoreScroll(scroll);
      this.requestRender();
    } finally {
      this.activating = null;
    }
  }

  private async readScroll(roomId: string): Promise<ScrollRecord | null> {
    if (!this.hash) return null;
    return this.db.readScroll(this.hash, roomId).catch(() => null);
  }

  private async storeScroll(roomId: string | null): Promise<void> {
    const hash = this.hash;
    const timeline = this.timeline;
    if (!hash || !roomId || !timeline) return;
    const state = timeline.scrollState();
    await this.db
      .writeScroll({ accountHash: hash, roomId, eventId: state.eventId, offset: state.offset, atBottom: state.atBottom })
      .catch(() => undefined);
  }

  private scheduleDraftSave(): void {
    if (this.draftTimer !== null) window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = null;
      void this.saveDraft();
    }, 400);
  }

  private async saveDraft(): Promise<void> {
    const hash = this.hash;
    const roomId = this.store.getSnapshot().activeRoomId;
    const composer = this.composer;
    if (!hash || !roomId || !composer) return;
    const state = composer.model.state;
    const target = composer.contextTarget;
    const empty = state.text.length === 0 && state.marks.length === 0 && state.tokens.length === 0 && !target;
    if (empty) {
      if (this.draftRoom !== roomId) return;
      this.draftRoom = null;
      await this.db.deleteDraft(hash, roomId).catch(() => undefined);
      return;
    }
    this.draftRoom = roomId;
    await this.db
      .writeDraft({
        accountHash: hash,
        roomId,
        text: state.text,
        marks: state.marks,
        emoji: state.tokens,
        replyTo: target?.kind === "reply" ? target.eventId : null,
        editTarget: target?.kind === "edit" ? target.eventId : null,
        updatedAt: Date.now(),
      })
      .catch(() => undefined);
  }

  private async restoreDraft(roomId: string): Promise<void> {
    const hash = this.hash;
    const composer = this.composer;
    if (!hash || !composer) return;
    const draft = await this.db.readDraft(hash, roomId).catch(() => null);
    if (!draft) {
      composer.reset();
      this.draftRoom = null;
      return;
    }
    this.draftRoom = roomId;
    composer.restore({
      text: draft.text,
      marks: draft.marks,
      tokens: draft.emoji,
      selectionStart: draft.text.length,
      selectionEnd: draft.text.length,
    });
    const target = draft.replyTo ?? draft.editTarget;
    if (target) {
      const event = this.store.getSnapshot().events.find((row) => row.eventId === target);
      const name = event ? displayName(this.store.getSnapshot(), roomId, event.senderId) : "";
      composer.setContext(draft.replyTo ? "reply" : "edit", target, name);
    }
  }

  private openRoom(roomId: string): void {
    this.router.navigate(this.router.roomPath(roomId));
    void this.activateRoom(roomId, false);
  }

  private backToHome(): void {
    void this.storeScroll(this.store.getSnapshot().activeRoomId);
    this.router.navigate("/");
  }

  private requestRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  private render(): void {
    this.applyLocale();
    this.syncRoute();
    const snapshot = this.store.getSnapshot();
    if (!snapshot.session) {
      if (this.hash) {
        this.renderBoot();
        return;
      }
      if (this.view !== "auth" || this.authRenderKey !== this.authKey()) this.renderAuth();
      return;
    }
    if (snapshot.keyGate !== "complete") {
      if (this.view !== "gate" || this.gateRenderKey !== this.gateKey()) this.renderGate();
      return;
    }
    if (this.view !== "shell" || !this.shell || this.shellLocale !== snapshot.ui.locale) {
      this.renderShell();
    } else {
      this.updateShell();
    }
    this.syncDialogs();
  }

  private syncRoute(): void {
    const snapshot = this.store.getSnapshot();
    if (!snapshot.session || snapshot.keyGate !== "complete") return;
    const roomId = this.router.roomId();
    if (!roomId) {
      if (snapshot.activeRoomId) this.store.setActiveRoom(null);
      return;
    }
    if (roomId !== snapshot.activeRoomId) void this.activateRoom(roomId, false);
  }

  private applyLocale(): void {
    const locale = this.store.getSnapshot().ui.locale;
    setLocale(locale);
    document.documentElement.lang = locale;
    document.title = `${config.app.name} — ${t("app.description")}`;
  }

  private renderBoot(): void {
    if (this.view === "boot") return;
    this.view = "boot";
    this.root.classList.add("boot");
    this.root.replaceChildren(
      el("div", { class: "boot" }, [
        el("main", { class: "boot-main" }, [
          el("p", { class: "brand", text: config.app.name }),
          el("p", { class: "boot-text", text: t("boot.connecting") }),
          el("div", { class: "spinner" }),
        ]),
      ]),
    );
  }

  private renderAuth(): void {
    this.view = "auth";
    this.root.classList.remove("boot");
    this.authRenderKey = this.authKey();
    const snapshot = this.store.getSnapshot();
    const nodes: Child[] = [];
    if (this.authStep === "server") {
      nodes.push(...this.serverStep());
    } else if (this.authStep === "methods") {
      nodes.push(...this.methodsStep());
    } else {
      nodes.push(...this.registerStep());
    }
    if (this.readOnly) nodes.push(el("p", { class: "muted", text: t("session.readOnly") }));
    if (this.authError) nodes.push(el("p", { class: "error-text", text: this.authError }));
    nodes.push(el("div", { class: "auth-foot" }, [this.languageSwitch(snapshot.ui.locale)]));
    this.root.replaceChildren(el("div", { class: "auth" }, [el("div", { class: "auth-card" }, nodes)]));
  }

  private authChoice(label: string, variant: string | null, onClick: () => void): HTMLElement {
    return el("button", {
      class: variant ? `button ${variant}` : "button",
      text: label,
      attrs: { type: "button" },
      on: { click: onClick },
    });
  }

  private field(label: string, control: HTMLElement, hint?: string): HTMLElement {
    return el("div", { class: "field" }, [
      el("label", {}, [el("span", { class: "field-label", text: label }), control]),
      hint ? el("small", { text: hint }) : null,
    ]);
  }

  private authHead(title: string, text: string): HTMLElement {
    return el("div", { class: "auth-head" }, [
      el("p", { class: "brand", text: config.app.name }),
      el("h1", { text: title }),
      el("p", { text }),
    ]);
  }

  private serverStep(): Child[] {
    const server = el("input", {
      class: "input",
      attrs: { value: this.authFields.server, autocomplete: "url", spellcheck: "false" },
    });
    server.addEventListener("input", () => {
      this.authFields.server = server.value;
    });
    const form = el("form", { class: "auth-form" }, [
      this.field(t("auth.homeserver"), server),
      el("p", { class: "muted", text: t("auth.chooseServerHint") }),
      el("div", { class: "auth-actions" }, [
        el("button", {
          class: "button primary",
          text: this.authBusy ? t("auth.discovering") : t("auth.continue"),
          attrs: { type: "submit", disabled: this.authBusy },
        }),
      ]),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.discoverServer();
    });
    return [
      this.authHead(t("auth.title"), t("auth.chooseServer")),
      form,
    ];
  }

  private methodsStep(): Child[] {
    const discovery = this.discovery;
    if (!discovery) {
      this.authStep = "server";
      return this.serverStep();
    }
    const nodes: Child[] = [
      this.authHead(t("auth.title"), discovery.baseUrl),
      this.authBack(t("auth.changeServer"), () => this.goAuth("server")),
    ];
    const password = discovery.loginFlows.includes("m.login.password");
    if (password) nodes.push(this.passwordForm(discovery));
    if (discovery.ssoTargets.length > 0) {
      nodes.push(
        el("div", { class: "auth-methods" }, [
          el("h2", { text: password ? t("auth.otherMethods") : t("auth.chooseMethod") }),
          ...discovery.ssoTargets.map((target) =>
            this.authChoice(this.ssoLabel(target), null, () => void this.startSso(target)),
          ),
        ]),
      );
    }
    if (!password && discovery.ssoTargets.length === 0) {
      nodes.push(
        el("div", { class: "auth-methods" }, [
          el("h2", { text: t("auth.chooseMethod") }),
          el("p", { class: "muted", text: this.authNote(discovery) }),
        ]),
      );
    }
    if (discovery.registration) {
      nodes.push(this.authBack(t("auth.createAccountAction"), () => this.goAuth("register", "register")));
    }
    return nodes;
  }

  private authNote(discovery: DiscoveryResult): string {
    return discovery.loginFlows.includes("m.login.token") ? t("auth.methodToken") : t("auth.noPassword");
  }

  private ssoLabel(target: SsoTarget): string {
    if (target.name) return target.name;
    return target.loginType === "cas" ? t("auth.methodCas") : t("auth.sso");
  }

  private passwordForm(discovery: DiscoveryResult): HTMLElement {
    const identifier = el("input", {
      class: "input",
      attrs: { value: this.authFields.identifier, autocomplete: "username", spellcheck: "false" },
    });
    identifier.addEventListener("input", () => {
      this.authFields.identifier = identifier.value;
    });
    const password = el("input", {
      class: "input",
      attrs: { type: "password", value: this.authFields.password, autocomplete: "current-password" },
    });
    password.addEventListener("input", () => {
      this.authFields.password = password.value;
    });
    const form = el("form", { class: "auth-form" }, [
      this.field(t("auth.username"), identifier, t("auth.usernameHint")),
      this.field(t("auth.password"), password),
      el("div", { class: "auth-actions" }, [
        el("button", {
          class: "button primary",
          text: this.authBusy ? t("auth.signingIn") : t("auth.login"),
          attrs: { type: "submit", disabled: this.authBusy },
        }),
      ]),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submitPassword(discovery);
    });
    return form;
  }

  private registerStep(): Child[] {
    const discovery = this.discovery;
    if (!discovery) {
      this.authStep = "server";
      return this.serverStep();
    }
    const nodes: Child[] = [
      this.authHead(t("auth.registerTitle"), t("auth.registerHint", { server: discovery.baseUrl })),
      this.authBack(t("auth.changeServer"), () => this.goAuth("server")),
    ];
    if (!discovery.registration) {
      nodes.push(el("p", { class: "error-text", text: t("auth.registerDisabled") }));
      return nodes;
    }
    nodes.push(this.registerForm(discovery));
    nodes.push(this.authBack(t("auth.backToLogin"), () => this.goAuth("methods", "login")));
    return nodes;
  }

  private registerForm(discovery: DiscoveryResult): HTMLElement {
    const username = el("input", {
      class: "input",
      attrs: { value: this.authFields.username, autocomplete: "username", spellcheck: "false" },
    });
    username.addEventListener("input", () => {
      this.authFields.username = username.value;
    });
    const password = el("input", {
      class: "input",
      attrs: { type: "password", value: this.authFields.password, autocomplete: "new-password" },
    });
    password.addEventListener("input", () => {
      this.authFields.password = password.value;
    });
    const confirm = el("input", {
      class: "input",
      attrs: { type: "password", value: this.authFields.confirm, autocomplete: "new-password" },
    });
    confirm.addEventListener("input", () => {
      this.authFields.confirm = confirm.value;
    });
    const form = el("form", { class: "auth-form" }, [
      this.field(t("auth.username"), username),
      this.field(t("auth.password"), password),
      this.field(t("auth.passwordConfirm"), confirm),
      el("div", { class: "auth-actions" }, [
        el("button", {
          class: "button primary",
          text: this.authBusy ? t("auth.signingIn") : t("auth.registerSubmit"),
          attrs: { type: "submit", disabled: this.authBusy },
        }),
      ]),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submitRegister(discovery);
    });
    return form;
  }

  private authBack(label: string, onClick: () => void): HTMLElement {
    return el("div", { class: "auth-back" }, [
      el("button", {
        class: "button ghost",
        attrs: { type: "button" },
        on: { click: onClick },
      }, [icon("arrowLeft"), label]),
    ]);
  }

  private goAuth(step: AuthStep, intent: AuthIntent | null = null): void {
    this.authStep = step;
    if (intent) this.authIntent = intent;
    this.authError = null;
    this.authRenderKey = "";
    this.requestRender();
  }

  private authKey(): string {
    return [
      this.store.getSnapshot().ui.locale,
      this.authStep,
      this.authIntent,
      this.authBusy,
      this.authError ?? "",
      this.discovery?.baseUrl ?? "",
      this.discovery?.registration ?? "",
    ].join("|");
  }

  private async discoverServer(): Promise<void> {
    if (this.authBusy) return;
    this.authBusy = true;
    this.authError = null;
    this.authRenderKey = "";
    this.requestRender();
    try {
      const discovery = await this.adapter.request<DiscoveryResult>("discover", {
        server: this.authFields.server,
      });
      this.discovery = discovery;
      this.authFields.server = discovery.baseUrl;
      this.authStep = this.authIntent === "register" ? "register" : "methods";
    } catch {
      this.authError = t("auth.discoverFailed");
    } finally {
      this.authBusy = false;
      this.authRenderKey = "";
      this.requestRender();
    }
  }

  private async submitPassword(discovery: DiscoveryResult): Promise<void> {
    if (this.authBusy || !(await this.requireLock())) return;
    if (!this.authFields.identifier.trim()) {
      this.authError = t("auth.missingUsername");
      this.authRenderKey = "";
      this.requestRender();
      return;
    }
    if (!this.authFields.password) {
      this.authError = t("auth.missingPassword");
      this.authRenderKey = "";
      this.requestRender();
      return;
    }
    this.authBusy = true;
    this.authError = null;
    this.authRenderKey = "";
    this.requestRender();
    try {
      const result = await this.adapter.request<{ session: SessionSummary }>(
        "login",
        {
          baseUrl: discovery.baseUrl,
          identifier: this.authFields.identifier.trim(),
          password: this.authFields.password,
        },
        0,
      );
      this.authFields.password = "";
      await this.adoptSession(result.session);
    } catch (error) {
      this.authError = this.authFailure(error);
    } finally {
      this.authBusy = false;
      this.authRenderKey = "";
      this.requestRender();
    }
  }

  private async submitRegister(discovery: DiscoveryResult): Promise<void> {
    if (this.authBusy || !(await this.requireLock())) return;
    if (!this.authFields.username.trim()) {
      this.authError = t("auth.missingUsername");
      this.authRenderKey = "";
      this.requestRender();
      return;
    }
    if (!this.authFields.password) {
      this.authError = t("auth.missingPassword");
      this.authRenderKey = "";
      this.requestRender();
      return;
    }
    if (this.authFields.password !== this.authFields.confirm) {
      this.authError = t("auth.passwordMismatch");
      this.authRenderKey = "";
      this.requestRender();
      return;
    }
    this.authBusy = true;
    this.authError = null;
    this.authRenderKey = "";
    this.requestRender();
    try {
      const result = await this.adapter.request<{ session: SessionSummary }>(
        "register",
        {
          baseUrl: discovery.baseUrl,
          username: this.authFields.username.trim(),
          password: this.authFields.password,
        },
        0,
      );
      this.authFields.password = "";
      this.authFields.confirm = "";
      await this.adoptSession(result.session);
    } catch (error) {
      this.authError = this.authFailure(error);
    } finally {
      this.authBusy = false;
      this.authRenderKey = "";
      this.requestRender();
    }
  }

  private async requireLock(): Promise<boolean> {
    if (await this.holdClientLock()) return true;
    this.readOnly = true;
    this.authError = t("session.readOnly");
    this.authRenderKey = "";
    this.requestRender();
    return false;
  }

  private authFailure(error: unknown): string {
    if (error instanceof WorkerError) {
      if (error.code === "M_USER_IN_USE") return t("auth.userTaken");
      if (error.code === "M_LIMIT_EXCEEDED") return t("auth.rateLimited");
      if (error.code === "M_FORBIDDEN") return t("auth.loginFailed");
    }
    return messageOf(error);
  }

  private async startSso(target: SsoTarget): Promise<void> {
    const discovery = this.discovery;
    if (!discovery || !(await this.requireLock())) return;
    this.authBusy = true;
    this.authError = null;
    this.authRenderKey = "";
    this.requestRender();
    try {
      sessionStorage.setItem("maski-sso-base", discovery.baseUrl);
      const result = await this.adapter.request<{ url: string }>("ssoUrl", {
        baseUrl: discovery.baseUrl,
        redirectUrl: window.location.href.split("#")[0],
        loginType: target.loginType,
        idpId: target.idpId,
      });
      window.location.assign(result.url);
    } catch (error) {
      this.authBusy = false;
      this.authError = messageOf(error);
      this.authRenderKey = "";
      this.requestRender();
    }
  }

  private async loginWithSsoToken(token: string): Promise<void> {
    const baseUrl = sessionStorage.getItem("maski-sso-base");
    const url = new URL(window.location.href);
    url.searchParams.delete("loginToken");
    window.history.replaceState(null, "", url);
    if (!baseUrl) {
      this.authError = t("auth.ssoUnsupported");
      this.goAuth("server");
      return;
    }
    if (!(await this.requireLock())) return;
    try {
      this.authBusy = true;
      this.requestRender();
      const result = await this.adapter.request<{ session: SessionSummary }>(
        "loginToken",
        { baseUrl, token },
        0,
      );
      await this.adoptSession(result.session);
    } catch (error) {
      this.authError = messageOf(error);
      this.goAuth("server");
    } finally {
      this.authBusy = false;
    }
  }

  private languageSwitch(locale: Locale): HTMLElement {
    const node = el("div", { class: "language-switch" });
    for (const item of config.app.locales) {
      node.appendChild(
        el("button", {
          text: t(item === "zh-CN" ? "language.zh-CN" : "language.en"),
          attrs: { type: "button", "aria-pressed": item === locale },
          on: {
            click: () => {
              this.store.patchUi({ locale: item });
              void this.db.writeSetting("locale", item);
              this.router.setLocale(item);
              this.authRenderKey = "";
              this.gateRenderKey = "";
              this.shellLocale = null;
              this.requestRender();
            },
          },
        }),
      );
    }
    return node;
  }

  private renderGate(): void {
    this.view = "gate";
    this.root.classList.remove("boot");
    this.gateRenderKey = this.gateKey();
    const snapshot = this.store.getSnapshot();
    const recovery = snapshot.recovery;
    const verification = snapshot.verification;
    let body: Child[] = [];
    if (this.recoveryKey) {
      body = this.recoveryKeyPanel();
    } else if (!recovery) {
      body = [el("p", { class: "empty", text: t("common.loading") })];
    } else if (!recovery.hasRecoveryKey) {
      body = [el("p", { class: "muted", text: t("keygate.noKey") }), this.gateSetupPanel()];
    } else {
      body = [this.gateUnlockPanel(), this.gateWaitPanel(), this.gateResetPanel()];
    }
    if (verification?.sas) body.push(this.sasPanel(verification));
    if (this.gateError) body.push(el("p", { class: "error-text", text: this.gateError }));
    const card = el("div", { class: "keygate-card" }, [
      el("div", { class: "keygate-head" }, [
        el("p", { class: "brand", text: config.app.name }),
        el("h1", { text: this.recoveryKey ? t("keygate.setupTitle") : t("keygate.title") }),
        el("p", { text: this.recoveryKey ? t("keygate.setupBody") : t("keygate.body") }),
      ]),
      ...body,
      el("div", { class: "auth-foot" }, [this.languageSwitch(snapshot.ui.locale)]),
    ]);
    this.root.replaceChildren(el("div", { class: "keygate" }, [card]));
  }

  private gateKey(): string {
    return `${this.store.getSnapshot().ui.locale}|${this.gateBusy}|${this.gateError ?? ""}|${
      this.recoveryKey ?? ""
    }|${JSON.stringify(this.store.getSnapshot().recovery)}|${JSON.stringify(
      this.store.getSnapshot().verification,
    )}`;
  }

  private gateSetupPanel(): HTMLElement {
    const passphrase = el("input", { class: "input", attrs: { type: "password", autocomplete: "new-password" } });
    return el("div", { class: "path-card" }, [
      el("h2", { text: t("keygate.setupTitle") }),
      el("p", { text: t("keygate.setupBody") }),
      this.field(t("keygate.setupPassphrase"), passphrase),
      el("button", {
        class: "button primary",
        text: this.gateBusy ? t("common.loading") : t("keygate.generate"),
        attrs: { type: "button", disabled: this.gateBusy },
        on: {
          click: () => void this.setupRecovery(passphrase.value || undefined),
        },
      }),
    ]);
  }

  private gateUnlockPanel(): HTMLElement {
    const key = el("input", { class: "input", attrs: { autocomplete: "off", spellcheck: "false" } });
    const passphrase = el("input", { class: "input", attrs: { type: "password", autocomplete: "current-password" } });
    return el("div", { class: "path-card" }, [
      el("h2", { text: t("keygate.recovery") }),
      el("p", { text: t("keygate.recoveryHint") }),
      this.field(t("keygate.recoveryKey"), key),
      this.field(t("keygate.passphrase"), passphrase),
      el("button", {
        class: "button primary",
        text: this.gateBusy ? t("common.loading") : t("keygate.unlock"),
        attrs: { type: "button", disabled: this.gateBusy },
        on: {
          click: () => void this.unlockRecovery(key.value.trim() || undefined, passphrase.value || undefined),
        },
      }),
    ]);
  }

  private gateWaitPanel(): HTMLElement {
    const waiting = this.store.getSnapshot().verification?.initiatedByMe;
    return el("div", { class: "path-card" }, [
      el("h2", { text: t("keygate.wait") }),
      el("p", { text: waiting ? t("keygate.waiting") : t("keygate.waitHint") }),
      el("button", {
        class: "button",
        text: waiting ? t("keygate.waiting") : t("keygate.wait"),
        attrs: { type: "button", disabled: this.gateBusy || Boolean(waiting) },
        on: { click: () => void this.waitForDevice() },
      }),
    ]);
  }

  private gateResetPanel(): HTMLElement {
    return el("div", { class: "path-card" }, [
      el("h2", { text: t("keygate.reset") }),
      el("p", { text: t("keygate.resetWarning") }),
      el("button", {
        class: "button danger",
        text: t("keygate.resetAction"),
        attrs: { type: "button", disabled: this.gateBusy },
        on: {
          click: () => {
            void this.resetRecovery();
          },
        },
      }),
    ]);
  }

  private recoveryKeyPanel(): Child[] {
    const key = this.recoveryKey ?? "";
    return [
      el("p", { text: t("keygate.recoveryKeyOnce") }),
      el("div", { class: "recovery-key", text: key }),
      el("div", { class: "row" }, [
        el("button", {
          class: "button",
          text: t("common.copy"),
          attrs: { type: "button" },
          on: { click: () => void navigator.clipboard.writeText(key) },
        }),
        el("button", {
          class: "button",
          text: t("keygate.download"),
          attrs: { type: "button" },
          on: { click: () => this.downloadRecoveryKey(key) },
        }),
        el("button", {
          class: "button primary",
          text: t("keygate.saved"),
          attrs: { type: "button" },
          on: { click: () => void this.confirmRecoveryKey() },
        }),
      ]),
    ];
  }

  private sasPanel(verification: VerificationState): HTMLElement {
    const sas = verification.sas;
    if (!sas) return el("div");
    return el("div", { class: "path-card" }, [
      el("h2", { text: t("keygate.sasTitle") }),
      el("p", { text: t("keygate.sasBody") }),
      this.sasGrid(sas.emoji),
      el("div", { class: "row" }, [
        el("button", {
          class: "button primary",
          text: t("keygate.sasConfirm"),
          attrs: { type: "button" },
          on: { click: () => void this.confirmSas(verification.requestId) },
        }),
        el("button", {
          class: "button ghost",
          text: t("keygate.sasMismatch"),
          attrs: { type: "button" },
          on: { click: () => void this.cancelVerification(verification.requestId) },
        }),
      ]),
    ]);
  }

  private sasGrid(emoji: ReadonlyArray<readonly [string, string]>): HTMLElement {
    return el(
      "div",
      { class: "sas-grid" },
      emoji.map(([symbol, name]) =>
        el("div", { class: "sas-cell" }, [
          el("span", { class: "sas-symbol", text: symbol }),
          el("span", { class: "sas-name", text: name }),
        ]),
      ),
    );
  }

  private async setupRecovery(passphrase?: string): Promise<void> {
    this.gateBusy = true;
    this.gateError = null;
    this.gateRenderKey = "";
    this.requestRender();
    try {
      const payload: Record<string, unknown> = {};
      if (passphrase) payload["passphrase"] = passphrase;
      const result = await this.adapter.request<SetupRecoveryResult>("setupRecovery", payload);
      this.recoveryKey = result.recoveryKey;
      this.store.setRecovery(result.status);
    } catch (error) {
      this.gateError = messageOf(error);
    } finally {
      this.gateBusy = false;
      this.gateRenderKey = "";
      this.requestRender();
    }
  }

  private async unlockRecovery(recoveryKey?: string, passphrase?: string): Promise<void> {
    this.gateBusy = true;
    this.gateError = null;
    this.gateRenderKey = "";
    this.requestRender();
    try {
      const result = await this.adapter.request<RecoveryResult>("unlockRecovery", {
        ...(recoveryKey ? { recoveryKey } : {}),
        ...(passphrase ? { passphrase } : {}),
      });
      this.store.setRecovery(result.status);
      if (gateComplete(result.status)) {
        await this.persistGate();
        this.store.setKeyGate("complete");
        await this.openInitialRoom();
      } else {
        this.gateError = t("keygate.error");
      }
    } catch (error) {
      this.gateError = messageOf(error);
    } finally {
      this.gateBusy = false;
      this.gateRenderKey = "";
      this.requestRender();
    }
  }

  private async waitForDevice(): Promise<void> {
    this.gateBusy = true;
    this.gateError = null;
    this.gateRenderKey = "";
    this.requestRender();
    try {
      await this.adapter.request<VerificationResult>("verifyOwnDevice", {});
    } catch (error) {
      this.gateError = messageOf(error);
    } finally {
      this.gateBusy = false;
      this.gateRenderKey = "";
      this.requestRender();
    }
  }

  private async resetRecovery(): Promise<void> {
    if (!(await confirmAction(t("keygate.resetConfirm")))) return;
    this.gateBusy = true;
    this.gateError = null;
    this.gateRenderKey = "";
    this.requestRender();
    try {
      const result = await this.adapter.request<SetupRecoveryResult>("resetRecovery", {});
      this.recoveryKey = result.recoveryKey;
      this.store.setRecovery(result.status);
    } catch (error) {
      this.gateError = messageOf(error);
    } finally {
      this.gateBusy = false;
      this.gateRenderKey = "";
      this.requestRender();
    }
  }

  private async confirmRecoveryKey(): Promise<void> {
    this.recoveryKey = null;
    this.gateRenderKey = "";
    await this.checkGate();
  }

  private downloadRecoveryKey(key: string): void {
    const blob = new Blob([`${key}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = el("a", { attrs: { href: url, download: "maski-recovery-key.txt" } });
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async confirmSas(requestId: string): Promise<void> {
    try {
      await this.adapter.request("confirmSas", { requestId });
    } catch (error) {
      this.gateError = messageOf(error);
      this.requestRender();
    }
  }

  private async cancelVerification(requestId: string): Promise<void> {
    try {
      await this.adapter.request("cancelVerification", { requestId });
    } catch {
      // The request may already be cancelled.
    }
    this.store.setVerification(null);
    await this.checkGate();
  }

  private handleVerification(state: VerificationState): void {
    this.store.setVerification(state);
    if (state.phase === "done") {
      if (this.store.getSnapshot().keyGate !== "complete") void this.checkGate();
      if (this.dialogName === "verify") this.router.closeDialog();
      return;
    }
    if (this.dialogName === "verify") {
      this.dialogName = null;
      this.dialogs.close();
      this.renderDialog("verify");
    }
    if (
      state.phase === "requested" &&
      !state.initiatedByMe &&
      this.store.getSnapshot().keyGate === "complete" &&
      this.dialogName !== "verify"
    ) {
      this.router.openDialog("verify");
    }
  }

  private renderShell(): void {
    this.picker?.close();
    this.view = "shell";
    this.root.classList.remove("boot");
    const snapshot = this.store.getSnapshot();
    this.shellLocale = snapshot.ui.locale;
    if (this.shell) {
      this.timeline?.destroy();
      this.composer?.destroy();
    }
    const nav = el("nav", { class: "nav", attrs: { "aria-label": t("nav.rooms") } });
    const navHead = el("div", { class: "nav-head" }, [
      el("div", { class: "nav-brand" }, [icon("message"), config.app.name]),
    ]);
    const rooms = el("div", { class: "rooms" });
    const account = this.accountBlock(snapshot);
    nav.append(navHead, account.element, rooms);

    const headerAvatar = el("div", { class: "avatar" });
    const headerTitle = el("h1", { text: "" });
    const headerSubtitle = el("div", { class: "content-subtitle", text: "" });
    const headerActions = el("div", { class: "row" });
    const back = iconButton(t("common.back"), "arrowLeft", () => this.backToHome(), "icon-button back-button");
    const header = el("header", { class: "content-head" }, [
      back,
      headerAvatar,
      el("div", { class: "grow content-title" }, [headerTitle, headerSubtitle]),
      headerActions,
    ]);
    const body = el("div", { class: "content-body" });
    const typing = el("div", { class: "typing-indicator" });
    const composerHost = el("div", { class: "composer" });
    const content = el("main", { class: "content" }, [header, body, typing, composerHost]);
    const app = el("div", { class: "app", attrs: { "data-view": "home" } }, [nav, content]);

    this.timeline = new TimelineView(this.media, {
      onReply: (event) => this.replyTo(event),
      onEdit: (event) => this.editEvent(event),
      onRedact: (event) => void this.redact(event),
      onReact: (event, key) => void this.react(event, key),
      onJump: (eventId) => this.jumpToEvent(eventId),
      onOpenMedia: (event) => this.openMedia(event),
      onRetryOutbox: (txnId) => void this.retryOutbox(txnId),
      onCancelOutbox: (txnId) => void this.cancelOutbox(txnId),
      onProfile: (userId) => this.openProfile(userId),
      onMenu: (event, position) => this.openMessageMenu(event, position),
      onOlder: () => void this.loadOlder(),
    });
    body.appendChild(this.timeline.element);
    this.composer = new Composer({
      onSend: (message) => void this.send(message),
      onOpenPicker: (anchor, tab) => this.openPicker(anchor, { tab }),
      onTyping: (active) => void this.sendTyping(active),
      onFormatMenu: (position) => this.openFormatMenu(position),
      onChange: () => this.scheduleDraftSave(),
      loadEmoji: (url) =>
        this.media.get({ mediaKey: "", mxc: url, width: 32, height: 32, method: "scale" }),
    });
    composerHost.appendChild(this.composer.element);
    const roomId = this.store.getSnapshot().activeRoomId;
    if (roomId) void this.restoreDraft(roomId);
    this.shell = {
      app,
      nav,
      rooms,
      userName: account.name,
      userSub: account.sub,
      userAvatar: account.avatar,
      accountButton: account.button,
      accountCard: account.card,
      content,
      headerTitle,
      headerSubtitle,
      headerAvatar,
      headerActions,
      body,
      typing,
      composerHost,
    };
    this.roomListKey = "";
    this.root.replaceChildren(app);
    this.updateShell();
  }

  // The account is a card that unfolds under its row, not a floating menu: what it
  // offers belongs to the same column and stays put while it is used.
  private accountBlock(snapshot: AppSnapshot): {
    element: HTMLElement;
    button: HTMLButtonElement;
    card: HTMLElement;
    name: HTMLElement;
    sub: HTMLElement;
    avatar: HTMLElement;
  } {
    const name = snapshot.session?.displayName ?? t("nav.profile");
    const avatar = el("div", { class: "avatar" }, [el("span", { text: initial(name) })]);
    this.loadAvatar(avatar, snapshot.session?.avatarMxc ?? null, 48);
    const nameEl = el("span", { class: "nav-user-name", text: name });
    const subEl = el("span", { class: "nav-user-sub", text: snapshot.session?.userId ?? "" });
    const button = el("button", {
      class: "nav-user",
      attrs: {
        type: "button",
        "aria-expanded": "false",
        "aria-controls": "account-card",
        "aria-label": t("nav.account", { name }),
      },
    }, [
      avatar,
      el("div", { class: "nav-user-text" }, [nameEl, subEl]),
      el("span", { class: "nav-user-chevron" }, [icon("chevron")]),
    ]);

    const actions: { label: string; icon: string; run: () => void }[] = [
      { label: t("nav.search"), icon: "search", run: () => this.router.openDialog("search") },
      { label: t("nav.newMessage"), icon: "userPlus", run: () => this.router.openDialog("new-message") },
      { label: t("nav.join"), icon: "hash", run: () => this.router.openDialog("join") },
      { label: t("nav.create"), icon: "plus", run: () => this.router.openDialog("create") },
      { label: t("nav.settings"), icon: "settings", run: () => this.router.openDialog("settings") },
      {
        label: t("nav.profile"),
        icon: "person",
        run: () => {
          const userId = this.store.getSnapshot().session?.userId;
          if (userId) this.openProfile(userId);
        },
      },
    ];
    const card = el("div", { class: "nav-card", attrs: { id: "account-card", hidden: true } }, [
      el(
        "div",
        { class: "nav-card-grid" },
        actions.map((action) =>
          el("button", {
            class: "nav-action",
            attrs: { type: "button" },
            on: {
              click: () => {
                close();
                action.run();
              },
            },
          }, [icon(action.icon), el("span", { text: action.label })]),
        ),
      ),
      el("div", { class: "nav-card-foot" }, [
        el("button", {
          class: "nav-action danger",
          attrs: { type: "button" },
          on: {
            click: () => {
              close();
              void this.logout();
            },
          },
        }, [icon("logout"), el("span", { text: t("nav.logout") })]),
      ]),
    ]);

    const outside = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (card.contains(target) || button.contains(target)) return;
      close();
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      close();
      button.focus();
    };
    const close = (): void => {
      if (card.hidden) return;
      card.hidden = true;
      button.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
    const open = (): void => {
      card.hidden = false;
      button.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outside, true);
      document.addEventListener("keydown", escape);
      card.querySelector<HTMLElement>("button")?.focus();
    };
    button.addEventListener("click", () => {
      if (card.hidden) {
        this.closePicker();
        open();
      } else close();
    });

    return {
      element: el("div", { class: "nav-account" }, [button, card]),
      button,
      card,
      name: nameEl,
      sub: subEl,
      avatar,
    };
  }

  private updateShell(): void {
    const snapshot = this.store.getSnapshot();
    const shell = this.shell;
    if (!shell) return;
    shell.app.dataset.view = snapshot.activeRoomId ? "room" : "home";
    const name = snapshot.session?.displayName ?? t("nav.profile");
    if (shell.userName.textContent !== name) shell.userName.textContent = name;
    const id = snapshot.session?.userId ?? "";
    if (shell.userSub.textContent !== id) shell.userSub.textContent = id;
    const ownMember = snapshot.members.find(
      (member) => member.userId === snapshot.session?.userId && member.avatarMxc,
    );
    const ownAvatar = snapshot.session?.avatarMxc ?? ownMember?.avatarMxc ?? null;
    if (ownAvatar && !shell.userAvatar.querySelector("img")) {
      this.loadAvatar(shell.userAvatar, ownAvatar, 48);
    }
    this.updateRoomList();
    const room = snapshot.activeRoomId ? activeRoom(snapshot) : null;
    if (!room) {
      shell.headerTitle.textContent = t("rooms.title");
      shell.headerSubtitle.textContent = "";
      shell.headerAvatar.replaceChildren(icon("message"));
      shell.headerActions.replaceChildren();
      shell.body.replaceChildren(el("div", { class: "empty", text: t("rooms.empty") }));
      shell.composerHost.hidden = true;
      shell.typing.hidden = true;
      return;
    }
    // Replacing the header would recreate its avatar image on every delta.
    const headerKey = `${room.roomId}|${room.kind}|${roomTitle(room)}|${room.topic}|${room.avatarMxc ?? ""}`;
    if (headerKey !== this.headerKey) {
      this.headerKey = headerKey;
      shell.headerTitle.textContent = roomTitle(room);
      shell.headerSubtitle.textContent = room.kind === "space" ? room.topic : room.topic || room.roomId;
      shell.headerAvatar.replaceChildren(el("span", { text: initial(roomTitle(room)) }));
      this.loadAvatar(shell.headerAvatar, room.avatarMxc, 48);
      shell.headerActions.replaceChildren(
        iconButton(
          t(room.kind === "space" ? "channel.settings" : "room.settings"),
          "more",
          () => this.router.openDialog("room-settings"),
        ),
      );
    }
    if (room.kind === "space") {
      shell.composerHost.hidden = true;
      shell.typing.hidden = true;
      const channelKey = channelSignature(room, snapshot);
      if (channelKey !== this.channelKey) {
        this.channelKey = channelKey;
        shell.body.replaceChildren(this.channelPage(room, snapshot));
      }
      return;
    }
    shell.composerHost.hidden = false;
    shell.typing.hidden = false;
    if (this.timeline && !shell.body.contains(this.timeline.element)) {
      shell.body.replaceChildren(this.timeline.element);
    }
    const windowSize = this.pendingFocusEvent ? config.limits.loadedMax : config.limits.timelineWindow;
    this.timeline?.render(snapshot, room, timelineItems(snapshot, room.roomId, windowSize));
    this.composer?.setRoom(roomTitle(room));
    const typingUsers = (snapshot.typing[room.roomId] ?? []).filter(
      (userId) => userId !== snapshot.session?.userId,
    );
    shell.typing.textContent = typingUsers.length > 0 ? t("room.typing") : "";
    if (this.pendingFocusEvent) {
      this.timeline?.focusEvent(this.pendingFocusEvent);
      this.pendingFocusEvent = null;
    }
  }

  private channelPage(room: RoomRecord, snapshot: ReturnType<AppStore["getSnapshot"]>): HTMLElement {
    const children = room.children.map((childId) => ({
      id: childId,
      room: roomById(snapshot, childId),
    }));
    return el("section", { class: "channel" }, [
      el("div", { class: "channel-head" }, [
        el("h2", { text: roomTitle(room) }),
        room.topic ? el("p", { class: "muted", text: room.topic }) : null,
        el("div", { class: "row" }, [
          el("button", {
            class: "button primary",
            text: t("channel.settings"),
            attrs: { type: "button" },
            on: { click: () => this.router.openDialog("room-settings") },
          }),
        ]),
      ]),
      el("h3", { text: t("channel.subgroups") }),
      children.length === 0
        ? el("p", { class: "muted", text: t("channel.empty") })
        : el("div", { class: "channel-list" }, children.map((child) => {
            const name = child.room ? roomTitle(child.room) : child.id;
            const avatar = el("div", { class: "room-avatar" }, [el("span", { text: initial(name) })]);
            if (child.room) this.loadAvatar(avatar, child.room.avatarMxc, 48);
            return el("button", {
              class: "channel-row",
              attrs: { type: "button", "aria-label": t("channel.open", { name }) },
              on: { click: () => this.openChild(child.id, Boolean(child.room)) },
            }, [
              avatar,
              el("div", { class: "room-meta" }, [
                el("span", { class: "room-name", text: name }),
                el("span", { class: "room-preview", text: child.room?.topic ?? child.id }),
              ]),
            ]);
          })),
    ]);
  }

  private async openChild(roomId: string, known: boolean): Promise<void> {
    if (!known) {
      try {
        await this.adapter.request("joinRoom", { roomIdOrAlias: roomId });
        await this.reloadProjection();
      } catch (error) {
        this.notify(messageOf(error));
        return;
      }
    }
    this.openRoom(roomId);
  }

  private updateRoomList(): void {
    const shell = this.shell;
    if (!shell) return;
    const snapshot = this.store.getSnapshot();
    const sections = roomSections(snapshot);
    // Rebuilding the list on every render detaches the row under the pointer, so a
    // click could land on a node that no longer exists. Only touch it when it differs.
    const signature = roomListSignature(sections, snapshot.activeRoomId, snapshot.ui.locale);
    if (signature === this.roomListKey) return;
    this.roomListKey = signature;
    const nodes: HTMLElement[] = [];
    // Sections start closed; what the user opens is remembered. The section that
    // holds the open room stays open so the current room is never hidden.
    const expanded = this.expandedSections();
    const activeSection = sections.find((section) =>
      section.rooms.some((room) => room.roomId === snapshot.activeRoomId),
    );
    if (activeSection) expanded.add(activeSection.key);
    for (const section of sections) {
      if (section.rooms.length === 0) continue;
      const chevron = icon("chevron");
      chevron.classList.add("room-section-chevron");
      const open = expanded.has(section.key);
      const details = el("details", { class: "room-section", attrs: { open } }, [
        el("summary", { class: "room-section-summary" }, [
          el("span", { text: sectionTitle(section.key) }),
          el("span", { class: "room-section-count", text: formatNumber(snapshot.ui.locale, section.rooms.length) }),
          chevron,
        ]),
      ]);
      details.addEventListener("toggle", () => this.rememberSection(section.key, details.open));
      // The rows live in their own box: a closed section has to take no space, and
      // a row with an explicit display would otherwise keep its own layout.
      const rows = el("div", { class: "room-section-body" });
      for (const room of section.rooms) rows.appendChild(this.roomRow(room, snapshot));
      details.appendChild(rows);
      nodes.push(details);
    }
    if (nodes.length === 0) {
      nodes.push(
        snapshot.connection === "connecting"
          ? el("div", { class: "room-skeleton", attrs: { "aria-busy": "true", "aria-label": t("rooms.loading") } },
              Array.from({ length: 4 }, () =>
                el("div", { class: "room-row skeleton" }, [
                  el("div", { class: "room-avatar" }),
                  el("div", { class: "room-meta" }, [
                    el("span", { class: "skeleton-line" }),
                    el("span", { class: "skeleton-line short" }),
                  ]),
                ]),
              ))
          : el("div", { class: "empty", text: t("rooms.empty") }),
      );
    }
    shell.rooms.replaceChildren(...nodes);
  }

  // Before the user has opinions every list is open; from then on the stored set is
  // the truth, so closing a section keeps it closed.
  private expandedSections(): Set<string> {
    const value = this.settings["expandedSections"];
    if (!Array.isArray(value)) return new Set<SectionKey>(["favorites", "rooms", "dms", "channels"]);
    return new Set(value.filter((key): key is string => typeof key === "string"));
  }

  private rememberSection(key: string, expanded: boolean): void {
    const next = this.expandedSections();
    if (expanded) next.add(key);
    else next.delete(key);
    this.settings["expandedSections"] = [...next];
    void this.db.writeSetting("expandedSections", [...next]);
  }

  private roomRow(room: RoomRecord, snapshot: ReturnType<AppStore["getSnapshot"]>): HTMLElement {
    const avatar = el(
      "div",
      { class: "room-avatar" },
      room.kind === "space" && !room.avatarMxc
        ? [icon("hash")]
        : [el("span", { text: initial(roomTitle(room)) })],
    );
    this.loadAvatar(avatar, room.avatarMxc, 48);
    const badges = el("div", { class: "room-badges" });
    if (room.unreadHighlight > 0) {
      badges.appendChild(el("span", { class: "badge strong", text: formatNumber(snapshot.ui.locale, room.unreadHighlight) }));
    } else if (room.unreadTotal > 0) {
      badges.appendChild(el("span", { class: "badge", text: formatNumber(snapshot.ui.locale, room.unreadTotal) }));
    }
    if (room.muted) badges.appendChild(el("span", { class: "badge muted", text: t("rooms.muted") }));
    const row = el("button", {
      class: "room-row",
      attrs: {
        type: "button",
        "aria-current": room.roomId === snapshot.activeRoomId ? "page" : null,
      },
      on: {
        click: () => {
          if (room.membership === "invite") return;
          this.openRoom(room.roomId);
        },
      },
    }, [
      avatar,
      el("div", { class: "room-meta" }, [
        el("span", { class: "room-name", text: roomTitle(room) }),
        el("span", {
          class: "room-preview",
          text: room.kind === "space" ? formatNumber(snapshot.ui.locale, room.children.length) : (room.lastEvent?.preview ?? room.topic),
        }),
      ]),
      badges,
    ]);
    bindActionTrigger(row, (position) => this.openRoomMenu(room, position));
    if (room.membership !== "invite") return row;
    const wrapper = el("div", {}, [row]);
    wrapper.appendChild(
      el("div", { class: "room-invite-actions" }, [
        el("button", {
          class: "button primary",
          text: t("rooms.accept"),
          attrs: { type: "button" },
          on: { click: () => void this.acceptInvite(room.roomId) },
        }),
        el("button", {
          class: "button ghost",
          text: t("rooms.decline"),
          attrs: { type: "button" },
          on: { click: () => void this.declineInvite(room.roomId) },
        }),
      ]),
    );
    return wrapper;
  }

  private async acceptInvite(roomId: string): Promise<void> {
    try {
      await this.adapter.request("joinRoom", { roomIdOrAlias: roomId });
      this.openRoom(roomId);
    } catch (error) {
      this.notify(messageOf(error));
    }
  }

  private async declineInvite(roomId: string): Promise<void> {
    try {
      await this.adapter.request("leaveRoom", { roomId });
    } catch (error) {
      this.notify(messageOf(error));
    }
  }

  private loadAvatar(node: HTMLElement, mxc: string | null, size: number): void {
    if (!mxc) return;
    void this.media.get({ mediaKey: "", mxc, width: size, height: size, method: "crop" }).then((url) => {
      if (url) node.replaceChildren(el("img", { attrs: { src: url, alt: "" } }));
    });
  }

  private replyTo(event: EventRecord): void {
    if (!this.composer) return;
    this.composer.setContext("reply", event.eventId, displayName(this.store.getSnapshot(), event.roomId, event.senderId));
  }

  private editEvent(event: EventRecord): void {
    if (!this.composer) return;
    this.composer.setBody(event.body);
    this.composer.setContext("edit", event.eventId, "");
    this.composer.focus();
  }

  private async redact(event: EventRecord): Promise<void> {
    if (!(await confirmAction(t("room.delete")))) return;
    await this.queueOutbox(event.roomId, "m.room.redaction", redactionContent(event.eventId, null));
  }

  // A chip toggles: pressing your own reaction withdraws it, whether it is still in
  // the outbox or already on the server.
  private async react(event: EventRecord, key: string): Promise<void> {
    const mine = event.reactions[key];
    if (mine?.me) {
      const queued = this.store.getSnapshot().outbox.find((row) => {
        if (row.eventType !== "m.reaction" || row.roomId !== event.roomId) return false;
        const relates = row.content["m.relates_to"];
        return isRecord(relates) && relates["event_id"] === event.eventId && relates["key"] === key;
      });
      if (queued) {
        await this.cancelOutbox(queued.txnId);
        return;
      }
      if (mine.myReaction) {
        await this.queueOutbox(event.roomId, "m.room.redaction", redactionContent(mine.myReaction, null));
        return;
      }
    }
    await this.queueOutbox(event.roomId, "m.reaction", {
      "m.relates_to": { rel_type: "m.annotation", event_id: event.eventId, key },
    });
  }

  private jumpToEvent(eventId: string): void {
    if (!this.store.getSnapshot().events.some((event) => event.eventId === eventId)) {
      this.notify(t("room.jumpMissing"));
      return;
    }
    this.pendingFocusEvent = eventId;
    this.requestRender();
  }

  private openMessageMenu(event: EventRecord, position: ActionPosition): void {
    const own = event.senderId === this.store.getSnapshot().session?.userId;
    const items: ActionMenuItem[] = [];
    if (!event.redacted) {
      items.push({ label: t("room.reply"), icon: "reply", action: () => this.replyTo(event) });
      items.push({
        label: t("room.react"),
        icon: "smile",
        action: () => this.openReactPicker(event),
      });
      if (event.body) {
        items.push({
          label: t("room.copy"),
          icon: "copy",
          action: () => void navigator.clipboard.writeText(event.body).catch(() => undefined),
        });
      }
    }
    if (event.media) {
      items.push({ label: t("room.open"), icon: event.kind === "video" ? "video" : "image", action: () => this.openMedia(event) });
    }
    if (own && !event.redacted) {
      items.push({ label: t("room.edit"), icon: "edit", action: () => this.editEvent(event) });
      items.push({ label: t("room.delete"), icon: "trash", danger: true, action: () => void this.redact(event) });
    }
    this.actionMenu.open(position, items);
  }

  private openReactPicker(event: EventRecord): void {
    if (this.composer) this.openPicker(this.composer.pickerAnchor, { reactTo: event });
  }

  private openFormatMenu(position: ActionPosition): void {
    const composer = this.composer;
    if (!composer) return;
    const active = composer.activeMarks();
    const entry = (mark: MarkType, label: string): ActionMenuItem => ({
      label,
      checked: active.has(mark),
      action: () => composer.applyFormat(mark),
    });
    this.actionMenu.open(position, [
      entry("bold", t("composer.bold")),
      entry("italic", t("composer.italic")),
      entry("underline", t("composer.underline")),
      entry("strike", t("composer.strike")),
      entry("code", t("composer.code")),
      entry("heading", t("composer.heading")),
      entry("quote", t("composer.quote")),
      entry("codeBlock", t("composer.codeBlock")),
      ...(active.size > 0
        ? [{ label: t("composer.clearFormat"), danger: true, action: () => composer.clearFormat() }]
        : []),
    ]);
  }

  private openRoomMenu(room: RoomRecord, position: ActionPosition): void {
    const items: ActionMenuItem[] = [];
    if (room.membership === "invite") {
      items.push({ label: t("rooms.accept"), icon: "check", action: () => void this.acceptInvite(room.roomId) });
      items.push({ label: t("rooms.decline"), icon: "close", danger: true, action: () => void this.declineInvite(room.roomId) });
    } else {
      if (room.lastEvent) {
        items.push({ label: t("rooms.markRead"), icon: "check", action: () => void this.markRoomRead(room) });
      }
      const favorite = room.tags.includes("m.favourite");
      items.push({
        label: favorite ? t("rooms.unfavorite") : t("rooms.favorite"),
        icon: "star",
        action: () => void this.setFavorite(room, !favorite),
      });
      items.push({
        label: room.muted ? t("rooms.unmute") : t("rooms.mute"),
        icon: "volume",
        action: () => void this.setRoomMuted(room, !room.muted),
      });
      items.push({ label: t("rooms.copyLink"), icon: "copy", action: () => void this.copyRoomLink(room) });
      items.push({ label: t("rooms.leave"), icon: "logout", danger: true, action: () => void this.leaveRoom(room) });
    }
    this.actionMenu.open(position, items);
  }

  private async markRoomRead(room: RoomRecord): Promise<void> {
    if (!room.lastEvent) return;
    await this.adapter.request("markRead", { roomId: room.roomId, eventId: room.lastEvent.eventId }).catch((error: unknown) => {
      this.notify(messageOf(error));
    });
  }

  private async setFavorite(room: RoomRecord, favorite: boolean): Promise<void> {
    await this.adapter
      .request("setRoomTag", {
        roomId: room.roomId,
        tag: "m.favourite",
        value: favorite ? {} : null,
      })
      .catch((error: unknown) => this.notify(messageOf(error)));
  }

  private async setRoomMuted(room: RoomRecord, muted: boolean): Promise<void> {
    await this.adapter
      .request("setNotificationMode", { roomId: room.roomId, mode: muted ? "mute" : "unmute" })
      .catch((error: unknown) => this.notify(messageOf(error)));
  }

  private async copyRoomLink(room: RoomRecord): Promise<void> {
    const url = `${window.location.origin}${window.location.pathname}#${this.router.roomPath(room.roomId)}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    this.notify(t("common.copied"));
  }

  private async leaveRoom(room: RoomRecord): Promise<void> {
    if (!(await confirmAction(t("room.leaveConfirm")))) return;
    try {
      await this.adapter.request("leaveRoom", { roomId: room.roomId });
      this.router.navigate("/");
    } catch (error) {
      this.notify(messageOf(error));
    }
  }

  private async send(message: ComposerMessage): Promise<void> {
    const room = this.store.getSnapshot().activeRoomId;
    if (!room) return;
    this.closePicker();
    if (message.body.trim()) {
      const replyEvent =
        message.context?.kind === "reply"
          ? (this.store.getSnapshot().events.find((row) => row.eventId === message.context?.eventId) ?? null)
          : null;
      await this.queueOutbox(
        room,
        "m.room.message",
        messageContent({
          body: message.body,
          formattedBody: message.formattedBody,
          replyTo: replyEvent ? { eventId: replyEvent.eventId, senderId: replyEvent.senderId } : null,
          editTarget: message.context?.kind === "edit" ? message.context.eventId : null,
        }),
      );
    }
    for (const file of message.files) {
      const mime = file.file.type || "application/octet-stream";
      const media: MediaDescriptor = {
        mxc: "",
        mimetype: mime,
        filename: file.file.name,
        size: file.file.size,
        width: 0,
        height: 0,
        encrypted: null,
        thumbnail: null,
      };
      await this.queueOutbox(
        room,
        "m.room.message",
        { msgtype: msgtypeForMime(mime), body: file.file.name, info: { mimetype: mime, size: file.file.size } },
        file.file,
        media,
      );
      URL.revokeObjectURL(file.url);
    }
  }

  private async queueOutbox(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
    blob: Blob | null = null,
    media: MediaDescriptor | null = null,
  ): Promise<void> {
    const txnId = crypto.randomUUID();
    const record: OutboxRecord = {
      txnId,
      roomId,
      eventType,
      content,
      blob,
      media,
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: 0,
      status: "pending",
      error: null,
      eventId: null,
    };
    await this.db.writeOutbox(record);
    this.store.addOutbox(record);
    void this.adapter.request("send", { txnId }).catch((error: unknown) => {
      this.store.updateOutbox(txnId, { status: "failed", error: messageOf(error) });
    });
  }

  private async handleOutboxEvent(
    txnId: string,
    status: string,
    error?: string,
    attempts?: number,
  ): Promise<void> {
    if (status === "sent") {
      this.store.removeOutbox(txnId);
      await this.db.deleteOutbox(txnId);
      return;
    }
    if (status === "failed") {
      this.store.updateOutbox(txnId, {
        status: "failed",
        error: error ?? t("errors.generic"),
        attempts: attempts ?? 0,
      });
      return;
    }
    this.store.updateOutbox(txnId, {
      status: "pending",
      error: error ?? null,
      attempts: attempts ?? 0,
    });
    await this.db
      .writeOutbox({ ...this.store.getSnapshot().outbox.find((row) => row.txnId === txnId)! })
      .catch(() => undefined);
  }

  private async retryOutbox(txnId: string): Promise<void> {
    this.store.updateOutbox(txnId, { status: "pending", error: null });
    try {
      await this.adapter.request("retry", { txnId });
    } catch (error) {
      this.store.updateOutbox(txnId, { status: "failed", error: messageOf(error) });
    }
  }

  private async cancelOutbox(txnId: string): Promise<void> {
    await this.db.deleteOutbox(txnId);
    this.store.removeOutbox(txnId);
    await this.adapter.request("cancelSend", { txnId }).catch(() => undefined);
  }

  // Typing is a rate-limited hint, so the first keystroke of a run starts it and
  // the rest only refresh the local stop timer.
  private async sendTyping(typing: boolean): Promise<void> {
    const roomId = this.store.getSnapshot().activeRoomId;
    if (!roomId) return;
    if (typing) {
      const now = Date.now();
      if (this.typingRoom === roomId && now - this.typingAt < 10_000) return;
      this.typingRoom = roomId;
      this.typingAt = now;
    } else {
      this.typingRoom = null;
      this.typingAt = 0;
    }
    await this.adapter.request("typing", { roomId, typing }).catch(() => undefined);
  }

  private async loadOlder(): Promise<void> {
    const roomId = this.store.getSnapshot().activeRoomId;
    if (!roomId) return;
    try {
      await this.adapter.request("paginate", {
        roomId,
        direction: "b",
        limit: config.limits.timelinePage,
      });
    } catch (error) {
      this.notify(messageOf(error));
    }
  }

  private openMedia(event: EventRecord): void {
    if (!event.media) return;
    const body = el("div", { class: "media-viewer" }, [
      el("div", { class: "media-placeholder", text: t("common.loading") }),
    ]);
    this.dialogs.open({
      title: event.media.filename || t("media.file"),
      body,
      onClose: () => {
        this.dialogName = null;
      },
    });
    void this.media
      .get({
        mediaKey: "",
        mxc: event.media.mxc,
        width: event.media.width,
        height: event.media.height,
        method: "scale",
        ...(event.media.encrypted ? { file: event.media.encrypted } : {}),
      })
      .then((url) => {
        if (!url) {
          body.replaceChildren(el("div", { class: "media-placeholder", text: t("media.error") }));
          return;
        }
        if (event.media?.mimetype.startsWith("video/")) {
          body.replaceChildren(el("video", { attrs: { src: url, controls: true, autoplay: false } }));
        } else if (event.media?.mimetype.startsWith("image/")) {
          const image = el("img", { attrs: { src: url, alt: event.media.filename } });
          image.addEventListener("dblclick", () => image.classList.toggle("zoomed"));
          body.replaceChildren(image);
        } else {
          body.replaceChildren(
            el("a", { class: "button", text: t("common.download"), attrs: { href: url, download: event.media?.filename ?? "file" } }),
          );
        }
      });
  }

  private openProfile(userId: string): void {
    void this.adapter
      .request<{ profile: { userId: string; displayName: string; avatarMxc: string | null; verified: boolean; identityChanged: boolean } }>(
        "getProfile",
        { userId },
      )
      .then((result) => {
        const profile = result.profile;
        const body = el("div", { class: "profile-card" }, [
          el("div", { class: "profile-head" }, [
            this.profileAvatar(profile.avatarMxc, profile.displayName),
            el("div", {}, [
              el("h3", { text: profile.displayName }),
              el("div", { class: "member-id", text: profile.userId }),
            ]),
          ]),
          profile.identityChanged ? el("p", { class: "error-text", text: t("profile.identityChanged") }) : null,
          el("div", { class: "profile-actions" }, [
            el("button", {
              class: "button",
              text: t("profile.copyId"),
              attrs: { type: "button" },
              on: { click: () => void navigator.clipboard.writeText(profile.userId) },
            }),
            el("button", {
              class: "button",
              text: t("profile.verify"),
              attrs: { type: "button" },
              on: { click: () => void this.verifyUser(profile.userId) },
            }),
          ]),
        ]);
        this.dialogs.open({ title: t("nav.profile"), body, onClose: () => { this.dialogName = null; } });
      });
  }

  private profileAvatar(mxc: string | null, name: string): HTMLElement {
    const node = el("div", { class: "avatar lg" }, [el("span", { text: initial(name) })]);
    this.loadAvatar(node, mxc, 96);
    return node;
  }

  private async verifyUser(userId: string): Promise<void> {
    try {
      const result = await this.adapter.request<VerificationResult>("verifyUser", { userId });
      this.store.setVerification({
        requestId: result.requestId,
        phase: "requested",
        userId,
        deviceId: null,
        initiatedByMe: true,
        sas: null,
        error: null,
      });
      this.router.openDialog("verify");
    } catch (error) {
      this.notify(messageOf(error));
    }
  }

  private fatal(message: string): void {
    this.view = "fatal";
    this.root.classList.remove("boot");
    this.root.replaceChildren(
      el("div", { class: "auth" }, [
        el("div", { class: "auth-card" }, [
          el("h1", { text: t("session.error") }),
          el("p", { text: message }),
          el("button", {
            class: "button primary",
            text: t("common.retry"),
            attrs: { type: "button" },
            on: { click: () => window.location.reload() },
          }),
        ]),
      ]),
    );
  }

  private async logout(): Promise<void> {
    if (!(await confirmAction(t("session.logoutConfirm")))) return;
    this.store.setKeyGate("checking");
    try {
      if (this.hash) await this.db.clearAccountUi(this.hash);
      this.db.closeAccount();
      await this.adapter.request("logout", {});
    } catch {
      // Local logout still clears the UI.
    }
    this.composer?.destroy();
    this.timeline?.destroy();
    this.media.clear();
    this.shell = null;
    this.hash = null;
    this.authStep = "server";
    this.discovery = null;
    this.authFields.username = "";
    this.authFields.password = "";
    this.authFields.confirm = "";
    this.recoveryKey = null;
    this.store.setSession(null);
    this.store.setProjection({ revision: 0, rooms: [], events: [], members: [], packs: [], outbox: [] });
    this.router.navigate("/", { replace: true });
    this.requestRender();
  }

  private syncDialogs(): void {
    const route = this.router.route;
    if (!route.dialog) {
      if (this.dialogName) {
        this.dialogName = null;
        this.dialogs.close();
      }
      return;
    }
    if (route.dialog !== this.dialogName) this.renderDialog(route.dialog);
  }

  private renderDialog(name: string): void {
    this.dialogName = name;
    switch (name) {
      case "settings":
        this.renderSettingsDialog();
        break;
      case "search":
        this.renderSearchDialog();
        break;
      case "join":
        this.renderJoinDialog();
        break;
      case "create":
        this.renderCreateDialog();
        break;
      case "new-message":
        this.renderNewMessageDialog();
        break;
      case "room-settings":
        this.renderRoomSettingsDialog();
        break;
      case "verify":
        this.renderVerificationDialog();
        break;
      default:
        this.router.closeDialog();
    }
  }

  private openDialog(name: string, body: HTMLElement, title: string, footer?: HTMLElement): void {
    this.dialogs.open({
      title,
      body,
      ...(footer ? { footer } : {}),
      onClose: () => {
        if (this.dialogName === name) {
          this.dialogName = null;
          if (this.router.route.dialog === name) this.router.closeDialog();
        }
      },
    });
  }

  private renderSettingsDialog(): void {
    const body = el("div", { class: "settings-section" });
    const sections: Array<[string, string]> = [
      ["account", t("settings.account")],
      ["notifications", t("settings.notifications")],
      ["security", t("settings.security")],
      ["about", t("settings.about")],
    ];
    const nav = el("div", { class: "settings-nav" });
    for (const [key, label] of sections) {
      nav.appendChild(
        el("button", {
          class: "button",
          text: label,
          attrs: { type: "button", "aria-pressed": this.settingsSection === key },
          on: {
            click: () => {
              this.settingsSection = key;
              this.dialogName = null;
              this.dialogs.close();
              this.renderDialog("settings");
            },
          },
        }),
      );
    }
    body.appendChild(nav);
    if (this.settingsSection === "account") body.appendChild(this.settingsAccount());
    if (this.settingsSection === "notifications") body.appendChild(this.settingsNotifications());
    if (this.settingsSection === "security") body.appendChild(this.settingsSecurity());
    if (this.settingsSection === "about") body.appendChild(this.settingsAbout());
    this.openDialog("settings", body, t("settings.title"));
  }

  private settingsAccount(): HTMLElement {
    const snapshot = this.store.getSnapshot();
    const name = el("input", { class: "input", attrs: { value: snapshot.session?.displayName ?? "" } });
    const avatar = el("input", { attrs: { type: "file", accept: "image/*" } });
    avatar.addEventListener("change", () => {
      const file = avatar.files?.[0];
      if (file) void this.uploadAvatar(file);
    });
    return el("div", { class: "settings-section" }, [
      this.settingsRow(t("settings.displayName"), name, () => {
        void this.adapter
          .request("setDisplayName", { displayName: name.value })
          .then(() => this.notify(t("settings.saved")))
          .catch((error: unknown) => this.notify(messageOf(error)));
      }),
      el("div", { class: "settings-row" }, [
        el("span", { class: "settings-row-text" }, [el("strong", { text: t("settings.avatar") })]),
        avatar,
      ]),
      el("div", { class: "settings-row" }, [
        el("span", { class: "settings-row-text" }, [el("strong", { text: t("settings.language") })]),
        this.languageSwitch(snapshot.ui.locale),
      ]),
      el("div", { class: "settings-row" }, [
        el("span", { class: "settings-row-text" }, [el("strong", { text: t("settings.privacy") }), el("small", { text: t("settings.privacyBody") })]),
      ]),
    ]);
  }

  private settingsNotifications(): HTMLElement {
    const enabled = this.settings["notificationsEnabled"] === true;
    const preview = this.settings["notificationsPreview"] !== false;
    return el("div", { class: "settings-section" }, [
      el("p", { class: "muted", text: t("settings.notificationsHint") }),
      this.toggleRow(t("settings.notificationsEnable"), enabled, (value) => {
        void this.setNotificationsEnabled(value);
      }),
      this.toggleRow(t("settings.notificationsPreview"), preview, (value) => {
        this.settings["notificationsPreview"] = value;
        void this.db.writeSetting("notificationsPreview", value);
        this.notifier.setPreview(value);
        this.store.patchUi({ notificationsPreview: value });
      }),
      el("div", { class: "settings-row" }, [
        el("span", { class: "settings-row-text" }, [
          el("strong", { text: t("settings.notificationPermission") }),
          el("small", { text: this.notificationPermission }),
        ]),
        el("button", {
          class: "button",
          text: t("settings.notificationsEnable"),
          attrs: { type: "button" },
          on: {
            click: () => {
              void this.notifier.requestPermission().then((permission) => {
                this.notificationPermission = permission;
                this.store.patchUi({ notificationPermission: permission });
                this.dialogName = null;
                this.dialogs.close();
                this.renderDialog("settings");
              });
            },
          },
        }),
      ]),
    ]);
  }

  private settingsSecurity(): HTMLElement {
    const body = el("div", { class: "settings-section" }, [
      el("p", { class: "muted", text: t("settings.sessions") }),
    ]);
    const list = el("div", { class: "session-list" }, [el("div", { class: "empty", text: t("common.loading") })]);
    body.appendChild(list);
    void this.adapter.request<{ devices: DeviceRecord[] }>("getDevices", {}).then((result) => {
      this.store.setDevices(result.devices);
      list.replaceChildren(
        ...result.devices.map((device) =>
          el("div", { class: "session-row" }, [
            el("div", { class: "session-main" }, [
              el("div", {}, [
                el("div", { class: "session-name", text: device.displayName || device.deviceId }),
                el("div", { class: "session-meta", text: `${device.deviceId}${device.current ? ` · ${t("settings.current")}` : ""}` }),
              ]),
            ]),
            el("div", { class: "row" }, [
              el("span", { class: "badge", text: device.verified ? t("settings.verified") : t("settings.unverified") }),
              device.current
                ? null
                : el("button", {
                    class: "button ghost",
                    text: t("settings.signOut"),
                    attrs: { type: "button" },
                    on: { click: () => void this.deleteDevice(device.deviceId) },
                  }),
            ]),
          ]),
        ),
      );
    }).catch((error: unknown) => {
      list.replaceChildren(el("div", { class: "error-text", text: messageOf(error) }));
    });
    body.appendChild(
      el("button", {
        class: "button danger",
        text: t("settings.signOutOthers"),
        attrs: { type: "button" },
        on: { click: () => void this.deleteOtherDevices() },
      }),
    );
    body.appendChild(el("p", { class: "muted", text: t("settings.dataRemains") }));
    return body;
  }

  private settingsAbout(): HTMLElement {
    return el("div", { class: "settings-section" }, [
      el("p", { text: `${config.app.name} ${t("settings.version", { version: config.app.version })}` }),
      el("p", { class: "muted", text: t("settings.licenseBody") }),
      el("a", { class: "button", text: t("settings.source"), attrs: { href: config.app.links.source, target: "_blank", rel: "noopener noreferrer" } }),
    ]);
  }

  private settingsRow(label: string, control: HTMLElement, onClick: () => void): HTMLElement {
    return el("div", { class: "settings-row" }, [
      el("span", { class: "settings-row-text" }, [el("strong", { text: label })]),
      el("div", { class: "row" }, [
        control,
        el("button", { class: "button", text: t("common.save"), attrs: { type: "button" }, on: { click: onClick } }),
      ]),
    ]);
  }

  private toggleRow(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
    const input = el("input", { attrs: { type: "checkbox", checked } });
    input.addEventListener("change", () => onChange(input.checked));
    return el("label", { class: "settings-row" }, [
      el("span", { class: "settings-row-text" }, [el("strong", { text: label })]),
      input,
    ]);
  }

  private async setNotificationsEnabled(value: boolean): Promise<void> {
    if (value) {
      const permission = await this.notifier.requestPermission();
      this.notificationPermission = permission;
      this.store.patchUi({ notificationPermission: permission });
      if (permission !== "granted") {
        this.notify(t("settings.notificationsDenied"));
        return;
      }
    }
    this.settings["notificationsEnabled"] = value;
    this.notifier.setEnabled(value);
    await this.db.writeSetting("notificationsEnabled", value);
    this.dialogName = null;
    this.dialogs.close();
    this.renderDialog("settings");
  }

  private async uploadAvatar(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    try {
      await this.adapter.request("uploadAvatar", { buffer, mime: file.type }, 30000, [buffer]);
      this.notify(t("settings.saved"));
    } catch (error) {
      this.notify(messageOf(error));
    }
  }

  private async deleteDevice(deviceId: string): Promise<void> {
    if (!(await confirmAction(t("settings.signOutConfirm")))) return;
    try {
      await this.adapter.request("deleteDevice", { deviceId });
      this.renderSettingsDialog();
    } catch (error) {
      this.notify(messageOf(error));
    }
  }

  private async deleteOtherDevices(): Promise<void> {
    const devices = this.store.getSnapshot().devices.filter((device) => !device.current);
    if (devices.length === 0) return;
    if (!(await confirmAction(t("settings.signOutOthersConfirm")))) return;
    try {
      await this.adapter.request("deleteDevices", { deviceIds: devices.map((device) => device.deviceId) });
      this.renderSettingsDialog();
    } catch (error) {
      this.notify(messageOf(error));
    }
  }

  private renderSearchDialog(): void {
    const snapshot = this.store.getSnapshot();
    const input = el("input", { class: "input", attrs: { placeholder: t("search.placeholder") } });
    const room = el("select", { class: "select" });
    room.appendChild(el("option", { text: t("search.allRooms"), attrs: { value: "" } }));
    for (const item of snapshot.rooms) room.appendChild(el("option", { text: roomTitle(item), attrs: { value: item.roomId } }));
    const results = el("div", { class: "search-results" });
    const run = (): void => {
      void this.search(input.value, room.value || null, results);
    };
    input.addEventListener("input", () => {
      if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(run, 180);
    });
    room.addEventListener("change", run);
    const body = el("div", { class: "settings-section" }, [
      el("div", { class: "search-box" }, [input, room]),
      results,
    ]);
    this.openDialog("search", body, t("search.title"));
  }

  private async search(query: string, roomId: string | null, target: HTMLElement): Promise<void> {
    if (!query.trim()) {
      target.replaceChildren();
      return;
    }
    target.replaceChildren(el("div", { class: "empty", text: t("common.loading") }));
    try {
      const results = await this.db.search(query, roomId, config.limits.searchLimit);
      if (results.length === 0) {
        target.replaceChildren(el("div", { class: "empty", text: t("search.noResults") }));
        return;
      }
      target.replaceChildren(
        ...results.map((event) =>
          el("button", {
            class: "search-row",
            attrs: { type: "button" },
            on: {
              click: () => {
                this.router.closeDialog();
                this.openRoomAt(event);
              },
            },
          }, [
            el("div", { class: "search-row-meta" }, [
              el("span", { text: displayName(this.store.getSnapshot(), event.roomId, event.senderId) }),
              el("span", { text: roomTitle(roomById(this.store.getSnapshot(), event.roomId) ?? emptyRoom(event.roomId)) }),
            ]),
            el("div", { class: "search-row-text", text: event.body }),
          ]),
        ),
      );
    } catch (error) {
      target.replaceChildren(el("div", { class: "error-text", text: messageOf(error) }));
    }
  }

  private openRoomAt(event: EventRecord): void {
    this.pendingFocusEvent = event.eventId;
    this.openRoom(event.roomId);
  }

  private renderJoinDialog(): void {
    const input = el("input", { class: "input", attrs: { placeholder: "#room:server" } });
    const error = el("p", { class: "error-text", attrs: { hidden: true } });
    const submit = (): void => {
      error.hidden = true;
      void this.adapter
        .request<{ roomId: string }>("joinRoom", { roomIdOrAlias: input.value.trim() })
        .then((result) => {
          this.router.closeDialog();
          this.openRoom(result.roomId);
        })
        .catch((reason: unknown) => {
          error.textContent = messageOf(reason);
          error.hidden = false;
        });
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });
    this.openDialog(
      "join",
      el("div", { class: "settings-section" }, [
        this.field(t("join.room"), input),
        error,
        el("button", { class: "button primary", text: t("join.action"), attrs: { type: "button" }, on: { click: submit } }),
      ]),
      t("join.title"),
    );
  }

  private renderCreateDialog(): void {
    const name = el("input", { class: "input" });
    const topic = el("textarea", { class: "textarea" });
    const visibility = el("select", { class: "select" }, [
      el("option", { text: t("create.private"), attrs: { value: "private" } }),
      el("option", { text: t("create.public"), attrs: { value: "public" } }),
    ]);
    const invite = el("textarea", { class: "textarea", attrs: { placeholder: "@user:server" } });
    const encrypted = el("input", { attrs: { type: "checkbox", checked: true } });
    const error = el("p", { class: "error-text", attrs: { hidden: true } });
    const submit = (): void => {
      error.hidden = true;
      void this.adapter
        .request<{ roomId: string }>("createRoom", {
          name: name.value,
          topic: topic.value,
          visibility: visibility.value,
          invite: invite.value.split(/[\s,]+/).filter(Boolean),
          encrypted: encrypted.checked,
        })
        .then((result) => {
          this.router.closeDialog();
          this.openRoom(result.roomId);
        })
        .catch((reason: unknown) => {
          error.textContent = messageOf(reason);
          error.hidden = false;
        });
    };
    this.openDialog(
      "create",
      el("div", { class: "settings-section" }, [
        this.field(t("create.name"), name),
        this.field(t("create.topic"), topic),
        this.field(t("create.visibility"), visibility),
        this.field(t("create.invite"), invite),
        el("label", { class: "switch" }, [encrypted, t("create.encrypted")]),
        error,
        el("button", { class: "button primary", text: t("create.action"), attrs: { type: "button" }, on: { click: submit } }),
      ]),
      t("create.title"),
    );
  }

  private renderNewMessageDialog(): void {
    const input = el("input", { class: "input", attrs: { placeholder: "@user:server" } });
    const error = el("p", { class: "error-text", attrs: { hidden: true } });
    const submit = (): void => {
      error.hidden = true;
      void this.adapter
        .request<{ roomId: string }>("createDm", { userId: input.value.trim() })
        .then((result) => {
          this.router.closeDialog();
          this.openRoom(result.roomId);
        })
        .catch((reason: unknown) => {
          error.textContent = messageOf(reason);
          error.hidden = false;
        });
    };
    this.openDialog(
      "new-message",
      el("div", { class: "settings-section" }, [
        this.field(t("newMessage.user"), input),
        error,
        el("button", { class: "button primary", text: t("newMessage.action"), attrs: { type: "button" }, on: { click: submit } }),
      ]),
      t("newMessage.title"),
    );
  }

  private renderRoomSettingsDialog(): void {
    const snapshot = this.store.getSnapshot();
    const room = snapshot.activeRoomId ? roomById(snapshot, snapshot.activeRoomId) : null;
    if (!room) {
      this.router.closeDialog();
      return;
    }
    // State events need the power level the server enforces; the form mirrors it
    // so a control that cannot work is disabled instead of failing on submit.
    const canEditState = room.selfPowerLevel >= 50;
    const canInvite = room.selfPowerLevel >= 50;
    const name = el("input", { class: "input", attrs: { value: room.name, disabled: !canEditState } });
    const topic = el("textarea", { class: "textarea", text: room.topic });
    if (!canEditState) topic.disabled = true;
    const avatarInput = el("input", {
      attrs: { type: "file", accept: "image/*", disabled: !canEditState, hidden: true },
    });
    const avatarName = el("span", { class: "muted", text: "" });
    avatarInput.addEventListener("change", () => {
      avatarName.textContent = avatarInput.files?.[0]?.name ?? "";
    });
    const uploadAvatar = async (): Promise<void> => {
      const file = avatarInput.files?.[0];
      if (!file) return;
      const buffer = await file.arrayBuffer();
      await this.adapter.request(
        "uploadRoomAvatar",
        { roomId: room.roomId, buffer, mime: file.type },
        30000,
        [buffer],
      );
    };
    const save = (): void => {
      void this.adapter.request("setRoomState", { roomId: room.roomId, eventType: "m.room.name", content: { name: name.value } });
      void this.adapter.request("setRoomState", { roomId: room.roomId, eventType: "m.room.topic", content: { topic: topic.value } });
      this.router.closeDialog();
    };
    const members = snapshot.members.filter((member) => member.roomId === room.roomId);
    const invite = el("input", { class: "input", attrs: { placeholder: "@user:server" } });
    const body = el("div", { class: "settings-section" }, [
      el("div", { class: "room-settings-tabs" }, [
        el("span", { class: "badge", text: room.isEncrypted ? t("roomSettings.encryptionOn") : t("roomSettings.encryptionOff") }),
      ]),
      this.field(t("roomSettings.name"), name),
      this.field(t("roomSettings.topic"), topic),
      this.field(
        t("roomSettings.avatar"),
        el("div", { class: "row" }, [
          avatarInput,
          el("button", {
            class: "button",
            text: t("roomSettings.chooseFile"),
            attrs: { type: "button", disabled: !canEditState },
            on: { click: () => avatarInput.click() },
          }),
          avatarName,
          el("button", {
            class: "button",
            text: t("settings.uploadAvatar"),
            attrs: { type: "button", disabled: !canEditState },
            on: { click: () => void uploadAvatar().catch((error: unknown) => this.notify(messageOf(error))) },
          }),
        ]),
      ),
      canEditState ? null : el("p", { class: "muted", text: t("roomSettings.noPermission") }),
      el("button", {
        class: "button primary",
        text: t("common.save"),
        attrs: { type: "button", disabled: !canEditState },
        on: { click: save },
      }),
      el("h3", { text: `${t("roomSettings.members")} (${formatNumber(snapshot.ui.locale, room.memberCount)})` }),
      el("div", { class: "member-list" }, members.slice(0, 100).map((member) =>
        el("button", {
          class: "member-row",
          attrs: { type: "button" },
          on: { click: () => this.openProfile(member.userId) },
        }, [
          el("div", { class: "member-main" }, [
            el("span", { class: "member-name", text: member.displayName || member.userId }),
            member.displayName && member.displayName !== member.userId
              ? el("span", { class: "member-id", text: member.userId })
              : null,
          ]),
          el("span", { class: "badge", text: member.membership }),
        ]),
      )),
      this.field(t("roomSettings.invite"), invite),
      el("button", {
        class: "button",
        text: t("roomSettings.invite"),
        attrs: { type: "button", disabled: !canInvite },
        on: {
          click: () => {
            void this.adapter
              .request("invite", { roomId: room.roomId, userId: invite.value.trim() })
              .then(() => {
                invite.value = "";
                this.notify(t("settings.saved"));
              })
              .catch((error: unknown) => this.notify(messageOf(error)));
          },
        },
      }),
      el("div", { class: "settings-row" }, [
        el("span", { class: "settings-row-text" }, [el("strong", { text: t("roomSettings.notifications") })]),
        el("button", {
          class: "button",
          text: room.muted ? t("rooms.unmute") : t("settings.notificationsMute"),
          attrs: { type: "button" },
          on: { click: () => void this.setRoomMuted(room, !room.muted) },
        }),
      ]),
      el("button", {
        class: "button danger",
        text: t("roomSettings.leave"),
        attrs: { type: "button" },
        on: {
          click: async () => {
            if (!(await confirmAction(t("room.leaveConfirm")))) return;
            void this.adapter.request("leaveRoom", { roomId: room.roomId }).then(() => {
              this.router.navigate("/");
              this.router.closeDialog();
            });
          },
        },
      }),
    ]);
    this.openDialog("room-settings", body, t("roomSettings.title"));
  }

  private renderVerificationDialog(): void {
    const verification = this.store.getSnapshot().verification;
    if (!verification) {
      this.router.closeDialog();
      return;
    }
    const body = el("div", { class: "settings-section" }, [
      el("p", { text: t("keygate.sasBody") }),
    ]);
    if (verification.phase === "requested" && !verification.initiatedByMe) {
      body.append(
        el("button", {
          class: "button primary",
          text: t("common.confirm"),
          attrs: { type: "button" },
          on: { click: () => void this.adapter.request("acceptVerification", { requestId: verification.requestId }) },
        }),
      );
    }
    if (verification.sas) {
      body.append(
        this.sasGrid(verification.sas.emoji),
        el("div", { class: "row" }, [
          el("button", {
            class: "button primary",
            text: t("keygate.sasConfirm"),
            attrs: { type: "button" },
            on: { click: () => void this.confirmSas(verification.requestId) },
          }),
          el("button", {
            class: "button ghost",
            text: t("keygate.sasMismatch"),
            attrs: { type: "button" },
            on: { click: () => void this.cancelVerification(verification.requestId) },
          }),
        ]),
      );
    }
    this.openDialog("verify", body, t("keygate.sasTitle"));
  }

  private openUia(request: UiaEvent): void {
    this.uia = request;
    this.uiaAnswering = false;
    const password = el("input", { class: "input", attrs: { type: "password" } });
    const token = el("input", { class: "input" });
    const terms = el("input", { attrs: { type: "checkbox" } });
    const body = el("div", { class: "settings-section" });
    if (request.stages.includes("m.login.password")) {
      body.appendChild(this.field(t("auth.uiaPassword"), password));
    }
    if (request.stages.includes("m.login.registration_token")) {
      body.appendChild(this.field(t("auth.token"), token));
    }
    if (request.stages.includes("m.login.terms")) {
      body.appendChild(el("label", { class: "switch" }, [terms, t("auth.terms")]));
      const policies = uiaPolicies(request.params);
      if (policies.length > 0) {
        body.appendChild(
          el("div", { class: "policy-list" }, policies.map((policy) =>
            el("a", {
              text: policy.name,
              attrs: { href: policy.url, target: "_blank", rel: "noopener noreferrer" },
            }),
          )),
        );
      }
    }
    if (
      !request.stages.includes("m.login.password") &&
      !request.stages.includes("m.login.registration_token") &&
      !request.stages.includes("m.login.terms") &&
      !request.stages.includes("m.login.dummy")
    ) {
      body.appendChild(el("p", { class: "error-text", text: t("auth.registerUnsupported") }));
    }
    const submit = (): void => {
      this.uiaAnswering = true;
      this.uia = null;
      this.dialogs.close();
      this.adapter.answerUia(request.requestId, {
        password: password.value,
        token: token.value,
        terms: terms.checked,
      });
    };
    this.dialogs.open({
      title: t("auth.uiaTitle"),
      body,
      footer: el("button", { class: "button primary", text: t("common.confirm"), attrs: { type: "button" }, on: { click: submit } }),
      onClose: () => {
        this.dialogName = null;
        if (this.uia && !this.uiaAnswering) {
          this.adapter.cancelUia(this.uia.requestId);
          this.uia = null;
        }
      },
    });
  }

  private packImage(url: string, shortcode: string): HTMLElement {
    const image = el("img", { attrs: { alt: shortcode } });
    void this.media.get({ mediaKey: "", mxc: url, width: 64, height: 64, method: "scale" }).then((loaded) => {
      if (loaded) image.setAttribute("src", loaded);
    });
    return image;
  }

  private async sendSticker(image: { url: string; body: string; shortcode: string; info: Record<string, unknown> }): Promise<void> {
    const roomId = this.store.getSnapshot().activeRoomId;
    if (!roomId) return;
    await this.queueOutbox(roomId, "m.sticker", {
      body: image.body || image.shortcode,
      url: image.url,
      info: image.info,
    });
  }

  private openPicker(
    trigger: HTMLElement,
    options: { reactTo?: EventRecord; tab?: "emoji" | "sticker" } = {},
  ): void {
    // A second press on the same trigger closes the panel instead of stacking one more.
    const previous = this.picker;
    if (previous) {
      const sameTrigger = previous.trigger === trigger;
      previous.close();
      if (sameTrigger) return;
    }
    const snapshot = this.store.getSnapshot();
    const reactTo = options.reactTo ?? null;
    const picker = el("div", { class: "picker", attrs: { role: "dialog" } });
    let tab: "emoji" | "sticker" = options.tab ?? "emoji";
    const search = el("input", { class: "input", attrs: { placeholder: t("picker.search"), "aria-label": t("picker.search") } });
    const clearSearch = iconButton(t("composer.clear"), "close", () => {
      search.value = "";
      clearSearch.hidden = true;
      renderList("");
      search.focus();
    }, "icon-button search-clear");
    clearSearch.hidden = true;
    const searchField = el("div", { class: "picker-search" }, [search, clearSearch]);
    const title = el("span", {
      class: "picker-title",
      text: reactTo ? t("room.react") : tab === "sticker" ? t("picker.stickers") : t("picker.emoticons"),
    });
    const head = el("div", { class: "picker-head" }, [
      title,
      iconButton(t("common.close"), "close", () => close(), "icon-button picker-close"),
    ]);
    const body = el("div", { class: "picker-body" });
    const tabs = el("div", { class: "picker-tabs" });
    const emojiTab = el("button", { class: "picker-tab", text: t("picker.emoticons"), attrs: { type: "button" } });
    const stickerTab = el("button", { class: "picker-tab", text: t("picker.stickers"), attrs: { type: "button" } });
    const close = (): void => {
      if (this.picker?.element !== picker) return;
      this.picker = null;
      picker.remove();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", place);
      trigger.setAttribute("aria-expanded", "false");
    };
    const outside = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (picker.contains(target) || trigger.contains(target)) return;
      close();
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      close();
      trigger.focus();
    };
    // The panel floats above the composer bar so a growing draft cannot move it.
    const place = (): void => {
      const bar = this.composer?.element.querySelector(".composer-bar") ?? trigger;
      const rect = bar.getBoundingClientRect();
      const width = Math.min(
        picker.offsetWidth,
        window.innerWidth - 2 * Number.parseFloat(getComputedStyle(picker).getPropertyValue("--space-3") || "8"),
      );
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      picker.style.left = `${left}px`;
      picker.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    };
    const setTab = (next: "emoji" | "sticker"): void => {
      tab = next;
      emojiTab.setAttribute("aria-selected", String(tab === "emoji"));
      stickerTab.setAttribute("aria-selected", String(tab === "sticker"));
      if (!reactTo) title.textContent = tab === "sticker" ? t("picker.stickers") : t("picker.emoticons");
      renderList(search.value.trim());
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "ease-out" });
    };
    const renderList = (query: string): void => {
      body.replaceChildren();
      if (tab === "emoji") {
        const builtins = EMOJI.filter((emoji) => emoji.includes(query));
        if (builtins.length > 0) {
          body.appendChild(
            el("div", { class: "picker-section" }, [
              el("h3", { text: t("picker.emoticons") }),
              el("div", { class: "emoji-grid" }, builtins.map((emoji) =>
                el("button", {
                  class: "emoji-cell",
                  text: emoji,
                  attrs: { type: "button" },
                  on: {
                    click: () => {
                      if (reactTo) {
                        void this.react(reactTo, emoji);
                        close();
                        return;
                      }
                      this.composer?.insertUnicode(emoji);
                    },
                  },
                }),
              )),
            ]),
          );
        }
      }
      for (const pack of snapshot.packs) {
        if (pack.usage !== (tab === "sticker" ? "sticker" : "emoticon")) continue;
        const images = Object.values(pack.images).filter((image) => image.shortcode.includes(query));
        if (images.length === 0) continue;
        body.appendChild(
          el("div", { class: "picker-section" }, [
            el("h3", { text: pack.displayName }),
            el("div", { class: "emoji-grid pack-grid" }, images.map((image) =>
              el("button", {
                class: "emoji-cell pack-cell",
                attrs: { type: "button", title: image.shortcode },
                on: {
                  click: () => {
                    if (tab === "sticker") {
                      void this.sendSticker(image);
                      close();
                      return;
                    }
                    void this.media.get({ mediaKey: "", mxc: image.url, width: 32, height: 32, method: "scale" }).then((url) => {
                      if (url) this.composer?.insertEmoji(image.shortcode, image.url, image.body, image.info);
                    });
                  },
                },
              }, [this.packImage(image.url, image.shortcode)]),
            )),
          ]),
        );
      }
      if (!body.hasChildNodes()) body.appendChild(el("div", { class: "empty", text: t("picker.empty") }));
    };
    search.addEventListener("input", () => {
      clearSearch.hidden = search.value.length === 0;
      renderList(search.value.trim());
    });
    emojiTab.addEventListener("click", () => setTab("emoji"));
    stickerTab.addEventListener("click", () => setTab("sticker"));
    // A reaction is a single Unicode emoji, so a pack has nothing to offer.
    if (reactTo) stickerTab.hidden = true;
    tabs.append(emojiTab, stickerTab);
    picker.append(head, searchField, tabs, body);
    document.body.appendChild(picker);
    setTab(options.tab ?? "emoji");
    if (reactTo) search.focus();
    this.picker = { element: picker, trigger, close };
    trigger.setAttribute("aria-expanded", "true");
    place();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", place);
  }

  private closePicker(): void {
    this.picker?.close();
  }
}

const EMOJI = [
  "😀", "😄", "😁", "😆", "😅", "😂", "🙂", "🙃", "😉", "😊", "😍", "🥰", "😘", "😎", "🤓", "🤔",
  "😐", "😑", "😴", "😮", "😲", "🤯", "😢", "😭", "😤", "😡", "🤬", "🥳", "🤝", "👍", "👎", "👏",
  "🙏", "💪", "👀", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💯", "✨", "🔥", "🎉", "🎂", "☕",
  "🍵", "🍕", "🍔", "🌙", "⭐", "☀️", "🌈", "🌊", "🌸", "🌻", "🐱", "🐶", "🦊", "🐼", "🚀", "💡",
];

function channelSignature(room: RoomRecord, snapshot: AppSnapshot): string {
  return [
    room.roomId,
    roomTitle(room),
    room.topic,
    room.avatarMxc ?? "",
    ...room.children.map((childId) => {
      const child = roomById(snapshot, childId);
      return `${childId}:${child ? `${roomTitle(child)}|${child.topic}|${child.avatarMxc ?? ""}` : ""}`;
    }),
  ].join("|");
}

function gateComplete(status: RecoveryStatus): boolean {
  return status.secretStorage && status.crossSigning;
}

function uiaPolicies(params: Record<string, unknown>): { name: string; url: string }[] {
  const stage = params["m.login.terms"];
  const terms = isRecord(stage) ? stage["terms"] : null;
  if (!isRecord(terms)) return [];
  const policies: { name: string; url: string }[] = [];
  for (const term of Object.values(terms)) {
    const entries = isRecord(term) ? term["policies"] : null;
    if (!isRecord(entries)) continue;
    for (const policy of Object.values(entries)) {
      if (!isRecord(policy)) continue;
      const localized = Object.values(policy).find(
        (value) => isRecord(value) && typeof value["url"] === "string",
      );
      if (!isRecord(localized)) continue;
      const url = localized["url"];
      if (typeof url !== "string") continue;
      policies.push({ name: typeof localized["name"] === "string" ? localized["name"] : url, url });
    }
  }
  return policies;
}

function messageOf(error: unknown): string {
  if (error instanceof WorkerError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function sectionTitle(key: SectionKey): string {
  switch (key) {
    case "invites":
      return t("rooms.invites");
    case "channels":
      return t("rooms.channels");
    case "favorites":
      return t("rooms.favorites");
    case "dms":
      return t("rooms.dms");
    case "lowPriority":
      return t("rooms.lowPriority");
    default:
      return t("rooms.joined");
  }
}

function msgtypeForMime(mime: string): string {
  if (mime.startsWith("image/")) return "m.image";
  if (mime.startsWith("video/")) return "m.video";
  if (mime.startsWith("audio/")) return "m.audio";
  return "m.file";
}

function roomListSignature(
  sections: ReturnType<typeof roomSections>,
  activeRoomId: string | null,
  locale: Locale,
): string {
  const parts = sections.map(
    (section) =>
      `${section.key}:${section.rooms
        .map((room) => `${room.roomId},${room.lastTs},${room.unreadTotal},${room.unreadHighlight},${room.muted ? 1 : 0}`)
        .join(";")}`,
  );
  return [locale, activeRoomId ?? "", ...parts].join("|");
}

function emptyRoom(roomId: string): RoomRecord {
  return {
    roomId,
    kind: "room",
    children: [],
    name: roomId,
    topic: "",
    avatarMxc: null,
    canonicalAlias: null,
    isDirect: false,
    membership: "leave",
    selfMembership: "leave",
    selfPowerLevel: 0,
    memberCount: 0,
    isEncrypted: false,
    joinRule: "invite",
    lastTs: 0,
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
