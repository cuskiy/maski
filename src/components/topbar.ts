import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { safeAvatarUrl } from "../lib/safeUrl.ts";
import { isSpaceRoom } from "../core/rooms.ts";
import type { ChatState, RoomSummary, SourceCapabilities } from "../core/types.ts";
import { REVIEW_CAPABILITIES } from "../core/types.ts";
import { REGION, SURFACE } from "../core/regions.ts";
import { icons } from "./icons.ts";

export function topbar(state: ChatState, c: Catalog, capabilities: SourceCapabilities = REVIEW_CAPABILITIES): Html {
  const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
  const menuVisible = room !== null && (!isSpaceRoom(room) || capabilities.setRoomState || capabilities.leaveRoom);
  return html`<header class="room-header" data-region="${REGION.header}">
    <button class="room-back" type="button" aria-label="${t(c, "chat.back")}">${icons.back}</button>
    ${room === null ? emptyRoom() : roomInfo(room, state, c, capabilities)}
    <button
      class="room-menu"
      type="button"
      popovertarget="${SURFACE.roomMenu}"
      data-field="menu"
      data-room-id="${state.roomId ?? ""}"
      aria-label="${t(c, "chat.roomMenu")}"
      ${menuVisible ? html`` : html` hidden`}
    >
      ${icons.more}
    </button>
  </header>`;
}

function emptyRoom(): Html {
  return html`<span class="room-header-avatar" data-field="avatar" aria-hidden="true" hidden></span>
    <span class="room-head-text">
      <h2 class="room-title" data-field="title" dir="auto" hidden></h2>
      <p class="room-topic" data-field="topic" dir="auto" hidden></p>
    </span>`;
}

function roomInfo(room: RoomSummary, state: ChatState, c: Catalog, capabilities: SourceCapabilities): Html {
  const avatar = safeAvatarUrl(room.avatar);
  const typing = capabilities.typing && state.typing.length > 0;
  return html`<span class="room-header-avatar" data-field="avatar" aria-hidden="true"
      >${avatar === null ? room.name.slice(0, 1) : html`<img src="${avatar}" alt="" loading="lazy" decoding="async" />`}</span
    >
    <span class="room-head-text">
      <h2 class="room-title" data-field="title" dir="auto">${room.name}</h2>
      <p class="room-topic" data-field="topic" dir="auto">
        ${typing ? t(c, "chat.typing", { names: state.typing.join(", ") }) : room.topic}
      </p>
    </span>`;
}
