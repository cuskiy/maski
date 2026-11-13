import { t } from "../i18n.ts";
import type { Media, Room } from "../core/types.ts";
import { el } from "../ui.ts";
import { get, subscribe } from "./store.ts";
import { openRoom } from "./router.ts";
import type { WorkerClient } from "./worker.ts";

const SECTIONS = [
  { id: "favorites", match: (room: Room): boolean => room.favorite },
  { id: "direct", match: (room: Room): boolean => room.isDirect && !room.favorite },
  { id: "rooms", match: (room: Room): boolean => !room.isDirect && !room.favorite },
  { id: "channels", match: (): boolean => false },
];

const OPEN_KEY = "maski:sections";
const TIME = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

function openState(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}");
    return typeof value === "object" && value !== null ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function remember(section: string, open: boolean): void {
  const state = openState();
  state[section] = open;
  localStorage.setItem(OPEN_KEY, JSON.stringify(state));
}

function previewText(room: Room): string {
  const preview = room.preview;
  if (preview === null) return "";
  switch (preview.kind) {
    case "image":
      return t("room.image");
    case "video":
      return t("room.video");
    case "audio":
      return t("room.audio");
    case "file":
      return t("room.file");
    case "sticker":
      return t("room.sticker");
    case "error":
      return t("room.undecryptable");
    default:
      return preview.body;
  }
}

function avatarMedia(url: string): Media {
  return { url, mime: "image/png", size: 0, width: null, height: null, name: "", file: null };
}

function mutedIcon(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon room-muted-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ["M6 8a6 6 0 0 1 12 0v5l2 2H4l2-2V8", "M10 20a2 2 0 0 0 4 0", "M4 4l16 16"]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/**
 * The rooms area is built once. Rows are kept by room id and moved only when the order really
 * changes, so a sync, a repaint or a reload never rebuilds the list under the pointer.
 */
export class Nav {
  private readonly root: HTMLElement;
  private readonly worker: WorkerClient;
  private readonly rows = new Map<string, HTMLElement>();
  private readonly orders = new Map<string, string[]>();
  private readonly avatars = new Map<string, string>();

  constructor(root: HTMLElement, worker: WorkerClient) {
    this.root = root;
    this.worker = worker;
    const open = openState();
    for (const section of this.root.querySelectorAll<HTMLDetailsElement>("details[data-section]")) {
      const id = section.dataset["section"] ?? "";
      section.open = open[id] === true;
      section.addEventListener("toggle", () => remember(id, section.open));
    }
    subscribe(["rooms", "roomId"], () => this.render());
    this.render();
  }

  private render(): void {
    const state = get();
    for (const section of SECTIONS) {
      const rooms = state.rooms.filter(section.match).toSorted((a, b) => b.lastTs - a.lastTs);
      const details = this.root.querySelector<HTMLElement>(`[data-section="${section.id}"]`);
      const count = this.root.querySelector<HTMLElement>(`[data-count="${section.id}"]`);
      const list = this.root.querySelector<HTMLElement>(`[data-rows="${section.id}"]`);
      if (!details || !count || !list) continue;

      // The rooms section is the skeleton and stays; the others appear when they have something.
      details.hidden = section.id !== "rooms" && rooms.length === 0;
      count.textContent = rooms.length === 0 ? "" : String(rooms.length);

      const order = rooms.map((room) => room.roomId);
      const previous = this.orders.get(section.id) ?? [];
      const changed = order.length !== previous.length || order.some((id, index) => previous[index] !== id);
      if (changed) {
        list.replaceChildren(...rooms.map((room) => this.row(room, state.roomId)));
        this.orders.set(section.id, order);
      } else {
        for (const room of rooms) this.update(this.rows.get(room.roomId) ?? null, room, state.roomId);
      }
    }
    const empty = this.root.querySelector<HTMLElement>('[data-empty="rooms"]');
    if (empty) empty.hidden = state.rooms.length > 0;
  }

  private row(room: Room, active: string | null): HTMLElement {
    const existing = this.rows.get(room.roomId);
    const node =
      existing ??
      el("li", { class: "room-row" }, [
        el("a", { class: "room-link", attrs: { href: `#/room/${encodeURIComponent(room.roomId)}` } }, [
          el("span", { class: "room-avatar" }),
          el("span", { class: "room-text" }, [el("span", { class: "room-name" }), el("span", { class: "room-preview" })]),
          el("span", { class: "room-meta" }, [
            el("time", { class: "room-time" }),
            el("span", { class: "badge" }),
            el("span", { class: "room-muted", attrs: { role: "img" } }),
          ]),
        ]),
      ]);
    if (existing === undefined) {
      const link = node.querySelector("a");
      link?.addEventListener("click", (event) => {
        event.preventDefault();
        openRoom(room.roomId);
      });
      this.rows.set(room.roomId, node);
    }
    this.update(node, room, active);
    return node;
  }

  private update(node: HTMLElement | null, room: Room, active: string | null): void {
    if (node === null) return;
    const isActive = room.roomId === active;
    node.classList.toggle("is-active", isActive);
    const link = node.querySelector("a");
    if (isActive) link?.setAttribute("aria-current", "page");
    else link?.removeAttribute("aria-current");

    this.setAvatar(node.querySelector<HTMLElement>(".room-avatar"), room);

    const name = node.querySelector<HTMLElement>(".room-name");
    if (name && name.textContent !== room.name) name.textContent = room.name;
    const preview = node.querySelector<HTMLElement>(".room-preview");
    const text = previewText(room);
    if (preview && preview.textContent !== text) preview.textContent = text;

    const time = node.querySelector<HTMLTimeElement>(".room-time");
    if (time) {
      const show = room.lastTs > 0;
      time.hidden = !show;
      const value = show ? TIME.format(room.lastTs) : "";
      if (time.textContent !== value) time.textContent = value;
      if (show) time.dateTime = new Date(room.lastTs).toISOString();
    }

    const badge = node.querySelector<HTMLElement>(".badge");
    if (badge) {
      const mentioned = room.highlight > 0;
      const show = mentioned || (room.unread > 0 && !room.muted);
      const count = mentioned ? room.highlight : room.unread;
      badge.hidden = !show;
      badge.classList.toggle("is-mention", mentioned);
      const value = show ? (count > 99 ? "99+" : String(count)) : "";
      if (badge.textContent !== value) badge.textContent = value;
    }

    const muted = node.querySelector<HTMLElement>(".room-muted");
    if (muted) {
      muted.hidden = !room.muted;
      muted.setAttribute("aria-label", t("room.muted"));
      if (room.muted && muted.childElementCount === 0) muted.append(mutedIcon());
    }
  }

  private setAvatar(node: HTMLElement | null, room: Room): void {
    if (node === null) return;
    const initial = room.name.slice(0, 1);
    const url = room.avatar;
    const key = url ?? "";
    if (node.dataset["avatar"] === key) {
      if (url === null && node.textContent !== initial) node.textContent = initial;
      return;
    }
    node.dataset["avatar"] = key;
    node.textContent = initial;
    if (url === null) return;
    const cached = this.avatars.get(url);
    if (cached !== undefined) {
      node.replaceChildren(el("img", { class: "room-avatar-image", attrs: { src: cached, alt: room.name } }));
      return;
    }
    void this.worker
      .send<{ blob: Blob }>({ type: "media", media: avatarMedia(url), size: 64 })
      .then(({ blob }) => {
        const object = URL.createObjectURL(blob);
        this.avatars.set(url, object);
        if (node.dataset["avatar"] === url) {
          node.replaceChildren(el("img", { class: "room-avatar-image", attrs: { src: object, alt: room.name } }));
        }
      })
      .catch(() => undefined);
  }
}
