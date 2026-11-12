import type { AppSnapshot } from "../../store/app-store";
import { config, type Locale } from "../../app/config";
import type { EventRecord, MemberRecord, OutboxRecord, RoomRecord } from "../../data/records";
import { displayName, dayLabel, type TimelineItem } from "../../store/selectors";
import { formatDate, formatTime, t } from "../../i18n";
import { el, initial } from "../dom";
import { icon } from "../icons";
import { bindActionTrigger, type ActionPosition } from "../action-menu";
import { KeyedList } from "../keyed-list";
import type { MediaCache } from "../media-cache";
import { sanitizeRich } from "../sanitize";

export interface TimelineScrollState {
  eventId: string | null;
  offset: number;
  atBottom: boolean;
}

export interface TimelineCallbacks {
  onReply: (event: EventRecord) => void;
  onEdit: (event: EventRecord) => void;
  onRedact: (event: EventRecord) => void;
  onReact: (event: EventRecord, key: string) => void;
  onJump: (eventId: string) => void;
  onOpenMedia: (event: EventRecord) => void;
  onRetryOutbox: (txnId: string) => void;
  onCancelOutbox: (txnId: string) => void;
  onProfile: (userId: string) => void;
  onMenu: (event: EventRecord, position: ActionPosition) => void;
  onOlder: () => void;
}

export class TimelineView {
  readonly element: HTMLElement;
  private readonly list: HTMLOListElement;
  private readonly empty: HTMLElement;
  private readonly keyed: KeyedList<TimelineItem>;
  private snapshot: AppSnapshot | null = null;
  private readonly observer: IntersectionObserver;
  private olderPending = false;
  private room: RoomRecord | null = null;
  private pendingScroll: TimelineScrollState | null = null;
  private held: { key: string; offset: number; scrollTop: number } | null = null;
  private readonly resizeObserver: ResizeObserver;
  private readonly signatures = new WeakMap<HTMLElement, string>();

  private readonly media: MediaCache;
  private readonly callbacks: TimelineCallbacks;

  constructor(media: MediaCache, callbacks: TimelineCallbacks) {
    this.media = media;
    this.callbacks = callbacks;
    this.list = el("ol", { class: "timeline-list" });
    this.empty = el("div", { class: "timeline-empty", text: t("rooms.noMessages"), attrs: { hidden: true } });
    this.element = el("div", { class: "timeline" }, [this.list, this.empty]);
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !this.olderPending) {
          this.olderPending = true;
          this.callbacks.onOlder();
          window.setTimeout(() => {
            this.olderPending = false;
          }, 1200);
        }
      },
      { rootMargin: "240px 0px 0px" },
    );
    // A picture that decodes after its row exists must not shift what is being read.
    this.resizeObserver = new ResizeObserver(() => {
      const held = this.held;
      if (!held) return;
      if (Math.abs(this.scroller().scrollTop - held.scrollTop) > 2) {
        this.held = null;
        return;
      }
      this.restoreAnchor({ key: held.key, offset: held.offset });
      held.scrollTop = this.scroller().scrollTop;
    });
    this.resizeObserver.observe(this.list);
    this.keyed = new KeyedList<TimelineItem>(this.list, {
      key: (item) => item.key,
      create: (item) => {
        const node = this.createItem(item);
        this.signatures.set(node, itemSignature(item));
        return node;
      },
      update: (node, item) => this.updateItem(node, item),
    });
  }

  render(snapshot: AppSnapshot, room: RoomRecord, items: readonly TimelineItem[]): void {
    const atBottom = this.isAtBottom();
    // Anything that changes a row's height — a page of history, a decoded image, a
    // row that stops decrypting — keeps the row the reader is looking at in place.
    const anchor = atBottom ? null : this.anchor();
    this.snapshot = snapshot;
    this.room = room;
    this.empty.hidden = items.length > 0;
    this.list.hidden = items.length === 0;
    this.keyed.render(items);
    this.held = null;
    if (this.pendingScroll) this.applyPendingScroll();
    else if (atBottom) this.scrollToBottom();
    else if (anchor) {
      this.restoreAnchor(anchor);
      this.held = { ...anchor, scrollTop: this.scroller().scrollTop };
    }
    this.watchOlder(items);
  }

  // A message row is the anchor: the sentinel and a day separator can disappear
  // when a page lands, and an anchor that disappears cannot hold the position.
  private anchor(): { key: string; offset: number } | null {
    const scroller = this.scroller();
    const top = scroller.getBoundingClientRect().top;
    for (const row of this.list.querySelectorAll<HTMLElement>("[data-item-key]")) {
      if (!row.dataset["eventId"]) continue;
      const rect = row.getBoundingClientRect();
      if (rect.bottom > top) return { key: row.dataset["itemKey"] ?? "", offset: rect.top - top };
    }
    return null;
  }

  private restoreAnchor(anchor: { key: string; offset: number }): void {
    const row = this.list.querySelector<HTMLElement>(`[data-item-key="${CSS.escape(anchor.key)}"]`);
    if (!row) return;
    const scroller = this.scroller();
    scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset;
  }

  // The sentinel is the first row; scrolling it into view asks for the previous page.
  private watchOlder(items: readonly TimelineItem[]): void {
    this.observer.disconnect();
    if (!items.some((item) => item.type === "older")) return;
    const sentinel = this.list.querySelector<HTMLElement>('[data-item-key="older"]');
    if (!sentinel) return;
    sentinel.classList.toggle("loading", this.olderPending);
    this.observer.observe(sentinel);
  }

  scrollState(): TimelineScrollState {
    const scroller = this.scroller();
    const top = scroller.getBoundingClientRect().top;
    for (const row of this.list.querySelectorAll<HTMLElement>("[data-event-id]")) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom > top) {
        return { eventId: row.dataset["eventId"] ?? null, offset: rect.top - top, atBottom: this.isAtBottom() };
      }
    }
    return { eventId: null, offset: 0, atBottom: this.isAtBottom() };
  }

  // Applied on the next render, after the room's rows exist.
  restoreScroll(state: TimelineScrollState): void {
    this.pendingScroll = state;
  }

  private applyPendingScroll(): void {
    const state = this.pendingScroll;
    if (!state) return;
    this.pendingScroll = null;
    if (state.atBottom || !state.eventId) {
      this.scrollToBottom();
      return;
    }
    const row = this.list.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(state.eventId)}"]`);
    if (!row) {
      this.scrollToBottom();
      return;
    }
    const scroller = this.scroller();
    scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - state.offset;
  }

  isAtBottom(): boolean {
    const scroller = this.scroller();
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    return distance < 40;
  }

  scrollToBottom(): void {
    const scroller = this.scroller();
    scroller.scrollTop = scroller.scrollHeight;
  }

  private scroller(): HTMLElement {
    return this.element.closest<HTMLElement>(".content-body") ?? this.element;
  }

  focusEvent(eventId: string): void {
    const node = this.list.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(eventId)}"]`);
    node?.scrollIntoView({ block: "center" });
    node?.classList.add("event-highlight");
    window.setTimeout(() => node?.classList.remove("event-highlight"), 1600);
  }

  destroy(): void {
    this.observer.disconnect();
    this.resizeObserver.disconnect();
    this.keyed.clear();
  }

  private createItem(item: TimelineItem): HTMLElement {
    if (item.type === "day") {
      return el("li", {
        class: "day-separator",
        attrs: { "data-item-key": item.key },
        text: dayText(this.snapshot?.ui.locale ?? config.app.defaultLocale, item.ts),
      });
    }
    if (item.type === "older") {
      // A fixed height row: reaching the top starts the page and nothing moves.
      return el("li", { class: "older-row", attrs: { "data-item-key": "older" } }, [
        el("span", { class: "spinner", attrs: { "aria-label": t("room.loadOlder") } }),
      ]);
    }
    if (item.type === "new") {
      return el("li", { class: "new-divider", attrs: { "data-item-key": item.key }, text: t("room.newMessages") });
    }
    if (item.type === "read") {
      return el("li", { class: "read-marker", attrs: { "data-item-key": item.key, role: "separator" } }, [
        el("span", { text: t("room.readMarker") }),
      ]);
    }
    if (item.type === "pending") {
      return this.pendingItem(item.outbox);
    }
    return this.eventItem(item);
  }

  // The selector rebuilds every item each render, so the signature decides whether a
  // row is already correct. Replacing a row would drop focus and an opened preview.
  private updateItem(node: HTMLElement, item: TimelineItem): HTMLElement | void {
    const signature = itemSignature(item);
    if (this.signatures.get(node) === signature) {
      this.updateReactions(node, item);
      return;
    }
    const next = this.createItem(item);
    this.signatures.set(next, signature);
    node.replaceWith(next);
    return next;
  }

  private updateReactions(node: HTMLElement, item: TimelineItem): void {
    if (item.type !== "event") return;
    const current = node.querySelector(".reactions");
    const next = this.reactionsNode(item.event);
    if (current && next) current.replaceWith(next);
    else if (current) current.remove();
    else if (next) node.querySelector(".event-bubble")?.appendChild(next);
  }

  private eventItem(item: Extract<TimelineItem, { type: "event" }>): HTMLElement {
    const snapshot = this.snapshot;
    const room = this.room;
    if (!snapshot || !room) return el("li");
    const event = item.event;
    if (event.kind === "state" || event.kind === "membership") {
      return el("li", { class: "event-state" }, [stateText(snapshot, event, room)]);
    }
    const member = snapshot.members.find((entry) => entry.roomId === room.roomId && entry.userId === event.senderId) ?? null;
    const sender = displayName(snapshot, room.roomId, event.senderId);
    const avatar = el(
      "button",
      {
        class: `event-avatar avatar${item.showAvatar ? "" : " placeholder"}`,
        attrs: { type: "button", "aria-label": sender, tabindex: item.showAvatar ? "0" : "-1" },
        on: { click: () => this.callbacks.onProfile(event.senderId) },
      },
      [el("span", { text: initial(sender) })],
    );
    if (item.showAvatar) this.loadAvatar(avatar, member);
    const bubble = el("div", { class: `event-bubble${event.media ? " media" : ""}` }, [
      event.replyTo ? this.replyNode(event) : null,
      this.bodyNode(event),
      this.mediaNode(event),
      this.reactionsNode(event),
      el("time", { class: "event-time", text: formatTime(snapshot.ui.locale, event.ts) }),
    ]);
    const mentioned = Boolean(
      snapshot.session && event.mentions.some((userId) => userId === snapshot.session?.userId),
    );
    const emojiOnly = !event.formattedBody && isEmojiOnly(event.body);
    const row = el("li", {
      class: [
        "event",
        item.own ? "own" : "",
        event.redacted ? "redacted" : "",
        item.groupStart ? "" : "grouped",
        mentioned ? "mentioned" : "",
        emojiOnly ? "emoji-only" : "",
      ]
        .filter(Boolean)
        .join(" "),
      attrs: {
        "data-event-id": event.eventId,
        "data-item-key": item.key,
        tabindex: "0",
        "aria-label": `${sender}: ${event.body}`,
      },
    }, [
      avatar,
      el("div", { class: "event-content" }, [
        item.groupStart ? el("div", { class: "event-name", text: sender }) : null,
        bubble,
        event.edited || item.pending
          ? el("div", { class: "event-meta" }, [
              event.edited ? el("span", { text: t("room.edited") }) : null,
              item.pending
                ? el("span", { class: "sync-pending", text: t("room.syncing"), attrs: { "aria-live": "polite" } })
                : null,
            ])
          : null,
      ]),
    ]);
    bindActionTrigger(row, (position) => this.openMenu(event, position, row));
    return row;
  }

  private openMenu(event: EventRecord, position: ActionPosition, row: HTMLElement): void {
    row.classList.add("event-menu-open");
    window.addEventListener(
      "pointerdown",
      () => row.classList.remove("event-menu-open"),
      { once: true, capture: true },
    );
    window.addEventListener("keydown", () => row.classList.remove("event-menu-open"), { once: true });
    this.callbacks.onMenu(event, position);
  }

  private pendingTime(outbox: OutboxRecord): HTMLElement {
    const snapshot = this.snapshot;
    const locale = snapshot?.ui.locale ?? "en";
    return el("time", { class: "event-time", text: formatTime(locale, outbox.createdAt) });
  }

  private pendingItem(outbox: OutboxRecord): HTMLElement {
    const snapshot = this.snapshot;
    if (!snapshot) return el("li");
    const content = outbox.content;
    const body = typeof content["body"] === "string" ? content["body"] : "";
    const formatted = typeof content["formatted_body"] === "string" ? content["formatted_body"] : null;
    const failed = outbox.status === "failed";
    // A local file is the message: the filename never stands in for it while the
    // upload runs.
    const attachment = outbox.blob ? this.pendingAttachment(outbox) : null;
    const pendingBubble = el("div", { class: `event-bubble${attachment ? " media" : ""}` }, [
      attachment,
      attachment
        ? null
        : formatted
          ? this.richNode(formatted)
          : body
            ? el("div", { class: "event-text", text: body })
            : null,
      this.pendingTime(outbox),
      failed
        ? el("div", { class: "event-error", text: outbox.error ?? t("errors.generic") })
        : null,
      failed
        ? el("div", { class: "row" }, [
            el("button", { class: "button ghost", text: t("common.retry"), attrs: { type: "button" }, on: { click: () => this.callbacks.onRetryOutbox(outbox.txnId) } }),
          ])
        : null,
    ]);
    return el("li", { class: `event own pending${failed ? " failed" : ""}` }, [
      el("div", { class: "pending-status" }, [
        failed
          ? icon("close")
          : el("span", { class: "spinner", attrs: { "aria-label": t("composer.uploading") } }),
        el("button", {
          class: "pending-cancel",
          attrs: { type: "button", "aria-label": t("composer.cancelSend"), title: t("composer.cancelSend") },
          on: { click: () => this.callbacks.onCancelOutbox(outbox.txnId) },
        }, [icon("close")]),
      ]),
      el("div", { class: "event-avatar avatar" }, [el("span", { text: initial(snapshot.session?.displayName ?? "?") })]),
      el("div", { class: "event-content" }, [pendingBubble]),
    ]);
  }

  // A local file previews from its blob until the event lands, at the size the final
  // row will have, so the swap cannot move anything.
  private pendingAttachment(outbox: OutboxRecord): HTMLElement {
    const name = outbox.media?.filename ?? t("room.attachment");
    const type = outbox.media?.mimetype ?? "";
    if (outbox.blob && type.startsWith("image/")) {
      const url = URL.createObjectURL(outbox.blob);
      const sticker = outbox.eventType === "m.sticker";
      const image = el("img", {
        class: sticker ? "pending-sticker" : "pending-image",
        attrs: { src: url, alt: name },
      });
      const width = outbox.media?.width;
      const height = outbox.media?.height;
      if (!sticker && width && height) {
        image.style.setProperty("aspect-ratio", `${width} / ${height}`);
      }
      image.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
      return el("div", { class: "event-media" }, [image]);
    }
    return el("div", { class: "event-media" }, [
      el("div", { class: "media-placeholder" }, [icon("file"), el("span", { text: name })]),
    ]);
  }

  private bodyNode(event: EventRecord): HTMLElement {
    if (event.redacted) return el("div", { class: "event-text", text: t("room.redacted") });
    if (event.decrypting) {
      return el("div", { class: "event-text muted", attrs: { "aria-busy": "true" }, text: t("room.decrypting") });
    }
    if (event.kind === "encrypted" || event.decryptionError) {
      return el("div", { class: "event-text", text: t("room.decryptionFailed") });
    }
    if (event.kind === "sticker") return el("div", { class: "event-sticker" });
    if (event.kind === "image" || event.kind === "video" || event.kind === "audio" || event.kind === "file") {
      return el("span", { class: "visually-hidden", text: event.body });
    }
    if (event.formattedBody) return this.richNode(event.formattedBody);
    return el("div", { class: "event-text", text: event.body });
  }

  private mediaNode(event: EventRecord): HTMLElement | null {
    if (!event.media) return null;
    const media = event.media;
    const holder = el("div", { class: "event-media" });
    if (event.kind === "image" || event.kind === "video") {
      holder.appendChild(this.previewNode(event));
    } else if (event.kind === "sticker") {
      const image = el("img", {
        attrs: {
          alt: media.filename || event.body || t("media.sticker"),
          title: event.body,
          loading: "lazy",
          decoding: "async",
        },
      });
      const button = el("button", {
        class: "sticker-button",
        attrs: { type: "button", "aria-label": t("media.open") },
        on: { click: () => this.callbacks.onOpenMedia(event) },
      }, [image]);
      this.loadMedia(image, media, "src", event, () => {
        button.replaceWith(el("span", { class: "sticker-fallback", text: event.body || media.filename }));
      });
      holder.appendChild(button);
    } else if (event.kind === "audio") {
      const audio = el("audio", { attrs: { controls: true, preload: "metadata" } });
      this.loadMedia(audio, media, "src", event);
      holder.appendChild(audio);
    } else {
      holder.appendChild(
        el("button", {
          class: "media-placeholder",
          attrs: { type: "button" },
          on: { click: () => this.callbacks.onOpenMedia(event) },
        }, [icon("file"), media.filename || t("media.file")]),
      );
    }
    return holder;
  }

  // Media is fetched when the row is actually on screen, not on a click.
  private previewNode(event: EventRecord): HTMLElement {
    const media = event.media;
    if (!media) return el("div");
    const holder = el("div", { class: "media-holder" });
    const frame = el("div", {
      class: "media-frame",
      attrs: { "aria-busy": "true", "aria-label": t("media.loading") },
    });
    if (media.width && media.height) frame.style.setProperty("aspect-ratio", `${media.width} / ${media.height}`);
    holder.appendChild(frame);
    const request = {
      mediaKey: "",
      mxc: media.mxc,
      width: media.width,
      height: media.height,
      method: "scale",
      ...(media.encrypted ? { file: media.encrypted } : {}),
    };
    const load = (attempt = 0): void => {
      void this.media
        .get(request)
        .then((url) => {
          if (!url) {
            // Two quiet retries: the box keeps its size, so nothing moves either way
            if (attempt < 2) {
              window.setTimeout(() => load(attempt + 1), 700);
              return;
            }
            frame.removeAttribute("aria-busy");
            frame.replaceChildren(el("div", { class: "media-placeholder", text: t("media.error") }));
            return;
          }
          frame.removeAttribute("aria-busy");
          if (event.kind === "video") {
            frame.replaceChildren(
              el("video", { attrs: { src: url, controls: true, preload: "metadata" } }),
            );
            return;
          }
          frame.replaceChildren(
            el("button", {
              class: "media-open",
              attrs: { type: "button", "aria-label": t("media.open") },
              on: { click: () => this.callbacks.onOpenMedia(event) },
            }, [el("img", { attrs: { src: url, alt: media.filename || t("media.image"), decoding: "async" } })]),
          );
        })
        .catch(() => {
          if (attempt < 2) {
            window.setTimeout(() => load(attempt + 1), 700);
            return;
          }
          frame.removeAttribute("aria-busy");
          frame.replaceChildren(el("div", { class: "media-placeholder", text: t("media.error") }));
        });
    };
    this.observeOnce(holder, () => load());
    return holder;
  }

  private observeOnce(node: HTMLElement, load: () => void): void {
    if (typeof IntersectionObserver === "undefined") {
      load();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(node);
  }

  private reactionsNode(event: EventRecord): HTMLElement | null {
    const entries = Object.entries(event.reactions);
    if (entries.length === 0) return null;
    return el("div", { class: "reactions" }, entries.map(([key, summary]) =>
      el("button", {
        class: "reaction",
        attrs: { type: "button", "aria-pressed": summary.me },
        text: `${key} ${summary.count}`,
        on: { click: () => this.callbacks.onReact(event, key) },
      }),
    ));
  }

  private replyNode(event: EventRecord): HTMLElement {
    const snapshot = this.snapshot;
    const target = event.replyTo?.eventId;
    const sender = snapshot ? displayName(snapshot, event.roomId, event.replyTo?.senderId ?? "") : "";
    return el("button", {
      class: "event-reply",
      attrs: { type: "button" },
      on: {
        click: () => {
          if (target) this.callbacks.onJump(target);
        },
      },
    }, [
      el("strong", { text: sender }),
      el("span", { text: event.replyTo?.body ?? "" }),
    ]);
  }

  private richNode(html: string): HTMLElement {
    const node = el("div", { class: "event-text" });
    node.innerHTML = sanitizeRich(html);
    for (const image of node.querySelectorAll("img[data-mx-emoticon]")) {
      const source = image.getAttribute("src");
      if (!source?.startsWith("mxc://")) continue;
      void this.media.get({ mediaKey: "", mxc: source, width: 32, height: 32, method: "scale" }).then((url) => {
        if (url) image.setAttribute("src", url);
        else image.remove();
      });
    }
    return node;
  }

  private loadAvatar(node: HTMLElement, member: MemberRecord | null): void {
    if (!member?.avatarMxc) return;
    void this.media.get({ mediaKey: "", mxc: member.avatarMxc, width: 48, height: 48, method: "crop" }).then((url) => {
      if (!url) return;
      node.replaceChildren(el("img", { attrs: { src: url, alt: "" } }));
    });
  }

  private loadMedia(
    node: HTMLImageElement | HTMLVideoElement | HTMLAudioElement,
    media: NonNullable<EventRecord["media"]>,
    attr: "src",
    event: EventRecord,
    onError?: () => void,
  ): void {
    void this.media
      .get({
        mediaKey: "",
        mxc: media.mxc,
        width: media.width,
        height: media.height,
        method: "scale",
        ...(media.encrypted ? { file: media.encrypted } : {}),
      })
      .then((url) => {
        if (!url) {
          if (onError) onError();
          else node.replaceWith(el("div", { class: "media-placeholder", text: t("media.error") }));
          return;
        }
        node.setAttribute(attr, url);
      })
      .catch(() => {
        if (!node.isConnected) return;
        if (onError) onError();
        else node.replaceWith(el("div", { class: "media-placeholder", text: t("media.error") }));
      });
    if (event.kind === "sticker") node.classList.add("sticker-image");
  }
}

function isEmojiOnly(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  return /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\s)+$/u.test(trimmed);
}

function itemSignature(item: TimelineItem): string {
  if (item.type !== "event") {
    if (item.type === "pending") return `pending:${item.outbox.txnId}:${item.outbox.status}:${item.outbox.error ?? ""}`;
    if (item.type === "day") return `day:${item.key}`;
    if (item.type === "read") return item.key;
    return item.key;
  }
  const event = item.event;
  return [
    item.key,
    item.own ? "own" : "other",
    item.showAvatar ? "avatar" : "",
    item.groupStart ? "start" : "",
    event.kind,
    event.body,
    event.formattedBody ?? "",
    event.media?.mxc ?? "",
    event.replyTo?.eventId ?? "",
    event.edited ? "edited" : "",
    event.redacted ? "redacted" : "",
    event.decryptionError ?? "",
    event.decrypting ? "decrypting" : "",
    item.pending ? "pending" : "",
    JSON.stringify(event.reactions),
  ].join("|");
}

function stateText(snapshot: AppSnapshot, event: EventRecord, room: RoomRecord): string {
  const name = displayName(snapshot, room.roomId, event.senderId);
  switch (event.membership) {
    case "join":
      return `${name} ${t("room.joined")}`;
    case "leave":
      return `${name} ${t("room.left")}`;
    case "invite":
      return `${name} ${t("room.invited")}`;
    case "ban":
      return `${name} ${t("room.banned")}`;
    default:
      return `${name} ${event.body || t("room.joined")}`;
  }
}

function dayText(locale: Locale, ts: number): string {
  const label = dayLabel(ts);
  if (label === "today") return t("time.today");
  if (label === "yesterday") return t("time.yesterday");
  return formatDate(locale, ts);
}
