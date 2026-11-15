import { t } from "../lib/catalog.ts";
import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import type { SasPhase, SasState } from "../core/types.ts";

export interface SasView {
  readonly dialogId: string;
  readonly error: CatalogKey | null;
  /** True once this user confirmed the comparison and waits for the other device. */
  readonly confirmed: boolean;
}

/** A phase that still has a live request; closing it must send a cancel. */
export function isActiveSas(phase: SasPhase): boolean {
  return phase === "needs-accept" || phase === "requested" || phase === "ready" || phase === "started";
}

function cancellationKey(code: string | null): CatalogKey {
  if (code === "m.mismatched_sas") return "auth.key.sasCancelledMismatch";
  if (code === "m.unknown-method") return "auth.key.sasCancelledMethod";
  if (code === "m.timeout") return "auth.key.sasCancelledTimeout";
  if (code === "m.user") return "auth.key.sasCancelledUser";
  return "auth.key.sasCancelled";
}

function actionButton(c: Catalog, key: CatalogKey, action: string, primary = false): Html {
  return html`<button
    class="${primary ? "button-primary" : "button-quiet"}"
    type="button"
    data-sas-action="${action}"
  >
    ${t(c, key)}
  </button>`;
}

function closeButton(c: Catalog, view: SasView): Html {
  return html`<button class="button-quiet" type="button" commandfor="${view.dialogId}" command="close">
    ${t(c, "surface.close")}
  </button>`;
}

function emojiGrid(c: Catalog, emoji: readonly string[]): Html {
  return html`<ol class="sas-grid" role="list">
    ${emoji.map(
      (glyph, index) =>
        html`<li class="sas-emoji">
          <span role="img" aria-label="${t(c, "auth.key.sasEmoji", { number: String(index + 1) })}">${glyph}</span>
        </li>`,
    )}
  </ol>`;
}

function sasCode(c: Catalog, sas: SasState): Html {
  const emoji = sas.emoji === null ? html`` : emojiGrid(c, sas.emoji);
  const decimal =
    sas.decimal === null
      ? html``
      : html`<p class="note">${t(c, "auth.key.sasNumbers")}</p>
        <p class="sas-decimal" dir="ltr">${sas.decimal.join(" · ")}</p>`;
  return html`${emoji}${decimal}`;
}

export function sasBody(c: Catalog, sas: SasState | null, view: SasView): Html {
  const error = view.error === null ? html`` : html`<p class="note field-hint">${t(c, view.error)}</p>`;
  if (sas === null) {
    return html`<div class="sas" data-sas>
      <p class="note">${t(c, "auth.key.sasWaiting")}</p>
      ${error}
      <div class="sas-actions">${closeButton(c, view)}</div>
    </div>`;
  }
  let status: CatalogKey;
  let code = html``;
  let actions: Html;
  switch (sas.phase) {
    case "needs-accept":
      status = "auth.key.sasIncoming";
      actions = html`${actionButton(c, "auth.key.sasAccept", "accept", true)}
      ${actionButton(c, "auth.key.sasCancel", "cancel")}`;
      break;
    case "requested":
      status = "auth.key.sasWaiting";
      actions = html`${actionButton(c, "auth.key.sasCancel", "cancel")}`;
      break;
    case "ready":
      status = "auth.key.sasStarting";
      actions = html`${actionButton(c, "auth.key.sasCancel", "cancel")}`;
      break;
    case "started": {
      const hasCode = sas.emoji !== null || sas.decimal !== null;
      status = hasCode ? "auth.key.sasNote" : "auth.key.sasPreparing";
      if (hasCode) code = sasCode(c, sas);
      if (view.confirmed) {
        status = "auth.key.sasConfirmed";
        actions = html`${actionButton(c, "auth.key.sasCancel", "cancel")}`;
      } else if (hasCode) {
        actions = html`${actionButton(c, "auth.key.sasConfirm", "confirm", true)}
        ${actionButton(c, "auth.key.sasMismatch", "mismatch")}
        ${actionButton(c, "auth.key.sasCancel", "cancel")}`;
      } else {
        actions = html`${actionButton(c, "auth.key.sasCancel", "cancel")}`;
      }
      break;
    }
    case "done":
      status = "auth.key.sasDone";
      actions = html`${closeButton(c, view)}`;
      break;
    case "cancelled":
      status = cancellationKey(sas.cancellationCode);
      actions = html`${closeButton(c, view)}`;
      break;
    default:
      status = "auth.key.sasFailed";
      actions = html`${closeButton(c, view)}`;
      break;
  }
  return html`<div class="sas" data-sas data-sas-id="${sas.id}" data-sas-phase="${sas.phase}">
    <p class="note">${t(c, status)}</p>
    ${code} ${error}
    <div class="sas-actions">${actions}</div>
  </div>`;
}
