import type { Message, RoomSummary, SectionId } from "../core/types.ts";
import { t, relativeTime } from "../i18n/index.ts";
import { activeRoom, sections } from "../store/select.ts";
import { setState, state, touch } from "../store/state.ts";
import { Composer } from "./composer.ts";
import type { UiContext } from "./context.ts";
import { el, icon, ICON, keyed } from "./dom.ts";
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
  private ctx: UiContext;

  constructor(ctx: UiContext) {
    this.ctx = ctx;
    this.timeline = new TimelineView(ctx);
    this.composer = new Composer(ctx);
    this.picker = new Picker(ctx);
    this.nav = el("nav", { class: "nav", attrs: { "aria-label": t("nav.rooms") } });
    this.header = el("header", { class: "room-header" });
    this.empty = el("div", { class: "empty-panel" }, [el("h2", { text: t("room.empty") }), el("p", { text: t("room.emptyHint") })]);
    this.content = el("main", { class: "content" }, [this.header, this.empty, this.timeline.root, el("div", { class: "composer-dock" }, [this.picker.root, this.composer.root])]);
    this.root = el("div", { class: "shell" }, [this.nav, this.content]);
    this.picker.root.addEventListener("picker-insert", (event) => {
      const text = (event as CustomEvent<string>).detail;
      this.composer.insert(text);
      this.composer.focus();
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
      { label: t("menu.leave"), action: () => void this.ctx.worker.send({ type: "leave", roomId: room.roomId }), danger: true },
    ]);
  }

  private markRead(room: RoomSummary): void {
    void this.ctx.worker.send({ type: "markRead", roomId: room.roomId, eventId: "" });
  }

  private toggleTag(room: RoomSummary, tag: "m.favourite" | "m.lowpriority"): void {
    const on = tag === "m.favourite" ? !room.favorite : !room.lowPriority;
    void this.ctx.worker.send({ type: "tag", roomId: room.roomId, tag, on });
  }

  private toggleMute(room: RoomSummary): void {
    void this.ctx.worker.send({ type: "mute", roomId: room.roomId, on: !room.muted });
  }

  render(): void {
    this.renderNav();
    this.renderHeader();
    this.timeline.render(state.messages, activeRoom());
    this.root.dataset["view"] = state.activeRoomId ? "room" : "home";
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
    const rows: { key: string; node: HTMLElement }[] = [];
    for (const section of sections()) {
      if (section.rooms.length === 0 && section.id !== "rooms") continue;
      const open = state.settings.sections[section.id];
      const body = el("div", { class: "section-body", attrs: { hidden: !open } });
      rows.push({ key: `h:${section.id}`, node: el("button", { class: "section-head", attrs: { type: "button", "aria-expanded": String(open) }, on: { click: () => this.toggleSection(section.id) } }, [el("span", { text: t(SECTION_LABEL[section.id]) }), el("span", { class: "section-count", text: String(section.rooms.length) })]) });
      rows.push({ key: `s:${section.id}`, node: body });
      for (const room of section.rooms) rows.push({ key: `r:${room.roomId}`, node: this.roomRow(room) });
    }
    keyed(list, rows.map((row) => ({ key: row.key, value: row.node })), (node) => node);
    const account = el("div", { class: "nav-account" }, [
      el("button", { class: "account-row", attrs: { type: "button" }, on: { click: () => this.ctx.openDialog("settings") } }, [
        avatar(state.session?.avatar ?? null, state.session?.displayName ?? "", 28),
        el("span", { class: "account-name", text: state.session?.displayName ?? "" }),
        state.connection === "offline" ? el("span", { class: "account-state", text: t("nav.offline") }) : null,
      ]),
    ]);
    this.nav.replaceChildren(actions, list, account);
  }

  private toggleSection(id: SectionId): void {
    setState({ settings: { ...state.settings, sections: { ...state.settings.sections, [id]: !state.settings.sections[id] } } });
    void this.ctx.local.saveSettings({ sections: state.settings.sections });
    touch();
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
          el("span", { class: "room-row-text", text: room.preview || t("nav.noRooms") }),
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
      this.header.replaceChildren(el("h1", { class: "room-title", text: "maski" }));
      this.empty.hidden = false;
      this.timeline.root.hidden = true;
      this.composer.root.hidden = true;
      return;
    }
    this.empty.hidden = true;
    this.timeline.root.hidden = false;
    this.composer.root.hidden = false;
    const typing = state.typing.length > 0;
    this.header.replaceChildren(
      el("button", { class: "icon-button back-button", attrs: { type: "button", "aria-label": t("common.back") }, on: { click: () => this.ctx.openRoom("") } }, [icon(ICON.back, 20)]),
      el("div", { class: "room-head-text" }, [
        el("h1", { class: "room-title", text: room.name }),
        el("p", {
          class: "room-subtitle",
          text: typing
            ? state.typing.length === 1
              ? t("room.typingOne", { name: state.typing[0]?.name ?? "" })
              : t("room.typingMany", { n: state.typing.length })
            : room.membership === "join"
              ? t("room.joined", { n: room.joined })
              : "",
        }),
      ]),
      iconButton(ICON.more, t("roomSettings.title"), () => this.ctx.openDialog("room-settings", room.roomId)),
    );
    if (room.membership === "invite") {
      this.composer.root.hidden = true;
    }
  }
}

function navAction(path: string, label: string, onClick: () => void): HTMLElement {
  return el("button", { class: "nav-action", attrs: { type: "button" }, on: { click: onClick } }, [icon(path, 18), el("span", { text: label })]);
}

export type { Message };
