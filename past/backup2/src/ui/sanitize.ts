import DOMPurify from "dompurify";

const ALLOWED = {
  ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "del", "s", "code", "pre", "blockquote", "ul", "ol", "li", "a", "hr", "img", "span"],
  ALLOWED_ATTR: ["href", "src", "alt", "title", "height", "width", "data-mx-emoticon", "data-mx-color"],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "h1", "h2", "h3", "h4", "h5", "h6", "mx-reply"],
  FORBID_CONTENTS: ["mx-reply"],
  FORBID_ATTR: ["style", "class", "id", "onerror", "onclick"],
};

DOMPurify.addHook("uponSanitizeElement", (_node, data) => {
  if (data.tagName === "img") {
    const element = data as unknown as { hasAttribute?: (name: string) => boolean };
    if (!element.hasAttribute || !element.hasAttribute("data-mx-emoticon")) {
      (data as unknown as { allowedTags?: Record<string, boolean> }).allowedTags = {};
    }
  }
});

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName === "A") {
    const anchor = node as HTMLAnchorElement;
    const href = anchor.getAttribute("href") ?? "";
    if (!/^(https?:|matrix:to)/i.test(href)) {
      anchor.removeAttribute("href");
      return;
    }
    anchor.setAttribute("rel", "noopener noreferrer");
    anchor.setAttribute("target", "_blank");
  }
  if (node.nodeName === "IMG") {
    const src = node.getAttribute("src") ?? "";
    if (!src.startsWith("mxc://")) node.parentNode?.removeChild(node);
  }
});

export function safeMessageHtml(html: string): string {
  return DOMPurify.sanitize(html, { ...ALLOWED, RETURN_TRUSTED_TYPE: false });
}

