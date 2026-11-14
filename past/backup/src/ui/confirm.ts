import { t } from "../i18n";
import { el } from "./dom";

export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = el("dialog", { attrs: { "aria-modal": "true" } });
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      if (dialog.open) dialog.close();
      dialog.remove();
    };
    const card = el("div", { class: "dialog-card" }, [
      el("div", { class: "dialog-head" }, [el("h2", { text: t("common.confirm") })]),
      el("div", { class: "dialog-body" }, [el("p", { text: message })]),
      el("div", { class: "dialog-foot" }, [
        el("button", {
          class: "button ghost",
          text: t("common.cancel"),
          attrs: { type: "button" },
          on: { click: () => finish(false) },
        }),
        el("button", {
          class: "button primary",
          text: t("common.confirm"),
          attrs: { type: "button" },
          on: { click: () => finish(true) },
        }),
      ]),
    ]);
    dialog.appendChild(card);
    dialog.addEventListener("close", () => finish(false));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish(false);
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}
