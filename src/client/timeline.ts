import type { Media, Message } from "../core/types.ts";
import { t } from "../i18n.ts";
import { el } from "../ui.ts";
import { openViewer } from "./viewer.ts";
import { openMenu, type MenuItem } from "./menu.ts";
import type { Composer } from "./composer.ts";
import type { Picker } from "./picker.ts";
import { sanitize } from "./sanitize.ts";
import { copyText } from "./clipboard.ts";
import { get, subscribe } from "./store.ts";
import type { WorkerClient } from "./worker.ts";

const DAY = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const TIME = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f\s]+$/u;

interface Entry {
  key: string;
  make: () => HTMLElement;
  update: (node: HTMLElement) => void;
}

/**
 * Rows are keyed by message id and updated in place. A sync, a reaction or a backfill moves a node
 * only when its position really changed, so the reader's place and the element under the pointer
 * survive the refresh.
 */
export class Timeline {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly older: HTMLButtonElement;
  private readonly worker: WorkerClient;
  private readonly composer: Composer;
  private readonly picker: Picker;
  private readonly nodes = new Map<string, HTMLElement>();
  private order: string[] = [];
  private pinned = true;
  private loading = false;

  constructor(root: HTMLElement, worker: WorkerClient, composer: Composer, picker: Picker) {
    this.root = root;
    this.worker = worker;
    this.composer = composer;
    this.picker = picker;
    const list = root.querySelector("ol");
    const older = root.querySelector("button");
    if (!list || !older) throw new Error("the timeline region is incomplete");
    this.list = list;
    this.older = older;
    this.older.addEventListener("click", () => void this.loadOlder());
    this.root.addEventListener("scroll", () => {
      this.pinned = this.root.scrollHeight - this.root.scrollTop - this.root.clientHeight < 80;
    });
    subscribe(["messages", "roomId", "hasOlder", "rooms"], () => this.render());
    this.render();
  }

  private async loadOlder(): Promise<void> {
    const state = get();
    if (state.roomId === null || this.loading) return;
    this.loading = true;
    const height = this.root.scrollHeight;
    const top = this.root.scrollTop;
    try {
      await this.worker.send({ type: "older", roomId: state.roomId, keep: state.messages.length + 60 });
      requestAnimationFrame(() => {
        this.root.scrollTop = top + (this.root.scrollHeight - height);
      });
    } finally {
      this.loading = false;
    }
  }

  /** Move the reader to a message already in the window, and mark it while they look. */
  jumpTo(eventId: string): void {
    const node = this.nodes.get(`m:${eventId}`);
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    node.classList.add("is-found");
    window.setTimeout(() => node.classList.remove("is-found"), 1600);
  }

  private render(): void {
    const state = get();
    this.older.hidden = !state.hasOlder;
    const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
    const entries: Entry[] = [];
    let day = "";
    let previous: Message | null = null;
    for (const message of state.messages) {
      const label = DAY.format(message.ts);
      if (label !== day) {
        day = label;
        entries.push(this.dayEntry(label));
        previous = null;
      }
      if (message.kind === "state") {
        entries.push(this.stateEntry(message));
        previous = null;
        continue;
      }
      const groupStart = previous === null || previous.sender !== message.sender || message.ts - previous.ts > 300000;
      entries.push(this.messageEntry(message, groupStart));
      previous = message;
      if (room !== null && room.unread > 0 && message.id === room.readUpTo) {
        entries.push({
          key: "line:new",
          make: () => el("li", { class: "row-new" }, [el("span", { class: "row-new-label", text: t("timeline.new") })]),
          update: () => undefined,
        });
      }
    }

    const wanted = new Set(entries.map((entry) => entry.key));
    for (const [key, node] of this.nodes) {
      if (wanted.has(key)) continue;
      node.remove();
      this.nodes.delete(key);
    }
    const order: string[] = [];
    for (const entry of entries) {
      let node = this.nodes.get(entry.key);
      if (node === undefined) {
        node = entry.make();
        this.nodes.set(entry.key, node);
      }
      entry.update(node);
      order.push(entry.key);
    }
    const same = order.length === this.order.length && order.every((key, index) => this.order[index] === key);
    if (!same) {
      this.list.replaceChildren(...order.map((key) => this.nodes.get(key)).filter((node): node is HTMLElement => node !== undefined));
      this.order = order;
    }
    if (this.pinned) requestAnimationFrame(() => this.scrollToBottom());
  }

  private dayEntry(label: string): Entry {
    const key = `d:${label}`;
    return {
      key,
      make: () => el("li", { class: "row-day" }, [el("span", { class: "day", text: label })]),
      update: () => undefined,
    };
  }

  private stateEntry(message: Message): Entry {
    return {
      key: `m:${message.id}`,
      make: () => el("li", { class: "row-state" }, [el("span")]),
      update: (node) => {
        const text = membershipLine(message);
        const span = node.firstElementChild;
        if (span !== null && span.textContent !== text) span.textContent = text;
      },
    };
  }

  private messageEntry(message: Message, groupStart: boolean): Entry {
    return {
      key: `m:${message.id}`,
      make: () => this.row(message, groupStart),
      update: (node) => this.fillRow(node, message, groupStart),
    };
  }

  private row(message: Message, groupStart: boolean): HTMLElement {
    const row = el("li", { class: "row" });
    row.append(el("span", { class: "row-avatar" }), el("div", { class: "bubble" }));
    this.wireMenu(row, message);
    this.fillRow(row, message, groupStart);
    return row;
  }

  /** The row node stays; its content is rewritten from the newest stored version of the message. */
  private fillRow(row: HTMLElement, message: Message, groupStart: boolean): void {
    const state = get();
    const own = message.sender === state.session?.userId;
    row.className = `row${own ? " row-own" : ""}${groupStart ? " row-start" : ""}${mentionsMe(message) ? " row-mention" : ""}`;
    row.dataset["id"] = message.id;
    const avatar = row.querySelector(".row-avatar");
    if (avatar !== null) avatar.textContent = groupStart ? message.name.slice(0, 1) : "";
    const bubble = row.querySelector(".bubble");
    if (bubble === null) return;
    bubble.className = `bubble${message.media !== null ? " bubble-media" : ""}${emojiOnly(message) ? " is-emoji" : ""}`;
    bubble.replaceChildren();
    if (groupStart) bubble.append(el("span", { class: "bubble-name", text: message.name }));
    if (message.reply) bubble.append(this.quote(message.reply));
    if (message.media) this.media(message, bubble);
    else this.text(message, bubble);
    if (message.edited) bubble.append(el("span", { class: "bubble-edited", text: t("message.edited") }));
    if (message.status !== "sent") bubble.append(el("span", { class: `bubble-status is-${message.status}`, text: statusText(message) }));
    if (message.reactions.length > 0) bubble.append(this.reactions(message));
    bubble.append(el("time", { class: "bubble-time", text: TIME.format(message.ts) }));
  }

  private quote(reply: Message["reply"]): HTMLElement {
    if (reply === null) return el("span");
    const quote = el("button", { class: "bubble-quote", attrs: { type: "button" } }, [
      el("span", { class: "bubble-quote-name", text: reply.name }),
      el("span", { class: "bubble-quote-text", text: reply.body }),
    ]);
    quote.addEventListener("click", () => this.jumpTo(reply.id));
    return quote;
  }

  private text(message: Message, bubble: HTMLElement): void {
    const holder = el("span", { class: "bubble-text" });
    if (message.html !== null && message.kind !== "error" && message.body.length > 0) {
      holder.classList.add("bubble-html");
      holder.append(sanitize(message.html));
      this.emoticons(holder);
    } else {
      holder.textContent = message.body || undecryptable(message);
    }
    bubble.append(holder);
  }

  private reactions(message: Message): HTMLElement {
    const row = el("div", { class: "bubble-reactions" });
    for (const reaction of message.reactions) {
      const button = el("button", {
        class: `reaction${reaction.me ? " is-mine" : ""}`,
        text: `${reaction.key} ${String(reaction.count)}`,
        attrs: { type: "button", "aria-pressed": reaction.me ? "true" : "false", title: reaction.key },
      });
      button.addEventListener("click", () => {
        void this.worker.send({ type: "react", roomId: message.roomId, eventId: message.id, key: reaction.key, on: !reaction.me });
      });
      row.append(button);
    }
    return row;
  }

  private media(message: Message, bubble: HTMLElement): void {
    const media = message.media;
    if (!media) return;
    if (message.kind === "sticker") {
      this.picture(message, bubble, true);
      return;
    }
    if (message.kind === "file") {
      this.file(message, bubble, media);
      return;
    }
    if (message.kind === "audio") {
      this.audio(media, bubble, message.kind !== "sticker");
      return;
    }
    this.picture(message, bubble, false);
  }

  /** Nothing is fetched until the reader asks for it, except a sticker, which is its own message. */
  private picture(message: Message, bubble: HTMLElement, automatic: boolean): void {
    const media = message.media;
    if (!media) return;
    const frame = el("div", { class: "media" });
    if (media.width !== null && media.height !== null) {
      frame.style.setProperty("--media-ratio", `${String(media.width)} / ${String(media.height)}`);
    }
    bubble.append(frame);
    const load = (): void => {
      const size = media.file ? 0 : automatic ? 128 : 640;
      void this.worker
        .send<{ blob: Blob }>({ type: "media", media, size })
        .then(({ blob }) => {
          const url = URL.createObjectURL(blob);
          if (automatic) {
            frame.replaceChildren(el("img", { class: "media-image", attrs: { src: url, alt: message.body, title: message.body, decoding: "async" } }));
            return;
          }
          if (media.mime.startsWith("video/")) {
            frame.replaceChildren(el("video", { class: "media-image", attrs: { src: url, controls: "controls", preload: "metadata" } }));
            return;
          }
          const image = el("img", { class: "media-image", attrs: { src: url, alt: media.name, decoding: "async" } });
          image.addEventListener("click", () => openViewer(url, media.name), { once: true });
          frame.replaceChildren(image);
        })
        .catch(() => {
          frame.replaceChildren(el("span", { class: "media-name", text: t("media.failed") }));
        });
    };
    if (automatic) {
      load();
      return;
    }
    const button = el("button", { class: "media-show", attrs: { type: "button" } }, [
      el("span", { class: "media-name", text: media.name || t("media.show") }),
    ]);
    button.addEventListener("click", () => {
      button.replaceChildren(el("span", { class: "media-name", text: t("media.loading") }));
      load();
    });
    frame.append(button);
  }

  private audio(media: Media, bubble: HTMLElement, wait: boolean): void {
    const frame = el("div", { class: "media media-audio" });
    bubble.append(frame);
    const load = (): void => {
      void this.worker
        .send<{ blob: Blob }>({ type: "media", media, size: media.file ? 0 : 640 })
        .then(({ blob }) => {
          const url = URL.createObjectURL(blob);
          frame.replaceChildren(el("audio", { class: "audio", attrs: { src: url, controls: "controls", preload: "metadata" } }));
        })
        .catch(() => frame.replaceChildren(el("span", { class: "media-name", text: t("media.failed") })));
    };
    if (wait) {
      const button = el("button", { class: "media-show", attrs: { type: "button" } }, [
        el("span", { class: "media-name", text: media.name || t("room.audio") }),
      ]);
      button.addEventListener("click", load);
      frame.append(button);
      return;
    }
    load();
  }

  private file(message: Message, bubble: HTMLElement, media: Media): void {
    const frame = el("div", { class: "media media-file" });
    const name = media.name || message.body || t("room.file");
    const button = el("button", { class: "media-show", attrs: { type: "button" } }, [
      el("span", { class: "media-name", text: name }),
    ]);
    button.addEventListener("click", () => {
      button.replaceChildren(el("span", { class: "media-name", text: t("media.loading") }));
      void this.worker
        .send<{ blob: Blob }>({ type: "media", media, size: 0 })
        .then(({ blob }) => {
          const url = URL.createObjectURL(blob);
          const link = el("a", { class: "file-download", text: name, attrs: { href: url, download: name } });
          frame.replaceChildren(link);
        })
        .catch(() => button.replaceChildren(el("span", { class: "media-name", text: t("media.failed") })));
    });
    frame.append(button);
    bubble.append(frame);
  }

  /** An emoticon in formatted text arrives as an `mxc://` image and is fetched like any other media. */
  private emoticons(holder: HTMLElement): void {
    for (const image of holder.querySelectorAll("img")) {
      const url = image.getAttribute("src") ?? "";
      if (!url.startsWith("mxc://")) continue;
      const media: Media = { url, mime: "image/png", size: 0, width: null, height: null, name: image.alt, file: null };
      image.removeAttribute("src");
      void this.worker
        .send<{ blob: Blob }>({ type: "media", media, size: 32 })
        .then(({ blob }) => {
          image.src = URL.createObjectURL(blob);
        })
        .catch(() => image.remove());
    }
  }

  private wireMenu(row: HTMLElement, message: Message): void {
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.menuFor(message, event.clientX, event.clientY);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      const box = row.getBoundingClientRect();
      this.menuFor(message, box.left + 24, box.top + 12);
    });
    let timer = 0;
    row.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      const x = event.clientX;
      const y = event.clientY;
      timer = window.setTimeout(() => this.menuFor(message, x, y), 500);
    });
    for (const type of ["pointerup", "pointercancel", "pointermove"] as const) {
      row.addEventListener(type, () => window.clearTimeout(timer));
    }
  }

  /** The actions that exist for this message and this reader; nothing else is offered. */
  private menuFor(message: Message, x: number, y: number): void {
    const state = get();
    const own = message.sender === state.session?.userId;
    const items: MenuItem[] = [];
    if (message.id.startsWith("$")) {
      items.push({ label: t("action.reply"), run: () => this.composer.setReply(message) });
      items.push({ label: t("action.react"), run: () => this.picker.startReaction(message.roomId, message.id) });
    }
    if (own && message.kind === "text" && message.id.startsWith("$")) {
      items.push({ label: t("action.edit"), run: () => this.composer.setEdit(message) });
    }
    items.push({ label: t("action.copy"), run: () => copyText(message.body, t("action.copied")) });
    if (message.id.startsWith("$")) {
      items.push({
        label: t("action.copyLink"),
        run: () => copyText(`${location.origin}${location.pathname}#/room/${encodeURIComponent(message.roomId)}/${message.id}`, t("action.copied")),
      });
    }
    if (own) items.push({ label: t("action.redact"), run: () => void this.worker.send({ type: "redact", roomId: message.roomId, eventId: message.id }), danger: true });
    openMenu(items, x, y);
  }

  scrollToBottom(): void {
    this.root.scrollTop = this.root.scrollHeight;
  }
}

function undecryptable(message: Message): string {
  return message.kind === "error" ? t("room.undecryptable") : "";
}

function statusText(message: Message): string {
  if (message.status === "failed") return t("room.failed");
  if (message.status === "queued") return t("room.queued");
  return t("room.sending");
}

function mentionsMe(message: Message): boolean {
  const self = get().session?.userId ?? "";
  return self.length > 0 && message.mentions.includes(self);
}

function emojiOnly(message: Message): boolean {
  const text = message.body.trim();
  return text.length > 0 && message.kind === "text" && EMOJI_ONLY.test(text);
}

function membershipLine(message: Message): string {
  const keys: Record<string, string> = {
    join: "state.joined",
    leave: "state.left",
    invite: "state.invited",
    ban: "state.banned",
    knock: "state.knocked",
  };
  const key = keys[message.membership ?? ""];
  return key === undefined ? `${message.name} · ${message.membership ?? ""}` : `${message.name} ${t(key as never)}`;
}
