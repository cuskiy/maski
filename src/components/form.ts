import { html, type Html } from "../lib/html.ts";

export interface FieldInput {
  readonly id: string;
  readonly label: string;
  readonly type: "text" | "password";
  readonly autocomplete: string;
  readonly value?: string;
  readonly required?: boolean;
  readonly inputmode?: "url";
  readonly autocapitalize?: "none";
  readonly enterkeyhint?: "go" | "next" | "done";
}

export function field(input: FieldInput): Html {
  const required = input.required === true ? html` required` : html``;
  const inputmode = input.inputmode === undefined ? html`` : html` inputmode="${input.inputmode}"`;
  const autocapitalize = input.autocapitalize === undefined ? html`` : html` autocapitalize="${input.autocapitalize}"`;
  const enterkeyhint = input.enterkeyhint === undefined ? html`` : html` enterkeyhint="${input.enterkeyhint}"`;
  return html`<div class="field">
    <label class="field-label" for="${input.id}">${input.label}</label>
    <input
      class="input"
      id="${input.id}"
      name="${input.id}"
      type="${input.type}"
      autocomplete="${input.autocomplete}"
      spellcheck="false"
      value="${input.value ?? ""}"
      ${required}${inputmode}${autocapitalize}${enterkeyhint}
    />
  </div>`;
}

export function submit(label: string): Html {
  return html`<button class="button-primary" type="submit">${label}</button>`;
}

export function links(items: ReadonlyArray<{ label: string; href: string }>, label: string): Html {
  if (items.length === 0) return html``;
  return html`<nav class="auth-links" aria-label="${label}">
    ${items.map((item) => html`<a class="link" href="${item.href}">${item.label}</a>`)}
  </nav>`;
}
