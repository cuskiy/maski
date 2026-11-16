import { html, type Html } from "../lib/html.ts";
import { icons } from "./icons.ts";

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

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export type SelectFieldName =
  "notification-level" | "room-notifications" | "room-join" | "room-guest" | "room-history" | "room-directory";

export interface SelectFieldInput {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean;
  readonly layout?: "stack" | "inline";
  readonly dataName: SelectFieldName;
}

export function selectField(input: SelectFieldInput): Html {
  const selected = input.options.find((option) => option.value === input.value);
  const inline = input.layout === "inline";
  const label = html`<span class="field-label" id="${input.id}-label">${input.label}</span>`;
  return html`<div
    class="field select-field${inline ? " is-inline" : ""}"
    data-select-field
    data-select-name="${input.dataName}"
  >
    ${inline ? html`` : label}
    <button
      class="input select-trigger"
      id="${input.id}"
      type="button"
      data-select-trigger
      aria-haspopup="listbox"
      aria-expanded="false"
      aria-labelledby="${input.id}-label"
      aria-controls="${input.id}-list"
      popovertarget="${input.id}-list"
      ${input.disabled === true ? html` disabled` : html``}
    >
      ${inline ? label : html``}
      <span class="select-value" data-select-value>${selected?.label ?? ""}</span>
      ${icons.chevron}
    </button>
    <div
      class="select-popover"
      id="${input.id}-list"
      popover
      role="listbox"
      aria-labelledby="${input.id}-label"
      data-select-list
    >
      ${input.options.map(
        (option, index) => html`<button
          class="select-option"
          type="button"
          role="option"
          data-select-option
          data-option-value="${option.value}"
          aria-selected="${option.value === input.value ? "true" : "false"}"
          ${index === 0 ? html` autofocus` : html``}
        >
          ${option.label}
        </button>`,
      )}
    </div>
  </div>`;
}
