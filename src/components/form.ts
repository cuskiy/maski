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
      dir="auto"
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

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectFieldInput {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean;
  readonly dataName?: "notification-level" | "room-notifications";
}

export function selectField(input: SelectFieldInput): Html {
  const data =
    input.dataName === "notification-level"
      ? html` data-notification-level`
      : input.dataName === "room-notifications"
        ? html` data-room-notifications`
        : html``;
  return html`<div class="field">
    <label class="field-label" for="${input.id}">${input.label}</label>
    <select class="input" id="${input.id}" name="${input.id}" ${data}${input.disabled === true ? html` disabled` : html``}>
      ${input.options.map(
        (option) => html`<option value="${option.value}" ${option.value === input.value ? html` selected` : html``}>
          ${option.label}
        </option>`,
      )}
    </select>
  </div>`;
}
