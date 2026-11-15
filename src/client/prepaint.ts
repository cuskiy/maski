import * as prefs from "./prefs.ts";
import * as storage from "./storage.ts";
import { isSectionId } from "../core/state.ts";

const page = document.documentElement.dataset["page"] ?? "";
if (page === "chat" || page === "review") {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  document.querySelector<HTMLElement>(".app")?.setAttribute("data-view", "list");
  const account = storage.read(storage.STORAGE.account) ?? "local";
  const sections = prefs.readSections(account);
  if (sections !== null) {
    for (const details of document.querySelectorAll<HTMLDetailsElement>("details.section[data-section]")) {
      const id = details.dataset["section"];
      if (id === undefined || !isSectionId(id)) continue;
      const open = sections[id];
      if (open !== undefined) details.open = open;
    }
  }
}
