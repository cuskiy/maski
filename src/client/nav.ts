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

/** The rooms area: rows are reconciled by room id, so a click is never lost to a rebuild. */
export class Nav {
  private readonly root: HTMLElement;
  private readonly rows = new Map<string, HTMLElement>();

  constructor(root: HTMLElement) {
    this.root = root;
    for (const section of this.root.querySelectorAll<HTMLDetailsElement>("details[data-section]")) {
      const id = section.dataset["section"] ?? "";
      section.open = openState()[id] === true;
      section.addEventListener("toggle", () => remember(id, section.open));
    }
    subscribe(["rooms", "roomId"], () => this.render());
    this.render();
  }

  private render(): void {
    const state = get();
    for (const section of SECTIONS) {
      const list = this.root.querySelector<HTMLElement>(`[data-rows="${section.id}"]`);
      const count = this.root.querySelector<HTMLElement>(`[data-count="${section.id}"]`);
      const details = this.root.querySelector<HTMLElement>(`[data-section="${section.id}"]`);
      if (!list || !count || !details) continue;
      const rooms = state.rooms.filter(section.match).toSorted((a, b) => b.lastTs - a.lastTs);
      count.textContent = rooms.length === 0 ? "" : String(rooms.length);
      details.hidden = rooms.length === 0;
      list.replaceChildren(...rooms.map((room) => this.row(room, state.roomId)));
    }
  }

  private row(room: Room, active: string | null): HTMLElement {
    const existing = this.rows.get(room.roomId);
    const label = room.name;
    const preview = room.preview ? previewOf(room.preview) : "";
    const node =
      existing ??
      el("li", { class: "room-row" }, [
        el("a", { class: "room-link", attrs: { href: `#/room/${encodeURIComponent(room.roomId)}` } }, [
          el("span", { class: "room-avatar", text: label.slice(0, 1) }),
          el("span", { class: "room-text" }, [el("span", { class: "room-name" }), el("span", { class: "room-preview" })]),
        ]),
      ]);
    this.rows.set(room.roomId, node);

    node.classList.toggle("is-active", room.roomId === active);
    const link = node.querySelector("a");
    if (room.roomId === active) link?.setAttribute("aria-current", "page");
    else link?.removeAttribute("aria-current");
    const name = node.querySelector(".room-name");
    if (name) name.textContent = label;
    const text = node.querySelector(".room-preview");
    if (text) text.textContent = preview;
    link?.addEventListener("click", (event) => {
      event.preventDefault();
      openRoom(room.roomId);
    });
    return node;
  }
}

function previewOf(preview: Room["preview"]): string {
  if (!preview) return "";
  if (preview.kind === "image") return t("room.image");
  return preview.body;
}
