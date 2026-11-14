import { el } from "../ui.ts";

export interface MenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
}

/**
 * One menu for everything: it opens at the pointer, in the top layer, and closes on Escape, on a
 * click outside or on the first action. Nothing is a hover-only control.
 */
export function openMenu(items: readonly MenuItem[], x: number, y: number): void {
  document.querySelector("#row-menu")?.remove();
  const menu = el("div", { class: "menu", attrs: { id: "row-menu", popover: "auto" } },
    items.map((item) =>
      el("button", {
        class: `menu-item${item.danger === true ? " is-danger" : ""}`,
        text: item.label,
        attrs: { type: "button" },
        on: {
          click: () => {
            menu.hidePopover();
            item.run();
          },
        },
      }),
    ),
  );
  menu.style.setProperty("--menu-x", `${String(x)}px`);
  menu.style.setProperty("--menu-y", `${String(y)}px`);
  document.body.append(menu);
  menu.showPopover();
}
