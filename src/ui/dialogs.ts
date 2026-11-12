import type { App } from "../app/app.ts";
import { config } from "../app/config.ts";
import type { Member, Message } from "../core/types.ts";
import { setLocale, t, timeOfDay } from "../i18n/index.ts";
import { activeRoom } from "../store/select.ts";
import { setState, state, subscribe } from "../store/state.ts";
import { el } from "./dom.ts";
import { avatar } from "./media.ts";
import { closeIcon, copyText, toast } from "./overlay.ts";

let current: HTMLDialogElement | null = null;

export function closeDialog(): void {
  const dialog = current;
  current = null;
  if (dialog) {
    dialog.close();
    dialog.remove();
  }
}

function shell(title: string, body: HTMLElement, app: App, footer?: HTMLElement): HTMLDialogElement {
  closeDialog();
  const dialog = el("dialog", { class: "dialog" }, [
    el("header", { class: "dialog-head" }, [el("h1", { class: "dialog-title", text: title }), closeIcon(() => app.closeDialog(), t("common.close"))]),
    el("div", { class: "dialog-body" }, [body]),
    ...(footer ? [el("footer", { class: "dialog-foot" }, [footer])] : []),
  ]);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    app.closeDialog();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  current = dialog;
  return dialog;
}

function row(label: string, ...children: (Node | string)[]): HTMLElement {
  return el("div", { class: "setting-row" }, [el("span", { class: "setting-label", text: label }), el("div", { class: "setting-value" }, children)]);
}

function restoreKeys(app: App): HTMLElement {
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

function securitySection(app: App): HTMLElement {
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

function uploadButton(label: string, onFile: (file: File) => Promise<void>): HTMLElement {
  const input = el("input", { attrs: { type: "file", accept: "image/*", hidden: true } });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void onFile(file).catch(() => toast(t("error.upload")));
  });
  return el("span", { class: "inline-form" }, [
    el("button", { class: "button", attrs: { type: "button" }, on: { click: () => input.click() } }, [el("span", { text: label })]),
    input,
  ]);
}

function desktopStatus(): string {
  if (typeof Notification === "undefined") return t("settings.desktopUnsupported");
  if (Notification.permission === "granted") return t("settings.desktopOn");
  if (Notification.permission === "denied") return t("settings.desktopDenied");
  return t("settings.desktopOff");
}

function textField(label: string, value: string, type = "text"): HTMLInputElement {
  const input = el("input", { class: "field", attrs: { type, value, "aria-label": label } });
  return input;
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  return el("button", { class: `button${primary ? " button-primary" : ""}`, attrs: { type: "button" }, on: { click: onClick } }, [el("span", { text: label })]);
}

const DIALOGS = new Set(["settings", "room-settings", "profile", "search", "join", "create", "new-message"]);

export function showDialog(app: App, name: string, arg?: string): void {
  if (!DIALOGS.has(name)) return;
  setState({ dialog: name });
  switch (name) {
    case "settings":
      settingsDialog(app);
      return;
    case "room-settings":
      roomSettingsDialog(app, arg ?? state.activeRoomId ?? "");
      return;
    case "profile":
      profileDialog(app, arg ?? "");
      return;
    case "search":
      searchDialog(app);
      return;
    case "join":
      joinDialog(app);
      return;
    case "create":
      createDialog(app);
      return;
    case "new-message":
      newMessageDialog(app);
      return;
    default:
      return;
  }
}

function settingsDialog(app: App): void {
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
  shell(t("settings.title"), body, app);
}

function roomSettingsDialog(app: App, roomId: string): void {
  const room = state.rooms.get(roomId) ?? activeRoom();
  if (!room) return;
  const nameInput = textField(t("roomSettings.name"), room.name);
  const topicInput = textField(t("roomSettings.topic"), room.topic);
  const members = el("div", { class: "member-list" }, [el("p", { class: "dialog-note", text: t("common.loading") })]);
  const canEdit = room.membership === "join" && room.myPower >= 50;
  void app.worker.send<{ members: Member[] }>({ type: "members", roomId }).then((result) => {
    const sorted = result.members.toSorted((a, b) => b.power - a.power || a.name.localeCompare(b.name));
    members.replaceChildren(
      ...sorted.map((member) =>
        el("div", { class: "member-row" }, [
          avatar(member.avatar, member.name, 32),
          el("span", { class: "member-name", text: member.name }),
          member.power >= 100 ? el("span", { class: "tag", text: t("profile.admin") }) : member.power >= 50 ? el("span", { class: "tag", text: t("profile.moderator") }) : null,
        ]),
      ),
    );
  }).catch(() => {
    members.replaceChildren(el("p", { class: "dialog-note", text: t("error.network") }));
  });

  const inviteField = textField(t("roomSettings.invite"), "@user:server");
  const body = el("div", { class: "dialog-sections" }, [
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("roomSettings.general") }),
      row(t("roomSettings.avatar"), el("div", { class: "setting-value" }, [
        avatar(room.avatar, room.name, 40),
        canEdit
          ? uploadButton(t("settings.changeAvatar"), async (file) => {
              const data = await file.arrayBuffer();
              await app.worker.send({ type: "uploadRoomAvatar", roomId, data, mime: file.type || "image/png" });
              toast(t("toast.saved"));
            })
          : el("span"),
      ])),
      canEdit ? row(t("roomSettings.name"), nameInput) : row(t("roomSettings.name"), el("span", { class: "status-text", text: room.name })),
      canEdit ? row(t("roomSettings.topic"), topicInput) : row(t("roomSettings.topic"), el("span", { class: "status-text", text: room.topic || "—" })),
      canEdit
        ? el("div", { class: "dialog-actions" }, [
            button(t("common.save"), () => {
              void app.worker.send({ type: "setRoomState", roomId, name: nameInput.value, topic: topicInput.value }).then(() => toast(t("toast.saved")));
            }, true),
          ])
        : el("p", { class: "dialog-note", text: t("roomSettings.noPermission") }),
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("roomSettings.encryption") }),
      el("p", { class: "dialog-note", text: room.encrypted ? t("roomSettings.encryptionOn") : t("roomSettings.encryptionOff") }),
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("roomSettings.members") }),
      el("div", { class: "inline-form" }, [
        inviteField,
        button(t("roomSettings.inviteAction"), () => {
          const userId = inviteField.value.trim();
          if (!userId) return;
          void app.worker.send({ type: "invite", roomId, userId }).then(() => toast(t("toast.invited")));
        }),
      ]),
      members,
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("roomSettings.notifications") }),
      row(t("menu.mute"), button(room.muted ? t("menu.unmute") : t("menu.mute"), () => {
        void app.worker.send({ type: "mute", roomId, on: !room.muted });
      })),
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("roomSettings.leave") }),
      el("p", { class: "dialog-note", text: t("roomSettings.leaveConfirm") }),
      el("div", { class: "dialog-actions" }, [
        button(t("roomSettings.leave"), () => {
          void app.worker.send({ type: "leave", roomId }).then(() => {
            app.closeDialog();
            app.openRoom("");
            toast(t("toast.left"));
          });
        }),
      ]),
    ]),
  ]);
  shell(t("roomSettings.title"), body, app);
}

function profileDialog(app: App, userId: string): void {
  const session = state.session;
  const room = activeRoom();
  if (!userId) return;
  void app.local.members(room?.roomId ?? "").then((members) => {
    const member = members.find((entry) => entry.userId === userId) ?? null;
    const name = member?.name ?? userId;
    const body = el("div", { class: "profile-dialog" }, [
      avatar(member?.avatar ?? null, name, 72),
      el("h2", { class: "profile-name", text: name }),
      el("button", {
        class: "link-button mono",
        attrs: { type: "button" },
        on: { click: () => void copyText(userId, t("toast.copied")) },
      }, [el("span", { text: userId })]),
      member && member.power >= 100 ? el("span", { class: "tag", text: t("profile.admin") }) : member && member.power >= 50 ? el("span", { class: "tag", text: t("profile.moderator") }) : null,
      userId !== session?.userId
        ? el("div", { class: "dialog-actions" }, [
            button(t("profile.message"), () => {
              void app.worker.send<{ roomId: string }>({ type: "direct", userId }).then((result) => {
                app.closeDialog();
                app.openRoom(result.roomId);
              });
            }, true),
            button(t("profile.copyId"), () => void copyText(userId, t("toast.copied"))),
          ])
        : null,
    ]);
    shell(t("profile.title"), body, app);
  });
}

function searchDialog(app: App): void {
  const input = el("input", { class: "field", attrs: { type: "search", placeholder: t("search.placeholder"), "aria-label": t("search.title") } });
  const results = el("div", { class: "search-results" }, [el("p", { class: "dialog-note", text: t("search.empty") })]);
  let timer = 0;
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void run(input.value.trim()), 160);
  });
  const run = async (query: string): Promise<void> => {
    if (!query) {
      results.replaceChildren(el("p", { class: "dialog-note", text: t("search.empty") }));
      return;
    }
    const result = await app.worker.send<{ hits: { roomId: string; message: Message }[] }>({ type: "search", query, roomId: null });
    const hits = result.hits;
    if (hits.length === 0) {
      results.replaceChildren(el("p", { class: "dialog-note", text: t("search.noResults") }));
      return;
    }
    results.replaceChildren(
      el("p", { class: "dialog-note", text: t("search.results", { n: hits.length }) }),
      ...hits.map((hit) =>
        el("button", {
          class: "search-row",
          attrs: { type: "button" },
          on: {
            click: () => {
              app.closeDialog();
              app.openRoom(hit.roomId, hit.message.id);
            },
          },
        }, [
          el("span", { class: "search-room", text: `${state.rooms.get(hit.roomId)?.name ?? hit.roomId} · ${timeOfDay(hit.message.ts)}` }),
          el("span", { class: "search-text", text: hit.message.body }),
        ]),
      ),
    );
  };
  shell(t("search.title"), el("div", { class: "dialog-sections" }, [input, results]), app);
  requestAnimationFrame(() => input.focus());
}

function joinDialog(app: App): void {
  const target = textField(t("join.title"), "", "text");
  target.placeholder = t("join.placeholder");
  shell(t("join.title"), el("div", { class: "dialog-sections" }, [
    target,
    el("div", { class: "dialog-actions" }, [
      button(t("join.action"), () => {
        void app.worker.send<{ roomId: string }>({ type: "join", target: target.value.trim() }).then((result) => {
          app.closeDialog();
          app.openRoom(result.roomId);
          toast(t("toast.joined"));
        }).catch(() => toast(t("error.notFound")));
      }, true),
    ]),
  ]), app);
  requestAnimationFrame(() => target.focus());
}

function createDialog(app: App): void {
  const name = textField(t("create.name"), "");
  const topic = textField(t("create.topic"), "");
  const invites = textField(t("create.invites"), "");
  const isPublic = el("input", { attrs: { type: "checkbox" } });
  const encrypted = el("input", { attrs: { type: "checkbox", checked: true } });
  shell(t("create.title"), el("div", { class: "dialog-sections" }, [
    row(t("create.name"), name),
    row(t("create.topic"), topic),
    row(t("create.public"), isPublic),
    row(t("create.encrypt"), encrypted),
    el("p", { class: "dialog-note", text: t("create.encryptHint") }),
    row(t("create.invites"), invites),
    el("div", { class: "dialog-actions" }, [
      button(t("create.action"), () => {
        void app.worker.send<{ roomId: string }>({
          type: "create",
          name: name.value.trim(),
          topic: topic.value.trim(),
          isPublic: isPublic.checked,
          encrypted: encrypted.checked,
          invites: invites.value.split(",").map((entry) => entry.trim()).filter(Boolean),
        }).then((result) => {
          app.closeDialog();
          app.openRoom(result.roomId);
          toast(t("toast.created"));
        }).catch(() => toast(t("error.forbidden")));
      }, true),
    ]),
  ]), app);
  requestAnimationFrame(() => name.focus());
}

function newMessageDialog(app: App): void {
  const userId = textField(t("newMessage.placeholder"), "@user:server");
  shell(t("newMessage.title"), el("div", { class: "dialog-sections" }, [
    userId,
    el("div", { class: "dialog-actions" }, [
      button(t("newMessage.action"), () => {
        void app.worker.send<{ roomId: string }>({ type: "direct", userId: userId.value.trim() }).then((result) => {
          app.closeDialog();
          app.openRoom(result.roomId);
        }).catch(() => toast(t("error.unknown")));
      }, true),
    ]),
  ]), app);
  requestAnimationFrame(() => userId.focus());
}
