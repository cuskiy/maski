import type { App } from "../../app/app.ts";
import { config } from "../../app/config.ts";
import { setLocale, t } from "../../i18n/index.ts";
import { setState, state, subscribe } from "../../store/state.ts";
import { el } from "../dom.ts";
import { button, openDialogFrame, row, textField, uploadButton } from "../dialog-kit.ts";
import { avatar } from "../media.ts";
import { copyText, toast } from "../overlay.ts";

export function restoreKeys(app: App): HTMLElement {
  const input = textField(t("gate.keyLabel"), "");
  const notice = el("p", { class: "dialog-note" });
  return el("div", { class: "setting-value restore" }, [
    input,
    button(t("gate.unlock"), () => {
      notice.textContent = t("gate.unlocking");
      void app.worker
        .send<{ ready: boolean; backup: boolean }>({ type: "unlock", recoveryKey: input.value })
        .then((status) => {
          setState({ keys: status });
          notice.textContent = t("settings.securityReady");
          void app.loadDevices();
        })
        .catch((error: unknown) => {
          notice.textContent = error instanceof Error && error.message === "invalid" ? t("gate.invalid") : t("gate.restore");
        });
    }, true),
    notice,
    el("p", { class: "dialog-note", text: t("settings.restoreHint") }),
  ]);
}

export function securitySection(app: App): HTMLElement {
  const body = el("div", { class: "security" });
  const render = (): void => {
    const card = verifyCard(app);
    body.replaceChildren(...(card ? [card, deviceList(app), signOutOthers(app)] : [deviceList(app), signOutOthers(app)]));
  };
  render();
  void app.loadDevices();
  const stop = subscribe(() => {
    if (!body.isConnected) {
      stop();
      return;
    }
    render();
  });
  return body;
}

function verifyCard(app: App): HTMLElement | null {
  const verify = state.verify;
  if (!verify) return null;
  const card = el("div", { class: "verify-card" });
  const send = (command: "verifyAccept" | "verifyConfirm" | "verifyMismatch" | "verifyCancel"): void => {
    void app.worker.send({ type: command }).catch(() => app.toast(t("error.unknown")));
  };
  switch (verify.state) {
    case "requested":
      card.append(
        el("p", { class: "verify-text", text: t("profile.verifyRequest") }),
        el("p", { class: "dialog-note", text: verify.from }),
        el("div", { class: "dialog-actions" }, [
          button(t("profile.verifyAccept"), () => send("verifyAccept"), true),
          button(t("profile.verifyDecline"), () => send("verifyCancel")),
        ]),
      );
      return card;
    case "ready":
      card.append(el("p", { class: "verify-text", text: t("profile.verifyWaiting") }));
      return card;
    case "sas":
      card.append(
        el("p", { class: "verify-text", text: t("profile.verifyIntro") }),
        el("div", { class: "verify-emoji" }, verify.emoji.map((emoji) =>
          el("div", { class: "verify-emoji-cell" }, [
            el("span", { class: "verify-symbol", text: emoji.symbol }),
            el("span", { class: "verify-name", text: emoji.name }),
          ]),
        )),
        el("div", { class: "dialog-actions" }, [
          button(t("profile.verifyMatch"), () => send("verifyConfirm"), true),
          button(t("profile.verifyNoMatch"), () => send("verifyMismatch")),
        ]),
      );
      return card;
    case "done":
      card.append(el("p", { class: "verify-text", text: t("profile.verifyDone") }));
      void app.loadDevices();
      return card;
    default:
      card.append(
        el("p", { class: "verify-text", text: t("profile.verifyCancelled") }),
        el("div", { class: "dialog-actions" }, [button(t("common.close"), () => setState({ verify: null }))]),
      );
      return card;
  }
}

function signOutOthers(app: App): HTMLElement {
  const block = el("div", { class: "setting-value" });
  const others = state.devices.filter((device) => !device.current).length;
  const start = (): void => {
    const password = textField(t("gate.password"), "", "password");
    const confirm = button(t("settings.signOutOthersAction"), () => {
      void app.worker
        .send<{ signedOut: number }>({ type: "signOutOthers", password: password.value })
        .then(() => {
          toast(t("toast.signedOut"));
          void app.loadDevices();
        })
        .catch(() => app.toast(t("error.credentials")));
    }, true);
    block.replaceChildren(password, confirm, button(t("common.cancel"), () => setState({ devices: state.devices })));
    password.focus();
  };
  block.append(
    el("span", { class: "status-text", text: t("settings.signOutOthersHint", { n: others }) }),
    button(t("settings.signOutOthers"), start),
  );
  return block;
}

function deviceList(app: App): HTMLElement {
  const list = el("div", { class: "device-list" }, [el("p", { class: "dialog-note", text: t("common.loading") })]);
  if (state.devices.length > 0) {
    list.replaceChildren(
      ...state.devices.map((device) =>
        el("div", { class: "device-row" }, [
          el("span", { class: "device-name", text: device.name }),
          device.current ? el("span", { class: "tag", text: t("profile.thisDevice") }) : null,
          device.verified ? el("span", { class: "tag", text: t("profile.verified") }) : null,
          !device.current && state.verify?.state !== "sas"
            ? button(t("profile.verifyAction"), () => {
                void app.worker.send({ type: "verifyStart", deviceId: device.deviceId }).catch(() => app.toast(t("error.unknown")));
              })
            : null,
        ]),
      ),
    );
  }
  return list;
}

function avatarRow(app: App, name: string, existing: string | null): HTMLElement {
  const slot = el("span", { class: "setting-avatar" }, [avatar(existing, name, 40)]);
  const upload = uploadButton(t("settings.changeAvatar"), async (file) => {
    const data = await file.arrayBuffer();
    const result = await app.worker.send<{ url: string }>({ type: "uploadAvatar", data, mime: file.type || "image/png" });
    slot.replaceChildren(avatar(result.url, name, 40));
    if (state.session) setState({ session: { ...state.session, avatar: result.url } });
    toast(t("toast.saved"));
  });
  return el("div", { class: "setting-value" }, [slot, upload]);
}

function desktopStatus(): string {
  if (typeof Notification === "undefined") return t("settings.desktopUnsupported");
  if (Notification.permission === "granted") return t("settings.desktopOn");
  if (Notification.permission === "denied") return t("settings.desktopDenied");
  return t("settings.desktopOff");
}

export function settingsDialog(app: App): void {
  const session = state.session;
  if (!session) return;
  const name = textField(t("settings.displayName"), session.displayName);
  const note = el("p", { class: "dialog-note", text: t("settings.profileNote") });
  const language = el("div", { class: "segmented" }, config.locales.map((locale) =>
    el("button", {
      class: `button${state.locale === locale.id ? " is-active" : ""}`,
      attrs: { type: "button" },
      on: {
        click: () => {
          setLocale(locale.id);
          setState({ locale: locale.id });
          void app.local.saveSettings({ locale: locale.id });
          void app.local.settings().then(() => {
            location.href = `${locale.path}${location.hash}`;
          });
        },
      },
    }, [el("span", { text: locale.label })]),
  ));

  const desktop = el("div", { class: "setting-value" });
  const paintDesktop = (): void => {
    const pending = typeof Notification !== "undefined" && Notification.permission === "default";
    desktop.replaceChildren(
      el("span", { class: "status-text", text: desktopStatus() }),
      ...(pending
        ? [
            button(t("settings.enable"), () => {
              void Notification.requestPermission().then((permission) => {
                void app.local.saveSettings({ desktop: permission === "granted" }).then((settings) => {
                  setState({ settings });
                  paintDesktop();
                });
              });
            }),
          ]
        : []),
    );
  };
  paintDesktop();

  const body = el("div", { class: "dialog-sections" }, [
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("settings.account") }),
      el("div", { class: "profile-card" }, [
        avatar(session.avatar, session.displayName, 64),
        el("div", { class: "profile-card-text" }, [
          el("div", { class: "profile-name", text: session.displayName }),
          el("button", {
            class: "link-button",
            attrs: { type: "button" },
            on: { click: () => void copyText(session.userId, t("toast.copied")) },
          }, [el("span", { class: "mono", text: session.userId })]),
        ]),
      ]),
      row(t("settings.displayName"), name),
      row(t("settings.mxid"), el("button", {
        class: "link-button mono",
        attrs: { type: "button" },
        on: { click: () => void copyText(session.userId, t("toast.copied")) },
      }, [el("span", { text: session.userId })])),
      row(t("settings.avatar"), avatarRow(app, session.displayName, session.avatar)),
      note,
      row(t("settings.language"), language),
      el("div", { class: "dialog-actions" }, [
        button(t("common.save"), () => {
          void app.worker.send({ type: "profile", name: name.value.trim() }).then(() => {
            toast(t("toast.saved"));
            if (state.session) setState({ session: { ...state.session, displayName: name.value.trim() } });
          });
        }, true),
      ]),
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("settings.notifications") }),
      row(t("settings.desktop"), desktop),
      row(t("settings.preview"), el("input", {
        attrs: { type: "checkbox", ...(state.settings.preview ? { checked: true } : {}) },
        on: {
          change: (event) => {
            const preview = (event.target as HTMLInputElement).checked;
            void app.local.saveSettings({ preview }).then((settings) => setState({ settings }));
          },
        },
      })),
      el("p", { class: "dialog-note", text: t("settings.previewHint") }),
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("settings.security") }),
      row(t("settings.securityDevice"), el("span", { class: "status-text", text: state.keys?.ready ? t("settings.securityReady") : t("settings.securityMissing") })),
      row(t("settings.securityBackup"), el("span", { class: "status-text", text: state.keys?.backup ? t("settings.securityReady") : t("settings.securityMissing") })),
      state.keys?.ready ? null : restoreKeys(app),
      el("h3", { class: "section-subtitle", text: t("profile.devices") }),
      securitySection(app),
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("settings.about") }),
      el("p", { class: "dialog-note", text: t("settings.aboutText") }),
      row(t("settings.version", { version: config.app.version }), el("a", { class: "link", attrs: { href: config.app.sourceUrl, rel: "noopener noreferrer", target: "_blank" }, text: t("settings.source") })),
      el("div", { class: "dialog-actions" }, [
        button(t("settings.logout"), () => {
          if (!window.confirm(t("settings.logoutConfirm"))) return;
          void app.worker.send({ type: "logout" });
        }),
      ]),
    ]),
  ]);
  openDialogFrame(app, t("settings.title"), body);
}
