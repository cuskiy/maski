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

function hidden(value: boolean): Html {
  return value ? html` hidden` : html``;
}

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
  const activeKey = STICKER_PACKS[0]?.key ?? "emoji";
  return html`<div class="sticker-picker" data-sticker-picker>
    ${
      recents.length === 0
        ? html``
        : html`<section class="sticker-recents" aria-label="${t(c, "surface.sticker.recent")}">
            <p class="pack-head">${t(c, "surface.sticker.recent")}</p>
            <div class="pack-grid sticker-recent-grid">${stickerButtons(recents)}</div>
          </section>`
    }
    <nav class="sticker-tabs" aria-label="${t(c, "surface.sticker.packs")}">
      <button
        class="sticker-tab"
        type="button"
        data-sticker-tab="emoji"
        aria-current="${activeKey === "emoji" ? "true" : "false"}"
      >
        ${t(c, "surface.emoji")}
      </button>
      ${STICKER_PACKS.map(
        (pack) => html`<button
          class="sticker-tab"
          type="button"
          data-sticker-tab="${pack.key}"
          aria-current="${activeKey === pack.key ? "true" : "false"}"
        >
          ${t(c, pack.key)}
        </button>`,
      )}
    </nav>
    <div class="sticker-scroll" data-sticker-scroll>
      <section class="sticker-panel" data-sticker-panel="emoji"${hidden(activeKey !== "emoji")}>
        <div class="pack-grid">${emojiButtons(ALL_EMOJI)}</div>
      </section>
      ${STICKER_PACKS.map(
        (pack) => html`<section
          class="sticker-panel"
          data-sticker-panel="${pack.key}"
          ${hidden(activeKey !== pack.key)}
        >
          <div class="pack-grid">${stickerButtons(pack.stickers)}</div>
        </section>`,
      )}
    </div>
  </div>`;
}
