import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { REGION, SURFACE } from "../pages/regions.ts";
import { icons } from "./surface.ts";

/**
 * Attach, sticker, the field with the emoji control inside it, send. Every control is a real
 * button in the markup, so the bar is complete before a script runs.
 */
export function composer(c: Catalog): Html {
  return html`<div class="composer" data-region="${REGION.composer}">
  <div class="tray" data-region="${REGION.tray}" aria-label="${t(c, "composer.tray")}" hidden></div>
  <div class="composer-bar">
    <button class="composer-action" type="button" popovertarget="${SURFACE.attach}" aria-label="${t(c, "composer.attach")}">${icons.attach}</button>
    <button class="composer-action" type="button" popovertarget="${SURFACE.sticker}" aria-label="${t(c, "composer.sticker")}">${icons.sticker}</button>
    <div class="composer-field">
      <label class="visually-hidden" for="composer-input">${t(c, "composer.label")}</label>
      <textarea id="composer-input" class="composer-input" rows="1" placeholder="${t(c, "composer.placeholder")}" enterkeyhint="enter" disabled></textarea>
      <button class="composer-emoji" type="button" popovertarget="${SURFACE.emoji}" aria-label="${t(c, "composer.emoji")}">${icons.emoji}</button>
    </div>
    <button class="composer-send" type="button" aria-label="${t(c, "composer.send")}" disabled>${icons.send}</button>
  </div>
</div>`;
}
