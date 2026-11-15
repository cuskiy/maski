import { t } from "../lib/catalog.ts";
import type { Catalog, CatalogKey } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { formatBytes } from "../lib/bytes.ts";
import { safeAvatarUrl, safeMediaUrl } from "../lib/safeUrl.ts";
import type {
  ChatState,
  Member,
  Membership,
  MessageRow,
  RoomJoinRule,
  RoomSummary,
  SourceCapabilities,
} from "../core/types.ts";
import { REVIEW_CAPABILITIES } from "../core/types.ts";
import { hasTag, isSpaceRoom } from "../core/rooms.ts";
import { memberPermissions, roomPermissions } from "../core/permissions.ts";
import { uniqueLinks } from "../core/links.ts";
import { config } from "../config.ts";
import { emptyChatState } from "../core/state.ts";
import { SURFACE } from "../core/regions.ts";
import { field, selectField, submit } from "../components/form.ts";
import { surfaceHead } from "./surface.ts";
import { stickerPickerBody } from "../components/stickers.ts";
import { icons } from "../components/icons.ts";
import { ATTRIBUTIONS, LICENSES } from "../core/licenses.ts";
import { sasBody } from "./sas.ts";

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
  "messageMenu.retry": icons.retry,
  "messageMenu.copy": icons.copy,
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
  const links = uniqueLinks(messages);
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
      <button
        class="media-files-tab"
        type="button"
        role="tab"
        id="media-files-tab-links"
        aria-controls="media-files-panel-links"
        aria-selected="false"
        tabindex="-1"
        data-media-files-tab="links"
      >
        ${t(c, "surface.mediaFiles.links")}
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
              ${media.map((message) => {
                const kind = message.media?.kind ?? "image";
                const url = safeMediaUrl(message.media?.url ?? null, kind);
                return html`<button
                    class="media-file is-${kind}"
                    type="button"
                    data-media-open="${message.id}"
                    data-media-kind="${kind}"
                    ${url === null ? html`` : html` data-media-url="${url}"`}
                    commandfor="${SURFACE.viewer}"
                    command="show-modal"
                    aria-label="${message.media?.name ?? ""}"
                  >
                    ${
                      kind === "image" && url !== null
                        ? html`<img
                            class="media-file-image"
                            src="${url}"
                            alt=""
                            data-media-image
                            loading="lazy"
                            decoding="async"
                          />`
                        : kind === "video" && url !== null
                          ? html`<video
                              class="media-file-video"
                              src="${url}"
                              data-media-video
                              preload="metadata"
                              muted
                            ></video>
                            <span class="media-file-play" data-media-play aria-hidden="true">${icons.play}</span>`
                          : html``
                    }
                  </button>`;
              })}
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
                  data-media-open="${message.id}"
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
    <div
      class="media-files-panel"
      id="media-files-panel-links"
      role="tabpanel"
      aria-labelledby="media-files-tab-links"
      data-media-files-panel="links"
      hidden
    >
      ${
        links.length === 0
          ? html`<p class="note">${t(c, "surface.mediaFiles.empty")}</p>`
          : html`<div class="media-files-list">
              ${links.map(
                (link) => html`<a
                  class="media-file-row media-link-row"
                  href="${link.url}"
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                >
                  ${icons.link}
                  <span class="media-file-name" dir="auto">${link.url}</span>
                  <span class="media-file-meta">${link.host}</span>
                </a>`,
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
  knock_restricted: "roomSettings.joinRuleKnockRestricted",
};

const MEMBERSHIP_LABELS: Readonly<Record<"join" | "invite" | "ban", CatalogKey>> = {
  join: "roomSettings.members",
  invite: "roomSettings.invited",
  ban: "roomSettings.banned",
};

function memberMenu(c: Catalog, room: RoomSummary, member: Member, state: ChatState, index: number): Html {
  const permissions = memberPermissions(room, member, state.session?.userId ?? null);
  const actions: Array<{
    readonly action: "kick" | "ban" | "unban";
    readonly key: "roomSettings.kick" | "roomSettings.revokeInvite" | "roomSettings.ban" | "roomSettings.unban";
    readonly icon: Html;
  }> = [];
  if (member.membership === "ban") {
    if (permissions.unban) {
      actions.push({ action: "unban", key: "roomSettings.unban", icon: icons.check });
    }
  } else {
    if (permissions.kick) {
      actions.push({
        action: "kick",
        key: member.membership === "invite" ? "roomSettings.revokeInvite" : "roomSettings.kick",
        icon: icons.exit,
      });
    }
    if (permissions.ban) {
      actions.push({ action: "ban", key: "roomSettings.ban", icon: icons.close });
    }
  }
  if (actions.length === 0) return html``;
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
  const groups = ["join", "invite", "ban"] as const;
  const panel = (membership: Membership): Html => {
    const members = state.members.filter((member) => member.membership === membership);
    const empty =
      membership === "invite"
        ? "roomSettings.noInvited"
        : membership === "ban"
          ? "roomSettings.noBanned"
          : "roomSettings.membersEmpty";
    const body =
      members.length === 0
        ? state.membersLoading && membership === "join"
          ? html`<p class="note">${t(c, "roomSettings.membersLoading")}</p>`
          : html`<p class="note">${t(c, empty)}</p>`
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
            </ul>`;
    return html`<div class="member-panel" id="member-panel-${membership}" role="tabpanel" aria-labelledby="member-tab-${membership}" data-member-panel="${membership}" ${membership === "join" ? html`` : html`hidden`}>
      ${body}
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
  const current = state.rooms.find((room) => room.roomId === state.roomId && !isSpaceRoom(room)) ?? null;
  const scope = current?.roomId ?? "all";
  const label = current?.name ?? t(c, "surface.search.all");
  const rooms = state.rooms.filter((room) => !isSpaceRoom(room) && room.membership === "join");
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

export function bootSurfaceBody(c: Catalog, id: string, capabilities: SourceCapabilities = REVIEW_CAPABILITIES): Html {
  switch (id) {
    case SURFACE.roomMenu:
    case SURFACE.messageMenu:
    case SURFACE.selectionMenu:
    case SURFACE.sendMenu:
    case SURFACE.confirm:
    case SURFACE.licenses:
      return surfaceBodyFor(c, id, emptyChatState(), capabilities);
    default:
      return html`<p class="note">${t(c, "noscript.surface")}</p>`;
  }
}

export function surfaceBodyFor(
  c: Catalog,
  id: string,
  state: ChatState,
  capabilities: SourceCapabilities = REVIEW_CAPABILITIES,
): Html {
  switch (id) {
    case SURFACE.search:
      return capabilities.search ? searchBody(c, state) : html``;
    case SURFACE.newMessage:
      return capabilities.addRoom && capabilities.inviteUser
        ? textForm(c, "new-message", "surface.newMessage.label", "surface.newMessage.submit")
        : html``;
    case SURFACE.join:
      return capabilities.addRoom ? textForm(c, "join", "surface.join.label", "surface.join.submit") : html``;
    case SURFACE.create:
      return capabilities.addRoom
        ? html`<form class="form" method="post" data-surface="create">
        ${field({ id: "create-name", label: t(c, "surface.create.name"), type: "text", autocomplete: "off", required: true })}
        ${field({ id: "create-topic", label: t(c, "surface.create.topic"), type: "text", autocomplete: "off" })}
        ${submit(t(c, "surface.create.submit"))}
      </form>`
        : html``;
    case SURFACE.invite:
      return capabilities.answerInvite ? inviteBody(c, state) : html``;
    case SURFACE.roomInvite:
      return capabilities.inviteUser
        ? textForm(c, "room-invite", "surface.roomInvite.label", "surface.roomInvite.submit")
        : html``;
    case SURFACE.settings:
      return settingsBody(c, state, capabilities);
    case SURFACE.roomSettings:
      return capabilities.setRoomState ? roomSettingsBody(c, state) : html``;
    case SURFACE.roomMenu: {
      const keys: MenuKey[] = [];
      if (capabilities.setRoomState) keys.push("roomMenu.settings");
      keys.push("roomMenu.markRead");
      if (capabilities.setNotification) keys.push("roomMenu.mute");
      if (capabilities.setRoomTag) keys.push("roomMenu.favorite");
      if (capabilities.media && capabilities.search) keys.push("roomMenu.mediaFiles");
      if (capabilities.search) keys.push("roomMenu.search");
      if (capabilities.inviteUser) keys.push("roomMenu.invite");
      if (capabilities.leaveRoom) keys.push("roomMenu.leave");
      if (capabilities.setRoomState) keys.push("spaceMenu.settings");
      if (capabilities.leaveRoom) keys.push("spaceMenu.leave");
      return menu(c, keys, "surface.roomMenu");
    }
    case SURFACE.messageMenu: {
      const keys: MenuKey[] = ["messageMenu.reply"];
      if (capabilities.react) keys.push("messageMenu.react");
      if (capabilities.edit) keys.push("messageMenu.edit");
      if (capabilities.redact) keys.push("messageMenu.delete");
      keys.push("messageMenu.copy", "messageMenu.source", "messageMenu.select");
      keys.push("messageMenu.cancel", "messageMenu.retry");
      return menu(c, keys, "surface.messageMenu");
    }
    case SURFACE.selectionMenu: {
      const keys: MenuKey[] = ["selection.copy"];
      if (capabilities.forward) keys.push("selection.forward");
      if (capabilities.redact) keys.push("selection.delete");
      return menu(c, keys, "selection.label");
    }
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
      return capabilities.search ? mediaFilesBody(c, state.messages) : html``;
    case SURFACE.sas:
      return sasBody(c, state.sas, { dialogId: SURFACE.sas, error: null, confirmed: false });
    case SURFACE.licenses:
      return html`<ul class="license-list" role="list">
        ${LICENSES.map(
          (entry) => html`<li class="license-row">
            <span class="license-name">${entry.name}</span>
            <span class="license-meta">${entry.version}</span>
            <a class="link license-link" href="${entry.url}" target="_blank" rel="noopener noreferrer">${entry.license}</a>
          </li>`,
        )}
        ${ATTRIBUTIONS.map(
          (entry) => html`<li class="license-row">
            <span class="license-name">${entry.name}</span>
            <span class="license-meta">${entry.version}</span>
            <a class="link license-link" href="${entry.url}" target="_blank" rel="noopener noreferrer">${entry.license}</a>
          </li>`,
        )}
      </ul>`;
    case SURFACE.messageSource:
      return html`<p class="note">${t(c, "surface.messageSource")}</p>`;
    case SURFACE.forward: {
      if (!capabilities.forward) return html``;
      const rooms = state.rooms.filter((room) => !isSpaceRoom(room));
      if (rooms.length === 0) return html`<p class="note">${t(c, "surface.forward.empty")}</p>`;
      return html`<p class="note">${t(c, "surface.forward.hint")}</p>
        <div class="forward-list">
          ${rooms.map((room) => {
            const avatar = safeAvatarUrl(room.avatar);
            return html`<button class="forward-room" type="button" data-forward-room="${room.roomId}">
              <span class="forward-avatar" aria-hidden="true"
                >${avatar === null ? room.name.slice(0, 1) : html`<img src="${avatar}" alt="" loading="lazy" decoding="async" />`}</span
              >
              <span class="forward-copy">
                <span class="forward-name" dir="auto">${room.name}</span>
                <span class="forward-topic" dir="auto">${room.topic}</span>
              </span>
            </button>`;
          })}
        </div>`;
    }
    case SURFACE.attach:
      if (!capabilities.media) return html``;
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
      if (!capabilities.stickers) return html``;
      return state.phase === "boot"
        ? html`<div class="sticker-picker"></div>`
        : stickerPickerBody(c, state.recentStickers);
    case SURFACE.emoji:
      return html`<div class="emoji-picker" data-emoji-picker></div>`;
    case SURFACE.reaction:
      return capabilities.react
        ? html`<div class="emoji-picker" data-emoji-picker data-emoji-mode="reaction"></div>`
        : html``;
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

function settingsBody(c: Catalog, state: ChatState, capabilities: SourceCapabilities): Html {
  const session = state.session;
  const sessionCapabilities = session?.capabilities ?? null;
  const hasSecurity =
    capabilities.resetRecoveryKey ||
    capabilities.resetIdentity ||
    capabilities.signOutDevice ||
    capabilities.signOutOthers;
  const tabs: Array<{ readonly href: string; readonly key: CatalogKey }> = [
    { href: "#settings-account", key: "settings.account" },
  ];
  if (capabilities.saveNotifications) tabs.push({ href: "#settings-notifications", key: "settings.notifications" });
  if (hasSecurity) tabs.push({ href: "#settings-security", key: "settings.security" });
  tabs.push(
    { href: "#settings-low-priority", key: "settings.lowPriority" },
    { href: "#settings-about", key: "settings.about" },
  );
  return html`<div class="settings-layout">
    ${settingsTabs(c, "surface.settings", tabs)}
    <div class="settings-panels">
    <section class="surface-section" id="settings-account">
      <h3>${t(c, "settings.account")}</h3>
      ${
        session === null
          ? html`<p class="note">${t(c, "settings.signedOut")}</p>`
          : html`<div class="profile-line">
                <span class="profile-avatar" aria-hidden="true">${session.displayName.slice(0, 1)}</span>
                <div class="profile-text">
                  <strong dir="auto">${session.displayName}</strong>
                  <p class="note" dir="ltr">${session.userId}</p>
                </div>
              </div>
              <button class="button-quiet" type="button" data-settings-action="logout">
                ${t(c, "settings.logout")}
              </button>
              <p class="form-error" data-settings-error role="alert" hidden></p>`
      }
    </section>
    ${
      capabilities.saveNotifications
        ? html`<section class="surface-section" id="settings-notifications">
      <h3>${t(c, "settings.notifications")}</h3>
      <label class="setting-row"
        ><span>${t(c, "settings.desktop")}</span><input type="checkbox" data-setting="desktop"
          ${checked(state.notifications.desktop)} /></label
      >
      <p class="form-error" data-notification-error role="alert" hidden></p>
      <label class="setting-row"
        ><span>${t(c, "settings.badge")}</span><input type="checkbox" data-setting="badge"
          ${checked(state.notifications.badge)} /></label
      >
      <label class="setting-row"
        ><span>${t(c, "settings.titleTotal")}</span><input type="checkbox" data-setting="titleTotal"
          ${checked(state.notifications.titleTotal)} /></label
      >
      <label class="setting-row"
        ><span>${t(c, "settings.preview")}</span><input type="checkbox" data-setting="preview"
          ${checked(state.notifications.preview)} /></label
      >
      ${selectField({
        id: "notification-level",
        label: t(c, "settings.notificationLevel"),
        value: state.notifications.level,
        dataName: "notification-level",
        layout: "inline",
        options: [
          { value: "all", label: t(c, "roomSettings.allMessages") },
          { value: "mentions", label: t(c, "roomSettings.mentions") },
          { value: "mute", label: t(c, "roomSettings.mute") },
        ],
      })}
    </section>`
        : html``
    }
    ${
      hasSecurity
        ? html`<section class="surface-section" id="settings-security">
      <h3>${t(c, "settings.security")}</h3>
      <div class="setting-row">
        <span>${t(c, "settings.recovery")}</span>
        <span class="setting-value" data-setting-value="recovery"
          >${t(c, state.recoveryKey === null ? "settings.recoveryNotSet" : "settings.recoveryShown")}</span
        >
      </div>
      ${
        capabilities.resetRecoveryKey
          ? html`<button class="button-quiet" type="button" data-settings-action="reset-key">
            ${t(c, "settings.recoveryShow")}
          </button>`
          : html``
      }
      <div class="setting-row">
        <span>${t(c, "settings.backup")}</span>
        <span class="setting-value" data-setting-value="backup"
          >${t(c, state.backupReady ? "settings.ready" : "settings.off")}</span
        >
      </div>
      ${
        sessionCapabilities?.backup === true && !state.backupReady
          ? html`<button class="button-quiet" type="button" data-settings-action="backup">
            ${t(c, "settings.backupSetup")}
          </button>`
          : html``
      }
      ${state.backupError === null ? html`` : html`<p class="field-hint">${t(c, "settings.backupFailed")}</p>`}
      ${
        capabilities.resetIdentity
          ? html`<form class="setting-stack" method="post" data-surface="reset-identity">
            ${field({
              id: "reset-identity-password",
              label: t(c, "auth.password"),
              type: "password",
              autocomplete: "current-password",
              required: true,
            })}
            <p class="field-hint">${t(c, "settings.resetIdentityConfirm")}</p>
            <button class="button-quiet is-danger" type="submit">${t(c, "settings.resetIdentity")}</button>
          </form>`
          : html``
      }
      ${
        capabilities.resetRecoveryKey || capabilities.resetIdentity
          ? html`<dialog
        id="reset-key-dialog"
        class="surface modal reset-key-dialog"
        closedby="any"
        aria-labelledby="reset-key-dialog-title"
      >
        ${surfaceHead(c, "reset-key-dialog", "settings.newRecoveryKey")}
        <div class="surface-body">
          <p class="note">${t(c, "settings.recoveryOnce")}</p>
          <p class="key-out" data-reset-key-value></p>
          <div class="key-actions">
            <button class="button-quiet" type="button" data-settings-action="copy-reset-key">
              ${t(c, "settings.copy")}
            </button>
            <button class="button-quiet" type="button" data-settings-action="download-reset-key">
              ${t(c, "settings.download")}
            </button>
          </div>
          <div class="confirm-actions">
            <button class="button-primary" type="button" commandfor="reset-key-dialog" command="close">
              ${t(c, "settings.done")}
            </button>
          </div>
        </div>
      </dialog>`
          : html``
      }
      <h3>${t(c, "settings.sessions")}</h3>
      ${
        state.devices.length === 0
          ? html`<p class="note">${t(c, "settings.devicesEmpty")}</p>`
          : html`<ul class="device-list" role="list">
              ${state.devices.map(
                (device) => html`<li class="device-row" data-device-id="${device.id}">
                  <div class="device-main">
                    <strong dir="auto"
                      >${device.name}${device.current ? html` · ${t(c, "settings.deviceCurrent")}` : html``}${
                        device.verified
                          ? html`<span
                              class="device-verified"
                              role="img"
                              aria-label="${t(c, "settings.verified")}"
                              title="${t(c, "settings.verified")}"
                              >${icons.check}</span
                            >`
                          : html``
                      }</strong
                    >
                    <span class="note">${t(c, "settings.lastSeen")}: ${device.lastSeen}</span>
                  </div>
                  <div class="device-actions">
                    ${
                      device.capabilities.verify && !device.verified && !device.current
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
                      capabilities.signOutDevice && device.capabilities.signOut
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
        capabilities.signOutOthers
          ? html`<button class="button-quiet" type="button" data-settings-action="sign-out-others">
            ${t(c, "settings.signOutOthers")}
          </button>`
          : html``
      }
    </section>`
        : html``
    }
    <section class="surface-section" id="settings-low-priority">
      <h3>${t(c, "settings.lowPriority")}</h3>
      ${
        state.rooms.filter((room) => hasTag(room, "m.lowpriority") && !isSpaceRoom(room)).length === 0
          ? html`<p class="note">${t(c, "settings.lowPriorityEmpty")}</p>`
          : html`${state.rooms
              .filter((room) => hasTag(room, "m.lowpriority") && !isSpaceRoom(room))
              .map(
                (room) => html`<button
                  class="profile-line"
                  type="button"
                  data-low-priority-room="${room.roomId}"
                >
                  <span class="profile-avatar" aria-hidden="true">${room.name.slice(0, 1)}</span>
                  <span class="profile-text"
                    ><strong dir="auto">${room.name}</strong
                    ><span class="note" dir="auto">${room.topic}</span></span
                  >
                </button>`,
              )}`
      }
    </section>
    <section class="surface-section" id="settings-about">
      <h3>${t(c, "settings.about")}</h3>
      <div class="setting-stack">
        <span class="field-label">${t(c, "settings.version")}</span>
        <span>${config.app.version}</span>
      </div>
      <p class="setting-line"><a class="link" href="${config.app.source}" target="_blank" rel="noopener noreferrer">${t(c, "settings.source")}</a></p>
      <p class="setting-line">
        <button class="button-quiet" type="button" commandfor="${SURFACE.licenses}" command="show-modal">
          ${t(c, "settings.thirdParty")}
        </button>
      </p>
    </section>
    </div>
  </div>`;
}

function roomSettingsBody(c: Catalog, state: ChatState): Html {
  const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
  if (room === null) return html``;
  const permissions = roomPermissions(room, state.session?.userId ?? null);
  const encryption =
    room.encryption === "encrypted"
      ? "roomSettings.encrypted"
      : room.encryption === "none"
        ? "roomSettings.encryptionNone"
        : "roomSettings.encryptionUnknown";
  const roomAvatar = safeAvatarUrl(room.avatar);
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
          roomAvatar === null
            ? html`<span class="room-settings-avatar" aria-hidden="true">${room.name.slice(0, 1)}</span>`
            : html`<img
                class="room-settings-avatar"
                src="${roomAvatar}"
                alt=""
                loading="lazy"
                decoding="async"
              />`
        }
        <div class="room-settings-profile-fields">
          ${
            permissions.name
              ? html`<label class="field">
                  <span class="field-label">${t(c, "roomSettings.name")}</span>
                  <input class="input" type="text" dir="auto" maxlength="255" value="${room.name}" data-room-name-input />
                </label>`
              : html`<p class="setting-line"><span>${t(c, "roomSettings.name")}</span><span dir="auto">${room.name}</span></p>`
          }
          ${
            permissions.topic
              ? html`<label class="field">
                  <span class="field-label">${t(c, "roomSettings.topic")}</span>
                  <textarea class="input room-topic-input" rows="2" maxlength="1024" dir="auto" data-room-topic-input>${room.topic}</textarea>
                </label>`
              : html`<p class="setting-line"><span>${t(c, "roomSettings.topic")}</span><span dir="auto">${room.topic}</span></p>`
          }
        </div>
      </div>
      <h4>${t(c, "roomSettings.publicAddresses")}</h4>
      ${
        room.aliases.length === 0
          ? html`<p class="note">${t(c, "roomSettings.noAddresses")}</p>`
          : html`<ul class="address-list" role="list">
              ${room.aliases.map(
                (address) => html`<li class="address-row">
                  <code class="address-value" dir="ltr">${address}</code>
                  ${
                    permissions.aliases
                      ? html`<button
                          class="button-quiet button-icon"
                          type="button"
                          data-room-address-remove="${address}"
                          aria-label="${t(c, "composer.remove")}"
                        >
                          ${icons.trash}
                        </button>`
                      : html``
                  }
                </li>`,
              )}
            </ul>`
      }
      ${
        permissions.aliases
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
      ${selectField({
        id: "room-join-rule",
        label: t(c, "roomSettings.joinRule"),
        value: room.joinRule,
        dataName: "room-join",
        layout: "inline",
        disabled: !permissions.access,
        options: (["public", "invite", "knock", "restricted"] as const).map((value) => ({
          value,
          label: t(c, JOIN_RULE_KEYS[value]),
        })),
      })}
      ${selectField({
        id: "room-guest-access",
        label: t(c, "roomSettings.guestAccess"),
        value: room.guestAccess,
        dataName: "room-guest",
        layout: "inline",
        disabled: !permissions.access,
        options: [
          { value: "forbidden", label: t(c, "roomSettings.no") },
          { value: "can_join", label: t(c, "roomSettings.yes") },
        ],
      })}
      ${selectField({
        id: "room-directory",
        label: t(c, "roomSettings.directory"),
        value: String(room.directoryPublished),
        dataName: "room-directory",
        layout: "inline",
        disabled: !permissions.directory,
        options: [
          { value: "false", label: t(c, "roomSettings.no") },
          { value: "true", label: t(c, "roomSettings.yes") },
        ],
      })}
      ${selectField({
        id: "room-history",
        label: t(c, "roomSettings.historyVisibility"),
        value: room.historyVisibility,
        dataName: "room-history",
        layout: "inline",
        disabled: !permissions.access,
        options: [
          { value: "world_readable", label: t(c, "roomSettings.historyWorld") },
          { value: "shared", label: t(c, "roomSettings.historyShared") },
          { value: "invited", label: t(c, "roomSettings.historyInvited") },
          { value: "joined", label: t(c, "roomSettings.historyJoined") },
        ],
      })}
      <h4>${t(c, "roomSettings.advanced")}</h4>
      <p class="setting-line">
        <span>${t(c, "roomSettings.roomId")}</span>
        <span class="room-id-line"><code dir="ltr">${room.roomId}</code>
          <button class="button-quiet button-icon" type="button" data-room-copy-id aria-label="${t(c, "roomSettings.copyId")}">
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
      ${!permissions.manage ? html`<p class="note">${t(c, "roomSettings.readOnly")}</p>` : html``}
      ${
        permissions.leave
          ? html`<button class="button-quiet is-danger" type="button" data-action="roomSettings.leave">
            ${t(c, isSpaceRoom(room) ? "spaceMenu.leave" : "roomSettings.leave")}
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
        label: t(c, "settings.notificationLevel"),
        value: room.notification,
        dataName: "room-notifications",
        layout: "inline",
        disabled: !permissions.notifications,
        // Only default and mute are room push-rule states; all/mentions have no per-room rule here.
        options: [
          { value: "default", label: t(c, "roomSettings.followGlobal") },
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
    ${state.invites.map((invite) => {
      const avatar = safeAvatarUrl(invite.avatar);
      return html`<li class="invite-row">
        <button
          class="invite-person"
          type="button"
          commandfor="${SURFACE.profile}"
          command="show-modal"
          data-profile="${invite.inviter}"
          data-profile-id="${invite.inviterId}"
          aria-label="${t(c, "surface.invite.from", { name: invite.inviter })}: ${invite.name}"
        >
          <span class="profile-avatar" aria-hidden="true"
            >${
              avatar === null
                ? invite.inviter.slice(0, 1)
                : html`<img src="${avatar}" alt="" loading="lazy" decoding="async" />`
            }</span
          >
          <span class="invite-person-text">
            <strong dir="auto">${invite.inviter}</strong>
            <span class="invite-id" dir="ltr">${invite.inviterId}</span>
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
      </li>`;
    })}
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
