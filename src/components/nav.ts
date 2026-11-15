import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
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
  key: "sections.favorites" | "sections.rooms" | "sections.direct" | "sections.channels";
}> = [
  { id: "favorites", key: "sections.favorites" },
  { id: "rooms", key: "sections.rooms" },
  { id: "direct", key: "sections.direct" },
  { id: "channels", key: "sections.channels" },
];

export function nav(state: ChatState, c: Catalog): Html {
  const session = state.session;
  return html`<aside class="nav" data-region="${REGION.nav}" aria-label="${t(c, "nav.label")}">
    <noscript><p class="note">${t(c, "noscript.chat")}</p></noscript>
    <nav
      class="nav-sections"
      data-region="${REGION.sections}"
      aria-label="${t(c, "nav.roomsLabel")}"
      ${state.roomsLoading ? html` aria-busy="true"` : html``}
    >
      ${SECTIONS.map((section) => sectionView(state, c, section.id, section.key))}
    </nav>
    ${surface({
      c,
      id: SURFACE.navMenu,
      titleKey: "nav.menu",
      kind: "floating",
      body: html`<div class="surface-menu">
        ${ACTIONS.map((action) => surfaceTrigger(action.surface, t(c, action.key), action.icon, "modal"))}
        ${languageTrigger(c, "action")}
      </div>`,
    })}
    <button
      class="nav-account"
      type="button"
      data-region="${REGION.menu}"
      popovertarget="${SURFACE.navMenu}"
      aria-label="${t(c, "nav.menu")}"
    >
      <span class="nav-avatar" data-field="avatar" aria-hidden="true" ${session === null ? html`hidden` : html``}
        >${session === null ? "" : session.displayName.slice(0, 1)}</span
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
      ${loading ? skeletonRows() : rooms.map((room) => (room.isSpace ? spaceRow(state, c, room) : roomRow(state, c, room)))}
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
  if (room.lowPriority === true) return false;
  if (room.spaceId !== null) return false;
  if (section === "favorites") return room.favorite;
  if (section === "direct") return room.isDirect && !room.favorite;
  if (section === "channels") return room.isSpace && !room.favorite;
  return !room.isDirect && !room.isSpace && !room.favorite;
}

function badge(room: RoomSummary, c: Catalog): Html {
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
  const children = state.rooms.filter((child) => child.spaceId === room.roomId && child.lowPriority !== true);
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
        <span class="room-preview" data-field="preview" dir="auto">${room.preview?.body ?? ""}</span>
      </span>
      <span class="room-side">
        ${badge(room, c)}
        ${room.muted ? muted(c) : html``}
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
  return html`<li class="room${active ? " is-active" : ""}" data-room="${room.roomId}">
    <button
      class="room-main"
      type="button"
      ${active ? html` aria-current="page"` : html``}
      data-room="${room.roomId}"
    >
      <span class="room-avatar" aria-hidden="true"
        >${room.avatar === null ? room.name.slice(0, 1) : html`<img src="${room.avatar}" alt="" />`}</span
      >
      <span class="room-text">
        <span class="room-name" data-field="name" dir="auto">${room.name}</span>
        <span class="room-preview" data-field="preview" dir="auto">${room.preview?.body ?? ""}</span>
      </span>
      <span class="room-side">
        ${badge(room, c)}${room.muted ? muted(c) : html``}
      </span>
    </button>
    <span class="room-swipe-hint is-start" aria-hidden="true">${icons.check}</span>
    <span class="room-swipe-hint is-end" aria-hidden="true">${icons.mute}</span>
  </li>`;
}
