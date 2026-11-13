import type { Discovery, Keys, Session } from "../core/types.ts";
import { readServer } from "../core/server.ts";
import { locales } from "../catalogs/index.ts";
import { useCatalog, t } from "../i18n.ts";
import { el } from "../ui.ts";
import { writeAccount } from "./account.ts";
import { WorkerClient } from "./worker.ts";

/** The sign-in pages: one form per document, driven by the worker and nothing else. */
export function startAuth(): void {
  const locale = locales.find((entry) => entry.id === document.documentElement.lang) ?? locales[0];
  if (locale) useCatalog(locale.catalog);

  const flow = document.querySelector<HTMLFormElement>("form[data-flow]")?.dataset["flow"] ?? "";
  if (flow.length === 0) return;

  const worker = new WorkerClient();
  const start = worker.send<{ session: Session | null; keys: Keys | null }>({ type: "start", accountHash: null, wasm: worker.wasm() });
  void start.catch(() => undefined);

  const error = el("p", { class: "note error", attrs: { role: "alert" } });
  const fail = (message: string, form: HTMLFormElement): void => {
    error.textContent = message;
    form.append(error);
  };

  if (flow === "server") wireServer(worker, fail);
  if (flow === "login") wireLogin(worker, fail);
}

function value(id: string): string {
  const field = document.getElementById(id);
  return field instanceof HTMLInputElement ? field.value : "";
}

function wireServer(worker: WorkerClient, fail: (message: string, form: HTMLFormElement) => void): void {
  const form = document.querySelector<HTMLFormElement>('form[data-flow="server"]');
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (readServer(value("homeserver")) === null) {
      fail(t("auth.server.invalid"), form);
      return;
    }
    const button = form.querySelector("button");
    if (button) button.disabled = true;
    void worker
      .send<Discovery>({ type: "discover", address: value("homeserver") })
      .then((discovery) => {
        const page = discovery.password ? "login" : "login-oauth";
        location.assign(`../${page}/?server=${encodeURIComponent(discovery.baseUrl)}&name=${encodeURIComponent(discovery.serverName)}`);
      })
      .catch(() => {
        if (button) button.disabled = false;
        fail(t("auth.server.unreachable"), form);
      });
  });
}

function wireLogin(worker: WorkerClient, fail: (message: string, form: HTMLFormElement) => void): void {
  const form = document.querySelector<HTMLFormElement>('form[data-flow="login"]');
  if (!form) return;
  const baseUrl = new URLSearchParams(location.search).get("server");
  if (baseUrl === null) {
    const back = el("p", { class: "note" }, [
      el("a", { class: "link", text: t("auth.flowBack"), attrs: { href: "../server/" } }),
    ]);
    form.before(back);
    form.querySelectorAll("input, button").forEach((control) => {
      (control as HTMLInputElement).disabled = true;
    });
    return;
  }
  const heading = document.querySelector(".auth-hint");
  if (heading) heading.textContent = baseUrl;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    if (button) button.disabled = true;
    void worker
      .send<{ session: Session }>({ type: "login", baseUrl, user: value("username"), password: value("password") })
      .then(({ session }) => {
        writeAccount({ hash: session.accountHash, userId: session.userId, name: session.name, baseUrl: session.baseUrl });
        location.assign("../chat/");
      })
      .catch((cause: unknown) => {
        if (button) button.disabled = false;
        fail(cause instanceof Error ? cause.message : t("auth.login.failed"), form);
      });
  });
}
