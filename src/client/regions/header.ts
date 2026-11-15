import { t } from "../../lib/catalog.ts";
import type { Catalog } from "../../lib/catalog.ts";
import { REGION } from "../../core/regions.ts";
import type { RoomSummary } from "../../core/types.ts";
import type { Actions } from "../actions.ts";
import { safeAvatarUrl } from "../../lib/safeUrl.ts";
import type { Store } from "../store.ts";

interface HeaderInput {
  readonly store: Store;
  readonly actions: Actions;
  readonly c: Catalog;
}

function setAvatar(target: HTMLElement, room: RoomSummary | null): void {
  target.replaceChildren();
  target.hidden = room === null;
  if (room === null) return;
  const source = safeAvatarUrl(room.avatar);
  if (source === null) {
    target.textContent = room.name.slice(0, 1);
    return;
  }
  const image = document.createElement("img");
  image.src = source;
  image.alt = "";
  target.append(image);
}

function roomOf(store: Store): RoomSummary | null {
  const roomId = store.read("roomId");
  return store.read("rooms").find((room) => room.roomId === roomId) ?? null;
}

export function mountHeader({ store, actions, c }: HeaderInput): () => void {
  const header = document.querySelector<HTMLElement>(`[data-region="${REGION.header}"]`);
  if (header === null) return () => {};

  const onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element) || event.target.closest(".room-back") === null) return;
    event.preventDefault();
    actions.back();
  };

  const render = (): void => {
    const room = roomOf(store);
    const avatar = header.querySelector<HTMLElement>('[data-field="avatar"]');
    const title = header.querySelector<HTMLElement>('[data-field="title"]');
    const topic = header.querySelector<HTMLElement>('[data-field="topic"]');
    const menu = header.querySelector<HTMLButtonElement>('[data-field="menu"]');
    if (avatar !== null) setAvatar(avatar, room);
    if (title !== null) {
      title.hidden = room === null;
      title.textContent = room?.name ?? "";
    }
    if (topic !== null) {
      topic.hidden = room === null;
      const typing = store.read("typing");
      topic.textContent = typing.length > 0 ? t(c, "chat.typing", { names: typing.join(", ") }) : (room?.topic ?? "");
    }
    if (menu !== null) {
      menu.hidden = room === null;
      menu.dataset["roomId"] = room?.roomId ?? "";
    }
  };

  const unsubscribe = store.watch(["roomId", "rooms", "typing"], render);
  header.addEventListener("click", onClick);
  render();
  return () => {
    unsubscribe();
    header.removeEventListener("click", onClick);
  };
}
