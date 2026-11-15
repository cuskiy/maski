import type { Catalog } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import type { LocaleId } from "../core/locales.ts";
import { localeRoot } from "../core/locales.ts";
import { mockSession, setAccount, setKeyReady, setServer } from "./session.ts";

function navigate(path: string): void {
  location.assign(path);
}

function form(flow: string): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>(`form[data-flow="${flow}"]`);
}

function input(id: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`#${id}`);
}

function initServer(locale: LocaleId): void {
  const serverForm = form("server");
  if (serverForm === null) return;
  serverForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const field = input("homeserver");
    if (field === null || !serverForm.reportValidity()) return;
    setServer(field.value.trim());
    navigate(`${localeRoot(locale)}login/`);
  });
}

function accountId(value: string): string {
  return value.includes(":") ? value : `@${value}:matrix.org`;
}

function initLogin(locale: LocaleId): void {
  const loginForm = form("login");
  if (loginForm !== null) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = input("username");
      if (username === null || !loginForm.reportValidity()) return;
      setAccount(accountId(username.value.trim()));
      navigate(`${localeRoot(locale)}key/`);
    });
  }

  const sso = document.querySelector<HTMLButtonElement>("[data-sso]");
  sso?.addEventListener("click", () => {
    setAccount("@sso:matrix.org");
    navigate(`${localeRoot(locale)}key/`);
  });
}

function initRegister(c: Catalog, locale: LocaleId): void {
  const registerForm = form("register");
  if (registerForm === null) return;
  const confirm = input("confirm");
  const password = input("password");
  confirm?.addEventListener("input", () => confirm.setCustomValidity(""));
  password?.addEventListener("input", () => confirm?.setCustomValidity(""));
  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    confirm?.setCustomValidity("");
    const username = input("username");
    if (username === null || password === null || confirm === null) return;
    if (password.value !== confirm.value) {
      confirm.setCustomValidity(t(c, "auth.register.mismatch"));
      confirm.reportValidity();
      return;
    }
    confirm.setCustomValidity("");
    setAccount(accountId(username.value.trim()), true);
    navigate(`${localeRoot(locale)}key/`);
  });
}

function initKey(locale: LocaleId): void {
  if (mockSession().registered) {
    document.querySelector<HTMLElement>("[data-key-paths]")?.setAttribute("hidden", "");
    const note = document.querySelector<HTMLElement>("[data-key-new]");
    if (note !== null) note.hidden = false;
  }

  const unlock = form("unlock");
  unlock?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!unlock.reportValidity()) return;
    setKeyReady();
    navigate(localeRoot(locale));
  });

  const reset = form("reset");
  reset?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!reset.reportValidity()) return;
    setKeyReady();
    navigate(localeRoot(locale));
  });

  document.querySelector<HTMLButtonElement>("[data-sas-match]")?.addEventListener("click", () => {
    setKeyReady();
    navigate(localeRoot(locale));
  });
}

export function initAuth(page: string, c: Catalog, locale: LocaleId): void {
  if (page === "server") initServer(locale);
  else if (page === "login") initLogin(locale);
  else if (page === "register") initRegister(c, locale);
  else if (page === "key") initKey(locale);
}
