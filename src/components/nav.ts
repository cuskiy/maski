import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { safeAvatarUrl } from "../lib/safeUrl.ts";
import { hasTag, isDirectRoom, isMuted, isSpaceRoom } from "../core/rooms.ts";
import type { ChatState, RoomSummary, SectionId } from "../core/types.ts";
import { REGION, SURFACE } from "../core/regions.ts";
import { icons } from "./icons.ts";
import { languageTrigger } from "./language.ts";
import { surface, surfaceTrigger } from "./surface.ts";

const ACTIONS = [
  { surface: SURFACE.newMessage, key: "nav.newMessage", icon: icons.compose },
  { surface: SURFACE.invite, key: "nav.invite", icon: icons.invite },
  { surface: SURFACE.join, key: "nav.join", icon: icons.join },
  { surface: SURFACE.create, key: "nav.create", icon: icons.create },
  { surface: SURFACE.settings, key: "nav.settings", icon: icons.settings },
] as const;

const SECTIONS: ReadonlyArray<{
  id: SectionId;
  key: "sections.favorites" | "sections.rooms" | "sections.direct" | "sections.spaces";
}> = [
  { id: "favorites", key: "sections.favorites" },
  { id: "rooms", key: "sections.rooms" },
  { id: "direct", key: "sections.direct" },
  { id: "spaces", key: "sections.spaces" },
];

export function nav(state: ChatState, c: Catalog): Html {
  const session = state.session;
  const accountAvatar = safeAvatarUrl(session?.avatar ?? null);
  return html`<aside class="nav" data-region="${REGION.nav}" aria-label="${t(c, "nav.label")}">
    <nav
      class="nav-sections"
      data-region="${REGION.sections}"
      aria-label="${t(c, "nav.roomsLabel")}"
      ${state.roomsLoading ? html` aria-busy="true"` : html``}
    >
      <noscript><p class="note">${t(c, "noscript.chat")}</p></noscript>
      ${SECTIONS.map((section) => sectionView(state, c, section.id, section.key))}
    </nav>
    ${surface({
      c,
      id: SURFACE.navMenu,
      titleKey: "nav.menu",
      kind: "floating",
      body: html`<div class="surface-menu" role="menu" aria-label="${t(c, "nav.menu")}">
        ${ACTIONS.map((action) => surfaceTrigger(action.surface, t(c, action.key), action.icon, "modal"))}
        ${languageTrigger(c, "action")}
      </div>`,
    })}
    <button
      class="nav-account"
      type="button"
      data-region="${REGION.menu}"
      popovertarget="${SURFACE.navMenu}"
      aria-label="${session === null ? t(c, "nav.menu") : `${session.displayName} — ${t(c, "nav.menu")}`}"
    >
      <span class="nav-avatar" data-field="avatar" aria-hidden="true" ${session === null ? html`hidden` : html``}
        >${
          session === null
            ? ""
            : accountAvatar === null
              ? session.displayName.slice(0, 1)
              : html`<img src="${accountAvatar}" alt="" loading="lazy" decoding="async" />`
        }</span
      >
      <span class="nav-account-text">
        <span class="nav-account-name" data-field="name" dir="auto">${session?.displayName ?? ""}</span>
        <span class="nav-account-id" data-field="userId" dir="ltr">${session?.userId ?? ""}</span>
      </span>
    </button>
  </aside>`;
}

function sectionView(state: ChatState, c: Catalog, id: SectionId, key: Parameters<typeof t>[1]): Html {
  const rooms = state.rooms.filter((room) => belongs(room, id));
  const open = state.sections[id].open;
  const loading = state.roomsLoading && id === "rooms";
  const booted = state.phase !== "boot";
  return html`<details class="section" data-section="${id}" ${open ? html` open` : html``}>
    <summary class="section-head">
      <span class="section-name">${t(c, key)}</span>
      ${!loading && booted ? html`<span class="section-count">${String(rooms.length)}</span>` : html``}
      <span class="section-chevron" aria-hidden="true">${icons.chevron}</span>
    </summary>
    <ol class="section-rows" role="list" data-rows="${id}">
      ${loading ? skeletonRows() : rooms.map((room) => (isSpaceRoom(room) ? spaceRow(state, c, room) : roomRow(state, c, room)))}
    </ol>
  </details>`;
}

function skeletonRows(): Html {
  return html`${Array.from(
    { length: 5 },
    () =>
      html`<li class="room-skeleton" aria-hidden="true">
        <span class="skeleton-avatar"></span><span class="skeleton-lines"><span></span><span></span></span>
      </li>`,
  )}`;
}

function belongs(room: RoomSummary, section: SectionId): boolean {
  if (hasTag(room, "m.lowpriority")) return false;
  if (room.spaceId !== null) return false;
  const favorite = hasTag(room, "m.favourite");
  if (section === "favorites") return favorite;
  if (section === "direct") return isDirectRoom(room) && !favorite;
  if (section === "spaces") return isSpaceRoom(room) && !favorite;
  return !isDirectRoom(room) && !isSpaceRoom(room) && !favorite;
}

function badge(room: RoomSummary, c: Catalog, visible: boolean): Html {
  if (!visible) return html``;
  if (room.highlight > 0)
    return html`<span
      class="room-badge is-mention"
      aria-label="${t(c, "room.highlight", { count: String(room.highlight) })}"
      >${String(room.highlight)}</span
    >`;
  if (room.unread > 0)
    return html`<span class="room-badge" aria-label="${t(c, "room.unread", { count: String(room.unread) })}"
      >${String(room.unread)}</span
    >`;
  return html``;
}

function muted(c: Catalog): Html {
  return html`<span class="room-muted" role="img" aria-label="${t(c, "room.muted")}">${icons.mute}</span>`;
}

function spaceRow(state: ChatState, c: Catalog, room: RoomSummary): Html {
  const open = state.openSpaces.includes(room.roomId);
  const children = state.rooms.filter((child) => child.spaceId === room.roomId && !hasTag(child, "m.lowpriority"));
  return html`<li class="room is-space${open ? " is-open" : ""}" data-space="${room.roomId}">
    <button
      class="room-main"
      type="button"
      data-space-toggle="${room.roomId}"
      aria-expanded="${open ? "true" : "false"}"
    >
      <span class="room-avatar" aria-hidden="true">${room.name.slice(0, 1)}</span>
      <span class="room-text">
        <span class="room-name" data-field="name" dir="auto">${room.name}</span>
        ${state.notifications.preview ? html`<span class="room-preview" data-field="preview" dir="auto">${room.preview?.body ?? ""}</span>` : html``}
      </span>
      <span class="room-side">
        ${badge(room, c, state.notifications.badge)}
        ${isMuted(room) ? muted(c) : html``}
        <span class="space-chevron" aria-hidden="true">${icons.chevron}</span>
      </span>
    </button>
    <ol class="space-rows" role="list" ${open ? html`` : html`hidden`}>
      ${children.map((child) => roomRow(state, c, child))}
    </ol>
  </li>`;
}

function roomRow(state: ChatState, c: Catalog, room: RoomSummary): Html {
  const active = room.roomId === state.roomId;
  const avatar = safeAvatarUrl(room.avatar);
  return html`<li class="room${active ? " is-active" : ""}" data-room="${room.roomId}">
    <button
      class="room-main"
      type="button"
      ${active ? html` aria-current="page"` : html``}
      data-room="${room.roomId}"
    >
      <span class="room-avatar" aria-hidden="true"
        >${avatar === null ? room.name.slice(0, 1) : html`<img src="${avatar}" alt="" loading="lazy" decoding="async" />`}</span
      >
      <span class="room-text">
        <span class="room-name" data-field="name" dir="auto">${room.name}</span>
        ${state.notifications.preview ? html`<span class="room-preview" data-field="preview" dir="auto">${room.preview?.body ?? ""}</span>` : html``}
      </span>
      <span class="room-side">
        ${badge(room, c, state.notifications.badge)}${isMuted(room) ? muted(c) : html``}
      </span>
    </button>
    <span class="room-swipe-hint is-start" aria-hidden="true">${icons.check}</span>
    <span class="room-swipe-hint is-end" aria-hidden="true">${icons.mute}</span>
  </li>`;
}
