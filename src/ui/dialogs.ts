import type { App } from "../app/app.ts";
import { config } from "../app/config.ts";
import type { Member, RoomSummary } from "../core/types.ts";
import { fileSize, setLocale, t } from "../i18n/index.ts";
import { activeRoom } from "../store/select.ts";
import { setState, state } from "../store/state.ts";
import { el, icon, ICON } from "./dom.ts";
import { avatar } from "./media.ts";
import { closeIcon, copyText, toast } from "./overlay.ts";
import { safeMessageHtml } from "./sanitize.ts";

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

export function showDialog(app: App, name: string, arg?: string): void {
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

  const desktop = el("div", { class: "setting-value" }, [
    el("span", { class: "status-text", text: desktopStatus() }),
    button(t("settings.enable"), () => {
      void Notification.requestPermission().then((permission) => {
        const on = permission === "granted";
        void app.local.saveSettings({ desktop: on }).then((settings) => {
          setState({ settings });
          desktop.replaceChildren(el("span", { class: "status-text", text: desktopStatus() }));
        });
      });
    }),
  ]);

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
      el("p", { class: "dialog-note", text: t("settings.previewHint") }),
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("settings.security") }),
      row(t("settings.securityDevice"), el("span", { class: "status-text", text: state.keys?.ready ? t("settings.securityReady") : t("settings.securityMissing") })),
      row(t("settings.securityBackup"), el("span", { class: "status-text", text: state.keys?.backup ? t("settings.securityReady") : t("settings.securityMissing") })),
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
  const canEdit = room.membership === "join";
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
    const hits = await searchLocal(app, query);
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
              app.openRoom(hit.roomId);
            },
          },
        }, [
          el("span", { class: "search-room", text: state.rooms.get(hit.roomId)?.name ?? hit.roomId }),
          el("span", { class: "search-text", text: hit.body }),
        ]),
      ),
    );
  };
  shell(t("search.title"), el("div", { class: "dialog-sections" }, [input, results]), app);
  requestAnimationFrame(() => input.focus());
}

async function searchLocal(app: App, query: string): Promise<{ roomId: string; body: string }[]> {
  const rooms = [...state.rooms.values()].filter((room) => room.membership === "join");
  const output: { roomId: string; body: string }[] = [];
  for (const room of rooms) {
    const messages = await app.local.window(room.roomId, 2000);
    for (const message of messages) {
      if (!message.body || message.kind === "state" || message.kind === "error") continue;
      if (!message.body.toLowerCase().includes(query.toLowerCase())) continue;
      output.push({ roomId: room.roomId, body: message.body });
      if (output.length >= config.limits.search) return output;
    }
  }
  return output;
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

export type { RoomSummary, safeMessageHtml, fileSize, icon, ICON };
