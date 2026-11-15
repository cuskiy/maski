import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import type { ChatState, SourceCapabilities } from "../core/types.ts";
import { REVIEW_CAPABILITIES } from "../core/types.ts";
import { REGION, SURFACE } from "../core/regions.ts";
import { icons } from "./icons.ts";

export function composer(state: ChatState, c: Catalog, capabilities: SourceCapabilities = REVIEW_CAPABILITIES): Html {
  const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
  const placeholder =
    room === null ? t(c, "composer.placeholder") : t(c, "composer.placeholderRoom", { room: room.name });
  return html`<form
    class="composer"
    method="post"
    data-region="${REGION.composer}"
  >
    <div class="tray" data-region="${REGION.tray}" role="group" aria-label="${t(c, "composer.tray")}" hidden></div>
    <div
      class="composer-reply"
      data-region="${REGION.composerReply}"
      role="group"
      hidden
    ></div>
    <p class="form-error composer-error" data-composer-error role="alert" hidden></p>
    <div class="composer-bar">
      ${
        capabilities.media
          ? html`<button
              class="composer-action composer-attach"
              type="button"
              popovertarget="${SURFACE.attach}"
              aria-label="${t(c, "composer.attach")}"
            >
              ${icons.attach}
            </button>`
          : html``
      }
      ${
        capabilities.stickers
          ? html`<button
              class="composer-action composer-sticker"
              type="button"
              popovertarget="${SURFACE.sticker}"
              aria-label="${t(c, "composer.sticker")}"
            >
              ${icons.sticker}
            </button>`
          : html``
      }
      <div class="composer-field">
        <label class="visually-hidden" id="composer-label">${t(c, "composer.label")}</label>
        <div
          id="composer-input"
          class="composer-input"
          role="textbox"
          aria-multiline="true"
          aria-labelledby="composer-label"
          contenteditable="${room === null ? "false" : "true"}"
          aria-disabled="${room === null ? "true" : "false"}"
          data-empty="true"
          data-placeholder="${placeholder}"
          spellcheck="true"
          dir="auto"
        ></div>
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
        aria-controls="${SURFACE.sendMenu}"
        ${room === null ? html` disabled` : html``}
      >
        ${icons.send}
      </button>
    </div>
  </form>`;
}
