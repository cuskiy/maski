import { localeForPath, localeRoot } from "../core/locales.ts";
import { mockSession, setLocale, storedLocale, systemLocale, type MockSession } from "./session.ts";
import * as storage from "./storage.ts";

function targetFor(session: MockSession, root: string): string {
  if (session.server === null) return `${root}server/`;
  if (session.account === null) return `${root}login/`;
  if (!session.key) return `${root}key/`;
  return root;
}

function showStorageNote(): void {
  const note = document.querySelector<HTMLElement>("[data-storage-note]");
  if (note !== null) note.hidden = false;
}

function run(): void {
  const page = document.documentElement.dataset.page ?? "";
  const pathname = location.pathname;

  if (page === "router") {
    const root = localeRoot(storedLocale() ?? systemLocale());
    if (pathname !== root) location.replace(root);
    return;
  }

  if (page === "review") return;

  if (!storage.available()) {
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", showStorageNote, { once: true });
    else showStorageNote();
    return;
  }

  const locale = localeForPath(pathname);
  if (locale === null) {
    location.replace("/");
    return;
  }
  setLocale(locale);

  const root = localeRoot(locale);
  const session = mockSession();
  const target = targetFor(session, root);

  if (page === "chat") {
    if (target !== root) location.replace(target);
    return;
  }

  if (page === "server") {
    if (session.server !== null) location.replace(target);
    return;
  }

  if (page === "login" || page === "register") {
    if (session.server === null) {
      location.replace(`${root}server/`);
      return;
    }
    if (session.account !== null) location.replace(target);
    return;
  }

  if (page === "key") {
    if (session.server === null) {
      location.replace(`${root}server/`);
      return;
    }
    if (session.account === null) {
      location.replace(`${root}login/`);
      return;
    }
    if (session.key) location.replace(root);
    return;
  }

  location.replace(target);
}

run();
