import type { App } from "../app/app.ts";
import { config } from "../app/config.ts";
import type { KeyStatus, Session } from "../core/types.ts";
import type { UiaStage } from "../protocol/messages.ts";
import { setLocale, t } from "../i18n/index.ts";
import { setState, state } from "../store/state.ts";
import { el, icon, ICON } from "./dom.ts";
import { copyText } from "./overlay.ts";

function gateMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "no-keys") return t("gate.noKeys");
  if (code === "restore") return t("gate.restore");
  if (code === "uia") return t("gate.uia");
  return t("gate.invalid");
}

function askStages(app: App, stages: UiaStage[], session: string, baseUrl: string, username: string, password: string, notice: HTMLElement): void {
  const token = stages.some((stage) => stage.stage === "token") ? field(t("auth.token"), { name: "token" }) : null;
  const terms = stages.some((stage) => stage.stage === "terms") ? el("label", { class: "form-row" }, [el("input", { attrs: { type: "checkbox" } }), el("span", { class: "form-label", text: t("auth.terms") })]) : null;
  const boxes = stages.map((stage) => {
    if (stage.stage === "token") return token?.wrap ?? el("span");
    if (stage.stage === "terms") return terms ?? el("span");
    if (stage.stage === "password") return el("p", { class: "form-label", text: t("auth.stagePassword") });
    return el("span");
  });
  const continueButton = el("button", { class: "button button-primary", attrs: { type: "button" } }, [el("span", { text: t("auth.continue") })]);
  notice.replaceChildren(...boxes, continueButton);
  continueButton.addEventListener("click", () => {
    const auth: Record<string, unknown> = { session };
    for (const stage of stages) {
      if (stage.stage === "dummy") auth["type"] = "m.login.dummy";
      if (stage.stage === "terms") auth["type"] = "m.login.terms";
      if (stage.stage === "password") auth["type"] = "m.login.password";
      if (stage.stage === "token") auth["type"] = "m.login.registration_token";
    }
    if (token && token.input.value) auth["token"] = token.input.value;
    if (terms) {
      const checkbox = terms.querySelector("input");
      if (!checkbox?.checked) {
        notice.textContent = t("auth.terms");
        return;
      }
    }
    app.worker
      .send<{ session: Session | null; uia: UiaStage[] | null; uiaSession: string | null }>({
        type: "register",
        baseUrl,
        username,
        password,
        auth,
        session,
      })
      .then((result) => {
        if (result.uia && result.uia.length > 0) askStages(app, result.uia, result.uiaSession ?? "", baseUrl, username, password, notice);
      })
      .catch((error: unknown) => {
        notice.textContent = error instanceof Error ? error.message : t("error.unknown");
      });
  });
}

function field(label: string, attrs: Record<string, string>, value = ""): { wrap: HTMLElement; input: HTMLInputElement } {
  const input = el("input", { class: "field", attrs: { ...attrs, value } });
  const wrap = el("label", { class: "form-row" }, [el("span", { class: "form-label", text: label }), input]);
  return { wrap, input };
}

function languageSwitch(): HTMLElement {
  return el("div", { class: "lang-switch" }, config.locales.map((locale) =>
    el("button", {
      class: `lang-button${state.locale === locale.id ? " is-active" : ""}`,
      attrs: { type: "button" },
      on: {
        click: () => {
          setLocale(locale.id);
          setState({ locale: locale.id });
          void state.settings;
          location.href = `${locale.path}${location.hash}`;
        },
      },
    }, [el("span", { text: locale.label })]),
  ));
}

export function authScreen(app: App): HTMLElement {
  let mode: "login" | "register" = "login";
  const notice = el("p", { class: "form-notice", attrs: { role: "alert" }, text: state.notice });
  const form = el("form", { class: "auth-form" });
  const title = el("h1", { class: "auth-title", text: t("auth.signIn") });
  const tagline = el("p", { class: "auth-text", text: t("app.tagline") });
  const submit = el("button", { class: "button button-primary", attrs: { type: "submit" } }, [el("span", { text: t("auth.signInAction") })]);

  const render = (): void => {
    const kept = new Map([...form.querySelectorAll("input")].map((input) => [input.name, input.value]));
    const server = field(t("auth.homeserver"), { name: "server", autocomplete: "url", value: kept.get("server") || config.homeserver.defaultBaseUrl });
    const user = field(t("auth.username"), { name: "username", autocomplete: "username", value: kept.get("username") ?? "", required: "true" });
    const password = field(t("auth.password"), { name: "password", type: "password", autocomplete: mode === "login" ? "current-password" : "new-password", value: kept.get("password") ?? "", required: "true" });
    const confirm = mode === "register" ? field(t("auth.confirm"), { name: "confirm", type: "password", autocomplete: "new-password", required: "true" }) : null;
    title.textContent = mode === "login" ? t("auth.signIn") : t("auth.signUp");
    submit.replaceChildren(el("span", { text: mode === "login" ? t("auth.signInAction") : t("auth.signUpAction") }));
    form.replaceChildren(
      server.wrap,
      user.wrap,
      password.wrap,
      ...(confirm ? [confirm.wrap] : []),
      submit,
      notice,
      el("button", {
        class: "link-button",
        attrs: { type: "button" },
        on: {
          click: () => {
            mode = mode === "login" ? "register" : "login";
            render();
          },
        },
      }, [el("span", { text: mode === "login" ? t("auth.switchToSignUp") : t("auth.switchToSignIn") })]),
    );
    form.onsubmit = (event) => {
      event.preventDefault();
      if (mode === "register" && confirm && confirm.input.value !== password.input.value) {
        notice.textContent = t("auth.mismatch");
        return;
      }
      notice.textContent = t("auth.working");
      submit.disabled = true;
      const done = (): void => {
        submit.disabled = false;
      };
      if (mode === "login") {
        app.worker
          .send<Session>({ type: "login", baseUrl: server.input.value, user: user.input.value, password: password.input.value })
          .then(done)
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "";
            notice.textContent = /M_FORBIDDEN|Invalid password|Invalid username/.test(message) ? t("error.credentials") : message || t("error.network");
            done();
          });
        return;
      }
      app.worker
        .send<{ session: Session | null; uia: UiaStage[] | null; uiaSession: string | null }>({
          type: "register",
          baseUrl: server.input.value,
          username: user.input.value,
          password: password.input.value,
          auth: null,
          session: null,
        })
        .then((result) => {
          done();
          if (result.uia && result.uia.length > 0) askStages(app, result.uia, result.uiaSession ?? "", server.input.value, user.input.value, password.input.value, notice);
        })
        .catch((error: unknown) => {
          notice.textContent = error instanceof Error ? error.message : t("error.unknown");
          done();
        });
    };
  };

  render();

  return el("div", { class: "screen-auth" }, [
    el("div", { class: "auth-card" }, [
      el("div", { class: "auth-brand" }, [icon(ICON.hash, 22), el("span", { text: config.app.name })]),
      el("div", { class: "auth-intro" }, [title, tagline]),
      form,
      languageSwitch(),
    ]),
  ]);
}

export function gateScreen(app: App): HTMLElement {
  const notice = el("p", { class: "form-notice", attrs: { role: "alert" } });
  const key = field(t("gate.keyLabel"), { name: "key", autocomplete: "off" });
  const password = field(t("gate.password"), { name: "password", type: "password", autocomplete: "current-password" });
  const newKey = el("div", { class: "gate-key", attrs: { hidden: true } });
  const actions = el("div", { class: "gate-actions" });

  const finish = (status: KeyStatus): void => {
    setState({ keys: status });
    void app.enter();
  };

  const unlock = el("button", {
    class: "button button-primary",
    attrs: { type: "button" },
    on: {
      click: () => {
        notice.textContent = t("gate.unlocking");
        app.worker
          .send<KeyStatus>({ type: "unlock", recoveryKey: key.input.value })
          .then((status) => finish(status))
          .catch((error: unknown) => {
            notice.textContent = gateMessage(error);
          });
      },
    },
  }, [el("span", { text: t("gate.unlock") })]);

  const reset = el("button", {
    class: "button",
    attrs: { type: "button" },
    on: {
      click: () => {
        password.wrap.hidden = false;
        newKey.hidden = false;
        notice.textContent = t("gate.resetIntro");
        actions.replaceChildren(
          el("button", {
            class: "button button-primary",
            attrs: { type: "button" },
            on: {
              click: () => {
                app.worker
                  .send<{ key: string; status: KeyStatus }>({ type: "resetKey", password: password.input.value })
                  .then((result) => {
                    newKey.replaceChildren(
                      el("h2", { text: t("gate.newKey") }),
                      el("code", { class: "recovery-key", text: result.key }),
                      el("button", {
                        class: "button",
                        attrs: { type: "button" },
                        on: { click: () => void copyText(result.key, t("toast.recoveryCopied")) },
                      }, [el("span", { text: t("common.copy") })]),
                      el("p", { text: t("gate.newKeyHint") }),
                    );
                    actions.replaceChildren(
                      el("button", {
                        class: "button button-primary",
                        attrs: { type: "button" },
                        on: { click: () => finish(result.status) },
                      }, [el("span", { text: t("gate.saved") })]),
                    );
                  })
                  .catch((error: unknown) => {
                    notice.textContent = error instanceof Error ? error.message : t("error.unknown");
                  });
              },
            },
          }, [el("span", { text: t("gate.resetAction") })]),
        );
      },
    },
  }, [el("span", { text: t("gate.reset") })]);

  const signOut = el("button", {
    class: "link-button",
    attrs: { type: "button" },
    on: { click: () => void app.worker.send({ type: "logout" }) },
  }, [el("span", { text: t("gate.signOut") })]);

  actions.append(unlock, reset);
  password.wrap.hidden = true;

  return el("div", { class: "screen-auth" }, [
    el("div", { class: "auth-card" }, [
      el("div", { class: "auth-brand" }, [icon(ICON.hash, 22), el("span", { text: config.app.name })]),
      el("h1", { class: "auth-title", text: t("gate.title") }),
      el("p", { class: "auth-text", text: t("gate.intro") }),
      key.wrap,
      password.wrap,
      newKey,
      actions,
      notice,
      signOut,
    ]),
  ]);
}
