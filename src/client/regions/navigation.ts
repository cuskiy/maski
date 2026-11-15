import { nav as navView } from "../../components/nav.ts";
import type { Catalog } from "../../lib/catalog.ts";
import type { ChatState } from "../../core/types.ts";
import { isSectionId } from "../../core/state.ts";
import type { Actions } from "../actions.ts";
import type { Store } from "../store.ts";
import { bindSwipe } from "../swipe.ts";
import { roomPermissions } from "../../core/permissions.ts";

interface NavigationInput {
  readonly store: Store;
  readonly actions: Actions;
  readonly c: Catalog;
}

function rowKey(row: Element): string | null {
  if (!(row instanceof HTMLElement)) return null;
  return row.dataset["room"] ?? row.dataset["space"] ?? null;
}

function cloneElement(element: Element): HTMLElement | null {
  const clone: Node = element.cloneNode(true);
  return clone instanceof HTMLElement ? clone : null;
}

function reconcileRows(current: HTMLOListElement, next: HTMLOListElement): void {
  const active = document.activeElement;
  const focusedRow =
    active instanceof HTMLElement ? active.closest<HTMLElement>("li[data-room], li[data-space]") : null;
  const focusKey = focusedRow?.dataset["room"] ?? focusedRow?.dataset["space"] ?? null;
  const existing = new Map<string, HTMLElement>();
  for (const row of current.children) {
    if (!(row instanceof HTMLElement)) continue;
    const key = rowKey(row);
    if (key !== null) existing.set(key, row);
  }
  const fragment = document.createDocumentFragment();
  for (const desired of next.children) {
    const key = rowKey(desired);
    if (key === null) {
      if (desired instanceof HTMLElement && desired.classList.contains("room-skeleton")) {
        fragment.append(desired.cloneNode(true));
      }
      continue;
    }
    const old = existing.get(key);
    if (old !== undefined && old.isEqualNode(desired)) {
      fragment.append(old);
      existing.delete(key);
      continue;
    }
    const clone = cloneElement(desired);
    if (clone === null) continue;
    fragment.append(clone);
    existing.delete(key);
  }
  current.replaceChildren(fragment);
  if (focusKey !== null) {
    current
      .querySelector<HTMLElement>(`li[data-room="${CSS.escape(focusKey)}"], li[data-space="${CSS.escape(focusKey)}"]`)
      ?.querySelector<HTMLElement>("button.room-main")
      ?.focus({ preventScroll: true });
  }
}

function reconcile(current: HTMLElement, next: HTMLElement): void {
  const sections = current.querySelector<HTMLElement>(".nav-sections");
  const nextSections = next.querySelector<HTMLElement>(".nav-sections");
  const scrollTop = sections?.scrollTop ?? 0;
  if (sections !== null && nextSections !== null) {
    if (nextSections.getAttribute("aria-busy") === "true") sections.setAttribute("aria-busy", "true");
    else sections.removeAttribute("aria-busy");
  }
  for (const nextSection of next.querySelectorAll<HTMLDetailsElement>("details.section[data-section]")) {
    const id = nextSection.dataset["section"];
    if (id === undefined) continue;
    const currentSection = current.querySelector<HTMLDetailsElement>(
      `details.section[data-section="${CSS.escape(id)}"]`,
    );
    if (currentSection === null) continue;
    currentSection.open = nextSection.open;
    const nextCount = nextSection.querySelector(".section-count");
    const currentCount = currentSection.querySelector(".section-count");
    if (nextCount === null) currentCount?.remove();
    else if (currentCount === null) {
      const count = document.createElement("span");
      count.className = "section-count";
      count.textContent = nextCount.textContent;
      currentSection.querySelector(".section-chevron")?.before(count);
    } else {
      currentCount.textContent = nextCount.textContent;
    }
    const nextRows = nextSection.querySelector<HTMLOListElement>(":scope > ol.section-rows");
    const currentRows = currentSection.querySelector<HTMLOListElement>(":scope > ol.section-rows");
    if (nextRows !== null && currentRows !== null) reconcileRows(currentRows, nextRows);
  }
  for (const field of ["avatar", "name", "userId"] as const) {
    const source = next.querySelector<HTMLElement>(`.nav-account [data-field="${field}"]`);
    const target = current.querySelector<HTMLElement>(`.nav-account [data-field="${field}"]`);
    if (source !== null && target !== null) {
      if (field === "avatar") {
        target.replaceChildren(...Array.from(source.childNodes, (node) => node.cloneNode(true)));
      } else {
        target.textContent = source.textContent;
      }
      target.hidden = source.hidden;
    }
  }
  if (sections !== null) sections.scrollTop = scrollTop;
}

export function mountNavigation({ store, actions, c }: NavigationInput): () => void {
  const root = document.querySelector<HTMLElement>(".nav");
  if (root === null) return () => {};

  const render = (): void => {
    const state: ChatState = store.snapshot();
    const next = new DOMParser()
      .parseFromString(navView(state, c, actions.capabilities).value, "text/html")
      .querySelector<HTMLElement>(".nav");
    if (next !== null) reconcile(root, next);
  };

  const onToggle = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLDetailsElement) || !target.matches("details.section[data-section]")) return;
    const id = target.dataset["section"];
    if (id === undefined || !isSectionId(id)) return;
    actions.toggleSection(id, target.open);
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const space = target.closest<HTMLElement>("[data-space-toggle]");
    if (space !== null) {
      event.preventDefault();
      actions.toggleSpace(space.dataset["spaceToggle"] ?? "");
      return;
    }
    const room = target.closest<HTMLButtonElement>("button[data-room]");
    if (room !== null) {
      event.preventDefault();
      actions.selectRoom(room.dataset["room"] ?? "");
      requestAnimationFrame(() => {
        const composer = document.querySelector<HTMLElement>("#composer-input");
        if (composer?.contentEditable !== "false") composer?.focus();
      });
    }
  };

  root.addEventListener("toggle", onToggle, true);
  root.addEventListener("click", onClick);
  const unbindSwipe = bindSwipe(root, {
    target: ".room-main[data-room]",
    onSwipe: (element, direction) => {
      const roomId = element.dataset["room"];
      if (roomId === undefined) return;
      const room = store.snapshot().rooms.find((entry) => entry.roomId === roomId);
      if (room === undefined) return;
      if (direction === "right" && (room.unread > 0 || room.highlight > 0)) actions.markRead(roomId);
      if (direction === "left" && actions.capabilities.setNotification) {
        if (roomPermissions(room, store.snapshot().session?.userId ?? null).mute) actions.toggleMute(roomId);
      }
    },
  });
  const unsubscribe = store.watch(
    ["rooms", "roomsLoading", "roomId", "sections", "openSpaces", "session", "phase", "notifications"],
    render,
  );
  render();
  return () => {
    unsubscribe();
    unbindSwipe();
    root.removeEventListener("toggle", onToggle, true);
    root.removeEventListener("click", onClick);
  };
}
