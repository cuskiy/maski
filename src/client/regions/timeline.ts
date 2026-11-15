import { timeline } from "../../components/timeline.ts";
import { t } from "../../lib/catalog.ts";
import type { Catalog } from "../../lib/catalog.ts";
import { REGION } from "../../core/regions.ts";
import type { ChatState, MessageRow, RoomSummary } from "../../core/types.ts";
import type { Actions } from "../actions.ts";
import type { LocaleId } from "../../core/locales.ts";
import type { Store } from "../store.ts";
import { markMultilineBubbles } from "../bubbleLayout.ts";
import { bindSwipe } from "../swipe.ts";

interface TimelineInput {
  readonly store: Store;
  readonly actions: Actions;
  readonly c: Catalog;
  readonly locale: LocaleId;
}

interface Anchor {
  readonly id: string;
  readonly top: number;
}

interface FocusState {
  readonly id: string;
  readonly selector: string | null;
}

function focusSelector(element: HTMLElement): string | null {
  if (element.matches(".message-inner")) return ".message-inner";
  for (const attribute of ["data-reaction", "data-profile", "data-media-open"] as const) {
    const value = element.getAttribute(attribute);
    if (value !== null) return `[${attribute}="${CSS.escape(value)}"]`;
  }
  return null;
}

function isNearBottom(wrap: HTMLElement): boolean {
  return wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 24;
}

function stateRoom(state: ChatState): RoomSummary | null {
  return state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
}

const RUNTIME_CLASSES = ["is-multiline", "is-active", "is-holding"] as const;

function stableMarkup(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const target of [
    clone,
    ...Array.from(clone.querySelectorAll<HTMLElement>(".is-multiline, .is-active, .is-holding")),
  ]) {
    for (const name of RUNTIME_CLASSES) target.classList.remove(name);
  }
  return clone.outerHTML;
}

export function mountTimeline({ store, actions, c, locale }: TimelineInput): () => void {
  const region = document.querySelector<HTMLElement>(`[data-region="${REGION.timeline}"]`);
  const wrap = region?.querySelector<HTMLElement>(".timeline-wrap") ?? null;
  const list = wrap?.querySelector<HTMLOListElement>(".timeline") ?? null;
  if (region === null || wrap === null || list === null) return () => {};

  const note = wrap.querySelector<HTMLElement>('[data-field="state"]');
  let pinned = true;
  let activeRoomId = store.read("roomId");
  let pendingRoomId: string | null = activeRoomId;
  let rendered = new Map<string, MessageRow>();
  let readOnLoad = false;

  const selectionBar = wrap.querySelector<HTMLElement>("[data-selection-bar]");
  const selectionCount = selectionBar?.querySelector<HTMLElement>("[data-selection-count]") ?? null;
  const selected = new Set<string>();
  let selecting = false;
  let ignoreSelectionClick = false;

  const selectedIds = (): readonly string[] =>
    store
      .snapshot()
      .messages.map((message) => message.id)
      .filter((id) => selected.has(id));

  const paintSelection = (): void => {
    region.classList.toggle("is-selecting", selecting);
    if (selectionBar !== null) selectionBar.hidden = !selecting;
    if (selectionCount !== null && selecting) {
      selectionCount.textContent = t(c, "selection.count", { count: String(selected.size) });
    }
    for (const row of list.querySelectorAll<HTMLElement>("li.message")) {
      row.classList.toggle("is-selected", selected.has(row.dataset["id"] ?? ""));
    }
  };

  const stopSelection = (): void => {
    selecting = false;
    selected.clear();
    paintSelection();
  };

  const startSelection = (id: string): void => {
    if (id === "") return;
    selecting = true;
    selected.add(id);
    paintSelection();
  };

  const toggleSelection = (id: string): void => {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    if (selected.size === 0) {
      stopSelection();
      return;
    }
    paintSelection();
  };

  const runSelectionAction = (action: string): void => {
    if (action === "cancel") {
      stopSelection();
      return;
    }
    const state = store.snapshot();
    if (action === "all") {
      selected.clear();
      for (const message of state.messages) selected.add(message.id);
      paintSelection();
      return;
    }
    if (action === "copy") {
      const text = state.messages
        .filter((message) => selected.has(message.id))
        .map((message) => message.body)
        .filter(Boolean)
        .join("\n\n");
      if (text !== "") void navigator.clipboard?.writeText(text).catch(() => {});
      stopSelection();
      return;
    }
    if (action === "delete") {
      const ids = selectedIds();
      stopSelection();
      for (const id of ids) actions.redact(id);
      return;
    }
    if (action === "forward") {
      const ids = selectedIds();
      if (ids.length > 0) {
        document.dispatchEvent(new CustomEvent("maski:forward-open", { detail: { ids } }));
      }
    }
  };

  const updateJump = (): void => {
    const jump = region.querySelector<HTMLButtonElement>(".jump-newest");
    if (jump === null) return;
    const room = stateRoom(store.snapshot());
    const count = room === null ? 0 : Math.max(room.unread, room.highlight);
    jump.textContent = t(c, count > 0 ? "chat.newMessages" : "chat.jump", { count: String(count) });
    jump.hidden = count === 0 || isNearBottom(wrap);
  };

  const markAtBottom = (): void => {
    const room = stateRoom(store.snapshot());
    if (room !== null && (room.unread > 0 || room.highlight > 0) && isNearBottom(wrap)) {
      actions.markRead(room.roomId);
    }
  };

  const captureAnchor = (): Anchor | null => {
    const first = list.querySelector<HTMLElement>("li.message");
    const id = first?.dataset["id"];
    if (first === null || id === undefined) return null;
    return { id, top: first.getBoundingClientRect().top - wrap.getBoundingClientRect().top };
  };

  const restoreAnchor = (anchor: Anchor): void => {
    const row = list.querySelector<HTMLElement>(`li.message[data-id="${CSS.escape(anchor.id)}"]`);
    if (row === null) return;
    const top = row.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
    wrap.scrollTop += top - anchor.top;
  };

  const reconcile = (next: HTMLElement): void => {
    const nextList = next.querySelector<HTMLOListElement>(".timeline");
    if (nextList !== null) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusedRow = active?.closest<HTMLElement>("li.message");
      const focusState: FocusState | null =
        active !== null && focusedRow !== null && focusedRow !== undefined && focusedRow.dataset["id"] !== undefined
          ? { id: focusedRow.dataset["id"], selector: focusSelector(active) }
          : null;
      const currentMessages = new Map<string, HTMLElement>();
      const currentDays = new Map<string, HTMLElement>();
      for (const child of list.children) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.matches("li.message")) {
          const id = child.dataset["id"];
          if (id !== undefined) currentMessages.set(id, child);
        } else if (child.matches("li.row-day")) {
          currentDays.set(child.textContent ?? "", child);
        }
      }
      const nextRendered = new Map<string, MessageRow>();
      const fragment = document.createDocumentFragment();
      for (const desired of nextList.children) {
        if (!(desired instanceof HTMLElement)) continue;
        if (desired.matches("li.row-day")) {
          const key = desired.textContent ?? "";
          fragment.append(currentDays.get(key) ?? desired.cloneNode(true));
          continue;
        }
        if (!desired.matches("li.message")) continue;
        const id = desired.dataset["id"];
        if (id === undefined) continue;
        const message = store.read("messages").find((entry) => entry.id === id);
        if (message !== undefined) nextRendered.set(id, message);
        const old = currentMessages.get(id);
        const same =
          old !== undefined &&
          message !== undefined &&
          rendered.get(id) === message &&
          stableMarkup(old) === stableMarkup(desired);
        fragment.append(old !== undefined && same ? old : desired.cloneNode(true));
      }
      list.replaceChildren(fragment);
      rendered = nextRendered;
      if (focusState !== null) {
        const row = list.querySelector<HTMLElement>(`li.message[data-id="${CSS.escape(focusState.id)}"]`);
        const target =
          (focusState.selector === null ? null : row?.querySelector<HTMLElement>(focusState.selector)) ??
          row?.querySelector<HTMLElement>(".message-inner");
        target?.focus({ preventScroll: true });
      }
    }

    const nextNote = next.querySelector<HTMLElement>('[data-field="state"]');
    if (note !== null && nextNote !== null) note.innerHTML = nextNote.innerHTML;

    const nextOlder = next.querySelector<HTMLButtonElement>(".load-older");
    const currentOlder = wrap.querySelector<HTMLButtonElement>(".load-older");
    if (nextOlder === null) currentOlder?.remove();
    else if (currentOlder === null) wrap.insertBefore(nextOlder.cloneNode(true), list);
    else currentOlder.hidden = nextOlder.hidden;

    const nextJump = next.querySelector<HTMLButtonElement>(".jump-newest");
    const currentJump = region.querySelector<HTMLButtonElement>(".jump-newest");
    if (nextJump === null) currentJump?.remove();
    else if (currentJump === null) region.append(nextJump.cloneNode(true));
  };

  const render = (): void => {
    const state = store.snapshot();
    const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
    const roomChanged = state.roomId !== activeRoomId;
    if (roomChanged) {
      activeRoomId = state.roomId;
      pendingRoomId = state.roomId;
      pinned = true;
      readOnLoad = state.roomId !== null;
      stopSelection();
    }
    if (state.messages.length === 0 && state.roomId !== null) pendingRoomId = state.roomId;
    const anchor = pinned ? null : captureAnchor();
    const next = new DOMParser()
      .parseFromString(timeline(state, c, locale).value, "text/html")
      .querySelector<HTMLElement>(`[data-region="${REGION.timeline}"]`);
    if (next !== null) reconcile(next);
    markMultilineBubbles(list);

    if (pendingRoomId !== null && state.messages.length > 0 && state.messages[0]?.roomId === pendingRoomId) {
      const roomId = pendingRoomId;
      pendingRoomId = null;
      const receipt = room?.readReceipt ?? null;
      const receiptIndex = receipt === null ? -1 : state.messages.findIndex((message) => message.id === receipt);
      const first =
        receiptIndex >= 0 && receiptIndex + 1 < state.messages.length
          ? state.messages[receiptIndex + 1]
          : (room?.unread ?? 0) > 0
            ? state.messages.at(-(room?.unread ?? 0))
            : undefined;
      if (first !== undefined) {
        const row = list.querySelector<HTMLElement>(`li.message[data-id="${CSS.escape(first.id)}"]`);
        if (row !== null) {
          wrap.scrollTop = Math.max(0, row.offsetTop - wrap.clientHeight / 2 + row.offsetHeight / 2);
        }
        pinned = false;
      } else {
        wrap.scrollTop = wrap.scrollHeight;
        pinned = true;
      }
      if (readOnLoad) {
        actions.markRead(roomId);
        readOnLoad = false;
      }
    } else if (pinned) {
      wrap.scrollTop = wrap.scrollHeight;
      markAtBottom();
    } else if (anchor !== null) {
      restoreAnchor(anchor);
    }
    paintSelection();
    updateJump();
  };

  const onScroll = (): void => {
    pinned = isNearBottom(wrap);
    if (pinned) markAtBottom();
    if (wrap.scrollTop < 96 && store.read("hasOlder") && !store.read("olderLoading")) {
      pinned = false;
      actions.loadOlder();
    }
    updateJump();
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".load-older") !== null) {
      event.preventDefault();
      if (store.read("olderLoading")) return;
      pinned = false;
      actions.loadOlder();
      return;
    }
    if (target.closest(".jump-newest") !== null) {
      event.preventDefault();
      wrap.scrollTop = wrap.scrollHeight;
      pinned = true;
      const room = stateRoom(store.snapshot());
      if (room !== null) actions.markRead(room.roomId);
      updateJump();
    }
  };

  const onSelectionClick = (event: MouseEvent): void => {
    if (!selecting) return;
    if (ignoreSelectionClick) {
      ignoreSelectionClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest<HTMLElement>("[data-selection-action]");
    if (action !== null) {
      event.preventDefault();
      event.stopPropagation();
      runSelectionAction(action.dataset["selectionAction"] ?? "");
      return;
    }
    const row = target.closest<HTMLElement>("li.message");
    if (row === null) return;
    const id = row.dataset["id"];
    if (id === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    toggleSelection(id);
  };

  const onSelectMessage = (event: Event): void => {
    const id = (event as CustomEvent<{ id?: string }>).detail?.id;
    if (id !== undefined) startSelection(id);
  };

  const onSelectionClear = (): void => stopSelection();

  const onSelectionKey = (event: KeyboardEvent): void => {
    if (!selecting || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    stopSelection();
  };

  wrap.addEventListener("scroll", onScroll, { passive: true });
  region.addEventListener("click", onClick);
  region.addEventListener("click", onSelectionClick, true);
  document.addEventListener("maski:select-message", onSelectMessage);
  document.addEventListener("maski:selection-clear", onSelectionClear);
  document.addEventListener("keydown", onSelectionKey, true);
  const unbindSwipe = bindSwipe(region, {
    target: ".message-inner",
    canStart: (_element, event) => {
      if (selecting) return false;
      const target = event.target;
      if (target instanceof Element) {
        if (target.closest("a, input, textarea") !== null) return false;
        const button = target.closest("button");
        if (button !== null && !button.classList.contains("media-open")) return false;
      }
      return (window.getSelection()?.toString() ?? "") === "";
    },
    onSwipe: (element, direction) => {
      const id = element.closest<HTMLElement>("li.message")?.dataset["id"];
      if (id === undefined) return;
      if (direction === "right") {
        document.dispatchEvent(new CustomEvent("maski:reply-message", { detail: { id } }));
      } else {
        ignoreSelectionClick = true;
        document.dispatchEvent(new CustomEvent("maski:select-message", { detail: { id } }));
      }
    },
  });
  const resizeObserver = new ResizeObserver(() => {
    markMultilineBubbles(list);
  });
  resizeObserver.observe(wrap);
  const unsubscribe = store.watch(["phase", "roomId", "rooms", "messages", "hasOlder", "olderLoading"], render);
  render();
  return () => {
    unsubscribe();
    resizeObserver.disconnect();
    wrap.removeEventListener("scroll", onScroll);
    region.removeEventListener("click", onClick);
    region.removeEventListener("click", onSelectionClick, true);
    document.removeEventListener("maski:select-message", onSelectMessage);
    document.removeEventListener("maski:selection-clear", onSelectionClear);
    document.removeEventListener("keydown", onSelectionKey, true);
    unbindSwipe();
  };
}
