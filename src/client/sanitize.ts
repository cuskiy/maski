import DOMPurify from "dompurify";

/**
 * `formatted_body` is untrusted, so it is rendered through one allowlist. The tags are the ones a
 * message actually uses: paragraphs, emphasis, code, quotes, lists, rules, tables and links. Every
 * attribute not named here is dropped, which is what removes handlers, styles, classes and ids.
 */
const TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "del", "s", "code", "pre", "blockquote",
  "ul", "ol", "li", "a", "hr", "table", "thead", "tbody", "tr", "th", "td", "img",
];

const ATTRS = ["href", "alt", "title", "height", "width", "src", "data-mx-emoticon"];

const URI = /^(?:(?:https?|matrix):|mxc:\/\/)/iu;

const purifier = DOMPurify(window);

// A reply's quoted copy is a separate document: remove the element and its content entirely.
purifier.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName === "mx-reply" && node instanceof HTMLElement) node.remove();
});

purifier.addHook("afterSanitizeAttributes", (node) => {
  if (node instanceof HTMLAnchorElement) {
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
    return;
  }
  if (!(node instanceof HTMLImageElement)) return;
  // An ordinary image is not allowed; an emoticon is, and only from the content repository.
  if (!node.hasAttribute("data-mx-emoticon") || !(node.getAttribute("src") ?? "").startsWith("mxc://")) {
    node.remove();
    return;
  }
  node.setAttribute("alt", node.getAttribute("alt") ?? "");
});

/** Sanitized markup as a fragment ready to insert; never a string that someone else may parse again. */
export function sanitize(formatted: string): DocumentFragment {
  return purifier.sanitize(formatted, {
    ALLOWED_TAGS: TAGS,
    ALLOWED_ATTR: ATTRS,
    ALLOWED_URI_REGEXP: URI,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    RETURN_DOM_FRAGMENT: true,
  });
}
