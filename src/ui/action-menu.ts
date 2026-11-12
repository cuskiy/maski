import { t } from "../i18n";
import { el } from "./dom";
import { icon } from "./icons";

export interface ActionMenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  checked?: boolean;
  action: () => void;
}

export interface ActionPosition {
  x: number;
  y: number;
  above?: number;
}

const MENU_ITEM = '[role="menuitem"], [role="menuitemcheckbox"]';

export class ActionMenu {
  private menu: HTMLElement | null = null;
  private lastFocus: HTMLElement | null = null;
  private readonly onOutside = (event: PointerEvent): void => {
    if (!this.menu || this.menu.contains(event.target as Node)) return;
    this.close(false);
  };
  private readonly onScroll = (): void => this.close(false);
  private readonly onResize = (): void => this.close(false);

  constructor() {
    document.addEventListener("pointerdown", this.onOutside, true);
    window.addEventListener("scroll", this.onScroll, true);
    window.addEventListener("resize", this.onResize);
  }

  open(position: ActionPosition, items: readonly ActionMenuItem[]): void {
    this.close(false);
    if (document.activeElement instanceof HTMLElement) this.lastFocus = document.activeElement;
    const menu = el("div", {
      class: "action-menu",
      attrs: { role: "menu", "aria-label": t("nav.more") },
    });
    for (const item of items) {
      const children = [];
      if (item.icon) children.push(icon(item.icon));
      if (item.checked !== undefined) children.push(el("span", { class: "menu-check", text: item.checked ? "✓" : "" }));
      children.push(el("span", { class: "menu-label", text: item.label }));
      const button = el("button", {
        class: `menu-item${item.danger ? " danger" : ""}`,
        attrs: {
          type: "button",
          role: item.checked === undefined ? "menuitem" : "menuitemcheckbox",
          ...(item.checked === undefined ? {} : { "aria-checked": String(item.checked) }),
        },
        on: {
          click: () => {
            this.close(false);
            item.action();
          },
        },
      }, children);
      menu.appendChild(button);
    }
    document.body.appendChild(menu);
    this.menu = menu;
    const rect = menu.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(position.x, window.innerWidth - rect.width - margin));
    const limit = window.innerHeight - rect.height - margin;
    const above = position.above === undefined ? position.y : position.above - rect.height - 4;
    const below = position.y + 4;
    const top = Math.max(margin, Math.min(above >= margin ? above : below, limit));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.addEventListener("keydown", (event) => this.onKeydown(event));
    menu.querySelector<HTMLElement>(MENU_ITEM)?.focus();
  }

  close(restoreFocus = true): void {
    if (!this.menu) return;
    this.menu.remove();
    this.menu = null;
    if (restoreFocus) this.lastFocus?.focus();
    this.lastFocus = null;
  }

  private onKeydown(event: KeyboardEvent): void {
    if (!this.menu) return;
    const items = [...this.menu.querySelectorAll<HTMLElement>(MENU_ITEM)];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? index + 1 : index - 1;
      items[(next + items.length) % items.length]?.focus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
      return;
    }
    if (event.key === "Tab") this.close(false);
  }
}

export function bindActionTrigger(
  element: HTMLElement,
  onOpen: (position: ActionPosition) => void,
): void {
  if (element.tabIndex < 0 && !element.hasAttribute("tabindex")) element.tabIndex = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let opened = false;
  let suppressClick = false;

  const cleanPointer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", cleanPointer);
    window.removeEventListener("pointercancel", cleanPointer);
    window.removeEventListener("scroll", cleanPointer, true);
  };

  const scheduleClickReset = (): void => {
    window.setTimeout(() => {
      suppressClick = false;
      opened = false;
    }, 800);
  };

  const onMove = (event: PointerEvent): void => {
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 8) cleanPointer();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" || event.button !== 0 || isNativeTarget(event.target)) return;
    opened = false;
    suppressClick = false;
    startX = event.clientX;
    startY = event.clientY;
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", cleanPointer, { once: true });
    window.addEventListener("pointercancel", cleanPointer, { once: true });
    window.addEventListener("scroll", cleanPointer, { once: true, passive: true, capture: true });
    timer = setTimeout(() => {
      timer = null;
      opened = true;
      suppressClick = true;
      element.focus();
      onOpen({ x: startX, y: startY });
      scheduleClickReset();
    }, 500);
  };

  const onContextMenu = (event: MouseEvent): void => {
    if (isNativeTarget(event.target)) return;
    event.preventDefault();
    if (opened) return;
    element.focus();
    onOpen({ x: event.clientX, y: event.clientY });
  };

  const onClick = (event: MouseEvent): void => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
    opened = false;
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    onOpen({ x: rect.left + 8, y: rect.top + 8 });
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("contextmenu", onContextMenu);
  element.addEventListener("click", onClick, true);
  element.addEventListener("keydown", onKeydown);
}

function isNativeTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("a, input, textarea, select") !== null;
}
