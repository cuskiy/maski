import { el, icon, ICON } from "./dom.ts";

export function toast(message: string): void {
  let host = document.querySelector<HTMLElement>(".toast-host");
  if (!host) {
    host = el("div", { class: "toast-host", attrs: { role: "status", "aria-live": "polite" } });
    document.body.appendChild(host);
  }
  const node = el("div", { class: "toast", text: message });
  host.appendChild(node);
  setTimeout(() => node.classList.add("toast-out"), 2200);
  setTimeout(() => node.remove(), 2600);
}

export async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const field = el("textarea", { class: "clipboard-fallback" });
    field.value = text;
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }
  toast(done);
}

export interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
}

let open: HTMLElement | null = null;

export function closeMenu(): void {
  open?.remove();
  open = null;
}

export function openMenu(x: number, y: number, items: MenuItem[]): void {
  closeMenu();
  const menu = el("div", { class: "menu", attrs: { role: "menu" } }, items.map((item) =>
    el("button", {
      class: `menu-item${item.danger ? " menu-danger" : ""}`,
      attrs: { type: "button", role: "menuitem" },
      on: {
        click: () => {
          closeMenu();
          item.action();
        },
      },
    }, [el("span", { text: item.label })]),
  ));
  menu.style.setProperty("--menu-x", `${x}px`);
  menu.style.setProperty("--menu-y", `${y}px`);
  document.body.appendChild(menu);
  open = menu;
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.setProperty("--menu-x", `${Math.max(8, window.innerWidth - rect.width - 8)}px`);
  if (rect.bottom > window.innerHeight) menu.style.setProperty("--menu-y", `${Math.max(8, y - rect.height)}px`);
  const dismiss = (event: Event): void => {
    if (event instanceof MouseEvent && menu.contains(event.target as Node)) return;
    closeMenu();
    document.removeEventListener("pointerdown", dismiss);
    document.removeEventListener("keydown", escape);
  };
  const escape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    closeMenu();
    document.removeEventListener("pointerdown", dismiss);
    document.removeEventListener("keydown", escape);
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
  });
}

export function iconButton(path: string, label: string, onClick: () => void, extra = ""): HTMLButtonElement {
  return el("button", {
    class: `icon-button${extra ? ` ${extra}` : ""}`,
    attrs: { type: "button", "aria-label": label, title: label },
    on: { click: onClick },
  }, [icon(path, 20)]);
}

export function closeIcon(close: () => void, label: string): HTMLButtonElement {
  return el("button", {
    class: "icon-button",
    attrs: { type: "button", "aria-label": label },
    on: { click: close },
  }, [icon(ICON.close, 20)]);
}
