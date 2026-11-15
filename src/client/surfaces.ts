import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import type { ChatState, MessageRow, RoomSummary } from "../core/types.ts";
import { SURFACE } from "../core/regions.ts";
import { surfaceBodyFor } from "../components/surfaces.ts";
import { mediaFilesBody } from "../components/surfaces.ts";
import { emojiPickerBody } from "../components/emoji.ts";
import { icons } from "../components/icons.ts";
import { CHAT_SURFACES } from "../core/surfaces.ts";
import type { Actions } from "./actions.ts";
import type { Store } from "./store.ts";
import { setPosition, clearPosition } from "./position.ts";
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
  if (surface instanceof HTMLDialogElement) {
    if (surface.open) surface.close();
  } else if (surface instanceof HTMLElement) {
    if (surface.matches(":popover-open")) surface.hidePopover();
  }
}

function closeContextMenus(): void {
  for (const id of CONTEXT_SURFACES) {
    const menu = document.getElementById(id);
    if (menu instanceof HTMLElement && menu.matches(":popover-open")) menu.hidePopover();
  }
  clearPosition("--context-x");
  clearPosition("--context-y");
}

function closeRestoredPopovers(): void {
  closePopovers();
}

function showViewer(name: string, kind: string, url: string | null, c: Catalog): void {
  const body = document.querySelector<HTMLElement>(`[data-region="${SURFACE.viewer}-body"]`);
  if (body === null) return;
  if (url !== null && kind === "video") {
    body.innerHTML = html`<div class="viewer-preview is-video">
      <video class="viewer-media" controls autoplay playsinline preload="metadata" src="${url}" aria-label="${name}"></video>
    </div>`.value;
    return;
  }
  if (url !== null && kind === "image") {
    body.innerHTML = html`<div class="viewer-preview is-image">
      <button
        class="viewer-zoom"
        type="button"
        data-viewer-zoom
        aria-label="${t(c, "surface.viewer.zoom")}"
        aria-pressed="false"
      >
        <img class="viewer-media" src="${url}" alt="${name}" />
      </button>
    </div>`.value;
    return;
  }
  if (url !== null && kind === "audio") {
    body.innerHTML = html`<div class="viewer-preview is-audio">
      <audio class="viewer-media" controls src="${url}" aria-label="${name}"></audio>
      <span class="viewer-name">${name}</span>
    </div>`.value;
    return;
  }
  if (kind === "video" || kind === "image") {
    const icon = kind === "video" ? icons.video : icons.image;
    body.innerHTML = html`<div class="viewer-preview is-missing">
      <div class="viewer-missing">
        ${icon}
        <span class="viewer-name">${name}</span>
        <p class="note">${t(c, "surface.viewer.missingMedia")}</p>
      </div>
    </div>`.value;
    return;
  }
  const icon = kind === "audio" ? icons.audio : kind === "sticker" ? icons.sticker : icons.file;
  body.innerHTML = html`<div class="viewer-preview is-missing">
    <div class="viewer-missing">${icon}<span class="viewer-name">${name}</span></div>
  </div>`.value;
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

let lastInput: "pointer" | "keyboard" = "pointer";

function onKeyDown(event: KeyboardEvent): void {
  lastInput = "keyboard";
  if (event.key === "Escape") {
    closeContextMenus();
    closePopovers();
  }
}

function sourcePoint(element: HTMLElement): { readonly x: number; readonly y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.right, y: rect.bottom };
}

function syncSettingsTabs(): void {
  const dialog = document.querySelector<HTMLElement>("#surface-settings[open], #surface-room-settings[open]");
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
    tab.setAttribute("aria-current", String(tab === button));
  }
  for (const panel of picker.querySelectorAll<HTMLElement>("[data-sticker-panel]")) {
    panel.hidden = panel.dataset["stickerPanel"] !== key;
  }
  const scroll = picker.querySelector<HTMLElement>("[data-sticker-scroll]");
  if (scroll !== null) scroll.scrollTop = 0;
}

function clearSettingsHash(): void {
  if (!location.hash.startsWith("#settings-") && !location.hash.startsWith("#room-settings-")) return;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

export function wireSurfaces({ store, actions, c, composer }: SurfacesInput): () => void {
  let activeRoomId: string | null = null;
  let activeMessageId: string | null = null;
  let profileTarget: ProfileTarget | null = null;
  let lastMenuSource: HTMLElement | null = null;
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

  const state = (): ChatState => store.snapshot();
  const room = (id: string | null): RoomSummary | null => state().rooms.find((entry) => entry.roomId === id) ?? null;
  const message = (id: string | null): MessageRow | null => state().messages.find((entry) => entry.id === id) ?? null;

  function refreshBody(id: string, overrideRoomId?: string | null): void {
    if (id === SURFACE.profile || id === SURFACE.viewer) return;
    const body = document.querySelector<HTMLElement>(`[data-region="${id}-body"]`);
    if (body === null) return;
    if (id === SURFACE.emoji) {
      body.innerHTML = emojiPickerBody(c, state().recentEmoji).value;
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
    const scrollTop = body.scrollTop;
    const current = state();
    const target = overrideRoomId === undefined ? current : { ...current, roomId: overrideRoomId };
    body.innerHTML = surfaceBodyFor(c, id, target).value;
    body.scrollTop = scrollTop;
    if (focus !== null && focus.action !== null) {
      const device = focus.deviceId === null ? "" : `[data-device-id="${CSS.escape(focus.deviceId)}"]`;
      const next =
        body.querySelector<HTMLElement>(`[data-settings-action="${CSS.escape(focus.action)}"]${device}`) ??
        body.querySelector<HTMLElement>("button:not([hidden])");
      next?.focus({ preventScroll: true });
    }
    syncSettingsTabs();
  }

  function filterMenu(id: string): void {
    const body = document.querySelector<HTMLElement>(`[data-region="${id}-body"]`);
    if (body === null) return;
    if (id === SURFACE.roomMenu) {
      const target = room(activeRoomId ?? state().roomId);
      const allowed = new Set<string>();
      if (target !== null) {
        if (target.isSpace) {
          allowed.add("spaceMenu.settings");
          if (target.capabilities.leave) allowed.add("spaceMenu.leave");
        } else {
          allowed.add("roomMenu.settings");
          if (target.capabilities.markRead) allowed.add("roomMenu.markRead");
          if (target.capabilities.favorite) allowed.add("roomMenu.favorite");
          if (target.capabilities.mute) allowed.add("roomMenu.mute");
          if (target.capabilities.leave) allowed.add("roomMenu.leave");
          if (target.capabilities.invite) allowed.add("roomMenu.invite");
          allowed.add("roomMenu.mediaFiles");
          allowed.add("roomMenu.search");
        }
      }
      for (const item of body.querySelectorAll<HTMLElement>("[data-menu-key]")) {
        item.hidden = !allowed.has(item.dataset["menuKey"] ?? "");
      }
      return;
    }
    if (id === SURFACE.messageMenu) {
      const target = message(activeMessageId);
      const capabilities = target?.capabilities;
      const allowed = new Set<string>();
      if (capabilities !== undefined) {
        if (capabilities.reply) allowed.add("messageMenu.reply");
        if (capabilities.react) allowed.add("messageMenu.react");
        if (capabilities.edit) allowed.add("messageMenu.edit");
        if (capabilities.redact) allowed.add("messageMenu.delete");
        if (capabilities.copy) allowed.add("messageMenu.copy");
        if (capabilities.copyLink) allowed.add("messageMenu.copyLink");
        allowed.add("messageMenu.select");
        if (target !== null && target.own && target.status !== "sent") allowed.add("messageMenu.cancel");
        if (target !== null && target.own && target.status === "failed") allowed.add("messageMenu.retry");
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
    filterMenu(id);
    lastMenuSource =
      id === SURFACE.messageMenu
        ? (sourceElement.querySelector<HTMLElement>(".message-inner") ?? sourceElement)
        : sourceElement;
    lastMenuWasKeyboard = keyboard;
    if (id === SURFACE.messageMenu) sourceElement.classList.add("is-active");
    menu.classList.add("is-context", "is-measuring");
    setPosition("--context-x", `${String(point.x)}px`);
    setPosition("--context-y", `${String(point.y)}px`);
    menu.showPopover();
    const rect = menu.getBoundingClientRect();
    let x = centered ? point.x - rect.width / 2 : point.x + 4;
    let y = centered ? point.y - rect.height / 2 : point.y + 4;
    x = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
    y = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
    setPosition("--context-x", `${String(x)}px`);
    setPosition("--context-y", `${String(y)}px`);
    menu.classList.remove("is-measuring");
    if (keyboard) menu.querySelector<HTMLElement>(".surface-item:not([hidden])")?.focus({ preventScroll: true });
  }

  function showProfile(name: string, userId: string): void {
    if (name === "") return;
    profileTarget = { name, userId };
    const body = document.querySelector<HTMLElement>(`[data-region="${SURFACE.profile}-body"]`);
    if (body === null) return;
    body.innerHTML = html`<div class="profile-card">
      <span class="profile-avatar" aria-hidden="true">${name.slice(0, 1)}</span>
      <h3 class="profile-name">${name}</h3>
      <p class="note">${userId}</p>
      <button class="button-primary" type="button" data-profile-action="message">
        ${t(c, "surface.profile.message")}
      </button>
    </div>`.value;
  }

  function updateRecovery(): void {
    const key = state().recoveryKey;
    const region = document.querySelector<HTMLElement>('[data-region="recovery-key"]');
    if (region === null) return;
    if (key === null) {
      region.hidden = true;
      return;
    }
    region.hidden = false;
    const value = region.querySelector<HTMLElement>('[data-field="recovery-value"]');
    if (value !== null) value.textContent = key.value;
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

  function handleSettingsAction(action: string, element: HTMLElement): void {
    if (action === "logout") {
      askConfirm(t(c, "settings.logoutConfirm"), () => actions.logout());
      return;
    } else if (action === "recovery") {
      actions.revealRecoveryKey();
      queueMicrotask(() => {
        updateRecovery();
        const value = document.querySelector<HTMLElement>('[data-setting-value="recovery"]');
        if (value !== null) value.textContent = t(c, "settings.recoveryShown");
      });
      return;
    } else if (action === "copy-recovery") {
      const key = state().recoveryKey;
      if (key !== null) copy(key.value);
      return;
    } else if (action === "download-recovery") {
      downloadRecovery();
      return;
    } else if (action === "verify-device") actions.verifyDevice(element.dataset["deviceId"] ?? "");
    else if (action === "sign-out-device") {
      const deviceId = element.dataset["deviceId"] ?? "";
      askConfirm(t(c, "settings.signOutDeviceConfirm"), () => {
        actions.signOutDevice(deviceId);
        queueMicrotask(() => refreshBody(SURFACE.settings));
      });
    } else if (action === "sign-out-others") {
      askConfirm(t(c, "settings.signOutOthersConfirm"), () => {
        actions.signOutOthers();
        queueMicrotask(() => refreshBody(SURFACE.settings));
      });
    } else if (action === "backup") {
      const value = element.closest(".surface-section")?.querySelector<HTMLElement>('[data-setting-value="backup"]');
      if (value !== null && value !== undefined) value.textContent = t(c, "settings.ready");
      return;
    }
    queueMicrotask(() => refreshBody(SURFACE.settings));
  }

  function setDialogTitle(id: string, key: Parameters<typeof t>[1]): void {
    const title = document.getElementById(id)?.querySelector<HTMLElement>("h2");
    if (title !== null && title !== undefined) title.textContent = t(c, key);
  }

  function openMediaFiles(roomId: string): void {
    const dialog = document.getElementById(SURFACE.mediaFiles);
    const body = dialog?.querySelector<HTMLElement>(`[data-region="${SURFACE.mediaFiles}-body"]`);
    if (!(dialog instanceof HTMLDialogElement) || body === null || body === undefined) return;
    body.innerHTML = mediaFilesBody(c, actions.search([roomId], "")).value;
    body.scrollTop = 0;
    dialog.showModal();
  }

  function openSearch(roomId: string): void {
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
    else if (action === "roomMenu.favorite") actions.toggleFavorite(id);
    else if (action === "roomMenu.mute") actions.toggleMute(id);
    else if (action === "roomMenu.leave") {
      hide(SURFACE.roomMenu);
      askConfirm(t(c, "roomMenu.leaveConfirm"), () => actions.leaveRoom(id));
      return;
    } else if (action === "roomMenu.mediaFiles") {
      hide(SURFACE.roomMenu);
      openMediaFiles(id);
      return;
    } else if (action === "roomMenu.search") {
      hide(SURFACE.roomMenu);
      openSearch(id);
      return;
    } else if (action === "roomMenu.invite") {
      hide(SURFACE.roomMenu);
      refreshBody(SURFACE.invite);
      const inviteDialog = document.getElementById(SURFACE.invite);
      if (inviteDialog instanceof HTMLDialogElement) inviteDialog.showModal();
      return;
    } else if (action === "spaceMenu.settings") {
      hide(SURFACE.roomMenu);
      const dialog = document.getElementById(SURFACE.roomSettings);
      if (dialog instanceof HTMLDialogElement) {
        setDialogTitle(SURFACE.roomSettings, "spaceMenu.settings");
        refreshBody(SURFACE.roomSettings, id);
        dialog.showModal();
      }
      return;
    } else if (action === "spaceMenu.leave") {
      hide(SURFACE.roomMenu);
      askConfirm(t(c, "spaceMenu.leaveConfirm"), () => actions.leaveRoom(id));
      return;
    }
    hide(SURFACE.roomMenu);
  }

  function handleMessageAction(action: string): void {
    const target = message(activeMessageId);
    if (target === null) return;
    if (action === "messageMenu.reply") composer.showReply(target);
    else if (action === "messageMenu.react") {
      const source = lastMenuSource;
      hide(SURFACE.messageMenu);
      if (source !== null) {
        openContextMenu(SURFACE.reaction, source, sourcePoint(source), false, lastMenuWasKeyboard);
      }
      return;
    } else if (action === "messageMenu.edit") composer.showEditing(target);
    else if (action === "messageMenu.delete") actions.redact(target.id);
    else if (action === "messageMenu.cancel") actions.discardMessage(target.id);
    else if (action === "messageMenu.retry") actions.retryMessage(target.id);
    else if (action === "messageMenu.copy") copy(target.body);
    else if (action === "messageMenu.copyLink")
      copy(`${location.origin}${location.pathname}#${target.roomId}/${target.id}`);
    else if (action === "messageMenu.select") {
      document.dispatchEvent(new CustomEvent("maski:select-message", { detail: { id: target.id } }));
    }
    hide(SURFACE.messageMenu);
  }

  function search(form: HTMLFormElement): void {
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
            .rooms.filter((entry) => !entry.isSpace && entry.membership === "join")
            .map((entry) => entry.roomId)
        : [scope];
    const matches = actions.search(roomIds, query).slice(0, 40);
    results.innerHTML =
      matches.length === 0
        ? `<p class="note">${t(c, "surface.search.empty")}</p>`
        : html`${matches.map(
            (entry) => html`<button
              class="search-result"
              type="button"
              data-search-room="${entry.roomId}"
              data-search-message="${entry.id}"
            >
              <span class="search-result-room">${room(entry.roomId)?.name ?? ""}</span
              ><span>${entry.body === "" ? (entry.media?.name ?? "") : entry.body}</span>
            </button>`,
          )}`.value;
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
      const root = mediaTab.closest<HTMLElement>("[data-media-files]");
      const key = mediaTab.dataset["mediaFilesTab"];
      if (root !== null && key !== undefined) {
        for (const tab of root.querySelectorAll<HTMLElement>("[data-media-files-tab]")) {
          tab.setAttribute("aria-current", String(tab === mediaTab));
        }
        for (const panel of root.querySelectorAll<HTMLElement>("[data-media-files-panel]")) {
          panel.hidden = panel.dataset["mediaFilesPanel"] !== key;
        }
      }
      return;
    }

    const scopeOption = target.closest<HTMLElement>("[data-search-scope-option]");
    if (scopeOption !== null) {
      const form = scopeOption.closest<HTMLFormElement>(".search-form");
      const button = form?.querySelector<HTMLElement>("[data-search-scope-button]");
      const value = scopeOption.dataset["searchScopeOption"];
      if (form !== null && form !== undefined && button !== null && button !== undefined && value !== undefined) {
        form.dataset["searchScope"] = value;
        button.textContent = scopeOption.textContent ?? "";
        button.setAttribute("aria-label", t(c, "surface.search.scope", { room: scopeOption.textContent ?? "" }));
        for (const option of form.querySelectorAll<HTMLElement>("[data-search-scope-option]")) {
          option.setAttribute("aria-current", String(option === scopeOption));
        }
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
      const id = invoker.getAttribute("commandfor");
      if (id === SURFACE.settings) {
        if (state().recoveryKey !== null) actions.clearRecoveryKey();
        refreshBody(id);
      } else if (id === SURFACE.invite) refreshBody(id);
      else if (id === SURFACE.roomSettings) {
        hide(SURFACE.roomMenu);
        setDialogTitle(id, "roomMenu.settings");
        refreshBody(id, activeRoomId ?? state().roomId);
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
      showViewer(
        media.dataset["mediaOpen"] ?? "",
        media.dataset["mediaKind"] ?? "file",
        media.dataset["mediaUrl"] ?? null,
        c,
      );
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
          requestAnimationFrame(() => {
            const row = document.querySelector<HTMLElement>(`li.message[data-id="${CSS.escape(messageId)}"]`);
            row?.scrollIntoView({ block: "center" });
          });
        }
      }
      return;
    }

    const profileAction = target.closest<HTMLElement>("[data-profile-action]");
    if (profileAction !== null && profileTarget !== null) {
      hide(SURFACE.profile);
      const existing = state().rooms.find((entry) => entry.isDirect && entry.name === profileTarget?.name);
      if (existing !== undefined) actions.selectRoom(existing.roomId);
      else actions.addRoom(profileTarget.name, t(c, "room.directTopic"), true);
      return;
    }

    const action = target.closest<HTMLElement>("[data-action]");
    if (action !== null) {
      event.preventDefault();
      const surface = action.closest<HTMLElement>(".surface");
      if (surface?.id === SURFACE.roomMenu) handleRoomAction(action.dataset["action"] ?? "");
      else if (surface?.id === SURFACE.messageMenu) handleMessageAction(action.dataset["action"] ?? "");
      else if (surface?.id === SURFACE.roomSettings && action.dataset["action"] === "roomSettings.leave") {
        const roomId = activeRoomId ?? state().roomId ?? "";
        const leavingSpace = room(roomId)?.isSpace === true;
        askConfirm(t(c, leavingSpace ? "spaceMenu.leaveConfirm" : "roomMenu.leaveConfirm"), () => {
          actions.leaveRoom(roomId);
          hide(SURFACE.roomSettings);
        });
      }
      return;
    }

    const reactionChoice = target.closest<HTMLElement>("[data-react-choice]");
    if (reactionChoice !== null) {
      event.preventDefault();
      if (activeMessageId !== null) actions.react(activeMessageId, reactionChoice.dataset["reactChoice"] ?? "");
      hide(SURFACE.reaction);
      return;
    }

    const reaction = target.closest<HTMLElement>(".reaction");
    if (reaction !== null) {
      const row = reaction.closest<HTMLElement>("li.message");
      if (row?.dataset["id"] !== undefined && reaction.dataset["reaction"] !== undefined) {
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
    if (id === "search") search(form);
    else if (id === "new-message") {
      const value = form.querySelector<HTMLInputElement>("#new-message-field")?.value.trim() ?? "";
      if (value === "") return;
      actions.addRoom(value, t(c, "room.directTopic"), true);
      hide(SURFACE.newMessage);
    } else if (id === "join") {
      const value = form.querySelector<HTMLInputElement>("#join-field")?.value.trim() ?? "";
      if (value === "") return;
      actions.addRoom(value, t(c, "room.joinedTopic"), false);
      hide(SURFACE.join);
    } else if (id === "create") {
      const name = form.querySelector<HTMLInputElement>("#create-name")?.value.trim() ?? "";
      const topic = form.querySelector<HTMLInputElement>("#create-topic")?.value.trim() ?? "";
      if (name === "") return;
      actions.addRoom(name, topic, false);
      hide(SURFACE.create);
    }
  }

  function onChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === "surface-attach-input") {
      composer.handleFileInput(target);
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset["setting"] !== undefined) {
      const key = target.dataset["setting"];
      if (key === "badge" || key === "titleTotal" || key === "desktop" || key === "preview") {
        actions.setPref(key, target.checked);
      }
      return;
    }
    if (target instanceof HTMLSelectElement && target.dataset["roomNotifications"] !== undefined) {
      const id = activeRoomId ?? state().roomId;
      if (id !== null) actions.setNotification(id, target.value as RoomSummary["notification"]);
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
        SURFACE.messageMenu,
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
    if (!target.closest(`#${SURFACE.roomMenu}, #${SURFACE.messageMenu}, #${SURFACE.reaction}, #${SURFACE.sendMenu}`)) {
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
      openContextMenu(SURFACE.messageMenu, target.messageRow, point, true, false);
    } else if (target.roomControl !== null) {
      openContextMenu(SURFACE.roomMenu, target.roomControl, point, true, false);
    } else if (target.send) {
      composer.openSendMenu(false);
    }
  }

  function onBeforeToggle(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !(event instanceof ToggleEvent)) return;
    if (event.newState !== "open") return;
    if (target.id === SURFACE.emoji) {
      refreshBody(SURFACE.emoji);
      return;
    }
    if (target.id === SURFACE.sticker) {
      refreshBody(SURFACE.sticker);
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
  }

  const onDocumentToggle = (event: Event): void => {
    if (!(event instanceof ToggleEvent) || event.newState !== "closed") return;
    if (!(event.target instanceof HTMLElement) || !CONTEXT_SURFACE_IDS.has(event.target.id)) {
      return;
    }
    if (event.target.matches(":popover-open")) return;
    event.target.classList.remove("is-context", "is-measuring");
    for (const row of document.querySelectorAll<HTMLElement>("li.message.is-active")) {
      row.classList.remove("is-active");
    }
    if (lastMenuWasKeyboard && !activeInComposer()) lastMenuSource?.focus({ preventScroll: true });
    lastMenuSource = null;
    lastMenuWasKeyboard = false;
    clearPosition("--context-x");
    clearPosition("--context-y");
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
    if (state().recoveryKey !== null) actions.clearRecoveryKey();
    clearSettingsHash();
  };
  for (const dialog of settingsDialogs) {
    dialog.addEventListener("close", onSettingsClose);
    dialog.addEventListener("toggle", syncSettingsTabs);
  }

  const viewer = document.getElementById(SURFACE.viewer);
  const onViewerClose = (): void => {
    for (const media of viewer?.querySelectorAll<HTMLMediaElement>("video, audio") ?? []) media.pause();
    const body = viewer?.querySelector<HTMLElement>(`.surface-body`);
    if (body !== null && body !== undefined) body.innerHTML = "";
  };
  viewer?.addEventListener("close", onViewerClose);

  const openForward = (ids: readonly string[]): void => {
    const dialog = document.getElementById(SURFACE.forward);
    if (!(dialog instanceof HTMLDialogElement) || ids.length === 0) return;
    const body = dialog.querySelector<HTMLElement>(`[data-region="${SURFACE.forward}-body"]`);
    if (body === null) return;
    dialog.dataset["forwardIds"] = ids.join(",");
    body.innerHTML = surfaceBodyFor(c, SURFACE.forward, state()).value;
    body.scrollTop = 0;
    dialog.showModal();
  };

  const onForwardOpen = (event: Event): void => {
    const ids = (event as CustomEvent<{ ids?: readonly string[] }>).detail?.ids ?? [];
    openForward(ids);
  };

  const onReplyMessage = (event: Event): void => {
    const id = (event as CustomEvent<{ id?: string }>).detail?.id;
    if (id === undefined) return;
    const target = message(id);
    if (target !== null) composer.showReply(target);
  };

  const onConfirmRequest = (event: Event): void => {
    const detail = (event as CustomEvent<{ message?: string; action?: () => void }>).detail;
    if (detail?.message !== undefined && typeof detail.action === "function") askConfirm(detail.message, detail.action);
  };

  document.addEventListener("click", onClick);
  document.addEventListener("maski:forward-open", onForwardOpen);
  document.addEventListener("maski:reply-message", onReplyMessage);
  document.addEventListener("maski:confirm", onConfirmRequest);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("change", onChange);
  document.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", clearPress);
  document.addEventListener("beforetoggle", onBeforeToggle, true);
  document.addEventListener("toggle", onDocumentToggle, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("hashchange", syncSettingsTabs);
  window.addEventListener("pageshow", closeRestoredPopovers);
  requestAnimationFrame(closeRestoredPopovers);

  return () => {
    document.removeEventListener("click", onClick);
    document.removeEventListener("maski:forward-open", onForwardOpen);
    document.removeEventListener("maski:reply-message", onReplyMessage);
    document.removeEventListener("maski:confirm", onConfirmRequest);
    document.removeEventListener("submit", onSubmit);
    document.removeEventListener("change", onChange);
    document.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("pointerdown", onPointerDown);
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
