import * as prefs from "./prefs.ts";
import * as storage from "./storage.ts";

const page = document.documentElement.dataset["page"] ?? "";
if (page === "chat" || page === "review") {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
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
  for (const badge of document.querySelectorAll<HTMLElement>(".room.is-active .room-badge")) badge.remove();
  const active = document.querySelector<HTMLElement>('button[data-room][aria-current="page"]')?.dataset["room"];
  const textarea = document.querySelector<HTMLTextAreaElement>("#composer-input");
  if (active !== undefined && textarea !== null && !textarea.disabled) {
    textarea.value = prefs.readDraft(account, active);
  }
  const timeline = document.querySelector<HTMLElement>(`.timeline-region[data-region="timeline"]`);
  const wrap = timeline?.querySelector<HTMLElement>(".timeline-wrap") ?? null;
  const list = wrap?.querySelector<HTMLOListElement>(".timeline") ?? null;
  if (timeline !== null && wrap !== null && list !== null) {
    let firstUnread: HTMLElement | null = null;
    const receipt = timeline.dataset["readReceipt"] ?? "";
    if (receipt !== "") {
      const receiptRow = list.querySelector<HTMLElement>(`li.message[data-id="${CSS.escape(receipt)}"]`);
      let next = receiptRow?.nextElementSibling ?? null;
      while (next !== null && !(next instanceof HTMLElement && next.matches("li.message"))) {
        next = next.nextElementSibling;
      }
      if (next instanceof HTMLElement) firstUnread = next;
    }
    if (firstUnread !== null) {
      wrap.scrollTop = Math.max(0, firstUnread.offsetTop - wrap.clientHeight / 2 + firstUnread.offsetHeight / 2);
    } else {
      wrap.scrollTop = wrap.scrollHeight;
    }
  }
}
