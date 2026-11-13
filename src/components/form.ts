import { html, type Html } from "../lib/html.ts";

export interface FieldInput {
  readonly id: string;
  readonly label: string;
  readonly type: "text" | "password" | "url";
  readonly autocomplete: string;
  readonly value?: string;
  readonly hint?: string;
}

export function field(input: FieldInput): Html {
  const hint = input.hint === undefined ? html`` : html`<span class="field-hint" id="${input.id}-hint">${input.hint}</span>`;
  const described = input.hint === undefined ? html`` : html` aria-describedby="${input.id}-hint"`;
  return html`<p class="field">
    <label class="field-label" for="${input.id}">${input.label}</label>
    <input class="input" id="${input.id}" name="${input.id}" type="${input.type}" autocomplete="${input.autocomplete}" spellcheck="false" value="${input.value ?? ""}"${described}>
    ${hint}
  </p>`;
}

export function submit(label: string): Html {
  return html`<button class="button-primary" type="submit">${label}</button>`;
}

export function links(items: ReadonlyArray<{ label: string; href: string }>): Html {
  if (items.length === 0) return html``;
  return html`<nav class="auth-links">${items.map((item) => html`<a class="link" href="${item.href}">${item.label}</a>`)}</nav>`;
}
