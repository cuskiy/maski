import * as prefs from "./prefs.ts";
import * as storage from "./storage.ts";

const page = document.documentElement.dataset["page"] ?? "";
if (page === "chat" || page === "review") {
  const account = storage.read(storage.STORAGE.account) ?? "local";
  const sections = prefs.readSections(account);
  if (sections !== null) {
    for (const details of document.querySelectorAll<HTMLDetailsElement>("details.section[data-section]")) {
      const id = details.dataset["section"];
      if (id === undefined) continue;
      const open = sections[id as keyof typeof sections];
      if (open !== undefined) details.open = open;
    }
  }
  const spaces = prefs.readSpaces(account);
  if (spaces !== null) {
    for (const row of document.querySelectorAll<HTMLElement>(".room[data-space]")) {
      const id = row.dataset["space"];
      if (id === undefined) continue;
      const open = spaces.includes(id);
      row.classList.toggle("is-open", open);
      row.querySelector<HTMLButtonElement>("[data-space-toggle]")?.setAttribute("aria-expanded", String(open));
      const rows = row.querySelector<HTMLOListElement>(".space-rows");
      if (rows !== null) rows.hidden = !open;
    }
  }
  const active = document.querySelector<HTMLElement>('button[data-room][aria-current="page"]')?.dataset["room"];
  const textarea = document.querySelector<HTMLTextAreaElement>("#composer-input");
  if (active !== undefined && textarea !== null && !textarea.disabled) {
    textarea.value = prefs.readDraft(account, active);
  }
}
