const escapes: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export class Html {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
}

/** The only way trusted markup bypasses escaping. */
export function raw(value: string): Html {
  return new Html(value);
}

function escape(text: string): string {
  return text.replace(/[&<>"']/gu, (character) => escapes[character] ?? character);
}

function render(value: unknown): string {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === undefined || value === null || value === false) return "";
  if (typeof value === "string") return escape(value);
  if (typeof value === "number") return String(value);
  throw new TypeError(`cannot render ${typeof value} as markup`);
}

export function html(strings: TemplateStringsArray, ...values: readonly unknown[]): Html {
  let out = strings[0] ?? "";
  for (const [index, value] of values.entries()) out += render(value) + (strings[index + 1] ?? "");
  return new Html(out);
}

export function attrs(pairs: Record<string, string | number | boolean | null | undefined>): Html {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(pairs)) {
    if (value === null || value === undefined || value === false) continue;
    parts.push(value === true ? name : `${name}="${escape(String(value))}"`);
  }
  return raw(parts.length > 0 ? ` ${parts.join(" ")}` : "");
}
