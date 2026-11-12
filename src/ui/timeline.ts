import type { Message, RoomSummary } from "../core/types.ts";
import { t, timeOfDay } from "../i18n/index.ts";
import { timelineItems, type TimelineItem } from "../store/select.ts";
import { state } from "../store/state.ts";
import type { UiContext } from "./context.ts";
import { el, keyed } from "./dom.ts";
import { avatar, fileCard, picture } from "./media.ts";
import { openMenu } from "./overlay.ts";
import { safeMessageHtml } from "./sanitize.ts";

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u;

function hydrateEmoji(root: HTMLElement, ctx: UiContext): void {
  for (const image of root.querySelectorAll("img[data-mx-emoticon]")) {
    const mxc = image.getAttribute("src") ?? "";
    if (!mxc.startsWith("mxc://")) {
      image.remove();
      continue;
    }
    void ctx.media
      .url({ mxc, mime: "image/png", size: 0, width: null, height: null, duration: null, name: "", file: null }, 64)
      .then((url) => {
        if (url) image.setAttribute("src", url);
        else image.remove();
      });
  }
}

function bubbleContent(message: Message, ctx: UiContext): HTMLElement {
  const bubble = el("div", { class: `bubble bubble-kind-${message.kind}` });
  if (message.reply) {
    bubble.appendChild(
      el("button", {
        class: "quote",
        attrs: { type: "button" },
        on: { click: () => { if (message.reply) ctx.reveal(message.reply.id); } },
      }, [el("span", { class: "quote-name", text: message.reply.name }), el("span", { class: "quote-text", text: message.reply.body })]),
    );
  }
  if (message.media) {
    if (message.kind === "file") bubble.appendChild(fileCard(message.media));
    else bubble.appendChild(picture(message.media, message.kind === "sticker" ? "sticker" : message.kind === "video" ? "video" : "image"));
  } else if (message.kind === "text" || message.kind === "notice" || message.kind === "emote") {
    const body = el("div", { class: "bubble-text" });
    if (message.html) {
      body.innerHTML = safeMessageHtml(message.html);
      hydrateEmoji(body, ctx);
    } else {
      body.textContent = message.body;
    }
    if (message.body && EMOJI_ONLY.test(message.body)) bubble.classList.add("bubble-jumbo");
    bubble.appendChild(body);
    if (message.edited) bubble.appendChild(el("span", { class: "bubble-edited", text: t("room.edited") }));
  } else if (message.kind === "state") {
    bubble.appendChild(el("span", { class: "bubble-text", text: message.body }));
  } else {
    bubble.appendChild(el("span", { class: "bubble-text", text: t("room.undecryptable") }));
  }
  const time = el("time", { class: "bubble-time", text: timeOfDay(message.ts) });
  if (message.media) time.classList.add("bubble-time-chip");
  bubble.appendChild(time);
  return bubble;
}

function reactionsRow(message: Message, ctx: UiContext): HTMLElement | null {
  if (message.reactions.length === 0) return null;
  return el("div", { class: "reactions" }, message.reactions.map((reaction) =>
    el("button", {
      class: `reaction${reaction.me ? " reaction-me" : ""}`,
      attrs: { type: "button", "aria-pressed": String(reaction.me) },
      on: { click: () => ctx.react(message, reaction.key) },
    }, [el("span", { text: reaction.key }), el("span", { class: "reaction-count", text: String(reaction.count) })]),
  ));
}

function statusRow(message: Message, ctx: UiContext): HTMLElement | null {
  if (message.status === "sent") return null;
  if (message.status === "failed") {
    if (message.kind === "image" || message.kind === "file") {
      return el("button", { class: "row-status row-status-failed", attrs: { type: "button" }, on: { click: () => ctx.removePending(message) } }, [
        el("span", { text: t("room.discard") }),
      ]);
    }
    return el("button", { class: "row-status row-status-failed", attrs: { type: "button" }, on: { click: () => ctx.retry(message) } }, [
      el("span", { text: t("room.retry") }),
    ]);
  }
  return el("span", { class: "row-status", text: t("room.sending") });
}

function menuFor(message: Message, x: number, y: number, ctx: UiContext): void {
  const own = message.sender === state.session?.userId;
  const items = [
    { label: t("menu.reply"), action: () => ctx.startReply(message) },
    { label: t("menu.react"), action: () => ctx.reactPicker(message) },
    { label: t("menu.copy"), action: () => ctx.copy(message.body, t("toast.copied")) },
    { label: t("menu.link"), action: () => ctx.copy(`${location.origin}${location.pathname}#/room/${encodeURIComponent(message.roomId)}/${encodeURIComponent(message.id)}`, t("toast.copied")) },
  ];
  if (own && message.kind !== "state" && message.status === "sent") {
    items.push({ label: t("menu.edit"), action: () => ctx.startEdit(message) });
  }
  if (own && message.status === "sent") {
    items.push({ label: t("menu.redact"), action: () => ctx.redact(message) });
  }
  openMenu(x, y, items);
}

function messageRow(message: Message, groupStart: boolean, own: boolean, ctx: UiContext): HTMLElement {
  const row = el("li", {
    class: `row ${own ? "row-own" : "row-other"}${groupStart ? " row-start" : ""}`,
    dataset: { id: message.id },
  });
  row.tabIndex = 0;
  row.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    menuFor(message, event.clientX, event.clientY, ctx);
  });
  row.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const box = row.getBoundingClientRect();
    menuFor(message, box.left + 24, box.top + 12, ctx);
  });

  if (message.kind === "state") {
    const action = message.body === "leave" ? t("room.memberLeft") : message.body === "invite" ? t("room.memberInvited") : t("room.memberJoined");
    row.classList.add("row-state");
    row.append(el("div", { class: "state-line", text: t("room.membership", { name: message.name, action }) }));
    return row;
  }

  const avatarSlot = el("div", { class: "row-avatar" });
  if (groupStart && !own) avatarSlot.appendChild(avatar(message.avatar, message.name, 36));
  const body = el("div", { class: "row-body" });
  if (groupStart && !own) body.appendChild(el("div", { class: "row-name" }, [el("button", { class: "link-button", attrs: { type: "button" }, on: { click: () => ctx.profile(message.sender) } }, [el("span", { text: message.name })])]));
  const bubble = bubbleContent(message, ctx);
  body.appendChild(bubble);
  const status = statusRow(message, ctx);
  if (status) body.appendChild(status);
  const reactions = reactionsRow(message, ctx);
  if (reactions) body.appendChild(reactions);
  row.appendChild(avatarSlot);
  row.appendChild(body);
  return row;
}

function signature(item: TimelineItem): string {
  if (item.kind === "day") return item.label;
  const message = item.message;
  const reactions = message.reactions.map((reaction) => `${reaction.key}${reaction.count}${reaction.me ? "+" : ""}`).join(",");
  return `${item.groupStart}${item.own}${message.status}${message.edited}${message.body.length}${message.html?.length ?? 0}${reactions}${message.reply?.id ?? ""}`;
}

export class TimelineView {
  readonly root: HTMLElement;
  private list: HTMLOListElement;
  private older: HTMLButtonElement;
  private pinned = true;
  private ctx: UiContext;

  constructor(ctx: UiContext) {
    this.ctx = ctx;
    this.list = el("ol", { class: "timeline", attrs: { "aria-label": t("room.timeline") } });
    this.older = el("button", { class: "load-older", attrs: { type: "button" }, on: { click: () => void this.loadOlder() } }, [
      el("span", { text: t("room.loadOlder") }),
    ]);
    this.root = el("div", { class: "timeline-scroll" }, [this.older, this.list]);
    this.root.addEventListener("scroll", () => {
      const nearBottom = this.root.scrollHeight - this.root.scrollTop - this.root.clientHeight < 80;
      this.pinned = nearBottom;
      if (this.pinned) this.root.classList.remove("has-new");
      if (this.root.scrollTop < 120 && state.hasOlder && !this.loading) void this.loadOlder();
      this.older.hidden = !state.hasOlder || this.loading;
    });
  }

  private loading = false;
  private anchor: { height: number; top: number; count: number } | null = null;

  private async loadOlder(): Promise<void> {
    const room = this.ctx.activeRoom();
    if (!room || this.loading) return;
    this.loading = true;
    this.older.hidden = false;
    this.older.firstElementChild?.replaceChildren(document.createTextNode(t("room.loading")));
    this.older.classList.add("is-loading");
    this.anchor = { height: this.root.scrollHeight, top: this.root.scrollTop, count: this.list.childElementCount };
    try {
      await this.ctx.worker.send({ type: "paginate", roomId: room.roomId });
    } finally {
      this.loading = false;
      this.older.classList.remove("is-loading");
      this.older.firstElementChild?.replaceChildren(document.createTextNode(t("room.loadOlder")));
    }
  }

  scrollToBottom(): void {
    this.root.scrollTop = this.root.scrollHeight;
  }

  reveal(eventId: string): void {
    const row = this.list.querySelector<HTMLElement>(`[data-id="${CSS.escape(eventId)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    row.classList.add("is-revealed");
    setTimeout(() => row.classList.remove("is-revealed"), 1600);
  }

  render(messages: Message[], room: RoomSummary | null): void {
    this.older.hidden = !state.hasOlder || this.loading;
    if (!room) {
      this.list.replaceChildren();
      return;
    }
    const items = timelineItems(messages);
    const build = (item: TimelineItem): HTMLElement =>
      item.kind === "day"
        ? el("li", { class: "row-day" }, [el("span", { class: "day-label", text: item.label })])
        : messageRow(item.message, item.groupStart, item.own, this.ctx);
    keyed(
      this.list,
      items.map((item) => ({ key: item.key, value: item })),
      build,
      (node, item) => {
        if (node.dataset["signature"] === signature(item)) return;
        const fresh = build(item);
        node.className = fresh.className;
        node.replaceChildren(...fresh.childNodes);
        node.dataset["signature"] = signature(item);
      },
    );
    const anchor = this.anchor;
    if (anchor && this.list.childElementCount > anchor.count) {
      this.anchor = null;
      requestAnimationFrame(() => {
        this.root.scrollTop = anchor.top + (this.root.scrollHeight - anchor.height);
      });
      return;
    }
    if (this.pinned) requestAnimationFrame(() => this.scrollToBottom());
  }
}
