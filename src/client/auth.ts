import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import type { LocaleId } from "../core/locales.ts";
import { localeRoot } from "../core/locales.ts";
import type { SasState } from "../core/types.ts";
import { isActiveSas, sasBody } from "../components/sas.ts";
import { config } from "../config.ts";
import { MatrixTransport } from "./matrixTransport.ts";
import { replaceHtml } from "./dom.ts";
import { mockSession, setAccount, setGate, setServer } from "./session.ts";
import { keepStorage } from "./persist.ts";

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
  const serverField = input("homeserver");
  const selectedServer = mockSession().server;
  if (serverField !== null && selectedServer !== null) serverField.value = selectedServer;
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

function destination(gate: string, locale: LocaleId): string {
  return gate === "ready" ? localeRoot(locale) : `${localeRoot(locale)}key/`;
}

function finishLogin(transport: MatrixTransport, session: { readonly userId: string }, locale: LocaleId): void {
  setAccount(session.userId);
  void keepStorage();
  transport.dispose();
  // The worker just started, so it does not hold a secret-storage key yet.
  navigate(`${localeRoot(locale)}key/`);
}

function loginError(c: Catalog, error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "network") return t(c, "auth.login.network");
  if (code === "unavailable") return t(c, "auth.login.unavailable");
  return t(c, "auth.login.failed");
}

function initLogin(c: Catalog, locale: LocaleId): void {
  const passwordField = input("password");
  const loginForm = form("login");
  if (loginForm !== null) {
    const username = input("username");
    username?.addEventListener("input", () => username.setCustomValidity(""));
    passwordField?.addEventListener("input", () => passwordField.setCustomValidity(""));
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (username === null || passwordField === null || !loginForm.reportValidity()) return;
      passwordField.setCustomValidity("");
      const submit = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submit !== null) submit.disabled = true;
      const transport = keyTransport();
      if (transport === null) {
        passwordField.setCustomValidity(t(c, "auth.login.unavailable"));
        passwordField.reportValidity();
        if (submit !== null) submit.disabled = false;
        return;
      }
      void transport
        .start()
        .then(() =>
          transport.login({
            homeserver: mockSession().server ?? config.homeserver.default,
            username: username.value.trim(),
            password: passwordField.value,
          }),
        )
        .then((session) => finishLogin(transport, session, locale))
        .catch((error: unknown) => {
          transport.dispose();
          passwordField.setCustomValidity(loginError(c, error));
          passwordField.reportValidity();
          if (submit !== null) submit.disabled = false;
        });
    });
  }

  const token = new URL(location.href).searchParams.get("loginToken");
  if (token !== null) {
    const clean = new URL(location.href);
    clean.searchParams.delete("loginToken");
    history.replaceState(null, "", `${clean.pathname}${clean.search}${clean.hash}`);
    const transport = keyTransport();
    if (transport === null) {
      if (passwordField !== null) {
        passwordField.setCustomValidity(t(c, "auth.login.unavailable"));
        passwordField.reportValidity();
      }
    } else {
      void transport
        .start()
        .then(() =>
          transport.loginToken({
            homeserver: mockSession().server ?? config.homeserver.default,
            token,
          }),
        )
        .then((session) => finishLogin(transport, session, locale))
        .catch((error: unknown) => {
          transport.dispose();
          if (passwordField !== null) {
            passwordField.setCustomValidity(loginError(c, error));
            passwordField.reportValidity();
          }
        });
    }
  }

  const sso = document.querySelector<HTMLButtonElement>("[data-sso]");
  sso?.addEventListener("click", () => {
    const transport = keyTransport();
    if (transport === null) {
      if (passwordField !== null) {
        passwordField.setCustomValidity(t(c, "auth.login.unavailable"));
        passwordField.reportValidity();
      }
      return;
    }
    sso.disabled = true;
    void transport
      .start()
      .then(() =>
        transport.ssoUrl({
          homeserver: mockSession().server ?? config.homeserver.default,
          redirectUrl: `${location.origin}${localeRoot(locale)}login/`,
        }),
      )
      .then((url) => location.assign(url))
      .catch(() => {
        transport.dispose();
        sso.disabled = false;
        if (passwordField !== null) {
          passwordField.setCustomValidity(t(c, "auth.login.ssoFailed"));
          passwordField.reportValidity();
        }
      });
  });
}

function initRegister(c: Catalog, locale: LocaleId): void {
  const registerForm = form("register");
  if (registerForm === null) return;
  const username = input("username");
  const password = input("password");
  const confirm = input("confirm");
  const dialog = document.querySelector<HTMLDialogElement>("#register-key-dialog");
  const keyValue = document.querySelector<HTMLElement>("[data-register-key]");
  let currentKey: string | null = null;
  let gate: string = "unknown";
  for (const field of [username, password, confirm]) {
    field?.addEventListener("input", () => field.setCustomValidity(""));
  }
  dialog?.addEventListener("cancel", (event) => event.preventDefault());
  dialog?.querySelector("[data-register-copy]")?.addEventListener("click", () => {
    if (currentKey !== null) void navigator.clipboard.writeText(currentKey).catch(() => undefined);
  });
  dialog?.querySelector("[data-register-download]")?.addEventListener("click", () => {
    if (currentKey === null) return;
    const url = URL.createObjectURL(new Blob([currentKey], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "maski-recovery-key.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  });
  dialog?.addEventListener("close", () => {
    if (currentKey !== null) navigate(destination(gate, locale));
  });
  dialog?.querySelector("[data-register-continue]")?.addEventListener("click", () => {
    dialog.close();
  });

  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (username === null || password === null || confirm === null || !registerForm.reportValidity()) return;
    if (password.value !== confirm.value) {
      confirm.setCustomValidity(t(c, "auth.register.mismatch"));
      confirm.reportValidity();
      return;
    }
    confirm.setCustomValidity("");
    const submit = registerForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit !== null) submit.disabled = true;
    const transport = keyTransport();
    if (transport === null) {
      confirm.setCustomValidity(t(c, "auth.register.failed"));
      confirm.reportValidity();
      if (submit !== null) submit.disabled = false;
      return;
    }
    void transport
      .start()
      .then(() =>
        transport.register({
          homeserver: mockSession().server ?? config.homeserver.default,
          username: username.value.trim(),
          password: password.value,
        }),
      )
      .then((result) => {
        setAccount(result.session.userId);
        setGate(result.key);
        gate = result.key;
        if (result.recoveryKey === null || dialog === null || keyValue === null) {
          transport.dispose();
          navigate(destination(result.key, locale));
          return;
        }
        currentKey = result.recoveryKey;
        keyValue.textContent = result.recoveryKey;
        dialog.showModal();
      })
      .catch((error: unknown) => {
        transport.dispose();
        confirm.setCustomValidity(
          error instanceof Error && error.message === "network"
            ? t(c, "auth.login.network")
            : t(c, "auth.register.failed"),
        );
        confirm.reportValidity();
        if (submit !== null) submit.disabled = false;
      });
  });
}

function keyTransport(): MatrixTransport | null {
  const workerUrl = document.querySelector<HTMLMetaElement>('meta[name="matrix-worker"]')?.content;
  const wasmUrl = document.querySelector<HTMLMetaElement>('meta[name="crypto-wasm"]')?.content;
  if (workerUrl === undefined || wasmUrl === undefined || workerUrl === "" || wasmUrl === "") return null;
  return new MatrixTransport(workerUrl, wasmUrl);
}

function keyStatusText(c: Catalog, gate: string): string | null {
  if (gate === "needs-recovery") return t(c, "auth.key.recoveryNeeded");
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

  let resetPending = false;
  const verifyButton = document.querySelector<HTMLButtonElement>("[data-key-verify]");
  const sasDialog = document.querySelector<HTMLDialogElement>("#key-sas-dialog");
  const sasRegion = document.querySelector<HTMLElement>('[data-region="key-sas-dialog-body"]');
  let sas: SasState | null = null;
  let sasError: CatalogKey | null = null;
  let sasConfirmedId: string | null = null;
  let sasSentCancelId: string | null = null;

  const renderSas = (): void => {
    if (sasRegion === null) return;
    replaceHtml(
      sasRegion,
      sasBody(c, sas, {
        dialogId: "key-sas-dialog",
        error: sasError,
        confirmed: sasConfirmedId !== null && sasConfirmedId === sas?.id,
      }),
    );
  };

  const showSas = (): void => {
    renderSas();
    if (sasDialog !== null && !sasDialog.open) sasDialog.showModal();
  };

  const failSas = (): void => {
    sasError = "auth.key.sasFailed";
    showSas();
  };

  const cancelSas = (): void => {
    if (sas === null || sasSentCancelId === sas.id) return;
    sasSentCancelId = sas.id;
    void transport.sasCancel(sas.id).catch(() => undefined);
  };

  const revealVerify = (gate: string): void => {
    if (verifyButton === null) return;
    verifyButton.hidden = gate !== "needs-verification";
  };

  let completed = false;
  const completeKey = (): void => {
    if (completed) return;
    completed = true;
    setGate("ready");
    transport.dispose();
    navigate(localeRoot(locale));
  };

  transport.onEvent((event) => {
    if (event.type === "sas") {
      if (sas?.id !== event.payload.id) {
        sasConfirmedId = null;
        sasSentCancelId = null;
      }
      sas = event.payload;
      sasError = null;
      if (verifyButton !== null) verifyButton.disabled = isActiveSas(sas.phase);
      showSas();
      return;
    }
    if (event.type !== "keys") return;
    setGate(event.payload);
    if (verifyButton !== null) verifyButton.disabled = false;
    revealVerify(event.payload);
    if (event.payload === "ready") {
      if (resetPending) return;
      completeKey();
      return;
    }
    showStatus(keyStatusText(c, event.payload));
  });

  verifyButton?.addEventListener("click", () => {
    if (verifyButton.disabled) return;
    verifyButton.disabled = true;
    sasError = null;
    void transport.sasStart(null).catch(() => {
      verifyButton.disabled = false;
      failSas();
    });
  });

  sasDialog?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || sas === null) return;
    const button = target.closest<HTMLElement>("[data-sas-action]");
    if (button === null) return;
    event.preventDefault();
    sasError = null;
    const action = button.dataset["sasAction"] ?? "";
    if (action === "accept") {
      void transport.sasAccept(sas.id).catch(failSas);
    } else if (action === "confirm") {
      sasConfirmedId = sas.id;
      renderSas();
      void transport.sasConfirm(sas.id).catch(failSas);
    } else if (action === "mismatch") {
      void transport.sasMismatch(sas.id).catch(failSas);
    } else if (action === "cancel") {
      cancelSas();
      sasDialog.close();
    }
  });

  sasDialog?.addEventListener("close", () => {
    if (sas !== null && isActiveSas(sas.phase)) cancelSas();
    if (verifyButton !== null) verifyButton.disabled = false;
  });

  showStatus(t(c, "auth.key.waiting"));
  void transport
    .start()
    .then(
      async (data) => {
        if (data.session === null) {
          transport.dispose();
          navigate(`${localeRoot(locale)}login/`);
          return;
        }
        const gate = await transport.keyStatus();
        setGate(gate);
        revealVerify(gate);
        if (gate === "ready") {
          completeKey();
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
    )
    .catch(() => showStatus(t(c, "auth.key.unavailable")));

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
        revealVerify(gate);
        if (gate === "ready") {
          completeKey();
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

  const reset = form("reset");
  const keyDialog = document.querySelector<HTMLDialogElement>("#key-reset-dialog");
  const keyValue = document.querySelector<HTMLElement>("[data-key-reset-value]");
  let currentKey: string | null = null;
  keyDialog?.addEventListener("cancel", (event) => event.preventDefault());
  keyDialog?.addEventListener("close", () => {
    if (currentKey === null) return;
    resetPending = false;
    transport.dispose();
    navigate(localeRoot(locale));
  });
  keyDialog?.querySelector("[data-key-reset-copy]")?.addEventListener("click", () => {
    if (currentKey !== null) void navigator.clipboard.writeText(currentKey).catch(() => undefined);
  });
  keyDialog?.querySelector("[data-key-reset-download]")?.addEventListener("click", () => {
    if (currentKey === null) return;
    const url = URL.createObjectURL(new Blob([currentKey], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "maski-recovery-key.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  });
  keyDialog?.querySelector("[data-key-reset-continue]")?.addEventListener("click", () => {
    keyDialog.close();
  });
  reset?.addEventListener("submit", (event) => {
    event.preventDefault();
    const password = input("reset-password");
    if (password === null || !reset.reportValidity()) return;
    password.setCustomValidity("");
    const submit = reset.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit !== null) submit.disabled = true;
    resetPending = true;
    void transport
      .resetIdentity(password.value)
      .then((key) => {
        if (key === null || keyDialog === null || keyValue === null) {
          resetPending = false;
          showStatus(t(c, "auth.key.resetFailed"));
          return;
        }
        currentKey = key;
        keyValue.textContent = key;
        keyDialog.showModal();
      })
      .catch(() => {
        resetPending = false;
        showStatus(t(c, "auth.key.resetFailed"));
        password.setCustomValidity(t(c, "auth.key.resetFailed"));
        password.reportValidity();
      })
      .finally(() => {
        if (submit !== null) submit.disabled = false;
      });
  });
}

export function initAuth(page: string, c: Catalog, locale: LocaleId): void {
  if (page === "login" || page === "register") {
    const target = document.querySelector<HTMLElement>("[data-auth-server]");
    if (target !== null) target.textContent = mockSession().server ?? config.homeserver.default;
  }
  if (page === "server") initServer(c, locale);
  else if (page === "login") initLogin(c, locale);
  else if (page === "register") initRegister(c, locale);
  else if (page === "key") initKey(c, locale);
}
