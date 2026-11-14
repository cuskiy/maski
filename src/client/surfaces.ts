import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html } from "../lib/html.ts";
import type { ChatState, MessageRow, RoomSummary } from "../core/types.ts";
import { SURFACE } from "../core/regions.ts";
import { surfaceBodyFor } from "../layouts/app.ts";
import { icons } from "../components/icons.ts";
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

const CONTEXT_SURFACES = [SURFACE.roomMenu, SURFACE.messageMenu, SURFACE.sendMenu] as const;
const POPOVERS = [
  SURFACE.navMenu,
  SURFACE.profile,
  SURFACE.attach,
  SURFACE.sticker,
  SURFACE.emoji,
  SURFACE.sendMenu,
] as const;
function closePopovers(except?: string): void {
  for (const id of [...POPOVERS, ...CONTEXT_SURFACES]) {
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

function showViewer(name: string, kind: string): void {
  const body = document.querySelector<HTMLElement>(`[data-region="${SURFACE.viewer}-body"]`);
  if (body === null) return;
  const icon =
    kind === "image"
      ? icons.image
      : kind === "video"
        ? icons.video
        : kind === "audio"
          ? icons.audio
          : kind === "sticker"
            ? icons.sticker
            : icons.file;
  body.innerHTML = html`<div class="viewer-preview">${icon}<span class="viewer-name">${name}</span></div>`.value;
}

function copy(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {
    // Clipboard permission can be denied; the mock has no toast.
  });
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeContextMenus();
}

function sourcePoint(element: HTMLElement): { readonly x: number; readonly y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.right, y: rect.bottom };
}

export function wireSurfaces({ store, actions, c, composer }: SurfacesInput): () => void {
  let activeRoomId: string | null = null;
  let activeMessageId: string | null = null;
  let profileTarget: ProfileTarget | null = null;
  let lastMenuSource: HTMLElement | null = null;
  let lastMenuWasKeyboard = false;
  let pressTimer: number | null = null;
  let pressPoint: { x: number; y: number } | null = null;
  let suppressClick = false;
  let suppressNextContext = false;

  const state = (): ChatState => store.snapshot();
  const room = (id: string | null): RoomSummary | null => state().rooms.find((entry) => entry.roomId === id) ?? null;
  const message = (id: string | null): MessageRow | null => state().messages.find((entry) => entry.id === id) ?? null;

  function refreshBody(id: string, overrideRoomId?: string | null): void {
    if (id === SURFACE.profile || id === SURFACE.viewer) return;
    const body = document.querySelector<HTMLElement>(`[data-region="${id}-body"]`);
    if (body === null) return;
    const current = state();
    const target = overrideRoomId === undefined ? current : { ...current, roomId: overrideRoomId };
    body.innerHTML = surfaceBodyFor(c, id, target).value;
  }

  function filterMenu(id: string): void {
    const body = document.querySelector<HTMLElement>(`[data-region="${id}-body"]`);
    if (body === null) return;
    if (id === SURFACE.roomMenu) {
      const target = room(activeRoomId ?? state().roomId);
      const allowed = new Set<string>();
      if (target !== null) {
        allowed.add("roomMenu.settings");
        if (target.capabilities.markRead) allowed.add("roomMenu.markRead");
        if (target.capabilities.favorite) allowed.add("roomMenu.favorite");
        if (target.capabilities.mute) allowed.add("roomMenu.mute");
        if (target.capabilities.leave) allowed.add("roomMenu.leave");
        allowed.add("roomMenu.copyLink");
      }
      for (const item of body.querySelectorAll<HTMLElement>("[data-action]")) {
        item.hidden = !allowed.has(item.dataset["action"] ?? "");
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
        if (target !== null && target.own && target.status !== "sent") allowed.add("messageMenu.cancel");
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
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "maski-recovery-key.txt";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  function handleSettingsAction(action: string, element: HTMLElement): void {
    if (action === "logout") actions.logout();
    else if (action === "recovery") {
      actions.revealRecoveryKey();
      queueMicrotask(() => {
        refreshBody(SURFACE.settings);
        updateRecovery();
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
    else if (action === "sign-out-device") actions.signOutDevice(element.dataset["deviceId"] ?? "");
    else if (action === "sign-out-others") actions.signOutOthers();
    else if (action === "backup") {
      const value = element.closest(".surface-section")?.querySelector<HTMLElement>('[data-setting-value="backup"]');
      if (value !== null && value !== undefined) value.textContent = t(c, "settings.ready");
      return;
    } else if (action === "reset") {
      if (window.confirm(t(c, "settings.reset"))) actions.logout();
      return;
    }
    queueMicrotask(() => refreshBody(SURFACE.settings));
  }

  function handleRoomAction(action: string): void {
    const id = activeRoomId ?? state().roomId;
    if (id === null) return;
    if (action === "roomMenu.markRead") actions.markRead(id);
    else if (action === "roomMenu.favorite") actions.toggleFavorite(id);
    else if (action === "roomMenu.mute") actions.toggleMute(id);
    else if (action === "roomMenu.leave") actions.leaveRoom(id);
    else if (action === "roomMenu.copyLink") copy(`${location.origin}${location.pathname}#${id}`);
    hide(SURFACE.roomMenu);
  }

  function handleMessageAction(action: string): void {
    const target = message(activeMessageId);
    if (target === null) return;
    if (action === "messageMenu.reply") composer.showReply(target);
    else if (action === "messageMenu.react") actions.react(target.id, "👍");
    else if (action === "messageMenu.edit") composer.showEditing(target);
    else if (action === "messageMenu.delete") actions.redact(target.id);
    else if (action === "messageMenu.cancel") actions.discardMessage(target.id);
    else if (action === "messageMenu.copy") copy(target.body);
    else if (action === "messageMenu.copyLink")
      copy(`${location.origin}${location.pathname}#${target.roomId}/${target.id}`);
    hide(SURFACE.messageMenu);
  }

  function search(form: HTMLFormElement): void {
    const input = form.querySelector<HTMLInputElement>("#search-field");
    const results = document.querySelector<HTMLElement>("[data-search-results]");
    if (input === null || results === null) return;
    const query = input.value.trim().toLowerCase();
    if (query === "") {
      results.replaceChildren();
      return;
    }
    const matches = state()
      .messages.filter((entry) => entry.body.toLowerCase().includes(query))
      .slice(0, 8);
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
              <span class="search-result-room">${room(entry.roomId)?.name ?? ""}</span><span>${entry.body}</span>
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
    if (composer.handleClick(target)) {
      event.preventDefault();
      return;
    }

    if (target.closest('[popovertarget="surface-language"]') !== null) hide(SURFACE.navMenu);

    const invoker = target.closest<HTMLElement>("[commandfor]");
    if (invoker !== null) {
      const id = invoker.getAttribute("commandfor");
      if (id === SURFACE.settings) {
        refreshBody(id);
        queueMicrotask(updateRecovery);
      } else if (id === SURFACE.invite) refreshBody(id);
      else if (id === SURFACE.roomSettings) {
        hide(SURFACE.roomMenu);
        refreshBody(id, activeRoomId ?? state().roomId);
      }
    }

    const settings = target.closest<HTMLElement>("[data-settings-action]");
    if (settings !== null) {
      event.preventDefault();
      handleSettingsAction(settings.dataset["settingsAction"] ?? "", settings);
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

    const media = target.closest<HTMLElement>("[data-media-open]");
    if (media !== null) {
      showViewer(media.dataset["mediaOpen"] ?? "", media.dataset["mediaKind"] ?? "file");
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
      else if (surface?.id === SURFACE.roomSettings) {
        actions.leaveRoom(activeRoomId ?? state().roomId ?? "");
        hide(SURFACE.roomSettings);
      }
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
    const space = target.closest<HTMLElement>("[data-space-toggle]");
    if (space !== null) {
      event.preventDefault();
      actions.toggleSpace(space.dataset["spaceToggle"] ?? "");
      return;
    }
    const roomButton = target.closest<HTMLElement>("button[data-room]");
    if (roomButton !== null) {
      event.preventDefault();
      actions.selectRoom(roomButton.dataset["room"] ?? "");
      return;
    }
    if (target.closest(".room-back") !== null) {
      event.preventDefault();
      actions.back();
    }
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
    const keyboardPoint = event.clientX === 0 && event.clientY === 0;
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
      composer.openSendMenu();
    }
  }

  function onPointerDown(event: PointerEvent): void {
    suppressClick = false;
    suppressNextContext = false;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(`#${SURFACE.roomMenu}, #${SURFACE.messageMenu}, #${SURFACE.sendMenu}`)) closeContextMenus();
    if (event.pointerType === "mouse") return;
    const roomControl = target.closest<HTMLElement>("button[data-room], [data-space-toggle]");
    const messageRow = target.closest<HTMLElement>("li.message");
    if (roomControl === null && messageRow === null) return;
    const id = roomControl?.dataset["room"] ?? roomControl?.dataset["spaceToggle"] ?? messageRow?.dataset["id"] ?? "";
    if (id === "") return;
    pressPoint = { x: event.clientX, y: event.clientY };
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      suppressClick = true;
      suppressNextContext = true;
      if (messageRow !== null) {
        activeMessageId = id;
        messageRow.classList.add("is-holding");
        openContextMenu(SURFACE.messageMenu, messageRow, pressPoint ?? { x: 0, y: 0 }, true, false);
      } else if (roomControl !== null) {
        activeRoomId = id;
        openContextMenu(SURFACE.roomMenu, roomControl, pressPoint ?? { x: 0, y: 0 }, true, false);
      }
    }, 450);
  }

  function onPointerUp(): void {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    pressPoint = null;
    for (const row of document.querySelectorAll<HTMLElement>("li.message.is-holding")) {
      row.classList.remove("is-holding");
    }
  }

  function onBeforeToggle(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !(event instanceof ToggleEvent)) return;
    if (event.newState !== "open") return;
    if (target.id === SURFACE.settings) {
      refreshBody(SURFACE.settings);
      queueMicrotask(updateRecovery);
    } else if (target.id === SURFACE.roomSettings) {
      refreshBody(SURFACE.roomSettings, activeRoomId ?? state().roomId);
    } else if (target.id === SURFACE.invite) {
      refreshBody(SURFACE.invite);
    } else if (target.id === SURFACE.roomMenu) {
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
    if (!(event.target instanceof HTMLElement) || !(CONTEXT_SURFACES as readonly string[]).includes(event.target.id)) {
      return;
    }
    if (event.target.matches(":popover-open")) return;
    event.target.classList.remove("is-context", "is-measuring");
    for (const row of document.querySelectorAll<HTMLElement>("li.message.is-active")) {
      row.classList.remove("is-active");
    }
    if (lastMenuWasKeyboard) lastMenuSource?.focus({ preventScroll: true });
    lastMenuSource = null;
    lastMenuWasKeyboard = false;
    clearPosition("--context-x");
    clearPosition("--context-y");
  };

  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("change", onChange);
  document.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);
  document.addEventListener("beforetoggle", onBeforeToggle, true);
  document.addEventListener("toggle", onDocumentToggle, true);
  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    document.removeEventListener("click", onClick);
    document.removeEventListener("submit", onSubmit);
    document.removeEventListener("change", onChange);
    document.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
    document.removeEventListener("beforetoggle", onBeforeToggle, true);
    document.removeEventListener("toggle", onDocumentToggle, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}
