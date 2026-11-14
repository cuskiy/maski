import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import type { ChatState, RoomSummary } from "../core/types.ts";
import { REGION, SURFACE } from "../core/regions.ts";
import { icons } from "./icons.ts";

export function topbar(state: ChatState, c: Catalog): Html {
  const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
  return html`<header class="room-header" data-region="${REGION.header}" data-room="${room === null ? "none" : "open"}">
    <button class="room-back" type="button" aria-label="${t(c, "chat.back")}">${icons.back}</button>
    ${room === null ? emptyRoom() : roomInfo(room, state, c)}
    <button
      class="room-menu"
      type="button"
      popovertarget="${SURFACE.roomMenu}"
      data-field="menu"
      data-room-id="${state.roomId ?? ""}"
      aria-haspopup="menu"
      aria-label="${t(c, "chat.roomMenu")}"
      ${room === null ? html` hidden` : html``}
    >
      ${icons.more}
    </button>
  </header>`;
}

function emptyRoom(): Html {
  return html`<span class="room-header-avatar" data-field="avatar" aria-hidden="true" hidden></span>
    <span class="room-head-text">
      <h2 class="room-title" data-field="title"></h2>
      <p class="room-topic" data-field="topic"></p>
    </span>`;
}

function roomInfo(room: RoomSummary, state: ChatState, c: Catalog): Html {
  return html`<span class="room-header-avatar" data-field="avatar" aria-hidden="true"
      >${room.avatar === null ? room.name.slice(0, 1) : html`<img src="${room.avatar}" alt="" />`}</span
    >
    <span class="room-head-text">
      <h2 class="room-title" data-field="title">${room.name}</h2>
      <p class="room-topic" data-field="topic">
        ${state.typing.length > 0 ? t(c, "chat.typing", { names: state.typing.join(", ") }) : room.topic}
      </p>
    </span>`;
}
