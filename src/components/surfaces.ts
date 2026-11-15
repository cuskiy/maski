import { t } from "../lib/catalog.ts";
import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import type { ChatState } from "../core/types.ts";
import { config } from "../config.ts";
import { SURFACE } from "../core/regions.ts";
import { field, submit } from "../components/form.ts";
import { stickerPickerBody } from "../components/stickers.ts";
import { icons } from "../components/icons.ts";

function textForm(c: Catalog, id: string, labelKey: CatalogKey, submitKey: CatalogKey): Html {
  return html`<form class="form" method="post" data-surface="${id}">
    ${field({ id: `${id}-field`, label: t(c, labelKey), type: "text", autocomplete: "off", required: true })}
    ${submit(t(c, submitKey))}
  </form>`;
}

const REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀", "🙏", "💯", "🤔", "💔"] as const;
const MENU_ICONS = {
  "roomMenu.settings": icons.settings,
  "roomMenu.markRead": icons.check,
  "roomMenu.favorite": icons.star,
  "roomMenu.mute": icons.mute,
  "roomMenu.leave": icons.exit,
  "roomMenu.copyLink": icons.link,
  "messageMenu.reply": icons.reply,
  "messageMenu.react": icons.emoji,
  "messageMenu.edit": icons.compose,
  "messageMenu.delete": icons.trash,
  "messageMenu.cancel": icons.close,
  "messageMenu.retry": icons.send,
  "messageMenu.copy": icons.copy,
  "messageMenu.copyLink": icons.link,
  "messageMenu.select": icons.check,
} as const satisfies Record<string, Html>;

type MenuKey = keyof typeof MENU_ICONS;

function checked(value: boolean): Html {
  return value ? html` checked` : html``;
}

function disabled(value: boolean): Html {
  return value ? html` disabled` : html``;
}

export function surfaceBodyFor(c: Catalog, id: string, state: ChatState): Html {
  switch (id) {
    case SURFACE.search:
      return html`${textForm(c, "search", "surface.search.label", "surface.search.submit")}
        <div class="search-results" data-search-results aria-live="polite"></div>`;
    case SURFACE.newMessage:
      return textForm(c, "new-message", "surface.newMessage.label", "surface.newMessage.submit");
    case SURFACE.join:
      return textForm(c, "join", "surface.join.label", "surface.join.submit");
    case SURFACE.create:
      return html`<form class="form" method="post" data-surface="create">
        ${field({ id: "create-name", label: t(c, "surface.create.name"), type: "text", autocomplete: "off", required: true })}
        ${field({ id: "create-topic", label: t(c, "surface.create.topic"), type: "text", autocomplete: "off" })}
        ${submit(t(c, "surface.create.submit"))}
      </form>`;
    case SURFACE.invite:
      return inviteBody(c, state);
    case SURFACE.settings:
      return settingsBody(c, state);
    case SURFACE.roomSettings:
      return roomSettingsBody(c, state);
    case SURFACE.roomMenu:
      return menu(c, [
        "roomMenu.settings",
        "roomMenu.markRead",
        "roomMenu.favorite",
        "roomMenu.mute",
        "roomMenu.leave",
        "roomMenu.copyLink",
      ]);
    case SURFACE.messageMenu:
      return menu(c, [
        "messageMenu.reply",
        "messageMenu.react",
        "messageMenu.edit",
        "messageMenu.delete",
        "messageMenu.cancel",
        "messageMenu.retry",
        "messageMenu.copy",
        "messageMenu.copyLink",
        "messageMenu.select",
      ]);
    case SURFACE.profile:
      return html`<p class="note">${t(c, "surface.profile.empty")}</p>`;
    case SURFACE.confirm:
      return html`<p class="note" data-confirm-message></p>
        <div class="confirm-actions">
          <button class="button-quiet" type="button" data-confirm="cancel">${t(c, "confirm.cancel")}</button>
          <button class="button-primary" type="button" data-confirm="ok">${t(c, "confirm.ok")}</button>
        </div>`;
    case SURFACE.viewer:
      return html`<p class="note">${t(c, "surface.viewer.empty")}</p>`;
    case SURFACE.forward: {
      const rooms = state.rooms.filter((room) => !room.isSpace);
      if (rooms.length === 0) return html`<p class="note">${t(c, "surface.forward.empty")}</p>`;
      return html`<p class="note">${t(c, "surface.forward.hint")}</p>
        <div class="forward-list">
          ${rooms.map(
            (room) => html`<button class="forward-room" type="button" data-forward-room="${room.roomId}">
              <span class="forward-avatar" aria-hidden="true"
                >${room.avatar === null ? room.name.slice(0, 1) : html`<img src="${room.avatar}" alt="" />`}</span
              >
              <span class="forward-copy">
                <span class="forward-name">${room.name}</span>
                <span class="forward-topic">${room.topic}</span>
              </span>
            </button>`,
          )}
        </div>`;
    }
    case SURFACE.attach:
      return html`<div class="surface-menu">
          <button class="surface-item" type="button" data-attach="image">
            ${icons.image}<span>${t(c, "surface.attach.image")}</span>
          </button>
          <button class="surface-item" type="button" data-attach="video">
            ${icons.video}<span>${t(c, "surface.attach.video")}</span>
          </button>
          <button class="surface-item" type="button" data-attach="file">
            ${icons.file}<span>${t(c, "surface.attach.file")}</span>
          </button>
        </div>
        <input
          id="surface-attach-input"
          class="visually-hidden"
          type="file"
          multiple
          tabindex="-1"
          aria-label="${t(c, "composer.attach")}"
        />`;
    case SURFACE.sticker:
      return state.phase === "boot"
        ? html`<div class="sticker-picker"></div>`
        : stickerPickerBody(c, state.recentStickers);
    case SURFACE.emoji:
      return html`<div class="emoji-picker" data-emoji-picker></div>`;
    case SURFACE.reaction:
      return html`<div class="reaction-picker">
        <div class="reaction-grid">
          ${REACTIONS.map(
            (reaction) =>
              html`<button
                class="surface-item reaction-choice"
                type="button"
                data-react-choice="${reaction}"
                aria-label="${reaction}"
              >
                ${reaction}
              </button>`,
          )}
        </div>
      </div>`;
    case SURFACE.sendMenu:
      return html`<div class="surface-menu">
        <button class="surface-item" type="button" data-send="text">
          ${icons.compose}<span>${t(c, "surface.sendText")}</span>
        </button>
        <button class="surface-item" type="button" data-send="markdown">
          ${icons.file}<span>${t(c, "surface.sendMarkdown")}</span>
        </button>
      </div>`;
    default:
      return html``;
  }
}

function settingsTabs(
  c: Catalog,
  labelKey: CatalogKey,
  items: ReadonlyArray<{ readonly href: string; readonly key: CatalogKey }>,
): Html {
  return html`<nav class="settings-tabs" aria-label="${t(c, labelKey)}">${items.map((item) => html`<a href="${item.href}">${t(c, item.key)}</a>`)}</nav>`;
}

function settingsBody(c: Catalog, state: ChatState): Html {
  const session = state.session;
  const capabilities = session?.capabilities ?? null;
  return html`<div class="settings-layout">
    ${settingsTabs(c, "surface.settings", [
      { href: "#settings-account", key: "settings.account" },
      { href: "#settings-notifications", key: "settings.notifications" },
      { href: "#settings-security", key: "settings.security" },
      { href: "#settings-about", key: "settings.about" },
    ])}
    <div class="settings-panels">
    <section class="surface-section" id="settings-account">
      <h3>${t(c, "settings.account")}</h3>
      ${
        session === null
          ? html`<p class="note">${t(c, "settings.signedOut")}</p>`
          : html`<div class="profile-line">
                <span class="profile-avatar" aria-hidden="true">${session.displayName.slice(0, 1)}</span>
                <div class="profile-text">
                  <strong>${session.displayName}</strong>
                  <p class="note">${session.userId}</p>
                </div>
              </div>
              ${
                capabilities?.signOut === true
                  ? html`<button class="button-quiet" type="button" data-settings-action="logout">
                    ${t(c, "settings.logout")}
                  </button>`
                  : html``
              }`
      }
    </section>
    <section class="surface-section" id="settings-notifications">
      <h3>${t(c, "settings.notifications")}</h3>
      <label class="setting-row"
        ><span>${t(c, "settings.badge")}</span><input type="checkbox" data-setting="badge"
          ${checked(state.notifications.badge)} /></label
      >
      <label class="setting-row"
        ><span>${t(c, "settings.titleTotal")}</span><input type="checkbox" data-setting="titleTotal"
          ${checked(state.notifications.titleTotal)} /></label
      >
      <label class="setting-row"
        ><span>${t(c, "settings.desktop")}</span><input type="checkbox" data-setting="desktop"
          ${checked(state.notifications.desktop)} /></label
      >
      <label class="setting-row"
        ><span>${t(c, "settings.preview")}</span><input type="checkbox" data-setting="preview"
          ${checked(state.notifications.preview)} /></label
      >
      <p class="note">${t(c, "settings.desktopHint")}</p>
    </section>
    <section class="surface-section" id="settings-security">
      <h3>${t(c, "settings.security")}</h3>
      <div class="setting-row">
        <span>${t(c, "settings.recovery")}</span>
        <span class="setting-value" data-setting-value="recovery"
          >${t(c, state.recoveryKey === null ? "settings.recoveryNotSet" : "settings.recoveryShown")}</span
        >
      </div>
      ${
        capabilities?.recoveryKey === true
          ? html`<button class="button-quiet" type="button" data-settings-action="recovery">
            ${t(c, "settings.recoveryShow")}
          </button>`
          : html``
      }
      <div class="key-reveal" data-region="recovery-key" hidden>
        <p class="note">${t(c, "settings.recoveryOnce")}</p>
        <p class="key-out" data-field="recovery-value"></p>
        <div class="key-actions">
          ${
            capabilities?.recoveryKey === true
              ? html`<button class="button-quiet" type="button" data-settings-action="copy-recovery">
                ${t(c, "settings.copy")}
              </button>`
              : html``
          }
          ${
            capabilities?.recoveryKey === true
              ? html`<button class="button-quiet" type="button" data-settings-action="download-recovery">
                ${t(c, "settings.download")}
              </button>`
              : html``
          }
        </div>
      </div>
      <div class="setting-row">
        <span>${t(c, "settings.backup")}</span>
        <span class="setting-value" data-setting-value="backup">${t(c, "settings.off")}</span>
      </div>
      ${
        capabilities?.backup === true
          ? html`<button class="button-quiet" type="button" data-settings-action="backup">
            ${t(c, "settings.backupSetup")}
          </button>`
          : html``
      }
      <h3>${t(c, "settings.sessions")}</h3>
      ${
        state.devices.length === 0
          ? html`<p class="note">${t(c, "settings.devicesEmpty")}</p>`
          : html`<ul class="session-list" role="list">
              ${state.devices.map(
                (device) => html`<li class="session-row" data-device-id="${device.id}">
                  <span>${device.name}${device.current ? html` · ${t(c, "settings.deviceCurrent")}` : html``}</span>
                  <span class="session-state">${t(c, device.verified ? "settings.verified" : "settings.notVerified")}</span>
                  ${
                    device.capabilities.verify
                      ? html`<button
                          class="button-quiet"
                          type="button"
                          data-settings-action="verify-device"
                          data-device-id="${device.id}"
                        >
                          ${t(c, "settings.verify")}
                        </button>`
                      : html``
                  }
                  ${
                    device.capabilities.signOut
                      ? html`<button
                          class="button-quiet"
                          type="button"
                          data-settings-action="sign-out-device"
                          data-device-id="${device.id}"
                        >
                          ${t(c, "settings.signOut")}
                        </button>`
                      : html``
                  }
                </li>`,
              )}
            </ul>`
      }
      ${
        capabilities?.signOutOthers === true
          ? html`<button class="button-quiet" type="button" data-settings-action="sign-out-others">
            ${t(c, "settings.signOutOthers")}
          </button>`
          : html``
      }
    </section>
    <section class="surface-section" id="settings-about">
      <h3>${t(c, "settings.about")}</h3>
      <p class="setting-line"><span>${t(c, "settings.version")}</span><span>${config.app.version}</span></p>
      <p class="setting-line"><a class="link" href="${config.app.source}">${t(c, "settings.source")}</a></p>
      <p class="setting-line"><span>${t(c, "settings.license")}</span><span>${t(c, "settings.licenseValue")}</span></p>
      <p class="note">${t(c, "settings.privacy")}</p>
    </section>
    </div>
  </div>`;
}

function roomSettingsBody(c: Catalog, state: ChatState): Html {
  const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
  const capabilities = room?.capabilities ?? null;
  const encryption =
    room?.encryption === "encrypted"
      ? "roomSettings.encrypted"
      : room?.encryption === "none"
        ? "roomSettings.encryptionNone"
        : "roomSettings.encryptionUnknown";
  return html`<div class="settings-layout">
    ${settingsTabs(c, "surface.roomSettings", [
      { href: "#room-settings-overview", key: "roomSettings.overview" },
      { href: "#room-settings-members", key: "roomSettings.members" },
      { href: "#room-settings-notifications", key: "roomSettings.notifications" },
    ])}
    <div class="settings-panels">
    <section class="surface-section" id="room-settings-overview">
      <h3>${t(c, "roomSettings.overview")}</h3>
      <p class="setting-line">
        <span>${t(c, "roomSettings.topic")}</span><span data-room-topic>${room?.topic ?? ""}</span>
      </p>
      <p class="setting-line">
        <span>${t(c, "roomSettings.encryption")}</span><span data-room-encryption>${t(c, encryption)}</span>
      </p>
      ${
        capabilities !== null && !capabilities.manage
          ? html`<p class="note">${t(c, "roomSettings.readOnly")}</p>`
          : html``
      }
      ${
        capabilities?.leave === true
          ? html`<button class="button-quiet is-danger" type="button" data-action="roomSettings.leave">
            ${t(c, "roomSettings.leave")}
          </button>`
          : html``
      }
    </section>
    <section class="surface-section" id="room-settings-members">
      <h3>${t(c, "roomSettings.members")}</h3>
      ${
        state.members.length === 0
          ? html`<p class="note">${t(c, "roomSettings.membersEmpty")}</p>`
          : html`<ul class="member-list" role="list">
              ${state.members.map(
                (member) => html`<li class="member-row">
                  <button
                    class="member"
                    type="button"
        commandfor="${SURFACE.profile}"
        command="show-modal"
        data-profile="${member.displayName}"
                    data-profile-id="${member.userId}"
                  >
                    <span class="profile-avatar" aria-hidden="true">${member.displayName.slice(0, 1)}</span>
                    <span>${member.displayName}</span>
                  </button>
                </li>`,
              )}
            </ul>`
      }
    </section>
    <section class="surface-section" id="room-settings-notifications">
      <h3>${t(c, "roomSettings.notifications")}</h3>
      <label class="field">
        <span class="field-label">${t(c, "roomSettings.notifications")}</span>
        <select class="input" data-room-notifications ${disabled(capabilities === null || !capabilities.notifications)}>
          <option value="all" ${room?.notification === "all" ? html` selected` : html``}>
            ${t(c, "roomSettings.allMessages")}
          </option>
          <option value="mentions" ${room?.notification === "mentions" ? html` selected` : html``}>
            ${t(c, "roomSettings.mentions")}
          </option>
          <option value="mute" ${room?.notification === "mute" ? html` selected` : html``}>
            ${t(c, "roomSettings.mute")}
          </option>
        </select>
      </label>
    </section>
    </div>
  </div>`;
}

function inviteBody(c: Catalog, state: ChatState): Html {
  if (state.invites.length === 0) return html`<p class="note">${t(c, "surface.invite.empty")}</p>`;
  return html`<ul class="invite-list" role="list">
    ${state.invites.map(
      (invite) => html`<li class="invite-row">
        <div class="invite-text">
          <strong>${invite.name}</strong>
          <p class="note">${invite.topic}</p>
          <p class="note">${t(c, "surface.invite.from", { name: invite.inviter })}</p>
        </div>
        <div class="invite-actions">
          ${
            invite.capabilities.accept
              ? html`<button
                  class="button-primary"
                  type="button"
                  data-invite-action="accept"
                  data-room-id="${invite.roomId}"
                >
                  ${t(c, "surface.invite.accept")}
                </button>`
              : html``
          }
          ${
            invite.capabilities.decline
              ? html`<button
                  class="button-quiet"
                  type="button"
                  data-invite-action="decline"
                  data-room-id="${invite.roomId}"
                >
                  ${t(c, "surface.invite.decline")}
                </button>`
              : html``
          }
        </div>
      </li>`,
    )}
  </ul>`;
}

function menu(c: Catalog, keys: ReadonlyArray<MenuKey>): Html {
  return html`<div class="surface-menu">
    ${keys.map((key) => {
      const declarative = key === "roomMenu.settings";
      const action = declarative
        ? html` commandfor="${SURFACE.roomSettings}" command="show-modal"`
        : html` data-action="${key}"`;
      return html`<button class="surface-item" type="button" ${action}>
        ${MENU_ICONS[key]}<span>${t(c, key)}</span>
      </button>`;
    })}
  </div>`;
}
