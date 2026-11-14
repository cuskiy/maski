import DOMPurify from "dompurify";

const CONFIG = {
  ALLOW_DATA_ATTR: false,
  FORBID_ATTR: ["id"],
};

export function sanitizeMessageHtml(value: string): string {
  return DOMPurify.sanitize(value, CONFIG);
}
