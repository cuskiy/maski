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

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    this.close(true);
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
    if (!reducedMotion()) card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: "ease-out" });
  }

  close(immediate = false): void {
    const options = this.current;
    if (!options) return;
    this.current = null;
    options.onClose?.();
    if (immediate || !this.dialog.open) {
      if (this.dialog.open) this.dialog.close();
      return;
    }
    const card = this.dialog.firstElementChild;
    if (!(card instanceof HTMLElement) || reducedMotion()) {
      this.dialog.close();
      return;
    }
    const animation = card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: "ease-in" });
    const finish = (): void => {
      // A dialog opened while this one fades out owns the element now.
      if (this.dialog.firstElementChild === card && this.dialog.open) this.dialog.close();
    };
    animation.addEventListener("finish", finish, { once: true });
    animation.addEventListener("cancel", finish, { once: true });
  }
}
