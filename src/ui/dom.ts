export type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Record<string, EventListener>;
  dataset?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, children: Child[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const [name, value] of Object.entries(props.dataset ?? {})) node.dataset[name] = value;
  for (const [name, handler] of Object.entries(props.on ?? {})) node.addEventListener(name, handler);
  append(node, children);
  return node;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

export function clear(node: Element): void {
  node.replaceChildren();
}

const lists = new WeakMap<Element, Map<string, HTMLElement>>();

export interface KeyedEntry<T> {
  key: string;
  value: T;
}

export function keyed<T>(container: Element, items: KeyedEntry<T>[], create: (value: T) => HTMLElement, update?: (node: HTMLElement, value: T) => void): void {
  let cache = lists.get(container);
  if (!cache) {
    cache = new Map();
    lists.set(container, cache);
  }
  const seen = new Set<string>();
  let cursor: ChildNode | null = container.firstChild;
  for (const item of items) {
    seen.add(item.key);
    let node = cache.get(item.key);
    if (!node) {
      node = create(item.value);
      cache.set(item.key, node);
    } else if (update) {
      update(node, item.value);
    }
    if (cursor === node) {
      cursor = node.nextSibling;
      continue;
    }
    container.insertBefore(node, cursor);
  }
  for (const [key, node] of cache) {
    if (seen.has(key)) continue;
    node.remove();
    cache.delete(key);
  }
}

export function icon(path: string, size = 18): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", path);
  svg.appendChild(shape);
  return svg;
}

export const ICON = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5",
  compose: "M4 20h4L20 8l-4-4L4 16v4Z",
  hash: "M5 9h14M5 15h14M10 4 8 20M16 4l-2 16",
  plus: "M12 5v14M5 12h14",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L15.5 3h-4l-.3 2.5a8 8 0 0 0-1.7 1L7 5.5l-2 3.5L7 11a8 8 0 0 0 0 2l-2 1.5 2 3.5 2.5-1a8 8 0 0 0 1.7 1l.3 2.5h4l.3-2.5a8 8 0 0 0 1.7-1l2.5 1 2-3.5-2-1.5a8 8 0 0 0 .1-1Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0",
  send: "M12 20V5m0 0-6 6m6-6 6 6",
  attach: "M18 9 10 17a4 4 0 0 1-6-6l8-8a3 3 0 0 1 4 4l-8 8a1.5 1.5 0 0 1-2-2l7-7",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14a4 4 0 0 0 7 0m-6-4h.01M14.5 10h.01",
  close: "M6 6l12 12M18 6 6 18",
  back: "M15 5l-7 7 7 7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  check: "M5 13l4 4L19 7",
  copy: "M9 9h10v10H9zM5 15V5h10",
  chevron: "M9 6l6 6-6 6",
  arrowDown: "M12 4v16m0 0 6-6m-6 6-6-6",
} as const;
