import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { surfaceHead } from "./surface.ts";

const SAS_EMOJI = ["🐶", "🐱", "🦊", "🐻", "🐼", "🐨", "🐯"] as const;

export function sasDialog(c: Catalog, id: string): Html {
  return html`<dialog class="surface modal sas" id="${id}" closedby="any" aria-labelledby="${id}-title">
    ${surfaceHead(c, id, "auth.key.sasTitle")}
    <div class="surface-body">
      <p class="note">${t(c, "auth.key.sasNote")}</p>
      <ol class="sas-grid" role="list">
        ${SAS_EMOJI.map(
          (emoji, index) =>
            html`<li class="sas-emoji">
              <span role="img" aria-label="${t(c, "auth.key.sasEmoji", { number: String(index + 1) })}"
                >${emoji}</span
              >
            </li>`,
        )}
      </ol>
      <div class="sas-actions">
        <button class="button-primary" type="button" data-sas-match>${t(c, "auth.key.verifyMatch")}</button>
        <button class="button-quiet" type="button" commandfor="${id}" command="close">
          ${t(c, "auth.key.verifyMismatch")}
        </button>
      </div>
    </div>
  </dialog>`;
}
