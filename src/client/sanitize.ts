import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_ATTR = ["href", "title", "dir", "lang", "colspan", "rowspan", "start"];

const CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  FORBID_ATTR: ["id", "style", "class"],
  FORBID_TAGS: [
    "style",
    "script",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "meta",
    "link",
    "base",
    "svg",
    "math",
  ],
  KEEP_CONTENT: true,
};

export function sanitizeMessageHtml(value: string): string {
  return DOMPurify.sanitize(value, CONFIG);
}
