import { localeForPath, localeRoot } from "../core/locales.ts";
import { setLocale, storedLocale, systemLocale } from "./session.ts";
import * as storage from "./storage.ts";

function showStorageNote(): void {
  const note = document.querySelector<HTMLElement>("[data-storage-note]");
  if (note !== null) note.hidden = false;
}

/** Only the root page may move the reader; every other page says what it needs. */
function run(): void {
  const page = document.documentElement.dataset["page"] ?? "";

  if (page === "router") {
    const root = localeRoot(storedLocale() ?? systemLocale());
    if (location.pathname !== root) location.replace(root);
    return;
  }

  if (page === "review") return;

  if (!storage.available()) {
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", showStorageNote, { once: true });
    else showStorageNote();
    return;
  }

  const locale = localeForPath(location.pathname);
  if (locale === null) return;
  setLocale(locale);
}

run();
