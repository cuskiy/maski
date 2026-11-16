import { localeForPath, localeRoot } from "../core/locales.ts";
import { mockSession, setLocale, storedLocale, systemLocale, type MockSession } from "./session.ts";
import * as storage from "./storage.ts";

function targetFor(session: MockSession, root: string): string {
  if (session.server === null) return `${root}server/`;
  if (session.account === null) return `${root}login/`;
  if (session.gate !== "ready") return `${root}key/`;
  return root;
}

function showStorageNote(): void {
  const note = document.querySelector<HTMLElement>("[data-storage-note]");
  if (note !== null) note.hidden = false;
}

function run(): void {
  const page = document.documentElement.dataset["page"] ?? "";
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
    // The server page is the escape hatch before sign-in; never bounce it back to itself.
    if (session.account !== null) location.replace(target);
    return;
  }

  if (page === "login") {
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
    // The cached gate is only a paint hint. The worker must decide whether this session has a key.
    return;
  }

  location.replace(target);
}

run();
