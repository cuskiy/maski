export type Child = Node | string | number | null | undefined | false;

export interface ElementProps {
  class?: string;
  text?: string;
  id?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const [event, handler] of Object.entries(props.on ?? {})) {
    if (handler) node.addEventListener(event, handler);
  }
  append(node, children);
  return node;
}

export function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
}

export function initial(value: string): string {
  // A display name may start with a sigil such as the @ of a user id
  const first = /[\p{L}\p{N}]/u.exec(value);
  return first ? first[0].toUpperCase() : "?";
}

export function focusable(node: HTMLElement): void {
  requestAnimationFrame(() => node.focus());
}

export function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.key === " ";
}
