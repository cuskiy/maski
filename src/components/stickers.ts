import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { ALL_EMOJI, emojiButtons } from "./emoji.ts";

export interface StickerPack {
  readonly key: CatalogKey;
  readonly stickers: readonly string[];
}

export const STICKER_PACKS: readonly StickerPack[] = [
  {
    key: "surface.sticker.pack1",
    stickers: ["👋", "🎉", "🐱", "🌿", "✨", "🫡"],
  },
];

function stickerButtons(stickers: readonly string[]): Html {
  return html`${stickers.map(
    (sticker) =>
      html`<button class="pack-item" type="button" data-sticker="${sticker}" aria-label="${sticker}">
        ${sticker}
      </button>`,
  )}`;
}

export function stickerPickerBody(c: Catalog, recent: readonly string[]): Html {
  const recents = recent.filter(Boolean).slice(0, 6);
  return html`<div class="sticker-picker" data-sticker-picker>
    ${
      recents.length === 0
        ? html``
        : html`<section class="sticker-recents" aria-label="${t(c, "surface.sticker.recent")}">
            <p class="pack-head">${t(c, "surface.sticker.recent")}</p>
            <div class="pack-grid sticker-recent-grid">${stickerButtons(recents)}</div>
          </section>`
    }
    <nav class="sticker-tabs" role="tablist" aria-label="${t(c, "surface.sticker.packs")}">
      <button
        class="sticker-tab"
        type="button"
        role="tab"
        id="sticker-tab-emoji"
        aria-controls="sticker-panel-emoji"
        aria-selected="true"
        data-sticker-tab="emoji"
      >
        ${t(c, "surface.emoji")}
      </button>
      ${STICKER_PACKS.map(
        (pack) => html`<button
          class="sticker-tab"
          type="button"
          role="tab"
          id="sticker-tab-${pack.key}"
          aria-controls="sticker-panel-${pack.key}"
          aria-selected="false"
          tabindex="-1"
          data-sticker-tab="${pack.key}"
        >
          ${t(c, pack.key)}
        </button>`,
      )}
    </nav>
    <div class="sticker-scroll" data-sticker-scroll>
      <section
        class="sticker-panel"
        id="sticker-panel-emoji"
        role="tabpanel"
        aria-labelledby="sticker-tab-emoji"
        data-sticker-panel="emoji"
      >
        <div class="pack-grid">${emojiButtons(ALL_EMOJI)}</div>
      </section>
      ${STICKER_PACKS.map(
        (pack) => html`<section
          class="sticker-panel"
          id="sticker-panel-${pack.key}"
          role="tabpanel"
          aria-labelledby="sticker-tab-${pack.key}"
          data-sticker-panel="${pack.key}"
          hidden
        >
          <div class="pack-grid">${stickerButtons(pack.stickers)}</div>
        </section>`,
      )}
    </div>
  </div>`;
}
