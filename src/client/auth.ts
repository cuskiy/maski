import type { Catalog } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import type { LocaleId } from "../core/locales.ts";
import { localeRoot } from "../core/locales.ts";
import { config } from "../config.ts";
import { MatrixTransport } from "./matrixTransport.ts";
import { mockSession, setAccount, setGate, setServer } from "./session.ts";

function navigate(path: string): void {
  location.assign(path);
}

function form(flow: string): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>(`form[data-flow="${flow}"]`);
}

function input(id: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`#${id}`);
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
        .then(async (session) => {
          setAccount(session.userId);
          const gate = await transport.keyStatus();
          setGate(gate);
          transport.dispose();
          navigate(gate === "ready" || gate === "unknown" ? localeRoot(locale) : `${localeRoot(locale)}key/`);
        })
        .catch((error: unknown) => {
          transport.dispose();
          const code = error instanceof Error ? error.message : "";
          const message =
            code === "network"
              ? t(c, "auth.login.network")
              : code === "unavailable"
                ? t(c, "auth.login.unavailable")
                : t(c, "auth.login.failed");
          password.setCustomValidity(message);
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

function keyTransport(): MatrixTransport | null {
  const workerUrl = document.querySelector<HTMLMetaElement>('meta[name="matrix-worker"]')?.content;
  const wasmUrl = document.querySelector<HTMLMetaElement>('meta[name="crypto-wasm"]')?.content;
  if (workerUrl === undefined || wasmUrl === undefined || workerUrl === "" || wasmUrl === "") return null;
  return new MatrixTransport(workerUrl, wasmUrl);
}

function keyStatusText(c: Catalog, gate: string): string | null {
  if (gate === "needs-recovery") return t(c, "auth.key.invalid");
  if (gate === "needs-verification") return t(c, "auth.key.verification");
  if (gate === "unknown") return t(c, "auth.key.waiting");
  return null;
}

function initKey(c: Catalog, locale: LocaleId): void {
  const transport = keyTransport();
  const status = document.querySelector<HTMLElement>("[data-key-status]");
  const showStatus = (message: string | null): void => {
    if (status === null) return;
    status.hidden = message === null;
    status.textContent = message ?? "";
  };
  if (transport === null) {
    showStatus(t(c, "auth.key.unavailable"));
    return;
  }

  transport.onEvent((event) => {
    if (event.type !== "keys") return;
    setGate(event.payload);
    if (event.payload === "ready") {
      transport.dispose();
      navigate(localeRoot(locale));
      return;
    }
    showStatus(keyStatusText(c, event.payload));
  });

  void transport.start().then(
    async (data) => {
      if (data.session === null) {
        transport.dispose();
        navigate(`${localeRoot(locale)}login/`);
        return;
      }
      const gate = await transport.keyStatus();
      setGate(gate);
      if (gate === "ready") {
        transport.dispose();
        navigate(localeRoot(locale));
        return;
      }
      showStatus(keyStatusText(c, gate));
    },
    (error: unknown) => {
      if (error instanceof Error && error.message === "locked") {
        document.querySelector<HTMLElement>("[data-key-paths]")?.setAttribute("hidden", "");
        showStatus(t(c, "auth.key.locked"));
        return;
      }
      showStatus(t(c, "auth.key.unavailable"));
    },
  );

  const unlock = form("unlock");
  unlock?.addEventListener("submit", (event) => {
    event.preventDefault();
    const recovery = input("recovery");
    const passphrase = input("recovery-password");
    if (recovery === null || passphrase === null || !unlock.reportValidity()) return;
    recovery.setCustomValidity("");
    if (recovery.value.trim() === "" && passphrase.value === "") {
      recovery.setCustomValidity(t(c, "auth.key.one"));
      recovery.reportValidity();
      return;
    }
    const submit = unlock.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit !== null) submit.disabled = true;
    void transport
      .recover({ recoveryKey: recovery.value.trim(), passphrase: passphrase.value })
      .then((gate) => {
        setGate(gate);
        if (gate === "ready") {
          transport.dispose();
          navigate(localeRoot(locale));
          return;
        }
        showStatus(keyStatusText(c, gate) ?? t(c, "auth.key.invalid"));
      })
      .catch(() => {
        showStatus(t(c, "auth.key.invalid"));
        recovery.setCustomValidity(t(c, "auth.key.invalid"));
        recovery.reportValidity();
      })
      .finally(() => {
        if (submit !== null) submit.disabled = false;
      });
  });
}

export function initAuth(page: string, c: Catalog, locale: LocaleId): void {
  if (page === "server") initServer(c, locale);
  else if (page === "login") initLogin(c, locale);
  else if (page === "key") initKey(c, locale);
}
