import { config } from "../config.ts";
import { locales } from "../catalogs/index.ts";
import { t } from "../i18n.ts";
import { el } from "../ui.ts";
import { readAccount, writeAccount } from "./account.ts";
import { rememberLocale } from "./locale.ts";
import { get, subscribe } from "./store.ts";
import type { WorkerClient } from "./worker.ts";

/** The settings surface: what the client can honestly change today, and nothing else. */
export function mountSettings(root: HTMLElement, worker: WorkerClient): void {
  const draw = (): void => {
    const state = get();
    const account = readAccount();
    const session = state.session;
    root.replaceChildren(...sections(state.phase, session?.userId ?? account?.userId ?? "", session?.name ?? account?.name ?? "", worker));
  };
  subscribe(["session", "phase"], draw);
  draw();
}

function sections(phase: string, userId: string, name: string, worker: WorkerClient): HTMLElement[] {
  const blocks: HTMLElement[] = [];

  if (userId.length > 0) {
    blocks.push(
      el("section", { class: "settings-block" }, [
        el("h3", { class: "settings-heading", text: t("settings.account") }),
        el("p", { class: "settings-name", text: name }),
        el("p", { class: "settings-value", text: userId }),
      ]),
    );
  }

  const current = locales.find((entry) => entry.id === document.documentElement.lang) ?? locales[0];
  blocks.push(
    el("section", { class: "settings-block" }, [
      el("h3", { class: "settings-heading", text: t("settings.language") }),
      el("button", {
        class: "settings-choice",
        text: current?.label ?? "",
        attrs: { type: "button", popovertarget: "settings-lang", "aria-label": t("settings.language") },
      }),
      el("nav", { class: "settings-lang-menu", attrs: { id: "settings-lang", popover: "auto" } },
        locales.map((locale) =>
          el("a", {
            class: `lang-item${locale.id === current?.id ? " is-current" : ""}`,
            text: locale.label,
            attrs: {
              href: `${locale.path}chat/`,
              hreflang: locale.id,
              ...(locale.id === current?.id ? { "aria-current": "page" } : {}),
            },
          }),
        ),
      ),
    ]),
  );

  blocks.push(
    el("section", { class: "settings-block" }, [
      el("h3", { class: "settings-heading", text: t("settings.about") }),
      el("p", { class: "settings-value", text: t("settings.version", { version: config.app.version }) }),
      el("p", { class: "settings-value" }, [
        el("a", { class: "link", text: t("settings.source"), attrs: { href: config.app.source, rel: "noopener noreferrer", target: "_blank" } }),
      ]),
      el("p", { class: "settings-note", text: t("settings.privacy") }),
    ]),
  );

  if (phase !== "signedOut") {
    const confirm = el("div", { class: "settings-confirm", attrs: { hidden: "hidden" } }, [
      el("p", { class: "settings-note", text: t("settings.logoutConfirm") }),
      el("button", {
        class: "button-quiet is-danger",
        text: t("settings.logoutYes"),
        attrs: { type: "button" },
        on: {
          click: () => {
            void worker.send({ type: "logout" }).finally(() => {
              writeAccount(null);
              location.assign("/");
            });
          },
        },
      }),
      el("button", {
        class: "button-quiet",
        text: t("settings.cancel"),
        attrs: { type: "button" },
        on: { click: () => confirm.setAttribute("hidden", "hidden") },
      }),
    ] as never);
    blocks.push(
      el("section", { class: "settings-block" }, [
        el("button", {
          class: "button-quiet",
          text: t("settings.logout"),
          attrs: { type: "button" },
          on: { click: () => confirm.removeAttribute("hidden") },
        }),
        confirm,
      ]),
    );
  }

  return blocks;
}

export { rememberLocale };
