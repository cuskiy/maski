import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, raw, type Html } from "../lib/html.ts";
import type { ChatState, Media, MessageRow } from "../core/types.ts";
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

export function timeline(state: ChatState, c: Catalog, locale: string): Html {
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
  const ready = state.phase === "ready" && room !== null;
  const positions = messagePositions(state.messages);
  return html`<section class="timeline-region" data-region="${REGION.timeline}" data-read-receipt="${room?.readReceipt ?? ""}" aria-label="${t(c, "chat.title")}">
    <div class="timeline-wrap">
      <div class="timeline-state" data-region="${REGION.timelineState}" data-field="state">
        ${stateNote(state, c)}
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
              ${icons.older}<span>${t(c, state.olderLoading ? "chat.loadingOlder" : "chat.loadOlder")}</span>
            </button>`
          : html``
      }
      <ol class="timeline" role="list" aria-live="polite" aria-relevant="additions text">
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
): Html {
  const { dayStart, groupStart, groupEnd, showSender } = position;
  const system = message.system;
  const sender = showSender
    ? html`<h3 class="message-sender" id="${message.id}-sender">
        <button
          class="message-sender-button"
          type="button"
          commandfor="${SURFACE.profile}"
          command="show-modal"
          data-profile="${message.senderName}"
          data-profile-id="${message.sender}"
        >
          ${message.senderName}
        </button>
      </h3>`
    : html``;
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
          message.senderAvatar === null
            ? message.senderName.slice(0, 1)
            : html`<img src="${message.senderAvatar}" alt="" />`
        }
      </button>`
    : html`<span class="message-avatar" aria-hidden="true"></span>`;
  const reply =
    message.reply === null
      ? html``
      : html`<a class="quote" href="#${message.reply.messageId}">
          <strong>${message.reply.senderName}</strong><span>${message.reply.body}</span>
        </a>`;
  const pending = message.status !== "sent";
  const failure = `${t(c, "message.failed")}${message.error === null ? "" : `: ${message.error}`}`;
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
  const content =
    message.encryption.state === "undecryptable"
      ? html`<div class="bubble is-unreadable">${sender}<p class="message-unreadable">
          ${t(c, UNREADABLE_KEYS[message.encryption.reason])}
        </p>${meta}</div>`
      : message.media === null
        ? html`<div class="bubble">${sender}${messageText(message)}${meta}</div>`
        : html`<div class="message-media-wrap">${mediaView(message, c, meta)}</div>`;
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
          ${reactionsView(message, c)}
        </div>
      </article>
    </li>`;
}

function messageText(message: MessageRow): Html {
  // Fixture HTML is controlled; the client sanitizes incoming HTML before it reaches this field.
  return html`<div class="message-text${message.html === null ? "" : " is-rich"}">${message.html === null ? message.body : raw(message.html)}</div>`;
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
  const caption =
    message.body === "" || message.body === media.name || media.kind === "sticker"
      ? html``
      : html`<span class="media-caption">${message.body}</span>`;
  if (media.kind === "sticker" && media.url === null) {
    return html`<figure class="message-media is-sticker">
      <div class="media-frame">
        <button
          class="sticker media-open"
          type="button"
          data-media-open="${media.name}"
          data-media-kind="sticker"
          commandfor="${SURFACE.viewer}"
          command="show-modal"
          aria-label="${media.name}"
        >
          ${message.body}
        </button>
        <div class="media-footer">${meta}</div>
      </div>
    </figure>`;
  }
  if (media.kind === "video") {
    const title = message.body === "" ? media.name : message.body;
    return html`<figure class="message-media is-video">
      <div class="media-frame">
        <button
          class="video-preview media-open"
          type="button"
          data-media-open="${media.name}"
          data-media-kind="video"
          ${media.url === null ? html`` : html` data-media-url="${media.url}"`}
          commandfor="${SURFACE.viewer}"
          command="show-modal"
          aria-label="${label}: ${title}"
        >
          <span class="video-play" aria-hidden="true">${icons.play}</span>
          <span class="video-title">${title}</span>
        </button>
        <div class="media-footer">${meta}</div>
      </div>
    </figure>`;
  }
  if (media.kind === "file" || media.kind === "audio") {
    const details = html`${MEDIA_ICONS[media.kind]}
      <span class="attachment-text">
        <span class="attachment-name">${media.name}</span>
        <span class="attachment-meta"
          >${label}${media.size === null ? html`` : html`<span class="attachment-size">${formatBytes(media.size)}</span>`}</span
        >
      </span>`;
    const content =
      media.url === null
        ? html`<button
            class="attachment media-open"
            type="button"
            data-media-open="${media.name}"
            data-media-kind="${media.kind}"
            commandfor="${SURFACE.viewer}"
            command="show-modal"
          >
            ${details}${meta}
          </button>`
        : html`<a class="attachment" href="${media.url}" download>${details}${meta}</a>`;
    return content;
  }
  const content =
    media.url === null
      ? html`<button
          class="media-placeholder media-open"
          type="button"
          data-media-open="${media.name}"
          data-media-kind="${media.kind}"
          ${media.url === null ? html`` : html` data-media-url="${media.url}"`}
          commandfor="${SURFACE.viewer}"
          command="show-modal"
          aria-label="${label}: ${media.name}"
        >
          ${MEDIA_ICONS[media.kind]}${caption}
        </button>`
      : html`<button
          class="media-open"
          type="button"
          data-media-open="${media.name}"
          data-media-kind="${media.kind}"
          data-media-url="${media.url}"
          commandfor="${SURFACE.viewer}"
          command="show-modal"
        >
          <img class="media-element" src="${media.url}" alt="${media.name}" loading="lazy" />
        </button>`;
  return html`<figure class="message-media is-${media.kind}">
    <div class="media-frame">
      ${content}
      <div class="media-footer">${meta}</div>
    </div>
  </figure>`;
}

export function reactionsView(message: MessageRow, c: Catalog): Html {
  if (message.reactions.length === 0) return html``;
  return html`<ul class="reactions" role="list" aria-label="${t(c, "chat.reactions")}">
    ${message.reactions.map(
      (reaction) => html`<li>
        <button
          class="reaction${reaction.mine ? " is-mine" : ""}"
          type="button"
          data-reaction="${reaction.key}"
          aria-pressed="${reaction.mine ? "true" : "false"}"
        >
          <span aria-hidden="true">${reaction.key}</span><span>${String(reaction.count)}</span>
        </button>
      </li>`,
    )}
  </ul>`;
}

function formatBytes(size: number): string {
  if (size < 1000) return `${String(size)} B`;
  if (size >= 1_000_000) return `${Math.round(size / 100_000) / 10} MB`;
  return `${Math.round(size / 1000)} kB`;
}
