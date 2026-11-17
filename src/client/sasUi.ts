/**
 * The one SAS surface: a dialog that renders the worker's state machine and sends the reader's four
 * decisions. The key page and the settings dialog both hand it their own dialog element, so there is
 * one implementation of tracking the shown request, the failure and the cancel it already sent.
 */
import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import type { SasState } from "../core/types.ts";
import { isActiveSas, sasBody } from "../components/sas.ts";
import { replaceHtml } from "./dom.ts";

export interface SasActions {
  acceptSas(id: string): Promise<void>;
  confirmSas(id: string): Promise<void>;
  mismatchSas(id: string): Promise<void>;
  cancelSas(id: string): Promise<void>;
}

export interface SasUiInput {
  readonly c: Catalog;
  readonly dialogId: string;
  readonly dialog: () => HTMLDialogElement | null;
  readonly state: () => SasState | null;
  readonly actions: SasActions;
  /** Called after every render, for a page that shows its own verify control state. */
  readonly rendered?: () => void;
}

export class SasUi {
  private error: CatalogKey | null = null;
  private confirmedId: string | null = null;
  private dismissedId: string | null = null;
  private sentCancelId: string | null = null;
  private shownId: string | null = null;

  private readonly input: SasUiInput;

  constructor(input: SasUiInput) {
    this.input = input;
  }

  /** Renders the current request and opens the dialog when it names a new one. */
  update(): void {
    const sas = this.input.state();
    if (sas !== null && sas.id !== this.shownId) {
      this.shownId = sas.id;
      this.confirmedId = null;
      this.sentCancelId = null;
      this.error = null;
    }
    this.render();
    const dialog = this.input.dialog();
    if (this.shownId !== null && dialog !== null && !dialog.open) dialog.showModal();
  }

  /** Shows the dialog with the failure the page could not map to the request itself. */
  fail(): void {
    this.error = "auth.key.sasFailed";
    this.render();
    const dialog = this.input.dialog();
    if (dialog !== null && !dialog.open) dialog.showModal();
  }

  handleAction(action: string): void {
    const sas = this.input.state();
    if (sas === null) return;
    this.error = null;
    if (action === "accept") {
      void this.input.actions.acceptSas(sas.id).catch(() => this.fail());
      return;
    }
    if (action === "confirm") {
      this.confirmedId = sas.id;
      this.render();
      void this.input.actions.confirmSas(sas.id).catch(() => this.fail());
      return;
    }
    if (action === "mismatch") {
      void this.input.actions.mismatchSas(sas.id).catch(() => this.fail());
      return;
    }
    if (action !== "cancel") return;
    this.dismissedId = sas.id;
    this.cancel(sas.id);
    this.input.dialog()?.close();
  }

  /** Closing the dialog cancels a request that is still waiting for the reader. */
  handleClose(): void {
    const sas = this.input.state();
    if (sas === null || !isActiveSas(sas.phase)) return;
    if (this.dismissedId === sas.id) return;
    this.cancel(sas.id);
  }

  private cancel(id: string): void {
    if (this.sentCancelId === id) return;
    this.sentCancelId = id;
    void this.input.actions.cancelSas(id).catch(() => undefined);
  }

  private render(): void {
    const dialog = this.input.dialog();
    const region = dialog?.querySelector<HTMLElement>(`[data-region="${this.input.dialogId}-body"]`);
    if (region === null || region === undefined) return;
    const sas = this.input.state();
    replaceHtml(
      region,
      sasBody(this.input.c, sas, {
        dialogId: this.input.dialogId,
        error: this.error,
        confirmed: this.confirmedId !== null && this.confirmedId === sas?.id,
      }),
    );
    this.input.rendered?.();
  }
}
