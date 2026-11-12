import type { App } from "../app/app.ts";
import { t } from "../i18n/index.ts";
import { el } from "./dom.ts";
import { closeIcon, toast } from "./overlay.ts";

let current: HTMLDialogElement | null = null;

/** The one dialog host: opening replaces, closing removes, Escape goes through the app. */
export function openDialogFrame(app: App, title: string, body: HTMLElement, footer?: HTMLElement): HTMLDialogElement {
  closeDialogFrame();
  const dialog = el("dialog", { class: "dialog" }, [
    el("header", { class: "dialog-head" }, [el("h1", { class: "dialog-title", text: title }), closeIcon(() => app.closeDialog(), t("common.close"))]),
    el("div", { class: "dialog-body" }, [body]),
    ...(footer ? [el("footer", { class: "dialog-foot" }, [footer])] : []),
  ]);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    app.closeDialog();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  current = dialog;
  return dialog;
}

export function closeDialogFrame(): void {
  const dialog = current;
  current = null;
  if (!dialog) return;
  dialog.close();
  dialog.remove();
}

export function row(label: string, ...children: (Node | string | null)[]): HTMLElement {
  return el("div", { class: "setting-row" }, [el("span", { class: "setting-label", text: label }), el("div", { class: "setting-value" }, children)]);
}

export function textField(label: string, value: string, type = "text"): HTMLInputElement {
  return el("input", { class: "field", attrs: { type, value, "aria-label": label } });
}

export function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  return el("button", { class: `button${primary ? " button-primary" : ""}`, attrs: { type: "button" }, on: { click: onClick } }, [
    el("span", { text: label }),
  ]);
}

export function uploadButton(label: string, onFile: (file: File) => Promise<void>): HTMLElement {
  const input = el("input", { attrs: { type: "file", accept: "image/*", hidden: true } });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void onFile(file).catch(() => toast(t("error.upload")));
  });
  return el("span", { class: "inline-form" }, [
    el("button", { class: "button", attrs: { type: "button" }, on: { click: () => input.click() } }, [el("span", { text: label })]),
    input,
  ]);
}

/** A switch drawn from the tokens, because a native checkbox carries the system accent. */
export function toggle(label: string, pressed: boolean, onChange: (next: boolean) => void): HTMLButtonElement {
  const thumb = el("span", { class: "switch-thumb" });
  const control = el("button", {
    class: "switch",
    attrs: { type: "button", role: "switch", "aria-checked": String(pressed), "aria-label": label },
    on: {
      click: () => {
        const next = control.getAttribute("aria-checked") !== "true";
        control.setAttribute("aria-checked", String(next));
        onChange(next);
      },
    },
  }, [el("span", { class: "switch-track" }, [thumb])]);
  return control;
}

export function note(text = ""): HTMLElement {
  return el("p", { class: "dialog-note", text });
}
