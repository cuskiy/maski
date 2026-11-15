import { t } from "../lib/catalog.ts";
import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { formatBytes } from "../lib/bytes.ts";
import type { ChatState, Member, MemberMembership, MessageRow, RoomJoinRule, RoomSummary } from "../core/types.ts";
import { config } from "../config.ts";
import { SURFACE } from "../core/regions.ts";
import { field, selectField, submit } from "../components/form.ts";
import { surfaceHead } from "./surface.ts";
import { stickerPickerBody } from "../components/stickers.ts";
import { icons } from "../components/icons.ts";
import { LICENSES } from "../core/licenses.ts";
import { sasDialog } from "./sas.ts";

function textForm(c: Catalog, id: string, labelKey: CatalogKey, submitKey: CatalogKey): Html {
  return html`<form class="form" method="post" data-surface="${id}">
    ${field({ id: `${id}-field`, label: t(c, labelKey), type: "text", autocomplete: "off", required: true })}
    ${submit(t(c, submitKey))}
  </form>`;
}

const MENU_ICONS = {
  "roomMenu.settings": icons.settings,
  "roomMenu.markRead": icons.check,
  "roomMenu.favorite": icons.star,
  "roomMenu.mute": icons.mute,
  "roomMenu.leave": icons.exit,
  "roomMenu.mediaFiles": icons.image,
  "roomMenu.search": icons.search,
  "roomMenu.invite": icons.invite,
  "spaceMenu.settings": icons.settings,
  "spaceMenu.leave": icons.exit,
  "messageMenu.reply": icons.reply,
  "messageMenu.react": icons.emoji,
  "messageMenu.edit": icons.compose,
  "messageMenu.delete": icons.trash,
  "messageMenu.cancel": icons.close,
  "messageMenu.retry": icons.send,
  "messageMenu.copy": icons.copy,
  "messageMenu.copyLink": icons.link,
  "messageMenu.source": icons.code,
  "messageMenu.select": icons.check,
  "selection.copy": icons.copy,
  "selection.forward": icons.share,
  "selection.delete": icons.trash,
} as const satisfies Record<string, Html>;

type MenuKey = keyof typeof MENU_ICONS;

export function mediaFilesBody(c: Catalog, messages: readonly MessageRow[]): Html {
  const media = messages.filter(
    (message) => message.media !== null && (message.media.kind === "image" || message.media.kind === "video"),
  );
  const files = messages.filter(
    (message) => message.media !== null && (message.media.kind === "file" || message.media.kind === "audio"),
  );
  return html`<div class="media-files" data-media-files>
    <div class="media-files-tabs" role="tablist" aria-label="${t(c, "surface.mediaFiles")}">
      <button
        class="media-files-tab"
        type="button"
        role="tab"
        id="media-files-tab-media"
        aria-controls="media-files-panel-media"
        aria-selected="true"
        data-media-files-tab="media"
      >
        ${t(c, "surface.mediaFiles.medias")}
      </button>
      <button
        class="media-files-tab"
        type="button"
        role="tab"
        id="media-files-tab-files"
        aria-controls="media-files-panel-files"
        aria-selected="false"
        tabindex="-1"
        data-media-files-tab="files"
      >
        ${t(c, "surface.mediaFiles.files")}
      </button>
    </div>
    <div
      class="media-files-panel"
      id="media-files-panel-media"
      role="tabpanel"
      aria-labelledby="media-files-tab-media"
      data-media-files-panel="media"
    >
      ${
        media.length === 0
          ? html`<p class="note">${t(c, "surface.mediaFiles.empty")}</p>`
          : html`<div class="media-files-grid">
              ${media.map(
                (message) =>
                  html`<button
                    class="media-file is-${message.media?.kind ?? "image"}"
                    type="button"
                    data-media-open="${message.media?.name ?? ""}"
                    data-media-kind="${message.media?.kind ?? "image"}"
                    ${
                      message.media?.url === null || message.media?.url === undefined
                        ? html``
                        : html` data-media-url="${message.media.url}"`
                    }
                    commandfor="${SURFACE.viewer}"
                    command="show-modal"
                    aria-label="${message.media?.name ?? ""}"
                  >
                    ${
                      message.media?.kind === "image" && message.media.url !== null
                        ? html`<img src="${message.media.url}" alt="" loading="lazy" decoding="async" />`
                        : message.media?.kind === "video"
                          ? icons.video
                          : icons.image
                    }
                  </button>`,
              )}
            </div>`
      }
    </div>
    <div
      class="media-files-panel"
      id="media-files-panel-files"
      role="tabpanel"
      aria-labelledby="media-files-tab-files"
      data-media-files-panel="files"
      hidden
    >
      ${
        files.length === 0
          ? html`<p class="note">${t(c, "surface.mediaFiles.empty")}</p>`
          : html`<div class="media-files-list">
              ${files.map(
                (message) => html`<button
                  class="media-file-row"
                  type="button"
                  data-media-open="${message.media?.name ?? ""}"
                  data-media-kind="${message.media?.kind ?? "file"}"
                  commandfor="${SURFACE.viewer}"
                  command="show-modal"
                >
                  ${message.media?.kind === "audio" ? icons.audio : icons.file}
                  <span class="media-file-name" dir="auto">${message.media?.name ?? ""}</span>
                  <span class="media-file-meta"
                    >${t(c, message.media?.kind === "audio" ? "chat.media.audio" : "chat.media.file")}
                    ${formatBytes(message.media?.size ?? null)}</span
                  >
                </button>`,
              )}
            </div>`
      }
    </div>
  </div>`;
}

function checked(value: boolean): Html {
  return value ? html` checked` : html``;
}

const JOIN_RULE_KEYS: Readonly<Record<RoomJoinRule, CatalogKey>> = {
  public: "roomSettings.joinRulePublic",
  invite: "roomSettings.joinRuleInvite",
  knock: "roomSettings.joinRuleKnock",
  restricted: "roomSettings.joinRuleRestricted",
};

const MEMBERSHIP_LABELS: Readonly<Record<MemberMembership, CatalogKey>> = {
  join: "roomSettings.members",
  invite: "roomSettings.invited",
  ban: "roomSettings.banned",
};

function memberMenu(c: Catalog, room: RoomSummary, member: Member, state: ChatState, index: number): Html {
  const self = member.userId === state.session?.userId;
  if (!room.capabilities.manage || self) return html``;
  const actions =
    member.membership === "ban"
      ? [{ action: "unban", key: "roomSettings.unban" as const, icon: icons.check }]
      : member.membership === "invite"
        ? [
            { action: "kick", key: "roomSettings.revokeInvite" as const, icon: icons.exit },
            { action: "ban", key: "roomSettings.ban" as const, icon: icons.close },
          ]
        : [
            { action: "kick", key: "roomSettings.kick" as const, icon: icons.exit },
            { action: "ban", key: "roomSettings.ban" as const, icon: icons.close },
          ];
  const id = `member-menu-${String(index)}`;
  return html`<button
      class="member-more"
      type="button"
      popovertarget="${id}"
      aria-haspopup="menu"
      aria-label="${t(c, "roomSettings.memberActions")}"
    >
      ${icons.more}
    </button>
    <div id="${id}" class="surface floating member-menu" popover>
      <div class="surface-menu" role="menu" aria-label="${t(c, "roomSettings.memberActions")}">
        ${actions.map(
          (entry) => html`<button
            class="surface-item"
            type="button"
            role="menuitem"
            data-member-action="${entry.action}"
            data-member-id="${member.userId}"
            data-room-id="${room.roomId}"
          >
            ${entry.icon}<span>${t(c, entry.key)}</span>
          </button>`,
        )}
      </div>
    </div>`;
}

function memberPanel(c: Catalog, state: ChatState, room: RoomSummary): Html {
  const groups: ReadonlyArray<MemberMembership> = ["join", "invite", "ban"];
  const panel = (membership: MemberMembership): Html => {
    const members = state.members.filter((member) => member.membership === membership);
    const empty =
      membership === "invite"
        ? "roomSettings.noInvited"
        : membership === "ban"
          ? "roomSettings.noBanned"
          : "roomSettings.membersEmpty";
    return html`<div class="member-panel" id="member-panel-${membership}" role="tabpanel" aria-labelledby="member-tab-${membership}" data-member-panel="${membership}" ${membership === "join" ? html`` : html`hidden`}>
      ${
        members.length === 0
          ? html`<p class="note">${t(c, empty)}</p>`
          : html`<ul class="member-list" role="list">
              ${members.map((member) => {
                const memberIndex = state.members.findIndex((entry) => entry.userId === member.userId);
                return html`<li class="member-row">
                  <button
                    class="member"
                    type="button"
                    commandfor="${SURFACE.profile}"
                    command="show-modal"
                    data-profile="${member.displayName}"
                    data-profile-id="${member.userId}"
                  >
                    <span class="profile-avatar" aria-hidden="true">${member.displayName.slice(0, 1)}</span>
                    <span class="member-name" dir="auto">${member.displayName}</span>
                  </button>
                  ${memberMenu(c, room, member, state, memberIndex)}
                </li>`;
              })}
            </ul>`
      }
    </div>`;
  };
  return html`<div class="member-tabs" role="tablist" aria-label="${t(c, "roomSettings.members")}">
      ${groups.map(
        (membership) => html`<button
          class="member-tab"
          type="button"
          role="tab"
          id="member-tab-${membership}"
          aria-controls="member-panel-${membership}"
          data-member-group="${membership}"
          aria-selected="${membership === "join" ? "true" : "false"}"
          tabindex="${membership === "join" ? "0" : "-1"}"
        >
          ${t(c, MEMBERSHIP_LABELS[membership])}
          <span class="member-count">${state.members.filter((member) => member.membership === membership).length}</span>
        </button>`,
      )}
    </div>
    ${groups.map(panel)}`;
}

function searchBody(c: Catalog, state: ChatState): Html {
  const current = state.rooms.find((room) => room.roomId === state.roomId && !room.isSpace) ?? null;
  const scope = current?.roomId ?? "all";
  const label = current?.name ?? t(c, "surface.search.all");
  const rooms = state.rooms.filter((room) => !room.isSpace && room.membership === "join");
  return html`<form class="search-form" method="post" data-surface="search" data-search-scope="${scope}">
    <div class="search-head">
      <label class="visually-hidden" for="search-field">${t(c, "surface.search.label")}</label>
      <input
        id="search-field"
        class="input search-input"
        name="search-field"
        type="search"
        dir="auto"
        autocomplete="off"
        spellcheck="false"
        placeholder="${t(c, "surface.search.label")}"
      />
      <button
        id="search-scope-button"
        class="search-scope-button"
        type="button"
        dir="auto"
        popovertarget="search-scope"
        data-search-scope-button
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-label="${t(c, "surface.search.scope", { room: label })}"
      >
        <span class="search-scope-label" data-search-scope-label dir="auto">${label}</span>
        ${icons.chevron}
      </button>
    </div>
    <div
      id="search-scope"
      class="search-scope"
      popover
      role="listbox"
      aria-label="${t(c, "surface.search.scope", { room: label })}"
      data-search-scope-menu
    >
      <button
        class="search-scope-option"
        type="button"
        role="option"
        data-search-scope-option="all"
        aria-selected="${scope === "all" ? "true" : "false"}"
      >
        ${t(c, "surface.search.all")}
      </button>
      ${rooms.map(
        (room) => html`<button
          class="search-scope-option"
          type="button"
          role="option"
          dir="auto"
          data-search-scope-option="${room.roomId}"
          aria-selected="${scope === room.roomId ? "true" : "false"}"
        >
          ${room.name}
        </button>`,
      )}
    </div>
    <button class="visually-hidden" type="submit">${t(c, "surface.search.submit")}</button>
    <div class="search-results" data-search-results aria-live="polite"></div>
  </form>`;
}

export function surfaceBodyFor(c: Catalog, id: string, state: ChatState): Html {
  switch (id) {
    case SURFACE.search:
      return searchBody(c, state);
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
    case SURFACE.roomInvite:
      return textForm(c, "room-invite", "surface.roomInvite.label", "surface.roomInvite.submit");
    case SURFACE.settings:
      return settingsBody(c, state);
    case SURFACE.roomSettings:
      return roomSettingsBody(c, state);
    case SURFACE.roomMenu:
      return menu(
        c,
        [
          "roomMenu.settings",
          "roomMenu.markRead",
          "roomMenu.mute",
          "roomMenu.favorite",
          "roomMenu.mediaFiles",
          "roomMenu.search",
          "roomMenu.invite",
          "roomMenu.leave",
          "spaceMenu.settings",
          "spaceMenu.leave",
        ],
        "surface.roomMenu",
      );
    case SURFACE.messageMenu:
      return menu(
        c,
        [
          "messageMenu.reply",
          "messageMenu.react",
          "messageMenu.edit",
          "messageMenu.delete",
          "messageMenu.retry",
          "messageMenu.copy",
          "messageMenu.copyLink",
          "messageMenu.source",
          "messageMenu.select",
          "messageMenu.cancel",
        ],
        "surface.messageMenu",
      );
    case SURFACE.selectionMenu:
      return menu(c, ["selection.copy", "selection.forward", "selection.delete"], "selection.label");
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
    case SURFACE.mediaFiles:
      return mediaFilesBody(c, state.messages);
    case SURFACE.licenses:
      return html`<ul class="license-list" role="list">
        ${LICENSES.map(
          (entry) => html`<li class="license-row">
            <span class="license-name">${entry.name}</span>
            <span class="license-meta">${entry.version}</span>
            <a class="link license-link" href="${entry.url}">${entry.license}</a>
          </li>`,
        )}
      </ul>`;
    case SURFACE.messageSource:
      return html`<p class="note">${t(c, "surface.messageSource")}</p>`;
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
                <span class="forward-name" dir="auto">${room.name}</span>
                <span class="forward-topic" dir="auto">${room.topic}</span>
              </span>
            </button>`,
          )}
        </div>`;
    }
    case SURFACE.attach:
      return html`<div class="surface-menu" role="menu" aria-label="${t(c, "surface.attach")}">
          <button class="surface-item" type="button" role="menuitem" data-attach="image">
            ${icons.image}<span>${t(c, "surface.attach.image")}</span>
          </button>
          <button class="surface-item" type="button" role="menuitem" data-attach="video">
            ${icons.video}<span>${t(c, "surface.attach.video")}</span>
          </button>
          <button class="surface-item" type="button" role="menuitem" data-attach="file">
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
      return html`<div class="emoji-picker" data-emoji-picker data-emoji-mode="reaction"></div>`;
    case SURFACE.sendMenu:
      return html`<div class="surface-menu" role="menu" aria-label="${t(c, "surface.sendMenu")}">
        <button class="surface-item" type="button" role="menuitem" data-send="text">
          ${icons.compose}<span>${t(c, "surface.sendText")}</span>
        </button>
        <button class="surface-item" type="button" role="menuitem" data-send="markdown">
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
      { href: "#settings-low-priority", key: "settings.lowPriority" },
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
      <p class="form-error" data-notification-error role="alert" hidden></p>
      ${selectField({
        id: "notification-level",
        label: t(c, "settings.notificationLevel"),
        value: state.notifications.level,
        dataName: "notification-level",
        options: [
          { value: "all", label: t(c, "roomSettings.allMessages") },
          { value: "mentions", label: t(c, "roomSettings.mentions") },
          { value: "mute", label: t(c, "roomSettings.mute") },
        ],
      })}
      <label class="setting-row"
        ><span>${t(c, "settings.preview")}</span><input type="checkbox" data-setting="preview"
          ${checked(state.notifications.preview)} /></label
      >
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
        <span class="setting-value" data-setting-value="backup"
          >${t(c, state.backupReady ? "settings.ready" : "settings.off")}</span
        >
      </div>
      ${
        capabilities?.backup === true && !state.backupReady
          ? html`<button class="button-quiet" type="button" data-settings-action="backup">
            ${t(c, "settings.backupSetup")}
          </button>`
          : html``
      }
      ${
        capabilities?.recoveryKey === true
          ? html`<button class="button-quiet is-danger" type="button" data-settings-action="reset-identity">
            ${t(c, "settings.resetIdentity")}
          </button>`
          : html``
      }
      <dialog
        id="reset-key-dialog"
        class="surface modal reset-key-dialog"
        closedby="any"
        aria-labelledby="reset-key-dialog-title"
      >
        ${surfaceHead(c, "reset-key-dialog", "settings.recovery")}
        <div class="surface-body">
          <p class="note">${t(c, "settings.recoveryOnce")}</p>
          <p class="key-out" data-reset-key-value hidden></p>
          <div class="key-actions">
            <button class="button-quiet" type="button" data-settings-action="toggle-reset-key">
              ${t(c, "settings.showKey")}
            </button>
            <button class="button-quiet" type="button" data-settings-action="copy-reset-key">
              ${t(c, "settings.copy")}
            </button>
            <button class="button-quiet" type="button" data-settings-action="download-reset-key">
              ${t(c, "settings.download")}
            </button>
          </div>
        </div>
      </dialog>
      ${sasDialog(c, "device-sas-dialog")}
      <h3>${t(c, "settings.sessions")}</h3>
      ${
        state.devices.length === 0
          ? html`<p class="note">${t(c, "settings.devicesEmpty")}</p>`
          : html`<ul class="device-list" role="list">
              ${state.devices.map(
                (device) => html`<li class="device-row" data-device-id="${device.id}">
                  <div class="device-main">
                    <strong dir="auto"
                      >${device.name}${device.current ? html` · ${t(c, "settings.deviceCurrent")}` : html``}</strong
                    >
                    <span class="note">${t(c, "settings.lastSeen")}: ${device.lastSeen}</span>
                  </div>
                  <div class="device-actions">
                    ${
                      device.verified
                        ? html`<span class="device-verified">${t(c, "settings.verified")}</span>`
                        : html`<span class="session-state">${t(c, "settings.notVerified")}</span>`
                    }
                    ${
                      device.capabilities.verify && !device.verified
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
                  </div>
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
      ${
        capabilities?.signOut === true
          ? html`<button class="button-quiet is-danger" type="button" data-settings-action="sign-out-all">
            ${t(c, "settings.signOutAll")}
          </button>`
          : html``
      }
    </section>
    <section class="surface-section" id="settings-low-priority">
      <h3>${t(c, "settings.lowPriority")}</h3>
      ${
        state.rooms.filter((room) => room.lowPriority === true && !room.isSpace).length === 0
          ? html`<p class="note">${t(c, "settings.lowPriorityEmpty")}</p>`
          : html`${state.rooms
              .filter((room) => room.lowPriority === true && !room.isSpace)
              .map(
                (room) => html`<button
                  class="profile-line"
                  type="button"
                  data-low-priority-room="${room.roomId}"
                >
                  <span class="profile-avatar" aria-hidden="true">${room.name.slice(0, 1)}</span>
                  <span class="profile-text"><strong>${room.name}</strong><span class="note">${room.topic}</span></span>
                </button>`,
              )}`
      }
    </section>
    <section class="surface-section" id="settings-about">
      <h3>${t(c, "settings.about")}</h3>
      <p class="setting-line"><span>${t(c, "settings.version")}</span><span>${config.app.version}</span></p>
      <p class="setting-line"><a class="link" href="${config.app.source}">${t(c, "settings.source")}</a></p>
      <p class="setting-line">
        <button class="button-quiet" type="button" commandfor="${SURFACE.licenses}" command="show-modal">
          ${t(c, "settings.thirdParty")}
        </button>
      </p>
      <p class="note">${t(c, "settings.privacy")}</p>
    </section>
    </div>
  </div>`;
}

function roomSettingsBody(c: Catalog, state: ChatState): Html {
  const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
  if (room === null) return html``;
  const capabilities = room.capabilities;
  const canManage = capabilities.manage;
  const encryption =
    room.encryption === "encrypted"
      ? "roomSettings.encrypted"
      : room.encryption === "none"
        ? "roomSettings.encryptionNone"
        : "roomSettings.encryptionUnknown";
  const historyKey =
    room.historyVisibility === "world_readable"
      ? "roomSettings.historyWorld"
      : room.historyVisibility === "shared"
        ? "roomSettings.historyShared"
        : room.historyVisibility === "invited"
          ? "roomSettings.historyInvited"
          : "roomSettings.historyJoined";
  const matrixRoomId = room.roomId.includes(":") ? room.roomId : `!${room.roomId}:matrix.org`;
  return html`<div class="settings-layout">
    ${settingsTabs(c, "surface.roomSettings", [
      { href: "#room-settings-overview", key: "roomSettings.overview" },
      { href: "#room-settings-members", key: "roomSettings.members" },
      { href: "#room-settings-notifications", key: "roomSettings.notifications" },
    ])}
    <div class="settings-panels">
    <section class="surface-section" id="room-settings-overview">
      <h3>${t(c, "roomSettings.overview")}</h3>
      <div class="room-settings-profile">
        ${
          room.avatar === null
            ? html`<span class="room-settings-avatar" aria-hidden="true">${room.name.slice(0, 1)}</span>`
            : html`<img class="room-settings-avatar" src="${room.avatar}" alt="" />`
        }
        ${
          canManage
            ? html`<label class="field room-settings-field">
                <span class="field-label">${t(c, "roomSettings.name")}</span>
                <input class="input" type="text" dir="auto" maxlength="255" value="${room.name}" data-room-name-input />
              </label>`
            : html`<p class="setting-line"><span>${t(c, "roomSettings.name")}</span><span dir="auto">${room.name}</span></p>`
        }
      </div>
      ${
        canManage
          ? html`<label class="field">
              <span class="field-label">${t(c, "roomSettings.topic")}</span>
              <textarea class="input room-topic-input" rows="2" maxlength="1024" dir="auto" data-room-topic-input>${room.topic}</textarea>
            </label>`
          : html`<p class="setting-line"><span>${t(c, "roomSettings.topic")}</span><span dir="auto">${room.topic}</span></p>`
      }
      <h4>${t(c, "roomSettings.publicAddresses")}</h4>
      ${
        room.aliases.length === 0
          ? html`<p class="note">${t(c, "roomSettings.noAddresses")}</p>`
          : html`<ul class="address-list" role="list">
              ${room.aliases.map(
                (address) => html`<li class="address-row">
                  <code dir="ltr">${address}</code>
                  ${
                    canManage
                      ? html`<button
                          class="button-quiet"
                          type="button"
                          data-room-address-remove="${address}"
                          aria-label="${t(c, "composer.remove")}"
                        >
                          ${icons.close}
                        </button>`
                      : html``
                  }
                </li>`,
              )}
            </ul>`
      }
      ${
        canManage
          ? html`<form class="address-form" method="post" data-surface="room-address">
              <input
                class="input"
                type="text"
                dir="ltr"
                autocomplete="off"
                aria-label="${t(c, "roomSettings.publicAddresses")}"
                placeholder="${t(c, "roomSettings.addressPlaceholder")}"
                data-room-address-input
                required
              />
              <button class="button-quiet" type="submit">${t(c, "roomSettings.addAddress")}</button>
              <p class="form-error" data-room-address-error role="alert" hidden></p>
            </form>`
          : html``
      }
      <div class="setting-row">
        <span>${t(c, "roomSettings.encryption")}</span>
        <span class="setting-value" data-room-encryption>${t(c, encryption)}</span>
      </div>
      <h4>${t(c, "roomSettings.access")}</h4>
      <p class="setting-line">
        <span>${t(c, "roomSettings.joinRule")}</span><span>${t(c, JOIN_RULE_KEYS[room.joinRule])}</span>
      </p>
      <p class="setting-line">
        <span>${t(c, "roomSettings.guestAccess")}</span><span>${t(c, room.guestAccess ? "roomSettings.yes" : "roomSettings.no")}</span>
      </p>
      <p class="setting-line">
        <span>${t(c, "roomSettings.directory")}</span><span>${t(c, room.directoryPublished ? "roomSettings.yes" : "roomSettings.no")}</span>
      </p>
      <p class="setting-line">
        <span>${t(c, "roomSettings.historyVisibility")}</span><span>${t(c, historyKey)}</span>
      </p>
      <h4>${t(c, "roomSettings.advanced")}</h4>
      <p class="setting-line">
        <span>${t(c, "roomSettings.roomId")}</span>
        <span class="room-id-line"><code dir="ltr">${matrixRoomId}</code>
          <button class="button-quiet" type="button" data-room-copy-id aria-label="${t(c, "roomSettings.copyId")}">
            ${icons.copy}
          </button>
        </span>
      </p>
      <p class="setting-line">
        <span>${t(c, "roomSettings.roomVersion")}</span><span>${room.roomVersion}</span>
      </p>
      <p class="setting-line">
        <span>${t(c, "roomSettings.federation")}</span><span>${t(c, room.federated ? "roomSettings.federated" : "roomSettings.notFederated")}</span>
      </p>
      ${!capabilities.manage ? html`<p class="note">${t(c, "roomSettings.readOnly")}</p>` : html``}
      ${
        capabilities.leave
          ? html`<button class="button-quiet is-danger" type="button" data-action="roomSettings.leave">
            ${t(c, room.isSpace ? "spaceMenu.leave" : "roomSettings.leave")}
          </button>`
          : html``
      }
    </section>
    <section class="surface-section" id="room-settings-members">
      <h3>${t(c, "roomSettings.members")}</h3>
      ${memberPanel(c, state, room)}
    </section>
    <section class="surface-section" id="room-settings-notifications">
      <h3>${t(c, "roomSettings.notifications")}</h3>
      ${selectField({
        id: "room-notifications",
        label: t(c, "roomSettings.notifications"),
        value: room.notification,
        dataName: "room-notifications",
        disabled: !capabilities.notifications,
        options: [
          { value: "default", label: t(c, "roomSettings.followGlobal") },
          { value: "all", label: t(c, "roomSettings.allMessages") },
          { value: "mentions", label: t(c, "roomSettings.mentions") },
          { value: "mute", label: t(c, "roomSettings.mute") },
        ],
      })}
    </section>
    </div>
  </div>`;
}

function inviteBody(c: Catalog, state: ChatState): Html {
  if (state.invites.length === 0) return html`<p class="note">${t(c, "surface.invite.empty")}</p>`;
  return html`<ul class="invite-list" role="list">
    ${state.invites.map(
      (invite) => html`<li class="invite-row">
        <button
          class="invite-person"
          type="button"
          commandfor="${SURFACE.profile}"
          command="show-modal"
          data-profile="${invite.inviter}"
          data-profile-id="${invite.inviterId}"
          aria-label="${t(c, "surface.invite.from", { name: invite.inviter })}: ${invite.name}"
        >
          <span class="profile-avatar" aria-hidden="true">${invite.inviter.slice(0, 1)}</span>
          <span class="invite-person-text">
            <strong dir="auto">${invite.inviter}</strong>
            <span class="note" dir="auto">${invite.inviterId}</span>
            <span class="invite-context" dir="auto"
              >${invite.name}${invite.topic === "" ? "" : ` · ${invite.topic}`}</span
            >
          </span>
        </button>
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

function menu(c: Catalog, keys: ReadonlyArray<MenuKey>, labelKey: CatalogKey): Html {
  return html`<div class="surface-menu" role="menu" aria-label="${t(c, labelKey)}">
    ${keys.map((key) => {
      const declarative = key === "roomMenu.settings";
      const action = declarative
        ? html` commandfor="${SURFACE.roomSettings}" command="show-modal"`
        : html` data-action="${key}"`;
      return html`<button
        class="surface-item"
        type="button"
        role="menuitem"
        data-menu-key="${key}"
        ${action}
      >
        ${MENU_ICONS[key]}<span>${t(c, key)}</span>
      </button>`;
    })}
  </div>`;
}
