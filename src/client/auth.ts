import type { Catalog } from "../lib/catalog.ts";
import { t } from "../lib/catalog.ts";
import type { SasState } from "../core/types.ts";
import { isActiveSas } from "../components/sas.ts";
import { SasUi } from "./sasUi.ts";
import { config } from "../config.ts";
import { MatrixTransport } from "./matrixTransport.ts";
import { mockSession, setAccount, setGate, setServer } from "./session.ts";
import { keepStorage } from "./persist.ts";

function revealNextStep(id: string): void {
  const note = document.querySelector<HTMLElement>(`[data-next-step="${id}"]`);
  if (note !== null) note.hidden = false;
}

function hideNextStep(id: string): void {
  const note = document.querySelector<HTMLElement>(`[data-next-step="${id}"]`);
  if (note !== null) note.hidden = true;
}

function hideFlow(flow: string): void {
  const target = document.querySelector<HTMLElement>(`form[data-flow="${flow}"]`);
  if (target !== null) target.hidden = true;
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

function initServer(c: Catalog): void {
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
    revealNextStep("login");
  });
}

function finishLogin(transport: MatrixTransport, session: { readonly userId: string }): void {
  setAccount(session.userId);
  void keepStorage();
  transport.dispose();
  // The worker just started, so it does not hold a secret-storage key yet.
  hideFlow("login");
  revealNextStep("key");
}

function loginError(c: Catalog, error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "network") return t(c, "auth.login.network");
  if (code === "unavailable") return t(c, "auth.login.unavailable");
  return t(c, "auth.login.failed");
}

function initLogin(c: Catalog): void {
  const passwordField = input("password");
  const loginForm = form("login");
  if (loginForm !== null && mockSession().server === null) {
    loginForm.hidden = true;
    hideNextStep("key");
    revealNextStep("server");
    return;
  }
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
        .then((session) => finishLogin(transport, session))
        .catch((error: unknown) => {
          transport.dispose();
          passwordField.setCustomValidity(loginError(c, error));
          passwordField.reportValidity();
          if (submit !== null) submit.disabled = false;
        });
    });
  }
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

function initKey(c: Catalog): void {
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
  if (mockSession().account === null) {
    hideFlow("unlock");
    hideFlow("reset");
    revealNextStep("login");
    return;
  }
  hideNextStep("login");

  let resetPending = false;
  let keySasState: SasState | null = null;
  const verifyButton = document.querySelector<HTMLButtonElement>("[data-key-verify]");
  const keySas = new SasUi({
    c,
    dialogId: "key-sas-dialog",
    dialog: () => document.querySelector<HTMLDialogElement>("#key-sas-dialog"),
    state: () => keySasState,
    actions: {
      acceptSas: (id) => transport.sasAccept(id).then(() => undefined),
      confirmSas: (id) => transport.sasConfirm(id).then(() => undefined),
      mismatchSas: (id) => transport.sasMismatch(id).then(() => undefined),
      cancelSas: (id) => transport.sasCancel(id).then(() => undefined),
    },
    rendered: () => {
      if (verifyButton !== null) verifyButton.disabled = keySasState !== null && isActiveSas(keySasState.phase);
    },
  });

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
    showStatus(null);
    hideFlow("unlock");
    hideFlow("reset");
    revealNextStep("chat");
  };

  transport.onEvent((event) => {
    if (event.type === "sas") {
      keySasState = event.payload;
      keySas.update();
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
    void transport.sasStart(null).catch(() => {
      verifyButton.disabled = false;
      keySas.fail();
    });
  });

  const keySasDialog = document.querySelector<HTMLDialogElement>("#key-sas-dialog");
  keySasDialog?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>("[data-sas-action]");
    if (button === null) return;
    event.preventDefault();
    keySas.handleAction(button.dataset["sasAction"] ?? "");
  });

  keySasDialog?.addEventListener("close", () => {
    keySas.handleClose();
    if (verifyButton !== null) verifyButton.disabled = false;
  });

  showStatus(t(c, "auth.key.waiting"));
  void transport
    .start()
    .then(
      async (data) => {
        if (data.session === null) {
          transport.dispose();
          hideFlow("unlock");
          hideFlow("reset");
          revealNextStep("login");
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
        if (error instanceof Error && error.message === "corrupt") {
          showStatus(t(c, "auth.key.broken"));
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
      .catch((error: unknown) => {
        const malformed = error instanceof Error && error.message === "invalid";
        const message = t(c, malformed ? "auth.key.format" : "auth.key.invalid");
        showStatus(message);
        recovery.setCustomValidity(message);
        recovery.reportValidity();
      })
      .finally(() => {
        if (submit !== null) submit.disabled = false;
      });
  });

  const reset = form("reset");
  const resetPassword = input("reset-password");
  const keyDialog = document.querySelector<HTMLDialogElement>("#key-reset-dialog");
  const keyValue = document.querySelector<HTMLElement>("[data-key-reset-value]");
  let currentKey: string | null = null;
  keyDialog?.addEventListener("cancel", (event) => event.preventDefault());
  keyDialog?.addEventListener("close", () => {
    if (currentKey === null) return;
    resetPending = false;
    const key = currentKey;
    const unlockReset = (attempt: number): void => {
      void transport
        .recover({ recoveryKey: key, passphrase: "" })
        .then((gate) => {
          if (gate === "ready") {
            completeKey();
            return;
          }
          if (attempt < 3) {
            showStatus(t(c, "auth.key.waiting"));
            window.setTimeout(() => unlockReset(attempt + 1), 1500);
            return;
          }
          showStatus(t(c, "auth.key.resetFailed"));
        })
        .catch(() => {
          if (attempt < 3) {
            window.setTimeout(() => unlockReset(attempt + 1), 1500);
            return;
          }
          showStatus(t(c, "auth.key.resetFailed"));
        });
    };
    unlockReset(0);
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
    if (!reset.reportValidity()) return;
    const submit = reset.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit !== null) submit.disabled = true;
    resetPending = true;
    void transport
      .resetIdentity(resetPassword?.value ?? "")
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
      .catch((error: unknown) => {
        resetPending = false;
        const code = error instanceof Error ? error.message : "";
        if (code === "auth") {
          showStatus(t(c, "auth.key.resetFailed"));
          return;
        }
        if (code === "unsupported") {
          showStatus(t(c, "auth.key.resetFailed"));
          return;
        }
        if (code === "too-large") {
          showStatus(t(c, "auth.key.resetOffline"));
          return;
        }
        if (code === "locked") {
          showStatus(t(c, "auth.key.locked"));
          return;
        }
        if (code === "not-signed-in") {
          showStatus(t(c, "auth.key.resetSignedOut"));
          return;
        }
        if (code === "unavailable") {
          showStatus(t(c, "auth.key.unavailable"));
          return;
        }
        if (code === "corrupt") {
          showStatus(t(c, "auth.key.resetBroken"));
          return;
        }
        showStatus(t(c, "auth.key.resetOffline"));
      })
      .finally(() => {
        if (submit !== null) submit.disabled = false;
      });
  });
}

export function initAuth(page: string, c: Catalog): void {
  if (page === "login") {
    const target = document.querySelector<HTMLElement>("[data-auth-server]");
    if (target !== null) target.textContent = mockSession().server ?? config.homeserver.default;
  }
  if (page === "server") initServer(c);
  else if (page === "login") initLogin(c);
  else if (page === "key") initKey(c);
}
