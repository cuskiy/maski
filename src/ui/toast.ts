import { el } from "./dom";

// One live region at the end of the body: a message survives a shell re-render
// and screen readers announce it once.
export class Toaster {
  readonly element: HTMLElement;
  private readonly text: HTMLElement;
  private timer: number | null = null;

  constructor() {
    this.text = el("span");
    this.element = el("div", {
      class: "toast",
      attrs: { role: "status", "aria-live": "polite", hidden: true },
    }, [this.text]);
  }

  show(message: string): void {
    this.text.textContent = message;
    this.element.hidden = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), 4000);
  }

  hide(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.element.hidden = true;
    this.text.textContent = "";
  }
}
