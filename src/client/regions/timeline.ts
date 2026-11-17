// Timeline mount keeps scroll anchoring, selection and keyed rows in one lifecycle.
import { timeline } from "../../components/timeline.ts";
import { t } from "../../lib/catalog.ts";
import type { Catalog } from "../../lib/catalog.ts";
import { REGION } from "../../core/regions.ts";
import { isRecord } from "../../lib/json.ts";
import type { ChatState, MessageRow, RoomSummary } from "../../core/types.ts";
import type { Actions } from "../actions.ts";
import type { LocaleId } from "../../core/locales.ts";
import type { Store } from "../store.ts";
import { markMultilineBubbles } from "../bubbleLayout.ts";
import { schedulePaint } from "../paint.ts";
import { bindSwipe } from "../swipe.ts";
import { messagePermissions } from "../../core/permissions.ts";

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

function cloneElement(element: HTMLElement): HTMLElement {
  const copy = element.cloneNode(true);
  if (copy instanceof HTMLElement) return copy;
  throw new Error("a cloned row is not an element");
}

/** Moves list children into order without detaching a node that already sits in its place. */
function patchChildren(list: HTMLOListElement, target: readonly HTMLElement[]): void {
  const current = Array.from(list.children);
  let index = 0;
  for (const node of target) {
    const existing = current[index];
    if (existing === node) {
      index += 1;
      continue;
    }
    list.insertBefore(node, existing ?? null);
    index += 1;
  }
  while (list.children.length > target.length) list.lastElementChild?.remove();
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
  let painted = false;

  let readRequest: string | null = null;

  const selectionBar = region.querySelector<HTMLElement>("[data-selection-bar]");
  const selectionCount = selectionBar?.querySelector<HTMLElement>("[data-selection-count]") ?? null;
  const selected = new Set<string>();
  let selecting = false;

  const selectedIds = (): readonly string[] =>
    store
      .snapshot()
      .messages.map((message) => message.id)
      .filter((id) => selected.has(id));

  const visibleMessageIds = (): readonly string[] => {
    const viewport = wrap.getBoundingClientRect();
    return Array.from(list.querySelectorAll<HTMLElement>("li.message"))
      .filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > viewport.top && rect.top < viewport.bottom;
      })
      .map((row) => row.dataset["id"])
      .filter((id): id is string => id !== undefined);
  };

  const paintSelection = (): void => {
    region.classList.toggle("is-selecting", selecting);
    if (selectionBar !== null) selectionBar.hidden = !selecting;
    if (selectionCount !== null && selecting) {
      selectionCount.textContent = t(c, "selection.count", { count: String(selected.size) });
    }
    for (const row of list.querySelectorAll<HTMLElement>("li.message")) {
      const isSelected = selected.has(row.dataset["id"] ?? "");
      row.classList.toggle("is-selected", isSelected);
      row.querySelector<HTMLElement>(".message-select-mark")?.setAttribute("aria-pressed", String(isSelected));
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
    if (action === "all") {
      for (const id of visibleMessageIds()) selected.add(id);
      paintSelection();
      return;
    }
    if (action === "delete") {
      if (!actions.capabilities.redact) return;
      const snapshot = store.snapshot();
      const currentRoom = snapshot.rooms.find((room) => room.roomId === snapshot.roomId) ?? null;
      const ids = selectedIds().filter((id) => {
        const row = snapshot.messages.find((message) => message.id === id);
        return row !== undefined && messagePermissions(row, currentRoom, snapshot.session?.userId ?? null).redact;
      });
      if (ids.length === 0) return;
      document.dispatchEvent(
        new CustomEvent("maski:confirm", {
          detail: {
            message: t(c, "selection.deleteConfirm", { count: String(ids.length) }),
            action: () => {
              for (const id of ids) {
                selected.delete(id);
                actions.redact(id);
              }
              if (selected.size === 0) stopSelection();
              else paintSelection();
            },
          },
        }),
      );
    }
  };

  const requestedMedia = new Map<string, NonNullable<MessageRow["media"]>>();
  const requestMedia = (): void => {
    const state = store.snapshot();
    const roomId = state.roomId;
    if (roomId === null || !actions.capabilities.media) return;
    const rows = new Map(state.messages.map((message) => [message.id, message]));
    for (const id of visibleMessageIds()) {
      const media = rows.get(id)?.media ?? null;
      if (media === null || media.url !== null) continue;
      if (media.kind !== "image" && media.kind !== "video" && media.kind !== "sticker") continue;
      const key = `${roomId}\n${id}`;
      if (requestedMedia.get(key) === media) continue;
      requestedMedia.set(key, media);
      actions.media(roomId, id, "thumbnail");
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
    if (
      room !== null &&
      store.read("phase") === "ready" &&
      room.latestEventId !== null &&
      room.readReceipt !== room.latestEventId &&
      readRequest !== room.latestEventId &&
      isNearBottom(wrap)
    ) {
      readRequest = room.latestEventId;
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
    // Only a message that arrives into a room already on screen animates in; the first paint and a
    // room switch appear at their final position.
    const arriving = painted && list.children.length > 0;
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
      const byId = new Map(store.read("messages").map((message) => [message.id, message]));
      const ordered: HTMLElement[] = [];
      for (const desired of nextList.children) {
        if (!(desired instanceof HTMLElement)) continue;
        if (desired.matches("li.row-day")) {
          const key = desired.textContent ?? "";
          const day = currentDays.get(key);
          ordered.push(day ?? cloneElement(desired));
          continue;
        }
        if (!desired.matches("li.message")) continue;
        const id = desired.dataset["id"];
        if (id === undefined) continue;
        const message = byId.get(id);
        if (message !== undefined) nextRendered.set(id, message);
        const old = currentMessages.get(id);
        const same = old !== undefined && message !== undefined && rendered.get(id) === message;
        if (old !== undefined && same) {
          ordered.push(old);
          continue;
        }
        const copy = cloneElement(desired);
        if (arriving && old === undefined) {
          copy.classList.add("is-arriving");
          copy.addEventListener("animationend", () => copy.classList.remove("is-arriving"), { once: true });
        }
        ordered.push(copy);
      }
      patchChildren(list, ordered);
      paintSelection();
      rendered = nextRendered;
      painted = true;
      if (focusState !== null) {
        const row = list.querySelector<HTMLElement>(`li.message[data-id="${CSS.escape(focusState.id)}"]`);
        const focusTarget =
          (focusState.selector === null ? null : row?.querySelector<HTMLElement>(focusState.selector)) ??
          row?.querySelector<HTMLElement>(".message-inner");
        focusTarget?.focus({ preventScroll: true });
      }
    }

    const nextNote = next.querySelector<HTMLElement>('[data-field="state"]');
    if (note !== null && nextNote !== null) note.replaceChildren(...nextNote.cloneNode(true).childNodes);

    const nextOlder = next.querySelector<HTMLButtonElement>(".load-older");
    const currentOlder = wrap.querySelector<HTMLButtonElement>(".load-older");
    if (nextOlder === null) currentOlder?.remove();
    else if (currentOlder === null) wrap.insertBefore(nextOlder.cloneNode(true), list);
    else {
      currentOlder.hidden = nextOlder.hidden;
      currentOlder.disabled = nextOlder.disabled;
      currentOlder.setAttribute("aria-busy", nextOlder.getAttribute("aria-busy") ?? "false");
      currentOlder.classList.toggle("is-loading", nextOlder.classList.contains("is-loading"));
      currentOlder.replaceChildren(...nextOlder.cloneNode(true).childNodes);
    }

    const nextJump = next.querySelector<HTMLButtonElement>(".jump-newest");
    const currentJump = region.querySelector<HTMLButtonElement>(".jump-newest");
    if (nextJump === null) currentJump?.remove();
    else if (currentJump === null) region.append(nextJump.cloneNode(true));
  };

  const fitReactionWidths = (): void => {
    const reactions = Array.from(list.querySelectorAll<HTMLElement>(".reactions"));
    const widths = reactions.map((element) => {
      const line = element.closest<HTMLElement>(".message-inner")?.querySelector<HTMLElement>(".message-line");
      return line?.getBoundingClientRect().width ?? 0;
    });
    for (const [index, element] of reactions.entries()) {
      const width = widths[index];
      const next = width === undefined || width <= 0 ? "" : `${String(width)}px`;
      if (element.style.maxInlineSize !== next) element.style.maxInlineSize = next;
    }
  };

  const layout = (): void => {
    markMultilineBubbles(list);
    fitReactionWidths();
  };
  const paint = schedulePaint(layout);
  const scheduleLayout = (): void => paint.schedule();

  const render = (): void => {
    const state = store.snapshot();
    const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
    const roomChanged = state.roomId !== activeRoomId;
    if (roomChanged) {
      activeRoomId = state.roomId;
      pendingRoomId = state.roomId;
      pinned = true;
      readRequest = null;
      requestedMedia.clear();
      stopSelection();
    }
    if (room !== null && readRequest !== null && room.readReceipt === readRequest) readRequest = null;
    if (state.messages.length === 0 && state.roomId !== null) pendingRoomId = state.roomId;
    const anchor = pinned ? null : captureAnchor();
    const next = new DOMParser()
      .parseFromString(timeline(state, c, locale, actions.capabilities).value, "text/html")
      .querySelector<HTMLElement>(`[data-region="${REGION.timeline}"]`);
    if (next !== null) reconcile(next);
    layout();

    if (pendingRoomId !== null && state.messages.length > 0 && state.messages[0]?.roomId === pendingRoomId) {
      pendingRoomId = null;
      const receipt = room?.readReceipt ?? null;
      const receiptIndex = receipt === null ? -1 : state.messages.findIndex((message) => message.eventId === receipt);
      const target = receiptIndex >= 0 ? state.messages[receiptIndex] : undefined;
      if (target !== undefined) {
        const row = list.querySelector<HTMLElement>(`li.message[data-id="${CSS.escape(target.id)}"]`);
        if (row !== null) {
          wrap.scrollTop = Math.max(0, row.offsetTop - wrap.clientHeight / 2 + row.offsetHeight / 2);
        }
        pinned = false;
      } else {
        wrap.scrollTop = wrap.scrollHeight;
        pinned = true;
      }
      if (pinned) markAtBottom();
    } else if (pinned) {
      wrap.scrollTop = wrap.scrollHeight;
      markAtBottom();
    } else if (anchor !== null) {
      restoreAnchor(anchor);
    }
    paintSelection();
    updateJump();
    requestMedia();
  };

  const onScroll = (): void => {
    pinned = isNearBottom(wrap);
    if (pinned) markAtBottom();
    if (wrap.scrollTop < 96 && store.read("hasOlder") && !store.read("olderLoading")) {
      pinned = false;
      actions.loadOlder();
    }
    updateJump();
    requestMedia();
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
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest<HTMLElement>("[data-selection-action]");
    if (action !== null) {
      event.preventDefault();
      event.stopPropagation();
      runSelectionAction(action.dataset["selectionAction"] ?? "");
      return;
    }
    if (target.closest("[data-reaction-more]") !== null) return;
    const row = target.closest<HTMLElement>("li.message");
    if (row === null) return;
    const id = row.dataset["id"];
    if (id === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    toggleSelection(id);
  };

  const onSelectMessage = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!isRecord(detail)) return;
    const id = detail["id"];
    if (typeof id === "string") startSelection(id);
  };

  const onSelectionClear = (): void => stopSelection();

  const onSelectionDelete = (): void => runSelectionAction("delete");

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
  document.addEventListener("maski:selection-delete", onSelectionDelete);
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
        document.dispatchEvent(new CustomEvent("maski:select-message", { detail: { id } }));
      }
    },
  });
  // A resize of the wrap changes the layout only when its inline size changed: a taller composer
  // shrinks the wrap without rewrapping a single bubble.
  let lastInlineSize = wrap.clientWidth;
  const resizeObserver = new ResizeObserver(() => {
    if (wrap.clientWidth === lastInlineSize) return;
    lastInlineSize = wrap.clientWidth;
    scheduleLayout();
  });
  resizeObserver.observe(wrap);
  const unsubscribe = store.watch(["phase", "roomId", "messages", "hasOlder", "olderLoading"], render);
  render();
  return () => {
    unsubscribe();
    paint.cancel();
    resizeObserver.disconnect();
    wrap.removeEventListener("scroll", onScroll);
    region.removeEventListener("click", onClick);
    region.removeEventListener("click", onSelectionClick, true);
    document.removeEventListener("maski:select-message", onSelectMessage);
    document.removeEventListener("maski:selection-clear", onSelectionClear);
    document.removeEventListener("maski:selection-delete", onSelectionDelete);
    document.removeEventListener("keydown", onSelectionKey, true);
    unbindSwipe();
  };
}
