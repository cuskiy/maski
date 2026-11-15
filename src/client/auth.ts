import type { Catalog } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import type { LocaleId } from "../core/locales.ts";
import { localeRoot } from "../core/locales.ts";
import { config } from "../config.ts";
import { MatrixTransport } from "./matrixTransport.ts";
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

function homeserverDomain(): string {
  const server = mockSession().server;
  if (server === null) return "matrix.org";
  try {
    return new URL(server).host;
  } catch {
    return "matrix.org";
  }
}

function accountId(value: string): string {
  return value.includes(":") ? value : `@${value}:${homeserverDomain()}`;
}

function normaliseHomeserver(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function initServer(c: Catalog, locale: LocaleId): void {
  const serverForm = form("server");
  if (serverForm === null) return;
  serverForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const field = input("homeserver");
    if (field === null || !serverForm.reportValidity()) return;
    const server = normaliseHomeserver(field.value.trim());
    if (server === null) {
      field.setCustomValidity(t(c, "auth.server.invalid"));
      field.reportValidity();
      return;
    }
    field.setCustomValidity("");
    setServer(server);
    navigate(`${localeRoot(locale)}login/`);
  });
}

function initLogin(c: Catalog, locale: LocaleId): void {
  const loginForm = form("login");
  if (loginForm !== null) {
    const username = input("username");
    const password = input("password");
    username?.addEventListener("input", () => username.setCustomValidity(""));
    password?.addEventListener("input", () => password.setCustomValidity(""));
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (username === null || password === null || !loginForm.reportValidity()) return;
      password.setCustomValidity("");
      const submit = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submit !== null) submit.disabled = true;

      const workerUrl = document.querySelector<HTMLMetaElement>('meta[name="matrix-worker"]')?.content;
      const wasmUrl = document.querySelector<HTMLMetaElement>('meta[name="crypto-wasm"]')?.content;
      if (workerUrl === undefined || wasmUrl === undefined || workerUrl === "" || wasmUrl === "") {
        password.setCustomValidity(t(c, "auth.login.failed"));
        password.reportValidity();
        if (submit !== null) submit.disabled = false;
        return;
      }

      const transport = new MatrixTransport(workerUrl, wasmUrl);
      void transport
        .start()
        .then(() =>
          transport.login({
            homeserver: mockSession().server ?? config.homeserver.default,
            username: username.value.trim(),
            password: password.value,
          }),
        )
        .then((session) => {
          setAccount(session.userId);
          setKeyReady();
          transport.dispose();
          navigate(localeRoot(locale));
        })
        .catch(() => {
          transport.dispose();
          password.setCustomValidity(t(c, "auth.login.failed"));
          password.reportValidity();
          if (submit !== null) submit.disabled = false;
        });
    });
  }

  const sso = document.querySelector<HTMLButtonElement>("[data-sso]");
  sso?.addEventListener("click", () => {
    const password = input("password");
    if (password === null) return;
    password.setCustomValidity(t(c, "auth.login.ssoUnavailable"));
    password.reportValidity();
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
}

export function initAuth(page: string, c: Catalog, locale: LocaleId): void {
  if (page === "server") initServer(c, locale);
  else if (page === "login") initLogin(c, locale);
  else if (page === "register") initRegister(c, locale);
  else if (page === "key") initKey(locale);
}
