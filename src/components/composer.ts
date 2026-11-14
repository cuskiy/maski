import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import type { ChatState } from "../core/types.ts";
import { REGION, SURFACE } from "../core/regions.ts";
import { icons } from "./icons.ts";

export function composer(state: ChatState, c: Catalog): Html {
  const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
  const placeholder =
    room === null ? t(c, "composer.placeholder") : t(c, "composer.placeholderRoom", { room: room.name });
  return html`<form
    class="composer"
    method="post"
    data-region="${REGION.composer}"
    data-room="${room === null ? "none" : "open"}"
  >
    <div class="tray" data-region="${REGION.tray}" aria-label="${t(c, "composer.tray")}" hidden></div>
    <div class="composer-reply" data-region="${REGION.composerReply}" hidden></div>
    <div class="composer-bar">
      <button
        class="composer-action"
        type="button"
        popovertarget="${SURFACE.attach}"
        aria-label="${t(c, "composer.attach")}"
      >
        ${icons.attach}
      </button>
      <button
        class="composer-action"
        type="button"
        popovertarget="${SURFACE.sticker}"
        aria-label="${t(c, "composer.sticker")}"
      >
        ${icons.sticker}
      </button>
      <div class="composer-field">
        <label class="visually-hidden" for="composer-input">${t(c, "composer.label")}</label>
        <textarea
          id="composer-input"
          class="composer-input"
          rows="1"
          placeholder="${placeholder}"
          enterkeyhint="enter"
          ${room === null ? html` disabled` : html``}
        ></textarea>
        <button
          class="composer-emoji"
          type="button"
          popovertarget="${SURFACE.emoji}"
          aria-label="${t(c, "composer.emoji")}"
        >
          ${icons.emoji}
        </button>
      </div>
      <button
        class="composer-send"
        type="submit"
        id="composer-send"
        aria-label="${t(c, "composer.send")}"
        aria-haspopup="menu"
        aria-controls="${SURFACE.sendMenu}"
        ${room === null ? html` disabled` : html``}
      >
        ${icons.send}
      </button>
    </div>
  </form>`;
}
