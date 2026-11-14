export class Html {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escape(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ESCAPES[character] ?? character);
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (typeof value === "string") return escape(value);
  if (typeof value === "number") return String(value);
  throw new TypeError("a template value must be text, a number, an Html fragment or an array");
}

/** Markup is escaped unless it was built by this module; user text never becomes raw HTML. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let output = strings[0] ?? "";
  for (const [index, value] of values.entries()) {
    output += render(value) + (strings[index + 1] ?? "");
  }
  return new Html(output);
}

/** Only for strings this project controls: CSP headers, SVG icons, trusted attributes. */
export function raw(value: string): Html {
  return new Html(value);
}
