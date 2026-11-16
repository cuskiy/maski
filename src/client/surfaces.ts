// One delegated lifecycle for every overlay keeps focus, popover placement and teardown consistent.
import { t } from "../lib/catalog.ts";
import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import type { ChatState, Media, MessageRow, RoomSummary } from "../core/types.ts";
import { safeMediaUrl } from "../lib/safeUrl.ts";
import { isRecord } from "../lib/json.ts";
import { SURFACE } from "../core/regions.ts";
import {
  isHistoryVisibility,
  isNotificationLevel,
  isRoomJoinRule,
  isRoomNotification,
  isSpaceRoom,
} from "../core/rooms.ts";
import { messagePermissions, roomPermissions } from "../core/permissions.ts";
import { surfaceBodyFor, mediaFilesBody } from "../components/surfaces.ts";
import { isActiveSas, sasBody } from "../components/sas.ts";
import { replaceHtml } from "./dom.ts";
import { emojiPickerBody } from "../components/emoji.ts";
import { stickerSections } from "../components/stickers.ts";
import { icons } from "../components/icons.ts";
import { CHAT_SURFACES } from "../core/surfaces.ts";
import type { Actions } from "./actions.ts";
import type { Store } from "./store.ts";
import type { Composer } from "./regions/composer.ts";

interface SurfacesInput {
  readonly store: Store;
  readonly actions: Actions;
  readonly c: Catalog;
  readonly composer: Composer;
}

interface ProfileTarget {
  readonly name: string;
  readonly userId: string;
}

const CONTEXT_SURFACES = CHAT_SURFACES.filter((surface) => surface.popover === "manual").map((surface) => surface.id);
const CONTEXT_SURFACE_IDS = new Set(CONTEXT_SURFACES);
const POPOVERS = new Set([
  SURFACE.navMenu,
  SURFACE.language,
  ...CHAT_SURFACES.filter((surface) => surface.kind === "floating").map((surface) => surface.id),
]);

function closePopovers(except?: string): void {
  for (const id of new Set([...POPOVERS, ...CONTEXT_SURFACES])) {
    if (id === except) continue;
    const surface = document.getElementById(id);
    if (surface instanceof HTMLElement && surface.matches(":popover-open")) surface.hidePopover();
  }
}

function hide(id: string): void {
  const surface = document.getElementById(id);
  if (surface !== null) {
    for (const nested of surface.querySelectorAll<HTMLDialogElement>("dialog[open]")) nested.close();
  }
  if (surface instanceof HTMLDialogElement) {
    if (surface.open) surface.close();
  } else if (surface instanceof HTMLElement) {
    if (surface.matches(":popover-open")) surface.hidePopover();
  }
}

function closeContextMenus(): void {
  for (const id of CONTEXT_SURFACES) {
    const menu = document.getElementById(id);
    if (!(menu instanceof HTMLElement)) continue;
    menu.style.removeProperty("--context-x");
    menu.style.removeProperty("--context-y");
    if (menu.matches(":popover-open")) menu.hidePopover();
  }
}

function sasDialogElement(): HTMLDialogElement | null {
  const dialog = document.getElementById(SURFACE.sas);
  return dialog instanceof HTMLDialogElement ? dialog : null;
}

function insideContextSurface(target: Element): boolean {
  for (const id of CONTEXT_SURFACE_IDS) {
    if (target.closest(`#${id}`) !== null) return true;
  }
  return false;
}

function closeSelectLists(except?: HTMLElement): void {
  for (const list of document.querySelectorAll<HTMLElement>("[data-select-list]")) {
    if (list !== except && list.matches(":popover-open")) list.hidePopover();
  }
}

function closeRestoredPopovers(): void {
  closePopovers();
}

function showViewer(name: string, kind: string, url: string | null, c: Catalog): void {
  const body = document.querySelector<HTMLElement>(`[data-region="${SURFACE.viewer}-body"]`);
  if (body === null) return;
  const mediaKind: Media["kind"] =
    kind === "video" || kind === "audio" || kind === "sticker" || kind === "file" ? kind : "image";
  const safeUrl = url === null ? null : safeMediaUrl(url, mediaKind);
  if (safeUrl !== null && kind === "video") {
    replaceHtml(
      body,
      html`<div class="viewer-preview is-video">
      <video class="viewer-media" controls autoplay playsinline preload="metadata" src="${safeUrl}" aria-label="${name}"></video>
    </div>`,
    );
    return;
  }
  if (safeUrl !== null && kind === "image") {
    replaceHtml(
      body,
      html`<div class="viewer-preview is-image">
      <button
        class="viewer-zoom"
        type="button"
        data-viewer-zoom
        aria-label="${t(c, "surface.viewer.zoom")}"
        aria-pressed="false"
      >
        <img class="viewer-media" src="${safeUrl}" alt="${name}" />
      </button>
    </div>`,
    );
    return;
  }
  if (safeUrl !== null && kind === "audio") {
    replaceHtml(
      body,
      html`<div class="viewer-preview is-audio">
      <audio class="viewer-media" controls src="${safeUrl}" aria-label="${name}"></audio>
      <span class="viewer-name" dir="auto">${name}</span>
    </div>`,
    );
    return;
  }
  if (kind === "video" || kind === "image") {
    const icon = kind === "video" ? icons.video : icons.image;
    replaceHtml(
      body,
      html`<div class="viewer-preview is-missing">
      <div class="viewer-missing">
        ${icon}
        <span class="viewer-name" dir="auto">${name}</span>
        <p class="note">${t(c, "surface.viewer.missingMedia")}</p>
      </div>
    </div>`,
    );
    return;
  }
  const icon = kind === "audio" ? icons.audio : kind === "sticker" ? icons.sticker : icons.file;
  replaceHtml(
    body,
    html`<div class="viewer-preview is-missing">
    <div class="viewer-missing">${icon}<span class="viewer-name" dir="auto">${name}</span></div>
  </div>`,
  );
}

function copy(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {
    // Clipboard permission can be denied; the mock has no toast.
  });
}

function hasTextSelection(): boolean {
  const selection = document.getSelection();
  return selection !== null && !selection.isCollapsed && selection.toString().trim() !== "";
}

function selectedMessageIds(): string[] {
  return [...document.querySelectorAll<HTMLElement>("li.message.is-selected")]
    .map((row) => row.dataset["id"] ?? "")
    .filter((id) => id !== "");
}

let lastInput: "pointer" | "keyboard" = "pointer";

function onKeyDown(event: KeyboardEvent): void {
  lastInput = "keyboard";
  const target = event.target;
  if (target instanceof Element) {
    const tab = target.closest<HTMLElement>("[data-member-group]");
    if (tab !== null) moveTabFocus(event, tab, "[data-member-group]", selectMemberTab);
    const mediaTab = target.closest<HTMLElement>("[data-media-files-tab]");
    if (mediaTab !== null) moveTabFocus(event, mediaTab, "[data-media-files-tab]", selectMediaTab);
    const stickerTab = target.closest<HTMLElement>("[data-sticker-tab]");
    if (stickerTab !== null) moveTabFocus(event, stickerTab, "[data-sticker-tab]", selectStickerTab);
    const option = target.closest<HTMLElement>('[role="option"]');
    if (option !== null) moveTabFocus(event, option, '[role="option"]', undefined, true);
    const scopeTrigger = target.closest<HTMLElement>("[data-search-scope-button]");
    if (scopeTrigger !== null && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      const scope = document.getElementById("search-scope");
      if (scope instanceof HTMLElement && !scope.matches(":popover-open")) {
        event.preventDefault();
        scope.showPopover();
      }
    }
    const selectTrigger = target.closest<HTMLElement>("[data-select-trigger]");
    if (selectTrigger !== null && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      const listId = selectTrigger.getAttribute("aria-controls");
      const list = listId === null ? null : document.getElementById(listId);
      if (list instanceof HTMLElement && !list.matches(":popover-open")) {
        event.preventDefault();
        closeSelectLists(list);
        list.showPopover();
      }
    }
  }
  const menuItem = target instanceof Element ? target.closest<HTMLElement>('[role="menuitem"]') : null;
  if (
    menuItem !== null &&
    (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Home" || event.key === "End")
  ) {
    const menu = menuItem.closest<HTMLElement>('[role="menu"]');
    const items = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter(
      (item) => !item.hidden && !(item instanceof HTMLButtonElement && item.disabled),
    );
    const index = items.indexOf(menuItem);
    if (index !== -1) {
      const next =
        event.key === "Home"
          ? items[0]
          : event.key === "End"
            ? items.at(-1)
            : items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      if (next !== undefined) {
        event.preventDefault();
        next.focus();
      }
    }
  }
  if (event.key === "Escape") {
    closeContextMenus();
    closePopovers();
  }
}

function searchResultText(c: Catalog, message: MessageRow): string {
  const media = message.media;
  if (media === null) return message.body;
  if (media.kind === "image" || media.kind === "video") {
    const label = t(c, media.kind === "image" ? "chat.media.image" : "chat.media.video");
    const description = message.body === "" ? "" : ` ${message.body}`;
    return `[${label}]${description}`;
  }
  if (media.kind === "sticker") return message.body;
  return media.name;
}

const MEDIA_SEARCH_KEYS = [
  ["image", "chat.media.image"],
  ["video", "chat.media.video"],
  ["file", "chat.media.file"],
  ["audio", "chat.media.audio"],
  ["sticker", "chat.media.sticker"],
] as const satisfies ReadonlyArray<readonly [string, CatalogKey]>;

function mediaKindsForQuery(c: Catalog, query: string): ReadonlySet<string> {
  const normalized = query
    .trim()
    .replace(/^\[|\]$/gu, "")
    .toLowerCase();
  const kinds = new Set<string>();
  for (const [kind, key] of MEDIA_SEARCH_KEYS) {
    if (normalized === t(c, key).toLowerCase()) kinds.add(kind);
  }
  return kinds;
}

function profileIdFromHref(href: string): string | null {
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    // Keep the raw href; a malformed link is still just a normal link.
  }
  return /(?:matrix\.to\/#\/|matrix:u\/)(@[^/?#]+)/u.exec(decoded)?.[1] ?? null;
}

function sourcePoint(element: HTMLElement): { readonly x: number; readonly y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.right, y: rect.bottom };
}

function showMessageSource(target: MessageRow): void {
  const dialog = document.getElementById(SURFACE.messageSource);
  const body = dialog?.querySelector<HTMLElement>(`[data-region="${SURFACE.messageSource}-body"]`);
  if (body === null || body === undefined || !(dialog instanceof HTMLDialogElement)) return;
  const source = {
    id: target.id,
    room_id: target.roomId,
    sender: target.sender,
    sender_name: target.senderName,
    origin_server_ts: new Date(target.ts).toISOString(),
    kind: target.kind,
    body: target.body,
    formatted_body: target.html,
    media: target.media,
    reply: target.reply,
    edited: target.edited,
    reactions: target.reactions,
    encryption: target.encryption,
  };
  replaceHtml(body, html`<pre class="message-source" dir="ltr">${JSON.stringify(source, null, 2)}</pre>`);
  body.scrollTop = 0;
  dialog.showModal();
}

function syncSettingsTabs(): void {
  const dialog = document.querySelector<HTMLElement>(`#${SURFACE.settings}[open], #${SURFACE.roomSettings}[open]`);
  if (dialog === null) return;
  const links = [...dialog.querySelectorAll<HTMLAnchorElement>(".settings-tabs a")];
  const current = links.find((link) => link.hash === location.hash) ?? links[0];
  for (const link of links) {
    if (link === current) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }
  const activeId = current?.hash.slice(1) ?? "";
  for (const panel of dialog.querySelectorAll<HTMLElement>(".settings-panels > .surface-section")) {
    panel.hidden = panel.id !== activeId;
  }
}

function activeInComposer(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.closest(".composer") !== null;
}

function messageContextMenuId(row: HTMLElement): string {
  const selecting = row.closest(".timeline-region")?.classList.contains("is-selecting") === true;
  return selecting && row.classList.contains("is-selected") ? SURFACE.selectionMenu : SURFACE.messageMenu;
}

function jumpToEmojiSection(button: HTMLElement): void {
  const picker = button.closest<HTMLElement>("[data-emoji-picker]");
  const scroll = picker?.querySelector<HTMLElement>("[data-emoji-scroll]");
  const key = button.dataset["emojiJump"];
  const section =
    key === undefined
      ? undefined
      : [...(scroll?.querySelectorAll<HTMLElement>("[data-emoji-section]") ?? [])].find(
          (entry) => entry.dataset["emojiSection"] === key,
        );
  if (scroll === null || scroll === undefined || section === undefined) return;
  for (const jump of picker?.querySelectorAll<HTMLElement>("[data-emoji-jump]") ?? []) {
    if (jump === button) jump.setAttribute("aria-current", "true");
    else jump.removeAttribute("aria-current");
  }
  const top = section.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
  scroll.scrollTo({
    top,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function selectStickerTab(button: HTMLElement): void {
  const picker = button.closest<HTMLElement>("[data-sticker-picker]");
  const key = button.dataset["stickerTab"];
  if (picker === null || key === undefined) return;
  for (const tab of picker.querySelectorAll<HTMLElement>("[data-sticker-tab]")) {
    const selected = tab === button;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of picker.querySelectorAll<HTMLElement>("[data-sticker-panel]")) {
    panel.hidden = panel.dataset["stickerPanel"] !== key;
  }
  const scroll = picker.querySelector<HTMLElement>("[data-sticker-scroll]");
  if (scroll !== null) scroll.scrollTop = 0;
}

function selectMediaTab(button: HTMLElement): void {
  const root = button.closest<HTMLElement>("[data-media-files]");
  const key = button.dataset["mediaFilesTab"];
  if (root === null || key === undefined) return;
  for (const tab of root.querySelectorAll<HTMLElement>("[data-media-files-tab]")) {
    const selected = tab === button;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of root.querySelectorAll<HTMLElement>("[data-media-files-panel]")) {
    panel.hidden = panel.dataset["mediaFilesPanel"] !== key;
  }
}

function selectMemberTab(button: HTMLElement): void {
  const group = button.dataset["memberGroup"];
  const section = button.closest<HTMLElement>(".surface-section");
  if (group === undefined || section === null) return;
  for (const tab of section.querySelectorAll<HTMLElement>("[data-member-group]")) {
    const selected = tab === button;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of section.querySelectorAll<HTMLElement>("[data-member-panel]")) {
    panel.hidden = panel.dataset["memberPanel"] !== group;
  }
}

function moveTabFocus(
  event: KeyboardEvent,
  tab: HTMLElement,
  selector: string,
  select?: (next: HTMLElement) => void,
  vertical = false,
): void {
  const previousKey = vertical ? "ArrowUp" : "ArrowLeft";
  const nextKey = vertical ? "ArrowDown" : "ArrowRight";
  if (event.key !== previousKey && event.key !== nextKey && event.key !== "Home" && event.key !== "End") {
    return;
  }
  const tabs = [...(tab.parentElement?.querySelectorAll<HTMLElement>(selector) ?? [])];
  const index = tabs.indexOf(tab);
  if (index === -1) return;
  const rtl = getComputedStyle(tab).direction === "rtl";
  const step = event.key === previousKey ? (rtl && !vertical ? 1 : -1) : 1;
  const next =
    event.key === "Home"
      ? tabs[0]
      : event.key === "End"
        ? tabs.at(-1)
        : tabs[(index + step + tabs.length) % tabs.length];
  if (next === undefined) return;
  event.preventDefault();
  select?.(next);
  next.focus();
}

function clearSettingsHash(): void {
  if (!location.hash.startsWith("#settings-") && !location.hash.startsWith("#room-settings-")) return;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

function showSettingsError(message: string): void {
  const error = document.querySelector<HTMLElement>("[data-settings-error]");
  if (error === null) return;
  error.textContent = message;
  error.hidden = false;
}

export function wireSurfaces({ store, actions, c, composer }: SurfacesInput): () => void {
  let activeRoomId: string | null = null;
  let activeMessageId: string | null = null;
  let profileTarget: ProfileTarget | null = null;
  let lastMenuSource: HTMLElement | null = null;
  let lastMenuPoint: { readonly x: number; readonly y: number } | null = null;
  let lastMenuWasKeyboard = false;
  let pressTimer: number | null = null;
  let pressPoint: { x: number; y: number } | null = null;
  let pressTarget: {
    readonly roomControl: HTMLElement | null;
    readonly messageRow: HTMLElement | null;
    readonly send: boolean;
    readonly id: string;
  } | null = null;
  let pressLong = false;
  let suppressClick = false;
  let suppressNextContext = false;
  let pendingConfirm: (() => void) | null = null;
  let confirmFocus: HTMLElement | null = null;
  let desktopRequest = 0;
  let pendingResetKey = false;
  let pendingSearch: { readonly roomId: string; readonly messageId: string } | null = null;
  let sasError: CatalogKey | null = null;
  let sasConfirmedId: string | null = null;
  let sasDismissedId: string | null = null;
  let sasSentCancelId: string | null = null;
  let sasShownId: string | null = null;

  const state = (): ChatState => store.snapshot();
  const capabilities = actions.capabilities;
  const popoverReturnFocus = new Map<string, HTMLElement>();
  const room = (id: string | null): RoomSummary | null => state().rooms.find((entry) => entry.roomId === id) ?? null;
  const message = (id: string | null): MessageRow | null => state().messages.find((entry) => entry.id === id) ?? null;
  let viewerMessageId: string | null = null;

  function renderSas(): void {
    const body = sasDialogElement()?.querySelector<HTMLElement>(`[data-region="${SURFACE.sas}-body"]`);
    if (body === null || body === undefined) return;
    const sas = state().sas;
    replaceHtml(
      body,
      sasBody(c, sas, {
        dialogId: SURFACE.sas,
        error: sasError,
        confirmed: sasConfirmedId !== null && sasConfirmedId === sas?.id,
      }),
    );
  }

  function openSas(): void {
    const dialog = sasDialogElement();
    if (dialog === null) return;
    renderSas();
    if (!dialog.open) dialog.showModal();
  }

  function failSas(): void {
    sasError = "auth.key.sasFailed";
    openSas();
  }

  function cancelSas(id: string): void {
    if (sasSentCancelId === id) return;
    sasSentCancelId = id;
    void actions.cancelSas(id).catch(() => undefined);
  }

  function handleSasAction(action: string): void {
    const sas = state().sas;
    if (sas === null) return;
    sasError = null;
    if (action === "accept") {
      void actions.acceptSas(sas.id).catch(failSas);
    } else if (action === "confirm") {
      sasConfirmedId = sas.id;
      renderSas();
      void actions.confirmSas(sas.id).catch(failSas);
    } else if (action === "mismatch") {
      void actions.mismatchSas(sas.id).catch(failSas);
    } else if (action === "cancel") {
      sasDismissedId = sas.id;
      cancelSas(sas.id);
      sasDialogElement()?.close();
    }
  }

  function downloadMedia(roomId: string, messageId: string, name: string): void {
    void actions.resolveMedia(roomId, messageId, "full").then((url) => {
      if (url === null) return;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name === "" ? "attachment" : name;
      anchor.rel = "noreferrer";
      anchor.click();
    });
  }

  function refreshBody(id: string, overrideRoomId?: string | null): void {
    if (id === SURFACE.profile || id === SURFACE.viewer) return;
    const body = document.querySelector<HTMLElement>(`[data-region="${id}-body"]`);
    if (body === null) return;
    if (id === SURFACE.emoji || id === SURFACE.reaction) {
      const reaction = id === SURFACE.reaction;
      const extra =
        !reaction && state().stickersEnabled && capabilities.stickers
          ? stickerSections(c, state().session?.stickerPacks ?? [])
          : html``;
      replaceHtml(
        body,
        emojiPickerBody(
          c,
          reaction ? state().recentReactions : state().recentEmoji,
          reaction ? "reaction" : "emoji",
          extra,
        ),
      );
      body.scrollTop = 0;
      for (const jump of body.querySelectorAll<HTMLElement>("[data-emoji-jump]")) {
        jump.addEventListener("click", (event) => {
          event.preventDefault();
          jumpToEmojiSection(jump);
        });
      }
      return;
    }
    const active = document.activeElement;
    const focus =
      active instanceof HTMLElement && body.contains(active)
        ? {
            action: active.dataset["settingsAction"] ?? null,
            deviceId: active.dataset["deviceId"] ?? null,
          }
        : null;
    const memberGroup =
      body.querySelector<HTMLElement>(".member-tab[aria-selected='true']")?.dataset["memberGroup"] ?? null;
    const scrollTop = body.scrollTop;
    const current = state();
    const target = overrideRoomId === undefined ? current : { ...current, roomId: overrideRoomId };
    replaceHtml(body, surfaceBodyFor(c, id, target, capabilities));
    body.scrollTop = scrollTop;
    if (memberGroup !== null) {
      const tab = body.querySelector<HTMLElement>(`[data-member-group="${CSS.escape(memberGroup)}"]`);
      if (tab !== null) selectMemberTab(tab);
    }
    if (focus !== null && focus.action !== null) {
      const device = focus.deviceId === null ? "" : `[data-device-id="${CSS.escape(focus.deviceId)}"]`;
      const next =
        body.querySelector<HTMLElement>(`[data-settings-action="${CSS.escape(focus.action)}"]${device}`) ??
        body.querySelector<HTMLElement>("button:not([hidden])");
      next?.focus({ preventScroll: true });
    }
    syncSettingsTabs();
  }

  function filterMenu(id: string, context = false): void {
    const body = document.querySelector<HTMLElement>(`[data-region="${id}-body"]`);
    if (body === null) return;
    if (id === SURFACE.roomMenu) {
      const target = room(activeRoomId ?? state().roomId);
      const allowed = new Set<string>();
      if (target !== null) {
        const permissions = roomPermissions(target, state().session?.userId ?? null);
        if (isSpaceRoom(target)) {
          allowed.add("spaceMenu.settings");
          if (permissions.leave) allowed.add("spaceMenu.leave");
        } else if (context) {
          if (permissions.markRead) allowed.add("roomMenu.markRead");
          if (permissions.mute) allowed.add("roomMenu.mute");
          if (permissions.favorite) allowed.add("roomMenu.favorite");
          if (permissions.leave) allowed.add("roomMenu.leave");
        } else {
          allowed.add("roomMenu.settings");
          allowed.add("roomMenu.mediaFiles");
          allowed.add("roomMenu.search");
          if (permissions.invite) allowed.add("roomMenu.invite");
        }
      }
      for (const item of body.querySelectorAll<HTMLElement>("[data-menu-key]")) {
        item.hidden = !allowed.has(item.dataset["menuKey"] ?? "");
      }
      return;
    }
    if (id === SURFACE.messageMenu) {
      const target = message(activeMessageId);
      const allowed = new Set<string>();
      if (target !== null) {
        const permissions = messagePermissions(target, room(target.roomId), state().session?.userId ?? null);
        if (permissions.reply) allowed.add("messageMenu.reply");
        if (permissions.react) allowed.add("messageMenu.react");
        if (permissions.edit) allowed.add("messageMenu.edit");
        if (permissions.redact) allowed.add("messageMenu.delete");
        if (permissions.copy) allowed.add("messageMenu.copy");
        allowed.add("messageMenu.source");
        allowed.add("messageMenu.select");
        if (target.own && target.status !== "sent") allowed.add("messageMenu.cancel");
        if (target.own && target.status === "failed" && target.retryable) allowed.add("messageMenu.retry");
      }
      for (const item of body.querySelectorAll<HTMLElement>("[data-action]")) {
        item.hidden = !allowed.has(item.dataset["action"] ?? "");
      }
    }
  }

  function openContextMenu(
    id: string,
    sourceElement: HTMLElement,
    point: { readonly x: number; readonly y: number },
    centered = false,
    keyboard = false,
  ): void {
    const menu = document.getElementById(id);
    if (!(menu instanceof HTMLElement)) return;
    closePopovers(id);
    filterMenu(id, id === SURFACE.roomMenu);
    lastMenuSource =
      id === SURFACE.messageMenu
        ? (sourceElement.querySelector<HTMLElement>(".message-inner") ?? sourceElement)
        : sourceElement;
    if (id === SURFACE.messageMenu) lastMenuPoint = point;
    lastMenuWasKeyboard = keyboard;
    if (id === SURFACE.messageMenu) sourceElement.classList.add("is-active");
    menu.classList.add("is-context", "is-measuring");
    menu.style.setProperty("--context-x", `${String(point.x)}px`);
    menu.style.setProperty("--context-y", `${String(point.y)}px`);
    menu.showPopover();
    const rect = menu.getBoundingClientRect();
    let x = centered ? point.x - rect.width / 2 : point.x + 4;
    let y = centered ? point.y - rect.height / 2 : point.y + 4;
    x = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
    y = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
    menu.style.setProperty("--context-x", `${String(x)}px`);
    menu.style.setProperty("--context-y", `${String(y)}px`);
    menu.classList.remove("is-measuring");
    if (keyboard) {
      const first = menu.querySelector<HTMLElement>(
        id === SURFACE.reaction ? "[data-emoji]" : ".surface-item:not([hidden])",
      );
      first?.focus({ preventScroll: true });
    }
  }

  function showProfile(name: string, userId: string): void {
    if (name === "") return;
    profileTarget = { name, userId };
    const body = document.querySelector<HTMLElement>(`[data-region="${SURFACE.profile}-body"]`);
    if (body === null) return;
    replaceHtml(
      body,
      html`<div class="profile-card">
      <span class="profile-avatar" aria-hidden="true">${name.slice(0, 1)}</span>
      <h3 class="profile-name" dir="auto">${name}</h3>
      <p class="note" dir="ltr">${userId}</p>
      ${
        capabilities.addRoom && capabilities.inviteUser
          ? html`<button class="button-primary" type="button" data-profile-action="message">
              ${t(c, "surface.profile.message")}
            </button>`
          : html``
      }
    </div>`,
    );
  }

  function downloadRecovery(): void {
    const key = state().recoveryKey;
    if (key === null) return;
    const blob = new Blob([key.value], { type: "text/plain" });
    const anchor = document.createElement("a");
    const url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = "maski-recovery-key.txt";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function askConfirm(text: string, action: () => void): void {
    const dialog = document.getElementById(SURFACE.confirm);
    if (!(dialog instanceof HTMLDialogElement)) {
      action();
      return;
    }
    const target = dialog.querySelector<HTMLElement>("[data-confirm-message]");
    if (target !== null) target.textContent = text;
    pendingConfirm = action;
    confirmFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
  }

  function showResetKeyDialog(value: string): void {
    const dialog = document.getElementById("reset-key-dialog");
    const output = dialog?.querySelector<HTMLElement>("[data-reset-key-value]");
    const status = document.querySelector<HTMLElement>('[data-setting-value="recovery"]');
    if (status !== null) status.textContent = t(c, "settings.recoveryShown");
    if (output === null || output === undefined || !(dialog instanceof HTMLDialogElement)) return;
    output.textContent = value;
    dialog.showModal();
  }

  function applySelectValue(name: string, value: string): void {
    const roomId = activeRoomId ?? state().roomId;
    if (name === "notification-level") {
      if (isNotificationLevel(value)) actions.setNotificationLevel(value);
    } else if (name === "room-notifications" && roomId !== null) {
      if (isRoomNotification(value)) actions.setNotification(roomId, value);
    } else if (name === "room-join" && roomId !== null) {
      if (isRoomJoinRule(value)) actions.updateRoomAccess(roomId, { joinRule: value });
    } else if (name === "room-guest" && roomId !== null) {
      actions.updateRoomAccess(roomId, { guestAccess: value === "can_join" ? "can_join" : "forbidden" });
    } else if (name === "room-history" && roomId !== null) {
      if (isHistoryVisibility(value)) actions.updateRoomAccess(roomId, { historyVisibility: value });
    } else if (name === "room-directory" && roomId !== null) {
      actions.updateRoomAccess(roomId, { directoryPublished: value === "true" });
    }
  }

  function chooseSelect(option: HTMLElement): void {
    const field = option.closest<HTMLElement>("[data-select-field]");
    const list = option.closest<HTMLElement>("[data-select-list]");
    const trigger = field?.querySelector<HTMLElement>("[data-select-trigger]");
    const value = option.dataset["optionValue"];
    if (
      field === null ||
      field === undefined ||
      list === null ||
      trigger === null ||
      trigger === undefined ||
      value === undefined
    ) {
      return;
    }
    const label = option.textContent?.trim() ?? "";
    for (const entry of list.querySelectorAll<HTMLElement>("[data-select-option]")) {
      entry.setAttribute("aria-selected", entry === option ? "true" : "false");
    }
    const shown = trigger.querySelector<HTMLElement>("[data-select-value]");
    if (shown !== null) shown.textContent = label;
    list.hidePopover();
    applySelectValue(field.dataset["selectName"] ?? "", value);
    trigger.focus({ preventScroll: true });
  }

  function handleSettingsAction(action: string, element: HTMLElement): void {
    if (action === "logout") {
      askConfirm(t(c, "settings.logoutConfirm"), () => {
        void actions.logout().catch(() => showSettingsError(t(c, "settings.logoutFailed")));
      });
      return;
    } else if (action === "reset-key") {
      if (!capabilities.resetRecoveryKey) return;
      askConfirm(t(c, "settings.resetKeyConfirm"), () => {
        pendingResetKey = true;
        actions.resetRecoveryKey();
      });
      return;
    } else if (action === "copy-reset-key") {
      const key = state().recoveryKey;
      if (key !== null) copy(key.value);
      return;
    } else if (action === "download-reset-key") {
      downloadRecovery();
      return;
    } else if (action === "verify-device") {
      const deviceId = element.dataset["deviceId"] ?? "";
      const device = state().devices.find((entry) => entry.id === deviceId);
      if (device === undefined || !device.capabilities.verify || device.verified || device.current) return;
      sasError = null;
      void actions.startSas(device.id).catch(failSas);
      return;
    } else if (action === "sign-out-device") {
      if (!capabilities.signOutDevice) return;
      const deviceId = element.dataset["deviceId"] ?? "";
      askConfirm(t(c, "settings.signOutDeviceConfirm"), () => {
        actions.signOutDevice(deviceId);
        queueMicrotask(() => refreshBody(SURFACE.settings));
      });
    } else if (action === "sign-out-others") {
      if (!capabilities.signOutOthers) return;
      askConfirm(t(c, "settings.signOutOthersConfirm"), () => {
        actions.signOutOthers();
        queueMicrotask(() => refreshBody(SURFACE.settings));
      });
    } else if (action === "backup") {
      actions.backupSetup();
    }
    queueMicrotask(() => refreshBody(SURFACE.settings));
  }

  function setDialogTitle(id: string, key: Parameters<typeof t>[1]): void {
    const title = document.getElementById(id)?.querySelector<HTMLElement>("h2");
    if (title !== null && title !== undefined) title.textContent = t(c, key);
  }

  async function openMediaFiles(roomId: string): Promise<void> {
    if (!capabilities.search) return;
    const dialog = document.getElementById(SURFACE.mediaFiles);
    const body = dialog?.querySelector<HTMLElement>(`[data-region="${SURFACE.mediaFiles}-body"]`);
    if (!(dialog instanceof HTMLDialogElement) || body === null || body === undefined) return;
    let files: readonly MessageRow[] = [];
    let failed = false;
    try {
      files = await actions.search([roomId], "");
    } catch {
      failed = true;
    }
    replaceHtml(
      body,
      failed
        ? html`<p class="form-error" role="alert">${t(c, "surface.mediaFiles.failed")}</p>`
        : mediaFilesBody(c, files),
    );
    body.scrollTop = 0;
    dialog.showModal();
  }

  function openSearch(roomId: string): void {
    if (!capabilities.search) return;
    const dialog = document.getElementById(SURFACE.search);
    if (!(dialog instanceof HTMLDialogElement)) return;
    refreshBody(SURFACE.search, roomId);
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("#search-field")?.focus();
  }

  function handleRoomAction(action: string): void {
    const id = activeRoomId ?? state().roomId;
    if (id === null) return;
    if (action === "roomMenu.markRead") actions.markRead(id);
    else if (action === "roomMenu.favorite") {
      if (!capabilities.setRoomTag) return;
      actions.toggleFavorite(id);
    } else if (action === "roomMenu.mute") {
      if (!capabilities.setNotification) return;
      actions.toggleMute(id);
    } else if (action === "roomMenu.leave") {
      if (!capabilities.leaveRoom) return;
      hide(SURFACE.roomMenu);
      askConfirm(t(c, "roomMenu.leaveConfirm"), () => actions.leaveRoom(id));
      return;
    } else if (action === "roomMenu.mediaFiles") {
      if (!capabilities.search) return;
      hide(SURFACE.roomMenu);
      void openMediaFiles(id);
      return;
    } else if (action === "roomMenu.search") {
      if (!capabilities.search) return;
      hide(SURFACE.roomMenu);
      openSearch(id);
      return;
    } else if (action === "roomMenu.invite") {
      if (!capabilities.inviteUser) return;
      hide(SURFACE.roomMenu);
      refreshBody(SURFACE.roomInvite);
      const inviteDialog = document.getElementById(SURFACE.roomInvite);
      if (inviteDialog instanceof HTMLDialogElement) inviteDialog.showModal();
      return;
    } else if (action === "spaceMenu.settings") {
      if (!capabilities.setRoomState) return;
      hide(SURFACE.roomMenu);
      const dialog = document.getElementById(SURFACE.roomSettings);
      if (dialog instanceof HTMLDialogElement) {
        setDialogTitle(SURFACE.roomSettings, "spaceMenu.settings");
        refreshBody(SURFACE.roomSettings, id);
        dialog.showModal();
      }
      return;
    } else if (action === "spaceMenu.leave") {
      if (!capabilities.leaveRoom) return;
      hide(SURFACE.roomMenu);
      askConfirm(t(c, "spaceMenu.leaveConfirm"), () => actions.leaveRoom(id));
      return;
    }
    hide(SURFACE.roomMenu);
  }

  function handleSelectionAction(action: string): void {
    const ids = selectedMessageIds();
    if (action === "selection.copy") {
      const text = state()
        .messages.filter((row) => ids.includes(row.id))
        .map((row) => row.body || row.media?.name || "")
        .filter((body) => body !== "")
        .join("\n");
      if (text !== "") copy(text);
    } else if (action === "selection.forward") {
      if (capabilities.forward && ids.length > 0) {
        document.dispatchEvent(new CustomEvent("maski:forward-open", { detail: { ids } }));
      }
    } else if (action === "selection.delete") {
      if (capabilities.redact) document.dispatchEvent(new CustomEvent("maski:selection-delete"));
    }
    hide(SURFACE.selectionMenu);
  }

  function handleMessageAction(action: string): void {
    const target = message(activeMessageId);
    if (target === null) return;
    if (action === "messageMenu.reply") composer.showReply(target);
    else if (action === "messageMenu.react") {
      if (!capabilities.react) return;
      const source = lastMenuSource;
      const point = lastMenuPoint;
      hide(SURFACE.messageMenu);
      if (source !== null) {
        openContextMenu(SURFACE.reaction, source, point ?? sourcePoint(source), false, lastMenuWasKeyboard);
      }
      return;
    } else if (action === "messageMenu.edit") {
      if (!capabilities.edit) return;
      composer.showEditing(target);
    } else if (action === "messageMenu.delete") {
      if (!capabilities.redact) return;
      askConfirm(t(c, "messageMenu.deleteConfirm"), () => actions.redact(target.id));
    } else if (action === "messageMenu.cancel") actions.discardMessage(target.id);
    else if (action === "messageMenu.retry") actions.retryMessage(target.id);
    else if (action === "messageMenu.copy") copy(target.body);
    else if (action === "messageMenu.source") showMessageSource(target);
    else if (action === "messageMenu.select") {
      document.dispatchEvent(new CustomEvent("maski:select-message", { detail: { id: target.id } }));
    }
    hide(SURFACE.messageMenu);
  }

  async function search(form: HTMLFormElement): Promise<void> {
    if (!capabilities.search) return;
    const input = form.querySelector<HTMLInputElement>("#search-field");
    const results = document.querySelector<HTMLElement>("[data-search-results]");
    if (input === null || results === null) return;
    const query = input.value.trim();
    if (query === "") {
      results.replaceChildren();
      return;
    }
    const scope = form.dataset["searchScope"] ?? state().roomId ?? "all";
    const roomIds =
      scope === "all"
        ? state()
            .rooms.filter((entry) => !isSpaceRoom(entry) && entry.membership === "join")
            .map((entry) => entry.roomId)
        : [scope];
    let matches: readonly MessageRow[] = [];
    let failed = false;
    try {
      matches = await actions.search(roomIds, query, mediaKindsForQuery(c, query));
    } catch {
      failed = true;
    }
    replaceHtml(
      results,
      failed
        ? html`<p class="form-error" role="alert">${t(c, "surface.search.failed")}</p>`
        : matches.length === 0
          ? html`<p class="note">${t(c, "surface.search.empty")}</p>`
          : html`${matches.slice(0, 40).map(
              (entry) => html`<button
              class="search-result"
              type="button"
              data-search-room="${entry.roomId}"
              data-search-message="${entry.id}"
            >
              <span class="search-result-room" dir="auto">${room(entry.roomId)?.name ?? ""}</span
              ><bdi dir="auto">${searchResultText(c, entry)}</bdi>
            </button>`,
            )}`,
    );
  }

  function onInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === "room-invite-field") {
      target.setCustomValidity("");
      return;
    }
    if (!(target instanceof HTMLInputElement) || target.id !== "search-field") return;
    const form = target.closest<HTMLFormElement>(".search-form");
    if (form !== null) void search(form);
  }

  function onClick(event: MouseEvent): void {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }

    const sasAction = target.closest<HTMLElement>("[data-sas-action]");
    if (sasAction !== null) {
      event.preventDefault();
      handleSasAction(sasAction.dataset["sasAction"] ?? "");
      return;
    }

    const selectOption = target.closest<HTMLElement>("[data-select-option]");
    if (selectOption !== null) {
      event.preventDefault();
      chooseSelect(selectOption);
      return;
    }

    const popoverTrigger = target.closest<HTMLElement>("[popovertarget]");
    if (popoverTrigger !== null) {
      const id = popoverTrigger.getAttribute("popovertarget");
      const popover = id === null ? null : document.getElementById(id);
      if (popover instanceof HTMLElement && popover.matches(":popover-open")) {
        event.preventDefault();
        popover.hidePopover();
        return;
      }
    }

    const mention = target.closest<HTMLAnchorElement>("a[href]");
    if (mention !== null && mention.closest(".message-text") !== null) {
      const userId = profileIdFromHref(mention.href);
      if (userId !== null) {
        event.preventDefault();
        showProfile(mention.textContent?.trim() || userId, userId);
        const dialog = document.getElementById(SURFACE.profile);
        if (dialog instanceof HTMLDialogElement) dialog.showModal();
        return;
      }
    }

    const trayPreview = target.closest<HTMLElement>("[data-tray-preview]");
    if (trayPreview !== null) {
      const url = trayPreview.dataset["trayPreview"];
      if (url !== undefined && viewer instanceof HTMLDialogElement && !viewer.open) {
        event.preventDefault();
        showViewer(trayPreview.dataset["trayName"] ?? "", "image", url, c);
        viewer.showModal();
      }
      return;
    }

    if (composer.handleClick(target)) {
      event.preventDefault();
      return;
    }

    const stickerTab = target.closest<HTMLElement>("[data-sticker-tab]");
    if (stickerTab !== null) {
      selectStickerTab(stickerTab);
      return;
    }

    const mediaTab = target.closest<HTMLElement>("[data-media-files-tab]");
    if (mediaTab !== null) {
      selectMediaTab(mediaTab);
      return;
    }

    const scopeOption = target.closest<HTMLElement>("[data-search-scope-option]");
    if (scopeOption !== null) {
      const form = scopeOption.closest<HTMLFormElement>(".search-form");
      const button = form?.querySelector<HTMLElement>("[data-search-scope-button]");
      const value = scopeOption.dataset["searchScopeOption"];
      if (form !== null && form !== undefined && button !== null && button !== undefined && value !== undefined) {
        form.dataset["searchScope"] = value;
        const label = button.querySelector<HTMLElement>("[data-search-scope-label]");
        const text = (scopeOption.textContent ?? "").trim();
        if (label !== null) label.textContent = text;
        button.setAttribute("aria-label", t(c, "surface.search.scope", { room: text }));
        for (const option of form.querySelectorAll<HTMLElement>("[data-search-scope-option]")) {
          option.setAttribute("aria-selected", String(option === scopeOption));
        }
        void search(form);
      }
      scopeOption.closest<HTMLElement>("[popover]")?.hidePopover();
      return;
    }

    const zoom = target.closest<HTMLElement>("[data-viewer-zoom]");
    if (zoom !== null) {
      const pressed = zoom.getAttribute("aria-pressed") === "true";
      zoom.setAttribute("aria-pressed", String(!pressed));
      zoom.classList.toggle("is-zoomed", !pressed);
      return;
    }

    if (target.closest(".settings-tabs a") !== null) {
      window.setTimeout(syncSettingsTabs, 0);
    }

    const confirm = target.closest<HTMLElement>("[data-confirm]");
    if (confirm !== null) {
      event.preventDefault();
      const action = pendingConfirm;
      pendingConfirm = null;
      hide(SURFACE.confirm);
      if (confirm.dataset["confirm"] === "ok") action?.();
      return;
    }

    if (target.closest('[popovertarget="surface-language"]') !== null) {
      const menu = document.getElementById(SURFACE.navMenu);
      if (menu instanceof HTMLElement && menu.matches(":popover-open")) {
        menu.classList.add("is-switching");
        menu.hidePopover();
        queueMicrotask(() => menu.classList.remove("is-switching"));
      }
    }

    const invoker = target.closest<HTMLElement>("[commandfor]");
    if (invoker !== null) {
      const host = invoker.closest<HTMLElement>("[popover]");
      if (host instanceof HTMLElement && host.matches(":popover-open")) host.hidePopover();
      const id = invoker.getAttribute("commandfor");
      if (id === SURFACE.settings) {
        if (state().recoveryKey !== null) actions.clearRecoveryKey();
        refreshBody(id);
      } else if (id === SURFACE.invite) refreshBody(id);
      else if (id === SURFACE.roomSettings) {
        if (!capabilities.setRoomState) return;
        hide(SURFACE.roomMenu);
        setDialogTitle(id, "roomMenu.settings");
        refreshBody(id, activeRoomId ?? state().roomId);
      } else if (id !== null && id !== SURFACE.confirm && id !== SURFACE.viewer && id !== SURFACE.profile) {
        refreshBody(id);
      }
    }

    const settings = target.closest<HTMLElement>("[data-settings-action]");
    if (settings !== null) {
      event.preventDefault();
      handleSettingsAction(settings.dataset["settingsAction"] ?? "", settings);
      return;
    }

    const lowPriorityRoom = target.closest<HTMLElement>("[data-low-priority-room]");
    if (lowPriorityRoom !== null) {
      event.preventDefault();
      const roomId = lowPriorityRoom.dataset["lowPriorityRoom"] ?? "";
      hide(SURFACE.settings);
      if (roomId !== "") actions.selectRoom(roomId);
      return;
    }

    const invite = target.closest<HTMLElement>("[data-invite-action]");
    if (invite !== null) {
      event.preventDefault();
      if (!capabilities.answerInvite) return;
      const roomId = invite.dataset["roomId"] ?? "";
      if (invite.dataset["inviteAction"] === "accept") actions.acceptInvite(roomId);
      else actions.declineInvite(roomId);
      hide(SURFACE.invite);
      return;
    }

    const profile = target.closest<HTMLElement>("[data-profile]");
    if (profile !== null) showProfile(profile.dataset["profile"] ?? "", profile.dataset["profileId"] ?? "");

    const forwardRoom = target.closest<HTMLElement>("[data-forward-room]");
    if (forwardRoom !== null) {
      if (!capabilities.forward) return;
      const dialog = document.getElementById(SURFACE.forward);
      if (!(dialog instanceof HTMLDialogElement)) return;
      const ids = (dialog.dataset["forwardIds"] ?? "").split(",").filter(Boolean);
      actions.forward(ids, forwardRoom.dataset["forwardRoom"] ?? "");
      dialog.close();
      document.dispatchEvent(new CustomEvent("maski:selection-clear"));
      return;
    }

    const media = target.closest<HTMLElement>("[data-media-open]");
    if (media !== null) {
      const messageId = media.dataset["mediaOpen"] ?? "";
      const kind = media.dataset["mediaKind"] ?? "file";
      const row = message(messageId);
      if (row === null || row.media === null) return;
      const targetRoomId = row.roomId;
      const name = row.media.name;
      if (kind !== "image" && kind !== "video" && kind !== "sticker") {
        event.preventDefault();
        downloadMedia(targetRoomId, messageId, name);
        return;
      }
      showViewer(name, kind, media.dataset["mediaUrl"] ?? null, c);
      viewerMessageId = messageId;
      const previewId = messageId;
      void actions.resolveMedia(targetRoomId, messageId, "full").then((url) => {
        if (url === null || viewerMessageId !== previewId || !(viewer instanceof HTMLDialogElement) || !viewer.open) {
          return;
        }
        showViewer(name, kind, url, c);
      });
      return;
    }

    const searchResult = target.closest<HTMLElement>("[data-search-room]");
    if (searchResult !== null) {
      const roomId = searchResult.dataset["searchRoom"];
      const messageId = searchResult.dataset["searchMessage"];
      if (roomId !== undefined) {
        actions.selectRoom(roomId);
        hide(SURFACE.search);
        if (messageId !== undefined) {
          pendingSearch = { roomId, messageId };
        }
      }
      return;
    }

    const profileAction = target.closest<HTMLElement>("[data-profile-action]");
    if (profileAction !== null && profileTarget !== null) {
      if (!capabilities.addRoom || !capabilities.inviteUser) return;
      hide(SURFACE.profile);
      const existing = state().rooms.find((entry) => entry.directUserId === profileTarget?.userId);
      if (existing !== undefined) actions.selectRoom(existing.roomId);
      else void actions.startDirect(profileTarget.userId);
      return;
    }

    const memberTab = target.closest<HTMLElement>("[data-member-group]");
    if (memberTab !== null) {
      selectMemberTab(memberTab);
      return;
    }

    const memberAction = target.closest<HTMLElement>("[data-member-action]");
    if (memberAction !== null) {
      event.preventDefault();
      if (!capabilities.memberAction) return;
      const action = memberAction.dataset["memberAction"] ?? "";
      const memberId = memberAction.dataset["memberId"] ?? "";
      const roomId = memberAction.dataset["roomId"] ?? "";
      if (action === "kick" || action === "ban" || action === "unban") {
        const name = state().members.find((member) => member.userId === memberId)?.displayName ?? memberId;
        memberAction.closest<HTMLElement>("[popover]")?.hidePopover();
        askConfirm(
          t(
            c,
            action === "ban"
              ? "roomSettings.banConfirm"
              : action === "unban"
                ? "roomSettings.unbanConfirm"
                : "roomSettings.kickConfirm",
            { name },
          ),
          () => {
            actions.memberAction(roomId, memberId, action);
            refreshBody(SURFACE.roomSettings, activeRoomId ?? state().roomId);
          },
        );
      }
      return;
    }

    const addressRemove = target.closest<HTMLElement>("[data-room-address-remove]");
    if (addressRemove !== null) {
      event.preventDefault();
      if (!capabilities.setRoomState) return;
      actions.removeRoomAddress(activeRoomId ?? state().roomId ?? "", addressRemove.dataset["roomAddressRemove"] ?? "");
      refreshBody(SURFACE.roomSettings, activeRoomId ?? state().roomId);
      return;
    }

    const copyRoomId = target.closest<HTMLElement>("[data-room-copy-id]");
    if (copyRoomId !== null) {
      event.preventDefault();
      const id = activeRoomId ?? state().roomId;
      if (id !== null) copy(id);
      return;
    }

    const action = target.closest<HTMLElement>("[data-action]");
    if (action !== null) {
      event.preventDefault();
      const surface = action.closest<HTMLElement>(".surface");
      if (surface?.id === SURFACE.roomMenu) handleRoomAction(action.dataset["action"] ?? "");
      else if (surface?.id === SURFACE.messageMenu) handleMessageAction(action.dataset["action"] ?? "");
      else if (surface?.id === SURFACE.selectionMenu) handleSelectionAction(action.dataset["action"] ?? "");
      else if (surface?.id === SURFACE.roomSettings && action.dataset["action"] === "roomSettings.leave") {
        if (!capabilities.leaveRoom) return;
        const roomId = activeRoomId ?? state().roomId ?? "";
        const leaving = room(roomId);
        const leavingSpace = leaving !== null && isSpaceRoom(leaving);
        askConfirm(t(c, leavingSpace ? "spaceMenu.leaveConfirm" : "roomMenu.leaveConfirm"), () => {
          actions.leaveRoom(roomId);
          hide(SURFACE.roomSettings);
        });
      }
      return;
    }

    const reactionMore = target.closest<HTMLElement>("[data-reaction-more]");
    if (reactionMore !== null) {
      event.preventDefault();
      const list = reactionMore.closest<HTMLElement>(".reactions");
      if (list === null) return;
      const expanded = reactionMore.getAttribute("aria-expanded") === "true";
      for (const extra of list.querySelectorAll<HTMLElement>("[data-reaction-extra]")) {
        extra.hidden = expanded;
      }
      const count = reactionMore.dataset["reactionCount"] ?? "";
      reactionMore.setAttribute("aria-expanded", String(!expanded));
      reactionMore.textContent = expanded ? `+${count}` : "−";
      reactionMore.setAttribute("aria-label", t(c, expanded ? "chat.reactionsMore" : "chat.reactionsLess", { count }));
      return;
    }

    const reactionChoice = target.closest<HTMLElement>("[data-react-choice]");
    if (reactionChoice !== null) {
      event.preventDefault();
      if (!capabilities.react) return;
      if (activeMessageId !== null) {
        const emoji = reactionChoice.dataset["reactChoice"] ?? "";
        actions.recordReaction(emoji);
        actions.react(activeMessageId, emoji);
      }
      hide(SURFACE.reaction);
      return;
    }

    const reaction = target.closest<HTMLElement>(".reaction");
    if (reaction !== null) {
      if (!capabilities.react) return;
      const row = reaction.closest<HTMLElement>("li.message");
      if (row?.dataset["id"] !== undefined && reaction.dataset["reaction"] !== undefined) {
        actions.recordReaction(reaction.dataset["reaction"]);
        actions.react(row.dataset["id"], reaction.dataset["reaction"]);
      }
      return;
    }

    const topbarMenu = target.closest<HTMLElement>("[data-room-id]");
    if (topbarMenu !== null) activeRoomId = topbarMenu.dataset["roomId"] ?? state().roomId;
  }

  function onSubmit(event: Event): void {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.matches(".composer")) return;
    const id = form.dataset["surface"];
    if (id === undefined) return;
    event.preventDefault();
    if (id === "search") void search(form);
    else if (id === "new-message") {
      const input = form.querySelector<HTMLInputElement>("#new-message-field");
      const value = input?.value.trim() ?? "";
      if (input === null || value === "") return;
      input.setCustomValidity("");
      void actions.startDirect(value).then((result) => {
        if (result === "invalid") {
          input.setCustomValidity(t(c, "surface.newMessage.invalid"));
          input.reportValidity();
          return;
        }
        hide(SURFACE.newMessage);
        queueMicrotask(() => hide(SURFACE.newMessage));
      });
    } else if (id === "reset-identity") {
      if (!capabilities.resetIdentity) return;
      askConfirm(t(c, "settings.resetIdentityConfirm"), () => {
        pendingResetKey = true;
        actions.resetIdentity();
      });
    } else if (id === "join") {
      const input = form.querySelector<HTMLInputElement>("#join-field");
      const value = input?.value.trim() ?? "";
      if (input === null || value === "") return;
      input.setCustomValidity("");
      void actions.joinRoom(value).then((result) => {
        if (result === "notFound") {
          input.setCustomValidity(t(c, "surface.join.notFound"));
          input.reportValidity();
          return;
        }
        hide(SURFACE.join);
        queueMicrotask(() => hide(SURFACE.join));
      });
    } else if (id === "room-invite") {
      const input = form.querySelector<HTMLInputElement>("#room-invite-field");
      const value = input?.value.trim() ?? "";
      const roomId = activeRoomId ?? state().roomId;
      if (input === null || value === "" || roomId === null) return;
      input.setCustomValidity("");
      const result = actions.inviteUser(roomId, value);
      if (result !== "ok") {
        input.setCustomValidity(t(c, result === "exists" ? "surface.roomInvite.exists" : "surface.roomInvite.invalid"));
        input.reportValidity();
        return;
      }
      hide(SURFACE.roomInvite);
    } else if (id === "room-address") {
      const formElement = form;
      const input = formElement.querySelector<HTMLInputElement>("[data-room-address-input]");
      const error = formElement.querySelector<HTMLElement>("[data-room-address-error]");
      const address = input?.value.trim() ?? "";
      const roomId = activeRoomId ?? state().roomId;
      const current = room(roomId);
      if (input === null || error === null || address === "" || current === null) return;
      const fail = (key: Parameters<typeof t>[1]): void => {
        error.textContent = t(c, key);
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.focus();
      };
      if (!address.startsWith("#") || !address.includes(":")) {
        fail("roomSettings.addressInvalid");
        return;
      }
      if (current.aliases.includes(address)) {
        fail("roomSettings.addressExists");
        return;
      }
      const domain = state().session?.userId.split(":").slice(1).join(":") ?? "";
      if (domain !== "" && !address.endsWith(`:${domain}`)) {
        fail("roomSettings.addressServer");
        return;
      }
      actions.addRoomAddress(current.roomId, address);
      refreshBody(SURFACE.roomSettings, roomId);
      document.querySelector<HTMLInputElement>("[data-room-address-input]")?.focus();
    } else if (id === "create") {
      const name = form.querySelector<HTMLInputElement>("#create-name")?.value.trim() ?? "";
      const topic = form.querySelector<HTMLInputElement>("#create-topic")?.value.trim() ?? "";
      if (name === "") return;
      void actions.createRoom(name, topic);
      hide(SURFACE.create);
      queueMicrotask(() => hide(SURFACE.create));
    }
  }

  async function setDesktopPref(input: HTMLInputElement): Promise<void> {
    const request = ++desktopRequest;
    const section = input.closest(".surface-section");
    const error = section?.querySelector<HTMLElement>("[data-notification-error]") ?? null;
    const showError = (key: "settings.desktopDenied" | "settings.desktopUnavailable"): void => {
      if (error === null) return;
      error.textContent = t(c, key);
      error.hidden = false;
    };
    if (!input.checked) {
      if (error !== null) error.hidden = true;
      actions.setPref("desktop", false);
      return;
    }
    if (!("Notification" in window)) {
      input.checked = false;
      showError("settings.desktopUnavailable");
      return;
    }
    input.checked = false;
    if (error !== null) error.hidden = true;
    let permission = Notification.permission;
    if (permission === "default") {
      try {
        permission = await Notification.requestPermission();
      } catch {
        if (request !== desktopRequest) return;
        showError("settings.desktopUnavailable");
        return;
      }
    }
    if (request !== desktopRequest) return;
    if (permission !== "granted") {
      if (permission === "denied") showError("settings.desktopDenied");
      return;
    }
    input.checked = true;
    actions.setPref("desktop", true);
  }

  function onChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === "surface-attach-input") {
      composer.handleFileInput(target);
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset["setting"] !== undefined) {
      const key = target.dataset["setting"];
      if (key === "desktop") {
        void setDesktopPref(target);
        return;
      }
      if (key === "badge" || key === "titleTotal" || key === "preview") {
        actions.setPref(key, target.checked);
      } else if (key === "stickers") {
        actions.setStickers(target.checked);
      }
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset["roomNameInput"] !== undefined) {
      const id = activeRoomId ?? state().roomId;
      if (id !== null) actions.updateRoomDetails(id, { name: target.value });
      return;
    }
    if (target instanceof HTMLTextAreaElement && target.dataset["roomTopicInput"] !== undefined) {
      const id = activeRoomId ?? state().roomId;
      if (id !== null) actions.updateRoomDetails(id, { topic: target.value });
    }
  }

  function onContextMenu(event: MouseEvent): void {
    if (suppressNextContext) {
      suppressNextContext = false;
      event.preventDefault();
      return;
    }
    const selection = document.getSelection();
    if (selection !== null && !selection.isCollapsed && selection.toString().trim() !== "") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const keyboardPoint = lastInput === "keyboard";
    const roomControl = target.closest<HTMLElement>("button[data-room], [data-space-toggle]");
    if (roomControl !== null) {
      event.preventDefault();
      activeRoomId = roomControl.dataset["room"] ?? roomControl.dataset["spaceToggle"] ?? null;
      openContextMenu(
        SURFACE.roomMenu,
        roomControl,
        keyboardPoint ? sourcePoint(roomControl) : { x: event.clientX, y: event.clientY },
        false,
        keyboardPoint,
      );
      return;
    }
    const messageRow = target.closest<HTMLElement>("li.message");
    if (messageRow !== null) {
      event.preventDefault();
      activeMessageId = messageRow.dataset["id"] ?? null;
      messageRow.classList.add("is-active");
      openContextMenu(
        messageContextMenuId(messageRow),
        messageRow,
        keyboardPoint ? sourcePoint(messageRow) : { x: event.clientX, y: event.clientY },
        false,
        keyboardPoint,
      );
      return;
    }
    if (target.closest("#composer-send") !== null) {
      event.preventDefault();
      composer.openSendMenu(keyboardPoint);
    }
  }

  function onPointerDown(event: PointerEvent): void {
    lastInput = "pointer";
    suppressClick = false;
    suppressNextContext = false;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(".surface.floating") && target.closest("[popovertarget]") === null) closePopovers();
    const popoverTrigger = target.closest<HTMLElement>("[popovertarget]");
    const popoverId = popoverTrigger?.getAttribute("popovertarget") ?? null;
    const openContextTrigger =
      popoverId !== null &&
      CONTEXT_SURFACE_IDS.has(popoverId) &&
      document.getElementById(popoverId)?.matches(":popover-open") === true;
    if (!insideContextSurface(target) && !openContextTrigger) {
      closeContextMenus();
    }
    if (event.pointerType === "mouse") return;
    const roomControl = target.closest<HTMLElement>("button[data-room], [data-space-toggle]");
    const messageRow = target.closest<HTMLElement>("li.message");
    const send = target.closest("#composer-send") !== null;
    if (roomControl === null && messageRow === null && !send) return;
    if (hasTextSelection()) return;
    const id =
      roomControl?.dataset["room"] ?? roomControl?.dataset["spaceToggle"] ?? messageRow?.dataset["id"] ?? "send";
    pressPoint = { x: event.clientX, y: event.clientY };
    pressTarget = { roomControl, messageRow, send, id };
    pressLong = false;
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      if (hasTextSelection()) {
        pressTarget = null;
        pressPoint = null;
        return;
      }
      pressLong = true;
      suppressClick = true;
      suppressNextContext = true;
      if (messageRow !== null) {
        activeMessageId = id;
        messageRow.classList.add("is-holding");
      } else if (roomControl !== null) {
        activeRoomId = id;
      }
    }, 450);
  }

  function clearPress(): void {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
    pressPoint = null;
    pressTarget = null;
    pressLong = false;
    for (const row of document.querySelectorAll<HTMLElement>("li.message.is-holding")) {
      row.classList.remove("is-holding");
    }
  }

  function onPointerUp(): void {
    const target = pressTarget;
    const point = pressPoint ?? { x: 0, y: 0 };
    const long = pressLong;
    clearPress();
    if (!long || target === null) return;
    if (target.messageRow !== null) {
      openContextMenu(messageContextMenuId(target.messageRow), target.messageRow, point, true, false);
    } else if (target.roomControl !== null) {
      openContextMenu(SURFACE.roomMenu, target.roomControl, point, true, false);
    } else if (target.send) {
      composer.openSendMenu(false);
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (pressTimer === null || pressPoint === null) return;
    if (Math.abs(event.clientX - pressPoint.x) > 10 || Math.abs(event.clientY - pressPoint.y) > 10) {
      clearPress();
    }
  }

  function onBeforeToggle(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !(event instanceof ToggleEvent)) return;
    if (event.newState !== "open") return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !target.contains(active)) popoverReturnFocus.set(target.id, active);
    if (target.id === "search-scope" || target.matches("[data-select-list]")) return;
    if (target.id === SURFACE.emoji || target.id === SURFACE.reaction) {
      refreshBody(target.id);
      return;
    }
    if (target.id === SURFACE.sticker || target.id === SURFACE.attach) {
      refreshBody(target.id);
      return;
    }
    if (target.id === SURFACE.roomMenu) {
      if (!target.classList.contains("is-context")) {
        activeRoomId = state().roomId;
        filterMenu(SURFACE.roomMenu);
      }
    } else if (target.id === SURFACE.messageMenu) {
      filterMenu(SURFACE.messageMenu);
    }
    window.setTimeout(() => {
      target.querySelector<HTMLElement>('[role="menuitem"]:not([hidden])')?.focus({ preventScroll: true });
    }, 40);
  }

  const onDocumentToggle = (event: Event): void => {
    if (!(event instanceof ToggleEvent) || !(event.target instanceof HTMLElement)) return;
    const target = event.target;
    if (event.newState === "open") {
      if (target.id === "search-scope") {
        document.querySelector<HTMLElement>("[data-search-scope-button]")?.setAttribute("aria-expanded", "true");
        target.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.focus({ preventScroll: true });
        return;
      }
      if (target.matches("[data-select-list]")) {
        const field = target.closest<HTMLElement>("[data-select-field]");
        field?.querySelector<HTMLElement>("[data-select-trigger]")?.setAttribute("aria-expanded", "true");
        target.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.focus({ preventScroll: true });
        return;
      }
      return;
    }
    if (event.newState !== "closed") return;
    const closing = target;
    if (closing.matches(":popover-open")) return;
    if (closing.matches("[data-select-list]")) {
      const field = closing.closest<HTMLElement>("[data-select-field]");
      field?.querySelector<HTMLElement>("[data-select-trigger]")?.setAttribute("aria-expanded", "false");
      popoverReturnFocus.delete(closing.id);
      return;
    }
    if (closing.id === "search-scope") {
      document.querySelector<HTMLElement>("[data-search-scope-button]")?.setAttribute("aria-expanded", "false");
    }
    const returnFocus = popoverReturnFocus.get(closing.id);
    popoverReturnFocus.delete(closing.id);
    if (!CONTEXT_SURFACE_IDS.has(closing.id)) {
      const active = document.activeElement;
      const focusIsGone = active === null || active === document.body || closing.contains(active);
      if (returnFocus !== undefined && focusIsGone && document.querySelector("dialog[open]") === null) {
        returnFocus.focus({ preventScroll: true });
      }
      return;
    }
    closing.classList.remove("is-context", "is-measuring");
    closing.style.removeProperty("--context-x");
    closing.style.removeProperty("--context-y");
    const anotherContextOpen = [...CONTEXT_SURFACE_IDS].some(
      (id) => id !== closing.id && document.getElementById(id)?.matches(":popover-open") === true,
    );
    if (anotherContextOpen) return;
    for (const row of document.querySelectorAll<HTMLElement>("li.message.is-active")) {
      row.classList.remove("is-active");
    }
    if (lastMenuWasKeyboard && !activeInComposer()) lastMenuSource?.focus({ preventScroll: true });
    lastMenuSource = null;
    lastMenuPoint = null;
    lastMenuWasKeyboard = false;
  };

  const confirmDialog = document.getElementById(SURFACE.confirm);
  const onConfirmClose = (): void => {
    pendingConfirm = null;
    confirmFocus?.focus({ preventScroll: true });
    confirmFocus = null;
  };
  confirmDialog?.addEventListener("close", onConfirmClose);

  const settingsDialogs = [SURFACE.settings, SURFACE.roomSettings]
    .map((id) => document.getElementById(id))
    .filter((dialog): dialog is HTMLDialogElement => dialog instanceof HTMLDialogElement);
  const onSettingsClose = (): void => {
    closeSelectLists();
    pendingResetKey = false;
    if (state().recoveryKey !== null) actions.clearRecoveryKey();
    clearSettingsHash();
  };
  for (const dialog of settingsDialogs) {
    dialog.addEventListener("close", onSettingsClose);
    dialog.addEventListener("toggle", syncSettingsTabs);
  }

  const viewer = document.getElementById(SURFACE.viewer);
  const onViewerClose = (): void => {
    viewerMessageId = null;
    for (const media of viewer?.querySelectorAll<HTMLMediaElement>("video, audio") ?? []) media.pause();
    const body = viewer?.querySelector<HTMLElement>(`.surface-body`);
    if (body !== null && body !== undefined) body.replaceChildren();
  };
  viewer?.addEventListener("close", onViewerClose);

  const openForward = (ids: readonly string[]): void => {
    if (!capabilities.forward) return;
    const dialog = document.getElementById(SURFACE.forward);
    if (!(dialog instanceof HTMLDialogElement) || ids.length === 0) return;
    const body = dialog.querySelector<HTMLElement>(`[data-region="${SURFACE.forward}-body"]`);
    if (body === null) return;
    dialog.dataset["forwardIds"] = ids.join(",");
    replaceHtml(body, surfaceBodyFor(c, SURFACE.forward, state(), capabilities));
    body.scrollTop = 0;
    dialog.showModal();
  };

  const onForwardOpen = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!isRecord(detail)) return;
    const ids = detail["ids"];
    openForward(Array.isArray(ids) ? ids.filter((id: unknown): id is string => typeof id === "string") : []);
  };

  const onReplyMessage = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!isRecord(detail)) return;
    const id = detail["id"];
    if (typeof id !== "string") return;
    const target = message(id);
    if (target !== null) composer.showReply(target);
  };

  const onConfirmRequest = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!isRecord(detail)) return;
    const text = detail["message"];
    const action = detail["action"];
    if (typeof text === "string" && typeof action === "function") askConfirm(text, () => action());
  };

  const unwatchResetKey = store.watch(["recoveryKey"], () => {
    if (!pendingResetKey) return;
    const key = state().recoveryKey;
    if (key === null) return;
    pendingResetKey = false;
    showResetKeyDialog(key.value);
  });

  const applySasState = (): void => {
    const sas = state().sas;
    if (sas === null) return;
    if (sas.id !== sasShownId) {
      sasShownId = sas.id;
      sasConfirmedId = null;
      sasDismissedId = null;
      sasSentCancelId = null;
    }
    sasError = null;
    if (sasDismissedId === sas.id) {
      renderSas();
      return;
    }
    openSas();
  };
  const unwatchSas = store.watch(["sas"], applySasState);
  applySasState();

  const sasElement = sasDialogElement();
  const onSasClose = (): void => {
    const sas = state().sas;
    if (sas === null) return;
    sasDismissedId = sas.id;
    if (isActiveSas(sas.phase)) cancelSas(sas.id);
    const settings = document.getElementById(SURFACE.settings);
    if (settings instanceof HTMLDialogElement && settings.open) refreshBody(SURFACE.settings);
  };
  sasElement?.addEventListener("close", onSasClose);

  const unwatchMembers = store.watch(["members", "membersLoading"], () => {
    const dialog = document.getElementById(SURFACE.roomSettings);
    if (dialog instanceof HTMLDialogElement && dialog.open) {
      refreshBody(SURFACE.roomSettings, activeRoomId ?? state().roomId);
    }
  });
  const unwatchBackup = store.watch(["backupReady", "backupError"], () => {
    const dialog = document.getElementById(SURFACE.settings);
    if (dialog instanceof HTMLDialogElement && dialog.open) refreshBody(SURFACE.settings);
  });
  const unwatchSearchTarget = store.watch(["roomId", "messages"], () => {
    if (pendingSearch === null) return;
    if (state().roomId !== pendingSearch.roomId) {
      pendingSearch = null;
      return;
    }
    const row = document.querySelector<HTMLElement>(`li.message[data-id="${CSS.escape(pendingSearch.messageId)}"]`);
    if (row === null) return;
    pendingSearch = null;
    requestAnimationFrame(() => row.scrollIntoView({ block: "center" }));
  });

  document.addEventListener("click", onClick);
  document.addEventListener("maski:forward-open", onForwardOpen);
  document.addEventListener("maski:reply-message", onReplyMessage);
  document.addEventListener("maski:confirm", onConfirmRequest);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  document.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", clearPress);
  document.addEventListener("beforetoggle", onBeforeToggle, true);
  document.addEventListener("toggle", onDocumentToggle, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("hashchange", syncSettingsTabs);
  window.addEventListener("pageshow", closeRestoredPopovers);
  requestAnimationFrame(closeRestoredPopovers);

  return () => {
    unwatchResetKey();
    unwatchSas();
    sasElement?.removeEventListener("close", onSasClose);
    unwatchMembers();
    unwatchBackup();
    unwatchSearchTarget();
    document.removeEventListener("click", onClick);
    document.removeEventListener("maski:forward-open", onForwardOpen);
    document.removeEventListener("maski:reply-message", onReplyMessage);
    document.removeEventListener("maski:confirm", onConfirmRequest);
    document.removeEventListener("submit", onSubmit);
    document.removeEventListener("input", onInput);
    document.removeEventListener("change", onChange);
    document.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", clearPress);
    document.removeEventListener("beforetoggle", onBeforeToggle, true);
    document.removeEventListener("toggle", onDocumentToggle, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("hashchange", syncSettingsTabs);
    window.removeEventListener("pageshow", closeRestoredPopovers);
    confirmDialog?.removeEventListener("close", onConfirmClose);
    viewer?.removeEventListener("close", onViewerClose);
    for (const dialog of settingsDialogs) {
      dialog.removeEventListener("close", onSettingsClose);
      dialog.removeEventListener("toggle", syncSettingsTabs);
    }
  };
}
