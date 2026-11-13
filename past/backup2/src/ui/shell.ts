import type { RoomSummary, SectionId } from "../core/types.ts";
import { t, relativeTime } from "../i18n/index.ts";
import { activeRoom, roomPreview, sections } from "../store/select.ts";
import { setState, state } from "../store/state.ts";
import { config } from "../app/config.ts";
import { Composer } from "./composer.ts";
import type { UiContext } from "./context.ts";
import { el, icon, ICON } from "./dom.ts";
import { avatar } from "./media.ts";
import { iconButton, openMenu } from "./overlay.ts";
import { Picker } from "./picker.ts";
import { TimelineView } from "./timeline.ts";

const SECTION_LABEL: Record<SectionId, Parameters<typeof t>[0]> = {
  invites: "nav.invites",
  favorites: "nav.favorites",
  direct: "nav.direct",
  rooms: "nav.rooms",
  low: "nav.low",
};

export class Shell {
  readonly root: HTMLElement;
  readonly timeline: TimelineView;
  readonly composer: Composer;
  readonly picker: Picker;
  private nav: HTMLElement;
  private content: HTMLElement;
  private header: HTMLElement;
  private empty: HTMLElement;
  private invite: HTMLElement;
  private intro: HTMLElement;
  private banner: HTMLElement;
  private ctx: UiContext;

  constructor(ctx: UiContext) {
    this.ctx = ctx;
    this.timeline = new TimelineView(ctx);
    this.composer = new Composer(ctx);
    this.picker = new Picker(ctx);
    this.nav = el("nav", { class: "nav", attrs: { "aria-label": t("nav.rooms") } });
    this.header = el("header", { class: "room-header" });
    this.empty = el("div", { class: "empty-panel" }, [el("h2", { text: t("room.empty") }), el("p", { text: t("room.emptyHint") })]);
    this.invite = el("div", { class: "invite-panel", attrs: { hidden: true } });
    this.intro = el("div", { class: "intro-panel", attrs: { hidden: true } });
    this.banner = el("div", { class: "connection-banner", attrs: { hidden: true, role: "status" } });
    this.content = el("main", { class: "content" }, [this.header, this.empty, this.invite, this.intro, this.timeline.root, el("div", { class: "composer-dock" }, [this.picker.root, this.composer.root])]);
    this.root = el("div", { class: "shell" }, [this.nav, this.content, this.banner]);
    this.picker.root.addEventListener("picker-insert", (event) => {
      const text = (event as CustomEvent<string>).detail;
      this.composer.insert(text);
      this.composer.focus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.picker.isOpen) this.picker.close();
    });
    this.nav.addEventListener("contextmenu", (event) => this.onNavMenu(event));
    this.nav.addEventListener("pointerdown", (event) => this.onLongPress(event));
  }

  private longPressTimer = 0;

  private onLongPress(event: PointerEvent): void {
    if (event.pointerType === "mouse") return;
    const row = (event.target as HTMLElement).closest<HTMLElement>(".room-row");
    if (!row) return;
    window.clearTimeout(this.longPressTimer);
    this.longPressTimer = window.setTimeout(() => {
      const roomId = row.dataset["room"];
      const room = roomId ? state.rooms.get(roomId) : null;
      if (room) this.roomMenu(room, event.clientX, event.clientY);
    }, 450);
    const cancel = (): void => window.clearTimeout(this.longPressTimer);
    row.addEventListener("pointerup", cancel, { once: true });
    row.addEventListener("pointercancel", cancel, { once: true });
  }

  private onNavMenu(event: MouseEvent): void {
    const row = (event.target as HTMLElement).closest<HTMLElement>(".room-row");
    const roomId = row?.dataset["room"];
    const room = roomId ? state.rooms.get(roomId) : null;
    if (!room) return;
    event.preventDefault();
    this.roomMenu(room, event.clientX, event.clientY);
  }

  private roomMenu(room: RoomSummary, x: number, y: number): void {
    openMenu(x, y, [
      { label: t("menu.markRead"), action: () => this.markRead(room) },
      { label: room.favorite ? t("menu.unfavorite") : t("menu.favorite"), action: () => this.toggleTag(room, "m.favourite") },
      { label: room.muted ? t("menu.unmute") : t("menu.mute"), action: () => this.toggleMute(room) },
      {
        label: t("menu.leave"),
        danger: true,
        action: () => {
          if (!window.confirm(t("roomSettings.leaveConfirm"))) return;
          void this.ctx.worker.send({ type: "leave", roomId: room.roomId }).catch(() => this.ctx.toast(t("error.forbidden")));
        },
      },
    ]);
  }

  private markRead(room: RoomSummary): void {
    const newest = room.roomId === state.activeRoomId ? state.messages.findLast((message) => message.status === "sent" && message.id.startsWith("$")) : null;
    void this.ctx.worker.send({ type: "markRead", roomId: room.roomId, eventId: newest?.id ?? "" });
  }

  private toggleTag(room: RoomSummary, tag: "m.favourite" | "m.lowpriority"): void {
    const on = tag === "m.favourite" ? !room.favorite : !room.lowPriority;
    void this.ctx.worker
      .send({ type: "tag", roomId: room.roomId, tag, on })
      .then(() => this.ctx.toast(on ? t("toast.favorited") : t("toast.unfavorited")))
      .catch(() => this.ctx.toast(t("error.forbidden")));
  }

  private toggleMute(room: RoomSummary): void {
    const on = !room.muted;
    void this.ctx.worker
      .send({ type: "mute", roomId: room.roomId, on })
      .then(() => this.ctx.toast(on ? t("toast.muted") : t("toast.unmuted")))
      .catch(() => this.ctx.toast(t("error.forbidden")));
  }

  render(): void {
    this.renderBanner();
    this.renderNav();
    this.renderHeader();
    this.renderInvite();
    this.renderIntro();
    this.timeline.render(state.messages, activeRoom());
    this.root.dataset["view"] = state.activeRoomId ? "room" : "home";
  }

  private renderInvite(): void {
    const room = activeRoom();
    const pending = room?.membership === "invite";
    this.invite.hidden = !pending;
    if (!pending || !room) return;
    this.invite.replaceChildren(
      avatar(room.avatar, room.name, 64),
      el("h2", { class: "invite-title", text: room.name }),
      el("p", { class: "dialog-note", text: room.inviter ? t("room.invitedBy", { name: room.inviter }) : t("nav.invites") }),
      el("div", { class: "dialog-actions" }, [
        el("button", {
          class: "button button-primary",
          attrs: { type: "button" },
          on: {
            click: () => {
              void this.ctx.worker
                .send({ type: "join", target: room.roomId })
                .then(() => this.ctx.openRoom(room.roomId))
                .catch(() => this.ctx.toast(t("error.forbidden")));
            },
          },
        }, [el("span", { text: t("room.accept") })]),
        el("button", {
          class: "button",
          attrs: { type: "button" },
          on: {
            click: () => {
              void this.ctx.worker
                .send({ type: "leave", roomId: room.roomId })
                .then(() => this.ctx.openRoom(""))
                .catch(() => this.ctx.toast(t("error.forbidden")));
            },
          },
        }, [el("span", { text: t("room.decline") })]),
      ]),
    );
  }

  private renderIntro(): void {
    const room = activeRoom();
    const fresh = Boolean(room) && room?.membership === "join" && state.messages.length === 0;
    this.intro.hidden = !fresh;
    if (!fresh || !room) return;
    const children: (Node | null)[] = [
      avatar(room.avatar, room.name, 72),
      el("h2", { class: "intro-title", text: room.name }),
      room.topic ? el("p", { class: "intro-topic", text: room.topic }) : null,
      el("p", {
        class: "dialog-note",
        text: room.joined === 1 ? t("room.joinedOne") : t("room.joined", { n: room.joined }),
      }),
      el("p", { class: "dialog-note", text: room.encrypted ? t("roomSettings.encryptionOn") : t("roomSettings.encryptionOff") }),
      el("p", { class: "intro-end", text: t("room.beginning") }),
    ];
    this.intro.replaceChildren(...children.filter((node): node is Node => node !== null));
  }

  private renderBanner(): void {
    const offline = state.connection === "offline" || state.connection === "error";
    this.banner.hidden = !offline;
    if (!offline) return;
    this.banner.replaceChildren(
      el("span", { text: t("nav.offline") }),
      el("button", {
        class: "link-button",
        attrs: { type: "button" },
        on: { click: () => void this.ctx.worker.send({ type: "retrySync" }) },
      }, [el("span", { text: t("common.retry") })]),
    );
  }

  private renderNav(): void {
    const actions = el("div", { class: "nav-actions" }, [
      navAction(ICON.search, t("nav.search"), () => this.ctx.openDialog("search")),
      navAction(ICON.compose, t("nav.newMessage"), () => this.ctx.openDialog("new-message")),
      navAction(ICON.hash, t("nav.join"), () => this.ctx.openDialog("join")),
      navAction(ICON.plus, t("nav.create"), () => this.ctx.openDialog("create")),
      navAction(ICON.settings, t("nav.settings"), () => this.ctx.openDialog("settings")),
    ]);
    const list = el("div", { class: "nav-sections" });
    for (const section of sections()) {
      if (section.rooms.length === 0 && section.id !== "rooms") continue;
      const open = state.settings.sections[section.id];
      list.append(
        el("button", {
          class: "section-head",
          attrs: { type: "button", "aria-expanded": String(open) },
          on: { click: () => this.toggleSection(section.id) },
        }, [
          el("span", { text: t(SECTION_LABEL[section.id]) }),
          el("span", { class: "section-count", text: String(section.rooms.length) }),
          el("span", { class: "section-chevron" }, [icon(ICON.chevron, 14)]),
        ]),
      );
      if (!open) continue;
      const body = el("div", { class: "section-body" });
      if (section.rooms.length === 0) body.append(el("p", { class: "section-empty", text: t("nav.noRooms") }));
      for (const room of section.rooms) body.append(this.roomRow(room));
      list.append(body);
    }
    const account = el("div", { class: "nav-account" }, [
      el("button", { class: "account-row", attrs: { type: "button" }, on: { click: () => this.ctx.openDialog("settings") } }, [
        avatar(state.session?.avatar ?? null, state.session?.displayName ?? "", 28),
        el("span", { class: "account-name", text: state.session?.displayName ?? "" }),
        state.connection === "offline" || state.connection === "error" ? el("span", { class: "account-state", text: t("nav.offline") }) : null,
      ]),
    ]);
    this.nav.replaceChildren(actions, list, account);
  }

  private toggleSection(id: SectionId): void {
    setState({ settings: { ...state.settings, sections: { ...state.settings.sections, [id]: !state.settings.sections[id] } } });
    void this.ctx.local.saveSettings({ sections: state.settings.sections });
  }

  private roomRow(room: RoomSummary): HTMLElement {
    const active = room.roomId === state.activeRoomId;
    const time = room.lastTs ? relativeTime(room.lastTs, Date.now()) : "";
    const row = el("button", {
      class: `room-row${active ? " is-active" : ""}${room.unread > 0 ? " is-unread" : ""}`,
      attrs: { type: "button", ...(active ? { "aria-current": "page" } : {}) },
      dataset: { room: room.roomId },
      on: { click: () => this.ctx.openRoom(room.roomId) },
    }, [
      avatar(room.avatar, room.name, 38),
      el("span", { class: "room-row-body" }, [
        el("span", { class: "room-row-title" }, [
          el("span", { class: "room-row-name", text: room.name }),
          room.muted ? el("span", { class: "room-row-muted", text: "·" }) : null,
          el("span", { class: "room-row-time", text: time }),
        ]),
        el("span", { class: "room-row-preview" }, [
          el("span", { class: "room-row-text", text: roomPreview(room) || t("room.emptyPreview") }),
          room.highlight > 0
            ? el("span", { class: "badge badge-strong", text: String(room.highlight) })
            : room.unread > 0
              ? el("span", { class: "badge", text: String(room.unread) })
              : null,
        ]),
      ]),
    ]);
    return row;
  }

  private renderHeader(): void {
    const room = activeRoom();
    if (!room) {
      this.header.replaceChildren(el("h1", { class: "room-title", text: config.app.name }));
      this.empty.hidden = false;
      this.timeline.root.hidden = true;
      this.composer.root.hidden = true;
      return;
    }
    this.empty.hidden = true;
    const pending = room.membership === "invite";
    this.timeline.root.hidden = pending;
    this.composer.root.hidden = pending;
    this.composer.setReadOnly(pending || !room.canSend ? t("room.noPermission") : null);
    const typing =
      state.typing.length === 0
        ? null
        : state.typing.length === 1
          ? t("room.typingOne", { name: state.typing[0]?.name ?? "" })
          : t("room.typingMany", { n: state.typing.length });
    const members = room.joined === 1 ? t("room.joinedOne") : t("room.joined", { n: room.joined });
    this.header.replaceChildren(
      el("button", {
        class: "icon-button back-button",
        attrs: { type: "button", "aria-label": t("common.back") },
        on: { click: () => this.ctx.openRoom("") },
      }, [icon(ICON.back, 20)]),
      avatar(room.avatar, room.name, 32),
      el("div", { class: "room-head-text" }, [
        el("h1", { class: "room-title", text: room.name }),
        el("p", { class: "room-subtitle", text: typing ?? (room.topic || (room.membership === "join" ? members : "")) }),
      ]),
      iconButton(ICON.more, t("roomSettings.title"), () => this.ctx.openDialog("room-settings", room.roomId)),
    );
  }
}

function navAction(path: string, label: string, onClick: () => void): HTMLElement {
  return el("button", { class: "nav-action", attrs: { type: "button" }, on: { click: onClick } }, [icon(path, 18), el("span", { text: label })]);
}
