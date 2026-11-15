import type { Html } from "../lib/html.ts";

const parser = new DOMParser();
const BLOCKED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "base"]);
const URL_ATTRIBUTES = new Set(["href", "src", "xlink:href", "formaction"]);

export function replaceHtml(target: HTMLElement, markup: Html | string): void {
  const value = typeof markup === "string" ? markup : markup.value;
  const parsed = parser.parseFromString(`<body>${value}</body>`, "text/html");
  for (const element of parsed.querySelectorAll("*")) {
    if (BLOCKED_TAGS.has(element.tagName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const name of element.getAttributeNames()) {
      const lower = name.toLowerCase();
      const attributeValue = element.getAttribute(name) ?? "";
      if (lower.startsWith("on") || lower === "style" || lower === "srcdoc") {
        element.removeAttribute(name);
        continue;
      }
      if (URL_ATTRIBUTES.has(lower) && /^\s*javascript:/iu.test(attributeValue)) {
        element.removeAttribute(name);
      }
    }
  }
  target.replaceChildren(...Array.from(parsed.body.childNodes, (node) => target.ownerDocument.importNode(node, true)));
}
