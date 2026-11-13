import { t } from "../i18n.ts";
import { el } from "../ui.ts";

/** One picture at a time, in the top layer, closed by a click or Escape. */
export function openViewer(url: string, name: string): void {
  const current = document.querySelector("#viewer");
  current?.remove();
  const frame = el("div", { class: "viewer", attrs: { id: "viewer", popover: "auto" } }, [
    el("img", { class: "viewer-image", attrs: { src: url, alt: name } }),
    el("button", { class: "viewer-close", attrs: { type: "button", "aria-label": t("viewer.close"), popovertarget: "viewer", popovertargetaction: "hide" } }),
  ]);
  frame.addEventListener("click", (event) => {
    if (event.target === frame) frame.hidePopover();
  });
  document.body.append(frame);
  frame.showPopover();
}
