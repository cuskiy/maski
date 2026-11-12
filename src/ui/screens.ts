import type { App } from "../app/app.ts";
import { config } from "../app/config.ts";
import type { KeyStatus, Session } from "../core/types.ts";
import type { Discovery, UiaStage } from "../protocol/messages.ts";
import { setLocale, t } from "../i18n/index.ts";
import { setState, state } from "../store/state.ts";
import { el } from "./dom.ts";
import { note, textField } from "./dialog-kit.ts";
import { copyText } from "./overlay.ts";

type Step = "landing" | "server" | "methods" | "register";

function labelled(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return el("div", { class: "form-field" }, [
    el("label", {}, [el("span", { class: "field-label", text: label }), control]),
    hint ? el("small", { class: "field-hint", text: hint }) : null,
  ]);
}

function head(title: string, text: string): HTMLElement {
  return el("div", { class: "auth-head" }, [
    el("p", { class: "brand", text: config.app.name }),
    el("h1", { text: title }),
    el("p", { text }),
  ]);
}

function choice(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  return el("button", {
    class: primary ? "button button-primary" : "button",
    attrs: { type: "button" },
    on: { click: onClick },
  }, [el("span", { text: label })]);
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
          location.href = `${locale.path}${location.hash}`;
        },
      },
    }, [el("span", { text: locale.label })]),
  ));
}

export function authScreen(app: App): HTMLElement {
  let step: Step = "landing";
  let server: string = config.homeserver.defaultBaseUrl;
  let discovery: Discovery | null = null;
  let error = "";
  let busy = false;
  let uia: { stages: UiaStage[]; session: string; username: string; password: string } | null = null;

  const card = el("div", { class: "auth-card" });
  const paint = (): void => {
    const nodes: (Node | null)[] = [];
    if (step === "landing") {
      nodes.push(
        head(t("auth.title"), t("app.tagline")),
        el("div", { class: "auth-choices" }, [
          choice(t("auth.signIn"), true, () => { step = "server"; paint(); }),
          choice(t("auth.signUp"), false, () => { step = "register"; paint(); }),
        ]),
      );
    } else if (step === "server") {
      const field = el("input", { class: "field", attrs: { value: server, autocomplete: "url", spellcheck: "false" } });
      field.addEventListener("input", () => { server = field.value; });
      nodes.push(
        head(t("auth.title"), t("auth.chooseServer")),
        el("form", { class: "auth-form" }, [
          labelled(t("auth.homeserver"), field),
          note(t("auth.chooseServerHint")),
          el("div", { class: "auth-actions" }, [
            choice(busy ? t("auth.discovering") : t("auth.continue"), true, () => void discover()),
          ]),
        ]),
      );
    } else if (step === "methods") {
      nodes.push(
        head(t("auth.title"), discovery?.baseUrl ?? server),
        el("div", { class: "auth-back" }, [el("button", {
          class: "link-button",
          attrs: { type: "button" },
          on: { click: () => { step = "server"; paint(); } },
        }, [el("span", { text: t("auth.changeServer") })])]),
      );
      if (discovery?.password) nodes.push(passwordForm());
      else nodes.push(note(discovery?.sso ? t("auth.ssoUnsupported") : t("auth.noPassword")));
      if (discovery?.registration) {
        nodes.push(el("div", { class: "auth-back" }, [
          choice(t("auth.createAccountAction"), false, () => { step = "register"; paint(); }),
        ]));
      }
    } else {
      nodes.push(...registerStep());
    }
    if (error) nodes.push(el("p", { class: "error-text", attrs: { role: "alert" }, text: error }));
    nodes.push(el("div", { class: "auth-foot" }, [languageSwitch()]));
    card.replaceChildren(...(nodes.filter((node): node is Node => node !== null)));
  };

  const discover = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    error = "";
    paint();
    try {
      discovery = await app.worker.send<Discovery>({ type: "discover", baseUrl: server });
      server = discovery.baseUrl;
      step = "methods";
    } catch {
      error = t("error.network");
    } finally {
      busy = false;
      paint();
    }
  };

  const signIn = (user: HTMLInputElement, password: HTMLInputElement): void => {
    if (busy) return;
    busy = true;
    error = "";
    paint();
    app.worker
      .send<Session>({ type: "login", baseUrl: server, user: user.value, password: password.value })
      .then(() => { busy = false; })
      .catch((cause: unknown) => {
        busy = false;
        const message = cause instanceof Error ? cause.message : "";
        error = /M_FORBIDDEN|Invalid password|Invalid username/.test(message) ? t("error.credentials") : message || t("error.network");
        paint();
      });
  };

  const passwordForm = (): HTMLElement => {
    const user = el("input", { class: "field", attrs: { name: "username", autocomplete: "username", required: "true" } });
    const password = el("input", { class: "field", attrs: { name: "password", type: "password", autocomplete: "current-password", required: "true" } });
    const form = el("form", { class: "auth-form" }, [
      labelled(t("auth.username"), user),
      labelled(t("auth.password"), password),
      el("div", { class: "auth-actions" }, [el("button", {
        class: "button button-primary",
        attrs: { type: "submit", disabled: busy },
      }, [el("span", { text: t("auth.signInAction") })])]),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      signIn(user, password);
    });
    return form;
  };

  const registerStep = (): (Node | null)[] => {
    const user = el("input", { class: "field", attrs: { name: "username", autocomplete: "username", required: "true" } });
    const password = el("input", { class: "field", attrs: { name: "password", type: "password", autocomplete: "new-password", required: "true" } });
    const confirm = el("input", { class: "field", attrs: { name: "confirm", type: "password", autocomplete: "new-password", required: "true" } });
    const serverField = el("input", { class: "field", attrs: { name: "server", autocomplete: "url", spellcheck: "false", value: server } });
    const token = el("input", { class: "field", attrs: { name: "token" } });
    const agree = el("input", { class: "checkbox", attrs: { type: "checkbox" } });
    const needs = (stage: UiaStage["stage"]): boolean => Boolean(uia?.stages.some((entry) => entry.stage === stage));

    const submit = (): void => {
      if (busy) return;
      if (password.value !== confirm.value) {
        error = t("auth.mismatch");
        paint();
        return;
      }
      busy = true;
      error = "";
      paint();
      const auth: Record<string, unknown> = {};
      if (uia) auth["session"] = uia.session;
      if (needs("dummy")) auth["type"] = "m.login.dummy";
      if (needs("terms")) {
        auth["type"] = "m.login.terms";
        if (!agree.checked) {
          busy = false;
          error = t("auth.terms");
          paint();
          return;
        }
      }
      if (needs("token") || token.value.trim()) {
        auth["type"] = "m.login.registration_token";
        auth["token"] = token.value.trim();
      }
      if (needs("password")) {
        auth["type"] = "m.login.password";
        auth["identifier"] = { type: "m.id.user", user: user.value };
        auth["password"] = password.value;
      }
      app.worker
        .send<{ session: Session | null; uia: UiaStage[] | null; uiaSession: string | null }>({
          type: "register",
          baseUrl: serverField.value,
          username: user.value,
          password: password.value,
          auth: Object.keys(auth).length > 0 ? auth : null,
          session: uia?.session ?? null,
        })
        .then((result) => {
          busy = false;
          if (result.uia && result.uia.length > 0) {
            uia = { stages: result.uia, session: result.uiaSession ?? "", username: user.value, password: password.value };
          }
          paint();
        })
        .catch((cause: unknown) => {
          busy = false;
          error = cause instanceof Error ? cause.message : t("error.unknown");
          paint();
        });
    };

    if (uia && uia.stages.length > 0) {
      return [
        head(t("auth.signUp"), t("auth.registerStep")),
        el("div", { class: "auth-form" }, [
          needs("terms") ? el("label", { class: "form-field" }, [
            el("span", { class: "field-label", text: t("auth.terms") }),
            agree,
          ]) : null,
          needs("token") ? labelled(t("auth.token"), token) : null,
          needs("password") ? note(t("auth.stagePassword")) : null,
          el("div", { class: "auth-actions" }, [choice(t("auth.continue"), true, submit)]),
        ]),
      ];
    }

    const form = el("form", { class: "auth-form" }, [
      labelled(t("auth.homeserver"), serverField),
      labelled(t("auth.username"), user),
      labelled(t("auth.password"), password),
      labelled(t("auth.confirm"), confirm),
      el("div", { class: "auth-actions" }, [el("button", {
        class: "button button-primary",
        attrs: { type: "submit", disabled: busy, ...(discovery && !discovery.registration ? { disabled: true } : {}) },
      }, [el("span", { text: t("auth.signUpAction") })])]),
      el("div", { class: "auth-back" }, [el("button", {
        class: "link-button",
        attrs: { type: "button" },
        on: { click: () => { step = "landing"; paint(); } },
      }, [el("span", { text: t("auth.switchToSignIn") })])]),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });
    return [head(t("auth.signUp"), t("auth.registerIntro")), form];
  };

  paint();
  return el("div", { class: "auth" }, [card]);
}

export function gateScreen(app: App): HTMLElement {
  const card = el("div", { class: "keygate-card" });
  const notice = el("p", { class: "error-text", attrs: { role: "alert" } });
  let busy = false;
  let newKey: string | null = null;

  const finish = (status: KeyStatus): void => {
    setState({ keys: status });
    void app.enter();
  };

  const paint = (): void => {
    const key = textField(t("gate.keyLabel"), "");
    const password = textField(t("gate.password"), "", "password");
    card.replaceChildren(
      el("div", { class: "auth-head" }, [
        el("p", { class: "brand", text: config.app.name }),
        el("h1", { text: t("gate.title") }),
        el("p", { text: t("gate.intro") }),
      ]),
      newKey
        ? el("div", { class: "keygate-key" }, [
            el("h2", { text: t("gate.newKey") }),
            el("code", { class: "recovery-key", text: newKey }),
            el("div", { class: "auth-actions" }, [
              choice(t("common.copy"), false, () => void copyText(newKey ?? "", t("toast.recoveryCopied"))),
              choice(t("gate.saved"), true, () => finish({ ready: true, backup: true })),
            ]),
            note(t("gate.newKeyHint")),
          ])
        : el("div", { class: "auth-form" }, [
            labelled(t("gate.keyLabel"), key),
            el("div", { class: "auth-actions" }, [
              choice(busy ? t("gate.unlocking") : t("gate.unlock"), true, () => void unlock(key.value)),
            ]),
            el("h2", { class: "auth-subhead", text: t("gate.resetTitle") }),
            note(t("gate.resetIntro")),
            labelled(t("gate.password"), password),
            el("div", { class: "auth-actions" }, [
              choice(t("gate.resetAction"), false, () => void reset(password.value)),
            ]),
          ]),
      notice,
      el("div", { class: "auth-foot" }, [
        el("button", {
          class: "link-button",
          attrs: { type: "button" },
          on: { click: () => void app.worker.send({ type: "logout" }) },
        }, [el("span", { text: t("gate.signOut") })]),
      ]),
    );
  };

  const unlock = async (value: string): Promise<void> => {
    if (busy) return;
    busy = true;
    notice.textContent = t("gate.unlocking");
    paint();
    try {
      finish(await app.worker.send<KeyStatus>({ type: "unlock", recoveryKey: value }));
    } catch (cause: unknown) {
      const code = cause instanceof Error ? cause.message : "";
      notice.textContent = code === "no-keys" ? t("gate.noKeys") : code === "restore" ? t("gate.restore") : t("gate.invalid");
    } finally {
      busy = false;
      paint();
    }
  };

  const reset = async (password: string): Promise<void> => {
    if (busy) return;
    busy = true;
    notice.textContent = t("gate.resetting");
    paint();
    try {
      const result = await app.worker.send<{ key: string; status: KeyStatus }>({ type: "resetKey", password });
      newKey = result.key;
      setState({ keys: result.status });
    } catch (cause: unknown) {
      notice.textContent = cause instanceof Error && cause.message === "uia" ? t("gate.uia") : t("gate.restore");
    } finally {
      busy = false;
      paint();
    }
  };

  paint();
  return el("div", { class: "keygate" }, [card]);
}
