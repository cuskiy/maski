import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { safeMediaUrl } from "../lib/safeUrl.ts";
import type { StickerPack } from "../core/types.ts";
import { ALL_EMOJI, emojiButtons } from "./emoji.ts";

export interface BuiltInStickerPack {
  readonly key: CatalogKey;
  readonly stickers: readonly string[];
}

export const STICKER_PACKS: readonly BuiltInStickerPack[] = [
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

function packImageButtons(pack: StickerPack): Html {
  return html`${pack.images.flatMap((image) => {
    const url = safeMediaUrl(image.url, "sticker");
    if (url === null) return [];
    return [
      html`<button
        class="pack-item pack-image-item"
        type="button"
        data-sticker-pack="${pack.id}"
        data-sticker-shortcode="${image.shortcode}"
        data-sticker-image="${url}"
        data-sticker-body="${image.body}"
        aria-label="${image.body}"
      >
        <img class="pack-image" src="${url}" alt="" loading="lazy" decoding="async" />
      </button>`,
    ];
  })}`;
}

function packLabel(c: Catalog, pack: StickerPack): string {
  if (pack.name !== "") return pack.name;
  return t(c, pack.id.startsWith("user:") ? "surface.sticker.userPack" : "surface.sticker.unnamed");
}

/** Sticker sections appended to the emoji picker; a click inserts text into the composer. */
export function stickerSections(c: Catalog, packs: readonly StickerPack[]): Html {
  return html`${packs.map(
    (pack) => html`<section class="pack-section" data-emoji-section="sticker-${pack.id}">
      <p class="pack-head">${packLabel(c, pack)}</p>
      <div class="pack-grid">
        ${pack.images.flatMap((image) => {
          const url = safeMediaUrl(image.url, "sticker");
          if (url === null) return [];
          return [
            html`<button
              class="pack-item pack-image-item"
              type="button"
              data-sticker-text="${image.body}"
              title="${image.body}"
              aria-label="${image.body}"
            >
              <img class="pack-image" src="${url}" alt="" loading="lazy" decoding="async" />
            </button>`,
          ];
        })}
      </div>
    </section>`,
  )}
  ${STICKER_PACKS.map(
    (pack) => html`<section class="pack-section" data-emoji-section="sticker-${pack.key}">
      <p class="pack-head">${t(c, pack.key)}</p>
      <div class="pack-grid">
        ${pack.stickers.map(
          (sticker) =>
            html`<button class="pack-item" type="button" data-emoji="${sticker}" aria-label="${sticker}">
              ${sticker}
            </button>`,
        )}
      </div>
    </section>`,
  )}`;
}

export function stickerPickerBody(
  c: Catalog,
  recent: readonly string[],
  packs: readonly StickerPack[] = [],
  encryptedRoom = false,
): Html {
  const recents = recent.filter(Boolean).slice(0, 6);
  const visiblePacks = packs;
  const builtIn = STICKER_PACKS;
  return html`<div class="sticker-picker" data-sticker-picker>
    ${encryptedRoom ? html`<p class="field-hint sticker-note">${t(c, "surface.sticker.encrypted")}</p>` : html``}
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
      ${visiblePacks.map(
        (pack, index) => html`<button
          class="sticker-tab"
          type="button"
          role="tab"
          id="sticker-tab-user-${String(index)}"
          aria-controls="sticker-panel-user-${String(index)}"
          aria-selected="false"
          tabindex="-1"
          data-sticker-tab="user-${String(index)}"
        >
          ${packLabel(c, pack)}
        </button>`,
      )}
      ${builtIn.map(
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
      ${visiblePacks.map(
        (pack, index) => html`<section
          class="sticker-panel"
          id="sticker-panel-user-${String(index)}"
          role="tabpanel"
          aria-labelledby="sticker-tab-user-${String(index)}"
          data-sticker-panel="user-${String(index)}"
          hidden
        >
          <div class="pack-grid">${packImageButtons(pack)}</div>
        </section>`,
      )}
      ${builtIn.map(
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
