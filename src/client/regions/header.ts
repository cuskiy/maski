import { t } from "../../lib/catalog.ts";
import type { Catalog } from "../../lib/catalog.ts";
import { REGION } from "../../core/regions.ts";
import type { RoomSummary } from "../../core/types.ts";
import type { Store } from "../store.ts";

interface HeaderInput {
  readonly store: Store;
  readonly c: Catalog;
}

function setAvatar(target: HTMLElement, room: RoomSummary | null): void {
  target.replaceChildren();
  target.hidden = room === null;
  if (room === null) return;
  if (room.avatar === null) {
    target.textContent = room.name.slice(0, 1);
    return;
  }
  const image = document.createElement("img");
  image.src = room.avatar;
  image.alt = "";
  target.append(image);
}

function roomOf(store: Store): RoomSummary | null {
  const roomId = store.read("roomId");
  return store.read("rooms").find((room) => room.roomId === roomId) ?? null;
}

export function mountHeader({ store, c }: HeaderInput): () => void {
  const header = document.querySelector<HTMLElement>(`[data-region="${REGION.header}"]`);
  if (header === null) return () => {};

  const render = (): void => {
    const room = roomOf(store);
    header.dataset["room"] = room === null ? "none" : "open";
    const avatar = header.querySelector<HTMLElement>('[data-field="avatar"]');
    const title = header.querySelector<HTMLElement>('[data-field="title"]');
    const topic = header.querySelector<HTMLElement>('[data-field="topic"]');
    const menu = header.querySelector<HTMLButtonElement>('[data-field="menu"]');
    if (avatar !== null) setAvatar(avatar, room);
    if (title !== null) title.textContent = room?.name ?? "";
    if (topic !== null) {
      const typing = store.read("typing");
      topic.textContent = typing.length > 0 ? t(c, "chat.typing", { names: typing.join(", ") }) : (room?.topic ?? "");
    }
    if (menu !== null) {
      menu.hidden = room === null;
      menu.dataset["roomId"] = room?.roomId ?? "";
    }
  };

  const unsubscribe = store.watch(["roomId", "rooms", "typing"], render);
  render();
  return unsubscribe;
}
