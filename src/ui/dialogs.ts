import { el } from "./dom";
import { iconButton } from "./icons";
import { t } from "../i18n";

export interface DialogOptions {
  title: string;
  body: HTMLElement;
  footer?: HTMLElement;
  onClose?: () => void;
  wide?: boolean;
}

export class DialogHost {
  private readonly dialog: HTMLDialogElement;
  private current: DialogOptions | null = null;

  constructor() {
    this.dialog = el("dialog", {
      attrs: { "aria-modal": "true" },
      on: {
        // Escape runs the same path as every other close, so the queued close event
        // of a replaced dialog can never reach the one that replaced it.
        cancel: (event) => {
          event.preventDefault();
          this.close();
        },
        click: (event) => {
          if (event.target === this.dialog) this.close();
        },
      },
    });
    document.body.appendChild(this.dialog);
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  open(options: DialogOptions): void {
    this.close();
    this.current = options;
    const titleId = `dialog-title-${crypto.randomUUID()}`;
    const card = el("div", { class: "dialog-card" }, [
      el("div", { class: "dialog-head" }, [
        el("h2", { text: options.title, id: titleId }),
        iconButton(t("common.close"), "close", () => this.close()),
      ]),
      el("div", { class: "dialog-body" }, [options.body]),
      options.footer ? el("div", { class: "dialog-foot" }, [options.footer]) : null,
    ]);
    this.dialog.replaceChildren(card);
    this.dialog.setAttribute("aria-labelledby", titleId);
    this.dialog.showModal();
  }

  close(): void {
    const options = this.current;
    if (!options) return;
    this.current = null;
    if (this.dialog.open) this.dialog.close();
    options.onClose?.();
  }
}
