import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, raw, type Html } from "../lib/html.ts";
import { formatBytes } from "../lib/bytes.ts";
import { safeAvatarUrl, safeMediaUrl } from "../lib/safeUrl.ts";
import type { ChatState, Media, MessageRow, SourceCapabilities } from "../core/types.ts";
import { REVIEW_CAPABILITIES } from "../core/types.ts";
import { messagePositions, type MessagePosition } from "../core/messageGroups.ts";
import { REGION, SURFACE } from "../core/regions.ts";
import { icons } from "./icons.ts";

const MEDIA_LABELS = {
  image: "chat.media.image",
  video: "chat.media.video",
  file: "chat.media.file",
  audio: "chat.media.audio",
  sticker: "chat.media.sticker",
} as const;

const MEDIA_ICONS: Readonly<Record<Media["kind"], Html>> = {
  image: icons.image,
  video: icons.video,
  file: icons.file,
  audio: icons.audio,
  sticker: icons.sticker,
};

const STATUS_LABELS = {
  queued: "message.queued",
  sending: "message.sending",
  failed: "message.failed",
} as const;

const UNREADABLE_KEYS = {
  "missing-key": "chat.undecryptable.missingKey",
  corrupt: "chat.undecryptable.corrupt",
} as const;

export function timeline(
  state: ChatState,
  c: Catalog,
  locale: string,
  capabilities: SourceCapabilities = REVIEW_CAPABILITIES,
): Html {
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
  const ready = state.phase === "ready" && room !== null;
  const positions = messagePositions(state.messages);
  return html`<section class="timeline-region" data-region="${REGION.timeline}" data-read-receipt="${room?.readReceipt ?? ""}" aria-label="${t(c, "chat.title")}">
    <div
      class="selection-bar"
      data-selection-bar
      role="toolbar"
      aria-label="${t(c, "selection.label")}"
      hidden
    >
      <button
        class="selection-button"
        type="button"
        data-selection-action="cancel"
        aria-label="${t(c, "selection.cancel")}"
        title="${t(c, "selection.cancel")}"
      >
        ${icons.close}
      </button>
      <span class="selection-count" data-selection-count aria-live="polite"></span>
      <div class="selection-actions">
        <button
          class="selection-button"
          type="button"
          data-selection-action="all"
          aria-label="${t(c, "selection.all")}"
        >
          ${icons.check}<span>${t(c, "selection.all")}</span>
        </button>
      </div>
    </div>
    <div class="timeline-wrap">
      <div class="timeline-state" data-region="${REGION.timelineState}" data-field="state" ${state.windowLoading ? html` aria-busy="true"` : html``}>
        ${stateNote(state, c)}${
          ready && state.windowLoading && state.messages.length === 0
            ? html`<p class="note" role="status">${t(c, "chat.loading")}</p>`
            : ready && state.messages.length === 0
              ? html`<p class="note">${t(c, "chat.empty")}</p>`
              : html``
        }
      </div>
      ${
        ready
          ? html`<button
              class="load-older${state.olderLoading ? " is-loading" : ""}"
              type="button"
              aria-busy="${state.olderLoading ? "true" : "false"}"
              ${state.olderLoading ? html` disabled` : html``}
              ${state.hasOlder || state.olderLoading ? html`` : html` hidden`}
            >
              ${
                state.olderLoading ? html`<span class="router-spinner" aria-hidden="true"></span>` : icons.older
              }<span>${t(c, state.olderLoading ? "chat.loadingOlder" : "chat.loadOlder")}</span>
            </button>`
          : html``
      }
      <ol class="timeline" role="list">
        ${
          ready
            ? state.messages.map((message, index) =>
                messageRow(
                  c,
                  message,
                  positions[index] ?? {
                    dayStart: false,
                    groupStart: false,
                    groupEnd: false,
                    showSender: false,
                  },
                  time,
                  day,
                  capabilities,
                ),
              )
            : html``
        }
      </ol>
    </div>
    ${ready ? html`<button class="jump-newest" type="button" hidden>${t(c, "chat.jump")}</button>` : html``}
  </section>`;
}

function stateNote(state: ChatState, c: Catalog): Html {
  if (state.phase === "signedOut") return html`<p class="note">${t(c, "chat.signedOut")}</p>`;
  if (state.phase === "locked") return html`<p class="note">${t(c, "chat.locked")}</p>`;
  return html``;
}

function messageRow(
  c: Catalog,
  message: MessageRow,
  position: MessagePosition,
  time: Intl.DateTimeFormat,
  day: Intl.DateTimeFormat,
  capabilities: SourceCapabilities,
): Html {
  const { dayStart, groupStart, groupEnd, showSender } = position;
  const system = message.system;
  const sender = showSender
    ? html`<h3 class="message-sender" id="${message.id}-sender">
        <button
          class="message-sender-button"
          type="button"
          dir="auto"
          commandfor="${SURFACE.profile}"
          command="show-modal"
          data-profile="${message.senderName}"
          data-profile-id="${message.sender}"
        >
          ${message.senderName}
        </button>
      </h3>`
    : html``;
  const senderAvatar = safeAvatarUrl(message.senderAvatar);
  const avatar = groupEnd
    ? html`<button
        class="message-avatar"
        type="button"
        commandfor="${SURFACE.profile}"
        command="show-modal"
        data-profile="${message.senderName}"
        data-profile-id="${message.sender}"
        aria-label="${t(c, "surface.profile")}: ${message.senderName}"
      >
        ${
          senderAvatar === null
            ? message.senderName.slice(0, 1)
            : html`<img src="${senderAvatar}" alt="" loading="lazy" decoding="async" />`
        }
      </button>`
    : html`<span class="message-avatar" aria-hidden="true"></span>`;
  const reply =
    message.reply === null
      ? html``
      : html`<a class="quote" href="#${message.reply.messageId}" dir="auto">
          <strong>${message.reply.senderName}</strong><span>${message.reply.body}</span>
        </a>`;
  const pending = message.status !== "sent";
  const failure = t(c, "message.failed");
  const status = pending
    ? message.status === "failed"
      ? html`<span class="message-failed" role="img" aria-label="${failure}" title="${failure}">!</span>`
      : html`<span
          class="message-spinner"
          role="status"
          aria-label="${t(c, STATUS_LABELS[message.status === "queued" ? "queued" : "sending"])}"
        ></span>`
    : html``;
  const meta = messageMeta(message, c, time, status);
  const content = message.redacted
    ? html`<div class="bubble is-redacted">${sender}<p class="message-redacted">
          ${t(c, "message.redacted")}
        </p>${meta}</div>`
    : message.encryption.state === "undecryptable"
      ? html`<div class="bubble is-unreadable">${sender}<p class="message-unreadable">
            ${t(c, UNREADABLE_KEYS[message.encryption.reason])}
          </p>${meta}</div>`
      : message.media === null
        ? html`<div class="bubble">${sender}${messageText(message)}${meta}</div>`
        : html`<div class="message-media-wrap">${sender}${mediaView(message, c, meta)}</div>`;
  return html`${dayStart ? html`<li class="row-day"><time datetime="${new Date(message.ts).toISOString()}">${day.format(message.ts)}</time></li>` : html``}
    <li class="message${message.own ? " is-own" : ""}${groupStart ? " is-group-start" : ""}${groupEnd ? " is-group-end" : ""}${system ? " is-system" : ""}${message.encryption.state === "undecryptable" ? " is-unreadable" : ""}" id="${message.id}" data-id="${message.id}">
      <article
        class="message-inner"
        ${showSender ? html`aria-labelledby="${message.id}-sender"` : html`aria-label="${message.senderName}"`}
        tabindex="0"
      >
        ${avatar}
        <div class="message-body">
          ${reply}
          <div class="message-line">${content}</div>
        </div>
        ${capabilities.react ? reactionsView(message, c) : html``}
        <button
          class="message-select-mark"
          type="button"
          aria-pressed="false"
          aria-label="${t(c, "selection.select")}"
        >
          ${icons.check}
        </button>
      </article>
      <span class="message-swipe-hint is-start" aria-hidden="true">${icons.reply}</span>
      <span class="message-swipe-hint is-end" aria-hidden="true">${icons.check}</span>
    </li>`;
}

function messageText(message: MessageRow): Html {
  const kind = message.kind === "notice" ? " is-notice" : message.kind === "emote" ? " is-emote" : "";
  // Fixture HTML is controlled; the client sanitizes incoming HTML before it reaches this field.
  return html`<div class="message-text${message.html === null ? "" : " is-rich"}${kind}" dir="auto">${message.html === null ? message.body : raw(message.html)}</div>`;
}

function messageMeta(message: MessageRow, c: Catalog, time: Intl.DateTimeFormat, status: Html): Html {
  const edited = message.edited ? html`<span>${t(c, "message.edited")}</span>` : html``;
  const stamp = html`<span class="bubble-stamp">
    <time datetime="${new Date(message.ts).toISOString()}">${time.format(message.ts)}</time>
    ${edited}
  </span>`;
  return html`<span class="bubble-meta">${stamp}${status}</span>`;
}

function mediaView(message: MessageRow, c: Catalog, meta: Html): Html {
  const media = message.media;
  if (media === null) return html``;
  const label = t(c, MEDIA_LABELS[media.kind]);
  const mediaUrl = safeMediaUrl(media.url, media.kind);
  const caption =
    media.kind === "sticker" || message.body === ""
      ? html``
      : html`<figcaption class="media-caption" dir="auto">${message.body}</figcaption>`;
  if (media.kind === "sticker") {
    const content =
      mediaUrl === null
        ? html`<span class="sticker" role="img" aria-label="${media.name}">${message.body}</span>`
        : html`<img
            class="media-element"
            src="${mediaUrl}"
            alt="${media.name}"
            data-media-image
            width="${String(media.width ?? 16)}"
            height="${String(media.height ?? 16)}"
            loading="lazy"
            decoding="async"
          />`;
    return html`<figure class="message-media is-sticker">
      <div class="media-frame">
        ${content}
        <div class="media-footer">${meta}</div>
      </div>
    </figure>`;
  }
  if (media.kind === "video") {
    return html`<figure class="message-media is-video">
      <div class="media-frame">
        <button
          class="video-preview media-open"
          type="button"
          data-media-open="${message.id}"
          data-media-kind="video"
          ${mediaUrl === null ? html`` : html` data-media-url="${mediaUrl}"`}
          commandfor="${SURFACE.viewer}"
          command="show-modal"
          aria-label="${label}: ${media.name}"
        >${
          mediaUrl === null
            ? html``
            : html`<video
            class="media-element video-element"
            src="${mediaUrl}"
            data-media-video
            preload="metadata"
            muted
            playsinline
          ></video><span class="video-play" aria-hidden="true">${icons.play}</span>`
        }</button>
        ${caption}
        <div class="media-footer">${meta}</div>
      </div>
    </figure>`;
  }
  if (media.kind === "file" || media.kind === "audio") {
    const details = html`${MEDIA_ICONS[media.kind]}
      <span class="attachment-text">
        <span class="attachment-name" dir="auto">${media.name}</span>
        <span class="attachment-meta"
          >${label}${media.size === null ? html`` : html`<span class="attachment-size">${formatBytes(media.size)}</span>`}</span
        >
      </span>`;
    const content =
      mediaUrl === null
        ? html`<button
            class="attachment media-open"
            type="button"
            data-media-open="${message.id}"
            data-media-kind="${media.kind}"
            commandfor="${SURFACE.viewer}"
            command="show-modal"
          >
            ${details}${meta}
          </button>`
        : html`<a class="attachment" href="${mediaUrl}" download rel="noreferrer">${details}${meta}</a>`;
    return html`<figure class="message-media is-${media.kind}">
      ${content}${caption}
    </figure>`;
  }
  const content =
    mediaUrl === null
      ? html`<button
          class="media-placeholder media-open"
          type="button"
          data-media-open="${message.id}"
          data-media-kind="${media.kind}"
          commandfor="${SURFACE.viewer}"
          command="show-modal"
          aria-label="${label}: ${media.name}"
        ></button>`
      : html`<button
          class="media-open"
          type="button"
          data-media-open="${message.id}"
          data-media-kind="${media.kind}"
          data-media-url="${mediaUrl}"
          commandfor="${SURFACE.viewer}"
          command="show-modal"
          aria-label="${label}: ${media.name}"
        >
          <img
            class="media-element"
            src="${mediaUrl}"
            alt="${media.name}"
            data-media-image
            width="${String(media.width ?? 16)}"
            height="${String(media.height ?? 9)}"
            loading="lazy"
            decoding="async"
          />
        </button>`;
  return html`<figure class="message-media is-${media.kind}">
    <div class="media-frame">
      ${content}${caption}
      <div class="media-footer">${meta}</div>
    </div>
  </figure>`;
}

const REACTION_LIMIT = 6;

function reactionItem(reaction: MessageRow["reactions"][number], extra: boolean): Html {
  return html`<li${extra ? html` hidden data-reaction-extra` : html``}>
    <button
      class="reaction${reaction.mine ? " is-mine" : ""}"
      type="button"
      data-reaction="${reaction.key}"
      aria-pressed="${reaction.mine ? "true" : "false"}"
    >
      <span aria-hidden="true">${reaction.key}</span><span>${String(reaction.count)}</span>
    </button>
  </li>`;
}

export function reactionsView(message: MessageRow, c: Catalog): Html {
  if (message.reactions.length === 0) return html``;
  const sorted = message.reactions
    .map((reaction, index) => ({ reaction, index }))
    .toSorted((a, b) => b.reaction.count - a.reaction.count || a.index - b.index)
    .map(({ reaction }) => reaction);
  const visible = sorted.slice(0, REACTION_LIMIT);
  const hidden = sorted.slice(REACTION_LIMIT);
  return html`<ul class="reactions" role="list" aria-label="${t(c, "chat.reactions")}">
    ${visible.map((reaction) => reactionItem(reaction, false))}
    ${hidden.map((reaction) => reactionItem(reaction, true))}
    ${
      hidden.length === 0
        ? html``
        : html`<li class="reaction-more">
            <button
              class="reaction reaction-more-button"
              type="button"
              data-reaction-more
              data-reaction-count="${String(hidden.length)}"
              aria-expanded="false"
              aria-label="${t(c, "chat.reactionsMore", { count: String(hidden.length) })}"
            >
              +${String(hidden.length)}
            </button>
          </li>`
    }
  </ul>`;
}
