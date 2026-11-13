import { t } from "../i18n.ts";
import type { Room } from "../core/types.ts";
import { el } from "../ui.ts";
import { get, subscribe } from "./store.ts";
import { openRoom } from "./router.ts";

const SECTIONS = [
  { id: "favorites", match: (room: Room): boolean => room.favorite },
  { id: "direct", match: (room: Room): boolean => room.isDirect && !room.favorite },
  { id: "rooms", match: (room: Room): boolean => !room.isDirect && !room.favorite },
];

const OPEN_KEY = "maski:sections";

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

/**
 * The rooms area is built once. Rows are kept by room id and moved only when the order really
 * changes, so a sync, a repaint or a reload never rebuilds the list under the pointer.
 */
export class Nav {
  private readonly root: HTMLElement;
  private readonly rows = new Map<string, HTMLElement>();
  private order: string[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
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
      const changed = order.length !== this.order.length || order.some((id, index) => this.order[index] !== id);
      if (changed) {
        list.replaceChildren(...rooms.map((room) => this.row(room, state.roomId)));
        this.order = order;
      } else {
        for (const room of rooms) this.update(this.rows.get(room.roomId) ?? null, room, state.roomId);
      }
    }
  }

  private row(room: Room, active: string | null): HTMLElement {
    const existing = this.rows.get(room.roomId);
    const node =
      existing ??
      el("li", { class: "room-row" }, [
        el("a", { class: "room-link", attrs: { href: `#/room/${encodeURIComponent(room.roomId)}` } }, [
          el("span", { class: "room-avatar" }),
          el("span", { class: "room-text" }, [el("span", { class: "room-name" }), el("span", { class: "room-preview" })]),
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
    const avatar = node.querySelector(".room-avatar");
    if (avatar && avatar.textContent !== room.name.slice(0, 1)) avatar.textContent = room.name.slice(0, 1);
    const name = node.querySelector(".room-name");
    if (name && name.textContent !== room.name) name.textContent = room.name;
    const preview = node.querySelector(".room-preview");
    const text = room.preview === null ? "" : room.preview.kind === "image" ? t("room.image") : room.preview.body;
    if (preview && preview.textContent !== text) preview.textContent = text;
  }
}
