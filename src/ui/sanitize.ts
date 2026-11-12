import DOMPurify from "dompurify";

const allowedTags = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "del",
  "s",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];

let installed = false;

function installHooks(): void {
  if (installed) return;
  installed = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") ?? "";
      const emoticon = node.hasAttribute("data-mx-emoticon");
      if (!emoticon || !src.startsWith("mxc://")) {
        node.remove();
        return;
      }
      node.setAttribute("loading", "lazy");
      node.setAttribute("decoding", "async");
    }
    for (const attribute of node.attributes) {
      if (attribute.name.startsWith("data-") && attribute.name !== "data-mx-emoticon") {
        node.removeAttribute(attribute.name);
      }
    }
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? "";
      if (!isAllowedLink(href)) {
        node.removeAttribute("href");
      } else {
        node.setAttribute("rel", "noopener noreferrer");
        node.setAttribute("target", "_blank");
      }
    }
  });
}

function isAllowedLink(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("https://") || href.startsWith("http://")) return true;
  if (href.startsWith("matrix.to/")) return true;
  return false;
}

export function sanitizeRich(html: string): string {
  installHooks();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const node of parsed.querySelectorAll("mx-reply, .mx-reply")) node.remove();
  return DOMPurify.sanitize(parsed.body.innerHTML, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: [
      "href",
      "rel",
      "target",
      "src",
      "alt",
      "title",
      "height",
      "width",
      "data-mx-emoticon",
    ],
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ["mx-reply", "script", "style", "iframe", "object", "embed"],
    FORBID_ATTR: ["style", "class", "id"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mxc|matrix):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/iu,
  });
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
