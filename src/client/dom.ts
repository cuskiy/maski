import type { Html } from "../lib/html.ts";

const parser = new DOMParser();
const BLOCKED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "base"]);
const URL_ATTRIBUTES = new Set(["href", "src", "xlink:href", "poster", "formaction", "action"]);
const REMOVED_ATTRIBUTES = new Set(["style", "srcdoc", "srcset"]);
const DATA_URL =
  /^data:(?:image\/(?:png|jpeg|webp|gif|avif)|video\/(?:mp4|webm|ogg)|audio\/(?:mpeg|wav|ogg|webm|mp4));base64,/iu;
const LOCAL_URL = /^(?:\/(?!\/)|\.\.?\/|blob:)/u;

function admissibleUrl(name: string, value: string): boolean {
  if (name === "action" || name === "formaction") return false;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return true;
  if (name === "href") {
    try {
      const url = new URL(trimmed, document.baseURI);
      return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
    } catch {
      return false;
    }
  }
  return LOCAL_URL.test(trimmed) || DATA_URL.test(trimmed);
}

export function replaceHtml(target: HTMLElement, markup: Html): void {
  const parsed = parser.parseFromString(`<body>${markup.value}</body>`, "text/html");
  for (const element of parsed.querySelectorAll("*")) {
    if (BLOCKED_TAGS.has(element.tagName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const name of element.getAttributeNames()) {
      const lower = name.toLowerCase();
      const attributeValue = element.getAttribute(name) ?? "";
      if (lower.startsWith("on") || REMOVED_ATTRIBUTES.has(lower)) {
        element.removeAttribute(name);
        continue;
      }
      if (URL_ATTRIBUTES.has(lower) && !admissibleUrl(lower, attributeValue)) {
        element.removeAttribute(name);
      }
    }
  }
  target.replaceChildren(...Array.from(parsed.body.childNodes, (node) => target.ownerDocument.importNode(node, true)));
}
