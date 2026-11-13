/** One element helper: attributes as a record, children as nodes or text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  name: K,
  options: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  children: (Node | string | null)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  if (options.class !== undefined) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [key, value] of Object.entries(options.attrs ?? {})) node.setAttribute(key, value);
  node.append(...children.filter((child): child is Node | string => child !== null));
  return node;
}
